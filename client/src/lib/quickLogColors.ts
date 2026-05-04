/**
 * Helpers de cor para o círculo dinâmico do QuickLog.
 *
 * Cada step do wizard tem um gradiente baseado no valor digitado
 * (temperatura, RH, pH, PPFD…) — frio → quente, ácido → básico, etc.
 *
 * Funções puras, testáveis isoladamente, sem dependência de React.
 */

import type { CSSProperties } from "react";

type RGB = [number, number, number];

/** Converte "#abcdef" → [r, g, b]. Não valida — espera 7 chars sempre. */
export function hexToRgb(hex: string): RGB {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** Interpola linearmente entre dois RGBs em t ∈ [0,1] e retorna `rgb(...)`. */
export function lerpRgb(a: RGB, b: RGB, t: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

/**
 * Pega a cor em `v` interpolando entre paradas `[valor, hex]` ordenadas.
 * Fora dos extremos, retorna a cor da ponta mais próxima.
 */
export function colorAtStops(v: number, stops: ReadonlyArray<[number, string]>): string {
  if (v <= stops[0][0]) return lerpRgb(hexToRgb(stops[0][1]), hexToRgb(stops[0][1]), 0);
  const last = stops[stops.length - 1];
  if (v >= last[0]) return lerpRgb(hexToRgb(last[1]), hexToRgb(last[1]), 0);
  for (let i = 0; i < stops.length - 1; i++) {
    const [v0, c0] = stops[i];
    const [v1, c1] = stops[i + 1];
    if (v >= v0 && v <= v1) return lerpRgb(hexToRgb(c0), hexToRgb(c1), (v - v0) / (v1 - v0));
  }
  return lerpRgb(hexToRgb(stops[0][1]), hexToRgb(stops[0][1]), 0);
}

/** Escurece um `rgb(r,g,b)` subtraindo `amt` de cada canal (clamp em 0). */
export function darkenRgb(rgb: string, amt = 28): string {
  const m = rgb.match(/\d+/g)!;
  return `rgb(${Math.max(0, +m[0] - amt)},${Math.max(0, +m[1] - amt)},${Math.max(0, +m[2] - amt)})`;
}

// ── Gradientes específicos por step ──────────────────────────────────────────

/**
 * Retorna o `linear-gradient(...)` do círculo central do QuickLog,
 * baseado no step atual e nos valores digitados pelo usuário.
 *
 * Steps com fill animado (água, runoff) recebem cor sólida — o "fill"
 * em si é tratado por outro elemento na JSX.
 */
export function getDynamicCircleGradient(args: {
  step: number;
  tempC: string;
  rhPct: string;
  ph: string;
  ppfd: number;
}): string {
  const { step, tempC, rhPct, ph, ppfd } = args;
  switch (step) {
    case 1: {
      // Temperatura — frio → quente
      const c = colorAtStops(parseFloat(tempC) || 20, [
        [10, "#60a5fa"],
        [17, "#34d399"],
        [22, "#4ade80"],
        [28, "#fbbf24"],
        [36, "#f87171"],
      ]);
      return `linear-gradient(135deg, ${c}, ${darkenRgb(c)})`;
    }
    case 2: {
      // Umidade — cinza seco → azul saturado
      const c = colorAtStops(parseFloat(rhPct) || 50, [
        [0, "#94a3b8"],
        [40, "#93c5fd"],
        [65, "#60a5fa"],
        [100, "#3b82f6"],
      ]);
      return `linear-gradient(135deg, ${c}, ${darkenRgb(c)})`;
    }
    case 3:
      // Volume de água — azul fixo (fill é animado em outro elemento)
      return "linear-gradient(135deg, #60a5fa, #2563eb)";
    case 4:
      // Runoff — teal fixo
      return "linear-gradient(135deg, #2dd4bf, #0d9488)";
    case 5: {
      // pH — espectro contínuo ácido → neutro → básico
      const c = colorAtStops(parseFloat(ph) || 6.5, [
        [0, "#ef4444"],
        [4, "#f97316"],
        [6, "#eab308"],
        [6.8, "#22c55e"],
        [8, "#14b8a6"],
        [10, "#3b82f6"],
        [14, "#a855f7"],
      ]);
      return `linear-gradient(135deg, ${c}, ${darkenRgb(c)})`;
    }
    case 6:
      // EC — âmbar/laranja fixo
      return "linear-gradient(135deg, #fbbf24, #f97316)";
    case 7: {
      // PPFD — amarelo cada vez mais quente
      const c = colorAtStops(ppfd, [
        [0, "#fde68a"],
        [400, "#fbbf24"],
        [800, "#f59e0b"],
        [1200, "#f97316"],
      ]);
      return `linear-gradient(135deg, ${c}, ${darkenRgb(c, 20)})`;
    }
    case 0:
      return "linear-gradient(135deg, #60a5fa, #0891b2)";
    case 8:
      return "linear-gradient(135deg, #4ade80, #10b981)";
    default:
      return "linear-gradient(135deg, #4ade80, #10b981)";
  }
}

/**
 * Estilo completo do círculo. Inclui glow dinâmico para PPFD —
 * quanto mais luz, mais halo amarelo/laranja ao redor.
 */
export function getCircleStyle(args: {
  step: number;
  tempC: string;
  rhPct: string;
  ph: string;
  ppfd: number;
}): CSSProperties {
  const base = getDynamicCircleGradient(args);
  if (args.step === 7) {
    const ratio = Math.min(1, args.ppfd / 1200);
    const blur = Math.round(ratio * 48);
    const spread = Math.round(ratio * 20);
    const alpha = (ratio * 0.75).toFixed(2);
    return {
      background: base,
      boxShadow: `0 0 ${blur}px ${spread}px rgba(251,191,36,${alpha}), 0 0 ${Math.round(blur * 1.8)}px ${Math.round(spread * 1.5)}px rgba(249,115,22,${(ratio * 0.35).toFixed(2)})`,
    };
  }
  return { background: base };
}
