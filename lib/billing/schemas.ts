import "server-only";
import { z } from "zod";
import { CancellationMotive, InvoiceUse, PaymentForm, PaymentMethod } from "facturapi";

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

// ---------------------------------------------------------------------------
// Facturas y modo Live (spec 30)
// ---------------------------------------------------------------------------

/**
 * Cantidad de un renglón: reutiliza `money()` (nunca `NaN`, nunca negativa) y además
 * exige `> 0` — a diferencia de un precio, una cantidad de cero no tiene sentido en
 * un renglón de factura.
 */
function quantity(label: string) {
  return money(label).refine((value) => value > 0, {
    message: `${label} debe ser mayor a cero`,
  });
}

/**
 * Cada catálogo cerrado del SAT (forma de pago, método de pago, uso del CFDI, motivo
 * de cancelación) valida contra el enum que ya expone el SDK de Facturapi, en vez de
 * duplicar los catálogos como listas de strings sueltas.
 */
function satCatalog<T extends Record<string, string>>(catalog: T, label: string) {
  return z.enum(catalog, { error: () => `${label} no es una clave válida del SAT` });
}

const InvoiceLineSchema = z.object({
  product_id: requiredText("El producto", 255),
  quantity: quantity("La cantidad"),
});

/**
 * Datos de captura de una factura de ingreso (`ICreateInvoiceInput`). **No incluye
 * un campo `mode`** — el modo se resuelve siempre en el servidor a partir de
 * `is_live` (ver `getOrgClient`), nunca a partir de algo que mande el cliente.
 */
export const CreateInvoiceSchema = z.object({
  customer_id: requiredText("El cliente", 255),
  lines: z.array(InvoiceLineSchema).min(1, "La factura debe tener al menos un renglón"),
  payment_form: satCatalog(PaymentForm, "La forma de pago"),
  payment_method: satCatalog(PaymentMethod, "El método de pago"),
  use: satCatalog(InvoiceUse, "El uso del CFDI"),
  series: optionalText(20),
  folio_number: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((raw, ctx) => {
      if (raw === null || raw === undefined || raw === "") return null;
      const value = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
        ctx.addIssue({ code: "custom", message: "El folio debe ser un número entero mayor a cero" });
        return z.NEVER;
      }
      return value;
    }),
});

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;

/**
 * Motivo de cancelación restringido al catálogo del SAT (`01`-`04`), no a una cadena
 * libre — a diferencia del original, que acepta cualquier texto.
 */
export const CancelInvoiceSchema = z.object({
  invoiceId: requiredText("La factura", 255),
  motive: satCatalog(CancellationMotive, "El motivo de cancelación"),
});

export type CancelInvoiceInput = z.infer<typeof CancelInvoiceSchema>;

/**
 * Solo el identificador de la factura a enviar. **Deliberadamente sin campo de
 * correo**: la acción envía siempre al correo registrado del cliente del
 * comprobante (ver Decisiones tomadas, spec 30) — aceptar un destinatario del
 * cliente es lo que este schema existe para impedir.
 */
export const SendInvoiceEmailSchema = z.object({
  invoiceId: requiredText("La factura", 255),
});

export type SendInvoiceEmailInput = z.infer<typeof SendInvoiceEmailSchema>;

/** Activar/desactivar el modo Live de una organización. */
export const SetOrgModeSchema = z.object({
  orgId: requiredText("El identificador de la organización", 255),
  isLive: z.boolean(),
});

export type SetOrgModeInput = z.infer<typeof SetOrgModeSchema>;

/** Parámetros de ruta del route handler del PDF. */
export const InvoicePdfParamsSchema = z.object({
  orgId: requiredText("El identificador de la organización", 255),
  invoiceId: requiredText("La factura", 255),
});

export type InvoicePdfParamsInput = z.infer<typeof InvoicePdfParamsSchema>;

// ---------------------------------------------------------------------------
// Personalización del comprobante (spec 31)
// ---------------------------------------------------------------------------

/** De sobra para un logo: Facturapi lo reduce en su propio pipeline al imprimirlo en el PDF. */
const LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Mismo enfoque que `hasDerSignature` (arriba, para el CSD) y `detectMimeFromBytes`
 * (`app/api/upload/route.ts`): el `accept` de un `<input type="file">` es solo del
 * cliente, así que el tipo real se confirma leyendo los primeros bytes, no la
 * extensión ni el `Content-Type` declarado. Formatos aceptados: los que Facturapi
 * imprime en el PDF (PNG, JPEG); el original no valida nada (`organizations.ts:261-262`).
 */
function hasImageSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  return false;
}

/**
 * Valida el logo por extensión, tamaño y tipo real por magic bytes. Como la lectura
 * de bytes es asíncrona, las actions que usen este schema deben llamar `safeParseAsync`.
 */
export const UploadLogoSchema = z
  .object({
    orgId: requiredText("El identificador de la organización", 255),
    logoFile: z.instanceof(File, { message: "El logo es requerido" }),
  })
  .superRefine(async (data, ctx) => {
    const { logoFile } = data;
    if (logoFile.size === 0) {
      ctx.addIssue({ code: "custom", message: "El logo es requerido", path: ["logoFile"] });
      return;
    }
    if (!/\.(png|jpe?g)$/i.test(logoFile.name)) {
      ctx.addIssue({
        code: "custom",
        message: "El logo debe ser una imagen PNG o JPEG",
        path: ["logoFile"],
      });
      return;
    }
    if (logoFile.size > LOGO_MAX_SIZE_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: "El logo excede el tamaño máximo permitido (2 MB)",
        path: ["logoFile"],
      });
      return;
    }
    const head = new Uint8Array(await logoFile.slice(0, 4).arrayBuffer());
    if (!hasImageSignature(head)) {
      ctx.addIssue({
        code: "custom",
        message: "El contenido del archivo no corresponde a una imagen PNG o JPEG válida",
        path: ["logoFile"],
      });
    }
  });

export type UploadLogoInput = z.infer<typeof UploadLogoSchema>;

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const INVOICE_SERIES_REGEX = /^[A-Z0-9]{1,10}$/;

/** Claves de `pdf_extra` que expone Facturapi (`Organization["customization"]["pdf_extra"]`). Cualquier otra clave queda fuera al pasar por `z.object`, en vez de reenviarse tal cual. */
const PdfExtraSchema = z.object({
  codes: z.boolean().optional(),
  address_codes: z.boolean().optional(),
  product_key: z.boolean().optional(),
  round_unit_price: z.boolean().optional(),
  tax_breakdown: z.boolean().optional(),
  ieps_breakdown: z.boolean().optional(),
  render_carta_porte: z.boolean().optional(),
  repeat_signature: z.boolean().optional(),
});

/** Color hexadecimal, folio entero positivo y serie alfanumérica corta. `orgId` no forma parte del schema — como en `CustomerSchema`/`ProductSchema`, la action lo recibe como parámetro aparte y lo valida indirectamente al pasar por `getOrgClient`. */
export const OrganizationCustomizationSchema = z.object({
  color: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .refine((value) => value === null || HEX_COLOR_REGEX.test(value), {
      message: "El color debe ser un hexadecimal válido, por ejemplo #0051D5",
    }),
  invoice_series: optionalText(10).refine(
    (value) => value === null || INVOICE_SERIES_REGEX.test(value),
    { message: "La serie debe ser alfanumérica, en mayúsculas, de hasta 10 caracteres" }
  ),
  next_folio: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((raw, ctx) => {
      if (raw === null || raw === undefined || raw === "") return null;
      const value = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
        ctx.addIssue({ code: "custom", message: "El folio debe ser un número entero mayor a cero" });
        return z.NEVER;
      }
      return value;
    }),
  pdf_extra: PdfExtraSchema,
});

export type OrganizationCustomizationInput = z.infer<typeof OrganizationCustomizationSchema>;

/**
 * `id` del producto de Facturapi guardado como concepto único al facturar cobros
 * (spec 34). `orgId` no forma parte del schema, mismo criterio que `ProductSchema`.
 * Acepta `null` para permitir limpiar la configuración.
 */
export const SetDefaultProductSchema = z.object({
  productId: z.string().trim().min(1, "Selecciona un producto").nullable(),
});

export type SetDefaultProductInput = z.infer<typeof SetDefaultProductSchema>;

/** Los tres orígenes de una operación cobrable de la pestaña Por facturar (spec 34). */
const BillableSourceEnum = z.enum(["consulta", "tratamiento_revision", "tratamiento"], {
  error: () => "Origen de operación inválido",
});

/**
 * Captura del modal de facturación de un cobro (`ICreateBillableInvoiceInput`,
 * spec 34). **No incluye importe, forma de pago, producto ni `mode`** — los
 * cuatro se resuelven en el servidor (`resolveBillableOperation`, `default_product_id`,
 * `getOrgClient`), el mismo criterio que `CreateInvoiceSchema` aplica a `mode`.
 * `source_id` solo identifica la operación a revalidar; nunca es el importe.
 */
export const CreateBillableInvoiceSchema = z.object({
  source: BillableSourceEnum,
  source_id: z.number().int().positive("La operación no es válida"),
  customer_id: requiredText("El cliente", 255),
  description: requiredText("El concepto", 255),
  use: satCatalog(InvoiceUse, "El uso del CFDI"),
});

export type CreateBillableInvoiceInput = z.infer<typeof CreateBillableInvoiceSchema>;
