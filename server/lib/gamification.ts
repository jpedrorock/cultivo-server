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
  /** Maior ofensiva já alcançada. */
  longestStreak: number;
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

// ─── Conquistas com tiers (Troféus do Cultivo) ───────────────────────────────
// Ver TROPHY-SYSTEM-DESIGN.md. Fase 0: só métricas que já existem (as conquistas
// que precisam de contadores novos — Zona de Conforto, Engenheiro, Madrugador,
// Curador, Renascido — entram na Fase 4).
export type Tier = "bronze" | "silver" | "gold";
const TIERS: Tier[] = ["bronze", "silver", "gold"];
const TIER_VALUE: Record<Tier, number> = { bronze: 1, silver: 2, gold: 3 };

export interface Achievement {
  key: string;
  name: string;
  /** Pista mostrada no estado bloqueado. */
  hint: string;
  /** Marco = 1 tier fixo; escalável = 3 tiers (bronze/prata/ouro). */
  isMilestone: boolean;
  /** Valor atual da métrica. */
  current: number;
  /** Thresholds [bronze, prata, ouro] (escalável) ou [need] (marco). */
  thresholds: number[];
  /** Maior tier desbloqueado (null = bloqueado). */
  tier: Tier | null;
  unlocked: boolean;
  /** Próximo threshold a bater (null = no topo). */
  nextThreshold: number | null;
}

const SCALABLE: { key: string; name: string; hint: string; stat: keyof GamificationStats; thresholds: [number, number, number] }[] = [
  { key: "mao-na-terra", name: "Mão na Terra", hint: "Dias seguidos registrando", stat: "currentStreak", thresholds: [7, 30, 100] },
  { key: "diario-de-bordo", name: "Diário de Bordo", hint: "Registros feitos", stat: "logCount", thresholds: [10, 100, 500] },
  { key: "olho-de-lince", name: "Olho de Lince", hint: "Registros de tricoma", stat: "trichomeCount", thresholds: [5, 25, 100] },
  { key: "lente-verde", name: "Lente Verde", hint: "Fotos de planta", stat: "photoCount", thresholds: [10, 50, 200] },
  { key: "ciclo-completo", name: "Ciclo Completo", hint: "Ciclos finalizados", stat: "finishedCycles", thresholds: [1, 5, 15] },
  { key: "raiz-profunda", name: "Raiz Profunda", hint: "Recorde de ofensiva (dias)", stat: "longestStreak", thresholds: [14, 60, 180] },
];

const MILESTONES: { key: string; name: string; hint: string; stat: keyof GamificationStats; need: number; tier: Tier }[] = [
  { key: "primeiro-broto", name: "Primeiro Broto", hint: "Faça seu primeiro registro", stat: "logCount", need: 1, tier: "bronze" },
  { key: "germinacao", name: "Germinação", hint: "Cadastre sua primeira planta", stat: "plantCount", need: 1, tier: "bronze" },
  { key: "primeira-colheita", name: "Primeira Colheita", hint: "Finalize um ciclo até a colheita", stat: "finishedCycles", need: 1, tier: "gold" },
];

function tierForValue(value: number, thresholds: number[]): { tier: Tier | null; next: number | null } {
  let tier: Tier | null = null;
  for (let i = 0; i < thresholds.length; i++) if (value >= thresholds[i]) tier = TIERS[i];
  const nextIdx = thresholds.findIndex((t) => value < t);
  return { tier, next: nextIdx === -1 ? null : thresholds[nextIdx] };
}

export function computeAchievements(s: GamificationStats): Achievement[] {
  const scal: Achievement[] = SCALABLE.map((d) => {
    const current = s[d.stat];
    const { tier, next } = tierForValue(current, d.thresholds);
    return { key: d.key, name: d.name, hint: d.hint, isMilestone: false, current, thresholds: d.thresholds, tier, unlocked: tier != null, nextThreshold: next };
  });
  const mile: Achievement[] = MILESTONES.map((d) => {
    const current = s[d.stat];
    const unlocked = current >= d.need;
    return { key: d.key, name: d.name, hint: d.hint, isMilestone: true, current, thresholds: [d.need], tier: unlocked ? d.tier : null, unlocked, nextThreshold: unlocked ? null : d.need };
  });
  return [...scal, ...mile];
}

/**
 * Platina "Lenda do Cultivo": todos os escaláveis no OURO + todos os marcos,
 * com a suavização do Ciclo Completo (PRATA já conta — ver design). have/total
 * contam tiers desbloqueados (escalável=3, marco=1) pro contador "X de Y".
 */
export function computePlatinum(achs: Achievement[]): { unlocked: boolean; have: number; total: number } {
  let have = 0;
  let total = 0;
  let allDone = true;
  for (const a of achs) {
    total += a.isMilestone ? 1 : 3;
    const got = a.isMilestone ? (a.unlocked ? 1 : 0) : a.tier ? TIER_VALUE[a.tier] : 0;
    have += got;
    const need = a.isMilestone ? 1 : a.key === "ciclo-completo" ? 2 : 3;
    if (got < need) allDone = false;
  }
  return { unlocked: allDone, have, total };
}

/**
 * Ofensiva (current/longest) + se já registrou hoje, a partir de dias distintos
 * (YYYY-MM-DD). Puro — `now` injetável pra teste determinístico.
 */
export function computeStreak(
  dayKeys: string[],
  now: Date = new Date(),
): { current: number; longest: number; todayDone: boolean } {
  const days = new Set(dayKeys.map((d) => d.slice(0, 10)).filter(Boolean));
  if (days.size === 0) return { current: 0, longest: 0, todayDone: false };

  const toKey = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date(now);
  today.setUTCHours(12, 0, 0, 0); // meio-dia UTC evita borda de fuso
  const todayDone = days.has(toKey(today));

  // Ofensiva atual: anda pra trás a partir de hoje (ou ontem, se hoje vazio).
  const cursor = new Date(today);
  if (!days.has(toKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let current = 0;
  while (days.has(toKey(cursor))) {
    current++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  // Maior ofensiva: maior sequência consecutiva no histórico.
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of sorted) {
    const t = new Date(`${d}T12:00:00Z`).getTime();
    if (prev != null && Math.round((t - prev) / 86400000) === 1) run++;
    else run = 1;
    if (run > longest) longest = run;
    prev = t;
  }

  return { current, longest, todayDone };
}

/** Resumo completo de progresso (sem a ofensiva, que vem do router). */
export function computeProgress(s: GamificationStats) {
  const growScore = computeGrowScore(s);
  const achievements = computeAchievements(s);
  return {
    growScore,
    level: computeLevel(growScore),
    achievements,
    platinum: computePlatinum(achievements),
  };
}
