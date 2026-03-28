import { Minus, Plus } from "lucide-react";
import { useRef, useCallback } from "react";
import { useTactileFeedback } from "@/hooks/useTactileFeedback";

interface BigStepperProps {
  value: string;
  onChange: (value: string) => void;
  step: number;
  min?: number;
  max?: number;
  decimals?: number;
  unit?: string;
  placeholder?: string;
  colorClass?: string;
}

// Curva de aceleração ao segurar: [delay_inicial_ms, [após_ms, intervalo_ms, multiplicador], ...]
const ACCELERATION: [number, number, number][] = [
  [0,    300, 1],   // 0–0.6s: velocidade normal
  [600,  200, 2],   // 0.6–1.2s: 2× mais rápido
  [1200, 120, 4],   // 1.2–2s: 4×
  [2000,  70, 8],   // 2s+: 8× (muito rápido)
];

export function BigStepper({
  value, onChange, step, min, max, decimals = 0, unit, placeholder, colorClass,
}: BigStepperProps) {
  const haptic = useTactileFeedback();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldSinceRef = useRef<number>(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const applyStep = useCallback((multiplier: number, dir: 1 | -1) => {
    haptic.tap();
    const current = parseFloat(valueRef.current) || 0;
    const delta = step * multiplier * dir;
    const next = parseFloat((current + delta).toFixed(decimals + 1));
    if (dir === 1 && max !== undefined && next > max) return;
    if (dir === -1 && min !== undefined && next < min) return;
    onChange(String(parseFloat(next.toFixed(decimals))));
  }, [step, min, max, decimals, onChange, haptic]);

  const startHold = useCallback((dir: 1 | -1) => {
    // Primeiro clique imediato
    applyStep(1, dir);
    heldSinceRef.current = Date.now();

    let phaseIdx = 0;

    const scheduleNext = () => {
      const elapsed = Date.now() - heldSinceRef.current;

      // Avançar de fase conforme tempo segurado
      while (
        phaseIdx < ACCELERATION.length - 1 &&
        elapsed >= ACCELERATION[phaseIdx + 1][0]
      ) {
        phaseIdx++;
      }

      const [, intervalMs, multiplier] = ACCELERATION[phaseIdx];

      intervalRef.current = setInterval(() => {
        applyStep(multiplier, dir);

        // Verificar se precisa mudar de fase
        const el = Date.now() - heldSinceRef.current;
        const nextPhaseIdx = ACCELERATION.findIndex((_, i) =>
          i < ACCELERATION.length - 1 &&
          el >= ACCELERATION[i + 1][0] &&
          i >= phaseIdx
        );
        if (nextPhaseIdx !== -1 && nextPhaseIdx > phaseIdx) {
          clearInterval(intervalRef.current!);
          phaseIdx = nextPhaseIdx + phaseIdx; // avança fase
          scheduleNext();
        }
      }, intervalMs);
    };

    // Pequeno delay antes de começar o hold
    timeoutRef.current = setTimeout(scheduleNext, 350);
  }, [applyStep]);

  const stopHold = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }, []);

  const btnClass =
    "flex-1 min-h-[64px] rounded-2xl border-2 border-border bg-muted/40 flex items-center justify-center active:scale-95 active:bg-muted/70 transition-transform touch-manipulation select-none";

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {/* Valor + unidade */}
      <div className="flex flex-col items-center gap-0.5 w-full">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const v = e.target.value.replace(",", ".");
            if (v === "" || v === "-" || /^-?\d*\.?\d*$/.test(v)) onChange(v);
          }}
          placeholder={placeholder ?? "0"}
          className={`w-full text-center text-6xl font-black bg-transparent border-none outline-none leading-tight ${colorClass ?? "text-foreground"}`}
        />
        {unit && (
          <span className="text-base text-muted-foreground font-semibold tracking-wide">
            {unit}
          </span>
        )}
      </div>

      {/* Botões [−] [+] abaixo */}
      <div className="flex gap-3 w-full">
        <button
          type="button"
          className={btnClass}
          onPointerDown={() => startHold(-1)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Minus className="w-8 h-8 text-foreground" />
        </button>
        <button
          type="button"
          className={btnClass}
          onPointerDown={() => startHold(1)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Plus className="w-8 h-8 text-foreground" />
        </button>
      </div>
    </div>
  );
}
