/**
 * Testes do motor de diagnóstico de nutrientes (sintomas + runoff → ação).
 */
import { describe, it, expect } from "vitest";
import { diagnoseNutrients } from "../client/src/lib/nutrientDiagnosis";

const base = { symptoms: [] as any[], ecTarget: 2.4 };

describe("diagnoseNutrients — flush", () => {
  it("EC do runoff > alvo×1,3 → flush (antes de qualquer sintoma)", () => {
    const r = diagnoseNutrients({ ...base, symptoms: ["chlorosis_new"], runoffEc: 3.2 }); // 3.2 > 2.4*1.3=3.12
    expect(r.action).toBe("flush");
    expect(r.flush?.volumeMul).toBe(2.0);
  });

  it("pH do runoff fora de 5,5–7,0 → flush", () => {
    expect(diagnoseNutrients({ ...base, runoffPh: 4.8 }).action).toBe("flush");
    expect(diagnoseNutrients({ ...base, runoffPh: 7.6 }).action).toBe("flush");
  });

  it("necrose nas pontas → flush", () => {
    expect(diagnoseNutrients({ ...base, symptoms: ["necrosis_tips"] }).action).toBe("flush");
  });
});

describe("diagnoseNutrients — ajustes por sintoma", () => {
  it("clorose nova → sobe Nitrato de Cálcio +25%", () => {
    const r = diagnoseNutrients({ ...base, symptoms: ["chlorosis_new"] });
    expect(r.action).toBe("adjust");
    expect(r.recipeMul?.["Nitrato de Cálcio"]).toBe(1.25);
    expect(r.ecMul).toBe(1.05);
  });

  it("twist → reduz Ca, sobe Mg", () => {
    const r = diagnoseNutrients({ ...base, symptoms: ["twist_curl"] });
    expect(r.recipeMul?.["Nitrato de Cálcio"]).toBe(0.9);
    expect(r.recipeMul?.["Sulfato de Magnésio"]).toBe(1.15);
  });

  it("verde escuro → reduz Nitrato de Cálcio −20%", () => {
    expect(diagnoseNutrients({ ...base, symptoms: ["dark_green"] }).recipeMul?.["Nitrato de Cálcio"]).toBe(0.8);
  });

  it("clorose velha → sobe Sulfato de Magnésio +20%", () => {
    expect(diagnoseNutrients({ ...base, symptoms: ["chlorosis_old"] }).recipeMul?.["Sulfato de Magnésio"]).toBe(1.2);
  });
});

describe("diagnoseNutrients — manter", () => {
  it("sem sintoma + runoff na faixa → maintain", () => {
    const r = diagnoseNutrients({ ...base, symptoms: ["none"], runoffEc: 1.8 });
    expect(r.action).toBe("maintain");
  });

  it("sem sintoma e sem runoff → adjust (receita Kroma padrão, sem mult)", () => {
    const r = diagnoseNutrients({ ...base, symptoms: [] });
    expect(r.action).toBe("adjust");
    expect(r.recipeMul).toBeUndefined();
  });
});
