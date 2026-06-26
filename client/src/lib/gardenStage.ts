/**
 * Rastreia o último estágio visto da planta do Jardim, por estufa, pra detectar
 * "subiu de estágio" (level-up) entre sessões. Guardado em localStorage.
 * A decisão de quando persistir o novo valor fica no Jardim (deferida ao fim da
 * animação, pra sobreviver ao double-mount do StrictMode — ver gardenCare).
 */
const PREFIX = "jardim-stage-";

export function readLastStage(tentId: number): number | null {
  try {
    const v = localStorage.getItem(PREFIX + tentId);
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}

export function writeLastStage(tentId: number, stage: number): void {
  try {
    localStorage.setItem(PREFIX + tentId, String(stage));
  } catch {
    /* noop */
  }
}
