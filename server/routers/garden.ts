/**
 * garden — Modo Jardim. Estado da planta viva (estágio + humor) da estufa
 * principal do usuário. Lógica pura em server/lib/plantGame.ts. Ver
 * GAME-MODE-CONCEPT.md.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getIdealValuesByTent } from "../db";
import { tents, cycles, dailyLogs, plants, strains } from "../../drizzle/schema";
import { computePlantStage, computePlantMood, STAGE_NAME, MOOD_LABEL } from "../lib/plantGame";

export const gardenRouter = router({
  getState: protectedProcedure.query(async ({ ctx }) => {
    const database = await getDb();
    if (!database) throw new Error("Banco indisponível");
    const groupId = ctx.user.groupId;
    if (groupId == null) return { hasGarden: false as const };

    const groupTents = await database.select().from(tents).where(eq(tents.groupId, groupId));
    if (groupTents.length === 0) return { hasGarden: false as const };

    // Estufa principal: a primeira com ciclo ativo; senão a primeira.
    const activeCycles = await database
      .select()
      .from(cycles)
      .where(and(inArray(cycles.tentId, groupTents.map((t) => t.id)), eq(cycles.status, "ACTIVE")));
    const cycle = activeCycles[0] ?? null;
    const tent = cycle ? groupTents.find((t) => t.id === cycle.tentId)! : groupTents[0];

    const now = Date.now();
    const hasCycle = !!cycle;
    const weeksSinceStart = cycle ? Math.floor((now - new Date(cycle.startDate).getTime()) / (7 * 86400000)) : 0;
    const floraStarted = !!cycle?.floraStartDate;
    const weeksSinceFlora = floraStarted ? Math.floor((now - new Date(cycle!.floraStartDate!).getTime()) / (7 * 86400000)) : 0;

    const stage = computePlantStage({ hasCycle, category: tent.category, floraStarted, weeksSinceStart, weeksSinceFlora });

    // Última leitura (data + temp/rh numa query só) → sinais de cuidado.
    const [latest] = (await database
      .select({ logDate: dailyLogs.logDate, tempC: dailyLogs.tempC, rhPct: dailyLogs.rhPct })
      .from(dailyLogs)
      .where(eq(dailyLogs.tentId, tent.id))
      .orderBy(desc(dailyLogs.logDate))
      .limit(1)) as Array<{ logDate: Date | string; tempC: string | null; rhPct: string | null }>;
    const lastReadingAt = latest ? new Date(latest.logDate).getTime() : null;
    const daysSinceLog = lastReadingAt ? Math.floor((now - lastReadingAt) / 86400000) : 99;
    const registeredToday = lastReadingAt ? now - lastReadingAt < 86400000 : false;

    // Ambiente ok? última leitura vs faixa ideal.
    let envOk = true;
    try {
      const ideal = await getIdealValuesByTent(tent.id);
      if (ideal && latest) {
        const t = latest.tempC != null ? parseFloat(String(latest.tempC)) : null;
        const r = latest.rhPct != null ? parseFloat(String(latest.rhPct)) : null;
        const tempOk = t == null || ideal.tempMin == null || ideal.tempMax == null || (t >= ideal.tempMin && t <= ideal.tempMax);
        const rhOk = r == null || ideal.rhMin == null || ideal.rhMax == null || (r >= ideal.rhMin && r <= ideal.rhMax);
        envOk = tempOk && rhOk;
      }
    } catch {
      envOk = true; // sem ideais → não penaliza
    }

    const mood = computePlantMood({ registeredToday, envOk, daysSinceLog });

    // "Pronto pro flip?" — veg chegou no fim da duração da strain (hora de 12/12).
    let readyToFlip = false;
    let flipDueTs: number | null = null;
    if (cycle && !floraStarted && !cycle.preFloraStartDate) {
      const [st] = (await database
        .select({ vegaWeeks: strains.vegaWeeks })
        .from(strains)
        .where(eq(strains.id, cycle.strainId!))) as Array<{ vegaWeeks: number }>;
      const vegaWeeks = st?.vegaWeeks ?? 4;
      flipDueTs = new Date(cycle.startDate).getTime() + vegaWeeks * 7 * 86400000;
      readyToFlip = now >= flipDueTs;
    }

    // Plantas da estufa (carrossel do Jardim). Compartilham o ciclo → mesmo
    // estágio; o que muda é nome/strain.
    const plantRows = await database
      .select({ id: plants.id, name: plants.name, strain: strains.name })
      .from(plants)
      .leftJoin(strains, eq(plants.strainId, strains.id))
      .where(and(eq(plants.currentTentId, tent.id), eq(plants.status, "ACTIVE")));

    return {
      hasGarden: true as const,
      tentId: tent.id,
      tentName: tent.name,
      cycleId: cycle?.id ?? null,
      readyToFlip,
      flipDueTs,
      stage,
      stageName: STAGE_NAME[stage],
      mood,
      moodLabel: MOOD_LABEL[mood],
      weekNum: hasCycle ? Math.max(1, (floraStarted ? weeksSinceFlora : weeksSinceStart) + 1) : 0,
      registeredToday,
      daysSinceLog,
      plants: plantRows.map((p) => ({ id: p.id, name: p.name, strain: p.strain ?? null })),
      plantCount: plantRows.length,
    };
  }),
});
