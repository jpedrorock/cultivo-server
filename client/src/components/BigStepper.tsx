import {
  Minus, Plus,
  Thermometer, Droplets, GlassWater, Waves, FlaskConical, Sun,
} from "lucide-react";
import { useRef, useCallback, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { useTactileFeedback } from "@/hooks/useTactileFeedback";

export type FieldType =
  | "temperature"
  | "humidity"
  | "water"
  | "runoff"
  | "ph"
  | "light"
  | "default";

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
  fieldType?: FieldType;
  fillMax?: number;
}

// ── Curva de aceleração ────────────────────────────────────────────────────────
const ACCELERATION: [number, number, number][] = [
  [0,    300,  1],
  [700,  200,  3],
  [1400, 130,  6],
  [2200, 150, 10],
];

// ── Cor do ícone de temperatura ───────────────────────────────────────────────
function tempColor(v: number): string {
  if (v < 14)  return "#60a5fa"; // azul gelado
  if (v < 20)  return "#34d399"; // verde fresco
  if (v <= 26) return "#4ade80"; // verde ideal
  if (v <= 30) return "#fbbf24"; // âmbar quente
  return              "#f87171"; // vermelho quente
}

// ── Cor do ícone de umidade ────────────────────────────────────────────────────
function humColor(v: number): string {
  // do cinza seco para azul saturado
  const t = Math.min(1, v / 100);
  const r = Math.round(156 - t * 97);  // 156 → 59
  const g = Math.round(163 - t * 93);  // 163 → 130  (mantém um pouco de verde)
  const b = Math.round(175 + t * 46);  // 175 → 221
  return `rgb(${r},${g},${b})`;
}

// ── Cor do ícone de pH ─────────────────────────────────────────────────────────
function phColor(v: number): string {
  if (v < 3)    return "#ef4444";
  if (v < 5)    return "#f97316";
  if (v < 6.2)  return "#eab308";
  if (v <= 7.5) return "#22c55e";
  if (v <= 9)   return "#14b8a6";
  if (v <= 11)  return "#3b82f6";
  return               "#a855f7";
}

// ── Ícone dinâmico ─────────────────────────────────────────────────────────────
function FieldIcon({
  fieldType, numVal, fillMax, max = 1200,
}: {
  fieldType: FieldType;
  numVal: number;
  fillMax?: number;
  max?: number;
}) {
  const size = "w-14 h-14";

  if (fieldType === "temperature") {
    return (
      <motion.div animate={{ color: tempColor(numVal) }} transition={{ duration: 0.5 }}>
        <Thermometer className={size} strokeWidth={1.5} />
      </motion.div>
    );
  }

  if (fieldType === "humidity") {
    return (
      <motion.div animate={{ color: humColor(numVal) }} transition={{ duration: 0.5 }}>
        <Droplets className={size} strokeWidth={1.5} />
      </motion.div>
    );
  }

  if (fieldType === "water" || fieldType === "runoff") {
    const Icon = fieldType === "water" ? GlassWater : Waves;
    const fillPct = fillMax ? Math.min(100, (numVal / fillMax) * 100) : 0;
    return (
      <div className={`relative ${size}`}>
        {/* Base cinza (vazio) */}
        <Icon className={`absolute inset-0 ${size} text-muted-foreground/25`} strokeWidth={1.5} />
        {/* Preenchimento azul subindo de baixo */}
        <motion.div
          className="absolute inset-0 overflow-hidden"
          animate={{ clipPath: `inset(${100 - fillPct}% 0 0 0)` }}
          transition={{ type: "spring", stiffness: 55, damping: 14 }}
        >
          <Icon className={`${size} text-blue-400`} strokeWidth={1.5} />
        </motion.div>
      </div>
    );
  }

  if (fieldType === "ph") {
    return (
      <motion.div animate={{ color: phColor(numVal) }} transition={{ duration: 0.4 }}>
        <FlaskConical className={size} strokeWidth={1.5} />
      </motion.div>
    );
  }

  if (fieldType === "light") {
    const t = Math.min(1, numVal / max);
    const glow = t * 28; // px de blur no drop-shadow
    return (
      <motion.div
        animate={{ color: `hsl(${45 - t * 10}, ${60 + t * 40}%, ${55 + t * 15}%)` }}
        style={{ filter: `drop-shadow(0 0 ${glow.toFixed(0)}px rgba(255,200,50,${(t * 0.8).toFixed(2)}))` }}
        transition={{ duration: 0.5 }}
      >
        <Sun className={size} strokeWidth={1.5} />
      </motion.div>
    );
  }

  return null;
}

// ── Componente principal ───────────────────────────────────────────────────────
export function BigStepper({
  value, onChange, step, min, max, decimals = 0,
  unit, placeholder, colorClass,
  fieldType = "default", fillMax,
}: BigStepperProps) {
  const haptic       = useTactileFeedback();
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef   = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const heldSinceRef = useRef<number>(0);
  const valueRef     = useRef(value);
  valueRef.current   = value;

  const numControls = useAnimationControls();
  const numVal = parseFloat(value) || 0;

  const applyStep = useCallback((multiplier: number, dir: 1 | -1) => {
    haptic.tap();
    const current = parseFloat(valueRef.current) || 0;
    const delta   = step * multiplier * dir;
    const next    = parseFloat((current + delta).toFixed(decimals + 1));
    if (dir ===  1 && max !== undefined && next > max) return;
    if (dir === -1 && min !== undefined && next < min) return;
    onChange(String(parseFloat(next.toFixed(decimals))));
    numControls.start({
      scale: [1, 1.07, 1.02, 1],
      transition: {
        duration: 0.38,
        ease: [0.34, 1.56, 0.64, 1],
        times: [0, 0.35, 0.65, 1],
      },
    });
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

      {/* Ícone dinâmico */}
      {fieldType !== "default" && (
        <FieldIcon fieldType={fieldType} numVal={numVal} fillMax={fillMax} max={max} />
      )}

      {/* Número */}
      <div className="w-full flex flex-col items-center" style={{ minHeight: "5rem" }}>
        <motion.input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const v = e.target.value.replace(",", ".");
            if (v === "" || v === "-" || /^-?\d*\.?\d*$/.test(v)) onChange(v);
          }}
          placeholder={placeholder ?? "0"}
          className={`w-full text-center text-6xl font-black bg-transparent border-none outline-none leading-tight ${
            colorClass ?? "text-foreground"
          }`}
          animate={numControls}
          style={{ originX: "50%", originY: "50%", display: "block" }}
        />
        {unit && (
          <span className="text-base text-muted-foreground font-semibold tracking-wide mt-0.5">
            {unit}
          </span>
        )}
      </div>

      {/* Botões */}
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

// ── Botão com press físico ────────────────────────────────────────────────────
function StepButton({
  dir, onStart, onStop, children,
}: {
  dir: 1 | -1;
  onStart: () => void;
  onStop: () => void;
  children: React.ReactNode;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <motion.button
      type="button"
      className="flex-1 min-h-[68px] rounded-2xl border-2 border-border flex items-center justify-center touch-manipulation select-none"
      style={{
        background: pressed
          ? dir === 1 ? "rgba(99,102,241,0.18)" : "rgba(239,68,68,0.13)"
          : "rgba(128,128,128,0.06)",
        borderColor: pressed
          ? dir === 1 ? "rgba(99,102,241,0.55)" : "rgba(239,68,68,0.45)"
          : undefined,
        color: pressed
          ? dir === 1 ? "rgb(129,140,248)" : "rgb(248,113,113)"
          : undefined,
        transition: "background 0.12s, border-color 0.12s, color 0.12s",
      }}
      animate={pressed ? { scale: 0.88 } : { scale: 1 }}
      transition={{ type: "spring", stiffness: 700, damping: 32 }}
      onPointerDown={() => { setPressed(true);  onStart(); }}
      onPointerUp={() =>   { setPressed(false); onStop();  }}
      onPointerLeave={() =>{ setPressed(false); onStop();  }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </motion.button>
  );
}
