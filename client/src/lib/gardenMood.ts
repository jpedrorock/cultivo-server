/**
 * Rastreia o último humor visto da planta do Jardim, por estufa, pra animar a
 * transição (com sede → feliz) quando o usuário volta de um registro. Mesmo
 * padrão de gardenStage: o Jardim só persiste o novo valor ao FIM da animação
 * (sobrevive ao double-mount do StrictMode — ver gardenCare).
 */
const PREFIX = "jardim-mood-";

export function readLastMood(tentId: number): string | null {
  try {
    return localStorage.getItem(PREFIX + tentId);
  } catch {
    return null;
  }
}

export function writeLastMood(tentId: number, mood: string): void {
  try {
    localStorage.setItem(PREFIX + tentId, mood);
  } catch {
    /* noop */
  }
}
