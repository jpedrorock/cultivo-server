import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const KEY_ENV = process.env.ENCRYPTION_KEY ?? "";

// Derivar chave de 32 bytes a partir da env var (padding/trim se necessário)
function getKey(): Buffer {
  if (!KEY_ENV) return Buffer.alloc(32, 0); // fallback dev: chave zerada
  const raw = Buffer.from(KEY_ENV, "utf8");
  const key = Buffer.alloc(32);
  raw.copy(key);
  return key;
}

/**
 * Criptografa a API key com AES-256-GCM.
 * Retorna string no formato base64: iv(12) + authTag(16) + ciphertext
 */
export function encryptApiKey(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Descriptografa a API key.
 * Se falhar (dados corrompidos ou chave errada) lança erro.
 */
export function decryptApiKey(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, "base64");
  const iv  = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
