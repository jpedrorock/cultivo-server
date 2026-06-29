import { describe, it, expect } from "vitest";
import { getProductsByPhaseWeek, recipeEC, applyRecipeMul } from "../client/src/lib/nutrientRecipe";
import { diagnoseNutrients, type PlantSymptom } from "../client/src/lib/nutrientDiagnosis";

// Wiring diagnóstico → receita: o motor devolve multiplicadores por NOME DE SAL;
// a calculadora os aplica sobre a g/L. Se os nomes divergirem, o ajuste vira
// no-op SILENCIOSO (nada falha, mas a receita não muda). Estes testes pegam isso.

// Helper: receita "calculada" como a UI faz (gPerLiter × volume → totalG).
const calc = (phase: Parameters<typeof getProductsByPhaseWeek>[0], week: number, volumeL: number) =>
  getProductsByPhaseWeek(phase, week).map((p) => ({ ...p, totalG: p.gPerLiter * volumeL }));

describe("applyRecipeMul — aplicação do multiplicador", () => {
  it("sobe a g/L e o totalG do sal alvo, mantém os outros", () => {
    const products = calc("FLORA", 6, 10); // bulking: Ca em 0,90 g/L
    const out = applyRecipeMul(products, { "Nitrato de Cálcio": 1.25 });
    const ca = out.find((p) => p.name === "Nitrato de Cálcio")!;
    const k = out.find((p) => p.name === "Nitrato de Potássio")!;
    expect(ca.gPerLiter).toBeCloseTo(1.125, 5); // 0,90 × 1,25
    expect(ca.totalG).toBeCloseTo(11.25, 5); // 9,0 × 1,25
    expect(k.gPerLiter).toBeCloseTo(0.5, 5); // intacto
  });

  it("recipeMul undefined → receita inalterada (mesma referência de valores)", () => {
    const products = calc("VEGA", 1, 5);
    const out = applyRecipeMul(products, undefined);
    expect(out).toEqual(products);
  });

  it("nome de sal que NÃO existe na receita → no-op silencioso (documenta a falha)", () => {
    const products = calc("FLORA", 6, 10);
    const out = applyRecipeMul(products, { "Sal Inexistente": 2 });
    expect(out).toEqual(products); // nada mudou — é justamente o bug que blindamos abaixo
  });
});

describe("wiring diagnóstico → receita real (ponta a ponta)", () => {
  it("clorose nova na flora 6 sobe o Nitrato de Cálcio de 0,90 → 1,125", () => {
    const ecTarget = recipeEC("FLORA", 6, getProductsByPhaseWeek("FLORA", 6)); // 2,40
    const diag = diagnoseNutrients({ symptoms: ["chlorosis_new"], ecTarget });
    expect(diag.recipeMul).toBeDefined();

    const out = applyRecipeMul(calc("FLORA", 6, 10), diag.recipeMul);
    const ca = out.find((p) => p.name === "Nitrato de Cálcio")!;
    expect(ca.gPerLiter).toBeCloseTo(1.125, 5); // override realmente chega na receita
  });

  it("twist na flora move Ca pra baixo e Mg pra cima na receita real", () => {
    const diag = diagnoseNutrients({ symptoms: ["twist_curl"], ecTarget: 2.4 });
    const base = calc("FLORA", 6, 10);
    const out = applyRecipeMul(base, diag.recipeMul);
    const ca = out.find((p) => p.name === "Nitrato de Cálcio")!;
    const mg = out.find((p) => p.name === "Sulfato de Magnésio")!;
    expect(ca.gPerLiter).toBeLessThan(0.9); // 0,90 × 0,9
    expect(mg.gPerLiter).toBeGreaterThan(0.8); // 0,80 × 1,15
  });
});

// ── A BLINDAGEM: todo nome de sal que o motor pode emitir TEM que existir na
//    receita, senão o ajuste é no-op. Varre todos os sintomas em fases relevantes.
describe("nomes de sal: motor ↔ receita (anti no-op silencioso)", () => {
  const ALL_SYMPTOMS: PlantSymptom[] = [
    "chlorosis_new",
    "chlorosis_old",
    "necrosis_tips",
    "twist_curl",
    "wilting",
    "dark_green",
  ];
  // Fases/semanas onde o diagnóstico roda sobre uma receita com sais (não DRYING).
  const CONTEXTS: Array<{ phase: Parameters<typeof getProductsByPhaseWeek>[0]; week: number }> = [
    { phase: "VEGA", week: 1 },
    { phase: "FLORA", week: 2 },
    { phase: "FLORA", week: 6 },
    { phase: "FLORA", week: 9 },
  ];

  it("cada sal multiplicado existe na receita da fase (em todos os sintomas)", () => {
    for (const ctx of CONTEXTS) {
      const recipeNames = new Set(getProductsByPhaseWeek(ctx.phase, ctx.week).map((p) => p.name));
      const ecTarget = recipeEC(ctx.phase, ctx.week, getProductsByPhaseWeek(ctx.phase, ctx.week));
      for (const sym of ALL_SYMPTOMS) {
        const diag = diagnoseNutrients({ symptoms: [sym], ecTarget });
        for (const salt of Object.keys(diag.recipeMul ?? {})) {
          expect(
            recipeNames.has(salt),
            `Sal "${salt}" (sintoma ${sym}, ${ctx.phase} s${ctx.week}) não existe na receita → multiplicador seria no-op silencioso`,
          ).toBe(true);
        }
      }
    }
  });
});
