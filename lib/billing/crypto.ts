import "server-only";
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

/**
 * Cifrado en reposo de las API keys de Facturapi (`BILLING.organizations.test_key` /
 * `live_key`). AES-256-GCM con el módulo `crypto` de Node — sin dependencia nueva.
 *
 * Formato de almacenamiento: `v1:<iv_base64>:<tag_base64>:<cipher_base64>`. El prefijo
 * de versión permite introducir un esquema de cifrado distinto (y un re-cifrado masivo)
 * más adelante sin romper las filas ya guardadas; no se implementa esa rotación en este
 * spec (ver Riesgos identificados, spec 28).
 */
const ENCRYPTION_VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

/**
 * Clave de cifrado leída de `BILLING_ENCRYPTION_KEY` de forma perezosa (en la primera
 * llamada, no en el import), igual que `getRootClient()` en `facturapiClient.ts` — así
 * una variable de entorno faltante no tumba el arranque de toda la app, solo el módulo
 * de facturación cuando efectivamente se usa.
 */
let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.BILLING_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "BILLING_ENCRYPTION_KEY no está configurada: no se pueden cifrar ni descifrar las API keys de Facturapi."
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "BILLING_ENCRYPTION_KEY debe decodificar a 32 bytes en base64 (AES-256)."
    );
  }

  cachedKey = key;
  return cachedKey;
}

/** Cifra `plain` y devuelve `"v1:<iv>:<tag>:<cipher>"`, todo en base64. */
export function encryptSecret(plain: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Descifra un valor producido por `encryptSecret`. Lanza si el prefijo de versión no
 * coincide, el formato no tiene las 4 partes esperadas, o el tag de autenticación GCM
 * detecta que el ciphertext fue manipulado.
 */
export function decryptSecret(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4) {
    throw new Error("Formato de secreto cifrado inválido: se esperaban 4 segmentos.");
  }

  const [version, ivB64, tagB64, cipherB64] = parts;
  if (version !== ENCRYPTION_VERSION) {
    throw new Error(`Versión de cifrado desconocida: "${version}".`);
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const cipherText = Buffer.from(cipherB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  return decrypted.toString("utf8");
}
