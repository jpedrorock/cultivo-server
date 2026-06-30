/**
 * nutrientDiagnosis — motor de diagnóstico da calculadora de fertilização.
 *
 * Lê SINTOMAS da planta + dados de RUNOFF (pH/EC) e decide a ação: flush,
 * receita ajustada (override sobre a Kroma), ou manter. Puro/testável.
 * Spec: "cultivo-calculadora-update-v2.docx" (João + especialista, jun/2026).
 *
 * Os ajustes vêm como MULTIPLICADORES por nome de sal (pra casar com a receita
 * real do Nutrients.tsx, ex: "Nitrato de Cálcio") — a UI aplica sobre a g/L base.
 */

export type PlantSymptom =
  | "chlorosis_new"   // folhas NOVAS amareladas → falta de N
  | "chlorosis_old"   // folhas velhas amareladas → falta de Mg
  | "necrosis_tips"   // pontas queimadas → excesso de sais
  | "twist_curl"      // folhas enroladas/twistadas → Ca:Mg / lockout
  | "wilting"         // murcha → turgência/rega
  | "dark_green"      // verde muito escuro → excesso de N
  | "none";

export interface DiagnosisInput {
  symptoms: PlantSymptom[];
  runoffPh?: number | null;
  runoffEc?: number | null;   // mS/cm
  ecTarget: number;           // EC alvo da fase atual (de recipeEC)
  /** Histórico de runoff da estufa, MAIS-RECENTE-PRIMEIRO (de dailyLogs). */
  runoffHistory?: Array<{ ph?: number | null; ec?: number | null }>;
}

/**
 * EC do runoff em tendência de alta? Recebe o histórico mais-recente-primeiro;
 * true se as 3 leituras de EC mais recentes sobem no tempo (≥2 altas seguidas):
 * ec[mais antigo] < ec[meio] < ec[mais recente]. Puro/testável.
 */
export function isEcRising(history: Array<{ ec?: number | null }> | undefined): boolean {
  const ecs = (history ?? []).map((h) => h.ec).filter((e): e is number => e != null && Number.isFinite(e));
  if (ecs.length < 3) return false; // mais-recente-primeiro: ecs[0] é a última leitura
  return ecs[0] > ecs[1] && ecs[1] > ecs[2];
}

export interface DiagnosisResult {
  action: "flush" | "adjust" | "maintain";
  title: string;
  message: string;
  warnings: string[];
  /** Multiplicadores sobre a g/L base, por nome de sal. Ex: { "Nitrato de Cálcio": 1.25 }. */
  recipeMul?: Record<string, number>;
  /** Multiplicador sobre o EC alvo. */
  ecMul?: number;
  flush?: { volumeMul: number; targetRunoffPct: number; repeatIfEcAbove: number };
}

const CA = "Nitrato de Cálcio";
const MG = "Sulfato de Magnésio";

export function diagnoseNutrients(input: DiagnosisInput): DiagnosisResult {
  const { symptoms, runoffPh, runoffEc, ecTarget, runoffHistory } = input;
  const has = (s: PlantSymptom) => symptoms.includes(s);

  // 1) EC do runoff muito alto → substrato saturado de sais → flush antes de tudo.
  if (runoffEc != null && runoffEc > ecTarget * 1.3) {
    return {
      action: "flush",
      title: "Flush primeiro",
      message: `EC do runoff (${runoffEc.toFixed(2)}) bem acima do alvo (${ecTarget.toFixed(2)}). Substrato saturado — faça flush antes de qualquer ajuste de receita.`,
      warnings: [`EC runoff > alvo × 1,3 = acúmulo crítico de sais (lockout provável).`],
      flush: { volumeMul: 2.0, targetRunoffPct: 30, repeatIfEcAbove: 1.5 },
    };
  }

  // 1b) Flush PREVENTIVO por tendência: o EC ainda não estourou o ×1,3, mas
  // vem subindo nas últimas leituras E já passou do alvo×1,15 → pega o acúmulo
  // de sais antes de virar lockout. Só dispara com histórico suficiente.
  if (runoffEc != null && runoffEc > ecTarget * 1.15 && isEcRising(runoffHistory)) {
    return {
      action: "flush",
      title: "Flush preventivo",
      message: `O EC do runoff vem subindo nas últimas leituras e já está em ${runoffEc.toFixed(2)} (alvo ${ecTarget.toFixed(2)}). Faça um flush leve agora pra evitar o acúmulo de sais antes que vire lockout.`,
      warnings: ["Tendência de alta no EC do runoff — agir cedo evita queimadura/lockout."],
      flush: { volumeMul: 1.5, targetRunoffPct: 25, repeatIfEcAbove: 1.3 },
    };
  }

  // 2) pH do runoff fora da faixa → lockout → flush com água corrigida.
  if (runoffPh != null && (runoffPh < 5.5 || runoffPh > 7.0)) {
    return {
      action: "flush",
      title: "Flush (pH fora)",
      message: `pH do runoff ${runoffPh.toFixed(1)} fora da faixa (5,5–7,0) — lockout provável. Flush com água em pH 6,2–6,5 e reavalie.`,
      warnings: [`pH runoff ${runoffPh.toFixed(1)} trava a absorção mesmo com receita certa.`],
      flush: { volumeMul: 1.5, targetRunoffPct: 25, repeatIfEcAbove: 1.8 },
    };
  }

  // 3) Necrose nas pontas → toxicidade/EC alto → flush.
  if (has("necrosis_tips")) {
    return {
      action: "flush",
      title: "Flush (pontas queimadas)",
      message: "Pontas queimadas = excesso de sais / EC alto. Flush obrigatório e reduza o EC depois.",
      warnings: ["Necrose nas pontas = toxicidade de nutriente."],
      flush: { volumeMul: 2.0, targetRunoffPct: 35, repeatIfEcAbove: 1.2 },
    };
  }

  // 4) Clorose em folhas NOVAS → falta de N → sobe o Nitrato de Cálcio (+25%).
  if (has("chlorosis_new")) {
    return {
      action: "adjust",
      title: "Mais nitrogênio",
      message: "Folhas novas amareladas = deficiência de N. Subindo o Nitrato de Cálcio +25% acima da receita Kroma.",
      warnings: ["Override por sintoma: ignora a redução de N da fase enquanto a clorose persistir."],
      recipeMul: { [CA]: 1.25 },
      ecMul: 1.05,
    };
  }

  // 5) Folhas twistadas → desequilíbrio Ca:Mg / lockout → ajusta o balanço.
  if (has("twist_curl")) {
    return {
      action: "adjust",
      title: "Balanço Ca:Mg",
      message: "Folhas enroladas/twistadas = possível desequilíbrio Ca:Mg ou lockout. Reduzindo Ca, subindo Mg, aliviando o EC.",
      warnings: ["Se persistir, cheque o pH do runoff (lockout)."],
      recipeMul: { [CA]: 0.9, [MG]: 1.15 },
      ecMul: 0.95,
    };
  }

  // 6) Verde muito escuro → excesso de N → reduz o Nitrato de Cálcio.
  if (has("dark_green")) {
    return {
      action: "adjust",
      title: "Menos nitrogênio",
      message: "Verde muito escuro / pontas em garra = excesso de N. Reduzindo o Nitrato de Cálcio −20%.",
      warnings: ["Excesso de N atrasa a floração."],
      recipeMul: { [CA]: 0.8 },
      ecMul: 0.95,
    };
  }

  // 7) Clorose em folhas VELHAS → falta de Mg → sobe o Sulfato de Magnésio.
  if (has("chlorosis_old")) {
    return {
      action: "adjust",
      title: "Mais magnésio",
      message: "Folhas velhas amareladas (entre as nervuras) = deficiência de Mg. Subindo o Sulfato de Magnésio +20%.",
      warnings: [],
      recipeMul: { [MG]: 1.2 },
      ecMul: 1.02,
    };
  }

  // 8) Murcha → turgência/rega (não é receita).
  if (has("wilting")) {
    return {
      action: "adjust",
      title: "Cheque a rega",
      message: "Murcha = turgência baixa. Cheque a rega/raízes (encharcado ou seco demais) antes de mexer na receita.",
      warnings: ["Murcha raramente é nutriente — costuma ser água/raiz."],
    };
  }

  // 9) Sem sintomas + runoff dentro da faixa → manter.
  if ((symptoms.length === 0 || has("none")) && runoffEc != null && runoffEc >= 1.0 && runoffEc <= ecTarget * 1.15) {
    return {
      action: "maintain",
      title: "Mantém a receita",
      message: "Sem sintomas e runoff dentro da faixa. Mantém a receita Kroma da fase.",
      warnings: [],
    };
  }

  // Default → receita Kroma padrão, monitorando.
  return {
    action: "adjust",
    title: "Receita Kroma da fase",
    message: "Sem sintoma específico. Usa a receita Kroma da fase atual — fique de olho nas folhas novas.",
    warnings: ["Registre o runoff (pH/EC) na próxima rega pra um diagnóstico mais preciso."],
  };
}
