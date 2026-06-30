import { describe, it, expect } from "vitest";
import { computeGardenCall, worstHealthOf, type GardenCallInput } from "../client/src/lib/gardenCall";

// A "chamada do dia" (Pilar 2) — escolhe a única necessidade mais importante e
// formata na voz do Cultivisor. Testa a PRIORIDADE e o uso do nome da companheira.

const base: GardenCallInput = {
  daysSinceLog: 0,
  registeredToday: true,
  readyToFlip: false,
  envState: "ok",
  stage: 3,
  worstHealth: null,
  companionName: "Aurora",
};

describe("computeGardenCall — prioridade", () => {
  it("sumiço longo (≥4 dias) vence tudo → urgente, push", () => {
    const c = computeGardenCall({ ...base, daysSinceLog: 9, readyToFlip: true, envState: "hot" });
    expect(c.id).toBe("faded");
    expect(c.tone).toBe("urgent");
    expect(c.isNeed).toBe(true);
    expect(c.cta).toBe("register");
  });

  it("sumiço curto (2–3 dias) vem antes de flip/ambiente", () => {
    const c = computeGardenCall({ ...base, daysSinceLog: 2, readyToFlip: true, envState: "hot" });
    expect(c.id).toBe("away");
  });

  it("flip vem antes de ambiente/saúde", () => {
    const c = computeGardenCall({ ...base, readyToFlip: true, envState: "hot", worstHealth: "SICK" });
    expect(c.id).toBe("flip");
    expect(c.cta).toBe("flip");
  });

  it("calor vem antes de frio/saúde", () => {
    expect(computeGardenCall({ ...base, envState: "hot", worstHealth: "SICK" }).id).toBe("hot");
  });

  it("frio → chamada de ambiente", () => {
    expect(computeGardenCall({ ...base, envState: "cold" }).id).toBe("cold");
  });

  it("saúde ruim (SICK/STRESSED) → chamada de saúde", () => {
    expect(computeGardenCall({ ...base, worstHealth: "SICK" }).id).toBe("health");
    expect(computeGardenCall({ ...base, worstHealth: "STRESSED" }).id).toBe("health");
  });

  it("RECOVERING não dispara chamada de saúde (tá melhorando)", () => {
    const c = computeGardenCall({ ...base, worstHealth: "RECOVERING", registeredToday: true });
    expect(c.id).not.toBe("health");
  });

  it("não registrou hoje (mas <2 dias) → recado calmo, sem push", () => {
    const c = computeGardenCall({ ...base, registeredToday: false });
    expect(c.id).toBe("today");
    expect(c.tone).toBe("calm");
    expect(c.isNeed).toBe(false);
  });

  it("maturação (estágio ≥5) → recado de tricomas", () => {
    expect(computeGardenCall({ ...base, stage: 5 }).id).toBe("harvest");
  });

  it("tudo bem → recado positivo, sem push, sem CTA", () => {
    const c = computeGardenCall(base);
    expect(c.id).toBe("thriving");
    expect(c.isNeed).toBe(false);
    expect(c.cta).toBeNull();
  });
});

describe("computeGardenCall — nome da companheira", () => {
  it("usa o nome quando há", () => {
    expect(computeGardenCall({ ...base, envState: "hot" }).text).toContain("Aurora");
  });
  it("cai pra 'ela' sem nome", () => {
    const c = computeGardenCall({ ...base, companionName: null, daysSinceLog: 3 });
    expect(c.text).toContain("ela");
    expect(c.text).not.toContain("null");
  });
  it("nome só com espaços → tratado como sem nome", () => {
    const c = computeGardenCall({ ...base, companionName: "   ", envState: "cold" });
    expect(c.text.startsWith("Ela")).toBe(true);
  });
});

describe("worstHealthOf", () => {
  it("pega a pior saúde entre as plantas", () => {
    expect(worstHealthOf([{ health: "HEALTHY" }, { health: "SICK" }, { health: "STRESSED" }])).toBe("SICK");
  });
  it("ignora null", () => {
    expect(worstHealthOf([{ health: null }, { health: "STRESSED" }])).toBe("STRESSED");
  });
  it("tudo null → null", () => {
    expect(worstHealthOf([{ health: null }, { health: null }])).toBeNull();
  });
  it("lista vazia → null", () => {
    expect(worstHealthOf([])).toBeNull();
  });
});
