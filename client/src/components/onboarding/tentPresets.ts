/**
 * Presets de estufa pro onboarding conversacional (first-run).
 *
 * Tamanhos baseados nas estufas (grow tents) mais vendidas no mercado BR +
 * internacional. O usuário escolhe um preset por chip no wizard (step 2) ou
 * usa "Personalizado" pra digitar dimensões próprias.
 *
 * ─── i18n ──────────────────────────────────────────────────────────────────
 * O app (cultivo-server/client) ainda é PT-only — não tem sistema de i18n como
 * o cultivo-site. Por isso os apelidos vivem AQUI, embutidos com PT + EN, e o
 * resolver `presetLabel(preset, locale)` escolhe o idioma. Quando o app ganhar
 * um i18n.ts de verdade, é só mover estes labels pra lá sem mudar o shape.
 *
 * Apelidos EN têm foco "grower internacional" (Stealth, Hobby Grow, etc),
 * não tradução literal do PT.
 *
 * Dimensões em centímetros (largura × profundidade × altura).
 * `tents.width/depth/height` no schema são int (cm). Volume é computado no
 * servidor (tent.create), não precisa vir do preset.
 */

export type Locale = "pt" | "en";

export interface TentPreset {
  /** ID estável — usado como key e no tracking */
  id: string;
  /** Largura em cm */
  width: number;
  /** Profundidade em cm */
  depth: number;
  /** Altura em cm */
  height: number;
  /** Capacidade estimada de plantas (faixa) */
  plantsMin: number;
  plantsMax: number;
  /** Preset destaque (mais vendido) — recebe ⭐ na UI */
  featured?: boolean;
  /** Apelido regionalizado PT + EN */
  label: Record<Locale, string>;
  /** Descrição curta regionalizada (1 linha) */
  sublabel: Record<Locale, string>;
}

/**
 * 7 presets, do menor pro maior. O 80×80 ("Mais Vendida" / "Hobby Grow") é o
 * destaque — tamanho mais popular pra hobbyista indoor.
 */
export const TENT_PRESETS: TentPreset[] = [
  {
    id: "40x40",
    width: 40,
    depth: 40,
    height: 140,
    plantsMin: 1,
    plantsMax: 1,
    label: { pt: "Stealth", en: "Stealth" },
    sublabel: { pt: "Discreta · 1 planta", en: "Discreet · 1 plant" },
  },
  {
    id: "60x60",
    width: 60,
    depth: 60,
    height: 140,
    plantsMin: 1,
    plantsMax: 2,
    label: { pt: "Iniciante", en: "Starter" },
    sublabel: { pt: "Primeiro cultivo · 1–2 plantas", en: "First grow · 1–2 plants" },
  },
  {
    id: "80x80",
    width: 80,
    depth: 80,
    height: 160,
    plantsMin: 2,
    plantsMax: 4,
    featured: true,
    label: { pt: "Mais Vendida", en: "Hobby Grow" },
    sublabel: { pt: "A favorita · 2–4 plantas", en: "The favorite · 2–4 plants" },
  },
  {
    id: "100x100",
    width: 100,
    depth: 100,
    height: 180,
    plantsMin: 4,
    plantsMax: 6,
    label: { pt: "Pro Home", en: "Home Pro" },
    sublabel: { pt: "Cultivo sério em casa · 4–6 plantas", en: "Serious home grow · 4–6 plants" },
  },
  {
    id: "120x120",
    width: 120,
    depth: 120,
    height: 200,
    plantsMin: 6,
    plantsMax: 9,
    label: { pt: "Profissional", en: "Pro Tent" },
    sublabel: { pt: "Alto rendimento · 6–9 plantas", en: "High yield · 6–9 plants" },
  },
  {
    id: "120x60",
    width: 120,
    depth: 60,
    height: 180,
    plantsMin: 2,
    plantsMax: 4,
    label: { pt: "Corredor", en: "Closet" },
    sublabel: { pt: "Retangular, cabe em closet · 2–4 plantas", en: "Fits a closet · 2–4 plants" },
  },
  {
    id: "150x150",
    width: 150,
    depth: 150,
    height: 200,
    plantsMin: 9,
    plantsMax: 16,
    label: { pt: "Comercial", en: "Commercial" },
    sublabel: { pt: "Grande escala · 9–16 plantas", en: "Large scale · 9–16 plants" },
  },
];

/** Resolve o apelido do preset no idioma escolhido (default PT). */
export function presetLabel(preset: TentPreset, locale: Locale = "pt"): string {
  return preset.label[locale] ?? preset.label.pt;
}

/** Resolve a descrição curta do preset no idioma escolhido (default PT). */
export function presetSublabel(preset: TentPreset, locale: Locale = "pt"): string {
  return preset.sublabel[locale] ?? preset.sublabel.pt;
}

/** Dimensões formatadas pra exibição: "80×80×160 cm". */
export function presetDimensions(preset: TentPreset): string {
  return `${preset.width}×${preset.depth}×${preset.height} cm`;
}

/** Footprint (área de base) formatado: "80×80". */
export function presetFootprint(preset: TentPreset): string {
  return `${preset.width}×${preset.depth}`;
}

/** Faixa de plantas formatada: "2–4" ou "1" se min==max. */
export function presetPlantsRange(preset: TentPreset): string {
  return preset.plantsMin === preset.plantsMax
    ? `${preset.plantsMin}`
    : `${preset.plantsMin}–${preset.plantsMax}`;
}

/** Busca um preset por id. */
export function getPresetById(id: string): TentPreset | undefined {
  return TENT_PRESETS.find((p) => p.id === id);
}
