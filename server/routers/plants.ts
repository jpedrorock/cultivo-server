/**
 * plants — sub-routers tRPC do domínio "planta individual" e suas relações.
 *
 * Antes vivia inline em server/routers.ts (linhas ~4006-5929, ~1924 linhas).
 * Extraído pra cá pra reduzir o monstro principal e isolar todo o domínio
 * "plant*" num lugar só.
 *
 * Exporta 8 routers:
 *   - plantsRouter            — CRUD principal de plantas
 *   - plantObservationsRouter — observações livres
 *   - plantPhotosRouter       — fotos da planta
 *   - plantRunoffRouter       — registros de runoff
 *   - plantHealthRouter       — registros de saúde (sintomas, status)
 *   - plantTrichomesRouter    — checklist de tricomas
 *   - plantLSTRouter          — sessões de LST/Topping/etc
 *   - plantStructureRouter    — estrutura (nodes/edges) salva por planta
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, or, desc, asc, sql, isNull, isNotNull, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  plants,
  plantTentHistory,
  plantObservations,
  plantPhotos,
  plantRunoffLogs,
  plantHealthLogs,
  plantTrichomeLogs,
  plantLSTLogs,
  plantStructures,
  tents,
  cycles,
  strains,
  dailyLogs,
} from "../../drizzle/schema";
import { validatePlantOwnership, validateTentOwnership } from "./_helpers";

export const plantsRouter = router({
    // Criar nova planta
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        code: z.string().optional(),
        strainId: z.number(),
        currentTentId: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validateTentOwnership(input.currentTentId, ctx.user.groupId);

        const [result] = await database.insert(plants).values({
          name: input.name,
          code: input.code,
          strainId: input.strainId,
          currentTentId: input.currentTentId,
          notes: input.notes,
          status: "ACTIVE",
          groupId: ctx.user.groupId ?? null,
        });

        // Retornar o ID inserido
        return { id: (result as { insertId: number }).insertId };
      }),

    // Clonar planta existente
    clone: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        name: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        const [original] = await database
          .select()
          .from(plants)
          .where(and(eq(plants.id, input.plantId), eq(plants.groupId, ctx.user.groupId ?? 0)))
          .limit(1);

        if (!original) throw new Error("Planta não encontrada");

        const cloneName = input.name ?? `${original.name} (Clone)`;

        const [result] = await database
          .insert(plants)
          .values({
            name: cloneName,
            strainId: original.strainId,
            currentTentId: original.currentTentId,
            plantStage: "SEEDLING",
            status: "ACTIVE",
            groupId: ctx.user.groupId ?? null,
            notes: original.notes
              ? `Clone de: ${original.name}\n\n${original.notes}`
              : `Clone de: ${original.name}`,
          });

        const newPlantId = (result as any).insertId;

        if (original.currentTentId) {
          await database.insert(plantTentHistory).values({
            plantId: newPlantId,
            toTentId: original.currentTentId,
            movedAt: new Date(),
            reason: `Clone criado de "${original.name}"`,
          });
        }

        return { id: newPlantId, name: cloneName };
      }),

    // Listar plantas (apenas ACTIVE por padrão)
    list: protectedProcedure
      .input(z.object({
        tentId: z.number().optional(),
        strainId: z.number().optional(),
        status: z.enum(["ACTIVE", "HARVESTED", "DEAD", "DISCARDED", "AWAITING_DRYING"]).optional(),
      }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        if (input.tentId) await validateTentOwnership(input.tentId, ctx.user.groupId);

        const conditions = [];

        // Filter by group
        if (ctx.user.groupId != null) {
          conditions.push(eq(plants.groupId, ctx.user.groupId));
        }

        // Excluir plantas na lixeira (soft-delete)
        conditions.push(isNull(plants.deletedAt));

        // Filtrar apenas plantas ACTIVE por padrão
        if (input.status) {
          conditions.push(eq(plants.status, input.status));
        } else {
          conditions.push(eq(plants.status, "ACTIVE"));
        }

        if (input.tentId) {
          conditions.push(eq(plants.currentTentId, input.tentId));
        }
        if (input.strainId) {
          conditions.push(eq(plants.strainId, input.strainId));
        }

        const query = database.select().from(plants).where(and(...conditions));
        
        const plantsList = await query as any;

        if (plantsList.length === 0) return [];

        const plantIds = plantsList.map((p: any) => p.id);
        const tentIds = [...new Set(plantsList.map((p: any) => p.currentTentId).filter(Boolean))] as number[];

        // 1 query: último health log por planta (em vez de 2 queries duplicadas por planta)
        const healthRows = await database
          .select()
          .from(plantHealthLogs)
          .where(inArray(plantHealthLogs.plantId, plantIds))
          .orderBy(desc(plantHealthLogs.logDate));

        // Mapa: plantId → primeiro (mais recente) health log
        const healthMap = new Map<number, any>();
        for (const row of healthRows) {
          if (!healthMap.has(row.plantId)) healthMap.set(row.plantId, row);
        }

        // 1 query: ciclos ativos para todas as estufas relevantes
        const activeCycleRows = tentIds.length > 0
          ? await database
              .select()
              .from(cycles)
              .where(and(inArray(cycles.tentId, tentIds), eq(cycles.status, "ACTIVE")))
          : [];

        // Mapa: tentId → ciclo ativo
        const cycleMap = new Map<number, any>();
        for (const c of activeCycleRows) cycleMap.set(c.tentId, c);

        const now = new Date();

        return plantsList.map((plant: any) => {
          const lastHealth = healthMap.get(plant.id) ?? null;
          const activeCycle = cycleMap.get(plant.currentTentId) ?? null;

          let cyclePhase = null;
          let cycleWeek = null;

          if (activeCycle) {
            const startDate = new Date(activeCycle.startDate);
            const floraStartDate = activeCycle.floraStartDate ? new Date(activeCycle.floraStartDate) : null;
            if (floraStartDate && now >= floraStartDate) {
              cyclePhase = "FLORA";
              cycleWeek = Math.floor((now.getTime() - floraStartDate.getTime()) / (1000 * 60 * 60 * 24 * 7)) + 1;
            } else {
              cyclePhase = "VEGA";
              cycleWeek = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7)) + 1;
            }
          }

          return {
            ...plant,
            lastHealthPhotoUrl: lastHealth?.photoUrl ?? null,
            lastHealthStatus: lastHealth?.healthStatus ?? null,
            cyclePhase,
            cycleWeek,
          };
        });
      }),

    // Obter planta por ID
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.id, ctx.user.groupId);

        const [plant] = await database
          .select()
          .from(plants)
          .where(eq(plants.id, input.id));

        if (!plant) return null;

        // Enriquecer com fase e semana do ciclo ativo da estufa atual
        // (cliente usa em PlantDetail para colorir hero, label de fase, semana)
        let cyclePhase: 'CLONING' | 'VEGA' | 'FLORA' | 'MAINTENANCE' | 'DRYING' | null = null;
        let cycleWeek: number | null = null;

        if (plant.currentTentId) {
          const [cycle] = await database
            .select()
            .from(cycles)
            .where(and(eq(cycles.tentId, plant.currentTentId), eq(cycles.status, 'ACTIVE')))
            .orderBy(desc(cycles.startDate))
            .limit(1);

          if (cycle) {
            const isFlora = cycle.floraStartDate != null;
            cyclePhase = isFlora ? 'FLORA' : 'VEGA';
            const refDate = isFlora && cycle.floraStartDate
              ? new Date(cycle.floraStartDate)
              : new Date(cycle.startDate);
            const daysSince = Math.floor((Date.now() - refDate.getTime()) / 86400000);
            cycleWeek = Math.floor(daysSince / 7) + 1;
          }
        }

        return { ...plant, cyclePhase, cycleWeek };
      }),

    // Atualizar planta
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          code: z.string().optional(),
          notes: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.id, ctx.user.groupId);

        // Verificar se planta existe
        const existingPlant = await database
          .select()
          .from(plants)
          .where(eq(plants.id, input.id))
          .limit(1);

        if (existingPlant.length === 0) {
          throw new Error("Planta não encontrada");
        }

        // Preparar campos para atualização (apenas os fornecidos)
        const updateData: any = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.code !== undefined) updateData.code = input.code;
        if (input.notes !== undefined) updateData.notes = input.notes;

        // Verificar se há algo para atualizar
        if (Object.keys(updateData).length === 0) {
          return { success: true }; // Nada para atualizar
        }

        // Atualizar planta
        await database
          .update(plants)
          .set(updateData)
          .where(eq(plants.id, input.id));

        return { success: true };
      }),

    // Mover planta para outra estufa
    moveTent: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        toTentId: z.number(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        await validateTentOwnership(input.toTentId, ctx.user.groupId);
        
        // Buscar estufa atual
        const [plant] = await database
          .select()
          .from(plants)
          .where(eq(plants.id, input.plantId));
        
        if (!plant) throw new Error("Plant not found");
        
        // Registrar histórico
        await database.insert(plantTentHistory).values({
          plantId: input.plantId,
          fromTentId: plant.currentTentId,
          toTentId: input.toTentId,
          reason: input.reason,
        });
        
        // Atualizar estufa atual
        await database
          .update(plants)
          .set({ currentTentId: input.toTentId })
          .where(eq(plants.id, input.plantId));
        
        return { success: true };
      }),

    // Mover todas as plantas de uma estufa para outra
    moveAllPlants: protectedProcedure
      .input(z.object({
        fromTentId: z.number(),
        toTentId: z.number(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validateTentOwnership(input.fromTentId, ctx.user.groupId);
        await validateTentOwnership(input.toTentId, ctx.user.groupId);
        
        // Buscar todas as plantas na estufa de origem
        const plantsToMove = await database
          .select()
          .from(plants)
          .where(eq(plants.currentTentId, input.fromTentId));
        
        if (plantsToMove.length === 0) {
          return { success: true, movedCount: 0 };
        }
        
        // Buscar estufa de destino para verificar se é VEGA
        const [toTent] = await database
          .select()
          .from(tents)
          .where(eq(tents.id, input.toTentId));
        
        // Mover cada planta e registrar histórico
        for (const plant of plantsToMove) {
          // Registrar histórico
          await database.insert(plantTentHistory).values({
            plantId: plant.id,
            fromTentId: input.fromTentId,
            toTentId: input.toTentId,
            reason: input.reason || "Movimentação em lote",
          });
          
          // Promover SEEDLING para PLANT se indo para estufa VEGA
          const newStage = (plant.plantStage === "SEEDLING" && toTent?.category === "VEGA") 
            ? "PLANT" 
            : plant.plantStage;
          
          // Atualizar estufa atual e estágio
          await database
            .update(plants)
            .set({ 
              currentTentId: input.toTentId,
              plantStage: newStage
            })
            .where(eq(plants.id, plant.id));
        }
        
        return { success: true, movedCount: plantsToMove.length };
      }),

    // Mover plantas específicas (seleção manual)
    moveSelectedPlants: protectedProcedure
      .input(z.object({
        plantIds: z.array(z.number()),
        toTentId: z.number(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validateTentOwnership(input.toTentId, ctx.user.groupId);
        
        if (input.plantIds.length === 0) {
          return { success: true, movedCount: 0 };
        }
        
        // Mover cada planta e registrar histórico
        for (const plantId of input.plantIds) {
          // Buscar planta atual para pegar fromTentId
          const [plant] = await database
            .select()
            .from(plants)
            .where(eq(plants.id, plantId));

          if (!plant) continue; // Skip if plant not found

          // Verificar que a planta pertence ao grupo do usuário
          await validatePlantOwnership(plantId, ctx.user.groupId);
          
          // Registrar histórico
          await database.insert(plantTentHistory).values({
            plantId: plantId,
            fromTentId: plant.currentTentId,
            toTentId: input.toTentId,
            reason: input.reason || "Movimentação em lote (seleção manual)",
          });
          
          // Atualizar estufa atual
          await database
            .update(plants)
            .set({ currentTentId: input.toTentId })
            .where(eq(plants.id, plantId));
        }
        
        return { success: true, movedCount: input.plantIds.length };
      }),

    // Transplantar para Flora (encontra automaticamente estufa de Flora)
    transplantToFlora: protectedProcedure
      .input(z.object({
        plantId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        
        // Buscar planta atual
        const [plant] = await database
          .select()
          .from(plants)
          .where(eq(plants.id, input.plantId));
        
        if (!plant) throw new Error("Plant not found");
        
        // Buscar estufa de Flora (ciclo ativo em fase FLORA)
        const [floraTent] = await database
          .select({
            tentId: cycles.tentId,
            tentName: tents.name,
          })
          .from(cycles)
          .innerJoin(tents, eq(cycles.tentId, tents.id))
          .where(and(
            eq(cycles.status, "ACTIVE"),
            isNotNull(cycles.floraStartDate)
          ))
          .limit(1);
        
        if (!floraTent) {
          throw new Error("Nenhuma estufa de Flora ativa encontrada");
        }
        
        // Registrar histórico
        await database.insert(plantTentHistory).values({
          plantId: input.plantId,
          fromTentId: plant.currentTentId,
          toTentId: floraTent.tentId,
          reason: "Transplante para Flora",
        });
        
        // Atualizar estufa atual
        await database
          .update(plants)
          .set({ currentTentId: floraTent.tentId })
          .where(eq(plants.id, input.plantId));
        
        return { success: true, tentName: floraTent.tentName };
      }),

    // Finalizar planta (harvest)
    finish: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        status: z.enum(["HARVESTED", "DEAD"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        
        await database
          .update(plants)
          .set({ status: input.status })
          .where(eq(plants.id, input.plantId));
        
        return { success: true };
      }),

    // Promover muda para planta (SEEDLING → PLANT)
    promoteToPlant: protectedProcedure
      .input(z.object({
        plantId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        
        // Buscar planta atual
        const [plant] = await database
          .select()
          .from(plants)
          .where(eq(plants.id, input.plantId));
        
        if (!plant) {
          throw new Error("Planta não encontrada");
        }
        
        if (plant.plantStage !== "SEEDLING") {
          throw new Error("Apenas mudas podem ser promovidas para plantas");
        }
        
        // Promover para PLANT
        await database
          .update(plants)
          .set({ plantStage: "PLANT" })
          .where(eq(plants.id, input.plantId));
        
        return { success: true };
      }),

    // Promover múltiplas mudas para plantas (ação em lote)
    bulkPromote: protectedProcedure
      .input(z.object({
        plantIds: z.array(z.number()),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Verificar se todas são mudas
        const plantsToPromote = await database
          .select()
          .from(plants)
          .where(inArray(plants.id, input.plantIds));
        
        const nonSeedlings = plantsToPromote.filter((p: any) => p.plantStage !== "SEEDLING");
        if (nonSeedlings.length > 0) {
          throw new Error(`${nonSeedlings.length} planta(s) não são mudas e não podem ser promovidas`);
        }
        
        // Promover todas para PLANT
        await database
          .update(plants)
          .set({ plantStage: "PLANT" })
          .where(inArray(plants.id, input.plantIds));
        
        return { success: true, count: input.plantIds.length };
      }),

    // Mover múltiplas plantas para outra estufa (ação em lote)
    bulkMove: protectedProcedure
      .input(z.object({
        plantIds: z.array(z.number()),
        targetTentId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validateTentOwnership(input.targetTentId, ctx.user.groupId);
        
        // Verificar se estufa destino existe
        const [targetTent] = await database
          .select()
          .from(tents)
          .where(eq(tents.id, input.targetTentId));
        
        if (!targetTent) {
          throw new Error("Estufa destino não encontrada");
        }
        
        // Mover todas as plantas
        await database
          .update(plants)
          .set({ currentTentId: input.targetTentId })
          .where(inArray(plants.id, input.plantIds));
        
        return { success: true, count: input.plantIds.length };
      }),

    // Marcar múltiplas plantas como colhidas (ação em lote)
    bulkHarvest: protectedProcedure
      .input(z.object({
        plantIds: z.array(z.number()),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Marcar todas como colhidas
        await database
          .update(plants)
          .set({ 
            status: "HARVESTED",
            finishedAt: new Date(),
          })
          .where(inArray(plants.id, input.plantIds));
        
        return { success: true, count: input.plantIds.length };
      }),

    // Descartar múltiplas plantas (ação em lote)
    bulkDiscard: protectedProcedure
      .input(z.object({
        plantIds: z.array(z.number()),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Descartar todas as plantas
        await database
          .update(plants)
          .set({ 
            status: "DISCARDED",
            finishedAt: new Date(),
            finishReason: input.reason,
          })
          .where(inArray(plants.id, input.plantIds));
        
        return { success: true, count: input.plantIds.length };
      }),

    // Descartar planta (doente ou com problemas)
    discard: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        
        // Atualizar status para DISCARDED
        await database
          .update(plants)
          .set({ 
            status: "DISCARDED",
            notes: input.reason ? `Descartada: ${input.reason}` : "Descartada"
          })
          .where(eq(plants.id, input.plantId));
        
        return { success: true };
      }),

    // Mover planta para lixeira (soft-delete)
    delete: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        await database.update(plants).set({ deletedAt: new Date() }).where(eq(plants.id, input.plantId));
        return { success: true };
      }),

    // Mover múltiplas plantas para lixeira em massa
    bulkDelete: protectedProcedure
      .input(z.object({ plantIds: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        if (!input.plantIds.length) return { count: 0 };
        await database.update(plants).set({ deletedAt: new Date() }).where(inArray(plants.id, input.plantIds));
        return { count: input.plantIds.length };
      }),

    // Listar plantas na lixeira
    listDeleted: protectedProcedure
      .query(async ({ ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        const conditions = [isNotNull(plants.deletedAt)];
        if (ctx.user.groupId != null) conditions.push(eq(plants.groupId, ctx.user.groupId));
        return await database.select().from(plants).where(and(...conditions)).orderBy(desc(plants.deletedAt)) as any[];
      }),

    // Restaurar planta da lixeira
    restore: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        await database.update(plants).set({ deletedAt: null }).where(eq(plants.id, input.plantId));
        return { success: true };
      }),

    // Excluir planta permanentemente (da lixeira)
    permanentDelete: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        await database.transaction(async (tx: any) => {
          await tx.delete(plantObservations).where(eq(plantObservations.plantId, input.plantId));
          await tx.delete(plantPhotos).where(eq(plantPhotos.plantId, input.plantId));
          await tx.delete(plantRunoffLogs).where(eq(plantRunoffLogs.plantId, input.plantId));
          await tx.delete(plantHealthLogs).where(eq(plantHealthLogs.plantId, input.plantId));
          await tx.delete(plantTrichomeLogs).where(eq(plantTrichomeLogs.plantId, input.plantId));
          await tx.delete(plantLSTLogs).where(eq(plantLSTLogs.plantId, input.plantId));
          await tx.delete(plantTentHistory).where(eq(plantTentHistory.plantId, input.plantId));
          await tx.delete(plants).where(eq(plants.id, input.plantId));
        });
        return { success: true };
      }),

    // Buscar histórico de movimentação entre estufas
    getTentHistory: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .query(async ({ input, ctx }) => {
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const history = await database
          .select({
            id: plantTentHistory.id,
            plantId: plantTentHistory.plantId,
            fromTentId: plantTentHistory.fromTentId,
            toTentId: plantTentHistory.toTentId,
            movedAt: plantTentHistory.movedAt,
            reason: plantTentHistory.reason,
          })
          .from(plantTentHistory)
          .where(eq(plantTentHistory.plantId, input.plantId))
          .orderBy(asc(plantTentHistory.movedAt));
        
        // Buscar nomes das estufas
        const allTents = await database.select({ id: tents.id, name: tents.name }).from(tents);
        const tentMap = Object.fromEntries(allTents.map((t: any) => [t.id, t.name]));
        
        return history.map((h: any) => ({
          ...h,
          fromTentName: h.fromTentId ? tentMap[h.fromTentId] ?? `Estufa #${h.fromTentId}` : null,
          toTentName: tentMap[h.toTentId] ?? `Estufa #${h.toTentId}`,
        }));
      }),

    getEnvironmentHistory: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .query(async ({ input, ctx }) => {
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        // 1. Buscar planta
        const [plant] = await database.select().from(plants).where(eq(plants.id, input.plantId));
        if (!plant) throw new Error("Plant not found");

        // 2. Buscar histórico de movimentação de estufas
        const history = await database
          .select()
          .from(plantTentHistory)
          .where(eq(plantTentHistory.plantId, input.plantId))
          .orderBy(asc(plantTentHistory.movedAt));

        // 3. Buscar todas as estufas para mapeamento de nomes
        const allTents = await database.select({ id: tents.id, name: tents.name }).from(tents);
        const tentMap = Object.fromEntries(allTents.map((t: any) => [t.id, t.name]));

        // 4. Reconstruir períodos: quando a planta estava em qual estufa
        // Cada entrada: plant entra em toTentId em movedAt, sai quando a próxima entrada começa
        const periods: Array<{ tentId: number; tentName: string; start: Date; end: Date | null }> = [];

        // Adicionar período na estufa original (antes da primeira movimentação)
        if (history.length > 0) {
          const firstMove = history[0] as any;
          if (firstMove.fromTentId) {
            periods.push({
              tentId: firstMove.fromTentId,
              tentName: tentMap[firstMove.fromTentId] ?? `Estufa #${firstMove.fromTentId}`,
              start: new Date(plant.createdAt),
              end: new Date(firstMove.movedAt),
            });
          }
        }

        for (let i = 0; i < history.length; i++) {
          const entry = history[i] as any;
          if (!entry.toTentId) continue;
          const start = new Date(entry.movedAt);
          const end = i + 1 < history.length ? new Date((history[i + 1] as any).movedAt) : null;
          periods.push({
            tentId: entry.toTentId,
            tentName: tentMap[entry.toTentId] ?? `Estufa #${entry.toTentId}`,
            start,
            end,
          });
        }

        // Se não há histórico mas planta tem estufa atual, criar período desde criação
        if (periods.length === 0 && plant.currentTentId) {
          periods.push({
            tentId: plant.currentTentId,
            tentName: tentMap[plant.currentTentId] ?? `Estufa #${plant.currentTentId}`,
            start: new Date(plant.createdAt),
            end: null,
          });
        }

        // 5. Para cada período, buscar logs da estufa naquele intervalo de datas
        const periodsWithLogs = await Promise.all(
          periods.map(async (period) => {
            const allLogs = await database
              .select()
              .from(dailyLogs)
              .where(eq(dailyLogs.tentId, period.tentId))
              .orderBy(asc(dailyLogs.logDate), asc(dailyLogs.turn));

            // Filtrar por intervalo de datas em JS (evita imports adicionais de drizzle)
            const logs = (allLogs as any[]).filter((log) => {
              const logDate = new Date(log.logDate);
              if (logDate < period.start) return false;
              if (period.end && logDate >= period.end) return false;
              return true;
            });

            const daysInTent = period.end
              ? Math.floor((period.end.getTime() - period.start.getTime()) / (1000 * 60 * 60 * 24))
              : Math.floor((Date.now() - period.start.getTime()) / (1000 * 60 * 60 * 24));

            return {
              tentId: period.tentId,
              tentName: period.tentName,
              start: period.start.toISOString(),
              end: period.end?.toISOString() ?? null,
              daysInTent,
              logCount: logs.length,
              logs,
            };
          })
        );

        return periodsWithLogs;
      }),

    // Buscar fotos da planta
    getPhotos: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        
        const photos = await database
          .select()
          .from(plantPhotos)
          .where(eq(plantPhotos.plantId, input.plantId))
          .orderBy(desc(plantPhotos.createdAt));
        
        return photos;
      }),

    // Upload foto da planta
    uploadPhoto: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        imageData: z.string().max(20 * 1024 * 1024), // max ~15MB base64
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);

        // Converter base64 para Buffer
        const base64Data = input.imageData.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // Extensão segura a partir do enum validado
        const ext = input.mimeType.split('/')[1]; // seguro pois é enum

        // Upload para S3
        const { storagePut } = await import("../storage");
        const fileKey = `plants/${input.plantId}/${Date.now()}.${ext}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        
        // Salvar no banco
        const [insertResult] = await database
          .insert(plantPhotos)
          .values({
            plantId: input.plantId,
            photoUrl: url,
            photoKey: fileKey,
          });
        const insertedId = (insertResult as { insertId: number }).insertId;

        const [photo] = await database
          .select()
          .from(plantPhotos)
          .where(eq(plantPhotos.id, insertedId))
          .limit(1);

        return photo;
      }),

    // Excluir foto da planta
    deletePhoto: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        // Verificar ownership: buscar a foto e validar a planta associada
        const [photo] = await database
          .select({ plantId: plantPhotos.plantId })
          .from(plantPhotos)
          .where(eq(plantPhotos.id, input.id))
          .limit(1);
        if (!photo) throw new Error("Foto não encontrada");
        await validatePlantOwnership(photo.plantId, ctx.user.groupId);

        await database
          .delete(plantPhotos)
          .where(eq(plantPhotos.id, input.id));

        return { success: true };
      }),

    // Arquivar planta (marcar como HARVESTED ou DISCARDED)
    archive: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        status: z.enum(["HARVESTED", "DISCARDED"]),
        finishReason: z.string().max(1000).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        
        // Verificar se planta está ACTIVE
        const [plant] = await database
          .select()
          .from(plants)
          .where(eq(plants.id, input.plantId));
        
        if (!plant) {
          throw new Error("Planta não encontrada");
        }
        
        if (plant.status !== "ACTIVE") {
          throw new Error("Apenas plantas ativas podem ser arquivadas");
        }
        
        // Atualizar status e remover de estufa
        await database
          .update(plants)
          .set({
            status: input.status,
            finishedAt: new Date(),
            finishReason: input.finishReason,
            currentTentId: null as any, // Remove da estufa
          })
          .where(eq(plants.id, input.plantId));
        
        return { success: true };
      }),

    // Desarquivar planta (voltar para ACTIVE)
    unarchive: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        targetTentId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        await validateTentOwnership(input.targetTentId, ctx.user.groupId);
        
        // Verificar se planta está arquivada
        const [plant] = await database
          .select()
          .from(plants)
          .where(eq(plants.id, input.plantId));
        
        if (!plant) {
          throw new Error("Planta não encontrada");
        }
        
        if (plant.status === "ACTIVE") {
          throw new Error("Planta já está ativa");
        }
        
        // Restaurar para ACTIVE e colocar em estufa
        await database
          .update(plants)
          .set({
            status: "ACTIVE",
            finishedAt: null,
            finishReason: null,
            currentTentId: input.targetTentId,
          })
          .where(eq(plants.id, input.plantId));
        
        // Registrar histórico de movimentação
        await database.insert(plantTentHistory).values({
          plantId: input.plantId,
          fromTentId: null,
          toTentId: input.targetTentId,
          reason: "Planta restaurada do arquivo",
        });
        
        return { success: true };
      }),

    // Listar plantas arquivadas
    listArchived: protectedProcedure
      .input(z.object({
        status: z.enum(["HARVESTED", "DISCARDED", "DEAD"]).optional(),
      }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        if (ctx.user.groupId == null) throw new Error("Acesso negado: usuário sem grupo atribuído");

        const statusCondition = input.status
          ? eq(plants.status, input.status)
          : or(
              eq(plants.status, "HARVESTED"),
              eq(plants.status, "DISCARDED"),
              eq(plants.status, "DEAD")
            );

        const query = database
          .select()
          .from(plants)
          .where(and(statusCondition, eq(plants.groupId, ctx.user.groupId)))
          .orderBy(desc(plants.finishedAt));
        
        const archivedPlants = await query;
        if (archivedPlants.length === 0) return [];

        // Batch queries — sem N+1
        const plantIds    = archivedPlants.map((p: any) => p.id);
        const strainIds   = [...new Set(archivedPlants.map((p: any) => p.strainId).filter(Boolean))];
        const tentIds     = [...new Set(archivedPlants.map((p: any) => p.currentTentId).filter(Boolean))];

        const [strainsMap, lastPhotosRows, tentsRows, cyclesRows] = await Promise.all([
          // 1. Todas as strains de uma vez
          strainIds.length
            ? database.select({ id: strains.id, name: strains.name }).from(strains)
                .where(inArray(strains.id, strainIds as number[]))
            : Promise.resolve([]),

          // 2. Última foto de saúde por planta (subquery via ORDER + GROUP não suportado pelo Drizzle,
          //    então buscamos todas ordenadas e pegamos a primeira por plantId)
          database.select({ plantId: plantHealthLogs.plantId, photoUrl: plantHealthLogs.photoUrl })
            .from(plantHealthLogs)
            .where(inArray(plantHealthLogs.plantId, plantIds))
            .orderBy(desc(plantHealthLogs.logDate)),

          // 3. Todas as estufas relevantes
          tentIds.length
            ? database.select({ id: tents.id, name: tents.name }).from(tents)
                .where(inArray(tents.id, tentIds as number[]))
            : Promise.resolve([]),

          // 4. Ciclos finalizados mais recentes por estufa
          tentIds.length
            ? database.select({ tentId: cycles.tentId, harvestWeight: cycles.harvestWeight, harvestNotes: cycles.harvestNotes })
                .from(cycles)
                .where(and(inArray(cycles.tentId, tentIds as number[]), eq(cycles.status, "FINISHED")))
                .orderBy(desc(cycles.createdAt))
            : Promise.resolve([]),
        ]);

        // Montar mapas para lookup O(1)
        const strainById  = new Map((strainsMap as any[]).map(s => [s.id, s.name]));
        const tentNameById = new Map((tentsRows as any[]).map(t => [t.id, t.name]));
        const lastPhotoByPlant = new Map<number, string | null>();
        for (const row of lastPhotosRows as any[]) {
          if (!lastPhotoByPlant.has(row.plantId)) lastPhotoByPlant.set(row.plantId, row.photoUrl);
        }
        const cycleByTent = new Map<number, { harvestWeight: string | null; harvestNotes: string | null }>();
        for (const row of cyclesRows as any[]) {
          if (!cycleByTent.has(row.tentId)) cycleByTent.set(row.tentId, { harvestWeight: row.harvestWeight, harvestNotes: row.harvestNotes });
        }

        const plantsWithDetails = archivedPlants.map((plant: any) => ({
          ...plant,
          strainName: strainById.get(plant.strainId) || "Desconhecida",
          lastHealthPhotoUrl: lastPhotoByPlant.get(plant.id) || null,
          tentName: plant.currentTentId ? tentNameById.get(plant.currentTentId) || null : null,
          harvestWeight: plant.currentTentId ? cycleByTent.get(plant.currentTentId)?.harvestWeight || null : null,
          harvestNotes: plant.currentTentId ? cycleByTent.get(plant.currentTentId)?.harvestNotes || null : null,
        }));

        return plantsWithDetails;
      }),

    // Excluir planta permanentemente (apenas para erros de cadastro)
    deletePermanently: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);

        // Deletar todos os registros relacionados + planta em transação (cascade manual atômico)
        await database.transaction(async (tx: any) => {
          await tx.delete(plantHealthLogs).where(eq(plantHealthLogs.plantId, input.plantId));
          await tx.delete(plantTrichomeLogs).where(eq(plantTrichomeLogs.plantId, input.plantId));
          await tx.delete(plantLSTLogs).where(eq(plantLSTLogs.plantId, input.plantId));
          await tx.delete(plantPhotos).where(eq(plantPhotos.plantId, input.plantId));
          await tx.delete(plantObservations).where(eq(plantObservations.plantId, input.plantId));
          await tx.delete(plantTentHistory).where(eq(plantTentHistory.plantId, input.plantId));
          await tx.delete(plantRunoffLogs).where(eq(plantRunoffLogs.plantId, input.plantId));
          await tx.delete(plants).where(eq(plants.id, input.plantId));
        });

        return { success: true };
      }),
});

  // Plant Observations
export const plantObservationsRouter = router({
    create: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        content: z.string(),
        observationDate: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);

        await database.insert(plantObservations).values({
          plantId: input.plantId,
          content: input.content,
          ...(input.observationDate ? { observationDate: input.observationDate } : {}),
        });

        return { success: true };
      }),

    list: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);

        return await database
          .select()
          .from(plantObservations)
          .where(eq(plantObservations.plantId, input.plantId))
          .orderBy(desc(plantObservations.observationDate));
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        content: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        // Ownership via planta associada
        const [obs] = await database
          .select({ plantId: plantObservations.plantId })
          .from(plantObservations)
          .where(eq(plantObservations.id, input.id))
          .limit(1);
        if (!obs) throw new Error("Observação não encontrada");
        await validatePlantOwnership(obs.plantId, ctx.user.groupId);

        await database
          .update(plantObservations)
          .set({ content: input.content })
          .where(eq(plantObservations.id, input.id));

        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        const [obs] = await database
          .select({ plantId: plantObservations.plantId })
          .from(plantObservations)
          .where(eq(plantObservations.id, input.id))
          .limit(1);
        if (!obs) throw new Error("Observação não encontrada");
        await validatePlantOwnership(obs.plantId, ctx.user.groupId);

        await database
          .delete(plantObservations)
          .where(eq(plantObservations.id, input.id));

        return { success: true };
      }),
});

  // Plant Photos
export const plantPhotosRouter = router({
    list: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);

        // Fotos dedicadas (tabela plantPhotos)
        const galleryPhotos = await database
          .select()
          .from(plantPhotos)
          .where(eq(plantPhotos.plantId, input.plantId))
          .orderBy(desc(plantPhotos.photoDate));

        // Fotos dos registros de saúde (plantHealthLogs que têm photoUrl)
        const healthPhotos = await database
          .select({
            id: plantHealthLogs.id,
            plantId: plantHealthLogs.plantId,
            photoUrl: plantHealthLogs.photoUrl,
            photoKey: plantHealthLogs.photoKey,
            description: plantHealthLogs.notes,
            photoDate: plantHealthLogs.logDate,
            createdAt: plantHealthLogs.createdAt,
            healthStatus: plantHealthLogs.healthStatus,
          })
          .from(plantHealthLogs)
          .where(and(
            eq(plantHealthLogs.plantId, input.plantId),
            isNotNull(plantHealthLogs.photoUrl)
          ))
          .orderBy(desc(plantHealthLogs.logDate));

        // Unificar com source tag
        const unified = [
          ...galleryPhotos.map((p: any) => ({ ...p, source: "gallery" as const, cycleId: p.cycleId ?? null, weekNumber: p.weekNumber ?? null, healthStatus: null })),
          ...healthPhotos.map((p: any) => ({ ...p, source: "health" as const, cycleId: null, weekNumber: null })),
        ].sort((a, b) => new Date(b.photoDate).getTime() - new Date(a.photoDate).getTime());

        return unified;
      }),

    upload: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        photoBase64: z.string(), // Base64 data URL
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);

        // Auto-capture active cycle and week for this plant
        let capturedCycleId: number | undefined;
        let capturedWeekNumber: number | undefined;
        try {
          const plant = await database.select({ currentTentId: plants.currentTentId }).from(plants).where(eq(plants.id, input.plantId)).limit(1);
          if (plant[0]?.currentTentId) {
            const cycle = await database.select({ id: cycles.id, startDate: cycles.startDate, floraStartDate: cycles.floraStartDate })
              .from(cycles).where(and(eq(cycles.tentId, plant[0].currentTentId), eq(cycles.status, 'ACTIVE'))).limit(1);
            if (cycle[0]) {
              capturedCycleId = cycle[0].id;
              const now = new Date();
              const floraStart = cycle[0].floraStartDate ? new Date(cycle[0].floraStartDate) : null;
              const refDate = floraStart && now >= floraStart ? floraStart : new Date(cycle[0].startDate);
              capturedWeekNumber = Math.max(1, Math.floor((now.getTime() - refDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
            }
          }
        } catch {}

        let photoUrl: string | undefined;
        let photoKey: string | undefined;

        // Upload foto para storage
        try {
          // Remover prefixo data:image/...;base64,
          const base64Data = input.photoBase64.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, 'base64');
          
          // Upload para storage local
          const { storagePut } = await import("../storage");
          photoKey = `plants/${input.plantId}/${Date.now()}.jpg`;
          const result = await storagePut(photoKey, buffer, "image/jpeg");
          photoUrl = result.url;
        } catch (error) {
          console.error('Erro ao fazer upload da foto:', error);
          throw new Error('Falha ao salvar foto');
        }
        
        await database.insert(plantPhotos).values({
          plantId: input.plantId,
          photoUrl,
          photoKey,
          cycleId: capturedCycleId,
          weekNumber: capturedWeekNumber,
          description: input.description,
          photoDate: new Date(),
        });
        
        return { success: true, photoUrl };
      }),
    
    // Salvar URL de foto já enviada para o storage via /api/upload/image
    saveUrl: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        photoUrl: z.string().url(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);

        // Auto-capture ciclo ativo e semana da planta
        let capturedCycleId: number | undefined;
        let capturedWeekNumber: number | undefined;
        try {
          const plant = await database.select({ currentTentId: plants.currentTentId }).from(plants).where(eq(plants.id, input.plantId)).limit(1);
          if (plant[0]?.currentTentId) {
            const cycle = await database.select({ id: cycles.id, startDate: cycles.startDate, floraStartDate: cycles.floraStartDate })
              .from(cycles).where(and(eq(cycles.tentId, plant[0].currentTentId), eq(cycles.status, 'ACTIVE'))).limit(1);
            if (cycle[0]) {
              capturedCycleId = cycle[0].id;
              const now = new Date();
              const floraStart = cycle[0].floraStartDate ? new Date(cycle[0].floraStartDate) : null;
              const refDate = floraStart && now >= floraStart ? floraStart : new Date(cycle[0].startDate);
              capturedWeekNumber = Math.max(1, Math.floor((now.getTime() - refDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
            }
          }
        } catch {}

        await database.insert(plantPhotos).values({
          plantId: input.plantId,
          photoUrl: input.photoUrl,
          cycleId: capturedCycleId,
          weekNumber: capturedWeekNumber,
          description: input.description,
          photoDate: new Date(),
        });

        return { success: true, photoUrl: input.photoUrl };
      }),

    delete: protectedProcedure
      .input(z.object({ photoId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        // Verificar ownership: buscar a foto e validar a planta associada
        const [photo] = await database
          .select({ plantId: plantPhotos.plantId })
          .from(plantPhotos)
          .where(eq(plantPhotos.id, input.photoId))
          .limit(1);
        if (!photo) throw new Error("Foto não encontrada");
        await validatePlantOwnership(photo.plantId, ctx.user.groupId);

        await database
          .delete(plantPhotos)
          .where(eq(plantPhotos.id, input.photoId));

        return { success: true };
      }),
});

  // Plant Runoff Logs
export const plantRunoffRouter = router({
    create: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        volumeIn: z.number(),
        volumeOut: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        
        const runoffPercent = (input.volumeOut / input.volumeIn) * 100;
        
        await database.insert(plantRunoffLogs).values({
          plantId: input.plantId,
          volumeIn: input.volumeIn.toString(),
          volumeOut: input.volumeOut.toString(),
          runoffPercent: runoffPercent.toFixed(2),
          notes: input.notes,
        });
        
        return { success: true, runoffPercent };
      }),

    list: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);

        return await database
          .select()
          .from(plantRunoffLogs)
          .where(eq(plantRunoffLogs.plantId, input.plantId))
          .orderBy(desc(plantRunoffLogs.logDate));
      }),
});

  // Plant Health Logs
export const plantHealthRouter = router({
    create: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        healthStatus: z.enum(["HEALTHY", "STRESSED", "SICK", "RECOVERING"]),
        symptoms: z.string().optional(),
        treatment: z.string().optional(),
        notes: z.string().optional(),
        photoUrl: z.string().optional(),   // URL ou caminho relativo da foto enviada via /api/upload/image
        photoBase64: z.string().optional(),       // Legado: base64 (mantido para compatibilidade)
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);

        let resolvedPhotoUrl: string | undefined = input.photoUrl; // preferência: URL pré-enviada
        let photoKey: string | undefined;

        // Fallback legado: base64 (caso o frontend antigo ainda envie)
        if (!resolvedPhotoUrl && input.photoBase64) {
          console.log('[PlantHealth.create] Fallback base64 upload...');
          try {
            const base64Data = input.photoBase64.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            const { storagePut } = await import("../storage");
            photoKey = `health/${input.plantId}/${Date.now()}.jpg`;
            const result = await storagePut(photoKey, buffer, "image/jpeg");
            resolvedPhotoUrl = result.url;
          } catch (error: any) {
            console.error('[PlantHealth] Base64 fallback upload failed:', error.message);
          }
        }

        // Garante photoKey preenchido pra fotos locais (`/uploads/<key>`),
        // mesmo no caminho moderno onde só vem photoUrl. Endpoint device
        // (/api/device/plant/:id/photo) já cobre o caso photoKey=null
        // derivando do photoUrl, mas preencher aqui evita falsos
        // negativos em queries futuras que filtrem por photoKey.
        if (!photoKey && resolvedPhotoUrl?.startsWith('/uploads/')) {
          photoKey = resolvedPhotoUrl.replace(/^\/uploads\//, '');
        }

        await database.insert(plantHealthLogs).values({
          plantId: input.plantId,
          healthStatus: input.healthStatus,
          symptoms: input.symptoms,
          treatment: input.treatment,
          notes: input.notes,
          photoUrl: resolvedPhotoUrl,
          photoKey,
        });

        return { success: true };
      }),

    list: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);

        return await database
          .select()
          .from(plantHealthLogs)
          .where(eq(plantHealthLogs.plantId, input.plantId))
          .orderBy(desc(plantHealthLogs.logDate));
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        healthStatus: z.enum(["HEALTHY", "STRESSED", "SICK", "RECOVERING"]).optional(),
        symptoms: z.string().optional(),
        treatment: z.string().optional(),
        notes: z.string().optional(),
        photoUrl: z.string().optional(),  // URL ou caminho relativo da foto enviada via /api/upload/image
        removePhoto: z.boolean().optional(),    // true = remover foto existente
        photoBase64: z.string().optional(),     // Legado: base64 (compatibilidade)
      }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const updateData: any = {};
        
        if (input.healthStatus) updateData.healthStatus = input.healthStatus;
        if (input.symptoms !== undefined) updateData.symptoms = input.symptoms;
        if (input.treatment !== undefined) updateData.treatment = input.treatment;
        if (input.notes !== undefined) updateData.notes = input.notes;
        
        // Nova foto via URL S3 pré-enviada
        if (input.photoUrl) {
          updateData.photoUrl = input.photoUrl;
        } else if (input.removePhoto) {
          updateData.photoUrl = null;
          updateData.photoKey = null;
        } else if (input.photoBase64) {
          // Fallback legado: base64
          try {
            const [currentLog] = await database
              .select()
              .from(plantHealthLogs)
              .where(eq(plantHealthLogs.id, input.id));
            
            if (currentLog) {
              const base64Data = input.photoBase64.replace(/^data:image\/\w+;base64,/, "");
              const buffer = Buffer.from(base64Data, 'base64');
              const { storagePut } = await import("../storage");
              const photoKey = `health/${currentLog.plantId}/${Date.now()}.jpg`;
              const result = await storagePut(photoKey, buffer, "image/jpeg");
              updateData.photoUrl = result.url;
              updateData.photoKey = photoKey;
            }
          } catch (error) {
            console.error('Erro ao fazer upload da nova foto (base64 fallback):', error);
          }
        }
        
        await database
          .update(plantHealthLogs)
          .set(updateData)
          .where(eq(plantHealthLogs.id, input.id));
        
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Opcional: deletar foto do storage também
        // const [log] = await database.select().from(plantHealthLogs).where(eq(plantHealthLogs.id, input.id));
        // if (log?.photoKey) {
        //   const { storageDelete } = await import('./storage');
        //   await storageDelete(log.photoKey);
        // }
        
        await database
          .delete(plantHealthLogs)
          .where(eq(plantHealthLogs.id, input.id));
        
        return { success: true };
      }),
});

  // Plant Trichome Logs
export const plantTrichomesRouter = router({
    create: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        weekNumber: z.number(),
        trichomeStatus: z.enum(["CLEAR", "CLOUDY", "AMBER", "MIXED"]),
        clearPercent: z.number().optional(),
        cloudyPercent: z.number().optional(),
        amberPercent: z.number().optional(),
        notes: z.string().optional(),
        photoUrl: z.string().optional(),  // URL ou caminho relativo da foto enviada via /api/upload/image
        photoBase64: z.string().optional(),     // Legado: base64 (compatibilidade)
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        
        let resolvedPhotoUrl: string | undefined = input.photoUrl;
        let photoKey: string | undefined;

        // Fallback legado: base64
        if (!resolvedPhotoUrl && input.photoBase64) {
          try {
            const base64Data = input.photoBase64.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            const { storagePut } = await import("../storage");
            photoKey = `trichomes/${input.plantId}/${Date.now()}.jpg`;
            const result = await storagePut(photoKey, buffer, "image/jpeg");
            resolvedPhotoUrl = result.url;
          } catch (error: any) {
            console.error('[PlantTrichomes] Base64 fallback upload failed:', error.message);
          }
        }

        // Garante photoKey preenchido pra fotos locais (`/uploads/<key>`),
        // mesmo no caminho moderno onde so vem photoUrl. Mesmo fix do
        // plantHealth.create — previne queries que filtram por photoKey
        // de perder esses uploads. Trichomes ainda nao tem endpoint
        // device, mas mantem consistencia.
        if (!photoKey && resolvedPhotoUrl?.startsWith('/uploads/')) {
          photoKey = resolvedPhotoUrl.replace(/^\/uploads\//, '');
        }

        // Nota: weekNumber não é persistido (schema não tem essa coluna).
        // Pode ser derivado de logDate vs cycle.startDate quando precisar.
        await database.insert(plantTrichomeLogs).values({
          plantId: input.plantId,
          trichomeStatus: input.trichomeStatus,
          clearPercent: input.clearPercent,
          cloudyPercent: input.cloudyPercent,
          amberPercent: input.amberPercent,
          notes: input.notes,
          photoUrl: resolvedPhotoUrl,
          photoKey,
        });
        
        return { success: true };
      }),

    list: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);

        return await database
          .select()
          .from(plantTrichomeLogs)
          .where(eq(plantTrichomeLogs.plantId, input.plantId))
          .orderBy(desc(plantTrichomeLogs.logDate));
      }),
});

  // Plant LST Logs
export const plantLSTRouter = router({
    create: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        technique: z.string(),
        response: z.string().optional(),
        notes: z.string().optional(),
        nodePosition: z.string().optional(),
        techniqueConfig: z.object({
          expectedTops: z.number(),
          recoveryDays: z.number(),
        }).optional(),
        snapshotJson: z.string().optional(), // PlantGraphNode[] serializado
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);

        const baseValues = {
          plantId: input.plantId,
          technique: input.technique,
          response: input.response,
          notes: input.notes,
          nodePosition: input.nodePosition,
          techniqueConfig: input.techniqueConfig ? JSON.stringify(input.techniqueConfig) : null,
          actualResult: null as null,
        };

        try {
          // Tenta inserir com snapshotJson (requer migration: ALTER TABLE ADD COLUMN snapshotJson)
          await database.insert(plantLSTLogs).values({
            ...baseValues,
            ...(input.snapshotJson != null ? { snapshotJson: input.snapshotJson } : {}),
          });
        } catch (e: any) {
          // Fallback: coluna snapshotJson ainda não existe na DB (migration pendente)
          if (e?.message?.includes('snapshotJson') || e?.errno === 1054) {
            await database.insert(plantLSTLogs).values(baseValues);
          } else {
            throw e;
          }
        }

        return { success: true };
      }),

    /** Insere múltiplas técnicas de uma sessão em um único request (substituiu N calls ao create) */
    createBatch: protectedProcedure
      .input(z.object({
        plantId:    z.number(),
        techniques: z.array(z.object({
          technique:       z.string(),
          response:        z.string().optional(),
          notes:           z.string().optional(),
          nodePosition:    z.string().optional(),
          techniqueConfig: z.object({
            expectedTops: z.number(),
            recoveryDays: z.number(),
          }).optional(),
        })).min(1).max(50),
        snapshotJson: z.string().optional(), // snapshot compartilhado por toda a sessão
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);

        const rows = input.techniques.map(t => ({
          plantId:         input.plantId,
          technique:       t.technique,
          response:        t.response        ?? null,
          notes:           t.notes           ?? null,
          nodePosition:    t.nodePosition    ?? null,
          techniqueConfig: t.techniqueConfig ? JSON.stringify(t.techniqueConfig) : null,
          actualResult:    null as null,
          snapshotJson:    input.snapshotJson ?? null,
        }));

        await database.insert(plantLSTLogs).values(rows);
        return { success: true, count: rows.length };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        plantId: z.number(),
        actualResult: z.object({
          actualTops: z.number(),
          vigor: z.enum(["low", "medium", "high"]),
          confirmedAt: z.string(),
        }).optional(),
        notes: z.string().optional(),
        response: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);

        await database
          .update(plantLSTLogs)
          .set({
            ...(input.actualResult !== undefined && {
              actualResult: JSON.stringify(input.actualResult),
            }),
            ...(input.notes !== undefined && { notes: input.notes }),
            ...(input.response !== undefined && { response: input.response }),
          })
          .where(eq(plantLSTLogs.id, input.id));

        return { success: true };
      }),

    list: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);

        const rows = await database
          .select()
          .from(plantLSTLogs)
          .where(eq(plantLSTLogs.plantId, input.plantId))
          .orderBy(desc(plantLSTLogs.logDate));

        // Parse JSON text columns
        return rows.map((r: any) => ({
          ...r,
          techniqueConfig: r.techniqueConfig ? JSON.parse(r.techniqueConfig as string) : null,
          actualResult:    r.actualResult    ? JSON.parse(r.actualResult    as string) : null,
          snapshotJson:    (() => {
            try { return r.snapshotJson ? JSON.parse(r.snapshotJson as string) : null; }
            catch { return null; }
          })(),
        }));
      }),

    stats: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);

        const logs = await database
          .select()
          .from(plantLSTLogs)
          .where(eq(plantLSTLogs.plantId, input.plantId));

        const byTechnique: Record<string, number> = {};
        for (const log of logs) {
          const key = log.technique;
          byTechnique[key] = (byTechnique[key] ?? 0) + 1;
        }

        return {
          total: logs.length,
          byTechnique,
          lastTrainingDate: logs[0]?.logDate ?? null,
        };
      }),

    deleteLog: protectedProcedure
      .input(z.object({ id: z.number(), plantId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        await database.delete(plantLSTLogs).where(eq(plantLSTLogs.id, input.id));
        return { success: true };
      }),

    clearLogs: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        await database.delete(plantLSTLogs).where(eq(plantLSTLogs.plantId, input.plantId));
        return { success: true };
      }),
});

  // CannaPrune — Plant Structure (nós interativos da planta)

  // ── Zod schema para PlantGraphNode (validação server-side) ──────────────────
  // Previne stored-XSS: z.array(z.any()) aceitaria qualquer payload
  // ───────────────────────────────────────────────────────────────────────────

export const plantStructureRouter = router({
    /** Retorna a estrutura salva da planta, ou null se ainda não foi criada */
    get: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .query(async ({ input, ctx }) => {
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        const database = await getDb();
        if (!database) throw new Error('Banco indisponível');
        const [row] = await database
          .select()
          .from(plantStructures)
          .where(eq(plantStructures.plantId, input.plantId))
          .limit(1);
        if (!row) return null;
        return {
          id: row.id,
          plantId: row.plantId,
          nodes: JSON.parse(row.nodesJson as string),
          potSizeL: (row.potSizeL as number | null) ?? 5,
          updatedAt: row.updatedAt,
        };
      }),

    /** Salva (upsert) a estrutura da planta */
    save: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        // Validação tipada previne stored-XSS (substituiu z.array(z.any()))
        nodes: z.array(z.object({
          id:             z.string().min(1).max(128),
          parentId:       z.string().min(1).max(128).nullable(),
          type:           z.enum(['root', 'internode', 'top']),
          state:          z.enum(['active', 'topped', 'fimmed', 'lst', 'super-cropped']),
          nodeNumber:     z.number().int().min(0).max(9999),
          technique:      z.enum(['topping', 'fim', 'lst', 'super-crop']).optional(),
          edgeCtrl:       z.object({ dx1: z.number(), dy1: z.number(), dx2: z.number(), dy2: z.number() }).optional(),
          edgeState:      z.enum(['active', 'defoliated', 'recovering']).optional(),
          edgeModifiedAt: z.string().max(64).optional(),
          posX:           z.number().optional(),
          posY:           z.number().optional(),
          pos3D:          z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
          branchBend:     z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
          lstAppliedAt:   z.string().max(64).optional(),
        }))
        .max(500, 'Máximo de 500 nós por planta')
        .superRefine((nodes, ctx) => {
          const ids = new Set(nodes.map(n => n.id));
          if (ids.size !== nodes.length) {
            ctx.addIssue({ code: 'custom', message: 'IDs de nós duplicados' });
            return;
          }
          const roots = nodes.filter(n => n.parentId === null);
          if (roots.length > 1) {
            ctx.addIssue({ code: 'custom', message: 'Apenas um nó raiz é permitido' });
          }
          for (const node of nodes) {
            if (node.parentId !== null && !ids.has(node.parentId)) {
              ctx.addIssue({ code: 'custom', message: `parentId "${node.parentId}" não existe nos nós` });
            }
          }
        }),
      }))
      .mutation(async ({ input, ctx }) => {
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        const database = await getDb();
        if (!database) throw new Error('Banco indisponível');
        const nodesJson = JSON.stringify(input.nodes);
        const existing = await database
          .select({ id: plantStructures.id })
          .from(plantStructures)
          .where(eq(plantStructures.plantId, input.plantId))
          .limit(1);
        if (existing.length > 0) {
          await database
            .update(plantStructures)
            .set({ nodesJson })
            .where(eq(plantStructures.plantId, input.plantId));
        } else {
          await database.insert(plantStructures).values({
            plantId: input.plantId,
            nodesJson,
          });
        }
        return { success: true };
      }),

    /** Atualiza apenas o tamanho do vaso (sem reescrever os nós) */
    savePotSize: protectedProcedure
      .input(z.object({
        plantId:  z.number(),
        potSizeL: z.number().positive().max(200),
      }))
      .mutation(async ({ input, ctx }) => {
        await validatePlantOwnership(input.plantId, ctx.user.groupId);
        const database = await getDb();
        if (!database) throw new Error('Banco indisponível');
        const existing = await database
          .select({ id: plantStructures.id })
          .from(plantStructures)
          .where(eq(plantStructures.plantId, input.plantId))
          .limit(1);
        if (existing.length > 0) {
          await database
            .update(plantStructures)
            .set({ potSizeL: input.potSizeL })
            .where(eq(plantStructures.plantId, input.plantId));
        } else {
          await database.insert(plantStructures).values({
            plantId:   input.plantId,
            nodesJson: JSON.stringify([]),
            potSizeL:  input.potSizeL,
          });
        }
        return { success: true };
      }),
});
