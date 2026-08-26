import "server-only";

/**
 * Traduce un error de Facturapi (o de cualquier operación del módulo) a un mensaje
 * seguro en español, y registra el error completo del lado del servidor.
 *
 * El proyecto original devuelve `err.message` crudo al cliente en ~20 sitios sin
 * registrar nada en el servidor; esos mensajes cargan RFCs, seriales de certificado
 * y detalles de folio, y con eso se puede sondear qué organizaciones existen (spec 28).
 */

interface FacturapiErrorShape {
  message?: string;
  response?: { data?: { message?: string } };
}

/** Catálogo de rechazos comunes → mensaje accionable. Todo lo demás cae al genérico. */
const KNOWN_PATTERNS: Array<{ test: RegExp; message: string }> = [
  {
    test: /tax_id/i,
    message: "El RFC proporcionado no es válido o no coincide con los demás datos fiscales.",
  },
  {
    test: /tax_system|regimen fiscal|regimen/i,
    message: "El régimen fiscal indicado no es válido o no es compatible con el RFC.",
  },
  {
    test: /certificate|csd|\bcer\b|\bkey\b/i,
    message: "El certificado de sello digital (CSD) no pudo procesarse. Verifica los archivos y que no estén vencidos.",
  },
  {
    test: /password/i,
    message: "La contraseña del certificado es incorrecta.",
  },
  {
    test: /already exists|duplicate/i,
    message: "Ya existe un registro con esos datos.",
  },
  {
    test: /api key|unauthorized|forbidden|authentication/i,
    message: "No fue posible autenticar la operación con el proveedor de facturación.",
  },
  {
    test: /not found/i,
    message: "El recurso solicitado no existe o ya fue eliminado.",
  },
  {
    test: /rate limit|too many requests/i,
    message: "Se alcanzó el límite de solicitudes al proveedor de facturación. Intenta de nuevo en unos minutos.",
  },
];

const GENERIC_MESSAGE =
  "Ocurrió un error al procesar la operación de facturación. Intenta de nuevo o contacta a soporte.";

function extractRawMessage(err: unknown): string | null {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null) {
    const shaped = err as FacturapiErrorShape;
    return shaped.response?.data?.message ?? shaped.message ?? null;
  }
  return null;
}

/**
 * Registra `err` completo en la consola del servidor y devuelve un mensaje seguro
 * para mostrar en pantalla. Debe llamarse desde todo `catch` que envuelva una
 * llamada a Facturapi o al repositorio dentro de este módulo.
 */
export function toUserMessage(err: unknown): string {
  console.error("[billing]", err);

  const raw = extractRawMessage(err);
  if (!raw) return GENERIC_MESSAGE;

  const match = KNOWN_PATTERNS.find(({ test }) => test.test(raw));
  return match ? match.message : GENERIC_MESSAGE;
}
