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

// ── Espelho rico (E1–E4): derivações puras alimentadas pelo garden.getState ──

export type PlantHealth = "HEALTHY" | "STRESSED" | "SICK" | "RECOVERING";
export type EnvState = "hot" | "cold" | "ok" | "unknown";

/** Faixas ideais da estufa (qualquer campo pode faltar). */
export interface IdealBand {
  tempMin: number | null;
  tempMax: number | null;
  rhMin: number | null;
  rhMax: number | null;
}

/**
 * E2 — estado do ambiente pra POSTURA da planta (calor derruba folha, frio
 * curva pra cima). Temp fora da faixa manda; ar muito seco (RH < rhMin) conta
 * como estresse de calor. Sem leitura → "unknown"; com leitura e sem ideal →
 * "ok". Valores não-finitos viram null (tratados como ausência de leitura).
 */
export function computeEnvState(input: {
  tempC: number | null;
  rhPct: number | null;
  ideal: IdealBand | null;
}): EnvState {
  const t = input.tempC != null && Number.isFinite(input.tempC) ? input.tempC : null;
  const r = input.rhPct != null && Number.isFinite(input.rhPct) ? input.rhPct : null;
  const ideal = input.ideal;
  if (ideal) {
    if (t != null && ideal.tempMax != null && t > ideal.tempMax) return "hot";
    if (t != null && ideal.tempMin != null && t < ideal.tempMin) return "cold";
    if (r != null && ideal.rhMin != null && r < ideal.rhMin) return "hot"; // ar muito seco = estresse de calor
    if (t != null) return "ok";
    return "unknown";
  }
  return t != null ? "ok" : "unknown";
}

/**
 * E3 — nº de colas a partir da forma treinada (`plantStructures.nodesJson`):
 * conta os nós `type:"top"` ativos (topping/FIM criam tops), clampado em 1–8.
 * JSON inválido ou zero tops → 1 (planta natural, uma cola central).
 */
export function countActiveTops(nodesJson: string): number {
  try {
    const nodes = JSON.parse(nodesJson) as Array<{ type?: string; state?: string }>;
    const tops = nodes.filter((n) => n.type === "top" && n.state === "active").length;
    return Math.max(1, Math.min(8, tops));
  } catch {
    return 1;
  }
}

/**
 * E1 — saúde mais recente por planta. Recebe os logs JÁ ordenados do mais
 * recente pro mais antigo (desc por data); o primeiro de cada planta vence.
 */
export function latestHealthByPlant(
  rows: Array<{ plantId: number; healthStatus: PlantHealth }>,
): Record<number, PlantHealth> {
  const out: Record<number, PlantHealth> = {};
  for (const r of rows) {
    if (!(r.plantId in out)) out[r.plantId] = r.healthStatus; // 1º = mais recente
  }
  return out;
}

/** Severidade da saúde (espelho: quanto maior, mais a planta amarela/mancha). */
export const HEALTH_SEVERITY: Record<PlantHealth, number> = {
  HEALTHY: 0,
  RECOVERING: 1,
  STRESSED: 2,
  SICK: 3,
};

export function healthSeverity(status: PlantHealth | null): number {
  return status ? HEALTH_SEVERITY[status] : 0;
}

const WEEK_MS = 7 * 86400000;

/**
 * "Pronto pro flip pra floração?" — a veg chegou no fim da duração da strain
 * (`vegaWeeks`), então é hora de mudar o fotoperíodo pra 12/12. Puro/testável.
 *
 * Só vale com ciclo ativo em vegetativo (sem flora nem pré-flora iniciadas).
 * `flipDueTs` = início do ciclo + vegaWeeks; `readyToFlip` = já passou.
 */
export function computeReadyToFlip(input: {
  hasCycle: boolean;
  floraStarted: boolean;
  preFloraStarted: boolean;
  startDateMs: number;
  vegaWeeks: number;
  now: number;
}): { readyToFlip: boolean; flipDueTs: number | null } {
  if (!input.hasCycle || input.floraStarted || input.preFloraStarted) {
    return { readyToFlip: false, flipDueTs: null };
  }
  const flipDueTs = input.startDateMs + input.vegaWeeks * WEEK_MS;
  return { readyToFlip: input.now >= flipDueTs, flipDueTs };
}
