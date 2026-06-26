/**
 * Sinal "acabei de cuidar" do Modo Jardim. O quick-log marca ao salvar um
 * registro; o Jardim celebra ao montar (volta do registro → planta comemora).
 *
 * Importante: NÃO se consome a flag na leitura — sob o double-mount do
 * StrictMode (React 19) o mount descartável "comeria" o sinal antes do mount
 * real. Em vez disso, lê sem remover e só limpa ao fim da celebração
 * (clearGardenCare), o que sobrevive ao remount.
 */
const KEY = "jardim-celebrate";

export function markGardenCare(): void {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* sessionStorage indisponível — sem celebração, sem erro */
  }
}

/** Há um registro recente pendente de celebração? (não remove a flag) */
export function hasPendingGardenCare(maxAgeMs = 5 * 60 * 1000): boolean {
  try {
    const v = sessionStorage.getItem(KEY);
    if (!v) return false;
    if (Date.now() - Number(v) >= maxAgeMs) {
      sessionStorage.removeItem(KEY); // expirou — descarta
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Limpa a flag — chamar ao terminar a celebração. */
export function clearGardenCare(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
