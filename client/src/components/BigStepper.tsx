import { Minus, Plus } from "lucide-react";
import { useRef, useCallback, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
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

// Curva de aceleração: [após_ms_segurado, intervalo_ms, multiplicador]
const ACCELERATION: [number, number, number][] = [
  [0,    300, 1],
  [600,  200, 2],
  [1200, 120, 4],
  [2000,  70, 8],
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

  const numControls = useAnimationControls();

  const applyStep = useCallback((multiplier: number, dir: 1 | -1) => {
    haptic.tap();
    const current = parseFloat(valueRef.current) || 0;
    const delta = step * multiplier * dir;
    const next = parseFloat((current + delta).toFixed(decimals + 1));
    if (dir === 1  && max !== undefined && next > max) return;
    if (dir === -1 && min !== undefined && next < min) return;
    onChange(String(parseFloat(next.toFixed(decimals))));
    numControls.start({ scale: [1, 1.12, 1], transition: { duration: 0.16, ease: "easeOut", times: [0, 0.35, 1] } });
  }, [step, min, max, decimals, onChange, haptic, numControls]);

  const startHold = useCallback((dir: 1 | -1) => {
    applyStep(1, dir);
    heldSinceRef.current = Date.now();
    let phaseIdx = 0;

    const scheduleNext = () => {
      const [, intervalMs, multiplier] = ACCELERATION[phaseIdx];
      intervalRef.current = setInterval(() => {
        applyStep(multiplier, dir);
        const elapsed = Date.now() - heldSinceRef.current;
        if (
          phaseIdx < ACCELERATION.length - 1 &&
          elapsed >= ACCELERATION[phaseIdx + 1][0]
        ) {
          clearInterval(intervalRef.current!);
          phaseIdx++;
          scheduleNext();
        }
      }, intervalMs);
    };

    timeoutRef.current = setTimeout(scheduleNext, 350);
  }, [applyStep]);

  const stopHold = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (timeoutRef.current)  { clearTimeout(timeoutRef.current);   timeoutRef.current  = null; }
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 w-full">

      {/* Número animado */}
      <div className="relative w-full flex flex-col items-center" style={{ minHeight: "5rem" }}>
        <motion.input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const v = e.target.value.replace(",", ".");
            if (v === "" || v === "-" || /^-?\d*\.?\d*$/.test(v)) onChange(v);
          }}
          placeholder={placeholder ?? "0"}
          className={`w-full text-center text-6xl font-black bg-transparent border-none outline-none leading-tight ${colorClass ?? "text-foreground"}`}
          animate={numControls}
          style={{ originX: "50%", originY: "50%", display: "block" }}
        />
        {unit && (
          <span className="text-base text-muted-foreground font-semibold tracking-wide mt-0.5">
            {unit}
          </span>
        )}
      </div>

      {/* Botões [−] [+] */}
      <div className="flex gap-3 w-full">
        <StepButton dir={-1} onStart={() => startHold(-1)} onStop={stopHold}>
          <Minus className="w-8 h-8" />
        </StepButton>
        <StepButton dir={1} onStart={() => startHold(1)} onStop={stopHold}>
          <Plus className="w-8 h-8" />
        </StepButton>
      </div>

    </div>
  );
}

// ── Botão com animação de pressão ──────────────────────────────
function StepButton({
  dir, onStart, onStop, children,
}: {
  dir: 1 | -1;
  onStart: () => void;
  onStop: () => void;
  children: React.ReactNode;
}) {
  const [pressed, setPressed] = useState(false);

  const handleDown = () => {
    setPressed(true);
    onStart();
  };
  const handleUp = () => {
    setPressed(false);
    onStop();
  };

  return (
    <motion.button
      type="button"
      className="flex-1 min-h-[68px] rounded-2xl border-2 border-border flex items-center justify-center touch-manipulation select-none overflow-hidden relative"
      style={{
        background: pressed
          ? dir === 1 ? "rgba(99,102,241,0.18)" : "rgba(239,68,68,0.13)"
          : "rgba(128,128,128,0.08)",
        borderColor: pressed
          ? dir === 1 ? "rgba(99,102,241,0.5)" : "rgba(239,68,68,0.4)"
          : undefined,
        color: pressed
          ? dir === 1 ? "rgb(129,140,248)" : "rgb(248,113,113)"
          : undefined,
      }}
      animate={pressed ? { scale: 0.90 } : { scale: 1 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerLeave={handleUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </motion.button>
  );
}
