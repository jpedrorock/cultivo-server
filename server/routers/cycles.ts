/**
 * cycles — sub-router tRPC do domínio "ciclo de cultivo".
 *
 * Antes vivia inline em server/routers.ts (linhas ~1402-2367, ~966 linhas).
 * Extraído pra reduzir o monstro principal.
 *
 * Procedures: listActive, getById, list, create, update, finish, promotePhase,
 * etc. Operações que cruzam strain/tent/plant via FK.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, or, desc, asc, sql, isNull, isNotNull, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { getDb, applyPhaseTransitionLimits } from "../db";
import {
  cycles,
  tents,
  strains,
  dailyLogs,
  plants,
  plantTentHistory,
  taskInstances,
} from "../../drizzle/schema";
import {
  validateTentOwnership,
  validateCycleOwnership,
  seedWeekTasks,
} from "./_helpers";

export const cyclesRouter = router({
    listActive: protectedProcedure.query(async ({ ctx }) => {
      const database = await getDb();
      if (!database) throw new Error("Banco de dados não inicializado");
      const allCycles = await database
        .select({
          id: cycles.id,
          status: cycles.status,
          tentId: cycles.tentId,
          tentGroupId: tents.groupId,
          startDate: cycles.startDate,
          floraStartDate: cycles.floraStartDate,
          cloningStartDate: cycles.cloningStartDate,
        })
        .from(cycles)
        .leftJoin(tents, eq(cycles.tentId, tents.id))
        .where(eq(cycles.status, "ACTIVE"));
      return allCycles.filter((c: any) =>
        ctx.user.groupId == null || c.tentGroupId == null || c.tentGroupId === ctx.user.groupId
      );
    }),
    getActiveCyclesWithProgress: protectedProcedure.query(async ({ ctx }) => {
      const database = await getDb();
      if (!database) {
        throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
      }

      // Filtro de groupId na query
      const groupConditions = eq(cycles.status, "ACTIVE");

      // Buscar ciclos ativos com tent e strain
      const activeCycles = await database
        .select({
          id: cycles.id,
          tentId: cycles.tentId,
          tentName: tents.name,
          tentCategory: tents.category,
          tentGroupId: tents.groupId,
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
        .where(groupConditions);

      // Filtrar pelo grupo do usuário
      const filtered = activeCycles.filter((c: any) =>
        ctx.user.groupId == null || c.tentGroupId == null || c.tentGroupId === ctx.user.groupId
      );
      
      const now = new Date();
      
      return filtered.map((cycle: any) => {
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
    getByTent: protectedProcedure.input(z.object({ tentId: z.number() })).query(async ({ input, ctx }) => {
      await validateTentOwnership(input.tentId, ctx.user.groupId);
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
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        await validateTentOwnership(input.tentId, ctx.user.groupId);
        await database.insert(cycles).values(input);

        // D3 — seed week-1 tasks immediately after cycle creation
        const [tent] = await database
          .select({ category: tents.category })
          .from(tents)
          .where(eq(tents.id, input.tentId))
          .limit(1);
        if (tent) {
          const phase = tent.category === "MAINTENANCE"
            ? "MAINTENANCE"
            : tent.category === "DRYING"
            ? "DRYING"
            : (tent.category as "VEGA" | "FLORA");
          await seedWeekTasks(database, input.tentId, tent.category, phase, 1);
        }

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
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        await validateCycleOwnership(input.cycleId, ctx.user.groupId);

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
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        await validateCycleOwnership(input.cycleId, ctx.user.groupId);
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
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        await validateCycleOwnership(input.cycleId, ctx.user.groupId);

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
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado");
        }
        await validateCycleOwnership(input.cycleId, ctx.user.groupId);

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
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado");
        }
        await validateCycleOwnership(input.cycleId, ctx.user.groupId);
        
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

          // plants.strainId é NOT NULL — exigir strain do ciclo para criar clones
          if (!cycle.strainId) {
            throw new Error("Ciclo sem strain definida — não é possível criar mudas. Defina a strain do ciclo antes.");
          }

          // Buscar nome da strain do ciclo
          const [strain] = await database.select({ name: strains.name }).from(strains).where(eq(strains.id, cycle.strainId));
          const strainName = strain?.name || 'Sem strain';
          const strainIdForClones = cycle.strainId;

          const seedlings = [];
          for (let i = 1; i <= input.clonesProduced; i++) {
            seedlings.push({
              name: `Clone ${i} - ${strainName}`,
              strainId: strainIdForClones,
              currentTentId: input.targetTentId, // Mudas vão para estufa selecionada
              plantStage: "SEEDLING" as const,
              status: "ACTIVE" as const,
              groupId: ctx.user.groupId ?? null,
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
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        await validateTentOwnership(input.tentId, ctx.user.groupId);

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

        // D3 — seed task instances for the current week immediately
        await seedWeekTasks(database, input.tentId, category, input.phase, input.weekNumber);

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
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        await validateCycleOwnership(input.cycleId, ctx.user.groupId);

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
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado.");
        }
        await validateCycleOwnership(input.cycleId, ctx.user.groupId);

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
              groupId: ctx.user.groupId ?? null,
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
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado.");
        }
        await validateCycleOwnership(input.cycleId, ctx.user.groupId);

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
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validateCycleOwnership(input.cycleId, ctx.user.groupId);

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
});

