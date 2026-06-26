/**
 * Gamificação — lógica pura (Grow Score, níveis, badges).
 *
 * Tudo é derivado de dados que já existem (logs, fotos, tricomas, ciclos,
 * plantas + a ofensiva). Sem schema novo no MVP — o router computa os stats
 * e chama estas funções puras (testáveis sem banco). Ver GAMIFICATION-STUDY.md.
 */

export interface GamificationStats {
  /** Total de registros diários (do grupo). */
  logCount: number;
  /** Fotos de planta. */
  photoCount: number;
  /** Registros de tricoma. */
  trichomeCount: number;
  /** Ciclos finalizados. */
  finishedCycles: number;
  /** Plantas cadastradas (em qualquer status). */
  plantCount: number;
  /** Ofensiva atual (dias seguidos com registro). */
  currentStreak: number;
}

// ─── Grow Score ──────────────────────────────────────────────────────────────
export const SCORE_WEIGHTS = {
  log: 10,
  photo: 5,
  trichome: 8,
  finishedCycle: 200,
} as const;

export function computeGrowScore(s: GamificationStats): number {
  return (
    s.logCount * SCORE_WEIGHTS.log +
    s.photoCount * SCORE_WEIGHTS.photo +
    s.trichomeCount * SCORE_WEIGHTS.trichome +
    s.finishedCycles * SCORE_WEIGHTS.finishedCycle
  );
}

// ─── Níveis ──────────────────────────────────────────────────────────────────
export const LEVELS = [
  { num: 1, name: "Brotinho", min: 0 },
  { num: 2, name: "Muda", min: 100 },
  { num: 3, name: "Cultivador", min: 400 },
  { num: 4, name: "Grower", min: 1000 },
  { num: 5, name: "Mestre Grower", min: 2500 },
  { num: 6, name: "Lenda", min: 5000 },
] as const;

export interface LevelInfo {
  num: number;
  name: string;
  min: number;
  nextAt: number | null;
  nextName: string | null;
  /** % de progresso até o próximo nível (0-100). 100 no nível máximo. */
  progressPct: number;
}

export function computeLevel(score: number): LevelInfo {
  let current: { num: number; name: string; min: number } = LEVELS[0];
  for (const lvl of LEVELS) if (score >= lvl.min) current = lvl;
  const next = LEVELS.find((l) => l.min > current.min) ?? null;
  const progressPct = next
    ? Math.max(0, Math.min(100, Math.round(((score - current.min) / (next.min - current.min)) * 100)))
    : 100;
  return {
    num: current.num,
    name: current.name,
    min: current.min,
    nextAt: next ? next.min : null,
    nextName: next ? next.name : null,
    progressPct,
  };
}

// ─── Badges ──────────────────────────────────────────────────────────────────
export interface BadgeInfo {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  /** Progresso pra badges de meta (ex: 4/7 dias). Ausente em badges binários. */
  progress?: { have: number; need: number };
}

function badge(
  id: string,
  name: string,
  description: string,
  unlocked: boolean,
  have?: number,
  need?: number,
): BadgeInfo {
  const b: BadgeInfo = { id, name, description, unlocked };
  if (need != null && have != null) b.progress = { have: Math.min(have, need), need };
  return b;
}

export function computeBadges(s: GamificationStats): BadgeInfo[] {
  return [
    badge("first-log", "Primeiro Registro", "Fez seu primeiro registro", s.logCount >= 1),
    badge("first-plant", "Mão na Terra", "Cadastrou sua primeira planta", s.plantCount >= 1),
    badge("streak-7", "Constante", "7 dias seguidos registrando", s.currentStreak >= 7, s.currentStreak, 7),
    badge("streak-30", "Dedicado", "30 dias seguidos registrando", s.currentStreak >= 30, s.currentStreak, 30),
    badge("streak-100", "Inabalável", "100 dias seguidos registrando", s.currentStreak >= 100, s.currentStreak, 100),
    badge("photographer", "Fotógrafo", "10 fotos de planta", s.photoCount >= 10, s.photoCount, 10),
    badge("observer", "Observador", "5 registros de tricoma", s.trichomeCount >= 5, s.trichomeCount, 5),
    badge("first-harvest", "Primeira Colheita", "Finalizou um ciclo do início ao fim", s.finishedCycles >= 1),
  ];
}

/** Resumo completo de progresso (sem a ofensiva, que vem do router). */
export function computeProgress(s: GamificationStats) {
  const growScore = computeGrowScore(s);
  const badges = computeBadges(s);
  return {
    growScore,
    level: computeLevel(growScore),
    badges,
    badgesUnlocked: badges.filter((b) => b.unlocked).length,
    badgesTotal: badges.length,
  };
}
