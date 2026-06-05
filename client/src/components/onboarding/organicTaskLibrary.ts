/**
 * Biblioteca de tarefas sugeridas pro CULTIVO ORGÂNICO (solo vivo).
 *
 * O sistema de tarefas do app é agnóstico de método e nasce VAZIO (o user cria
 * os próprios templates). No mineral o grower ajusta pH/EC/runoff; no orgânico
 * de solo vivo as tarefas são outras: top dressing, chá de compostagem, checar
 * umidade do solo, mulch, fauna. Esta lista é "adicionável com 1 toque" via o
 * TaskTemplatesManager pra quem usa estufa orgânica.
 *
 * Referências de calendário: ver ORGANIC-AMENDMENTS-REFERENCES.md (top dressing
 * a cada 2–3 semanas, parar semana 4–5 de flora; chá AACT aerado).
 *
 * Campos batem com o input de `taskTemplates.create`:
 *   { title, description?, phase, weekNumber }  (context é derivado da fase)
 */

export type OrganicTaskPhase = "VEGA" | "FLORA";

export interface OrganicTaskTemplate {
  title: string;
  description: string;
  phase: OrganicTaskPhase;
  weekNumber: number;
}

export const ORGANIC_TASK_LIBRARY: OrganicTaskTemplate[] = [
  // ── Vegetativo ──────────────────────────────────────────────────────────────
  {
    title: "🌱 Cobrir solo com mulch",
    description: "Cubra a superfície com palha/folhas secas pra proteger a microbiologia e reter umidade. Mantenha durante todo o ciclo.",
    phase: "VEGA",
    weekNumber: 1,
  },
  {
    title: "💧 Checar umidade do solo",
    description: "Enfie o dedo ~3cm: se estiver seco, regue. Solo vivo gosta de úmido constante, nunca encharcado. Regue com água sem cloro.",
    phase: "VEGA",
    weekNumber: 1,
  },
  {
    title: "🌿 Top dressing (vega)",
    description: "Espalhe na superfície: húmus + farinha de alfafa + neem (mais N pra vega). Use a calculadora Manutenção Orgânica pelas quantidades. Regue depois.",
    phase: "VEGA",
    weekNumber: 2,
  },
  {
    title: "🫧 Preparar chá de compostagem",
    description: "Húmus + melaço + kelp aerados 24–48h. Use em até 36h e regue o solo. Ver calculadora Manutenção Orgânica.",
    phase: "VEGA",
    weekNumber: 2,
  },
  {
    title: "🪱 Inspecionar fauna do solo",
    description: "Revolva levemente a superfície e veja se há vida (minhocas, springtails, fungos brancos). Solo saudável = solo vivo.",
    phase: "VEGA",
    weekNumber: 3,
  },
  {
    title: "🌿 Top dressing (vega) — repetir",
    description: "Segunda aplicação de top dressing na vega, se a planta pedir (folhas mais claras = mais N).",
    phase: "VEGA",
    weekNumber: 4,
  },
  // ── Floração ────────────────────────────────────────────────────────────────
  {
    title: "🌸 Top dressing (flora — P/K)",
    description: "Na flora o foco vira P-K: kelp + guano de morcego de floração. Espalhe e regue. Ver calculadora Manutenção Orgânica.",
    phase: "FLORA",
    weekNumber: 1,
  },
  {
    title: "🫧 Chá de compostagem (flora)",
    description: "Chá aerado pra manter a vida do solo ativa na floração. Aere 24–48h, use em 36h.",
    phase: "FLORA",
    weekNumber: 2,
  },
  {
    title: "🌸 Top dressing (flora) — repetir",
    description: "Segunda aplicação de P-K se necessário. Observe a planta.",
    phase: "FLORA",
    weekNumber: 3,
  },
  {
    title: "🛑 Parar top dressing",
    description: "Pare de adicionar amendments ~semana 4–5 de flora. Deixa o solo consumir o que tem antes da colheita (sabor mais limpo). Continue só com água/chá leve.",
    phase: "FLORA",
    weekNumber: 5,
  },
];
