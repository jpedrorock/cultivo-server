/**
 * companionStorage — a "companheira" do Modo Jardim (Pilar 1 do plano v2).
 *
 * Um personagem persistente do Jardim, nomeado no ritual de início. Por ora
 * vive no localStorage (sem migration); a persistência server-side
 * (`users.companionName`, cross-device + lembra histórico) é um follow-up.
 * Ver BEGINNER-GAME-PLAN.md v2 Pilar 1.
 */

const NAME_KEY = "cultivo_companion_name";
const NAMED_AT_KEY = "cultivo_companion_named_at";

/** Nome da companheira, ou null se ainda não foi nomeada. */
export function getCompanionName(): string | null {
  try {
    const v = localStorage.getItem(NAME_KEY);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

/** Salva o nome da companheira (o momento do ritual). Ignora vazio. */
export function setCompanionName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(NAME_KEY, trimmed);
    if (!localStorage.getItem(NAMED_AT_KEY)) {
      localStorage.setItem(NAMED_AT_KEY, String(Date.now()));
    }
  } catch {
    /* localStorage indisponível (modo privado) — segue sem persistir */
  }
}

/** Já passou pelo ritual (tem companheira nomeada)? */
export function hasCompanion(): boolean {
  return getCompanionName() !== null;
}
