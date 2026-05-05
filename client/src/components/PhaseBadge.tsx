/* eslint-disable react-refresh/only-export-components */
/**
 * PhaseBadge — badge semântico por fase do ciclo
 * Usa tokens CSS --phase-* definidos em index.css
 *
 * Variante "solid"  (padrão) → dot colorido + fundo suave + borda
 * Variante "subtle"          → só texto e dot, sem fundo — para listas densas
 * Variante "pill"            → fully rounded, compacto, sem dot — para timelines
 */

type Phase =
  | "SEEDLING"
  | "VEGA"
  | "FLORA"
  | "FLUSHING"
  | "HARVEST"
  | "DRYING"
  | "CURING"
  | "MAINTENANCE"
  | "CLONING";

interface PhaseBadgeProps {
  phase: Phase;
  week?: number | null;
  day?: number | null;
  variant?: "solid" | "subtle" | "pill";
  size?: "sm" | "md";
  className?: string;
}

const PHASE_CONFIG: Record<Phase, { label: string; cssVar: string }> = {
  SEEDLING:    { label: "Muda",        cssVar: "--phase-seedling"    },
  VEGA:        { label: "Vegetativa",  cssVar: "--phase-vegetative"  },
  FLORA:       { label: "Floração",    cssVar: "--phase-flowering"   },
  FLUSHING:    { label: "Flush",       cssVar: "--phase-flushing"    },
  HARVEST:     { label: "Colheita",    cssVar: "--phase-harvest"     },
  DRYING:      { label: "Secagem",     cssVar: "--phase-drying"      },
  CURING:      { label: "Cura",        cssVar: "--phase-curing"      },
  MAINTENANCE: { label: "Manutenção",  cssVar: "--phase-maintenance" },
  CLONING:     { label: "Clonagem",    cssVar: "--phase-seedling"    },
};

export function PhaseBadge({
  phase,
  week,
  day,
  variant = "solid",
  size = "md",
  className = "",
}: PhaseBadgeProps) {
  const config = PHASE_CONFIG[phase] ?? PHASE_CONFIG["VEGA"];
  const color = `var(${config.cssVar})`;

  const suffix =
    week != null
      ? ` · S${week}`
      : day != null
      ? ` · D${day}`
      : "";

  if (variant === "subtle") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${className}`}
        style={{ color }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: color }}
        />
        {config.label}
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
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${className}`}
        style={{
          background: `color-mix(in oklch, ${color} 15%, transparent)`,
          color,
        }}
      >
        {config.label}
        {suffix && <span className="font-mono opacity-80">{suffix}</span>}
      </span>
    );
  }

  // solid (default)
  const textSize = size === "sm" ? "text-[10px]" : "text-[11px]";
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
      {config.label}
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
