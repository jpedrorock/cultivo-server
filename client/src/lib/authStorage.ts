import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { isNative } from "./platform";

const TOKEN_KEY = "cultivo_auth_token";

/**
 * Storage do JWT em mobile.
 * - Native (iOS): Keychain real via @aparajita/capacitor-secure-storage
 *                 (antes era NSUserDefaults via @capacitor/preferences,
 *                 que vaza pra backup iCloud e world-readable pelo app).
 * - Native (Android): EncryptedSharedPreferences (idem motivo).
 * - Web: no-op (auth web continua via cookie httpOnly do servidor).
 *
 * Migração automática: se o token antigo ainda estiver no Preferences (versão
 * anterior do app), ele é movido pro SecureStorage no primeiro getToken().
 */

let memoryToken: string | null = null;
let migrationDone = false;

async function migrateFromPreferences(): Promise<void> {
  if (migrationDone || !isNative()) {
    migrationDone = true;
    return;
  }
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const legacy = await Preferences.get({ key: TOKEN_KEY });
    if (legacy.value) {
      // Move pro Keychain
      await SecureStorage.set(TOKEN_KEY, legacy.value);
      await Preferences.remove({ key: TOKEN_KEY });
    }
  } catch (err) {
    console.warn("[authStorage] Migration from Preferences failed (ignoring):", err);
  } finally {
    migrationDone = true;
  }
}

export async function getToken(): Promise<string | null> {
  if (!isNative()) return null;
  if (memoryToken !== null) return memoryToken;

  await migrateFromPreferences();

  try {
    const value = await SecureStorage.get(TOKEN_KEY);
    memoryToken = typeof value === "string" ? value : null;
    return memoryToken;
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  memoryToken = token;
  if (!isNative()) return;
  try {
    await SecureStorage.set(TOKEN_KEY, token);
  } catch (err) {
    console.error("[authStorage] Falha ao salvar token no Keychain:", err);
  }
}

export async function clearToken(): Promise<void> {
  memoryToken = null;
  if (!isNative()) return;
  try {
    await SecureStorage.remove(TOKEN_KEY);
  } catch {
    // ignora — token pode não existir
  }
  // Limpa também o Preferences legacy (idempotente)
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key: TOKEN_KEY });
  } catch {}
}
