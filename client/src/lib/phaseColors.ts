/**
 * phaseColors.ts — Hex canônicos das fases de cultivo
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
 * Fonte: valores dark-mode de index.css (versão vibrante pra fundo escuro).
 * Manter em sincronia com --phase-* no .dark block de index.css.
 */

/** Fase do ciclo de cultivo (espelha o enum backend + PhaseBadge) */
export type Phase =
  | "SEEDLING"
  | "VEGA"
  | "FLORA"
  | "FLUSHING"
  | "HARVEST"
  | "DRYING"
  | "CURING"
  | "MAINTENANCE"
  | "CLONING";

/** Hex canônicos — extraídos de .dark { --phase-* } em index.css */
export const PHASE_COLORS = {
  SEEDLING:    "#8ec58c",  // --phase-seedling    (verde claro — muda)
  VEGA:        "#40c057",  // --phase-vegetative  (verde médio — veg)
  FLORA:       "#be4bdb",  // --phase-flowering   (violeta — floração)
  FLUSHING:    "#20c997",  // --phase-flushing    (teal — flush)
  HARVEST:     "#fd7c36",  // --phase-harvest     (laranja — colheita)
  DRYING:      "#e0a32e",  // --phase-drying      (âmbar — secagem)
  CURING:      "#b07e3a",  // --phase-curing      (mogno — cura)
  MAINTENANCE: "#93c5fd",  // --phase-maintenance (azul claro — manutenção)
  CLONING:     "#8ec58c",  // → mesmo que SEEDLING (clones são mudas)
} as const satisfies Record<Phase, string>;

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
 * Variante com opacidade — útil para fondos/fills sutis.
 * @param phase  Chave da fase
 * @param alpha  0–1 (default 0.15)
 */
export function phaseColorAlpha(phase: string | null | undefined, alpha = 0.15): string {
  const hex = phaseColor(phase);
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return `${hex}${a.toString(16).padStart(2, "0")}`;
}
