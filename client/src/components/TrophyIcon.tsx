/**
 * TrophyIcon — medalha de conquista paramétrica (Troféus do Cultivo).
 * Anel na cor do tier + folha verde da marca dentro. Platina ganha halo + estrela.
 * Ver TROPHY-SYSTEM-DESIGN.md.
 */
export type TrophyTier = "bronze" | "silver" | "gold" | "platinum";

const METAL: Record<TrophyTier, string> = {
  bronze: "#c0843f",
  silver: "#c2ccd4",
  gold: "#f0cf6a",
  platinum: "#7df0e0",
};
const LEAF: Record<TrophyTier, string> = {
  bronze: "#5bbf3a",
  silver: "#5bbf3a",
  gold: "#6fd040",
  platinum: "#9be36a",
};
const LOCKED = "#3a4540";

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
  const metal = locked ? LOCKED : METAL[tier];
  const leaf = locked ? LOCKED : LEAF[tier];
  const isPlatinum = tier === "platinum" && !locked;
  const gid = `trophyHalo-${tier}`;

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
      {isPlatinum && (
        <defs>
          <radialGradient id={gid} cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#7df0e0" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#7df0e0" stopOpacity="0" />
          </radialGradient>
        </defs>
      )}
      {isPlatinum && <circle cx="24" cy="24" r="23" fill={`url(#${gid})`} />}

      {/* Anel da medalha */}
      <circle
        cx="24"
        cy="24"
        r="20"
        fill={locked ? "none" : metal}
        fillOpacity={locked ? 0 : 0.12}
        stroke={metal}
        strokeWidth="2.4"
      />

      {/* Folha */}
      {locked ? (
        <path d="M24 14 C19.5 18 19 26.5 24 33 C29 26.5 28.5 18 24 14 Z" fill="none" stroke={LOCKED} strokeWidth="1.4" />
      ) : (
        <>
          <path d="M24 14 C19 18 18.5 27 24 34 C29.5 27 29 18 24 14 Z" fill={leaf} />
          <path d="M24 17 L24 31" stroke="#0d1812" strokeWidth="1" strokeOpacity="0.35" fill="none" strokeLinecap="round" />
        </>
      )}

      {/* Estrela da platina */}
      {isPlatinum && (
        <path d="M38 7 l.9 2.3 2.3.9 -2.3.9 -.9 2.3 -.9 -2.3 -2.3 -.9 2.3 -.9 Z" fill="#eafffb" />
      )}
    </svg>
  );
}
