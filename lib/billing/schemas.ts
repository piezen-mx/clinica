import "server-only";
import { z } from "zod";

/**
 * Schemas `zod` de toda entrada del módulo de facturación. Una frontera `'use server'`
 * acepta cualquier input deserializado y los tipos TS se borran en runtime — sin esto,
 * las server actions terminan con casts directos (`as string`, `as File`) sobre
 * `FormData`, que es exactamente lo que este módulo no puede permitirse (spec 28).
 */

const ZIP_REGEX = /^\d{5}$/;
const TAX_SYSTEM_REGEX = /^\d{3}$/;

function requiredText(label: string, max = 255) {
  return z.string().trim().min(1, `${label} es requerido`).max(max, `${label} es demasiado largo`);
}

/**
 * Campo opcional: cadena vacía, ausente **o `null`** se normaliza a `null` (mismo shape
 * que la BD). Acepta `null` explícito además de `undefined` porque los formularios de
 * cliente/producto (spec 29) tipan sus campos opcionales como `string | null`
 * (`ICustomerFormInput`) y mandan `null`, a diferencia de los `FormData` de organización
 * (spec 28), que siempre mandan cadena vacía.
 */
function optionalText(max = 255) {
  return z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));
}

function optionalEmail() {
  return z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .refine((value) => value === null || z.string().email().safeParse(value).success, {
      message: "El correo de soporte no es válido",
    });
}

/**
 * Datos legales + dirección requeridos para crear una organización en Facturapi.
 *
 * **No incluye `tax_id` ni `country`.** Facturapi v2 (la única versión activa; v1 fue
 * retirada en abril de 2023) no acepta ninguno de los dos ni al crear ni al editar una
 * organización — quedan fijos al RFC y país de la cuenta dueña de la API key. Una
 * organización en Facturapi v2 es más una sub-marca de la misma razón social que una
 * entidad fiscal independiente. `tax_id`/`country` siguen existiendo como columnas de
 * solo lectura en `BILLING.organizations` (reflejan lo que Facturapi realmente asigna),
 * pero no se piden en el formulario ni se envían en el `create`/`updateLegal`.
 */
export const CreateOrganizationSchema = z.object({
  name: requiredText("El nombre comercial"),
  legal_name: requiredText("La razón social"),
  tax_system: requiredText("El régimen fiscal", 10).regex(
    TAX_SYSTEM_REGEX,
    "El régimen fiscal debe ser el código SAT de 3 dígitos"
  ),
  street: requiredText("La calle"),
  exterior: requiredText("El número exterior", 50),
  neighborhood: requiredText("La colonia"),
  zip: requiredText("El código postal", 10).regex(ZIP_REGEX, "El código postal debe tener 5 dígitos"),
  city: requiredText("La ciudad"),
  municipality: requiredText("El municipio"),
  state: requiredText("El estado"),
});

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;

/** Igual que `CreateOrganizationSchema`, más los campos que solo tienen sentido al editar. */
export const UpdateOrganizationLegalSchema = CreateOrganizationSchema.extend({
  phone: optionalText(50),
  website: optionalText(255),
  support_email: optionalEmail(),
  interior: optionalText(50),
});

export type UpdateOrganizationLegalInput = z.infer<typeof UpdateOrganizationLegalSchema>;

// ---------------------------------------------------------------------------
// Certificado CSD (.cer / .key)
// ---------------------------------------------------------------------------

/** De sobra para un CSD real: los `.cer`/`.key` que emite el SAT pesan pocos KB. */
const CERTIFICATE_MAX_SIZE_BYTES = 1024 * 1024; // 1 MB

/**
 * Ambos archivos de un CSD son ASN.1 codificado en DER (X.509 el `.cer`, PKCS#8
 * cifrado el `.key`), y DER siempre abre con el tag SEQUENCE (0x30). El `accept`
 * del `<input type="file">` es solo del cliente y se salta trivialmente renombrando
 * un archivo — este es el chequeo real, mismo enfoque que `detectMimeFromBytes` en
 * `app/api/upload/route.ts`.
 */
function hasDerSignature(bytes: Uint8Array): boolean {
  return bytes.length > 0 && bytes[0] === 0x30;
}

async function validateCertificateFile(
  file: unknown,
  extension: ".cer" | ".key"
): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) {
    return `El archivo ${extension} es requerido`;
  }
  if (!file.name.toLowerCase().endsWith(extension)) {
    return `El archivo debe tener extensión ${extension}`;
  }
  if (file.size > CERTIFICATE_MAX_SIZE_BYTES) {
    return `El archivo ${extension} excede el tamaño máximo permitido (1 MB)`;
  }
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (!hasDerSignature(head)) {
    return `El archivo ${extension} no tiene un formato de certificado válido`;
  }
  return null;
}

/**
 * Valida `orgId`, la contraseña del CSD y los dos archivos por extensión, tamaño
 * máximo y tipo real por magic bytes. La validación de archivo es asíncrona (lee
 * los primeros bytes), así que las actions deben usar `safeParseAsync`, no `safeParse`.
 */
export const UploadCertificateSchema = z
  .object({
    orgId: requiredText("El identificador de la organización", 255),
    password: z.string().min(1, "La contraseña del certificado es requerida"),
    cerFile: z.instanceof(File, { message: "El archivo .cer es requerido" }),
    keyFile: z.instanceof(File, { message: "El archivo .key es requerido" }),
  })
  .superRefine(async (data, ctx) => {
    const cerError = await validateCertificateFile(data.cerFile, ".cer");
    if (cerError) {
      ctx.addIssue({ code: "custom", message: cerError, path: ["cerFile"] });
    }
    const keyError = await validateCertificateFile(data.keyFile, ".key");
    if (keyError) {
      ctx.addIssue({ code: "custom", message: keyError, path: ["keyFile"] });
    }
  });

export type UploadCertificateInput = z.infer<typeof UploadCertificateSchema>;

// ---------------------------------------------------------------------------
// Clientes y productos (spec 29)
// ---------------------------------------------------------------------------

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

/**
 * `NaN` es lo que llega a Facturapi cuando el original hace `parseFloat(data.price)`
 * sin verificar (`products.ts:33,58`) — el precio queda mal solo hasta que Facturapi
 * lo rechaza con un mensaje opaco. Este parser corta eso antes de la llamada:
 * acepta string o number, normaliza la coma decimal ("1234,50" → "1234.50") o de
 * miles ("1,234.50" → "1234.50" — si ya hay un punto, la coma solo puede ser de
 * miles), y falla ante `NaN`, negativos e infinitos.
 */
function normalizeMoneyString(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes(",") && trimmed.includes(".")) return trimmed.replace(/,/g, "");
  if (trimmed.includes(",")) return trimmed.replace(",", ".");
  return trimmed;
}

function money(label: string) {
  return z.union([z.string(), z.number()]).transform((raw, ctx) => {
    const value = typeof raw === "number" ? raw : Number(normalizeMoneyString(raw));
    if (!Number.isFinite(value) || value < 0) {
      ctx.addIssue({ code: "custom", message: `${label} debe ser un número válido, mayor o igual a cero` });
      return z.NEVER;
    }
    return value;
  });
}

/** Datos de un cliente de Facturapi (`ICustomerFormInput`). Valida formato de RFC y correo. */
export const CustomerSchema = z.object({
  legal_name: requiredText("La razón social"),
  tax_id: requiredText("El RFC", 13)
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(RFC_REGEX, "El RFC no tiene un formato válido")),
  tax_system: requiredText("El régimen fiscal", 10).regex(
    TAX_SYSTEM_REGEX,
    "El régimen fiscal debe ser el código SAT de 3 dígitos"
  ),
  email: requiredText("El correo", 255).pipe(z.string().email("El correo no es válido")),
  phone: optionalText(50),
  street: optionalText(255),
  exterior: optionalText(50),
  interior: optionalText(50),
  neighborhood: optionalText(255),
  zip: requiredText("El código postal", 10).regex(ZIP_REGEX, "El código postal debe tener 5 dígitos"),
  city: optionalText(255),
  municipality: optionalText(255),
  state: optionalText(255),
  country: optionalText(10),
});

export type CustomerInput = z.infer<typeof CustomerSchema>;

/** Datos de un producto de Facturapi (`IProductFormInput`). El precio nunca llega como `NaN`. */
export const ProductSchema = z.object({
  description: requiredText("La descripción"),
  product_key: requiredText("La clave del catálogo SAT", 20),
  unit_key: requiredText("La clave de unidad SAT", 20),
  price: money("El precio"),
  tax_included: z.boolean(),
});

export type ProductInput = z.infer<typeof ProductSchema>;

/**
 * `orgId` y `q` del buscador del catálogo SAT. El mínimo de 2 caracteres se exige
 * aquí —del lado del servidor— y no solo en el cliente (`ProductFormModal.tsx:97`
 * del original), porque el route handler es alcanzable directamente por `fetch`.
 */
export const SatCatalogQuerySchema = z.object({
  orgId: requiredText("El identificador de la organización", 255),
  q: z.string().trim().min(2, "La búsqueda requiere al menos 2 caracteres").max(255),
});

export type SatCatalogQueryInput = z.infer<typeof SatCatalogQuerySchema>;
