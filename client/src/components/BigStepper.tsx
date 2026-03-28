import { Minus, Plus } from "lucide-react";
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
  /** Para o fill tank (water/runoff): valor máximo visual */
  fillMax?: number;
}

// ── Curva de aceleração: [após_ms_segurado, intervalo_ms, multiplicador] ──────
// step=0.1°C → 0.1 → 0.3 → 0.6 → 1.0°C por pulso
const ACCELERATION: [number, number, number][] = [
  [0,    300,  1],   // clique normal
  [700,  200,  3],   // 0.7s: velocidade média
  [1400, 130,  6],   // 1.4s: rápido
  [2200, 150, 10],   // 2.2s: 1°C por pulso (máx)
];

// ── Backgrounds visuais por tipo ───────────────────────────────────────────────
function getTempBg(v: number): string {
  if (v < 14)  return "rgba(59,130,246,0.14)";
  if (v < 20)  return "rgba(34,211,238,0.10)";
  if (v <= 26) return "rgba(34,197,94,0.12)";
  if (v <= 30) return "rgba(245,158,11,0.15)";
  return              "rgba(239,68,68,0.18)";
}

function getHumBg(v: number): string {
  const t = Math.min(1, v / 100);
  const opacity = (0.04 + t * 0.18).toFixed(2);
  return `rgba(59,130,246,${opacity})`;
}

function getPhBg(v: number): string {
  if (v < 3)   return "rgba(239,68,68,0.16)";
  if (v < 5)   return "rgba(249,115,22,0.15)";
  if (v < 6.2) return "rgba(234,179,8,0.14)";
  if (v <= 7.5)return "rgba(34,197,94,0.15)";
  if (v <= 9)  return "rgba(20,184,166,0.14)";
  if (v <= 11) return "rgba(59,130,246,0.15)";
  return              "rgba(147,51,234,0.16)";
}

function getLightBg(v: number, max: number): string {
  const t = Math.min(1, v / max);
  const opacity = (t * 0.22).toFixed(2);
  return `rgba(255,200,50,${opacity})`;
}

function getContainerBg(type: FieldType, v: number, max = 1200): string {
  switch (type) {
    case "temperature": return getTempBg(v);
    case "humidity":    return getHumBg(v);
    case "ph":          return getPhBg(v);
    case "light":       return getLightBg(v, max);
    default:            return "rgba(128,128,128,0.04)";
  }
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

  const numVal   = parseFloat(value) || 0;
  const isWater  = fieldType === "water" || fieldType === "runoff";
  const isLight  = fieldType === "light";
  const fillPct  = (isWater && fillMax)
    ? Math.min(100, (numVal / fillMax) * 100)
    : 0;

  const applyStep = useCallback((multiplier: number, dir: 1 | -1) => {
    haptic.tap();
    const current = parseFloat(valueRef.current) || 0;
    const delta   = step * multiplier * dir;
    const next    = parseFloat((current + delta).toFixed(decimals + 1));
    if (dir ===  1 && max !== undefined && next > max) return;
    if (dir === -1 && min !== undefined && next < min) return;
    onChange(String(parseFloat(next.toFixed(decimals))));
    // pop com back-easing: cresce e vai um pouco além, depois settle
    numControls.start({
      scale: [1, 1.07, 1.02, 1],
      transition: {
        duration: 0.38,
        ease: [0.34, 1.56, 0.64, 1], // cubic-bezier com overshoot suave
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

  const containerBg = getContainerBg(fieldType, numVal, max ?? 1200);

  return (
    <motion.div
      className="relative flex flex-col items-center gap-4 w-full rounded-3xl p-5 overflow-hidden"
      animate={{ backgroundColor: containerBg }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {/* ── Fill tank (water / runoff) ── */}
      {isWater && fillMax && (
        <motion.div
          className="absolute bottom-0 left-0 right-0 pointer-events-none rounded-b-3xl"
          style={{
            background:
              "linear-gradient(to top, rgba(59,130,246,0.28) 0%, rgba(147,197,253,0.10) 100%)",
          }}
          animate={{ height: `${fillPct}%` }}
          transition={{ type: "spring", stiffness: 55, damping: 14 }}
        />
      )}

      {/* ── Light radial glow ── */}
      {isLight && (
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-3xl"
          animate={{
            background: `radial-gradient(ellipse 80% 70% at 50% 45%, rgba(255,210,50,${
              (Math.min(1, numVal / (max ?? 1200)) * 0.32).toFixed(2)
            }) 0%, transparent 75%)`,
          }}
          transition={{ duration: 0.6 }}
        />
      )}

      {/* ── Número animado ── */}
      <div className="relative z-10 w-full flex flex-col items-center" style={{ minHeight: "5rem" }}>
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

      {/* ── Botões ── */}
      <div className="relative z-10 flex gap-3 w-full">
        <StepButton dir={-1} onStart={() => startHold(-1)} onStop={stopHold}>
          <Minus className="w-8 h-8" />
        </StepButton>
        <StepButton dir={1} onStart={() => startHold(1)} onStop={stopHold}>
          <Plus className="w-8 h-8" />
        </StepButton>
      </div>
    </motion.div>
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
