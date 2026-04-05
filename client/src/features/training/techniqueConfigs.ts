// Configurações completas das técnicas de treinamento de cannabis
// Fonte: CANNA_PRUNE Dev Guide + PlantLSTTab existente

export type TechniqueId =
  | "topping"
  | "fim"
  | "lst"
  | "super_cropping"
  | "lollipopping"
  | "defoliation"
  | "mainlining"
  | "scrog"
  | "sog";

export type TechniqueCategory = "HST" | "LST";

export interface TechniqueConfig {
  id: TechniqueId;
  name: string;
  shortDesc: string;
  description: string;
  category: TechniqueCategory;
  phase: string;
  recovery: string;
  // Resultado esperado padrão
  expectedTops: number;    // 0 = sem novos tops
  recoveryDays: number;
  // Visual
  color: string;           // hex para SVG e badges
  tailwindBg: string;      // classe bg para cards
  tailwindBgSelected: string;
  tailwindBadge: string;
}

export const TECHNIQUE_CONFIGS: Record<TechniqueId, TechniqueConfig> = {
  topping: {
    id: "topping",
    name: "Topping",
    shortDesc: "Corte do broto principal",
    description:
      "Corte do broto principal acima do 3º-5º nó para criar 2+ colas principais. Aumenta rendimento ao distribuir hormônios de crescimento igualmente. Melhor aplicar na fase vegetativa quando a planta tem pelo menos 6 nós.",
    category: "HST",
    phase: "vega",
    recovery: "3-7 dias",
    expectedTops: 2,
    recoveryDays: 7,
    color: "#8D4513",
    tailwindBg: "bg-red-500/10 border-red-500/30",
    tailwindBgSelected: "bg-red-500/25 border-red-500 ring-2 ring-red-500/40",
    tailwindBadge: "bg-red-500/15 text-red-700 dark:text-red-400",
  },
  fim: {
    id: "fim",
    name: "FIM",
    shortDesc: "Corte parcial do topo",
    description:
      "Corte parcial (75-80%) do novo crescimento do topo, deixando pequena porção intacta. Resulta em 3-4 colas principais ao invés de 2. Menos estressante que topping. Ideal para fase vegetativa média.",
    category: "HST",
    phase: "vega",
    recovery: "2-5 dias",
    expectedTops: 3,
    recoveryDays: 4,
    color: "#CD853F",
    tailwindBg: "bg-orange-500/10 border-orange-500/30",
    tailwindBgSelected: "bg-orange-500/25 border-orange-500 ring-2 ring-orange-500/40",
    tailwindBadge: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  },
  lst: {
    id: "lst",
    name: "LST",
    shortDesc: "Dobrar e amarrar galhos",
    description:
      "Técnica de baixo estresse: dobrar e amarrar galhos horizontalmente para expor mais área à luz. Use arames macios ou cordas. Comece cedo na vegetação. Ajuste diariamente conforme crescimento.",
    category: "LST",
    phase: "vega",
    recovery: "Sem pausa",
    expectedTops: 0,
    recoveryDays: 0,
    color: "#7B1FA2",
    tailwindBg: "bg-green-500/10 border-green-500/30",
    tailwindBgSelected: "bg-green-500/25 border-green-500 ring-2 ring-green-500/40",
    tailwindBadge: "bg-green-500/15 text-green-700 dark:text-green-400",
  },
  super_cropping: {
    id: "super_cropping",
    name: "Super Cropping",
    shortDesc: "Apertar e dobrar caule",
    description:
      "Apertar suavemente o caule entre dedos até sentir fibras internas quebrarem, depois dobrar 90°. Cria nó que aumenta fluxo de nutrientes e estimula produção de resina. Aplicar no final da vegetação ou início da floração.",
    category: "HST",
    phase: "vega/flora",
    recovery: "5-10 dias",
    expectedTops: 0,
    recoveryDays: 7,
    color: "#9C27B0",
    tailwindBg: "bg-blue-500/10 border-blue-500/30",
    tailwindBgSelected: "bg-blue-500/25 border-blue-500 ring-2 ring-blue-500/40",
    tailwindBadge: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  },
  lollipopping: {
    id: "lollipopping",
    name: "Lollipopping",
    shortDesc: "Limpar terço inferior",
    description:
      "Remover todo crescimento do terço inferior da planta. Direciona energia para colas superiores. Melhora circulação de ar e reduz risco de mofo. Aplicar 2-3 semanas antes da floração ou na primeira semana de flora.",
    category: "LST",
    phase: "flora",
    recovery: "2-3 dias",
    expectedTops: 0,
    recoveryDays: 3,
    color: "#D32F2F",
    tailwindBg: "bg-purple-500/10 border-purple-500/30",
    tailwindBgSelected: "bg-purple-500/25 border-purple-500 ring-2 ring-purple-500/40",
    tailwindBadge: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  },
  defoliation: {
    id: "defoliation",
    name: "Defoliação",
    shortDesc: "Remover folhas grandes",
    description:
      "Remover folhas grandes (fan leaves) que bloqueiam luz dos brotos inferiores. Melhora penetração de luz e circulação de ar. Não remover mais de 20-30% de folhas por vez. Aplicar gradualmente durante vegetação e nas semanas 1 e 3 da floração.",
    category: "LST",
    phase: "vega/flora",
    recovery: "1-3 dias",
    expectedTops: 0,
    recoveryDays: 2,
    color: "#EF5350",
    tailwindBg: "bg-yellow-500/10 border-yellow-500/30",
    tailwindBgSelected: "bg-yellow-500/25 border-yellow-500 ring-2 ring-yellow-500/40",
    tailwindBadge: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  },
  mainlining: {
    id: "mainlining",
    name: "Mainlining",
    shortDesc: "Estrutura simétrica perfeita",
    description:
      "Combina topping repetido + LST + lollipopping para criar estrutura perfeitamente simétrica com 8-16 colas principais iguais. Requer vegetação longa (6-8 semanas). Resultado: canopy uniforme e flores de tamanho consistente.",
    category: "HST",
    phase: "vega",
    recovery: "7-14 dias",
    expectedTops: 2,
    recoveryDays: 10,
    color: "#5D4037",
    tailwindBg: "bg-indigo-500/10 border-indigo-500/30",
    tailwindBgSelected: "bg-indigo-500/25 border-indigo-500 ring-2 ring-indigo-500/40",
    tailwindBadge: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  },
  scrog: {
    id: "scrog",
    name: "ScrOG",
    shortDesc: "Tela horizontal para canopy",
    description:
      "Instalar tela horizontal e tecer galhos durante vegetação. Força canopy plano e uniforme, maximiza exposição à luz. Ideal para poucas plantas em espaço pequeno. Rendimento muito alto por m².",
    category: "LST",
    phase: "vega",
    recovery: "Sem pausa",
    expectedTops: 0,
    recoveryDays: 0,
    color: "#757575",
    tailwindBg: "bg-pink-500/10 border-pink-500/30",
    tailwindBgSelected: "bg-pink-500/25 border-pink-500 ring-2 ring-pink-500/40",
    tailwindBadge: "bg-pink-500/15 text-pink-700 dark:text-pink-400",
  },
  sog: {
    id: "sog",
    name: "SOG",
    shortDesc: "Muitas plantas pequenas",
    description:
      "Cultivar muitas plantas pequenas com vegetação curta (2-3 semanas) e forçar floração cedo. Cria mar de colas principais. Ciclo rápido (8-10 semanas total). Ideal para clones.",
    category: "LST",
    phase: "vega",
    recovery: "Sem pausa",
    expectedTops: 0,
    recoveryDays: 0,
    color: "#4CAF50",
    tailwindBg: "bg-cyan-500/10 border-cyan-500/30",
    tailwindBgSelected: "bg-cyan-500/25 border-cyan-500 ring-2 ring-cyan-500/40",
    tailwindBadge: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  },
};

export const TECHNIQUE_LIST = Object.values(TECHNIQUE_CONFIGS);

// Mapeia o nome string vindo do banco para o ID padronizado
export function normalizeTechniqueName(name: string): TechniqueId | null {
  const lower = name.toLowerCase().replace(/[^a-z_]/g, "");
  const map: Record<string, TechniqueId> = {
    topping: "topping",
    fim: "fim",
    fimming: "fim",
    lst: "lst",
    lowstresstraining: "lst",
    supercropping: "super_cropping",
    super_cropping: "super_cropping",
    lollipopping: "lollipopping",
    defoliacao: "defoliation",
    defoliation: "defoliation",
    defoliao: "defoliation",
    mainlining: "mainlining",
    manifold: "mainlining",
    scrog: "scrog",
    screenofgreen: "scrog",
    sog: "sog",
    seaofgreen: "sog",
  };
  return map[lower] ?? null;
}

// Posições na planta para o dropdown do formulário
export const NODE_POSITIONS = [
  { value: "top",          label: "Top Principal" },
  { value: "left",         label: "Galho Lateral Esquerdo" },
  { value: "right",        label: "Galho Lateral Direito" },
  { value: "all",          label: "Todos os galhos" },
  { value: "bottom_third", label: "Terço Inferior" },
  { value: "middle",       label: "Meio da planta" },
];
