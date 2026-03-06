import { useRef, useCallback } from "react";
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
}

export function RangeSlider({
  id,
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
}: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Calculate progress percentage (0-100)
  const progress = ((value - min) / (max - min)) * 100;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseFloat(e.target.value));
    },
    [onChange]
  );

  const tooltipLabel = formatTooltip ? formatTooltip(value) : String(value);

  return (
    <div className={cn("relative w-full select-none", className)}>
      {/* Track container */}
      <div ref={trackRef} className="relative w-full">
        {/* Tooltip */}
        {showTooltip && (
          <div
            className="absolute -top-9 z-10 pointer-events-none transition-all duration-100"
            style={{
              left: `clamp(1.5rem, calc(${progress}% - 0px), calc(100% - 1.5rem))`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="bg-foreground text-background text-xs font-bold px-2 py-1 rounded-md shadow-lg whitespace-nowrap">
              {tooltipLabel}
              {/* Arrow */}
              <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-foreground" />
            </div>
          </div>
        )}

        {/* Custom track background */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none overflow-hidden"
          style={{ top: "50%", transform: "translateY(-50%)", height: "6px" }}
        >
          {/* Background track */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: trackGradient || "hsl(var(--muted))",
            }}
          />
          {/* Fill overlay (only if no custom gradient) */}
          {!trackGradient && (
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-100"
              style={{
                width: `${progress}%`,
                background: fillColor,
              }}
            />
          )}
          {/* Gradient fill mask — shows only the filled portion */}
          {trackGradient && (
            <div
              className="absolute inset-y-0 right-0 rounded-full transition-all duration-100"
              style={{
                width: `${100 - progress}%`,
                background: "hsl(var(--muted) / 0.7)",
              }}
            />
          )}
        </div>

        {/* Native input (invisible but interactive) */}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={handleChange}
          className={cn(
            "relative w-full appearance-none bg-transparent cursor-pointer",
            "py-4", // vertical padding for larger touch target
            // Webkit thumb
            "[&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:w-7",
            "[&::-webkit-slider-thumb]:h-7",
            "[&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:bg-white",
            "[&::-webkit-slider-thumb]:border-2",
            "[&::-webkit-slider-thumb]:border-white/80",
            "[&::-webkit-slider-thumb]:shadow-[0_2px_12px_rgba(0,0,0,0.25),0_0_0_3px_rgba(255,255,255,0.15)]",
            "[&::-webkit-slider-thumb]:transition-transform",
            "[&::-webkit-slider-thumb]:duration-150",
            "[&::-webkit-slider-thumb]:cursor-grab",
            "[&:active::-webkit-slider-thumb]:scale-110",
            "[&:active::-webkit-slider-thumb]:cursor-grabbing",
            "[&:active::-webkit-slider-thumb]:shadow-[0_4px_20px_rgba(0,0,0,0.35),0_0_0_5px_rgba(255,255,255,0.2)]",
            // Firefox thumb
            "[&::-moz-range-thumb]:w-7",
            "[&::-moz-range-thumb]:h-7",
            "[&::-moz-range-thumb]:rounded-full",
            "[&::-moz-range-thumb]:bg-white",
            "[&::-moz-range-thumb]:border-2",
            "[&::-moz-range-thumb]:border-white/80",
            "[&::-moz-range-thumb]:shadow-[0_2px_12px_rgba(0,0,0,0.25)]",
            "[&::-moz-range-thumb]:cursor-grab",
            "[&::-moz-range-thumb]:transition-transform",
            "[&::-moz-range-thumb]:duration-150",
            // Webkit track (hidden — we use our custom track)
            "[&::-webkit-slider-runnable-track]:appearance-none",
            "[&::-webkit-slider-runnable-track]:bg-transparent",
            "[&::-webkit-slider-runnable-track]:h-1.5",
            // Firefox track
            "[&::-moz-range-track]:bg-transparent",
            "[&::-moz-range-track]:h-1.5",
            disabled && "opacity-50 cursor-not-allowed [&::-webkit-slider-thumb]:cursor-not-allowed"
          )}
        />
      </div>

      {/* Labels */}
      {labels && labels.length > 0 && (
        <div className="relative mt-2" style={{ height: "3.5rem" }}>
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
              {lbl.icon && (
                <span className="text-base leading-none">{lbl.icon}</span>
              )}
              <span className="font-semibold leading-none">{lbl.label}</span>
              {lbl.sublabel && (
                <span className="leading-none opacity-75 text-[10px]">{lbl.sublabel}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
