/**
 * gamification — progresso do usuário (ofensiva, Grow Score, níveis, badges).
 *
 * Tudo derivado de dados que já existem (logs, fotos, tricomas, ciclos, plantas).
 * Escopo por grupo. A lógica pura vive em server/lib/gamification.ts (testada).
 * Ver GAMIFICATION-STUDY.md.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { dailyLogs, tents, plants, plantPhotos, plantTrichomeLogs, cycles } from "../../drizzle/schema";
import { computeProgress, type GamificationStats } from "../lib/gamification";

/** Ofensiva (current/longest) + se já registrou hoje, a partir de dias distintos. */
function computeStreak(dayKeys: string[]): { current: number; longest: number; todayDone: boolean } {
  const days = new Set(dayKeys.map((d) => d.slice(0, 10)).filter(Boolean));
  if (days.size === 0) return { current: 0, longest: 0, todayDone: false };

  const toKey = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
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

export const gamificationRouter = router({
  getProgress: protectedProcedure.query(async ({ ctx }) => {
    const database = await getDb();
    if (!database) throw new Error("Banco indisponível");

    const groupId = ctx.user.groupId;
    const zeroStats: GamificationStats = {
      logCount: 0, photoCount: 0, trichomeCount: 0, finishedCycles: 0, plantCount: 0, currentStreak: 0,
    };

    if (groupId == null) {
      return { streak: { current: 0, longest: 0, todayDone: false }, ...computeProgress(zeroStats) };
    }

    // IDs do grupo (pra escopar os counts).
    const groupTents = await database.select({ id: tents.id }).from(tents).where(eq(tents.groupId, groupId));
    const tentIds = groupTents.map((t) => t.id);
    const groupPlants = await database.select({ id: plants.id }).from(plants).where(eq(plants.groupId, groupId));
    const plantIds = groupPlants.map((p) => p.id);

    const count = async (rows: Promise<Array<{ n: number }>>) => Number((await rows)[0]?.n ?? 0);

    const logCount = tentIds.length
      ? await count(database.select({ n: sql<number>`count(*)` }).from(dailyLogs).where(inArray(dailyLogs.tentId, tentIds)))
      : 0;
    const finishedCycles = tentIds.length
      ? await count(database.select({ n: sql<number>`count(*)` }).from(cycles).where(and(inArray(cycles.tentId, tentIds), eq(cycles.status, "FINISHED"))))
      : 0;
    const photoCount = plantIds.length
      ? await count(database.select({ n: sql<number>`count(*)` }).from(plantPhotos).where(inArray(plantPhotos.plantId, plantIds)))
      : 0;
    const trichomeCount = plantIds.length
      ? await count(database.select({ n: sql<number>`count(*)` }).from(plantTrichomeLogs).where(inArray(plantTrichomeLogs.plantId, plantIds)))
      : 0;

    // Ofensiva (dias distintos com registro em qualquer estufa do grupo).
    const dayRows = tentIds.length
      ? ((await database
          .select({ day: sql<string>`DATE(${dailyLogs.logDate})` })
          .from(dailyLogs)
          .where(inArray(dailyLogs.tentId, tentIds))
          .groupBy(sql`DATE(${dailyLogs.logDate})`)) as Array<{ day: string }>)
      : [];
    const streak = computeStreak(dayRows.map((r) => String(r.day)));

    const stats: GamificationStats = {
      logCount,
      photoCount,
      trichomeCount,
      finishedCycles,
      plantCount: plantIds.length,
      currentStreak: streak.current,
    };

    return { streak, ...computeProgress(stats) };
  }),
});
