import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { getUserById, updateUserProfile, updateUserPassword, getUserByEmail } from "./db-auth";
import { hashPassword, comparePassword } from "./_core/auth";
import { users } from "../drizzle/schema";
import { saveSubscription, sendPushToUser, getVapidPublicKey, isPushConfigured } from "./pushService";
import { z } from "zod";
import { eq, and, or, desc, asc, sql, isNotNull, inArray } from "drizzle-orm";
import * as db from "./db";
import { getDb, applyPhaseTransitionLimits } from "./db";
import {
  tents,
  strains,
  cycles,
  dailyLogs,
  recipes,
  alerts,
  weeklyTargets,
  taskInstances,
  taskTemplates,
  tentAState,
  cloningEvents,
  alertSettings,
  alertHistory,
  notificationHistory,
  plants,
  plantTentHistory,
  plantObservations,
  plantPhotos,
  plantRunoffLogs,
  plantHealthLogs,
  plantTrichomeLogs,
  plantLSTLogs,
  fertilizationPresets,
  wateringPresets,
  recipeTemplates,
  nutrientApplications,
  wateringApplications,
  groups,
} from "../drizzle/schema";
import { nanoid } from "nanoid";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    // Simplified auth for standalone deployment
    me: protectedProcedure.query(() => ({ id: 1, name: "Local User", email: "user@local" })),
    logout: protectedProcedure.mutation(() => ({ success: true })),
  }),

  // Weather (Clima)
  weather: router({
    getCurrent: protectedProcedure
      .input(z.object({ lat: z.number(), lon: z.number() }))
      .query(async ({ input }) => {
        const { lat, lon } = input;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto`;
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Failed to fetch weather data');
        }
        
        const data = await response.json();
        return {
          temperature: data.current.temperature_2m,
          humidity: data.current.relative_humidity_2m,
          weatherCode: data.current.weather_code,
          time: data.current.time,
        };
      }),
  }),

  // Tents (Estufas)
  tents: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getAllTents(ctx.user.groupId);
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const database = await getDb();
      if (!database) throw new Error("DB not available");
      const tent = await db.getTentById(input.id);
      if (!tent) return undefined;
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
          width: z.number().int().positive(),
          depth: z.number().int().positive(),
          height: z.number().int().positive(),
          powerW: z.number().int().positive().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        
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
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado.");
        }
        
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
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
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
        
        // Buscar todos os ciclos da estufa (ativos e finalizados)
        const allCycles = await database
          .select({ id: cycles.id })
          .from(cycles)
          .where(eq(cycles.tentId, input.id));
        
        const cycleIds = allCycles.map((c: any) => c.id);
        
        // Tudo dentro de uma transação — se qualquer delete falhar,
        // o banco volta ao estado original automaticamente.
        await database.transaction(async (tx) => {
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
          await tx.delete(tents).where(eq(tents.id, input.id));
        });

        return { success: true };
      }),
  }),

  // Strains (Variedades)
  strains: router({
    list: protectedProcedure.query(async () => {
      return db.getAllStrains();
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return db.getStrainById(input.id);
    }),
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(100),
          description: z.string().optional(),
          vegaWeeks: z.number().min(1).max(12),
          floraWeeks: z.number().min(1).max(16),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        
        // Check if strain name already exists
        const existing = await database.select().from(strains).where(eq(strains.name, input.name));
        if (existing.length > 0) {
          throw new Error(`Já existe uma strain com o nome "${input.name}". Por favor, escolha outro nome.`);
        }
        
        await database.insert(strains).values(input);
        return { success: true };
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(100).optional(),
          description: z.string().optional(),
          vegaWeeks: z.number().min(1).max(12).optional(),
          floraWeeks: z.number().min(1).max(16).optional(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        const { id, ...updateData } = input;
        await database.update(strains).set(updateData).where(eq(strains.id, id));
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        
        // Check if strain is used in any cycles
        const cyclesWithStrain = await database.select().from(cycles).where(eq(cycles.strainId, input.id));
        if (cyclesWithStrain.length > 0) {
          throw new Error("Não é possível excluir esta strain pois ela está vinculada a ciclos existentes. Finalize ou exclua os ciclos primeiro.");
        }
        
        // Check if strain is used in any plants
        const plantsWithStrain = await database.select().from(plants).where(eq(plants.strainId, input.id));
        if (plantsWithStrain.length > 0) {
          throw new Error("Não é possível excluir esta strain pois ela está vinculada a plantas existentes. Remova as plantas primeiro.");
        }
        
        await database.delete(strains).where(eq(strains.id, input.id));
        return { success: true };
      }),
    duplicate: protectedProcedure
      .input(
        z.object({
          sourceStrainId: z.number(),
          name: z.string().min(1).max(100),
          description: z.string().optional(),
          vegaWeeks: z.number().min(1).max(12),
          floraWeeks: z.number().min(1).max(16),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        
        // Criar nova strain
        const [newStrain] = await database.insert(strains).values({
          name: input.name,
          description: input.description,
          vegaWeeks: input.vegaWeeks,
          floraWeeks: input.floraWeeks,
          isActive: true,
        }).$returningId();
        
        // Copiar todos os targets da strain original
        const sourceTargets = await database
          .select()
          .from(weeklyTargets)
          .where(eq(weeklyTargets.strainId, input.sourceStrainId));
        
        if (sourceTargets.length > 0) {
          const newTargets = sourceTargets.map((target: any) => ({
            strainId: newStrain.id,
            phase: target.phase,
            weekNumber: target.weekNumber,
            tempMin: target.tempMin,
            tempMax: target.tempMax,
            rhMin: target.rhMin,
            rhMax: target.rhMax,
            ppfdMin: target.ppfdMin,
            ppfdMax: target.ppfdMax,
            photoperiod: target.photoperiod,
            phMin: target.phMin,
            phMax: target.phMax,
            ecMin: target.ecMin,
            ecMax: target.ecMax,
          }));
          
          await database.insert(weeklyTargets).values(newTargets);
        }
        
        return { success: true, newStrainId: newStrain.id };
      }),
  }),

  // Cycles (Ciclos)
  cycles: router({
    listActive: protectedProcedure.query(async () => {
      const allCycles = await db.getAllCycles();
      return allCycles.filter(c => c.status === "ACTIVE");
    }),
    getActiveCyclesWithProgress: protectedProcedure.query(async () => {
      const database = await getDb();
      if (!database) {
        throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
      }
      
      // Buscar ciclos ativos com tent e strain
      const activeCycles = await database
        .select({
          id: cycles.id,
          tentId: cycles.tentId,
          tentName: tents.name,
          tentCategory: tents.category,
          strainId: cycles.strainId,
          strainName: strains.name,
          startDate: cycles.startDate,
          cloningStartDate: cycles.cloningStartDate,
          floraStartDate: cycles.floraStartDate,
          status: cycles.status,
          vegaWeeks: strains.vegaWeeks,
          floraWeeks: strains.floraWeeks,
        })
        .from(cycles)
        .leftJoin(tents, eq(cycles.tentId, tents.id))
        .leftJoin(strains, eq(cycles.strainId, strains.id))
        .where(eq(cycles.status, "ACTIVE"));
      
      const now = new Date();
      
      return activeCycles.map((cycle: any) => {
        const startDate = new Date(cycle.startDate);
        const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        
        let currentWeek = 1;
        let totalWeeks = cycle.vegaWeeks || 4;
        let phase: 'MAINTENANCE' | 'CLONING' | 'VEGA' | 'FLORA' = 'VEGA';
        let daysUntilHarvest = 0;
        
        // Detectar fase baseado nos campos de data
        if (cycle.tentCategory === 'MAINTENANCE') {
          // Ciclo de manutenção/clonagem
          if (cycle.cloningStartDate) {
            phase = 'CLONING';
            const cloningStartDate = new Date(cycle.cloningStartDate);
            const daysSinceCloning = Math.floor((now.getTime() - cloningStartDate.getTime()) / (1000 * 60 * 60 * 24));
            currentWeek = Math.floor(daysSinceCloning / 7) + 1;
            totalWeeks = 2; // 2 semanas de clonagem
          } else {
            phase = 'MAINTENANCE';
            currentWeek = Math.floor(daysSinceStart / 7) + 1;
            totalWeeks = 999; // Manutenção contínua
          }
          daysUntilHarvest = 0; // Não se aplica
        } else if (cycle.floraStartDate) {
          // Ciclo em floração
          const floraStartDate = new Date(cycle.floraStartDate);
          const daysSinceFlora = Math.floor((now.getTime() - floraStartDate.getTime()) / (1000 * 60 * 60 * 24));
          currentWeek = Math.floor(daysSinceFlora / 7) + 1;
          totalWeeks = cycle.floraWeeks || 8;
          phase = 'FLORA';
          daysUntilHarvest = Math.max(0, (totalWeeks * 7) - daysSinceFlora);
        } else {
          // Ciclo em vegetação
          currentWeek = Math.floor(daysSinceStart / 7) + 1;
          totalWeeks = cycle.vegaWeeks || 4;
          phase = 'VEGA';
          daysUntilHarvest = ((cycle.vegaWeeks || 4) * 7) + ((cycle.floraWeeks || 8) * 7) - daysSinceStart;
        }
        
        const progress = Math.min(100, (currentWeek / totalWeeks) * 100);
        const estimatedHarvestDate = new Date(now.getTime() + (daysUntilHarvest * 24 * 60 * 60 * 1000));
        
        return {
          ...cycle,
          currentWeek,
          totalWeeks,
          phase,
          progress: Math.round(progress),
          daysUntilHarvest,
          estimatedHarvestDate,
        };
      });
    }),
    getByTent: protectedProcedure.input(z.object({ tentId: z.number() })).query(async ({ input }) => {
      return db.getCycleByTentId(input.tentId);
    }),
    create: protectedProcedure
      .input(
        z.object({
          tentId: z.number(),
          strainId: z.number().optional().nullable(),
          startDate: z.date(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        await database.insert(cycles).values(input);
        return { success: true };
      }),
    transitionToFlora: protectedProcedure
      .input(
        z.object({
          cycleId: z.number(),
          floraStartDate: z.date(),
          targetTentId: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        
        // Buscar ciclo atual
        const [cycle] = await database
          .select()
          .from(cycles)
          .where(eq(cycles.id, input.cycleId));
        
        if (!cycle) {
          throw new Error("Ciclo não encontrado");
        }
        
        if (cycle.floraStartDate) {
          throw new Error("Ciclo já está em floração");
        }
        
        // Atualizar ciclo com floraStartDate
        await database
          .update(cycles)
          .set({ floraStartDate: input.floraStartDate })
          .where(eq(cycles.id, input.cycleId));
        
        // Se targetTentId fornecido, mover plantas e atualizar estufa do ciclo
        if (input.targetTentId) {
          // Mover todas as plantas do ciclo para nova estufa
          await database
            .update(plants)
            .set({ currentTentId: input.targetTentId })
            .where(eq(plants.currentTentId, cycle.tentId));
          
          // Atualizar estufa do ciclo
          await database
            .update(cycles)
            .set({ tentId: input.targetTentId })
            .where(eq(cycles.id, input.cycleId));
          
          // Atualizar categoria da estufa de destino para FLORA
          await database
            .update(tents)
            .set({ category: "FLORA" })
            .where(eq(tents.id, input.targetTentId));
          
          // Ajustar margens de alerta automaticamente para FLORA
          await applyPhaseTransitionLimits(input.targetTentId, "FLORA");
        } else {
          // Sem mudança de estufa: ajustar margens da estufa atual para FLORA
          await applyPhaseTransitionLimits(cycle.tentId, "FLORA");
        }
        
        return { success: true };
      }),
    finalize: protectedProcedure
      .input(z.object({ cycleId: z.number() }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        await database
          .update(cycles)
          .set({ status: "FINISHED" })
          .where(eq(cycles.id, input.cycleId));
        return { success: true };
      }),
    transitionToDrying: protectedProcedure
      .input(
        z.object({
          cycleId: z.number(),
          dryingStartDate: z.date(),
          targetTentId: z.number().optional(),
          harvestNotes: z.string().optional(),
          harvestWeight: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        
        // Buscar ciclo atual
        const [cycle] = await database
          .select()
          .from(cycles)
          .where(eq(cycles.id, input.cycleId));
        
        if (!cycle) {
          throw new Error("Ciclo não encontrado");
        }
        
        if (!cycle.floraStartDate) {
          throw new Error("Ciclo não está em floração");
        }
        
        // Finalizar ciclo atual e salvar dados de colheita
        await database
          .update(cycles)
          .set({ 
            status: "FINISHED",
            harvestWeight: input.harvestWeight ? input.harvestWeight.toString() : null,
            harvestNotes: input.harvestNotes || null,
          })
          .where(eq(cycles.id, input.cycleId));
        
        // Buscar plantas do ciclo
        const cyclePlants = await database
          .select()
          .from(plants)
          .where(eq(plants.currentTentId, cycle.tentId));
        
        // Marcar plantas como HARVESTED e adicionar notas
        await database
          .update(plants)
          .set({ 
            status: "HARVESTED",
            finishedAt: input.dryingStartDate,
            finishReason: input.harvestNotes || "Colhida e iniciada secagem"
          })
          .where(eq(plants.currentTentId, cycle.tentId));
        
        // Se targetTentId fornecido, criar ciclo de secagem e mover plantas
        if (input.targetTentId) {
          // Criar novo ciclo de secagem
          await database.insert(cycles).values({
            tentId: input.targetTentId,
            strainId: cycle.strainId,
            startDate: input.dryingStartDate,
            status: "ACTIVE",
          });
          
          // Mover plantas para estufa de secagem
          await database
            .update(plants)
            .set({ currentTentId: input.targetTentId })
            .where(eq(plants.currentTentId, cycle.tentId));
          
          // Atualizar categoria da estufa de destino para DRYING
          await database
            .update(tents)
            .set({ category: "DRYING" })
            .where(eq(tents.id, input.targetTentId));
          
          // Ajustar margens de alerta automaticamente para DRYING
          await applyPhaseTransitionLimits(input.targetTentId, "DRYING");
          
          // Resetar categoria da estufa original para FLORA (vazia, disponível)
          await database
            .update(tents)
            .set({ category: "FLORA" })
            .where(eq(tents.id, cycle.tentId));
        } else {
          // Sem estufa destino: a estufa original vira DRYING na mesma estufa
          await database
            .update(tents)
            .set({ category: "DRYING" })
            .where(eq(tents.id, cycle.tentId));
          // Criar novo ciclo de secagem na mesma estufa
          await database.insert(cycles).values({
            tentId: cycle.tentId,
            strainId: cycle.strainId,
            startDate: input.dryingStartDate,
            status: "ACTIVE",
          });
          // Ajustar margens de alerta automaticamente para DRYING
          await applyPhaseTransitionLimits(cycle.tentId, "DRYING");
        }
        
        return { success: true, plantsHarvested: cyclePlants.length };
      }),
    
    // Transição MAINTENANCE → CLONING
    transitionToCloning: protectedProcedure
      .input(
        z.object({
          cycleId: z.number(),
          cloningStartDate: z.date(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado");
        }
        
        // Buscar ciclo atual
        const [cycle] = await database
          .select()
          .from(cycles)
          .where(eq(cycles.id, input.cycleId));
        
        if (!cycle) {
          throw new Error("Ciclo não encontrado");
        }
        
        // Permitir retornar para clonagem mesmo se já esteve em clonagem antes
        // (usuário pode voltar de MAINTENANCE para CLONING múltiplas vezes)
        
        // Atualizar ciclo para CLONING
        await database
          .update(cycles)
          .set({ cloningStartDate: input.cloningStartDate })
          .where(eq(cycles.id, input.cycleId));
        
        // Ajustar margens de alerta automaticamente para CLONING
        await applyPhaseTransitionLimits(cycle.tentId, "CLONING");
        
        return { success: true };
      }),
    
    // Transição CLONING → MAINTENANCE
    transitionToMaintenance: protectedProcedure
      .input(
        z.object({
          cycleId: z.number(),
          clonesProduced: z.number().min(0).optional(), // Número de clones produzidos
          targetTentId: z.number().optional(), // Estufa destino para as mudas
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado");
        }
        
        // Buscar ciclo atual
        const [cycle] = await database
          .select()
          .from(cycles)
          .where(eq(cycles.id, input.cycleId));
        
        if (!cycle) {
          throw new Error("Ciclo não encontrado");
        }
        
        if (!cycle.cloningStartDate) {
          throw new Error("Ciclo não está em clonagem");
        }
        
        // Retornar para MAINTENANCE (remover cloningStartDate e salvar clonesProduced)
        await database
          .update(cycles)
          .set({ 
            cloningStartDate: null,
            clonesProduced: input.clonesProduced || null
          })
          .where(eq(cycles.id, input.cycleId));
        
        // Se clones foram produzidos, criar mudas (SEEDLING)
        if (input.clonesProduced && input.clonesProduced > 0) {
          // Validar que targetTentId foi fornecido
          if (!input.targetTentId) {
            throw new Error("Estufa destino é obrigatória ao criar mudas");
          }
          
          const seedlings = [];
          for (let i = 1; i <= input.clonesProduced; i++) {
            seedlings.push({
              name: `Clone ${i} - ${cycle.strainName || 'Sem strain'}`,
              strainId: cycle.strainId,
              currentTentId: input.targetTentId, // Mudas vão para estufa selecionada
              plantStage: "SEEDLING" as const,
              status: "ACTIVE" as const,
            });
          }
          await database.insert(plants).values(seedlings);
        }
        
        // Ajustar margens de alerta automaticamente para MAINTENANCE
        await applyPhaseTransitionLimits(cycle.tentId, "MAINTENANCE");
        
        return { success: true, seedlingsCreated: input.clonesProduced || 0 };
      }),
    
    initiate: protectedProcedure
      .input(
        z.object({
          tentId: z.number(),
          strainId: z.number().optional().nullable(),
          startDate: z.date(),
          phase: z.enum(["CLONING", "MAINTENANCE", "VEGA", "FLORA", "DRYING"]),
          weekNumber: z.number().min(1),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        
        // Calcular startDate baseado na fase e semana
        const startDate = new Date(input.startDate);
        const weeksToSubtract = input.weekNumber - 1;
        startDate.setDate(startDate.getDate() - (weeksToSubtract * 7));
        
        // Se fase for FLORA, definir floraStartDate
        const floraStartDate = input.phase === "FLORA" ? new Date(input.startDate) : null;
        
        await database.insert(cycles).values({
          tentId: input.tentId,
          strainId: input.strainId,
          startDate,
          floraStartDate,
        });
        
        // Atualizar categoria da estufa baseado na fase
        let category: "MAINTENANCE" | "VEGA" | "FLORA" | "DRYING" = "MAINTENANCE";
        if (input.phase === "CLONING" || input.phase === "MAINTENANCE") {
          category = "MAINTENANCE";
        } else if (input.phase === "VEGA") {
          category = "VEGA";
        } else if (input.phase === "FLORA") {
          category = "FLORA";
        } else if (input.phase === "DRYING") {
          category = "DRYING";
        }
        
        await database
          .update(tents)
          .set({ category })
          .where(eq(tents.id, input.tentId));
        
        // Ajustar margens de alerta automaticamente para a fase inicial do ciclo
        const initPhase = (input.phase === "CLONING" || input.phase === "MAINTENANCE")
          ? "MAINTENANCE"
          : input.phase as "VEGA" | "FLORA" | "DRYING";
        await applyPhaseTransitionLimits(input.tentId, initPhase);
        
        return { success: true };
      }),
    edit: protectedProcedure
      .input(
        z.object({
          cycleId: z.number(),
          strainId: z.number().optional(),
          startDate: z.date().optional(),
          floraStartDate: z.date().optional().nullable(),
          phase: z.enum(["CLONING", "MAINTENANCE", "VEGA", "FLORA", "DRYING"]).optional(),
          weekNumber: z.number().min(1).optional(),
          motherPlantId: z.number().optional(),
          clonesProduced: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        
        console.log('[cycles.edit] Input received:', input);
        
        const updates: any = {};
        
        if (input.startDate && input.phase && input.weekNumber) {
          // Recalcular startDate baseado na fase e semana
          const startDate = new Date(input.startDate);
          console.log('[cycles.edit] Original startDate:', startDate.toISOString());
          const weeksToSubtract = input.weekNumber - 1;
          console.log('[cycles.edit] Weeks to subtract:', weeksToSubtract);
          startDate.setDate(startDate.getDate() - (weeksToSubtract * 7));
          console.log('[cycles.edit] Calculated new startDate:', startDate.toISOString());
          updates.startDate = startDate;
          
          // Se fase for FLORA, definir floraStartDate
          if (input.phase === "FLORA") {
            updates.floraStartDate = new Date(input.startDate);
          } else {
            updates.floraStartDate = null;
          }
        } else if (input.startDate) {
          updates.startDate = input.startDate;
        }
        
        if (input.floraStartDate !== undefined) {
          updates.floraStartDate = input.floraStartDate;
        }
        
        if (input.strainId) {
          updates.strainId = input.strainId;
        }
        
        if (input.motherPlantId) {
          updates.motherPlantId = input.motherPlantId;
        }
        
        if (input.clonesProduced) {
          updates.clonesProduced = input.clonesProduced;
        }
        
        await database
          .update(cycles)
          .set(updates)
          .where(eq(cycles.id, input.cycleId));
        
        // Atualizar categoria da estufa se fase foi especificada
        if (input.phase) {
          // Buscar tentId do ciclo
          const cycleData = await database
            .select()
            .from(cycles)
            .where(eq(cycles.id, input.cycleId))
            .limit(1);
          
          if (cycleData.length > 0) {
            const tentId = cycleData[0].tentId;
            
            // Mapear fase para categoria da estufa
            let category: "MAINTENANCE" | "VEGA" | "FLORA" | "DRYING" = "MAINTENANCE";
            if (input.phase === "CLONING" || input.phase === "MAINTENANCE") {
              category = "MAINTENANCE";
            } else if (input.phase === "VEGA") {
              category = "VEGA";
            } else if (input.phase === "FLORA") {
              category = "FLORA";
            } else if (input.phase === "DRYING") {
              category = "DRYING";
            }
            
            // Atualizar categoria da estufa
            await database
              .update(tents)
              .set({ category })
              .where(eq(tents.id, tentId));
            
            // Ajustar margens de alerta automaticamente para a nova fase
            const editPhase = (input.phase === "CLONING" || input.phase === "MAINTENANCE")
              ? "MAINTENANCE"
              : input.phase as "VEGA" | "FLORA" | "DRYING";
            await applyPhaseTransitionLimits(tentId, editPhase);
          }
        }
        
        return { success: true };
      }),
    
    // Finalizar clonagem e gerar mudas
    finishCloning: protectedProcedure
      .input(
        z.object({
          cycleId: z.number(),
          targetTentId: z.number(), // Estufa destino para as mudas
          motherPlantId: z.number(), // Planta-mãe selecionada
          clonesProduced: z.number().min(1).max(50), // Quantidade de mudas a gerar
          seedlingCount: z.number().min(1).max(50).optional(), // Alias para clonesProduced (compatibilidade)
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado.");
        }
        
        // Buscar ciclo atual
        const [cycle] = await database
          .select()
          .from(cycles)
          .where(eq(cycles.id, input.cycleId));
        
        if (!cycle) {
          throw new Error("Ciclo não encontrado");
        }
        
        // Usar motherPlantId e clonesProduced dos inputs
        const motherPlantId = input.motherPlantId;
        const clonesProduced = input.clonesProduced || input.seedlingCount || 10;
        
        // Buscar planta-mãe
        const [motherPlant] = await database
          .select()
          .from(plants)
          .where(eq(plants.id, motherPlantId));
        
        if (!motherPlant) {
          throw new Error("Planta-mãe não encontrada");
        }
        
        // Buscar estufa destino
        const [targetTent] = await database
          .select()
          .from(tents)
          .where(eq(tents.id, input.targetTentId));
        
        if (!targetTent) {
          throw new Error("Estufa destino não encontrada");
        }
        
        // Verificar se estufa destino está vazia (sem ciclo ativo)
        const [existingCycle] = await database
          .select()
          .from(cycles)
          .where(and(
            eq(cycles.tentId, input.targetTentId),
            eq(cycles.status, "ACTIVE")
          ));
        
        if (existingCycle) {
          throw new Error(`Estufa ${targetTent.name} já possui um ciclo ativo. Finalize o ciclo atual antes de criar mudas.`);
        }
        
        // Criar mudas
        const seedlings = [];
        const count = input.seedlingCount || cycle.clonesProduced || 3;
        for (let i = 1; i <= count; i++) {
          const [newSeedling] = await database
            .insert(plants)
            .values({
              name: `${motherPlant.name} Clone #${i}`,
              code: `${motherPlant.code || 'CL'}-${String(i).padStart(3, '0')}`,
              strainId: motherPlant.strainId,
              currentTentId: input.targetTentId,
              plantStage: "SEEDLING",
              status: "ACTIVE",
            });
          
          seedlings.push(newSeedling);
          
          // Registrar histórico de movimentação
          await database
            .insert(plantTentHistory)
            .values({
              plantId: newSeedling.insertId,
              fromTentId: null, // Primeira entrada
              toTentId: input.targetTentId,
              reason: `Clonagem finalizada - mãe: ${motherPlant.name}`,
            });
        }
        
        // Criar novo ciclo na estufa destino (fase VEGA)
        await database
          .insert(cycles)
          .values({
            tentId: input.targetTentId,
            strainId: motherPlant.strainId,
            startDate: new Date(),
            status: "ACTIVE",
          });
        
        // Atualizar categoria da estufa destino para VEGA
        await database
          .update(tents)
          .set({ category: "VEGA" })
          .where(eq(tents.id, input.targetTentId));
        
        // Limpar campos de clonagem do ciclo atual (volta para MAINTENANCE)
        await database
          .update(cycles)
          .set({
            cloningStartDate: null,
            motherPlantId: null,
            clonesProduced: null,
          })
          .where(eq(cycles.id, input.cycleId));
        
        // Atualizar categoria da estufa atual para MAINTENANCE
        await database
          .update(tents)
          .set({ category: "MAINTENANCE" })
          .where(eq(tents.id, cycle.tentId));
        
        return {
          success: true,
          seedlingsCreated: count,
          targetTentName: targetTent.name,
        };
      }),
    
    // Promover fase (VEGA→FLORA ou FLORA→DRYING)
    promotePhase: protectedProcedure
      .input(
        z.object({
          cycleId: z.number(),
          targetPhase: z.enum(["FLORA", "DRYING"]),
          moveToTent: z.boolean(),
          targetTentId: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado.");
        }
        
        // Buscar ciclo atual
        const [cycle] = await database
          .select()
          .from(cycles)
          .where(eq(cycles.id, input.cycleId));
        
        if (!cycle) {
          throw new Error("Ciclo não encontrado");
        }
        
        // Se mover para outra estufa
        if (input.moveToTent && input.targetTentId) {
          // Buscar estufa destino
          const [targetTent] = await database
            .select()
            .from(tents)
            .where(eq(tents.id, input.targetTentId));
          
          if (!targetTent) {
            throw new Error("Estufa destino não encontrada");
          }
          
          // Verificar se estufa destino está vazia
          const [existingCycle] = await database
            .select()
            .from(cycles)
            .where(and(
              eq(cycles.tentId, input.targetTentId),
              eq(cycles.status, "ACTIVE")
            ));
          
          if (existingCycle) {
            throw new Error(`Estufa ${targetTent.name} já possui um ciclo ativo. Finalize o ciclo atual antes de mover plantas.`);
          }
          
          // Buscar todas as plantas do ciclo atual
          const cyclePlants = await database
            .select()
            .from(plants)
            .where(and(
              eq(plants.currentTentId, cycle.tentId),
              eq(plants.status, "ACTIVE")
            ));
          
          // Mover plantas para nova estufa
          for (const plant of cyclePlants) {
            await database
              .update(plants)
              .set({ currentTentId: input.targetTentId })
              .where(eq(plants.id, plant.id));
            
            // Registrar histórico de movimentação
            await database
              .insert(plantTentHistory)
              .values({
                plantId: plant.id,
                fromTentId: cycle.tentId,
                toTentId: input.targetTentId,
                reason: `Promoção para ${input.targetPhase}`,
              });
          }
          
          // Criar novo ciclo na estufa destino
          const newCycleData: any = {
            tentId: input.targetTentId,
            strainId: cycle.strainId,
            startDate: cycle.startDate, // Mantém data original
            status: "ACTIVE",
          };
          
          if (input.targetPhase === "FLORA") {
            newCycleData.floraStartDate = new Date();
          }
          
          await database.insert(cycles).values(newCycleData);
          
          // Atualizar categoria da estufa destino
          const targetCategory = input.targetPhase === "FLORA" ? "FLORA" : "DRYING";
          await database
            .update(tents)
            .set({ category: targetCategory })
            .where(eq(tents.id, input.targetTentId));
          
          // Aplicar limites de alerta para a nova fase na estufa destino
          await applyPhaseTransitionLimits(input.targetTentId, input.targetPhase);
          
          // Resetar categoria da estufa original para VEGA (vazia, disponível)
          // Se estava em VEGA e foi para FLORA, a estufa original fica como VEGA vazia
          // Se estava em FLORA e foi para DRYING, a estufa original fica como FLORA vazia
          const sourceCategory = input.targetPhase === "FLORA" ? "VEGA" : "FLORA";
          await database
            .update(tents)
            .set({ category: sourceCategory })
            .where(eq(tents.id, cycle.tentId));
          
          // Finalizar ciclo antigo
          await database
            .update(cycles)
            .set({ status: "FINISHED" })
            .where(eq(cycles.id, input.cycleId));
          
          return {
            success: true,
            message: `Plantas movidas para ${targetTent.name} e ciclo promovido para ${input.targetPhase}`,
            movedPlants: cyclePlants.length,
          };
        } else {
          // Promover fase na mesma estufa
          const updates: any = {};
          
          if (input.targetPhase === "FLORA") {
            updates.floraStartDate = new Date();
          }
          
          await database
            .update(cycles)
            .set(updates)
            .where(eq(cycles.id, input.cycleId));
          
          // Atualizar categoria da estufa
          const targetCategory = input.targetPhase === "FLORA" ? "FLORA" : "DRYING";
          await database
            .update(tents)
            .set({ category: targetCategory })
            .where(eq(tents.id, cycle.tentId));
          
          // Aplicar limites de alerta para a nova fase
          await applyPhaseTransitionLimits(cycle.tentId, input.targetPhase);
          
          return {
            success: true,
            message: `Ciclo promovido para ${input.targetPhase} na mesma estufa`,
          };
        }
      }),
    
    getReportData: protectedProcedure
      .input(z.object({ cycleId: z.number() }))
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Buscar informações do ciclo
        const cycleData = await database
          .select()
          .from(cycles)
          .where(eq(cycles.id, input.cycleId))
          .limit(1);
        
        if (!cycleData || cycleData.length === 0) throw new Error("Cycle not found");
        const cycle = cycleData[0];
        
        // Buscar tent
        const tent = await database.select().from(tents).where(eq(tents.id, cycle.tentId)).limit(1);
        
        // Buscar strain (pode ser null se ciclo tem múltiplas strains)
        let strain: any[] = [];
        if (cycle.strainId) {
          strain = await database.select().from(strains).where(eq(strains.id, cycle.strainId)).limit(1);
        }
        
        // Buscar strains das plantas ativas na estufa
        const tentPlants = await database
          .select({ strainId: plants.strainId })
          .from(plants)
          .where(and(eq(plants.currentTentId, cycle.tentId), eq(plants.status, "ACTIVE")));
        const uniqueStrainIds = Array.from(new Set(tentPlants.map((p: any) => p.strainId)));
        let tentStrains: any[] = [];
        if (uniqueStrainIds.length > 0) {
          tentStrains = await database.select().from(strains).where(sql`${strains.id} IN (${sql.join(uniqueStrainIds.map(id => sql`${id}`), sql`, `)})`);
        }
        
        // Buscar logs diários do tent durante o período do ciclo
        const logs = await database
          .select()
          .from(dailyLogs)
          .where(eq(dailyLogs.tentId, cycle.tentId))
          .orderBy(dailyLogs.logDate);
        
        // Buscar tarefas do tent durante o período do ciclo
        const tasks = await database
          .select()
          .from(taskInstances)
          .where(eq(taskInstances.tentId, cycle.tentId));
        
        return {
          cycle,
          tent: tent[0],
          strain: strain[0] || null,
          tentStrains,
          logs,
          tasks,
        };
      }),
  }),

  // Daily Logs (Registros Diários)
  dailyLogs: router({
    list: protectedProcedure
      .input(
        z.object({
          tentId: z.number(),
          limit: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        return db.getDailyLogs(input.tentId, input.limit);
      }),
    // getHistoricalWithTargets removido - usar getDailyLogs diretamente
    create: protectedProcedure
      .input(
        z.object({
          tentId: z.number(),
          logDate: z.date(),
          turn: z.enum(["AM", "PM"]),
          tempC: z.string().optional().refine(
            (val) => !val || (parseFloat(val) >= -10 && parseFloat(val) <= 50),
            { message: "Temperatura deve estar entre -10°C e 50°C" }
          ),
          rhPct: z.string().optional().refine(
            (val) => !val || (parseFloat(val) >= 0 && parseFloat(val) <= 100),
            { message: "Umidade deve estar entre 0% e 100%" }
          ),
          ppfd: z.number().optional().refine(
            (val) => !val || (val >= 0 && val <= 2000),
            { message: "PPFD deve estar entre 0 e 2000 µmol/m²/s" }
          ),
          ph: z.string().optional().refine(
            (val) => !val || (parseFloat(val) >= 0 && parseFloat(val) <= 14),
            { message: "pH deve estar entre 0 e 14" }
          ),
          ec: z.string().optional().refine(
            (val) => !val || (parseFloat(val) >= 0 && parseFloat(val) <= 5),
            { message: "EC deve estar entre 0 e 5 mS/cm" }
          ),
          wateringVolume: z.number().optional().refine(
            (val) => !val || val >= 0,
            { message: "Volume regado deve ser maior ou igual a 0" }
          ),
          runoffCollected: z.number().optional().refine(
            (val) => !val || val >= 0,
            { message: "Runoff coletado deve ser maior ou igual a 0" }
          ),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        

        
        // Calcular runoffPercentage se ambos wateringVolume e runoffCollected foram fornecidos
        let runoffPercentage: string | undefined;
        if (input.wateringVolume && input.runoffCollected) {
          if (input.runoffCollected > input.wateringVolume) {
            throw new Error("Runoff coletado não pode ser maior que o volume regado");
          }
          runoffPercentage = ((input.runoffCollected / input.wateringVolume) * 100).toFixed(2);
        }
        
        const valuesToInsert = {
          ...input,
          runoffPercentage,
        };

        
        const result = await database.insert(dailyLogs).values(valuesToInsert);
        
        // Verificar alertas automaticamente
        const { checkAndNotifyAlerts } = await import("./alertChecker");
        await checkAndNotifyAlerts(input.tentId, {
          tempC: input.tempC,
          rhPct: input.rhPct,
          ppfd: input.ppfd,
        });
        
        return { success: true };
      }),
    getLatestByTent: protectedProcedure
      .input(z.object({ tentId: z.number() }))
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        const result = await database
          .select()
          .from(dailyLogs)
          .where(eq(dailyLogs.tentId, input.tentId))
          .orderBy(desc(dailyLogs.logDate))
          .limit(1);
        return result[0] || null;
      }),
    
    getWeeklyData: protectedProcedure
      .input(z.object({ tentId: z.number() }))
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Get logs from last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const logs = await database
          .select({
            logDate: dailyLogs.logDate,
            tempC: dailyLogs.tempC,
            rhPct: dailyLogs.rhPct,
            ppfd: dailyLogs.ppfd,
            ph: dailyLogs.ph,
            ec: dailyLogs.ec,
          })
          .from(dailyLogs)
          .where(
            and(
              eq(dailyLogs.tentId, input.tentId),
              sql`${dailyLogs.logDate} >= ${sevenDaysAgo}`
            )
          )
          .orderBy(dailyLogs.logDate);
        
        // Format data for chart
        return logs.map((log: any) => ({
          date: new Date(log.logDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          temp: log.tempC ? parseFloat(log.tempC) : undefined,
          rh: log.rhPct ? parseFloat(log.rhPct) : undefined,
          ppfd: log.ppfd || undefined,
          ph: log.ph ? parseFloat(log.ph) : undefined,
          ec: log.ec ? parseFloat(log.ec) : undefined,
        }));
      }),
    
    listAll: protectedProcedure
      .input(
        z.object({
          tentId: z.number().optional(),
          startDate: z.date().optional(),
          endDate: z.date().optional(),
          limit: z.number().default(100),
          offset: z.number().default(0),
        })
      )
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Build filter conditions
        const conditions = [];
        if (input.tentId) {
          conditions.push(eq(dailyLogs.tentId, input.tentId));
        }
        if (input.startDate) {
          conditions.push(sql`${dailyLogs.logDate} >= ${input.startDate}`);
        }
        if (input.endDate) {
          conditions.push(sql`${dailyLogs.logDate} <= ${input.endDate}`);
        }
        
        // Build base query
        let baseQuery = database
          .select({
            id: dailyLogs.id,
            tentId: dailyLogs.tentId,
            logDate: dailyLogs.logDate,
            turn: dailyLogs.turn,
            tempC: dailyLogs.tempC,
            rhPct: dailyLogs.rhPct,
            ppfd: dailyLogs.ppfd,
            ph: dailyLogs.ph,
            ec: dailyLogs.ec,
            notes: dailyLogs.notes,
            tentName: tents.name,
          })
          .from(dailyLogs)
          .leftJoin(tents, eq(dailyLogs.tentId, tents.id))
          .$dynamic();
        
        // Apply filters
        if (conditions.length > 0) {
          baseQuery = baseQuery.where(and(...conditions));
        }
        
        // Apply ordering and pagination
        const logs = await baseQuery
          .orderBy(desc(dailyLogs.logDate), desc(dailyLogs.id))
          .limit(input.limit)
          .offset(input.offset);
        
        // Get total count for pagination
        const countQuery = database
          .select({ count: sql<number>`count(*)` })
          .from(dailyLogs);
        
        if (conditions.length > 0) {
          countQuery.where(and(...conditions));
        }
        
        const countResult = await countQuery;
        const total = Number(countResult[0]?.count || 0);
        
        return {
          logs,
          total,
          hasMore: input.offset + logs.length < total,
        };
      }),
    
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          tempC: z.string().optional(),
          rhPct: z.string().optional(),
          ppfd: z.number().optional(),
          ph: z.string().optional(),
          ec: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        
        const { id, ...updateData } = input;
        
        await database
          .update(dailyLogs)
          .set(updateData)
          .where(eq(dailyLogs.id, id));
        
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        
        await database
          .delete(dailyLogs)
          .where(eq(dailyLogs.id, input.id));
        
        return { success: true };
      }),
  }),

  // Alerts (Alertas)
  alerts: router({
    // Configurações de alertas
    getSettings: protectedProcedure
      .input(z.object({ tentId: z.number() }))
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        const settings = await database
          .select()
          .from(alertSettings)
          .where(eq(alertSettings.tentId, input.tentId))
          .limit(1);
        return settings[0] || null;
      }),
    
    getIdealValues: protectedProcedure
      .input(z.object({ tentId: z.number() }))
      .query(async ({ input }) => {
        return db.getIdealValuesByTent(input.tentId);
      }),
    
    updateSettings: protectedProcedure
      .input(
        z.object({
          tentId: z.number(),
          alertsEnabled: z.boolean().optional(),
          tempEnabled: z.boolean().optional(),
          rhEnabled: z.boolean().optional(),
          ppfdEnabled: z.boolean().optional(),
          phEnabled: z.boolean().optional(),
          tempMargin: z.number().optional(),
          rhMargin: z.number().optional(),
          ppfdMargin: z.number().optional(),
          phMargin: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        
        // Verificar se já existe configuração
        const existing = await database
          .select()
          .from(alertSettings)
          .where(eq(alertSettings.tentId, input.tentId))
          .limit(1);
        
        if (existing.length > 0) {
          // Atualizar existente
          await database
            .update(alertSettings)
            .set({
              alertsEnabled: input.alertsEnabled,
              tempEnabled: input.tempEnabled,
              rhEnabled: input.rhEnabled,
              ppfdEnabled: input.ppfdEnabled,
              phEnabled: input.phEnabled,
              tempMargin: input.tempMargin !== undefined ? String(input.tempMargin) : undefined,
              rhMargin: input.rhMargin !== undefined ? String(input.rhMargin) : undefined,
              ppfdMargin: input.ppfdMargin !== undefined ? input.ppfdMargin : undefined,
              phMargin: input.phMargin !== undefined ? String(input.phMargin) : undefined,
            })
            .where(eq(alertSettings.tentId, input.tentId));
        } else {
          // Criar nova
          await database.insert(alertSettings).values({
            tentId: input.tentId,
            alertsEnabled: input.alertsEnabled ?? true,
            tempEnabled: input.tempEnabled ?? true,
            rhEnabled: input.rhEnabled ?? true,
            ppfdEnabled: input.ppfdEnabled ?? true,
            phEnabled: input.phEnabled ?? false,
            tempMargin: input.tempMargin !== undefined ? String(input.tempMargin) : "2",
            rhMargin: input.rhMargin !== undefined ? String(input.rhMargin) : "5",
            ppfdMargin: input.ppfdMargin ?? 50,
            phMargin: input.phMargin !== undefined ? String(input.phMargin) : "0.2",
          });
        }
        
        return { success: true };
      }),
    
    // Histórico de alertas
    getHistory: protectedProcedure
      .input(
        z.object({
          tentId: z.number().optional(),
          limit: z.number().default(50),
        })
      )
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) return [];
        
        if (input.tentId) {
          return database
            .select()
            .from(alertHistory)
            .where(eq(alertHistory.tentId, input.tentId))
            .orderBy(desc(alertHistory.createdAt))
            .limit(input.limit);
        }
        
        return database
          .select()
          .from(alertHistory)
          .orderBy(desc(alertHistory.createdAt))
          .limit(input.limit);
      }),
    
    list: protectedProcedure
      .input(
        z.object({
          tentId: z.number().optional(),
          status: z.enum(["NEW", "SEEN"]).optional(),
        })
      )
      .query(async ({ input }) => {
        return db.getAlerts(input.tentId, input.status);
      }),
    getNewCount: protectedProcedure
      .input(z.object({ tentId: z.number().optional() }))
      .query(async ({ input }) => {
        return db.getNewAlertsCount(input.tentId);
      }),
    markAsSeen: protectedProcedure
      .input(z.object({ alertId: z.number() }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        await database.update(alerts).set({ status: "SEEN" }).where(eq(alerts.id, input.alertId));
        return { success: true };
      }),
    
    markAllAsSeen: protectedProcedure
      .input(z.object({ tentId: z.number().optional() }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        const conditions = [eq(alerts.status, "NEW")];
        if (input.tentId !== undefined) {
          conditions.push(eq(alerts.tentId, input.tentId));
        }
        const result = await database
          .update(alerts)
          .set({ status: "SEEN" })
          .where(and(...conditions));
        return { success: true, updated: result[0]?.affectedRows ?? 0 };
      }),

    checkAlerts: protectedProcedure
      .input(z.object({ tentId: z.number() }))
      .mutation(async ({ input }) => {
        return db.checkAlertsForTent(input.tentId);
      }),
    
    checkAllTents: protectedProcedure
      .mutation(async () => {
        const { checkAllTentsAlerts } = await import("./cron/alertsChecker");
        return checkAllTentsAlerts();
      }),
    
    // Phase Alert Margins (Margens de Alertas por Fase)
    getPhaseMargins: protectedProcedure.query(async () => {
      const database = await getDb();
      if (!database) return [];
      const { phaseAlertMargins } = await import("../drizzle/schema");
      return database.select().from(phaseAlertMargins).orderBy(phaseAlertMargins.phase);
    }),
    
    updatePhaseMargin: protectedProcedure
      .input(
        z.object({
          phase: z.enum(["MAINTENANCE", "CLONING", "VEGA", "FLORA", "DRYING"]),
          tempMargin: z.number().optional(),
          rhMargin: z.number().optional(),
          ppfdMargin: z.number().optional(),
          phMargin: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        
        const { phaseAlertMargins } = await import("../drizzle/schema");
        
        await database
          .update(phaseAlertMargins)
          .set({
            tempMargin: input.tempMargin !== undefined ? String(input.tempMargin) : undefined,
            rhMargin: input.rhMargin !== undefined ? String(input.rhMargin) : undefined,
            ppfdMargin: input.ppfdMargin !== undefined ? input.ppfdMargin : undefined,
            phMargin: input.phMargin !== undefined ? String(input.phMargin) : undefined,
          })
          .where(eq(phaseAlertMargins.phase, input.phase));
        
        return { success: true };
      }),
    
    // Restaurar margens de uma fase para os valores padrão do sistema
    resetPhaseMarginToDefault: protectedProcedure
      .input(
        z.object({
          phase: z.enum(["MAINTENANCE", "CLONING", "VEGA", "FLORA", "DRYING"]),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Banco de dados não inicializado.");

        // Valores padrão por fase (espelham os dados inseridos pelo seed-alerts.mjs)
        const defaults: Record<string, { tempMargin: string; rhMargin: string; ppfdMargin: number; phMargin: string | null }> = {
          MAINTENANCE: { tempMargin: "2.0", rhMargin: "5.0", ppfdMargin: 75,  phMargin: "0.3" },
          CLONING:     { tempMargin: "1.5", rhMargin: "4.0", ppfdMargin: 50,  phMargin: "0.2" },
          VEGA:        { tempMargin: "2.0", rhMargin: "5.0", ppfdMargin: 100, phMargin: "0.3" },
          FLORA:       { tempMargin: "1.5", rhMargin: "3.0", ppfdMargin: 100, phMargin: "0.2" },
          DRYING:      { tempMargin: "1.0", rhMargin: "2.0", ppfdMargin: 0,   phMargin: null  },
        };

        const d = defaults[input.phase];
        const { phaseAlertMargins } = await import("../drizzle/schema");

        await database
          .update(phaseAlertMargins)
          .set({
            tempMargin:  d.tempMargin,
            rhMargin:    d.rhMargin,
            ppfdMargin:  d.ppfdMargin,
            phMargin:    d.phMargin,
          })
          .where(eq(phaseAlertMargins.phase, input.phase));

        return {
          success: true,
          phase: input.phase,
          margins: {
            tempMargin:  parseFloat(d.tempMargin),
            rhMargin:    parseFloat(d.rhMargin),
            ppfdMargin:  d.ppfdMargin,
            phMargin:    d.phMargin !== null ? parseFloat(d.phMargin) : null,
          },
        };
      }),

    // Notification Settings (Configurações de Notificações)
    getNotificationSettings: protectedProcedure.query(async () => {
      const database = await getDb();
      if (!database) return null;
      const { notificationSettings } = await import("../drizzle/schema");
      
      // Pegar primeira configuração (sem autenticação)
      const settings = await database
        .select()
        .from(notificationSettings)
        .limit(1);
      
      return settings[0] || null;
    }),
    
    toggleSystemPaused: protectedProcedure
      .mutation(async () => {
        const database = await getDb();
        if (!database) throw new Error("Banco de dados não inicializado.");
        const { notificationSettings } = await import("../drizzle/schema");
        const existing = await database.select().from(notificationSettings).limit(1);
        if (existing.length > 0) {
          const newValue = !existing[0].systemPaused;
          await database
            .update(notificationSettings)
            .set({ systemPaused: newValue })
            .where(eq(notificationSettings.id, existing[0].id));
          return { systemPaused: newValue };
        } else {
          await database.insert(notificationSettings).values({ systemPaused: true });
          return { systemPaused: true };
        }
      }),

    updateNotificationSettings: protectedProcedure
      .input(
        z.object({
          systemPaused: z.boolean().optional(),
          tempAlertsEnabled: z.boolean().optional(),
          rhAlertsEnabled: z.boolean().optional(),
          ppfdAlertsEnabled: z.boolean().optional(),
          phAlertsEnabled: z.boolean().optional(),
          taskRemindersEnabled: z.boolean().optional(),
          dailySummaryEnabled: z.boolean().optional(),
          dailySummaryTime: z.string().optional(),
          dailyReminderEnabled: z.boolean().optional(),
          reminderTimes: z.string().optional(), // JSON array serializado
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        
        const { notificationSettings } = await import("../drizzle/schema");
        
        // Verificar se já existe configuração
        const existing = await database
          .select()
          .from(notificationSettings)
          .limit(1);
        
        if (existing.length > 0) {
          // Atualizar existente (primeira configuração)
          await database
            .update(notificationSettings)
            .set(input)
            .where(eq(notificationSettings.id, existing[0].id));
        } else {
          // Criar nova
          await database.insert(notificationSettings).values(input);
        }
        
        return { success: true };
      }),
  }),

  // Weekly Targets (Padrões Semanais)
  weeklyTargets: router({
    get: protectedProcedure
      .input(
        z.object({
          phase: z.enum(["vega", "flora"]),
          weekNumber: z.number(),
        })
      )
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) return null;
        
        // Converte para uppercase para match com o enum do banco
        const phaseUpper = input.phase.toUpperCase() as "VEGA" | "FLORA";
        
        // Busca targets genéricos (pode ser de qualquer strain)
        // Para calculadora genérica, retorna valores padrão baseados na fase/semana
        const targets = await database
          .select()
          .from(weeklyTargets)
          .where(
            and(
              eq(weeklyTargets.phase, phaseUpper),
              eq(weeklyTargets.weekNumber, input.weekNumber)
            )
          )
          .limit(1);
        
        // Se não encontrar targets específicos, retorna valores padrão
        if (targets.length === 0) {
          // Valores padrão de EC por fase e semana
          const defaultEC = input.phase === "vega" 
            ? 1.0 + (input.weekNumber - 1) * 0.2 // Vega: 1.0 a 2.0
            : 1.6 + (input.weekNumber - 1) * 0.15; // Flora: 1.6 a 2.65
          
          return {
            targetEC: Math.min(defaultEC, input.phase === "vega" ? 2.0 : 2.8).toFixed(1),
            phase: phaseUpper,
            weekNumber: input.weekNumber,
          };
        }
        
        // Retorna o target encontrado com targetEC calculado da média de ecMin e ecMax
        const target = targets[0];
        const ecMin = parseFloat(target.ecMin || "0");
        const ecMax = parseFloat(target.ecMax || "0");
        const targetEC = ecMax > 0 ? ((ecMin + ecMax) / 2).toFixed(1) : "1.5";
        
        return {
          ...target,
          targetEC,
        };
      }),
    getTargetsByWeek: protectedProcedure
      .input(
        z.object({
          strainId: z.number(),
          phase: z.enum(["CLONING", "VEGA", "FLORA", "MAINTENANCE"]),
          weekNumber: z.number(),
        })
      )
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) return null;
        
        const targets = await database
          .select()
          .from(weeklyTargets)
          .where(
            and(
              eq(weeklyTargets.strainId, input.strainId),
              eq(weeklyTargets.phase, input.phase),
              eq(weeklyTargets.weekNumber, input.weekNumber)
            )
          )
          .limit(1);
        
        return targets[0] || null;
      }),
    // Busca targets por estufa - calcula média das strains das plantas ativas
    getTargetsByTent: protectedProcedure
      .input(
        z.object({
          tentId: z.number(),
          phase: z.enum(["CLONING", "VEGA", "FLORA", "MAINTENANCE"]),
          weekNumber: z.number(),
        })
      )
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) return null;
        
        // Buscar strains únicas das plantas ativas na estufa
        const tentPlants = await database
          .select({ strainId: plants.strainId })
          .from(plants)
          .where(and(
            eq(plants.currentTentId, input.tentId),
            eq(plants.status, "ACTIVE")
          ));
        
        const uniqueStrainIds = Array.from(new Set(tentPlants.map((p: any) => p.strainId))) as number[];
        if (uniqueStrainIds.length === 0) return null;
        
        if (uniqueStrainIds.length === 1) {
          // Uma única strain: retornar targets direto
          const targets = await database
            .select()
            .from(weeklyTargets)
            .where(
              and(
                eq(weeklyTargets.strainId, uniqueStrainIds[0]),
                eq(weeklyTargets.phase, input.phase),
                eq(weeklyTargets.weekNumber, input.weekNumber)
              )
            )
            .limit(1);
          return targets[0] || null;
        }
        
        // Múltiplas strains: calcular média
        const allTargets = await database
          .select()
          .from(weeklyTargets)
          .where(
            and(
              sql`${weeklyTargets.strainId} IN (${sql.join(uniqueStrainIds.map((id: number) => sql`${id}`), sql`, `)})`,
              eq(weeklyTargets.phase, input.phase),
              eq(weeklyTargets.weekNumber, input.weekNumber)
            )
          );
        
        if (allTargets.length === 0) return null;
        
        // Calcular média
        const avgDecimal = (field: string) => {
          const vals = allTargets.map((t: any) => t[field]).filter((v: any) => v !== null && v !== undefined);
          if (vals.length === 0) return null;
          const sum = vals.reduce((a: number, b: any) => a + parseFloat(String(b)), 0);
          return (sum / vals.length).toFixed(1);
        };
        const avgInt = (field: string) => {
          const vals = allTargets.map((t: any) => t[field]).filter((v: any) => v !== null && v !== undefined);
          if (vals.length === 0) return null;
          const sum = vals.reduce((a: number, b: any) => a + Number(b), 0);
          return Math.round(sum / vals.length);
        };
        
        return {
          ...allTargets[0],
          tempMin: avgDecimal('tempMin'),
          tempMax: avgDecimal('tempMax'),
          rhMin: avgDecimal('rhMin'),
          rhMax: avgDecimal('rhMax'),
          ppfdMin: avgInt('ppfdMin'),
          ppfdMax: avgInt('ppfdMax'),
          phMin: avgDecimal('phMin'),
          phMax: avgDecimal('phMax'),
          ecMin: avgDecimal('ecMin'),
          ecMax: avgDecimal('ecMax'),
          _isAverage: true,
          _strainCount: uniqueStrainIds.length,
        };
      }),
    getCurrentWeekTargets: protectedProcedure.query(async () => {
      // Busca os targets da semana atual de todos os ciclos ativos
      const database = await getDb();
      if (!database) return [];

      const activeCycles = await database
        .select()
        .from(cycles)
        .where(eq(cycles.status, "ACTIVE"));

      if (activeCycles.length === 0) return [];

      // Pega o primeiro ciclo ativo para mostrar os targets
      const cycle = activeCycles[0];
      
      // Calcula a fase e semana atual
      const now = new Date();
      const startDate = new Date(cycle.startDate);
      const floraStartDate = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;
      
      let phase: "VEGA" | "FLORA" = "VEGA";
      let weekNumber = 1;
      
      if (floraStartDate && now >= floraStartDate) {
        phase = "FLORA";
        const weeksSinceFlora = Math.floor((now.getTime() - floraStartDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
        weekNumber = Math.min(weeksSinceFlora + 1, 8);
      } else {
        const weeksSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
        weekNumber = Math.min(weeksSinceStart + 1, 6);
      }
      
      // Busca os targets da semana atual
      if (cycle.strainId) {
        // Ciclo com strain definida
        const targets = await database
          .select()
          .from(weeklyTargets)
          .where(
            and(
              eq(weeklyTargets.strainId, cycle.strainId),
              eq(weeklyTargets.phase, phase),
              eq(weeklyTargets.weekNumber, weekNumber)
            )
          )
          .limit(1);
        return targets;
      } else {
        // Ciclo sem strain: buscar strains das plantas ativas
        const tentPlants = await database
          .select({ strainId: plants.strainId })
          .from(plants)
          .where(and(
            eq(plants.currentTentId, cycle.tentId),
            eq(plants.status, "ACTIVE")
          ));
        const uniqueStrainIds = Array.from(new Set(tentPlants.map((p: any) => p.strainId))) as number[];
        if (uniqueStrainIds.length === 0) return [];
        
        const allTargets = await database
          .select()
          .from(weeklyTargets)
          .where(
            and(
              sql`${weeklyTargets.strainId} IN (${sql.join(uniqueStrainIds.map((id: number) => sql`${id}`), sql`, `)})`,
              eq(weeklyTargets.phase, phase),
              eq(weeklyTargets.weekNumber, weekNumber)
            )
          );
        
        if (allTargets.length === 0) return [];
        if (uniqueStrainIds.length === 1) return [allTargets[0]];
        
        // Média
        const avgDec = (f: string) => {
          const v = allTargets.map((t: any) => t[f]).filter((x: any) => x != null);
          return v.length ? (v.reduce((a: number, b: any) => a + parseFloat(String(b)), 0) / v.length).toFixed(1) : null;
        };
        const avgI = (f: string) => {
          const v = allTargets.map((t: any) => t[f]).filter((x: any) => x != null);
          return v.length ? Math.round(v.reduce((a: number, b: any) => a + Number(b), 0) / v.length) : null;
        };
        return [{
          ...allTargets[0],
          tempMin: avgDec('tempMin'), tempMax: avgDec('tempMax'),
          rhMin: avgDec('rhMin'), rhMax: avgDec('rhMax'),
          ppfdMin: avgI('ppfdMin'), ppfdMax: avgI('ppfdMax'),
          phMin: avgDec('phMin'), phMax: avgDec('phMax'),
          ecMin: avgDec('ecMin'), ecMax: avgDec('ecMax'),
        }];
      }
    }),
    getByStrain: protectedProcedure.input(z.object({ strainId: z.number() })).query(async ({ input }) => {
      return db.getWeeklyTargetsByStrain(input.strainId);
    }),
    create: protectedProcedure
      .input(
        z.object({
          strainId: z.number(),
          phase: z.enum(["CLONING", "VEGA", "FLORA", "MAINTENANCE"]),
          weekNumber: z.number(),
          tempMin: z.string().optional(),
          tempMax: z.string().optional(),
          rhMin: z.string().optional(),
          rhMax: z.string().optional(),
          ppfdMin: z.number().optional(),
          ppfdMax: z.number().optional(),
          photoperiod: z.string().optional(),
          phMin: z.string().optional(),
          phMax: z.string().optional(),
          ecMin: z.string().optional(),
          ecMax: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        await database.insert(weeklyTargets).values(input);
        return { success: true };
      }),
  }),

  // Task Instances (Tarefas)
  tasks: router({
    list: protectedProcedure
      .input(
        z.object({
          tentId: z.number(),
        })
      )
      .query(async ({ input }) => {
        return db.getTaskInstances(input.tentId);
      }),
    getTasksByTent: protectedProcedure
      .input(z.object({ tentId: z.number() }))
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) return [];

        // Get current active cycle for this tent
        const cycle = await db.getCycleByTentId(input.tentId);
        if (!cycle) return [];

        // Get tent info
        const tent = await db.getTentById(input.tentId);
        if (!tent) return [];

        // Calculate current phase and week
        const now = new Date();
        const startDate = new Date(cycle.startDate);
        const floraStartDate = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;

        let currentPhase: "CLONING" | "VEGA" | "FLORA" | "MAINTENANCE" | "DRYING";
        let weekNumber: number;

        // Determine phase based on tent category
        if (tent.category === "MAINTENANCE") {
          currentPhase = "MAINTENANCE";
          weekNumber = 1;
        } else if (tent.category === "VEGA") {
          currentPhase = "VEGA";
          const weeksSinceStart = Math.floor(
            (now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
          );
          weekNumber = weeksSinceStart + 1;
        } else if (tent.category === "FLORA") {
          currentPhase = "FLORA";
          const weeksSinceStart = floraStartDate
            ? Math.floor((now.getTime() - floraStartDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
            : Math.floor((now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
          weekNumber = weeksSinceStart + 1;
        } else if (tent.category === "DRYING") {
          currentPhase = "DRYING";
          const weeksSinceStart = Math.floor(
            (now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
          );
          weekNumber = Math.min(weeksSinceStart + 1, 2); // Máximo 2 semanas de secagem
        } else {
          // Fallback
          currentPhase = "MAINTENANCE";
          weekNumber = 1;
        }

        // Get templates for this phase/week
        const context = tent.category === "MAINTENANCE" ? "TENT_A" : "TENT_BC";
        let templates;
        if (currentPhase === "MAINTENANCE" || currentPhase === "DRYING") {
          // For maintenance and drying, don't filter by week number
          templates = await database
            .select()
            .from(taskTemplates)
            .where(
              and(
                eq(taskTemplates.context, context),
                eq(taskTemplates.phase, currentPhase)
              )
            );
        } else {
          templates = await database
            .select()
            .from(taskTemplates)
            .where(
              and(
                eq(taskTemplates.context, context),
                eq(taskTemplates.phase, currentPhase),
                eq(taskTemplates.weekNumber, weekNumber)
              )
            );
        }

        const tasks = [];
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        for (const template of templates) {
          // Check if instance already exists for this week
          const existing = await database
            .select()
            .from(taskInstances)
            .where(
              and(
                eq(taskInstances.tentId, input.tentId),
                eq(taskInstances.taskTemplateId, template.id),
                eq(taskInstances.occurrenceDate, startOfWeek)
              )
            )
            .limit(1);

          if (existing.length === 0) {
            // Create instance
            await database.insert(taskInstances).values({
              tentId: input.tentId,
              taskTemplateId: template.id,
              occurrenceDate: startOfWeek,
              isDone: false,
            });

            tasks.push({
              id: 0, // Will be fetched
              title: template.title,
              description: template.description,
              phase: currentPhase,
              weekNumber,
              isDone: false,
              completedAt: null,
              notes: null,
            });
          } else {
            tasks.push({
              id: existing[0].id,
              title: template.title,
              description: template.description,
              phase: currentPhase,
              weekNumber,
              isDone: existing[0].isDone,
              completedAt: existing[0].completedAt,
              notes: existing[0].notes,
            });
          }
        }

        return tasks;
      }),
    getPendingTasks: protectedProcedure.query(async () => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      // Get all active cycles
      const allCycles = await db.getAllCycles();
      const activeCycles = allCycles.filter((c: any) => c.status === "ACTIVE");
      const pendingTasks: any[] = [];

      for (const cycle of activeCycles) {
        // Get tent info
        const tent = await database.select().from(tents).where(eq(tents.id, cycle.tentId)).limit(1);
        if (tent.length === 0) continue;

        // Get all incomplete tasks for this tent in current week
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const incompleteTasks = await database
          .select()
          .from(taskInstances)
          .leftJoin(taskTemplates, eq(taskInstances.taskTemplateId, taskTemplates.id))
          .where(
            and(
              eq(taskInstances.tentId, cycle.tentId),
              eq(taskInstances.isDone, false),
              eq(taskInstances.occurrenceDate, startOfWeek)
            )
          );

        for (const task of incompleteTasks) {
          pendingTasks.push({
            id: task.task_instances.id,
            tentId: cycle.tentId,
            tentName: tent[0].name,
            title: task.task_templates?.title || "Tarefa",
            description: task.task_templates?.description || "",
            occurrenceDate: task.task_instances.occurrenceDate,
          });
        }
      }

      return pendingTasks;
    }),
    getCurrentWeekTasks: protectedProcedure.query(async () => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      // Get all active cycles
      const allCycles = await db.getAllCycles();
      const activeCycles = allCycles.filter((c: any) => c.status === "ACTIVE");
      const allTasks: any[] = [];

      for (const cycle of activeCycles) {
        // Calculate current phase and week
        const now = new Date();
        const startDate = new Date(cycle.startDate);
        const floraStartDate = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;

        let currentPhase: "VEGA" | "FLORA" | "MAINTENANCE" | "DRYING";
        let weekNumber: number | null;
        let context: "TENT_BC" | "TENT_A";

        // Get tent info to check category
        const tent = await database.select().from(tents).where(eq(tents.id, cycle.tentId)).limit(1);
        const tentCategory = tent[0]?.category;
        
        // Determine phase based on tent category
        if (tentCategory === "MAINTENANCE") {
          currentPhase = "MAINTENANCE";
          weekNumber = null;
          context = "TENT_A";
        } else if (tentCategory === "DRYING") {
          currentPhase = "DRYING";
          weekNumber = null;
          context = "TENT_BC";
        } else if (tentCategory === "FLORA") {
          currentPhase = "FLORA";
          const weeksSinceFlora = floraStartDate
            ? Math.floor((now.getTime() - floraStartDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
            : Math.floor((now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
          weekNumber = weeksSinceFlora + 1;
          context = "TENT_BC";
        } else if (tentCategory === "VEGA") {
          currentPhase = "VEGA";
          const weeksSinceStart = Math.floor(
            (now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
          );
          weekNumber = weeksSinceStart + 1;
          context = "TENT_BC";
        } else {
          // Fallback
          currentPhase = "MAINTENANCE";
          weekNumber = null;
          context = "TENT_A";
        }

        // Get templates for this phase/week
        let templates;
        if (currentPhase === "MAINTENANCE" || currentPhase === "DRYING") {
          // For maintenance and drying, get tasks without week number filter
          templates = await database
            .select()
            .from(taskTemplates)
            .where(
              and(
                eq(taskTemplates.context, context),
                eq(taskTemplates.phase, currentPhase)
              )
            );
        } else {
          // For VEGA/FLORA, filter by week number
          templates = await database
            .select()
            .from(taskTemplates)
            .where(
              and(
                eq(taskTemplates.context, context),
                eq(taskTemplates.phase, currentPhase),
                eq(taskTemplates.weekNumber, weekNumber!)
              )
            );
        }

        for (const template of templates) {
          // Check if instance already exists for this week
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          startOfWeek.setHours(0, 0, 0, 0);

          const existing = await database
            .select()
            .from(taskInstances)
            .where(
              and(
                eq(taskInstances.tentId, cycle.tentId),
                eq(taskInstances.taskTemplateId, template.id),
                eq(taskInstances.occurrenceDate, startOfWeek)
              )
            )
            .limit(1);

          if (existing.length === 0) {
            // Create instance
            await database.insert(taskInstances).values({
              tentId: cycle.tentId,
              taskTemplateId: template.id,
              occurrenceDate: startOfWeek,
              isDone: false,
            });

            // Fetch the created instance to get the ID
            const created = await database
              .select()
              .from(taskInstances)
              .where(
                and(
                  eq(taskInstances.tentId, cycle.tentId),
                  eq(taskInstances.taskTemplateId, template.id),
                  eq(taskInstances.occurrenceDate, startOfWeek)
                )
              )
              .limit(1);

            allTasks.push({
              id: created[0]?.id || 0,
              tentId: cycle.tentId,
              tentName: tent[0]?.name || `Estufa ${cycle.tentId}`,
              title: template.title,
              description: template.description,
              phase: currentPhase,
              weekNumber,
              isDone: false,
              completedAt: null,
              notes: null,
            });
          } else {
            allTasks.push({
              id: existing[0].id,
              tentId: cycle.tentId,
              tentName: tent[0]?.name || `Estufa ${cycle.tentId}`,
              title: template.title,
              description: template.description,
              phase: currentPhase,
              weekNumber,
              isDone: existing[0].isDone,
              completedAt: existing[0].completedAt,
              notes: existing[0].notes,
            });
          }
        }
      }

      return allTasks;
    }),
    markAsDone: protectedProcedure
      .input(
        z.object({
          taskId: z.number(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        await database
          .update(taskInstances)
          .set({ isDone: true, completedAt: new Date(), notes: input.notes })
          .where(eq(taskInstances.id, input.taskId));
        return { success: true };
      }),
    toggleTask: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        
        // Get current state
        const task = await database
          .select()
          .from(taskInstances)
          .where(eq(taskInstances.id, input.taskId))
          .limit(1);
        
        if (task.length === 0) throw new Error("Task not found");
        
        const newIsDone = !task[0].isDone;
        await database
          .update(taskInstances)
          .set({ 
            isDone: newIsDone, 
            completedAt: newIsDone ? new Date() : null 
          })
          .where(eq(taskInstances.id, input.taskId));
        
        return { success: true, isDone: newIsDone };
      }),
    delete: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        await database.delete(taskInstances).where(eq(taskInstances.id, input.taskId));
        return { success: true };
      }),
  }),


  // Tent A (Estufa A - Clonagem)
  tentA: router({
    getState: protectedProcedure.input(z.object({ tentId: z.number() })).query(async ({ input }) => {
      return db.getTentAState(input.tentId);
    }),
    startCloning: protectedProcedure
      .input(
        z.object({
          tentId: z.number(),
          startDate: z.date(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }

        // Calcular end date (start + 13 dias = 14 dias totais)
        const endDate = new Date(input.startDate);
        endDate.setDate(endDate.getDate() + 13);

        // Criar evento de clonagem
        await database.insert(cloningEvents).values({
          tentId: input.tentId,
          startDate: input.startDate,
          endDate: endDate,
          status: "ACTIVE",
        });

        // Atualizar estado da estufa A
        await database
          .update(tentAState)
          .set({
            mode: "CLONING",
            activeCloningEventId: null,
          })
          .where(eq(tentAState.tentId, input.tentId));

        return { success: true };
      }),
  }),

  // Calculations (Histórico de Cálculos)

  // Database (Exportação de Banco de Dados)
  database: router({
    export: protectedProcedure.query(async () => {
      const { generateSQLDump } = await import("./databaseExport");
      const sqlDump = await generateSQLDump();
      return { sql: sqlDump };
    }),
    import: protectedProcedure
      .input(z.object({ sqlContent: z.string() }))
      .mutation(async ({ input }) => {
        const { importSQLDump } = await import("./databaseImport");
        const result = await importSQLDump(input.sqlContent);
        return result;
      }),
  }),

  // Notifications (Notificações)
  notifications: router({
    getHistory: protectedProcedure.query(async () => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");
      const history = await database
        .select()
        .from(notificationHistory)
        .orderBy(desc(notificationHistory.sentAt))
        .limit(100);
      return history;
    }),
    create: protectedProcedure
      .input(
        z.object({
          type: z.enum(["daily_reminder", "environment_alert", "task_reminder"]),
          title: z.string(),
          message: z.string(),
          metadata: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        const [notification] = await database
          .insert(notificationHistory)
          .values({
            type: input.type,
            title: input.title,
            message: input.message,
            metadata: input.metadata,
          });
        return notification;
      }),
    markAsRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await database
          .update(notificationHistory)
          .set({ isRead: true })
          .where(eq(notificationHistory.id, input.id));
        return { success: true };
      }),
  }),

  // Plants (Plantas Individuais)
  plants: router({
    // Criar nova planta
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        code: z.string().optional(),
        strainId: z.number(),
        currentTentId: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const result = await database.insert(plants).values({
          name: input.name,
          code: input.code,
          strainId: input.strainId,
          currentTentId: input.currentTentId,
          notes: input.notes,
          status: "ACTIVE",
        });
        
        // Retornar o ID inserido
        return { id: result.insertId };
      }),

    // Listar plantas (apenas ACTIVE por padrão)
    list: protectedProcedure
      .input(z.object({
        tentId: z.number().optional(),
        strainId: z.number().optional(),
        status: z.enum(["ACTIVE", "HARVESTED", "DEAD", "DISCARDED"]).optional(),
      }))
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        let conditions = [];
        
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
        
        let query = database.select().from(plants).where(and(...conditions));
        
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
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        const [plant] = await database
          .select()
          .from(plants)
          .where(eq(plants.id, input.id));
        
        return plant;
      }),

    // Atualizar planta
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          code: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

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
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
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
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
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
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
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
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
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
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
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
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
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
      .mutation(async ({ input }) => {
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
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
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
      .mutation(async ({ input }) => {
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
      .mutation(async ({ input }) => {
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
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
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

    // Excluir planta permanentemente
    delete: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Delete all related records first (cascade)
        await database.delete(plantObservations).where(eq(plantObservations.plantId, input.plantId));
        await database.delete(plantPhotos).where(eq(plantPhotos.plantId, input.plantId));
        await database.delete(plantRunoffLogs).where(eq(plantRunoffLogs.plantId, input.plantId));
        await database.delete(plantHealthLogs).where(eq(plantHealthLogs.plantId, input.plantId));
        await database.delete(plantTrichomeLogs).where(eq(plantTrichomeLogs.plantId, input.plantId));
        await database.delete(plantLSTLogs).where(eq(plantLSTLogs.plantId, input.plantId));
        await database.delete(plantTentHistory).where(eq(plantTentHistory.plantId, input.plantId));
        
        // Delete the plant itself
        await database.delete(plants).where(eq(plants.id, input.plantId));
        
        return { success: true };
      }),

    // Excluir múltiplas plantas em massa
    bulkDelete: protectedProcedure
      .input(z.object({ plantIds: z.array(z.number()) }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        if (!input.plantIds.length) return { count: 0 };

        // Deletar registros relacionados para todas as plantas
        await database.delete(plantObservations).where(inArray(plantObservations.plantId, input.plantIds));
        await database.delete(plantPhotos).where(inArray(plantPhotos.plantId, input.plantIds));
        await database.delete(plantRunoffLogs).where(inArray(plantRunoffLogs.plantId, input.plantIds));
        await database.delete(plantHealthLogs).where(inArray(plantHealthLogs.plantId, input.plantIds));
        await database.delete(plantTrichomeLogs).where(inArray(plantTrichomeLogs.plantId, input.plantIds));
        await database.delete(plantLSTLogs).where(inArray(plantLSTLogs.plantId, input.plantIds));
        await database.delete(plantTentHistory).where(inArray(plantTentHistory.plantId, input.plantIds));

        // Deletar as plantas
        await database.delete(plants).where(inArray(plants.id, input.plantIds));

        return { count: input.plantIds.length };
      }),

    // Buscar histórico de movimentação entre estufas
    getTentHistory: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .query(async ({ input }) => {
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

    // Buscar fotos da planta
    getPhotos: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
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
        imageData: z.string(), // base64
        mimeType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Converter base64 para Buffer
        const base64Data = input.imageData.split(',')[1] || input.imageData;
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Upload para S3
        const { storagePut } = await import("./storage");
        const fileKey = `plants/${input.plantId}/${Date.now()}.${input.mimeType.split('/')[1]}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        
        // Salvar no banco
        const [photo] = await database
          .insert(plantPhotos)
          .values({
            plantId: input.plantId,
            url,
            fileKey,
          })
          .returning();
        
        return photo;
      }),

    // Excluir foto da planta
    deletePhoto: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
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
        finishReason: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
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
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
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
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        let query = database
          .select()
          .from(plants)
          .where(
            input.status 
              ? eq(plants.status, input.status)
              : or(
                  eq(plants.status, "HARVESTED"),
                  eq(plants.status, "DISCARDED"),
                  eq(plants.status, "DEAD")
                )
          )
          .orderBy(desc(plants.finishedAt));
        
        const archivedPlants = await query;
        
        // Para cada planta, buscar strain, última foto, estufa e ciclo
        const plantsWithDetails = await Promise.all(
          archivedPlants.map(async (plant: any) => {
            // Buscar strain
            const [strain] = await database
              .select()
              .from(strains)
              .where(eq(strains.id, plant.strainId));
            
            // Última foto de saúde
            const [lastHealthPhoto] = await database
              .select()
              .from(plantHealthLogs)
              .where(eq(plantHealthLogs.plantId, plant.id))
              .orderBy(desc(plantHealthLogs.logDate))
              .limit(1);
            
            // Buscar nome da estufa
            let tentName: string | null = null;
            if (plant.currentTentId) {
              const [tent] = await database
                .select({ name: tents.name })
                .from(tents)
                .where(eq(tents.id, plant.currentTentId));
              tentName = tent?.name || null;
            }
            
            // Buscar dados de colheita do ciclo mais recente da estufa
            let harvestWeight: string | null = null;
            let harvestNotes: string | null = null;
            if (plant.currentTentId) {
              const [lastCycle] = await database
                .select({ 
                  harvestWeight: cycles.harvestWeight, 
                  harvestNotes: cycles.harvestNotes 
                })
                .from(cycles)
                .where(and(
                  eq(cycles.tentId, plant.currentTentId),
                  eq(cycles.status, "FINISHED")
                ))
                .orderBy(desc(cycles.createdAt))
                .limit(1);
              harvestWeight = lastCycle?.harvestWeight || null;
              harvestNotes = lastCycle?.harvestNotes || null;
            }
            
            return {
              ...plant,
              strainName: strain?.name || "Desconhecida",
              lastHealthPhotoUrl: lastHealthPhoto?.photoUrl || null,
              tentName,
              harvestWeight,
              harvestNotes,
            };
          })
        );
        
        return plantsWithDetails;
      }),

    // Excluir planta permanentemente (apenas para erros de cadastro)
    deletePermanently: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        // Deletar todos os registros relacionados primeiro (cascade manual)
        await database.delete(plantHealthLogs).where(eq(plantHealthLogs.plantId, input.plantId));
        await database.delete(plantTrichomeLogs).where(eq(plantTrichomeLogs.plantId, input.plantId));
        await database.delete(plantLSTLogs).where(eq(plantLSTLogs.plantId, input.plantId));
        await database.delete(plantPhotos).where(eq(plantPhotos.plantId, input.plantId));
        await database.delete(plantObservations).where(eq(plantObservations.plantId, input.plantId));
        await database.delete(plantTentHistory).where(eq(plantTentHistory.plantId, input.plantId));
        await database.delete(plantRunoffLogs).where(eq(plantRunoffLogs.plantId, input.plantId));
        
        // Deletar planta
        await database.delete(plants).where(eq(plants.id, input.plantId));
        
        return { success: true };
      }),
  }),

  // Plant Observations
  plantObservations: router({
    create: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        content: z.string(),
      }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database.insert(plantObservations).values({
          plantId: input.plantId,
          content: input.content,
        });
        
        return { success: true };
      }),

    list: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        return await database
          .select()
          .from(plantObservations)
          .where(eq(plantObservations.plantId, input.plantId))
          .orderBy(desc(plantObservations.observationDate));
      }),
  }),

  // Plant Photos
  plantPhotos: router({
    list: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        return await database
          .select()
          .from(plantPhotos)
          .where(eq(plantPhotos.plantId, input.plantId))
          .orderBy(desc(plantPhotos.photoDate));
      }),
    
    upload: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        photoBase64: z.string(), // Base64 data URL
        description: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        let photoUrl: string | undefined;
        let photoKey: string | undefined;

        // Upload foto para storage
        try {
          // Remover prefixo data:image/...;base64,
          const base64Data = input.photoBase64.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, 'base64');
          
          // Upload para storage local
          const { storagePut } = await import("./storage");
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
          description: input.description,
          photoDate: new Date(),
        });
        
        return { success: true, photoUrl };
      }),
    
    delete: protectedProcedure
      .input(z.object({ photoId: z.number() }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database
          .delete(plantPhotos)
          .where(eq(plantPhotos.id, input.photoId));
        
        return { success: true };
      }),
  }),

  // Plant Runoff Logs
  plantRunoff: router({
    create: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        volumeIn: z.number(),
        volumeOut: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
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
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        return await database
          .select()
          .from(plantRunoffLogs)
          .where(eq(plantRunoffLogs.plantId, input.plantId))
          .orderBy(desc(plantRunoffLogs.logDate));
      }),
  }),

  // Plant Health Logs
  plantHealth: router({
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
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        let resolvedPhotoUrl: string | undefined = input.photoUrl; // preferência: URL pré-enviada
        let photoKey: string | undefined;

        // Fallback legado: base64 (caso o frontend antigo ainda envie)
        if (!resolvedPhotoUrl && input.photoBase64) {
          console.log('[PlantHealth.create] Fallback base64 upload...');
          try {
            const base64Data = input.photoBase64.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            const { storagePut } = await import("./storage");
            photoKey = `health/${input.plantId}/${Date.now()}.jpg`;
            const result = await storagePut(photoKey, buffer, "image/jpeg");
            resolvedPhotoUrl = result.url;
          } catch (error: any) {
            console.error('[PlantHealth] Base64 fallback upload failed:', error.message);
          }
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
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
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
              const { storagePut } = await import("./storage");
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
  }),

  // Plant Trichome Logs
  plantTrichomes: router({
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
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        let resolvedPhotoUrl: string | undefined = input.photoUrl;
        let photoKey: string | undefined;

        // Fallback legado: base64
        if (!resolvedPhotoUrl && input.photoBase64) {
          try {
            const base64Data = input.photoBase64.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            const { storagePut } = await import("./storage");
            photoKey = `trichomes/${input.plantId}/${Date.now()}.jpg`;
            const result = await storagePut(photoKey, buffer, "image/jpeg");
            resolvedPhotoUrl = result.url;
          } catch (error: any) {
            console.error('[PlantTrichomes] Base64 fallback upload failed:', error.message);
          }
        }
        
        await database.insert(plantTrichomeLogs).values({
          plantId: input.plantId,
          weekNumber: input.weekNumber,
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
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        return await database
          .select()
          .from(plantTrichomeLogs)
          .where(eq(plantTrichomeLogs.plantId, input.plantId))
          .orderBy(desc(plantTrichomeLogs.logDate));
      }),
  }),

  // Plant LST Logs
  plantLST: router({
    create: protectedProcedure
      .input(z.object({
        plantId: z.number(),
        technique: z.string(),
        response: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database.insert(plantLSTLogs).values({
          plantId: input.plantId,
          technique: input.technique,
          response: input.response,
          notes: input.notes,
        });
        
        return { success: true };
      }),

    list: protectedProcedure
      .input(z.object({ plantId: z.number() }))
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        return await database
          .select()
          .from(plantLSTLogs)
          .where(eq(plantLSTLogs.plantId, input.plantId))
          .orderBy(desc(plantLSTLogs.logDate));
      }),
  }),

  // Fertilization Presets (Predefinições de Fertilização)
  fertilizationPresets: router({
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        waterVolume: z.number(),
        targetEC: z.number(),
        phase: z.enum(["VEGA", "FLORA"]).optional(),
        weekNumber: z.number().optional(),
        irrigationsPerWeek: z.number().optional(),
        calculationMode: z.enum(["per-irrigation", "per-week"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database.insert(fertilizationPresets).values({
          
          name: input.name,
          waterVolume: input.waterVolume.toString(),
          targetEC: input.targetEC.toString(),
          phase: input.phase,
          weekNumber: input.weekNumber,
          irrigationsPerWeek: input.irrigationsPerWeek?.toString(),
          calculationMode: input.calculationMode,
        });
        
        return { success: true };
      }),

    list: protectedProcedure
      .query(async ({ ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        return await database
          .select()
          .from(fertilizationPresets)
          
          .orderBy(desc(fertilizationPresets.createdAt));
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database
          .delete(fertilizationPresets)
          .where(eq(fertilizationPresets.id, input.id));
        
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string(),
        waterVolume: z.number(),
        targetEC: z.number(),
        phase: z.enum(["VEGA", "FLORA"]).optional(),
        weekNumber: z.number().optional(),
        irrigationsPerWeek: z.number().optional(),
        calculationMode: z.enum(["per-irrigation", "per-week"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database
          .update(fertilizationPresets)
          .set({
            name: input.name,
            waterVolume: input.waterVolume.toString(),
            targetEC: input.targetEC.toString(),
            phase: input.phase,
            weekNumber: input.weekNumber,
            irrigationsPerWeek: input.irrigationsPerWeek?.toString(),
            calculationMode: input.calculationMode,
          })
          .where(eq(fertilizationPresets.id, input.id));
        
        return { success: true };
      }),
  }),

  // Watering Presets (Predefinições de Rega)
  wateringPresets: router({
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        plantCount: z.number(),
        potSize: z.number(),
        targetRunoff: z.number(),
        phase: z.enum(["VEGA", "FLORA"]).optional(),
        weekNumber: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database.insert(wateringPresets).values({
          
          name: input.name,
          plantCount: input.plantCount,
          potSize: input.potSize.toString(),
          targetRunoff: input.targetRunoff.toString(),
          phase: input.phase,
          weekNumber: input.weekNumber,
        });
        
        return { success: true };
      }),

    list: protectedProcedure
      .query(async ({ ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        return await database
          .select()
          .from(wateringPresets)
          
          .orderBy(desc(wateringPresets.createdAt));
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database
          .delete(wateringPresets)
          .where(eq(wateringPresets.id, input.id));
        
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string(),
        plantCount: z.number(),
        potSize: z.number(),
        targetRunoff: z.number(),
        phase: z.enum(["VEGA", "FLORA"]).optional(),
        weekNumber: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        
        await database
          .update(wateringPresets)
          .set({
            name: input.name,
            plantCount: input.plantCount,
            potSize: input.potSize.toString(),
            targetRunoff: input.targetRunoff.toString(),
            phase: input.phase,
            weekNumber: input.weekNumber,
          })
          .where(eq(wateringPresets.id, input.id));
        
        return { success: true };
      }),
  }),

  taskTemplates: router({
    list: protectedProcedure.query(async () => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      const templates = await database
        .select()
        .from(taskTemplates)
        .orderBy(taskTemplates.phase, taskTemplates.weekNumber, taskTemplates.title);

      return templates;
    }),

    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1),
          description: z.string().optional(),
          phase: z.enum(["VEGA", "FLORA", "MAINTENANCE", "DRYING"]),
          context: z.enum(["TENT_A", "TENT_BC"]),
          weekNumber: z.number().int().min(1).max(12).nullable(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        const [newTemplate] = await database.insert(taskTemplates).values({
          title: input.title,
          description: input.description || null,
          phase: input.phase,
          context: input.context,
          weekNumber: input.weekNumber,
        });

        return { success: true, id: newTemplate.insertId };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().min(1),
          description: z.string().optional(),
          phase: z.enum(["VEGA", "FLORA", "MAINTENANCE", "DRYING"]),
          context: z.enum(["TENT_A", "TENT_BC"]),
          weekNumber: z.number().int().min(1).max(12).nullable(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        await database
          .update(taskTemplates)
          .set({
            title: input.title,
            description: input.description || null,
            phase: input.phase,
            context: input.context,
            weekNumber: input.weekNumber,
          })
          .where(eq(taskTemplates.id, input.id));

        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        // Verificar se o template existe
        const existing = await database
          .select()
          .from(taskTemplates)
          .where(eq(taskTemplates.id, input.id))
          .limit(1);

        if (existing.length === 0) {
          throw new Error("Template de tarefa não encontrado");
        }

        await database.delete(taskTemplates).where(eq(taskTemplates.id, input.id));

        return { success: true };
      }),
  }),

  // Nutrient Recipes (Receitas de Nutrientes)
  nutrients: router({
    // Listar templates de receitas
    listTemplates: protectedProcedure
      .input(z.object({ phase: z.enum(["CLONING", "VEGA", "FLORA", "MAINTENANCE", "DRYING"]).optional() }).optional())
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        if (input?.phase) {
          return database
            .select()
            .from(recipeTemplates)
            .where(eq(recipeTemplates.phase, input.phase))
            .orderBy(recipeTemplates.weekNumber, recipeTemplates.name);
        }

        return database
          .select()
          .from(recipeTemplates)
          .orderBy(recipeTemplates.phase, recipeTemplates.weekNumber, recipeTemplates.name);
      }),

    // Criar template de receita
    createTemplate: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          phase: z.enum(["CLONING", "VEGA", "FLORA", "MAINTENANCE", "DRYING"]),
          weekNumber: z.number().int().min(1).max(12).nullable(),
          volumeTotalL: z.number().positive(),
          ecTarget: z.number().nonnegative().nullable(),
          phTarget: z.number().min(4).max(8).nullable(),
          products: z.array(
            z.object({
              name: z.string(),
              amountMl: z.number().nonnegative(),
              npk: z.string().optional(),
              ca: z.number().optional(),
              mg: z.number().optional(),
              fe: z.number().optional(),
            })
          ),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        const [newTemplate] = await database.insert(recipeTemplates).values({
          name: input.name,
          phase: input.phase,
          weekNumber: input.weekNumber,
          volumeTotalL: input.volumeTotalL.toString(),
          ecTarget: input.ecTarget?.toString() || null,
          phTarget: input.phTarget?.toString() || null,
          productsJson: JSON.stringify(input.products),
          notes: input.notes || null,
        });

        return { success: true, id: newTemplate.insertId };
      }),

    // Registrar aplicação de nutrientes
    recordApplication: protectedProcedure
      .input(
        z.object({
          tentId: z.number(),
          cycleId: z.number().nullable(),
          recipeTemplateId: z.number().nullable(),
          recipeName: z.string(),
          phase: z.enum(["CLONING", "VEGA", "FLORA", "MAINTENANCE", "DRYING"]),
          weekNumber: z.number().nullable(),
          volumeTotalL: z.number().positive(),
          ecTarget: z.number().nullable(),
          ecActual: z.number().nullable(),
          phTarget: z.number().nullable(),
          phActual: z.number().nullable(),
          products: z.array(
            z.object({
              name: z.string(),
              amountMl: z.number().nonnegative(),
              npk: z.string().optional(),
              ca: z.number().optional(),
              mg: z.number().optional(),
              fe: z.number().optional(),
            })
          ),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        const [newApplication] = await database.insert(nutrientApplications).values({
          tentId: input.tentId,
          cycleId: input.cycleId,
          recipeTemplateId: input.recipeTemplateId,
          recipeName: input.recipeName,
          phase: input.phase,
          weekNumber: input.weekNumber,
          volumeTotalL: input.volumeTotalL.toString(),
          ecTarget: input.ecTarget?.toString() || null,
          ecActual: input.ecActual?.toString() || null,
          phTarget: input.phTarget?.toString() || null,
          phActual: input.phActual?.toString() || null,
          productsJson: JSON.stringify(input.products),
          notes: input.notes || null,
        });

        return { success: true, id: newApplication.insertId };
      }),

    // Listar histórico de aplicações
    listApplications: protectedProcedure
      .input(
        z.object({
          tentId: z.number().optional(),
          cycleId: z.number().optional(),
          phase: z.enum(["CLONING", "VEGA", "FLORA", "MAINTENANCE", "DRYING"]).optional(),
          limit: z.number().int().positive().default(50),
        }).optional()
      )
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        let query = database.select().from(nutrientApplications);

        const conditions = [];
        if (input?.tentId) conditions.push(eq(nutrientApplications.tentId, input.tentId));
        if (input?.cycleId) conditions.push(eq(nutrientApplications.cycleId, input.cycleId));
        if (input?.phase) conditions.push(eq(nutrientApplications.phase, input.phase));

        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as any;
        }

        return query
          .orderBy(desc(nutrientApplications.applicationDate))
          .limit(input?.limit || 50);
      }),
  }),

  // Watering Applications (Aplicações de Rega)
  watering: router({
    // Registrar aplicação de rega
    recordApplication: protectedProcedure
      .input(
        z.object({
          tentId: z.number(),
          cycleId: z.number().nullable(),
          recipeName: z.string(),
          potSizeL: z.number().positive(),
          numberOfPots: z.number().int().positive(),
          waterPerPotL: z.number().positive(),
          totalWaterL: z.number().positive(),
          targetRunoffPercent: z.number().nullable(),
          expectedRunoffL: z.number().nullable(),
          actualRunoffL: z.number().nullable(),
          actualRunoffPercent: z.number().nullable(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        const [newApplication] = await database.insert(wateringApplications).values({
          tentId: input.tentId,
          cycleId: input.cycleId,
          recipeName: input.recipeName,
          potSizeL: input.potSizeL.toString(),
          numberOfPots: input.numberOfPots,
          waterPerPotL: input.waterPerPotL.toString(),
          totalWaterL: input.totalWaterL.toString(),
          targetRunoffPercent: input.targetRunoffPercent?.toString() || null,
          expectedRunoffL: input.expectedRunoffL?.toString() || null,
          actualRunoffL: input.actualRunoffL?.toString() || null,
          actualRunoffPercent: input.actualRunoffPercent?.toString() || null,
          notes: input.notes || null,
        });

        return { success: true, id: newApplication.insertId };
      }),

    // Listar histórico de aplicações
    listApplications: protectedProcedure
      .input(
        z.object({
          tentId: z.number().optional(),
          cycleId: z.number().optional(),
          limit: z.number().int().positive().default(50),
        }).optional()
      )
      .query(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        let query = database
          .select({
            ...wateringApplications,
            cycleStartDate: cycles.startDate,
            cycleFloraStartDate: cycles.floraStartDate,
            tentName: tents.name,
          })
          .from(wateringApplications)
          .leftJoin(cycles, eq(wateringApplications.cycleId, cycles.id))
          .leftJoin(tents, eq(wateringApplications.tentId, tents.id));

        const conditions = [];
        if (input?.tentId) conditions.push(eq(wateringApplications.tentId, input.tentId));
        if (input?.cycleId) conditions.push(eq(wateringApplications.cycleId, input.cycleId));

        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as any;
        }

        return query
          .orderBy(desc(wateringApplications.applicationDate))
          .limit(input?.limit || 50);
      }),
  }),

  // Backup & Restore
  backup: router({
    // Exportar backup completo
    export: protectedProcedure.query(async () => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      // Buscar todos os dados
      const [allTents, allStrains, allCycles, allPlants, allDailyLogs, allTaskTemplates, allAlertSettings, allAlerts, allPlantPhotos, allPlantHealth, allRecipeTemplates, allNutrientApplications, allWateringApplications] = await Promise.all([
        database.select().from(tents),
        database.select().from(strains),
        database.select().from(cycles),
        database.select().from(plants),
        database.select().from(dailyLogs),
        database.select().from(taskTemplates),
        database.select().from(alertSettings),
        database.select().from(alerts),
        database.select().from(plantPhotos),
        database.select().from(plantHealthLogs),
        database.select().from(recipeTemplates),
        database.select().from(nutrientApplications),
        database.select().from(wateringApplications),
      ]);

      return {
        version: "1.0",
        exportDate: new Date().toISOString(),
        data: {
          tents: allTents,
          strains: allStrains,
          cycles: allCycles,
          plants: allPlants,
          dailyLogs: allDailyLogs,
          taskTemplates: allTaskTemplates,
          alertSettings: allAlertSettings,
          alerts: allAlerts,
          plantPhotos: allPlantPhotos,
          plantHealthLogs: allPlantHealth,
          recipeTemplates: allRecipeTemplates,
          nutrientApplications: allNutrientApplications,
          wateringApplications: allWateringApplications,
        },
      };
    }),

    // Importar backup
    import: protectedProcedure
      .input(
        z.object({
          version: z.string(),
          exportDate: z.string(),
          data: z.object({
            tents: z.array(z.any()).optional(),
            strains: z.array(z.any()).optional(),
            cycles: z.array(z.any()).optional(),
            plants: z.array(z.any()).optional(),
            dailyLogs: z.array(z.any()).optional(),
            taskTemplates: z.array(z.any()).optional(),
            alertSettings: z.array(z.any()).optional(),
            alerts: z.array(z.any()).optional(),
            plantPhotos: z.array(z.any()).optional(),
            plantHealthLogs: z.array(z.any()).optional(),
            recipeTemplates: z.array(z.any()).optional(),
            nutrientApplications: z.array(z.any()).optional(),
            wateringApplications: z.array(z.any()).optional(),
          }),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        // Validar versão
        if (input.version !== "1.0") {
          throw new Error("Versão de backup não suportada");
        }

        // Função auxiliar: converte strings ISO de data para objetos Date
        const sanitizeDates = (rows: any[]): any[] =>
          rows.map((row) => {
            const out: Record<string, any> = {};
            for (const [k, v] of Object.entries(row)) {
              if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
                const d = new Date(v);
                out[k] = isNaN(d.getTime()) ? v : d;
              } else {
                out[k] = v;
              }
            }
            return out;
          });

        // Tudo dentro de uma transação: se qualquer operação falhar,
        // o banco volta ao estado original automaticamente.
        await database.transaction(async (tx) => {
          // Deletar dados existentes (ordem reversa de dependências)
          await tx.delete(wateringApplications);
          await tx.delete(nutrientApplications);
          await tx.delete(plantRunoffLogs);
          await tx.delete(plantTrichomeLogs);
          await tx.delete(plantLSTLogs);
          await tx.delete(plantObservations);
          await tx.delete(plantHealthLogs);
          await tx.delete(plantPhotos);
          await tx.delete(plantTentHistory);
          await tx.delete(recipeTemplates);
          await tx.delete(wateringPresets);
          await tx.delete(fertilizationPresets);
          await tx.delete(recipes);
          await tx.delete(notificationHistory);
          await tx.delete(alertHistory);
          await tx.delete(alerts);
          await tx.delete(alertSettings);
          await tx.delete(taskInstances);
          await tx.delete(taskTemplates);
          await tx.delete(dailyLogs);
          await tx.delete(plants);
          await tx.delete(cloningEvents);
          await tx.delete(tentAState);
          await tx.delete(cycles);
          await tx.delete(weeklyTargets);
          await tx.delete(strains);
          await tx.delete(tents);

          // Inserir dados do backup (com datas convertidas)
          if (input.data.tents?.length) await tx.insert(tents).values(sanitizeDates(input.data.tents));
          if (input.data.strains?.length) await tx.insert(strains).values(sanitizeDates(input.data.strains));
          if (input.data.cycles?.length) await tx.insert(cycles).values(sanitizeDates(input.data.cycles));
          if (input.data.plants?.length) await tx.insert(plants).values(sanitizeDates(input.data.plants));
          if (input.data.dailyLogs?.length) await tx.insert(dailyLogs).values(sanitizeDates(input.data.dailyLogs));
          if (input.data.taskTemplates?.length) await tx.insert(taskTemplates).values(sanitizeDates(input.data.taskTemplates));
          if (input.data.alertSettings?.length) await tx.insert(alertSettings).values(sanitizeDates(input.data.alertSettings));
          if (input.data.alerts?.length) await tx.insert(alerts).values(sanitizeDates(input.data.alerts));
          if (input.data.plantPhotos?.length) await tx.insert(plantPhotos).values(sanitizeDates(input.data.plantPhotos));
          if (input.data.plantHealthLogs?.length) await tx.insert(plantHealthLogs).values(sanitizeDates(input.data.plantHealthLogs));
          if (input.data.recipeTemplates?.length) await tx.insert(recipeTemplates).values(sanitizeDates(input.data.recipeTemplates));
          if (input.data.nutrientApplications?.length) await tx.insert(nutrientApplications).values(sanitizeDates(input.data.nutrientApplications));
          if (input.data.wateringApplications?.length) await tx.insert(wateringApplications).values(sanitizeDates(input.data.wateringApplications));
        });

        return { success: true, message: "Backup restaurado com sucesso" };
      }),
  }),

  // Área Aguardando Secagem (Harvest Queue)
  harvestQueue: router({
    // Listar todas as plantas aguardando secagem
    list: protectedProcedure.query(async () => {
      const database = await getDb();
      if (!database) throw new Error("DB não disponível");
      const queuePlants = await database
        .select()
        .from(plants)
        .where(eq(plants.status, "AWAITING_DRYING"))
        .orderBy(asc(plants.harvestQueueAt));
      return queuePlants;
    }),

    // Mover plantas de uma estufa FLORA para a fila de secagem
    // Isso libera a estufa sem precisar de uma estufa de secagem disponível
    moveToQueue: protectedProcedure
      .input(
        z.object({
          cycleId: z.number(),
          harvestNotes: z.string().optional(),
          harvestWeight: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("DB não disponível");

        // Buscar ciclo
        const [cycle] = await database
          .select()
          .from(cycles)
          .where(eq(cycles.id, input.cycleId));

        if (!cycle) throw new Error("Ciclo não encontrado");
        if (!cycle.floraStartDate) throw new Error("Ciclo não está em floração");

        // Buscar plantas ativas da estufa
        const cyclePlants = await database
          .select()
          .from(plants)
          .where(and(
            eq(plants.currentTentId, cycle.tentId),
            eq(plants.status, "ACTIVE")
          ));

        if (cyclePlants.length === 0) {
          throw new Error("Nenhuma planta ativa encontrada nesta estufa");
        }

        const now = new Date();

        // Mover plantas para a fila: status AWAITING_DRYING, sem estufa
        await database
          .update(plants)
          .set({
            status: "AWAITING_DRYING",
            currentTentId: null, // Sai da estufa
            harvestQueueAt: now,
            harvestQueueNotes: input.harvestNotes || null,
          })
          .where(and(
            eq(plants.currentTentId, cycle.tentId),
            eq(plants.status, "ACTIVE")
          ));

        // Registrar histórico de saída da estufa
        for (const plant of cyclePlants) {
          await database.insert(plantTentHistory).values({
            plantId: plant.id,
            fromTentId: cycle.tentId,
            toTentId: null, // Sem estufa destino: planta vai para fila de aguardando secagem
            reason: `Colhida e movida para Aguardando Secagem. ${input.harvestNotes || ""}`.trim(),
          });
        }

        // Finalizar ciclo e salvar dados de colheita
        await database
          .update(cycles)
          .set({
            status: "FINISHED",
            harvestWeight: input.harvestWeight ? input.harvestWeight.toString() : null,
            harvestNotes: input.harvestNotes || null,
          })
          .where(eq(cycles.id, input.cycleId));

        // Resetar categoria da estufa para FLORA (vazia, pronta para receber novas plantas)
        // A estufa fica sem ciclo ativo — disponível para receber plantas da Vega
        await database
          .update(tents)
          .set({ category: "FLORA" })
          .where(eq(tents.id, cycle.tentId));

        return {
          success: true,
          plantsQueued: cyclePlants.length,
          message: `${cyclePlants.length} planta(s) movida(s) para Aguardando Secagem. Estufa liberada.`,
        };
      }),

    // Mover plantas da fila para uma estufa de secagem
    moveToDrying: protectedProcedure
      .input(
        z.object({
          targetTentId: z.number(), // Estufa que vai virar secagem
          plantIds: z.array(z.number()).optional(), // Se omitido, move todas
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("DB não disponível");

        // Verificar se a estufa destino está vazia (sem ciclo ativo)
        const [existingCycle] = await database
          .select()
          .from(cycles)
          .where(and(
            eq(cycles.tentId, input.targetTentId),
            eq(cycles.status, "ACTIVE")
          ));

        if (existingCycle) {
          const [targetTent] = await database.select().from(tents).where(eq(tents.id, input.targetTentId));
          throw new Error(`Estufa ${targetTent?.name || "destino"} ainda tem um ciclo ativo. Finalize o ciclo primeiro.`);
        }

        // Buscar plantas a mover
        let plantsToMove;
        if (input.plantIds && input.plantIds.length > 0) {
          plantsToMove = await database
            .select()
            .from(plants)
            .where(and(
              eq(plants.status, "AWAITING_DRYING"),
              inArray(plants.id, input.plantIds)
            ));
        } else {
          plantsToMove = await database
            .select()
            .from(plants)
            .where(eq(plants.status, "AWAITING_DRYING"));
        }

        if (plantsToMove.length === 0) {
          throw new Error("Nenhuma planta na fila de secagem");
        }

        const now = new Date();
        const plantIdList = plantsToMove.map((p: any) => p.id);

        // Mover plantas para a estufa de secagem
        await database
          .update(plants)
          .set({
            status: "ACTIVE",
            currentTentId: input.targetTentId,
            harvestQueueAt: null,
            harvestQueueNotes: null,
          })
          .where(inArray(plants.id, plantIdList));

        // Registrar histórico de movimentação
        for (const plant of plantsToMove) {
          await database.insert(plantTentHistory).values({
            plantId: plant.id,
            fromTentId: null, // Veio da fila (sem estufa)
            toTentId: input.targetTentId,
            reason: "Movida de Aguardando Secagem para estufa de secagem",
          });
        }

        // Buscar strain das plantas para criar ciclo
        const firstPlant = plantsToMove[0];

        // Criar ciclo de secagem na estufa destino
        await database.insert(cycles).values({
          tentId: input.targetTentId,
          strainId: firstPlant.strainId,
          startDate: now,
          status: "ACTIVE",
        });

        // Atualizar categoria da estufa para DRYING
        await database
          .update(tents)
          .set({ category: "DRYING" })
          .where(eq(tents.id, input.targetTentId));

        // Aplicar limites de alerta para DRYING
        await applyPhaseTransitionLimits(input.targetTentId, "DRYING");

        return {
          success: true,
          plantsMoved: plantsToMove.length,
          message: `${plantsToMove.length} planta(s) movida(s) para secagem.`,
        };
      }),

    // Descartar plantas da fila (ex: perdas)
    discard: protectedProcedure
      .input(
        z.object({
          plantIds: z.array(z.number()),
          reason: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("DB não disponível");
        await database
          .update(plants)
          .set({
            status: "DISCARDED",
            finishedAt: new Date(),
            finishReason: input.reason || "Descartada da fila de secagem",
            currentTentId: null,
          })
          .where(inArray(plants.id, input.plantIds));
        return { success: true };
      }),
  }),

  // Push Notifications (Web Push / VAPID)
  push: router({
    // Retorna a chave pública VAPID para o frontend
    getVapidKey: protectedProcedure.query(() => ({
      publicKey: getVapidPublicKey(),
      configured: isPushConfigured(),
    })),

    // Registrar subscription do dispositivo (persiste no banco)
    subscribe: protectedProcedure
      .input(
        z.object({
          subscription: z.object({
            endpoint: z.string(),
            expirationTime: z.number().nullable().optional(),
            keys: z.object({
              p256dh: z.string(),
              auth: z.string(),
            }),
          }),
          reminderEnabled: z.boolean().optional(),
          reminderTimes: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ input }) => {
        await saveSubscription(
          input.subscription as any,
          input.reminderEnabled,
          input.reminderTimes
        );
        return { success: true };
      }),

    // Atualizar configurações de lembrete para um endpoint específico (UPSERT)
    updateReminderSettings: protectedProcedure
      .input(
        z.object({
          endpoint: z.string(),
          reminderEnabled: z.boolean(),
          reminderTimes: z.array(z.string()),
          // Dados completos da subscription (necessários para UPSERT caso não exista no banco)
          keysJson: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        const { pushSubscriptions } = await import("../drizzle/schema");
        const reminderTimesJson = JSON.stringify(input.reminderTimes);

        // Verificar se já existe
        const existing = await database
          .select({ id: pushSubscriptions.id })
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, input.endpoint))
          .limit(1);

        if (existing.length > 0) {
          // Atualizar registro existente
          await database
            .update(pushSubscriptions)
            .set({
              reminderEnabled: input.reminderEnabled,
              reminderTimes: reminderTimesJson,
            })
            .where(eq(pushSubscriptions.endpoint, input.endpoint));
        } else if (input.keysJson) {
          // Inserir novo registro (UPSERT) — só possível se temos as chaves
          await database.insert(pushSubscriptions).values({
            endpoint: input.endpoint,
            keysJson: input.keysJson,
            reminderEnabled: input.reminderEnabled,
            reminderTimes: reminderTimesJson,
          });
          console.log(`[PushService] UPSERT: nova subscription criada via updateReminderSettings`);
        } else {
          console.warn(`[PushService] updateReminderSettings: endpoint não encontrado no banco e keysJson não fornecido — horários não salvos na subscription push`);
        }
        return { success: true };
      }),

    // Enviar notificação de teste
    sendTest: protectedProcedure.mutation(async () => {
      if (!isPushConfigured()) {
        throw new Error("Web Push não configurado. Adicione VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no .env");
      }
      const { sendPushToAll } = await import("./pushService");
      await sendPushToAll({
        title: "🧪 Teste — App Cultivo",
        body: "Notificações Push funcionando! 🌱",
        url: "/",
        tag: "test-push",
      });
      return { success: true };
    }),
  }),

  groups: router({
    // Buscar grupo do usuário atual
    mine: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.groupId) return null;
      const database = await getDb();
      if (!database) throw new Error('Banco indisponível');
      const [group] = await database.select().from(groups).where(eq(groups.id, ctx.user.groupId)).limit(1);
      if (!group) return null;
      // Contar membros
      const members = await database.select({ id: users.id, name: users.name, email: users.email, role: users.role })
        .from(users).where(eq(users.groupId, ctx.user.groupId));
      return { ...group, members, isOwner: group.ownerId === ctx.user.id };
    }),

    // Criar novo grupo
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error('Banco indisponível');
        const inviteCode = nanoid(8).toUpperCase();
        const [result] = await database.insert(groups).values({
          name: input.name,
          inviteCode,
          ownerId: ctx.user.id,
        });
        const groupId = result.insertId;
        // Atribuir usuário ao grupo
        await database.update(users).set({ groupId }).where(eq(users.id, ctx.user.id));
        return { success: true, groupId, inviteCode };
      }),

    // Entrar em um grupo via código de convite
    join: protectedProcedure
      .input(z.object({ inviteCode: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error('Banco indisponível');
        const [group] = await database.select().from(groups)
          .where(eq(groups.inviteCode, input.inviteCode.toUpperCase())).limit(1);
        if (!group) throw new Error('Código de convite inválido');
        await database.update(users).set({ groupId: group.id }).where(eq(users.id, ctx.user.id));
        return { success: true, groupId: group.id, groupName: group.name };
      }),

    // Regenerar código de convite (só o dono)
    regenerateCode: protectedProcedure.mutation(async ({ ctx }) => {
      if (!ctx.user.groupId) throw new Error('Você não pertence a nenhum grupo');
      const database = await getDb();
      if (!database) throw new Error('Banco indisponível');
      const [group] = await database.select().from(groups).where(eq(groups.id, ctx.user.groupId)).limit(1);
      if (!group || group.ownerId !== ctx.user.id) throw new Error('Apenas o dono pode regenerar o código');
      const inviteCode = nanoid(8).toUpperCase();
      await database.update(groups).set({ inviteCode }).where(eq(groups.id, ctx.user.groupId));
      return { inviteCode };
    }),

    // Remover membro do grupo (só o dono)
    removeMember: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.groupId) throw new Error('Você não pertence a nenhum grupo');
        const database = await getDb();
        if (!database) throw new Error('Banco indisponível');
        const [group] = await database.select().from(groups).where(eq(groups.id, ctx.user.groupId)).limit(1);
        if (!group || group.ownerId !== ctx.user.id) throw new Error('Apenas o dono pode remover membros');
        if (input.userId === ctx.user.id) throw new Error('Não pode se remover do grupo');
        await database.update(users).set({ groupId: null }).where(eq(users.id, input.userId));
        return { success: true };
      }),
  }),

  profile: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const user = await getUserById(ctx.user.id);
      if (!user) throw new Error('Usuário não encontrado');
      return { id: user.id, email: user.email, name: user.name, role: user.role };
    }),

    updateName: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
        await updateUserProfile(ctx.user.id, { name: input.name });
        return { success: true };
      }),

    updatePassword: protectedProcedure
      .input(z.object({ currentPassword: z.string(), newPassword: z.string().min(6) }))
      .mutation(async ({ ctx, input }) => {
        const user = await getUserById(ctx.user.id);
        if (!user) throw new Error('Usuário não encontrado');
        if (user.passwordHash) {
          const valid = await comparePassword(input.currentPassword, user.passwordHash);
          if (!valid) throw new Error('Senha atual incorreta');
        }
        const hash = await hashPassword(input.newPassword);
        await updateUserPassword(ctx.user.id, hash);
        return { success: true };
      }),

    deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
      const database = await getDb();
      if (!database) throw new Error('Banco indisponível');
      // Se for dono de um cultivo, dissolver o grupo (remover todos os membros)
      if (ctx.user.groupId) {
        const [group] = await database.select().from(groups).where(eq(groups.id, ctx.user.groupId)).limit(1);
        if (group && group.ownerId === ctx.user.id) {
          await database.update(users).set({ groupId: null }).where(eq(users.groupId, ctx.user.groupId));
          await database.delete(groups).where(eq(groups.id, ctx.user.groupId));
        }
      }
      await database.delete(users).where(eq(users.id, ctx.user.id));
      return { success: true };
    }),
  }),

  admin: router({
    listUsers: adminProcedure.query(async () => {
      const database = await getDb();
      if (!database) throw new Error('Banco indisponível');
      const result = await database
        .select({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn })
        .from(users)
        .orderBy(users.createdAt);
      return result;
    }),

    deleteUser: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.user.id) throw new Error('Não pode excluir sua própria conta por aqui');
        const database = await getDb();
        if (!database) throw new Error('Banco indisponível');
        await database.delete(users).where(eq(users.id, input.userId));
        return { success: true };
      }),

    setRole: adminProcedure
      .input(z.object({ userId: z.number(), role: z.enum(['user', 'admin']) }))
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.user.id) throw new Error('Não pode alterar seu próprio role');
        const database = await getDb();
        if (!database) throw new Error('Banco indisponível');
        await database.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
