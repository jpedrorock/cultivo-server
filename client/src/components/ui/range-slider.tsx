import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

interface RangeSliderProps {
  id?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  /** Gradient CSS string for the track, e.g. "linear-gradient(...)" */
  trackGradient?: string;
  /** Color of the filled portion before the thumb */
  fillColor?: string;
  /** Show floating tooltip above thumb */
  showTooltip?: boolean;
  /** Format the tooltip value */
  formatTooltip?: (value: number) => string;
  /** Labels below the track */
  labels?: { position: number; label: string; sublabel?: string; color?: string; icon?: string }[];
  className?: string;
  disabled?: boolean;
  /** "md" = default, "lg" = larger track + thumb for touch-first UIs */
  size?: "md" | "lg";
}

export function RangeSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  trackGradient,
  fillColor = "hsl(var(--primary))",
  showTooltip = true,
  formatTooltip,
  labels,
  className,
  disabled,
  size = "md",
}: RangeSliderProps) {
  const isLg = size === "lg";
  const _progress = ((value - min) / (max - min)) * 100;
  const tooltipLabel = formatTooltip ? formatTooltip(value) : String(value);

  const trackH = isLg ? "h-[20px]" : "h-[6px]";
  const thumbSize = isLg ? "w-16 h-16" : "w-[28px] h-[28px]";

  return (
    <div className={cn("relative w-full select-none", className)}>
      <SliderPrimitive.Root
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        disabled={disabled}
        className="relative flex items-center w-full touch-none"
        style={{ paddingTop: isLg ? 32 : 16, paddingBottom: isLg ? 32 : 16 }}
      >
        {/* Track */}
        <SliderPrimitive.Track
          className={cn("relative w-full grow overflow-hidden rounded-full", trackH)}
          style={{ background: trackGradient || "var(--color-muted)" }}
        >
          {/* Range fill — only shown when no gradient */}
          <SliderPrimitive.Range
            className="absolute h-full rounded-full"
            style={trackGradient
              ? { background: "transparent" }
              : { background: fillColor }
            }
          />

        </SliderPrimitive.Track>

        {/* Thumb */}
        <SliderPrimitive.Thumb
          className={cn(
            "block rounded-full bg-white border-[3px] border-white/90",
            "shadow-[0_3px_16px_rgba(0,0,0,0.32),0_0_0_5px_rgba(255,255,255,0.18)]",
            "transition-transform duration-150 cursor-grab active:cursor-grabbing active:scale-105",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
            "disabled:pointer-events-none disabled:opacity-50",
            thumbSize
          )}
        >
          {/* Floating tooltip */}
          {showTooltip && (
            <div
              className={cn(
                "absolute left-1/2 -translate-x-1/2 pointer-events-none",
                "bg-foreground text-background font-bold rounded-lg shadow-lg whitespace-nowrap",
                isLg ? "text-sm px-2.5 py-1" : "text-xs px-2 py-0.5",
              )}
              style={{ bottom: isLg ? "calc(100% + 14px)" : "calc(100% + 8px)" }}
            >
              {tooltipLabel}
              <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-foreground" />
            </div>
          )}
        </SliderPrimitive.Thumb>
      </SliderPrimitive.Root>

      {/* Labels */}
      {labels && labels.length > 0 && (
        <div className="relative mt-1" style={{ height: "3.5rem" }}>
          {labels.map((lbl, i) => (
            <div
              key={i}
              className="absolute flex flex-col items-center gap-0.5 text-xs"
              style={{
                left: `${lbl.position}%`,
                transform: "translateX(-50%)",
                color: lbl.color,
                whiteSpace: "nowrap",
              }}
            >
              {lbl.icon && <span className="text-base leading-none">{lbl.icon}</span>}
              <span className="font-semibold leading-none">{lbl.label}</span>
              {lbl.sublabel && (
                <span className="leading-none opacity-75 text-xs">{lbl.sublabel}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
