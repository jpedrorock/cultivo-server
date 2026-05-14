/**
 * Strains famosas pré-cadastradas pra o wizard de onboarding.
 *
 * Mostra ao user uma lista de strains conhecidas pra ele clicar e ter
 * tempos de Veg/Flora preenchidos automaticamente. Reduz fricção do
 * "primeiro user" que ainda não conhece o app — não precisa pesquisar
 * cada strain.
 *
 * Origin sempre FEMINIZED por default (mais comum hobbyista). User pode
 * trocar pra AUTOFLOWER ou CLONE no formulário se quiser.
 *
 * Pra adicionar mais strains: append no array. Ordem é mostrada na UI.
 */
export interface FamousStrain {
  name: string;
  type: "Indica" | "Sativa" | "Híbrida";
  vegaWeeks: number;
  floraWeeks: number;
  description: string;
}

export const FAMOUS_STRAINS: FamousStrain[] = [
  {
    name: "Northern Lights",
    type: "Indica",
    vegaWeeks: 4,
    floraWeeks: 8,
    description: "Clássica indica resistente, ideal pra iniciantes. Floração rápida.",
  },
  {
    name: "Gelato",
    type: "Híbrida",
    vegaWeeks: 4,
    floraWeeks: 9,
    description: "Aroma doce e resinosa. Híbrida balanceada com bom rendimento.",
  },
  {
    name: "Blueberry",
    type: "Indica",
    vegaWeeks: 4,
    floraWeeks: 8,
    description: "Aroma frutado característico. Indica relaxante.",
  },
  {
    name: "White Widow",
    type: "Híbrida",
    vegaWeeks: 4,
    floraWeeks: 8,
    description: "Coberta de tricomas brancos. Resistente e produtiva.",
  },
  {
    name: "OG Kush",
    type: "Híbrida",
    vegaWeeks: 4,
    floraWeeks: 9,
    description: "Aroma terroso forte. Base genética de muitas strains modernas.",
  },
  {
    name: "Sour Diesel",
    type: "Sativa",
    vegaWeeks: 5,
    floraWeeks: 10,
    description: "Sativa estimulante com aroma de combustível. Floração mais longa.",
  },
  {
    name: "Girl Scout Cookies",
    type: "Híbrida",
    vegaWeeks: 4,
    floraWeeks: 9,
    description: "Aroma adocicado de baunilha. Híbrida potente e saborosa.",
  },
  {
    name: "Bubba Kush",
    type: "Indica",
    vegaWeeks: 4,
    floraWeeks: 8,
    description: "Indica densa com aroma terroso. Boa pra cultivos compactos.",
  },
  {
    name: "AK-47",
    type: "Híbrida",
    vegaWeeks: 4,
    floraWeeks: 8,
    description: "Híbrida vigorosa, fácil de cultivar. Boa pra novos growers.",
  },
  {
    name: "Jack Herer",
    type: "Sativa",
    vegaWeeks: 4,
    floraWeeks: 9,
    description: "Sativa cerebral com toques cítricos. Alto rendimento de resina.",
  },
];
