/**
 * LivePill — pílula de status estilo "dashboard" portada do site (Features.astro).
 *
 * Renderiza: ( ● ) NN · LABEL  — com dot pulsante colorido.
 * Usada nos headers de telas de histórico/gráfico pra dar o ar técnico do site.
 *
 * Puro visual, zero lógica de dado. A cor vem de `color` (hex) ou `phase`.
 *
 * @example
 *   <LivePill count={14} label="REGISTROS" />
 *   <LivePill count={1} label="FLOWER" phase="FLORA" />
 *   <LivePill count={2} label="ATIVAS" color="#5cd65c" pulse />
 */
import { phaseColor } from "@/lib/phaseColors";

interface LivePillProps {
  /** Número exibido antes do separador (ex: 14). Opcional. */
  count?: number | string;
  /** Texto do rótulo (ex: "REGISTROS", "LIVE", "FLOWER"). */
  label: string;
  /** Cor do dot + label em hex. Tem precedência sobre `phase`. */
  color?: string;
  /** Fase pra derivar a cor via phaseColor() (se `color` não passado). */
  phase?: string | null;
  /** Anima o dot com pulso (default: true). */
  pulse?: boolean;
  className?: string;
}

export function LivePill({
  count,
  label,
  color,
  phase,
  pulse = true,
  className = "",
}: LivePillProps) {
  const accent = color ?? phaseColor(phase);

  return (
    <span
      className={`inline-flex items-center gap-2 font-mono text-xs tracking-wider px-3 py-1.5 rounded-full border border-border/60 bg-card ${className}`}
    >
      <span
        className={`w-[7px] h-[7px] rounded-full shrink-0 ${pulse ? "live-pill-dot" : ""}`}
        style={{ backgroundColor: accent, color: accent }}
      />
      {count != null && (
        <>
          <span className="font-semibold text-foreground">{count}</span>
          <span className="text-muted-foreground">·</span>
        </>
      )}
      <span className="font-medium" style={{ color: accent }}>
        {label}
      </span>
    </span>
  );
}
