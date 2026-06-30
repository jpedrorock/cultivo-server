/**
 * gardenCall — "a chamada do dia" (Modo Jardim v2, Pilar 2).
 *
 * Escolhe a ÚNICA necessidade mais importante do estado atual da planta e a
 * formata como fala do Cultivisor, usando o nome da companheira. É a missão do
 * dia: gentil, uma só, na hora. Puro/testável; o Jardim alimenta com o
 * garden.getState e roteia o CTA. Ver BEGINNER-GAME-PLAN.md v2 Pilar 2.
 */

export type GardenCallTone = "urgent" | "nudge" | "calm";
export type GardenCallCta = "register" | "env" | "health" | "flip" | "trichomes" | null;
export type GardenHealth = "HEALTHY" | "STRESSED" | "SICK" | "RECOVERING";

export interface GardenCallInput {
  daysSinceLog: number;
  registeredToday: boolean;
  readyToFlip: boolean;
  envState: "hot" | "cold" | "ok" | "unknown";
  stage: number; // 1–6
  worstHealth: GardenHealth | null;
  companionName?: string | null;
}

export interface GardenCall {
  /** Estável por tipo — usado pra throttle do push (dedupe por dia). */
  id: string;
  tone: GardenCallTone;
  text: string;
  cta: GardenCallCta;
  /** true = necessidade real (vale push); false = recado calmo/positivo (não empurra). */
  isNeed: boolean;
}

/**
 * Prioridade (a 1ª que casa vence): sumiço longo > sumiço curto > flip > calor >
 * frio > saúde ruim > não registrou hoje > maturação > tudo bem.
 */
export function computeGardenCall(input: GardenCallInput): GardenCall {
  const name = input.companionName?.trim() || null;
  const her = name ? `a ${name}` : "ela";   // meio de frase: "como a Aurora tá?"
  const Cap = name ?? "Ela";                 // início de frase: "Aurora tá pronta…"

  if (input.daysSinceLog >= 4) {
    return { id: "faded", tone: "urgent", isNeed: true, cta: "register",
      text: `Faz ${input.daysSinceLog} dias… ${her} ficou em preto e branco aqui na minha memória. Me conta como ela está?` };
  }
  if (input.daysSinceLog >= 2) {
    return { id: "away", tone: "nudge", isNeed: true, cta: "register",
      text: `Faz ${input.daysSinceLog} dias que você não registra — como ${her} tá?` };
  }
  if (input.readyToFlip) {
    return { id: "flip", tone: "nudge", isNeed: true, cta: "flip",
      text: `${Cap} tá pronta pra floração — é hora de mudar pro 12/12.` };
  }
  if (input.envState === "hot") {
    return { id: "hot", tone: "nudge", isNeed: true, cta: "env",
      text: `${Cap} tá sentindo calor agora. Dá uma olhada na temperatura?` };
  }
  if (input.envState === "cold") {
    return { id: "cold", tone: "nudge", isNeed: true, cta: "env",
      text: `${Cap} tá com frio. Confere a temperatura da estufa?` };
  }
  if (input.worstHealth === "SICK" || input.worstHealth === "STRESSED") {
    return { id: "health", tone: "nudge", isNeed: true, cta: "health",
      text: `${Cap} não tá 100% hoje. Quer registrar como ela está?` };
  }
  if (!input.registeredToday) {
    return { id: "today", tone: "calm", isNeed: false, cta: "register",
      text: `Já passou pra ver ${her} hoje? Um registrinho mantém ela viva.` };
  }
  if (input.stage >= 5) {
    return { id: "harvest", tone: "calm", isNeed: false, cta: "trichomes",
      text: `${Cap} tá quase no ponto — fica de olho nos tricomas.` };
  }
  return { id: "thriving", tone: "calm", isNeed: false, cta: null,
    text: `${Cap} tá ótima hoje. Você caprichou no cuidado.` };
}

/** Pior saúde entre as plantas (pra alimentar a chamada). null = sem registro. */
const HEALTH_RANK: Record<GardenHealth, number> = { HEALTHY: 0, RECOVERING: 1, STRESSED: 2, SICK: 3 };
export function worstHealthOf(plants: Array<{ health: GardenHealth | null }>): GardenHealth | null {
  let worst: GardenHealth | null = null;
  for (const p of plants) {
    if (p.health && (worst === null || HEALTH_RANK[p.health] > HEALTH_RANK[worst])) worst = p.health;
  }
  return worst;
}
