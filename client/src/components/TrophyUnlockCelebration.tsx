/**
 * TrophyUnlockCelebration — cerimônia full-screen de um troféu desbloqueado:
 * troféu grande (com o brilho do metal) + chuva de pólen na cor do tier +
 * haptic. Toque em qualquer lugar pra fechar. Disparada pelo TrophyUnlockWatcher.
 */
import { useEffect } from "react";
import { TrophyIcon, type TrophyTier } from "@/components/TrophyIcon";
import { haptics } from "@/lib/haptics";

const TIER_NAME: Record<TrophyTier, string> = {
  bronze: "Broto",
  silver: "Folhagem",
  gold: "Florada",
  diamond: "Diamante",
  legendary: "Lendário",
  platinum: "Lenda",
};
const TIER_COLOR: Record<TrophyTier, string> = {
  bronze: "#c0843f",
  silver: "#c2ccd4",
  gold: "#f0cf6a",
  diamond: "#9fe8ff",
  legendary: "#ffcf5a",
  platinum: "#7df0e0",
};

// Pólen do cenário (posições/tamanhos/ritmos fixos por índice).
const POLEN = [
  { left: 8, size: 6, dur: 3.2, delay: 0 },
  { left: 18, size: 4, dur: 2.6, delay: 0.5 },
  { left: 28, size: 7, dur: 3.8, delay: 1.1 },
  { left: 38, size: 4, dur: 2.9, delay: 0.2 },
  { left: 47, size: 5, dur: 3.4, delay: 0.8 },
  { left: 56, size: 6, dur: 2.7, delay: 0.3 },
  { left: 65, size: 4, dur: 3.6, delay: 1.3 },
  { left: 74, size: 7, dur: 3.0, delay: 0.6 },
  { left: 83, size: 5, dur: 2.8, delay: 0.1 },
  { left: 92, size: 6, dur: 3.5, delay: 0.9 },
];

interface Props {
  tier: TrophyTier;
  title: string;
  onDone: () => void;
}

export function TrophyUnlockCelebration({ tier, title, onDone }: Props) {
  useEffect(() => {
    haptics.success().catch(() => {});
  }, []);

  const color = TIER_COLOR[tier];

  return (
    <div
      onClick={onDone}
      role="button"
      aria-label="Fechar celebração"
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-background/92 backdrop-blur-sm cursor-pointer animate-in fade-in duration-300"
    >
      {/* Pólen subindo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {POLEN.map((p, i) => (
          <span
            key={i}
            className="trophy-polen absolute rounded-full"
            style={{
              left: `${p.left}%`,
              bottom: "-4%",
              width: p.size,
              height: p.size,
              background: color,
              filter: "blur(0.5px)",
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      <p className="z-10 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground mb-5">
        Conquista desbloqueada
      </p>
      <div className="trophy-pop z-10">
        <TrophyIcon tier={tier} size={128} />
      </div>
      <h2 className="z-10 text-2xl font-bold text-foreground mt-6 text-center px-8">{title}</h2>
      <p className="z-10 text-sm font-semibold mt-1" style={{ color }}>
        {TIER_NAME[tier]}
      </p>
      <p className="z-10 text-xs text-muted-foreground mt-8">toque pra continuar</p>
    </div>
  );
}
