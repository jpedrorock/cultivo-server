/**
 * Testes da lógica pura do Modo Jardim (estágio + humor da planta).
 */
import { describe, it, expect } from "vitest";
import { computePlantStage, computePlantMood } from "./lib/plantGame";

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
