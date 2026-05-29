/* eslint-disable react-refresh/only-export-components */
/**
 * PhaseBadge — badge semântico por fase do ciclo
 * Usa hex hardcoded de phaseColors.ts (CSS vars falham em SVG/canvas)
 *
 * Variante "solid"  (padrão) → dot colorido + fundo suave + borda
 * Variante "subtle"          → só texto e dot, sem fundo — para listas densas
 * Variante "pill"            → fully rounded, compacto, sem dot — para timelines
 */

import { type Phase, phaseColor } from "@/lib/phaseColors";

interface PhaseBadgeProps {
  phase: Phase;
  week?: number | null;
  day?: number | null;
  variant?: "solid" | "subtle" | "pill";
  size?: "sm" | "md";
  className?: string;
}

const PHASE_LABELS: Record<Phase, string> = {
  SEEDLING:    "Muda",
  VEGA:        "Vegetativa",
  FLORA:       "Floração",
  FLUSHING:    "Flush",
  HARVEST:     "Colheita",
  DRYING:      "Secagem",
  CURING:      "Cura",
  MAINTENANCE: "Manutenção",
  CLONING:     "Clonagem",
};

export function PhaseBadge({
  phase,
  week,
  day,
  variant = "solid",
  size = "md",
  className = "",
}: PhaseBadgeProps) {
  const label = PHASE_LABELS[phase] ?? PHASE_LABELS["VEGA"];
  const color = phaseColor(phase);

  const suffix =
    week != null
      ? ` · S${week}`
      : day != null
      ? ` · D${day}`
      : "";

  if (variant === "subtle") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${className}`}
        style={{ color }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: color }}
        />
        {label}
        {suffix && (
          <span className="font-mono opacity-70" style={{ fontSize: 10 }}>
            {suffix}
          </span>
        )}
      </span>
    );
  }

  if (variant === "pill") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${className}`}
        style={{
          background: `color-mix(in oklch, ${color} 15%, transparent)`,
          color,
        }}
      >
        {label}
        {suffix && <span className="font-mono opacity-80">{suffix}</span>}
      </span>
    );
  }

  // solid (default)
  const textSize = size === "sm" ? "text-xs" : "text-xs";
  const padding  = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${textSize} ${padding} ${className}`}
      style={{
        background: `color-mix(in oklch, ${color} 14%, transparent)`,
        borderColor: `color-mix(in oklch, ${color} 30%, transparent)`,
        color: `color-mix(in oklch, ${color} 90%, black 10%)`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: color }}
      />
      {label}
      {suffix && (
        <span className="font-mono opacity-75" style={{ fontSize: size === "sm" ? 9 : 10 }}>
          {suffix}
        </span>
      )}
    </span>
  );
}

/** Helper: mapeia categoria de estufa → phase de badge */
export function tentCategoryToPhase(category: string | null | undefined): Phase {
  const map: Record<string, Phase> = {
    FLORA:       "FLORA",
    VEGA:        "VEGA",
    CLONING:     "CLONING",
    MAINTENANCE: "MAINTENANCE",
    DRYING:      "DRYING",
  };
  return map[category ?? ""] ?? "VEGA";
}
