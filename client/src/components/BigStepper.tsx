import { Minus, Plus } from "lucide-react";
import { useTactileFeedback } from "@/hooks/useTactileFeedback";

interface BigStepperProps {
  value: string;
  onChange: (value: string) => void;
  step: number;
  min?: number;
  max?: number;
  decimals?: number; // how many decimal places to show/snap to
  unit?: string;
  placeholder?: string;
  colorClass?: string; // e.g. "text-green-500" for validation color
}

export function BigStepper({ value, onChange, step, min, max, decimals = 0, unit, placeholder, colorClass }: BigStepperProps) {
  const haptic = useTactileFeedback();

  const numVal = parseFloat(value) || 0;

  const increment = () => {
    haptic.tap();
    const next = parseFloat((numVal + step).toFixed(decimals + 1));
    if (max !== undefined && next > max) return;
    onChange(String(parseFloat(next.toFixed(decimals))));
  };

  const decrement = () => {
    haptic.tap();
    const next = parseFloat((numVal - step).toFixed(decimals + 1));
    if (min !== undefined && next < min) return;
    onChange(String(parseFloat(next.toFixed(decimals))));
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={decrement}
        className="min-h-[72px] min-w-[72px] rounded-2xl border-2 border-border bg-muted/40 flex items-center justify-center active:scale-95 transition-transform touch-manipulation"
      >
        <Minus className="w-7 h-7 text-foreground" />
      </button>

      <div className="flex-1 flex flex-col items-center gap-0.5">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const v = e.target.value.replace(",", ".");
            if (v === "" || v === "-" || /^-?\d*\.?\d*$/.test(v)) onChange(v);
          }}
          placeholder={placeholder ?? "0"}
          className={`w-full text-center text-5xl font-black bg-transparent border-none outline-none ${colorClass ?? "text-foreground"}`}
        />
        {unit && <span className="text-sm text-muted-foreground font-medium">{unit}</span>}
      </div>

      <button
        type="button"
        onClick={increment}
        className="min-h-[72px] min-w-[72px] rounded-2xl border-2 border-border bg-muted/40 flex items-center justify-center active:scale-95 transition-transform touch-manipulation"
      >
        <Plus className="w-7 h-7 text-foreground" />
      </button>
    </div>
  );
}
