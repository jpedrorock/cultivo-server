/**
 * trophySeen — rastreia quais troféus (chave:tier) já foram celebrados, por
 * device (localStorage). O TrophyUnlockWatcher usa isto pra disparar a
 * cerimônia só em tiers NOVOS. A 1ª vez é baseline (salva os atuais sem
 * celebrar) — não spamma conquistas antigas.
 */
const KEY = "trophy-seen";

export function loadSeen(): Set<string> {
  try {
    const v = localStorage.getItem(KEY);
    return new Set<string>(v ? JSON.parse(v) : []);
  } catch {
    return new Set<string>();
  }
}

export function saveSeen(set: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* noop */
  }
}

/** Já existe baseline salvo? (false = primeira vez → não celebrar) */
export function hasBaseline(): boolean {
  try {
    return localStorage.getItem(KEY) != null;
  } catch {
    return false;
  }
}
