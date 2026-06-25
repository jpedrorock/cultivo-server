/**
 * phaseColors.ts — Cores canônicas das fases de cultivo
 *
 * Por que hex em vez de var(--phase-*)?
 * CSS custom properties NÃO resolvem em contexto SVG/canvas — recharts,
 * canvas2D e SVG renderizados fora da CSSOM recebem rgba(0,0,0,0).
 * Use estes valores hex sempre que a cor precisar ir para:
 *   - stroke / fill de recharts (BarChart, AreaChart, ReferenceArea…)
 *   - context.fillStyle / strokeStyle em canvas
 *   - estilos inline em elementos SVG
 *
 * Para elementos HTML normais, var(--phase-*) ainda funciona.
 *
 * ── Paleta alinhada ao design system do cultivo.pro ─────────────────────────
 * O site usa 4 hues de referência (oklch):
 *   manutenção → hue 245 (índigo-azul)
 *   vegetativa → hue 145 (verde-floresta)
 *   floração   → hue 305 (violeta)
 *   secagem    → hue 75  (âmbar)
 *
 * O app expande para 9 fases preservando os mesmos hues âncora e inserindo
 * fases adicionais em hues logicamente adjacentes:
 *
 *   130 lime  → SEEDLING / CLONING   (mais claro que vega — vida nova)
 *   145 verde → VEGA                 (= site)
 *   305 roxo  → FLORA                (= site)
 *   185 teal  → FLUSHING             (entre flora e manutenção)
 *    38 laranja→ HARVEST             (colheita quente)
 *    75 âmbar → DRYING               (= site)
 *    65 dourado→ CURING              (pós-secagem, mais mellow)
 *   245 índigo → MAINTENANCE         (= site)
 * ─────────────────────────────────────────────────────────────────────────── */

/** Fase do ciclo de cultivo (espelha o enum backend + PhaseBadge) */
export type Phase =
  | "SEEDLING"
  | "VEGA"
  | "PRE_FLORA"
  | "FLORA"
  | "FLUSHING"
  | "HARVEST"
  | "DRYING"
  | "CURING"
  | "MAINTENANCE"
  | "CLONING";

/**
 * Hex canônicos — derivados dos valores oklch do design system.
 * Manter em sincronia com `--phase-*` no bloco `.dark` de index.css
 * e com os tokens `html.forest` / `@theme inline`.
 *
 * Conversões oklch → sRGB hex (tema dark, vibrante sobre fundo escuro):
 *   SEEDLING    oklch(0.72 0.22 130) ≈ #72db4a  lime
 *   VEGA        oklch(0.70 0.20 145) ≈ #40c057  verde-floresta
 *   FLORA       oklch(0.68 0.22 305) ≈ #c44bdb  violeta
 *   FLUSHING    oklch(0.68 0.15 185) ≈ #20c897  teal
 *   HARVEST     oklch(0.72 0.20 38)  ≈ #f57230  laranja
 *   DRYING      oklch(0.74 0.17 75)  ≈ #d8a230  âmbar
 *   CURING      oklch(0.68 0.14 65)  ≈ #c09040  dourado
 *   MAINTENANCE oklch(0.62 0.17 245) ≈ #5c7de0  índigo-azul  ← alinhado ao site
 */
export const PHASE_COLORS = {
  SEEDLING:    "#72db4a",  // lime — muda / germinação         (hue 130)
  VEGA:        "#40c057",  // verde-floresta — vegetativa       (hue 145, = site)
  PRE_FLORA:   "#b57edc",  // lavanda — pré-flora / stretch     (violeta claro, começo da flora)
  FLORA:       "#c44bdb",  // violeta — floração                (hue 305, = site)
  FLUSHING:    "#20c897",  // teal — flush pré-colheita         (hue 185)
  HARVEST:     "#f57230",  // laranja — colheita                (hue 38)
  DRYING:      "#d8a230",  // âmbar — secagem                   (hue 75, = site)
  CURING:      "#c09040",  // dourado — cura                    (hue 65)
  MAINTENANCE: "#5c7de0",  // índigo-azul — manutenção/mães     (hue 245, = site)
  CLONING:     "#72db4a",  // lime — clonagem (= SEEDLING)      (hue 130)
} as const satisfies Record<Phase, string>;

/** Labels em português para cada fase */
export const PHASE_LABELS: Record<Phase, string> = {
  SEEDLING:    "Muda",
  VEGA:        "Vegetativa",
  PRE_FLORA:   "Pré-flora",
  FLORA:       "Floração",
  FLUSHING:    "Flush",
  HARVEST:     "Colheita",
  DRYING:      "Secagem",
  CURING:      "Cura",
  MAINTENANCE: "Manutenção",
  CLONING:     "Clonagem",
} as const;

/**
 * Resolve a fase visível a partir de tent.category + cycle.floraStartDate.
 * Usado onde o backend não retorna um campo `phase` resolvido.
 */
export function resolvePhase(
  tentCategory: string | null | undefined,
  floraStartDate: string | Date | null | undefined,
  hasCycle: boolean,
  preFloraStartDate?: string | Date | null | undefined,
): Phase {
  if (!hasCycle) return "VEGA";
  const cat = (tentCategory ?? "VEGA") as Phase;
  if (cat === "MAINTENANCE" || cat === "DRYING" || cat === "CURING" || cat === "CLONING") return cat;
  if (floraStartDate) return "FLORA";
  if (preFloraStartDate) return "PRE_FLORA";
  return "VEGA";
}

/**
 * Retorna o hex da fase.
 * Aceita string nullable/undefined — útil direto de dados do backend.
 * Fallback: VEGA (#40c057).
 */
export function phaseColor(phase: string | null | undefined): string {
  if (!phase) return PHASE_COLORS.VEGA;
  return PHASE_COLORS[phase as Phase] ?? PHASE_COLORS.VEGA;
}

/**
 * Variante com opacidade — útil para fundos/fills sutis.
 * @param phase  Chave da fase
 * @param alpha  0–1 (default 0.15)
 */
export function phaseColorAlpha(phase: string | null | undefined, alpha = 0.15): string {
  const hex = phaseColor(phase);
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return `${hex}${a.toString(16).padStart(2, "0")}`;
}
