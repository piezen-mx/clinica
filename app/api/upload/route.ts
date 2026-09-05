import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Allowed MIME types — anything else is rejected before touching Cloudinary.
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

/**
 * Inspect the first bytes of the buffer to verify the real file format.
 * Returns the detected MIME type or null if not recognised.
 */
function detectMimeFromBytes(buf: Buffer): string | null {
  if (buf.length < 4) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  ) return "image/png";

  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38)
    return "image/gif";

  // WebP: RIFF????WEBP
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf.length >= 12 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";

  // PDF: %PDF  (25 50 44 46)
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)
    return "application/pdf";

  return null;
}

/**
 * Cloudinary rejects public_ids containing characters like <, >, ?, #, %, etc.
 * Strip anything outside the safe set (letters, numbers, underscore, dash, dot,
 * forward slash) and collapse repeated underscores left behind by the removal.
 */
function sanitizePublicId(rawName: string): string {
  const sanitized = rawName
    .replace(/[^\w\-./]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized || "archivo";
}

// The SDK reads CLOUDINARY_URL automatically — no manual config needed.

export const POST = async (req: Request) => {
  try {
    const { searchParams } = new URL(req.url);
    const fileName = searchParams.get("name") ?? "archivo";
    // Strip extension to use as public_id; Cloudinary adds the extension itself.
    const publicId = sanitizePublicId(fileName.replace(/\.[^.]+$/, ""));

    // ── 1. Validate declared Content-Type ──────────────────────────────────
    const declaredType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(declaredType)) {
      return NextResponse.json(
        { ok: false, data: "Tipo de archivo no permitido. Solo se aceptan imágenes y PDF." },
        { status: 415 },
      );
    }

    const buffer = Buffer.from(await req.arrayBuffer());
    if (!buffer.length) {
      return NextResponse.json({ ok: false, data: "No se recibió ningún archivo" }, { status: 400 });
    }

    // ── 2. Validate actual bytes (prevents MIME spoofing) ──────────────────
    const detectedType = detectMimeFromBytes(buffer);
    if (!detectedType || !ALLOWED_MIME_TYPES.has(detectedType)) {
      return NextResponse.json(
        { ok: false, data: "El contenido del archivo no corresponde a una imagen o PDF válidos." },
        { status: 415 },
      );
    }

    const folder = searchParams.get("folder") ?? "clinica/consultas";
    const overwrite = searchParams.get("overwrite") === "true";

    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { public_id: publicId, folder, resource_type: "auto", overwrite },
        (error, result) => {
          if (error || !result) reject(error ?? new Error("Upload falló"));
          else resolve(result as { secure_url: string });
        },
      );
      stream.end(buffer);
    });

    return NextResponse.json({ ok: true, data: result.secure_url });
  } catch (error) {
    console.error({ error });
    return NextResponse.json(
      { ok: false, data: "Error al subir el archivo" },
      { status: 500 },
    );
  }
};
