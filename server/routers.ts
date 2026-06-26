import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { clearAuthCookie } from "./_core/auth";
import { TRPCError } from "@trpc/server";
import { getMysqlPool } from "./mysql-pool";
import { saveSubscription, sendPushToUser, getVapidPublicKey, isPushConfigured } from "./pushService";
import { z } from "zod";
import { eq, and, or, desc, asc, sql, isNull, isNotNull, inArray, getTableColumns } from "drizzle-orm";
import * as db from "./db";
import { getDb, applyPhaseTransitionLimits } from "./db";
import {
  tents,
  strains,
  cycles,
  dailyLogs,
  alerts,
  weeklyTargets,
  taskTemplates,
  tentAState,
  cloningEvents,
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
  pumpPresets,
  recipeTemplates,
  nutrientApplications,
  wateringApplications,
} from "../drizzle/schema";
// Imports de db-auth, _core/auth, nanoid e tabelas users/groups/userAiSettings/
// aiChatMessages foram movidos pra server/routers/{userManagement,aiChat}.ts
// junto com os routers que os usavam.

// Sub-routers extraídos pra arquivos próprios (parte do refactor de quebrar
// este monstro de 7900+ linhas em pedaços manejáveis):
import { groupsRouter, profileRouter, adminRouter } from "./routers/userManagement";
import { aiChatRouter } from "./routers/aiChat";
import {
  plantsRouter,
  plantObservationsRouter,
  plantPhotosRouter,
  plantRunoffRouter,
  plantHealthRouter,
  plantTrichomesRouter,
  plantLSTRouter,
  plantStructureRouter,
} from "./routers/plants";
import { cyclesRouter } from "./routers/cycles";
import { tentsRouter } from "./routers/tents";
import { dailyLogsRouter } from "./routers/dailyLogs";
import { alertsRouter, weeklyTargetsRouter } from "./routers/alerts";
import { tasksRouter, taskTemplatesRouter } from "./routers/tasks";
import { backupRouter } from "./routers/backup";
import { deviceRouter } from "./routers/device";

// Helpers compartilhados (validators de ownership) — antes inline aqui,
// agora em routers/_helpers.ts pra que sub-routers extraídos consigam importar.
import { validateTentOwnership, requirePlanFeature } from "./routers/_helpers";
import { tuyaRouter, tentScenesRouter, tentDevicesRouter, tentDisplayRouter } from "./routers/tuya";
import { gamificationRouter } from "./routers/gamification";

/**
 * D3 — Seed task instances for a tent immediately after cycle creation.
 * This ensures tasks appear on the Home/Tasks tab without the user
 * needing to navigate to the tasks tab first.
 */

// Backup helpers (MAX_BACKUP_*, safeBackupValue, safeBackupRow) foram movidos
// pra server/routers/backup.ts junto com o backup router que os usava.

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  gamification: gamificationRouter,
  tuya: tuyaRouter,
  tentScenes: tentScenesRouter,
  tentDevices: tentDevicesRouter,
  tentDisplay: tentDisplayRouter,
  // Auth real está em /api/auth/* (REST) — registerAuthRoutes em _core/authRoutes.ts.
  // O sub-router tRPC `auth` foi removido: retornava { id:1, name:"Local User" }
  // hardcoded mesmo dentro de protectedProcedure (bug latente — qualquer caller
  // que chamasse trpc.auth.me.query() recebia dados fictícios em vez do user real).

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
          description: z.string().max(2000).optional(),
          vegaWeeks: z.number().min(1).max(12),
          floraWeeks: z.number().min(1).max(16),
          origin: z.enum(["FEMINIZED", "AUTOFLOWER", "CLONE"]).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }

        // Check if strain name already exists
        const [existing] = await database.select({ id: strains.id }).from(strains).where(eq(strains.name, input.name)).limit(1);
        if (existing) {
          throw new Error(`Já existe uma strain com o nome "${input.name}". Por favor, escolha outro nome.`);
        }

        // groupId sempre vem do contexto — nunca do input do cliente
        await database.insert(strains).values({ ...input, groupId: ctx.user.groupId ?? null });
        return { success: true };
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(100).optional(),
          description: z.string().max(2000).optional(),
          vegaWeeks: z.number().min(1).max(12).optional(),
          floraWeeks: z.number().min(1).max(16).optional(),
          isActive: z.boolean().optional(),
          origin: z.enum(["FEMINIZED", "AUTOFLOWER", "CLONE"]).optional(),
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
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }

        // Verificar que a strain pertence ao grupo do usuário (strains globais não podem ser deletadas)
        const [strain] = await database.select({ groupId: strains.groupId }).from(strains).where(eq(strains.id, input.id)).limit(1);
        if (!strain) throw new Error("Strain não encontrada");
        if (strain.groupId == null || strain.groupId !== ctx.user.groupId) {
          throw new Error("Acesso negado: apenas strains do seu grupo podem ser excluídas");
        }

        // Check if strain is used in any cycles
        const [cycleWithStrain] = await database.select({ id: cycles.id }).from(cycles).where(eq(cycles.strainId, input.id)).limit(1);
        if (cycleWithStrain) {
          throw new Error("Não é possível excluir esta strain pois ela está vinculada a ciclos existentes. Finalize ou exclua os ciclos primeiro.");
        }

        // Check if strain is used in any plants
        const [plantWithStrain] = await database.select({ id: plants.id }).from(plants).where(eq(plants.strainId, input.id)).limit(1);
        if (plantWithStrain) {
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
          description: z.string().max(2000).optional(),
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

  // ── Helper: seed week-1 task instances after cycle creation ──────────────
  // Called by cycles.create and cycles.initiate so tasks appear immediately
  // without the user needing to open the Tasks tab first (D3).

  // Alerts (Alertas)

  // Task Instances (Tarefas)


  // Tent A (Estufa A - Clonagem)
  tentA: router({
    getState: protectedProcedure.input(z.object({ tentId: z.number() })).query(async ({ input, ctx }) => {
      await validateTentOwnership(input.tentId, ctx.user.groupId);
      return db.getTentAState(input.tentId);
    }),
    startCloning: protectedProcedure
      .input(
        z.object({
          tentId: z.number(),
          startDate: z.date(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await validateTentOwnership(input.tentId, ctx.user.groupId);
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
  // ❌ REMOVIDO: sub-router `database` (export/import SQL bruto).
  //
  // O endpoint `database.import` aceitava `sqlContent: string` e executava via
  // `sql.raw(...)` — a única "validação" era exigir o cabeçalho literal
  // "-- App Cultivo - Database Backup" no início (trivial de incluir). Um admin
  // comprometido (ou bug de privilege escalation futuro) podia rodar
  // `DROP DATABASE`, criar usuários, alterar permissões — Remote Code Execution
  // no banco.
  //
  // O backup estruturado em `routers/backup.ts` (sub-router `backup`) cobre o
  // caso de uso real: export/import por tabela com validação Zod, escopo por
  // groupId, e re-mapeamento de IDs (multi-tenancy safe). Use aquele.
  //
  // Os arquivos `server/databaseImport.ts` e `server/databaseExport.ts` foram
  // deletados junto com este endpoint.

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
          type: z.enum(["daily_reminder", "environment_alert", "task_reminder", "incomplete_log"]),
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


  // Fertilization Presets (Predefinições de Fertilização)
  fertilizationPresets: router({
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        waterVolume: z.number(),
        targetEC: z.number(),
        phase: z.enum(["VEGA", "PRE_FLORA", "FLORA"]).optional(),
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
          groupId: ctx.user.groupId ?? null,
        });

        return { success: true };
      }),

    list: protectedProcedure
      .query(async ({ ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        const conditions = [];
        if (ctx.user.groupId != null) {
          conditions.push(
            sql`(${fertilizationPresets.groupId} IS NULL OR ${fertilizationPresets.groupId} = ${ctx.user.groupId})`
          );
        }

        return await database
          .select()
          .from(fertilizationPresets)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(fertilizationPresets.createdAt));
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        // Validate ownership
        const [preset] = await database.select({ groupId: fertilizationPresets.groupId }).from(fertilizationPresets).where(eq(fertilizationPresets.id, input.id)).limit(1);
        if (preset?.groupId != null && ctx.user.groupId != null && preset.groupId !== ctx.user.groupId) {
          throw new Error("Acesso negado: predefinição não pertence ao seu grupo");
        }

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
        phase: z.enum(["VEGA", "PRE_FLORA", "FLORA"]).optional(),
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
        phase: z.enum(["VEGA", "PRE_FLORA", "FLORA"]).optional(),
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
          groupId: ctx.user.groupId ?? null,
        });

        return { success: true };
      }),

    list: protectedProcedure
      .query(async ({ ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        const conditions = [];
        if (ctx.user.groupId != null) {
          conditions.push(
            sql`(${wateringPresets.groupId} IS NULL OR ${wateringPresets.groupId} = ${ctx.user.groupId})`
          );
        }

        return await database
          .select()
          .from(wateringPresets)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(wateringPresets.createdAt));
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        const [preset] = await database.select({ groupId: wateringPresets.groupId }).from(wateringPresets).where(eq(wateringPresets.id, input.id)).limit(1);
        if (preset?.groupId != null && ctx.user.groupId != null && preset.groupId !== ctx.user.groupId) {
          throw new Error("Acesso negado: predefinição não pertence ao seu grupo");
        }

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
        phase: z.enum(["VEGA", "PRE_FLORA", "FLORA"]).optional(),
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

  // Pump Presets (Predefinições de Bomba — Calculadora de Rega Automática)
  pumpPresets: router({
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        totalFlowMlPerMin: z.number().positive(),
        numOutlets: z.number().int().positive(),
        maxRuntimeMin: z.number().positive(),
        restTimeBetweenCyclesMin: z.number().min(0),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        await database.insert(pumpPresets).values({
          name: input.name,
          totalFlowMlPerMin: input.totalFlowMlPerMin.toString(),
          numOutlets: input.numOutlets,
          maxRuntimeMin: input.maxRuntimeMin.toString(),
          restTimeBetweenCyclesMin: input.restTimeBetweenCyclesMin.toString(),
          groupId: ctx.user.groupId ?? null,
        });

        return { success: true };
      }),

    list: protectedProcedure
      .query(async ({ ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        const conditions = [];
        if (ctx.user.groupId != null) {
          conditions.push(
            sql`(${pumpPresets.groupId} IS NULL OR ${pumpPresets.groupId} = ${ctx.user.groupId})`
          );
        }

        return await database
          .select()
          .from(pumpPresets)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(pumpPresets.createdAt));
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        const [preset] = await database
          .select({ groupId: pumpPresets.groupId })
          .from(pumpPresets)
          .where(eq(pumpPresets.id, input.id))
          .limit(1);

        if (preset?.groupId != null && ctx.user.groupId != null && preset.groupId !== ctx.user.groupId) {
          throw new Error("Acesso negado: predefinição não pertence ao seu grupo");
        }

        await database.delete(pumpPresets).where(eq(pumpPresets.id, input.id));
        return { success: true };
      }),
  }),


  // Nutrient Recipes (Receitas de Nutrientes)
  nutrients: router({
    // Listar templates de receitas
    listTemplates: protectedProcedure
      .input(z.object({ phase: z.enum(["CLONING", "VEGA", "PRE_FLORA", "FLORA", "MAINTENANCE", "DRYING"]).optional() }).optional())
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        const groupFilter = ctx.user.groupId != null
          ? sql`(${recipeTemplates.groupId} IS NULL OR ${recipeTemplates.groupId} = ${ctx.user.groupId})`
          : undefined;

        if (input?.phase) {
          const conditions = [eq(recipeTemplates.phase, input.phase)];
          if (groupFilter) conditions.push(groupFilter);
          return database
            .select()
            .from(recipeTemplates)
            .where(and(...conditions))
            .orderBy(recipeTemplates.weekNumber, recipeTemplates.name);
        }

        return database
          .select()
          .from(recipeTemplates)
          .where(groupFilter)
          .orderBy(recipeTemplates.phase, recipeTemplates.weekNumber, recipeTemplates.name);
      }),

    // Criar template de receita
    createTemplate: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          phase: z.enum(["CLONING", "VEGA", "PRE_FLORA", "FLORA", "MAINTENANCE", "DRYING"]),
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
          notes: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
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
          groupId: ctx.user.groupId ?? null,
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
          phase: z.enum(["CLONING", "VEGA", "PRE_FLORA", "FLORA", "MAINTENANCE", "DRYING"]),
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
          notes: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validateTentOwnership(input.tentId, ctx.user.groupId);

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
          phase: z.enum(["CLONING", "VEGA", "PRE_FLORA", "FLORA", "MAINTENANCE", "DRYING"]).optional(),
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
          notes: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validateTentOwnership(input.tentId, ctx.user.groupId);

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

        const conditions = [];
        if (input?.tentId) conditions.push(eq(wateringApplications.tentId, input.tentId));
        if (input?.cycleId) conditions.push(eq(wateringApplications.cycleId, input.cycleId));

        const base = database
          .select({
            ...getTableColumns(wateringApplications),
            cycleStartDate: cycles.startDate,
            cycleFloraStartDate: cycles.floraStartDate,
            tentName: tents.name,
          })
          .from(wateringApplications)
          .leftJoin(cycles, eq(wateringApplications.cycleId, cycles.id))
          .leftJoin(tents, eq(wateringApplications.tentId, tents.id));

        const filtered = conditions.length > 0 ? base.where(and(...conditions)) : base;

        return filtered
          .orderBy(desc(wateringApplications.applicationDate))
          .limit(input?.limit || 50);
      }),
  }),

  // Backup & Restore

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
          reason: z.string().max(1000).optional(),
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
          timezone: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await saveSubscription(
          input.subscription as any,
          ctx.user.id,
          ctx.user.groupId ?? null,
          {
            reminderEnabled: input.reminderEnabled,
            reminderTimes: input.reminderTimes,
            timezone: input.timezone,
          },
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
      .mutation(async ({ input, ctx }) => {
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
            userId: ctx.user.id,
            groupId: ctx.user.groupId ?? null,
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

    // Enviar notificação de teste — APENAS para o usuário autenticado
    sendTest: protectedProcedure.mutation(async ({ ctx }) => {
      if (!isPushConfigured()) {
        throw new Error("Web Push não configurado. Adicione VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no .env");
      }
      await sendPushToUser(ctx.user.id, {
        title: "🧪 Teste — App Cultivo",
        body: "Notificações Push funcionando! Toque para registrar. 🌱",
        url: "/quick-log",
        tag: "daily-reminder",
      });
      return { success: true };
    }),
  }),

  // Sub-routers extraídos pra arquivos próprios em server/routers/*.ts.
  // Mantém o appRouter limpo enquanto ainda funciona como fonte única de tipos.
  auth: router({
    /**
     * Encerra a sessão do usuário limpando o cookie JWT.
     * Espelho tRPC do POST /api/auth/logout (que é REST).
     */
    logout: protectedProcedure.mutation(({ ctx }) => {
      // Usa o mesmo helper do setAuthCookie (secure: ENV.isProduction,
      // sameSite: 'lax') — atributos têm que bater pro browser limpar o cookie.
      clearAuthCookie(ctx.res);
      return { success: true };
    }),
  }),

  groups: groupsRouter,
  profile: profileRouter,
  admin: adminRouter,
  aiChat: aiChatRouter,
  plants: plantsRouter,
  plantObservations: plantObservationsRouter,
  plantPhotos: plantPhotosRouter,
  plantRunoff: plantRunoffRouter,
  plantHealth: plantHealthRouter,
  plantTrichomes: plantTrichomesRouter,
  plantLST: plantLSTRouter,
  plantStructure: plantStructureRouter,
  cycles: cyclesRouter,
  tents: tentsRouter,
  dailyLogs: dailyLogsRouter,
  alerts: alertsRouter,
  weeklyTargets: weeklyTargetsRouter,
  tasks: tasksRouter,
  taskTemplates: taskTemplatesRouter,
  backup: backupRouter,
  device: deviceRouter,
});

export type AppRouter = typeof appRouter;
