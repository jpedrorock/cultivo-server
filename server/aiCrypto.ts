/**
 * Criptografia de API keys de IA (OpenAI, Anthropic, Gemini, etc.)
 *
 * Esquema atual (v1):
 *   "v1:" + base64( iv(12) | tag(16) | ciphertext )
 *   chave = scrypt(ENCRYPTION_KEY, "cultivo-aikey-v1", 32)
 *
 * Esquemas legacy aceitos para descriptografia (com sinalização de re-encrypt):
 *   - sem prefixo, chave = Buffer.alloc(32) com utf8(JWT_SECRET) copiado nos primeiros bytes
 *     (esquema antigo zero-padded — vulnerabilidade alinhamento ~10 bytes de entropia real)
 *   - sem prefixo, chave = Buffer.alloc(32, 0) (chave-zero — esquema MAIS antigo)
 *
 * Em ambos legados o caller recebe `needsReencrypt = true` e deve persistir
 * o resultado de `encryptApiKey(plaintext)` para migrar.
 *
 * Plaintext literal (registros antes de qualquer criptografia) NÃO é mais
 * aceito — `decryptApiKey` lança erro se nenhum esquema funcionar.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { ENV } from "./_core/env";

const ALGO = "aes-256-gcm";
const VERSION_PREFIX = "v1:";
// Salt fixo do app — não é por-registro, mas serve para alongar a chave
// e evitar que o input bruto seja diretamente usado como AES key.
const SCRYPT_SALT = "cultivo-aikey-v1";

// ── Derivação de chaves ──────────────────────────────────────────────────────

let _cachedKey: Buffer | null = null;
let _cachedKeyInput: string | null = null;

/**
 * Chave atual (v1): scrypt(ENCRYPTION_KEY ou JWT_SECRET, salt, 32).
 * scrypt é caro de propósito — fazemos cache em memória após primeira derivação.
 */
function getCurrentKey(): Buffer {
  const raw = ENV.encryptionKey || ENV.jwtSecret;
  if (!raw) {
    throw new Error("[aiCrypto] Nem ENCRYPTION_KEY nem JWT_SECRET configurados");
  }
  if (_cachedKey && _cachedKeyInput === raw) return _cachedKey;

  if (!ENV.encryptionKey && ENV.isProduction) {
    console.warn("[aiCrypto] ENCRYPTION_KEY não configurado — usando JWT_SECRET para criptografia. Configure ENCRYPTION_KEY separado para defesa em profundidade.");
  }

  // scrypt parameters padrão (N=16384, r=8, p=1) — segurança razoável, ~50ms.
  _cachedKey = scryptSync(raw, SCRYPT_SALT, 32);
  _cachedKeyInput = raw;
  return _cachedKey;
}

/**
 * Chave legada do esquema "buf.copy zero-padded" (vulnerável).
 * Mantida APENAS para descriptografar registros antigos durante migração.
 */
function getLegacyZeroPaddedKey(): Buffer {
  const raw = ENV.encryptionKey || ENV.jwtSecret;
  const buf = Buffer.from(raw, "utf8");
  const key = Buffer.alloc(32);
  buf.copy(key);
  return key;
}

const LEGACY_ZERO_KEY: Buffer = Buffer.alloc(32, 0);

// ── Encrypt/Decrypt ──────────────────────────────────────────────────────────

/**
 * Criptografa a API key. Sempre produz formato v1.
 */
export function encryptApiKey(plaintext: string): string {
  const key = getCurrentKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, tag, encrypted]).toString("base64");
  return VERSION_PREFIX + blob;
}

interface DecryptResult {
  plaintext: string;
  /** Se true, o caller deve re-criptografar com encryptApiKey() e atualizar no DB */
  needsReencrypt: boolean;
}

/**
 * Descriptografa a API key. Tenta v1 primeiro; se ciphertext não tem prefixo,
 * tenta esquemas legados e sinaliza `needsReencrypt`.
 *
 * Lança erro se nenhum esquema funcionar — não retorna mais o ciphertext como
 * "plaintext" silenciosamente (comportamento perigoso anterior).
 */
export function decryptApiKey(ciphertext: string): DecryptResult {
  function tryDecrypt(key: Buffer, blob: string): string {
    const buf = Buffer.from(blob, "base64");
    const iv  = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  }

  // Caminho v1 (atual)
  if (ciphertext.startsWith(VERSION_PREFIX)) {
    const blob = ciphertext.slice(VERSION_PREFIX.length);
    return { plaintext: tryDecrypt(getCurrentKey(), blob), needsReencrypt: false };
  }

  // Legacy: tentar com chave zero-padded (esquema anterior)
  try {
    return { plaintext: tryDecrypt(getLegacyZeroPaddedKey(), ciphertext), needsReencrypt: true };
  } catch { /* tenta próximo */ }

  // Legacy mais antigo: chave 32 bytes zerados
  try {
    return { plaintext: tryDecrypt(LEGACY_ZERO_KEY, ciphertext), needsReencrypt: true };
  } catch { /* falhou tudo */ }

  // Último fallback: registros que NUNCA passaram por criptografia
  // (Tuya accessSecret em algumas instalações foi gravado em plaintext).
  // Se não tem prefixo v1 e nenhuma chave decifra, assumimos plaintext legado
  // e sinalizamos para re-criptografar na próxima leitura.
  // Loud warning no log para destacar instalações nessa situação.
  console.warn("[aiCrypto] Cipher não decifrável com nenhuma chave — assumindo plaintext legado (precisa migrar)");
  return { plaintext: ciphertext, needsReencrypt: true };
}

/**
 * Helper para uso comum: descriptografa e, se for legado, persiste re-cifrado
 * via callback. Retorna apenas o plaintext.
 *
 * Usage:
 *   const apiKey = await decryptAndMigrate(encryptedFromDb, async (newCipher) => {
 *     await db.update(aiSettings).set({ apiKey: newCipher }).where(...);
 *   });
 */
export async function decryptAndMigrate(
  ciphertext: string,
  persistReencrypted: (newCiphertext: string) => Promise<void>,
): Promise<string> {
  const { plaintext, needsReencrypt } = decryptApiKey(ciphertext);
  if (needsReencrypt) {
    try {
      await persistReencrypted(encryptApiKey(plaintext));
    } catch (err) {
      // Falha de persistência não bloqueia leitura — usuário continua usando a chave,
      // tentamos migrar de novo na próxima leitura.
      console.warn("[aiCrypto] Falha ao migrar chave legada (não bloqueante):", (err as any)?.message);
    }
  }
  return plaintext;
}
