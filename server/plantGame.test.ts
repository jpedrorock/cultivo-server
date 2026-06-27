/**
 * Testes da lógica pura do Modo Jardim (estágio + humor da planta).
 */
import { describe, it, expect } from "vitest";
import { computePlantStage, computePlantMood, computeReadyToFlip } from "./lib/plantGame";

const baseStage = { hasCycle: true, category: "VEGA" as string | null, floraStarted: false, weeksSinceStart: 3, weeksSinceFlora: 0 };

describe("computePlantStage", () => {
  it("sem ciclo → semente (1)", () => {
    expect(computePlantStage({ ...baseStage, hasCycle: false })).toBe(1);
  });

  it("veg: semente → muda → vegetativo pela semana", () => {
    expect(computePlantStage({ ...baseStage, weeksSinceStart: 0 })).toBe(1);
    expect(computePlantStage({ ...baseStage, weeksSinceStart: 1 })).toBe(2);
    expect(computePlantStage({ ...baseStage, weeksSinceStart: 3 })).toBe(3);
  });

  it("floração: inicial (4) → maturação (5)", () => {
    expect(computePlantStage({ ...baseStage, floraStarted: true, weeksSinceFlora: 1 })).toBe(4);
    expect(computePlantStage({ ...baseStage, floraStarted: true, weeksSinceFlora: 5 })).toBe(5);
  });

  it("secagem → colheita (6)", () => {
    expect(computePlantStage({ ...baseStage, category: "DRYING" })).toBe(6);
  });
});

describe("computePlantMood", () => {
  it("feliz: registrou hoje + ambiente ok", () => {
    expect(computePlantMood({ registeredToday: true, envOk: true, daysSinceLog: 0 })).toBe("happy");
  });

  it("com sede: faltou registro hoje OU ambiente fora", () => {
    expect(computePlantMood({ registeredToday: false, envOk: true, daysSinceLog: 1 })).toBe("thirsty");
    expect(computePlantMood({ registeredToday: true, envOk: false, daysSinceLog: 0 })).toBe("thirsty");
  });

  it("tristinha: largada 3+ dias (mas nunca morre)", () => {
    expect(computePlantMood({ registeredToday: false, envOk: false, daysSinceLog: 3 })).toBe("sad");
    expect(computePlantMood({ registeredToday: false, envOk: true, daysSinceLog: 5 })).toBe("sad");
  });
});

describe("computeReadyToFlip", () => {
  const WEEK = 7 * 86400000;
  const start = 1_000_000_000_000; // início do ciclo (ms fixo)
  const base = { hasCycle: true, floraStarted: false, preFloraStarted: false, startDateMs: start, vegaWeeks: 4 };

  it("veg no prazo (ainda não chegou) → não pronto, mas com flipDueTs", () => {
    const now = start + 3 * WEEK; // 3 de 4 semanas
    const r = computeReadyToFlip({ ...base, now });
    expect(r.readyToFlip).toBe(false);
    expect(r.flipDueTs).toBe(start + 4 * WEEK);
  });

  it("veg no fim (chegou/passou) → pronto pro flip", () => {
    expect(computeReadyToFlip({ ...base, now: start + 4 * WEEK }).readyToFlip).toBe(true); // exatamente no prazo
    expect(computeReadyToFlip({ ...base, now: start + 6 * WEEK }).readyToFlip).toBe(true); // passou
  });

  it("pós-flip (floração iniciada) → nunca pronto, flipDueTs null", () => {
    const r = computeReadyToFlip({ ...base, floraStarted: true, now: start + 10 * WEEK });
    expect(r).toEqual({ readyToFlip: false, flipDueTs: null });
  });

  it("pré-flora iniciada → não pronto (já tá na transição)", () => {
    const r = computeReadyToFlip({ ...base, preFloraStarted: true, now: start + 10 * WEEK });
    expect(r).toEqual({ readyToFlip: false, flipDueTs: null });
  });

  it("sem ciclo → não pronto, flipDueTs null", () => {
    const r = computeReadyToFlip({ ...base, hasCycle: false, now: start + 10 * WEEK });
    expect(r).toEqual({ readyToFlip: false, flipDueTs: null });
  });

  it("vegaWeeks maior empurra o prazo (ex: strain de 8 semanas)", () => {
    const now = start + 5 * WEEK; // passaria numa de 4, mas não numa de 8
    expect(computeReadyToFlip({ ...base, vegaWeeks: 8, now }).readyToFlip).toBe(false);
    expect(computeReadyToFlip({ ...base, vegaWeeks: 8, now }).flipDueTs).toBe(start + 8 * WEEK);
  });
});
