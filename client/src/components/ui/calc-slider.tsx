interface CalcSliderProps {
  label: string;
  value: number;
  setValue: (n: number) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
  accent: string; // CSS color: hex, oklch, or var(--token)
}

export function CalcSlider({ label, value, setValue, min, max, step, suffix, accent }: CalcSliderProps) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const display = step >= 1 ? value.toFixed(0) : step >= 0.1 ? value.toFixed(1) : value.toFixed(2);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="mono text-sm">
          <span className="font-semibold" style={{ color: accent }}>{display}</span>{" "}
          <span className="text-muted-foreground">{suffix}</span>
        </span>
      </div>
      <div className="relative h-2 rounded-full" style={{ background: "var(--color-bg-elevated, hsl(var(--muted)))" }}>
        {/* fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full pointer-events-none"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, transparent, ${accent})` }}
        />
        {/* native range — invisible, on top */}
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setValue(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        {/* thumb */}
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          style={{
            left: `${pct}%`,
            background: accent,
            boxShadow: `0 0 0 4px color-mix(in oklch, ${accent} 25%, transparent), 0 0 12px ${accent}`,
          }}
        />
      </div>
    </div>
  );
}
