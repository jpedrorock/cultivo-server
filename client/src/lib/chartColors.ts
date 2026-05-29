/**
 * chartColors.ts — utilitários de cor para recharts/canvas
 *
 * Recharts renderiza via SVG e não herda CSS vars automaticamente.
 * Use estas funções para resolver tokens do design system em tempo de
 * execução e passá-los como strings hex/rgb ao recharts.
 */

/**
 * Resolve um CSS custom property no elemento raiz e retorna o valor.
 * Fallback: "#888" para não quebrar em SSR/node.
 *
 * @example
 *   const axisColor = resolveChartToken("--muted-foreground");
 *   // uso: tick={{ fill: axisColor, fontSize: 11 }}
 */
export function resolveChartToken(token: string): string {
  if (typeof window === "undefined") return "#888";
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  return value || "#888";
}

/** Pré-computados para uso imediato no render (sem useState/useEffect).
 *  Como o tema muda raramente, calcular no render é OK.
 *  Para temas dinâmicos, chame dentro de useMemo() com deps no tema. */
export const CHART_AXIS_COLOR   = () => resolveChartToken("--muted-foreground");
export const CHART_GRID_COLOR   = () => resolveChartToken("--border");
export const CHART_TARGET_FILL  = "rgba(64, 192, 87, 0.10)";   // verde suave (VEGA color @ 10%)
export const CHART_TARGET_STROKE = "rgba(64, 192, 87, 0.30)";  // verde suave @ 30%
