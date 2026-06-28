/**
 * LivingPlant — a planta viva do Modo Jardim (placeholder SVG paramétrico por
 * estágio 1-6 × humor). Quando as ilustrações reais existirem em
 * /illustrations/jardim/, basta virar HAS_ART = true (o componente troca pra
 * <img> stage-{n}-{mood}.png). Ver GAME-MODE-CONCEPT.md.
 */
import { useEffect, useRef, useState } from "react";

export type PlantStage = 1 | 2 | 3 | 4 | 5 | 6;
export type PlantMood = "happy" | "thirsty" | "sad";
export type PlantHealth = "HEALTHY" | "STRESSED" | "SICK" | "RECOVERING";
export type PlantEnv = "hot" | "cold" | "ok" | "unknown";

// Postura por ambiente: calor → folhas caem (murcha); frio → folhas curvam pra cima (encolhe).
const ENV_DROOP: Record<PlantEnv, number> = { hot: 13, cold: -15, ok: 0, unknown: 0 };

// Severidade visual da saúde: nº de folhas que adoecem (de baixo pra cima) + cor.
const HEALTH_SEVERITY: Record<PlantHealth, number> = { HEALTHY: 0, RECOVERING: 1, STRESSED: 2, SICK: 3 };
const SICK_COLOR = ["#d9c84e", "#c2a23a", "#9a7b2e"]; // amarelo → marrom (mais doente = mais escuro)

type Rgb = [number, number, number];
function hexToRgb(h: string): Rgb {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbStr(c: Rgb): string {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Assinatura visual por strain (determinística do nome) → cada cepa tem folha/cor própria.
function strainHash(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}
function strainTraits(key: string | null | undefined): { leafMul: number; hueShift: number } {
  if (!key) return { leafMul: 1, hueShift: 0 };
  const h = strainHash(key);
  return {
    leafMul: 0.82 + ((h % 100) / 100) * 0.4, // 0.82–1.22 (folha fina ↔ larga)
    hueShift: (((h >>> 8) % 37) - 18),        // -18°..+18° (verde mais lima ↔ mais azulado)
  };
}
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Vira true quando o João dropar as artes em client/public/illustrations/jardim/
const HAS_ART = false;

const MOOD_COLOR: Record<PlantMood, string> = {
  happy: "#5bbf3a",
  thirsty: "#b3a23f",
  sad: "#6f7d6c",
};
const MOOD_DROOP: Record<PlantMood, number> = { happy: 0, thirsty: 18, sad: 34 };
const POT_BG: Record<PlantMood, string> = { happy: "#2a3d2e", thirsty: "#2a3d2e", sad: "#26302a" };

const IDLE_CLASS: Record<PlantMood, string> = {
  happy: "plant-idle-happy",
  thirsty: "plant-idle-thirsty",
  sad: "plant-idle-sad",
};

export function LivingPlant({
  stage,
  mood,
  size = 150,
  reacting = false,
  celebrating = false,
  animate = true,
  fromMood,
  vitality = 1,
  health,
  env = "unknown",
  topCount = 1,
  strainKey,
}: {
  stage: PlantStage;
  mood: PlantMood;
  size?: number;
  reacting?: boolean;
  celebrating?: boolean;
  animate?: boolean;
  /** Humor anterior — se difere de `mood`, a planta "se levanta" animando do antigo pro novo. */
  fromMood?: PlantMood;
  /** 0–1: viço. 1 = colorida/viva; cai com o tempo sem registro até 0 = preto-e-branco/congelada. */
  vitality?: number;
  /** Saúde registrada — SICK/STRESSED amarelam/mancham folhas; HEALTHY/null = normal. */
  health?: PlantHealth | null;
  /** Ambiente da estufa — postura: hot = murcha/caída, cold = encolhida/curvada, ok = ereta. */
  env?: PlantEnv;
  /** Nº de colas (treino: topping/FIM). 1 = natural; >1 = leque de colas. */
  topCount?: number;
  /** Nome da strain — dá folha/cor próprias (assinatura visual determinística). */
  strainKey?: string | null;
}) {
  const { leafMul, hueShift } = strainTraits(strainKey);
  // Sem registro há tempo → desbota (satura↓) e CONGELA (idle pausado).
  const frozen = vitality < 0.15;

  // Classe da animação: celebração > wiggle do toque > idle do humor (parado se congelada).
  const animClass = !animate
    ? ""
    : celebrating
      ? "plant-celebrate"
      : reacting
        ? "plant-reacting"
        : frozen
          ? ""
          : IDLE_CLASS[mood];

  // Filtro: viço (satura) + tom da strain (hue-rotate). Transição suave faz a cor "voltar".
  const vitalityStyle = { filter: `saturate(${vitality}) hue-rotate(${hueShift}deg)`, transition: "filter 1.2s ease" };

  // Tween de transição de humor: droop (folhas sobem) + cor (murcho → verde).
  const start = fromMood && fromMood !== mood ? fromMood : mood;
  const [vis, setVis] = useState<{ d: number; c: Rgb }>(() => ({ d: MOOD_DROOP[start], c: hexToRgb(MOOD_COLOR[start]) }));
  const visRef = useRef(vis);
  visRef.current = vis;
  const rafRef = useRef(0);
  useEffect(() => {
    const d1 = MOOD_DROOP[mood];
    const c1 = hexToRgb(MOOD_COLOR[mood]);
    // Ponto de partida: o humor anterior (se houver) ou o estado atual visível.
    const s = fromMood && fromMood !== mood
      ? { d: MOOD_DROOP[fromMood], c: hexToRgb(MOOD_COLOR[fromMood]) }
      : visRef.current;
    if ((s.d === d1 && s.c[0] === c1[0] && s.c[1] === c1[1] && s.c[2] === c1[2]) || !animate || prefersReducedMotion()) {
      setVis({ d: d1, c: c1 });
      return;
    }
    setVis(s);
    const t0 = performance.now();
    const dur = 900;
    cancelAnimationFrame(rafRef.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setVis({ d: lerp(s.d, d1, e), c: [lerp(s.c[0], c1[0], e), lerp(s.c[1], c1[1], e), lerp(s.c[2], c1[2], e)] });
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, fromMood, animate]);

  if (HAS_ART) {
    return (
      <img
        className={`plant-stage ${animClass}`}
        src={`/illustrations/jardim/stage-${stage}-${mood}.png`}
        width={size}
        height={size * 1.2}
        alt=""
        style={{ objectFit: "contain", ...vitalityStyle }}
      />
    );
  }

  const color = rgbStr(vis.c);
  // Droop final = humor (vis.d) + postura do ambiente (calor cai / frio curva pra cima).
  const droop = vis.d + ENV_DROOP[env];
  const pairs = Math.min(4, stage <= 1 ? 1 : stage);
  const stemTopY = 48 - Math.min(stage, 5) * 4;

  const leaves: { cx: number; cy: number; rot: number; rx: number }[] = [];
  for (let i = 0; i < pairs; i++) {
    const y = stemTopY + 10 + i * 16;
    const rx = (16 - i * 1.5) * leafMul; // largura da folha = traço da strain
    leaves.push({ cx: 42, cy: y, rot: -30 + droop, rx });
    leaves.push({ cx: 78, cy: y, rot: 30 - droop, rx });
  }

  // Coroa de colas (treino): 1 = topo central; >1 = leque (topping/FIM = mais colas).
  const colas = Math.max(1, Math.min(8, topCount));
  const crownTops = colas <= 1
    ? [{ x: 60, y: stemTopY }]
    : Array.from({ length: colas }, (_, i) => {
        const spread = Math.min(46, 16 + colas * 6);
        return { x: 60 - spread / 2 + (spread * i) / (colas - 1), y: stemTopY - 3 };
      });

  // Saúde: as folhas mais baixas (velhas) amarelam/mancham primeiro.
  const severity = health ? HEALTH_SEVERITY[health] : 0;
  const sickIdx = severity > 0
    ? leaves.map((l, i) => ({ i, cy: l.cy })).sort((a, b) => b.cy - a.cy).slice(0, severity).map((o) => o.i)
    : [];
  const sickSet = new Set(sickIdx);
  const sickColor = SICK_COLOR[Math.min(severity, SICK_COLOR.length) - 1] ?? SICK_COLOR[0];

  const showPistils = stage >= 4;
  const showTrichomes = stage >= 5;

  return (
    <svg viewBox="0 0 120 150" width={size} height={size * 1.25} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`planta estágio ${stage} ${mood}`} className={`plant-stage ${animClass}`} style={vitalityStyle}>
      <g stroke={color} strokeWidth="3" strokeLinecap="round" fill={color}>
        <line x1="60" y1="110" x2="60" y2={stemTopY} />
        {leaves.map((l, i) => (
          <ellipse
            key={i}
            cx={l.cx}
            cy={l.cy}
            rx={l.rx}
            ry="5"
            transform={`rotate(${l.rot} ${l.cx} ${l.cy})`}
            fill={sickSet.has(i) ? sickColor : undefined}
            stroke={sickSet.has(i) ? sickColor : undefined}
          />
        ))}
        {/* Coroa de colas — reflete o treino (topping/FIM = mais colas) */}
        {crownTops.map((t, i) => (
          <g key={`cola${i}`}>
            {colas > 1 && <line x1="60" y1={stemTopY + 3} x2={t.x} y2={t.y} />}
            <ellipse cx={t.x} cy={t.y - 4} rx="7" ry="4.5" transform={`rotate(${(t.x - 60) * 1.4} ${t.x} ${t.y - 4})`} />
          </g>
        ))}
      </g>
      {/* Manchas de saúde (estresse/doente) nas folhas amareladas */}
      {severity >= 2 &&
        sickIdx.map((i) => (
          <circle key={`spot${i}`} cx={leaves[i].cx - 2} cy={leaves[i].cy + 1.5} r="1.5" fill="#5e4420" />
        ))}
      {/* Pistilos (floração) */}
      {showPistils &&
        leaves.slice(0, 3).map((l, i) => (
          <circle key={`p${i}`} cx={l.cx} cy={l.cy - 4} r="2" fill="#caa6d6" />
        ))}
      {/* Tricomas (maturação/colheita) — cintilam dourado quando prontos */}
      {showTrichomes &&
        leaves.slice(0, 4).map((l, i) => (
          <circle
            key={`t${i}`}
            cx={l.cx + 3}
            cy={l.cy - 5}
            r="1.5"
            fill="#ffcf6a"
            className={animate ? "jardim-twinkle" : ""}
            style={animate ? { animationDelay: `${i * 240}ms` } : undefined}
          />
        ))}
      {/* Vaso */}
      <path d="M40 110 L80 110 L75 140 Q60 144 45 140 Z" fill={POT_BG[mood]} stroke={color} strokeWidth="1.4" />
      <ellipse cx="60" cy="110" rx="20" ry="4.5" fill="#1b2a1f" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}
