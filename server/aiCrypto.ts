import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { ENV } from "./_core/env";

const ALGO = "aes-256-gcm";

/**
 * Deriva chave de 32 bytes a partir de ENCRYPTION_KEY.
 * Em dev sem a variável: usa derivação do JWT_SECRET como fallback (nunca zero-fill).
 * Em produção: ENCRYPTION_KEY é obrigatório (env.ts faz process.exit se ausente).
 */
function getKey(): Buffer {
  const raw = ENV.encryptionKey || ENV.jwtSecret;
  if (!ENV.encryptionKey && ENV.isDevelopment) {
    // Aviso único em dev para lembrar de configurar a chave
    if (!(getKey as any)._warned) {
      console.warn("[aiCrypto] ENCRYPTION_KEY não configurado — usando JWT_SECRET como fallback (somente dev)");
      (getKey as any)._warned = true;
    }
  }
  const buf = Buffer.from(raw, "utf8");
  const key = Buffer.alloc(32);
  buf.copy(key);
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
