import "server-only";
import { z } from "zod";

/**
 * Schemas `zod` de toda entrada del módulo de facturación. Una frontera `'use server'`
 * acepta cualquier input deserializado y los tipos TS se borran en runtime — sin esto,
 * las server actions terminan con casts directos (`as string`, `as File`) sobre
 * `FormData`, que es exactamente lo que este módulo no puede permitirse (spec 28).
 */

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;
const ZIP_REGEX = /^\d{5}$/;
const COUNTRY_REGEX = /^[A-Z]{3}$/i;
const TAX_SYSTEM_REGEX = /^\d{3}$/;

function requiredText(label: string, max = 255) {
  return z.string().trim().min(1, `${label} es requerido`).max(max, `${label} es demasiado largo`);
}

/** Campo opcional: cadena vacía o ausente se normaliza a `null` (mismo shape que la BD). */
function optionalText(max = 255) {
  return z
    .string()
    .trim()
    .max(max)
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

/** Datos legales + dirección requeridos para crear una organización en Facturapi. */
export const CreateOrganizationSchema = z.object({
  name: requiredText("El nombre comercial"),
  legal_name: requiredText("La razón social"),
  tax_id: requiredText("El RFC").regex(RFC_REGEX, "El RFC no tiene un formato válido"),
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
  country: requiredText("El país", 10).regex(
    COUNTRY_REGEX,
    "El país debe ser un código de 3 letras (ej. MEX)"
  ),
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
