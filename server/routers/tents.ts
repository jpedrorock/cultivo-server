/**
 * tents — sub-router tRPC do CRUD de estufas.
 * Antes inline em routers.ts (linhas ~937-1200).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, or, desc, sql, isNotNull } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { getDb } from "../db";
import {
  tents, cycles, dailyLogs, plants, plantTentHistory,
  alerts, alertSettings, alertHistory, recipes, taskInstances,
  cloningEvents, tentAState,
} from "../../drizzle/schema";
import type { User } from "../../drizzle/schema";

/** Mapeamento de plano → maxTents (null = ilimitado) */
const MAX_TENTS_BY_PLAN: Record<string, number | null> = {
  free: 1,
  pro:  null,
  team: null,
};
import { validateTentOwnership } from "./_helpers";

export const tentsRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getAllTents(ctx.user.groupId);
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      const database = await getDb();
      if (!database) throw new Error("DB not available");
      const tent = await db.getTentById(input.id);
      if (!tent) return undefined;
      await validateTentOwnership(input.id, ctx.user.groupId);
      // Para estufas de manutenção, buscar último evento de clonagem e último ciclo com clonesProduced
      let lastCloningAt: number | null = null;
      let lastCloningCount: number | null = null;
      if (tent.category === 'MAINTENANCE') {
        // lastCloningAt: data do último cloningEvent (quando a estufa foi para clonagem)
        const lastCloningEvent = await database
          .select()
          .from(cloningEvents)
          .where(eq(cloningEvents.tentId, tent.id))
          .orderBy(desc(cloningEvents.startDate))
          .limit(1);
        if (lastCloningEvent[0]) {
          lastCloningAt = new Date(lastCloningEvent[0].startDate).getTime();
        }
        // lastCloningCount: número de clones produzidos no último ciclo com clonesProduced
        const lastCycleWithClones = await database
          .select({ clonesProduced: cycles.clonesProduced })
          .from(cycles)
          .where(and(eq(cycles.tentId, tent.id), isNotNull(cycles.clonesProduced)))
          .orderBy(desc(cycles.createdAt))
          .limit(1);
        if (lastCycleWithClones[0]) {
          lastCloningCount = lastCycleWithClones[0].clonesProduced ?? null;
        }
      }
      return { ...tent, lastCloningAt, lastCloningCount };
    }),
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(50),
          category: z.enum(["MAINTENANCE", "VEGA", "FLORA", "DRYING"]),
          cultivationMethod: z.enum(["MINERAL", "ORGANIC", "COCO", "HYDRO"]).optional(),
          width: z.number().int().positive(),
          depth: z.number().int().positive(),
          height: z.number().int().positive(),
          powerW: z.number().int().positive().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }

        // ── Enforcement server-side do limite de estufas por plano ────────────
        // ctx.user é populado via getUserById (SELECT * FROM users) — inclui `plan`
        // após a migration users-plan-column. Antes da migration, plan é undefined;
        // fallback 'pro' garante que usuários legítimos não sejam bloqueados.
        const userPlan: string = (ctx.user as User & { plan?: string }).plan ?? "pro";
        const maxTents = MAX_TENTS_BY_PLAN[userPlan] ?? null;

        if (maxTents !== null) {
          // Contar estufas existentes do grupo
          const [countRow] = await database
            .select({ count: sql<number>`COUNT(*)` })
            .from(tents)
            .where(eq(tents.groupId, ctx.user.groupId ?? 0));

          const currentCount = Number(countRow?.count ?? 0);
          if (currentCount >= maxTents) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `Plano Free permite no máximo ${maxTents} estufa. Faça upgrade para Pro para criar mais estufas.`,
            });
          }
        }
        // ─────────────────────────────────────────────────────────────────────

        // Calcular volume (em litros)
        const volume = (input.width * input.depth * input.height) / 1000;

        const [result] = await database.insert(tents).values({
          ...input,
          volume: volume.toFixed(3),
          groupId: ctx.user.groupId ?? null,
        });

        return { success: true, id: result.insertId };
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(50),
          category: z.enum(["MAINTENANCE", "VEGA", "FLORA", "DRYING"]),
          cultivationMethod: z.enum(["MINERAL", "ORGANIC", "COCO", "HYDRO"]).optional(),
          width: z.number().int().positive(),
          depth: z.number().int().positive(),
          height: z.number().int().positive(),
          powerW: z.number().int().positive().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }

        // Verificar ownership
        await validateTentOwnership(input.id, ctx.user.groupId);

        // Verificar se a estufa existe
        const existingTent = await database
          .select()
          .from(tents)
          .where(eq(tents.id, input.id))
          .limit(1);

        if (existingTent.length === 0) {
          throw new Error("Estufa não encontrada");
        }
        
        // Calcular volume (em litros)
        const volume = (input.width * input.depth * input.height) / 1000;
        
        const { id, ...updateData } = input;
        
        // Se powerW não foi fornecido, definir como null explicitamente
        const dataToUpdate = {
          ...updateData,
          volume: volume.toFixed(3),
          powerW: input.powerW ?? null,
        };
        
        await database
          .update(tents)
          .set(dataToUpdate)
          .where(eq(tents.id, id));
        
        return { success: true };
      }),
    getDeletePreview: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado.");
        }
        await validateTentOwnership(input.id, ctx.user.groupId);
        
        // Contar registros relacionados que serão deletados
        const [cyclesCount] = await database
          .select({ count: sql<number>`count(*)` })
          .from(cycles)
          .where(eq(cycles.tentId, input.id));
        
        const [plantsCount] = await database
          .select({ count: sql<number>`count(*)` })
          .from(plants)
          .where(eq(plants.currentTentId, input.id));
        
        const [recipesCount] = await database
          .select({ count: sql<number>`count(*)` })
          .from(recipes)
          .where(eq(recipes.tentId, input.id));
        
        const [dailyLogsCount] = await database
          .select({ count: sql<number>`count(*)` })
          .from(dailyLogs)
          .where(eq(dailyLogs.tentId, input.id));
        
        const [alertsCount] = await database
          .select({ count: sql<number>`count(*)` })
          .from(alerts)
          .where(eq(alerts.tentId, input.id));
        
        const [taskInstancesCount] = await database
          .select({ count: sql<number>`count(*)` })
          .from(taskInstances)
          .where(eq(taskInstances.tentId, input.id));
        
        const [plantHistoryCount] = await database
          .select({ count: sql<number>`count(*)` })
          .from(plantTentHistory)
          .where(
            or(
              eq(plantTentHistory.fromTentId, input.id),
              eq(plantTentHistory.toTentId, input.id)
            )
          );
        
        // Verificar se há ciclos ativos (bloqueador)
        const [activeCyclesCount] = await database
          .select({ count: sql<number>`count(*)` })
          .from(cycles)
          .where(and(
            eq(cycles.tentId, input.id),
            eq(cycles.status, "ACTIVE")
          ));
        
        return {
          canDelete: plantsCount.count === 0 && activeCyclesCount.count === 0,
          blockers: {
            activeCycles: activeCyclesCount.count,
            plants: plantsCount.count,
          },
          willDelete: {
            cycles: cyclesCount.count,
            recipes: recipesCount.count,
            dailyLogs: dailyLogsCount.count,
            alerts: alertsCount.count,
            taskInstances: taskInstancesCount.count,
            plantHistory: plantHistoryCount.count,
          },
          totalRecords: 
            cyclesCount.count + 
            recipesCount.count + 
            dailyLogsCount.count + 
            alertsCount.count + 
            taskInstancesCount.count + 
            plantHistoryCount.count,
        };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        // Verificar ownership
        await validateTentOwnership(input.id, ctx.user.groupId);
        // Verificar se há ciclos ativos
        const activeCycles = await database
          .select({ id: cycles.id })
          .from(cycles)
          .where(and(
            eq(cycles.tentId, input.id),
            eq(cycles.status, "ACTIVE")
          ));
        
        if (activeCycles.length > 0) {
          throw new Error("Não é possível excluir uma estufa com ciclos ativos. Finalize o ciclo primeiro.");
        }
        
        // Verificar se há plantas na estufa
        const plantsInTent = await database
          .select({ id: plants.id })
          .from(plants)
          .where(eq(plants.currentTentId, input.id));
        
        if (plantsInTent.length > 0) {
          throw new Error(`Não é possível excluir uma estufa com ${plantsInTent.length} planta(s). Mova ou finalize as plantas primeiro.`);
        }
        
        // Tudo dentro de uma transação — se qualquer delete falhar,
        // o banco volta ao estado original automaticamente.
        await database.transaction(async (tx: any) => {
          await tx.delete(dailyLogs).where(eq(dailyLogs.tentId, input.id));
          await tx.delete(taskInstances).where(eq(taskInstances.tentId, input.id));
          await tx.delete(cycles).where(eq(cycles.tentId, input.id));
          await tx.delete(alertSettings).where(eq(alertSettings.tentId, input.id));
          await tx.delete(alertHistory).where(eq(alertHistory.tentId, input.id));
          await tx.delete(alerts).where(eq(alerts.tentId, input.id));
          await tx.delete(tentAState).where(eq(tentAState.tentId, input.id));
          await tx.delete(cloningEvents).where(eq(cloningEvents.tentId, input.id));
          await tx.delete(recipes).where(eq(recipes.tentId, input.id));
          await tx.delete(plantTentHistory).where(
            or(
              eq(plantTentHistory.fromTentId, input.id),
              eq(plantTentHistory.toTentId, input.id)
            )
          );
          // Desvincula plantas antes de deletar a estufa (evita FK violation)
          await tx.update(plants).set({ currentTentId: null }).where(eq(plants.currentTentId, input.id));
          await tx.delete(tents).where(eq(tents.id, input.id));
        });

        return { success: true };
      }),
});
