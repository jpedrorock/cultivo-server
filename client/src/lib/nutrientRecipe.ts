/**
 * nutrientRecipe — receitas Kroma da calculadora de fertilização + aplicação
 * dos multiplicadores do diagnóstico. Puro/testável (sem React).
 *
 * As receitas são a fonte da verdade (planilha Kroma do João, ver memória
 * project_kroma_recipes). O motor `nutrientDiagnosis` devolve multiplicadores
 * por NOME DE SAL; `applyRecipeMul` os aplica sobre a g/L base. Os nomes têm
 * que casar exatamente — `nutrientRecipe.test.ts` blinda contra rename silencioso.
 */

export type Phase = "CLONING" | "VEGA" | "PRE_FLORA" | "FLORA" | "MAINTENANCE" | "DRYING";

export interface NutrientProduct {
  name: string;
  gPerLiter: number;
  npk: string;
  ca: number;
  mg: number;
  fe: number;
  s: number;
}

export const getProductsByPhaseWeek = (phase: Phase, week: number): NutrientProduct[] => {
  if (phase === "CLONING") return [
    { name: "Nitrato de Cálcio",           gPerLiter: 0.3,  npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
    { name: "Nitrato de Potássio",          gPerLiter: 0.2,  npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
    { name: "MKP (Fosfato Monopotássico)",  gPerLiter: 0.1,  npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
    { name: "Sulfato de Magnésio",          gPerLiter: 0.2,  npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
  ];
  if (phase === "VEGA") {
    // Receita Vega Kroma (@kromafarms) — planilha do João. Receita única.
    return [
      { name: "Nitrato de Cálcio",           gPerLiter: 1.12, npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
      { name: "Nitrato de Potássio",          gPerLiter: 0.50, npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "MKP (Fosfato Monopotássico)",  gPerLiter: 0.24, npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "Sulfato de Magnésio",          gPerLiter: 0.80, npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
      { name: "Micronutrientes",              gPerLiter: 0.06, npk: "0-0-0",    ca: 0,  mg: 0,  fe: 6, s: 0  },
    ];
  }
  if (phase === "PRE_FLORA") {
    // Pré-flora = transição Vega → Flora. Receita intermediária pra não estressar:
    // só o MKP sobe pela metade (0,24 → 0,37 → 0,50), Ca/Mg/micros iguais. EC ~2,58.
    return [
      { name: "Nitrato de Cálcio",           gPerLiter: 1.12, npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
      { name: "Nitrato de Potássio",          gPerLiter: 0.50, npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "MKP (Fosfato Monopotássico)",  gPerLiter: 0.37, npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "Sulfato de Magnésio",          gPerLiter: 0.80, npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
      { name: "Micronutrientes",              gPerLiter: 0.06, npk: "0-0-0",    ca: 0,  mg: 0,  fe: 6, s: 0  },
    ];
  }
  if (phase === "FLORA") {
    // Receitas Flora Kroma (@kromafarms) — planilha do João, fonte da verdade.
    // 3 blocos: Flora 1–3 (stretch), Flora 4–7 (bulking) e Finalização.
    // A semana selecionada carrega o bloco Kroma correspondente.
    if (week <= 3) {
      // Flora 1–3 (EC Kroma 2,67)
      return [
        { name: "Nitrato de Cálcio",           gPerLiter: 1.12, npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
        { name: "Nitrato de Potássio",          gPerLiter: 0.50, npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
        { name: "MKP (Fosfato Monopotássico)",  gPerLiter: 0.50, npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
        { name: "Sulfato de Magnésio",          gPerLiter: 0.80, npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
        { name: "Micronutrientes",              gPerLiter: 0.06, npk: "0-0-0",    ca: 0,  mg: 0,  fe: 6, s: 0  },
      ];
    }
    if (week <= 7) {
      // Flora 4–7 (EC ~2,40) — Nitrato de Cálcio em 0,90 g/L: meio-termo entre o
      // 0,70 da planilha Kroma e o 1,12 do stretch. A Kroma assume acúmulo de N
      // das semanas 1–3, mas substrato pequeno/runoff baixo não acumula → 0,70
      // causava clorose em folhas novas (def. de N) na semana 6–7. 0,90 é o mínimo
      // seguro; o diagnóstico por sintomas sobe pra 1,12 se houver clorose nova.
      return [
        { name: "Nitrato de Cálcio",           gPerLiter: 0.90, npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
        { name: "Nitrato de Potássio",          gPerLiter: 0.50, npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
        { name: "MKP (Fosfato Monopotássico)",  gPerLiter: 0.50, npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
        { name: "Sulfato de Magnésio",          gPerLiter: 0.80, npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
        { name: "Micronutrientes",              gPerLiter: 0.06, npk: "0-0-0",    ca: 0,  mg: 0,  fe: 6, s: 0  },
      ];
    }
    // Finalização (EC Kroma 2,00) — entra Óxido de Cálcio (receita Kroma)
    return [
      { name: "Nitrato de Cálcio",           gPerLiter: 0.15, npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
      { name: "Óxido de Cálcio",             gPerLiter: 0.45, npk: "0-0-0",    ca: 71, mg: 0,  fe: 0, s: 0  },
      { name: "Nitrato de Potássio",          gPerLiter: 0.55, npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "MKP (Fosfato Monopotássico)",  gPerLiter: 0.55, npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "Sulfato de Magnésio",          gPerLiter: 0.80, npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
      { name: "Micronutrientes",              gPerLiter: 0.06, npk: "0-0-0",    ca: 0,  mg: 0,  fe: 6, s: 0  },
    ];
  }
  if (phase === "MAINTENANCE") return [
    { name: "Nitrato de Cálcio",           gPerLiter: 0.5,  npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
    { name: "Nitrato de Potássio",          gPerLiter: 0.3,  npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
    { name: "MKP (Fosfato Monopotássico)",  gPerLiter: 0.15, npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
    { name: "Sulfato de Magnésio",          gPerLiter: 0.3,  npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
  ];
  return []; // DRYING — flush
};

// EC de referência da receita — vem da planilha Kroma (Vega/Pré-flora/Flora);
// fases sem receita Kroma usam o modelo linear (Σg/L × 0,91) como fallback.
export function recipeEC(phase: Phase, week: number, products: { gPerLiter: number }[]): number {
  if (phase === "VEGA") return 2.49;
  if (phase === "PRE_FLORA") return 2.58;
  if (phase === "FLORA") return week <= 3 ? 2.67 : week <= 7 ? 2.40 : 2.00;
  const totalGPerL = products.reduce((s, p) => s + p.gPerLiter, 0);
  return Math.round(totalGPerL * 0.91 * 100) / 100;
}

/**
 * Aplica os multiplicadores do diagnóstico (por nome de sal) sobre a g/L e o
 * total de cada produto. Sal sem multiplicador casado → fica como está (×1).
 *
 * ⚠️ O casamento é por `p.name` exato. Se o `nutrientDiagnosis` emitir um nome
 * que não existe na receita, o ajuste vira no-op SILENCIOSO — por isso o teste
 * blinda os nomes dos dois lados. NÃO renomeie um sal só de um lado.
 */
export function applyRecipeMul<T extends { name: string; gPerLiter: number; totalG: number }>(
  products: T[],
  recipeMul: Record<string, number> | undefined,
): T[] {
  if (!recipeMul) return products;
  return products.map((p) => {
    const mul = recipeMul[p.name] ?? 1;
    return { ...p, gPerLiter: p.gPerLiter * mul, totalG: p.totalG * mul };
  });
}
