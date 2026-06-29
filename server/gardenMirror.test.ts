import { describe, it, expect } from "vitest";
import {
  computeEnvState,
  countActiveTops,
  latestHealthByPlant,
  healthSeverity,
  HEALTH_SEVERITY,
} from "./lib/plantGame";

// Derivações puras do "espelho rico" do Modo Jardim (E1 saúde, E2 ambiente,
// E3 treino). Alimentam o garden.getState — antes eram inline, agora testadas.

describe("computeEnvState (E2 — ambiente)", () => {
  const ideal = { tempMin: 20, tempMax: 28, rhMin: 40, rhMax: 60 };

  it("temp acima do máximo → hot", () => {
    expect(computeEnvState({ tempC: 31, rhPct: 50, ideal })).toBe("hot");
  });

  it("temp abaixo do mínimo → cold", () => {
    expect(computeEnvState({ tempC: 16, rhPct: 50, ideal })).toBe("cold");
  });

  it("temp na faixa → ok", () => {
    expect(computeEnvState({ tempC: 24, rhPct: 50, ideal })).toBe("ok");
  });

  it("ar muito seco (RH < rhMin) com temp ok → hot (estresse de calor)", () => {
    expect(computeEnvState({ tempC: 24, rhPct: 30, ideal })).toBe("hot");
  });

  it("temp manda sobre RH: temp fria + ar seco → cold (temp avaliada antes)", () => {
    expect(computeEnvState({ tempC: 16, rhPct: 30, ideal })).toBe("cold");
  });

  it("tem leitura mas sem faixa ideal → ok", () => {
    expect(computeEnvState({ tempC: 24, rhPct: 50, ideal: null })).toBe("ok");
  });

  it("sem leitura de temp (null) e sem ideal → unknown", () => {
    expect(computeEnvState({ tempC: null, rhPct: null, ideal: null })).toBe("unknown");
  });

  it("com ideal mas temp null e RH não-baixa → unknown", () => {
    expect(computeEnvState({ tempC: null, rhPct: 50, ideal })).toBe("unknown");
  });

  it("com ideal, temp null mas RH baixa → hot (regra de ar seco ainda vale)", () => {
    expect(computeEnvState({ tempC: null, rhPct: 30, ideal })).toBe("hot");
  });

  it("valores não-finitos viram ausência de leitura (NaN → unknown)", () => {
    expect(computeEnvState({ tempC: NaN, rhPct: NaN, ideal })).toBe("unknown");
  });

  it("faixa parcial: só tempMax definido → usa o que tem", () => {
    const partial = { tempMin: null, tempMax: 28, rhMin: null, rhMax: null };
    expect(computeEnvState({ tempC: 31, rhPct: null, ideal: partial })).toBe("hot");
    expect(computeEnvState({ tempC: 10, rhPct: null, ideal: partial })).toBe("ok"); // sem tempMin → não vira cold
  });
});

describe("countActiveTops (E3 — treino)", () => {
  const node = (type: string, state: string) => ({ type, state });

  it("conta só os tops ativos", () => {
    const json = JSON.stringify([node("top", "active"), node("top", "active"), node("branch", "active")]);
    expect(countActiveTops(json)).toBe(2);
  });

  it("tops inativos não contam", () => {
    const json = JSON.stringify([node("top", "active"), node("top", "removed")]);
    expect(countActiveTops(json)).toBe(1);
  });

  it("zero tops ativos → clampa pra 1 (planta natural)", () => {
    const json = JSON.stringify([node("branch", "active")]);
    expect(countActiveTops(json)).toBe(1);
  });

  it("array vazio → 1", () => {
    expect(countActiveTops("[]")).toBe(1);
  });

  it("clampa em 8 no máximo", () => {
    const json = JSON.stringify(Array.from({ length: 12 }, () => node("top", "active")));
    expect(countActiveTops(json)).toBe(8);
  });

  it("JSON inválido → 1 (default seguro)", () => {
    expect(countActiveTops("{nao é json}")).toBe(1);
    expect(countActiveTops("")).toBe(1);
  });
});

describe("latestHealthByPlant (E1 — saúde)", () => {
  it("o primeiro registro de cada planta vence (rows ordenadas desc por data)", () => {
    const rows = [
      { plantId: 1, healthStatus: "SICK" as const }, // mais recente da planta 1
      { plantId: 2, healthStatus: "HEALTHY" as const },
      { plantId: 1, healthStatus: "HEALTHY" as const }, // mais antigo da 1 → ignorado
      { plantId: 2, healthStatus: "STRESSED" as const }, // mais antigo da 2 → ignorado
    ];
    expect(latestHealthByPlant(rows)).toEqual({ 1: "SICK", 2: "HEALTHY" });
  });

  it("sem registros → objeto vazio", () => {
    expect(latestHealthByPlant([])).toEqual({});
  });

  it("uma planta, um registro", () => {
    expect(latestHealthByPlant([{ plantId: 7, healthStatus: "RECOVERING" }])).toEqual({ 7: "RECOVERING" });
  });
});

describe("healthSeverity", () => {
  it("ranqueia HEALTHY < RECOVERING < STRESSED < SICK", () => {
    expect(healthSeverity("HEALTHY")).toBe(0);
    expect(healthSeverity("RECOVERING")).toBe(1);
    expect(healthSeverity("STRESSED")).toBe(2);
    expect(healthSeverity("SICK")).toBe(3);
  });

  it("null (sem registro) → 0 (tratado como saudável)", () => {
    expect(healthSeverity(null)).toBe(0);
  });

  it("o mapa cobre os 4 estados", () => {
    expect(Object.keys(HEALTH_SEVERITY).sort()).toEqual(["HEALTHY", "RECOVERING", "SICK", "STRESSED"]);
  });
});
