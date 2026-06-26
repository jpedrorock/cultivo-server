/**
 * LivingPlant — a planta viva do Modo Jardim (placeholder SVG paramétrico por
 * estágio 1-6 × humor). Quando as ilustrações reais existirem em
 * /illustrations/jardim/, basta virar HAS_ART = true (o componente troca pra
 * <img> stage-{n}-{mood}.png). Ver GAME-MODE-CONCEPT.md.
 */
export type PlantStage = 1 | 2 | 3 | 4 | 5 | 6;
export type PlantMood = "happy" | "thirsty" | "sad";

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
}: {
  stage: PlantStage;
  mood: PlantMood;
  size?: number;
  reacting?: boolean;
  celebrating?: boolean;
  animate?: boolean;
}) {
  // Classe da animação: celebração > wiggle do toque > idle do humor.
  const animClass = !animate
    ? ""
    : celebrating
      ? "plant-celebrate"
      : reacting
        ? "plant-reacting"
        : IDLE_CLASS[mood];

  if (HAS_ART) {
    return (
      <img
        className={`plant-stage ${animClass}`}
        src={`/illustrations/jardim/stage-${stage}-${mood}.png`}
        width={size}
        height={size * 1.2}
        alt=""
        style={{ objectFit: "contain" }}
      />
    );
  }

  const color = MOOD_COLOR[mood];
  const droop = MOOD_DROOP[mood];
  const pairs = Math.min(4, stage <= 1 ? 1 : stage);
  const stemTopY = 48 - Math.min(stage, 5) * 4;

  const leaves: { cx: number; cy: number; rot: number; rx: number }[] = [];
  for (let i = 0; i < pairs; i++) {
    const y = stemTopY + 10 + i * 16;
    const rx = 16 - i * 1.5;
    leaves.push({ cx: 42, cy: y, rot: -30 + droop, rx });
    leaves.push({ cx: 78, cy: y, rot: 30 - droop, rx });
  }
  leaves.push({ cx: 60, cy: stemTopY, rot: 0, rx: 8 });

  const showPistils = stage >= 4;
  const showTrichomes = stage >= 5;

  return (
    <svg viewBox="0 0 120 150" width={size} height={size * 1.25} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`planta estágio ${stage} ${mood}`} className={`plant-stage ${animClass}`}>
      <g stroke={color} strokeWidth="3" strokeLinecap="round" fill={color}>
        <line x1="60" y1="110" x2="60" y2={stemTopY} />
        {leaves.map((l, i) => (
          <ellipse key={i} cx={l.cx} cy={l.cy} rx={l.rx} ry="5" transform={`rotate(${l.rot} ${l.cx} ${l.cy})`} />
        ))}
      </g>
      {/* Pistilos (floração) */}
      {showPistils &&
        leaves.slice(0, 3).map((l, i) => (
          <circle key={`p${i}`} cx={l.cx} cy={l.cy - 4} r="2" fill="#caa6d6" />
        ))}
      {/* Tricomas (maturação/colheita) */}
      {showTrichomes &&
        leaves.slice(0, 4).map((l, i) => (
          <circle key={`t${i}`} cx={l.cx + 3} cy={l.cy - 5} r="1.5" fill="#ffcf6a" />
        ))}
      {/* Vaso */}
      <path d="M40 110 L80 110 L75 140 Q60 144 45 140 Z" fill={POT_BG[mood]} stroke={color} strokeWidth="1.4" />
      <ellipse cx="60" cy="110" rx="20" ry="4.5" fill="#1b2a1f" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}
