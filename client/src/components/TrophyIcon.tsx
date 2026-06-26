/**
 * TrophyIcon — medalha de conquista paramétrica (Troféus do Cultivo).
 * Anel na cor do tier + folha verde da marca dentro. Tiers RAROS (diamante,
 * lendário) escalam o brilho: halo → brilhos → aura → coroa. Ver
 * TROPHY-SYSTEM-DESIGN.md + memória project_trophy_visual_direction.
 */
export type TrophyTier = "bronze" | "silver" | "gold" | "diamond" | "legendary" | "platinum";

interface TierCfg {
  metal: string;
  leaf: string;
  halo: boolean;
  sparkles: number;
  aura: boolean;
  /** "crown" (lendário), "star" (platina) ou null. */
  topMark: "crown" | "star" | null;
}

const TIER_CFG: Record<TrophyTier, TierCfg> = {
  bronze: { metal: "#c0843f", leaf: "#5bbf3a", halo: false, sparkles: 0, aura: false, topMark: null },
  silver: { metal: "#c2ccd4", leaf: "#5bbf3a", halo: false, sparkles: 0, aura: false, topMark: null },
  gold: { metal: "#f0cf6a", leaf: "#6fd040", halo: true, sparkles: 0, aura: false, topMark: null },
  diamond: { metal: "#9fe8ff", leaf: "#8fe6c0", halo: true, sparkles: 2, aura: false, topMark: null },
  legendary: { metal: "#ffcf5a", leaf: "#9be36a", halo: true, sparkles: 3, aura: true, topMark: "crown" },
  platinum: { metal: "#7df0e0", leaf: "#9be36a", halo: true, sparkles: 1, aura: true, topMark: "star" },
};

const LOCKED = "#3a4540";
const SPARKLE_POS = [
  { x: 12, y: 14 },
  { x: 37, y: 13 },
  { x: 39, y: 33 },
];

export function TrophyIcon({
  tier,
  locked = false,
  size = 48,
  className,
}: {
  tier: TrophyTier;
  locked?: boolean;
  size?: number;
  className?: string;
}) {
  const cfg = TIER_CFG[tier];
  const metal = locked ? LOCKED : cfg.metal;
  const leaf = locked ? LOCKED : cfg.leaf;
  const fx = !locked;
  const gid = `th-${tier}`;

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      style={{ opacity: locked ? 0.5 : 1 }}
      role="img"
      aria-label={`Troféu ${tier}${locked ? " bloqueado" : ""}`}
    >
      {fx && cfg.halo && (
        <defs>
          <radialGradient id={gid} cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor={cfg.metal} stopOpacity="0.4" />
            <stop offset="100%" stopColor={cfg.metal} stopOpacity="0" />
          </radialGradient>
        </defs>
      )}
      {fx && cfg.halo && <circle cx="24" cy="24" r="23" fill={`url(#${gid})`} />}
      {fx && cfg.aura && (
        <ellipse cx="24" cy="24" rx="22" ry="9" fill="none" stroke={cfg.metal} strokeWidth="0.8" opacity="0.5" transform="rotate(-18 24 24)" />
      )}

      {/* Coroa (lendário) acima da medalha */}
      {fx && cfg.topMark === "crown" && (
        <path d="M18 7 l2 3 4-3.5 4 3.5 2-3 -1 6 -10 0 Z" fill={cfg.metal} />
      )}

      {/* Anel da medalha */}
      <circle cx="24" cy="24" r="20" fill={locked ? "none" : metal} fillOpacity={locked ? 0 : 0.12} stroke={metal} strokeWidth="2.4" />

      {/* Folha */}
      {locked ? (
        <path d="M24 14 C19.5 18 19 26.5 24 33 C29 26.5 28.5 18 24 14 Z" fill="none" stroke={LOCKED} strokeWidth="1.4" />
      ) : (
        <>
          <path d="M24 14 C19 18 18.5 27 24 34 C29.5 27 29 18 24 14 Z" fill={leaf} />
          <path d="M24 17 L24 31" stroke="#0d1812" strokeWidth="1" strokeOpacity="0.35" fill="none" strokeLinecap="round" />
        </>
      )}

      {/* Estrela (platina) */}
      {fx && cfg.topMark === "star" && (
        <path d="M38 7 l.9 2.3 2.3.9 -2.3.9 -.9 2.3 -.9 -2.3 -2.3 -.9 2.3 -.9 Z" fill="#eafffb" />
      )}

      {/* Brilhos (diamante/lendário) */}
      {fx &&
        SPARKLE_POS.slice(0, cfg.sparkles).map((p, i) => (
          <path
            key={i}
            d={`M${p.x} ${p.y - 2.4} l.7 1.7 1.7.7 -1.7.7 -.7 1.7 -.7 -1.7 -1.7 -.7 1.7 -.7 Z`}
            fill={cfg.metal}
            opacity="0.9"
          />
        ))}
    </svg>
  );
}
