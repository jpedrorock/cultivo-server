/**
 * Modo Jardim — lógica pura do estado da planta viva (estágio + humor).
 *
 * A planta virtual espelha o cultivo real: o ESTÁGIO vem da fase/semana do
 * ciclo, o HUMOR vem do cuidado recente (registrou hoje? ambiente ok?). Gentil
 * tipo Finch — NUNCA "morre". Ver GAME-MODE-CONCEPT.md + memória
 * project_game_mode_jardim. Puro/testável; o router alimenta os sinais.
 */

export type PlantStage = 1 | 2 | 3 | 4 | 5 | 6;
export type PlantMood = "happy" | "thirsty" | "sad";

export const STAGE_NAME: Record<PlantStage, string> = {
  1: "Semente",
  2: "Muda",
  3: "Vegetativo",
  4: "Floração",
  5: "Maturação",
  6: "Colheita",
};

export const MOOD_LABEL: Record<PlantMood, string> = {
  happy: "Saudável e feliz",
  thirsty: "Com sede",
  sad: "Tristinha",
};

/** Estágio a partir do ciclo real (semente → colheita). */
export function computePlantStage(input: {
  hasCycle: boolean;
  category: string | null; // VEGA | FLORA | DRYING | MAINTENANCE
  floraStarted: boolean;
  weeksSinceStart: number;
  weeksSinceFlora: number;
}): PlantStage {
  if (!input.hasCycle) return 1;
  if (input.category === "DRYING") return 6;
  if (input.floraStarted) return input.weeksSinceFlora >= 4 ? 5 : 4;
  if (input.weeksSinceStart < 1) return 1;
  if (input.weeksSinceStart < 2) return 2;
  return 3;
}

/**
 * Humor a partir do cuidado. Gentil: largada por vários dias fica "tristinha"
 * (nunca morre); senão, feliz se registrou hoje + ambiente ok, ou com sede.
 */
export function computePlantMood(input: {
  registeredToday: boolean;
  envOk: boolean;
  daysSinceLog: number;
}): PlantMood {
  if (input.daysSinceLog >= 3) return "sad";
  if (input.registeredToday && input.envOk) return "happy";
  return "thirsty";
}
