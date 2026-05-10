/**
 * tasks + taskTemplates — sub-routers de tarefas (instâncias e templates).
 * Antes inline em routers.ts (~2420-2879 + ~3252-3347).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, or, desc, asc, sql, isNull, isNotNull, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { getDb } from "../db";
import {
  taskInstances, taskTemplates, standaloneTasks, tents, cycles, plants,
} from "../../drizzle/schema";
import { validateTentOwnership } from "./_helpers";

export const tasksRouter = router({
    list: protectedProcedure
      .input(
        z.object({
          tentId: z.number(),
        })
      )
      .query(async ({ input, ctx }) => {
        await validateTentOwnership(input.tentId, ctx.user.groupId);
        return db.getTaskInstances(input.tentId);
      }),
    getTasksByTent: protectedProcedure
      .input(z.object({ tentId: z.number() }))
      .query(async ({ input, ctx }) => {
        await validateTentOwnership(input.tentId, ctx.user.groupId);
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
    getPendingTasks: protectedProcedure.query(async ({ ctx }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      // Get all active cycles (filtered by group via tent join)
      const allCycles = await db.getAllCycles();
      const activeCycles = allCycles.filter((c: any) => c.status === "ACTIVE");
      const pendingTasks: any[] = [];

      for (const cycle of activeCycles) {
        // Get tent info
        const tent = await database.select().from(tents).where(eq(tents.id, cycle.tentId)).limit(1);
        if (tent.length === 0) continue;
        // Filter by group
        if (ctx.user.groupId != null && tent[0].groupId != null && tent[0].groupId !== ctx.user.groupId) continue;

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
            id: task.taskInstances.id,
            tentId: cycle.tentId,
            tentName: tent[0].name,
            title: task.taskTemplates?.title || "Tarefa",
            description: task.taskTemplates?.description || "",
            occurrenceDate: task.taskInstances.occurrenceDate,
          });
        }
      }

      return pendingTasks;
    }),
    getCurrentWeekTasks: protectedProcedure.query(async ({ ctx }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      const allCycles = await db.getAllCycles();
      const activeCycles = allCycles.filter((c: any) => c.status === "ACTIVE");
      if (activeCycles.length === 0) return [];

      // 1. Batch-fetch all tents in a single query
      const tentIds = [...new Set(activeCycles.map((c: any) => c.tentId as number))];
      const allTentsArr = await database.select().from(tents).where(inArray(tents.id, tentIds));
      const tentMap = new Map<number, any>(allTentsArr.map((t: any) => [t.id, t]));

      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      // 2. Compute phase/week for each cycle (pure calculation, no DB)
      type CycleInfo = {
        cycle: any;
        tent: (typeof allTentsArr)[0];
        currentPhase: "VEGA" | "FLORA" | "MAINTENANCE" | "DRYING";
        weekNumber: number | null;
        context: "TENT_BC" | "TENT_A";
      };
      const cycleInfos: CycleInfo[] = [];

      for (const cycle of activeCycles) {
        const tent = tentMap.get(cycle.tentId);
        if (!tent) continue;
        if (ctx.user.groupId != null && tent.groupId != null && tent.groupId !== ctx.user.groupId) continue;

        const startDate = new Date(cycle.startDate);
        const floraStartDate = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;
        const tentCategory = tent.category;

        let currentPhase: "VEGA" | "FLORA" | "MAINTENANCE" | "DRYING";
        let weekNumber: number | null;
        let context: "TENT_BC" | "TENT_A";

        if (tentCategory === "MAINTENANCE") {
          currentPhase = "MAINTENANCE"; weekNumber = null; context = "TENT_A";
        } else if (tentCategory === "DRYING") {
          currentPhase = "DRYING"; weekNumber = null; context = "TENT_BC";
        } else if (tentCategory === "FLORA") {
          currentPhase = "FLORA";
          const weeksSince = floraStartDate
            ? Math.floor((now.getTime() - floraStartDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
            : Math.floor((now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
          weekNumber = weeksSince + 1;
          context = "TENT_BC";
        } else if (tentCategory === "VEGA") {
          currentPhase = "VEGA";
          weekNumber = Math.floor((now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
          context = "TENT_BC";
        } else {
          currentPhase = "MAINTENANCE"; weekNumber = null; context = "TENT_A";
        }

        cycleInfos.push({ cycle, tent, currentPhase, weekNumber, context });
      }

      if (cycleInfos.length === 0) return [];

      // 3. Batch-fetch all templates in a single query
      const allTemplatesArr = await database.select().from(taskTemplates);

      // 4. Batch-fetch all existing instances for this week across all active tents
      const activeTentIds = cycleInfos.map(ci => ci.cycle.tentId as number);
      const existingInstances = await database
        .select()
        .from(taskInstances)
        .where(
          and(
            inArray(taskInstances.tentId, activeTentIds),
            eq(taskInstances.occurrenceDate, startOfWeek)
          )
        );

      // Build lookup: `${tentId}-${templateId}` → instance
      const instanceMap = new Map<string, any>(
        existingInstances.map((inst: any) => [`${inst.tentId}-${inst.taskTemplateId}`, inst])
      );

      // 5. Determine which instances need to be created (batch insert)
      const toInsert: Array<{ tentId: number; taskTemplateId: number; occurrenceDate: Date; isDone: boolean }> = [];

      for (const { cycle, currentPhase, weekNumber, context } of cycleInfos) {
        const templates = allTemplatesArr.filter((t: any) => {
          if (t.context !== context || t.phase !== currentPhase) return false;
          if (currentPhase === "MAINTENANCE" || currentPhase === "DRYING") return true;
          return t.weekNumber === weekNumber;
        });
        for (const template of templates) {
          const key = `${cycle.tentId}-${template.id}`;
          if (!instanceMap.has(key)) {
            toInsert.push({ tentId: cycle.tentId, taskTemplateId: template.id, occurrenceDate: startOfWeek, isDone: false });
          }
        }
      }

      // 6. Batch insert missing instances then re-fetch
      if (toInsert.length > 0) {
        await database.insert(taskInstances).values(toInsert);
        const newInstances = await database
          .select()
          .from(taskInstances)
          .where(
            and(
              inArray(taskInstances.tentId, activeTentIds),
              eq(taskInstances.occurrenceDate, startOfWeek)
            )
          );
        for (const inst of newInstances) {
          instanceMap.set(`${inst.tentId}-${inst.taskTemplateId}`, inst);
        }
      }

      // 7. Build final task list
      const allTasks: any[] = [];
      for (const { cycle, tent, currentPhase, weekNumber, context } of cycleInfos) {
        const templates = allTemplatesArr.filter((t: any) => {
          if (t.context !== context || t.phase !== currentPhase) return false;
          if (currentPhase === "MAINTENANCE" || currentPhase === "DRYING") return true;
          return t.weekNumber === weekNumber;
        });
        for (const template of templates) {
          const key = `${cycle.tentId}-${template.id}`;
          const instance = instanceMap.get(key);
          allTasks.push({
            id: instance?.id || 0,
            tentId: cycle.tentId,
            tentName: tent.name || `Estufa ${cycle.tentId}`,
            title: template.title,
            description: template.description,
            phase: currentPhase,
            weekNumber,
            isDone: instance?.isDone ?? false,
            completedAt: instance?.completedAt ?? null,
            notes: instance?.notes ?? null,
            dueDate: instance?.occurrenceDate ?? startOfWeek,
          });
        }
      }

      return allTasks;
    }),
    markAsDone: protectedProcedure
      .input(
        z.object({
          taskId: z.number(),
          notes: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        const [task] = await database.select({ tentId: taskInstances.tentId }).from(taskInstances).where(eq(taskInstances.id, input.taskId)).limit(1);
        if (task) await validateTentOwnership(task.tentId, ctx.user.groupId);
        await database
          .update(taskInstances)
          .set({ isDone: true, completedAt: new Date(), notes: input.notes })
          .where(eq(taskInstances.id, input.taskId));
        return { success: true };
      }),
    toggleTask: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ input, ctx }) => {
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
        await validateTentOwnership(task[0].tentId, ctx.user.groupId);

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
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        const [task] = await database.select({ tentId: taskInstances.tentId }).from(taskInstances).where(eq(taskInstances.id, input.taskId)).limit(1);
        if (task) await validateTentOwnership(task.tentId, ctx.user.groupId);
        await database.delete(taskInstances).where(eq(taskInstances.id, input.taskId));
        return { success: true };
      }),

    // ── Standalone tasks ──────────────────────────────────────────────────────
    listStandalone: protectedProcedure.query(async ({ ctx }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");
      return database
        .select()
        .from(standaloneTasks)
        .where(eq(standaloneTasks.userId, ctx.user.id))
        .orderBy(standaloneTasks.isDone, standaloneTasks.dueDate, standaloneTasks.createdAt);
    }),
    createStandalone: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
        dueDate: z.date().optional(),
        tentId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await database.insert(standaloneTasks).values({
          userId: ctx.user.id,
          title: input.title,
          description: input.description,
          priority: input.priority ?? "MEDIUM",
          dueDate: input.dueDate,
          tentId: input.tentId,
          isDone: false,
        });
        return { success: true };
      }),
    toggleStandalone: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        const [task] = await database.select().from(standaloneTasks).where(
          and(eq(standaloneTasks.id, input.id), eq(standaloneTasks.userId, ctx.user.id))
        ).limit(1);
        if (!task) throw new TRPCError({ code: "NOT_FOUND" });
        const newIsDone = !task.isDone;
        await database.update(standaloneTasks).set({
          isDone: newIsDone,
          completedAt: newIsDone ? new Date() : null,
        }).where(eq(standaloneTasks.id, input.id));
        return { success: true };
      }),
    deleteStandalone: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await database.delete(standaloneTasks).where(
          and(eq(standaloneTasks.id, input.id), eq(standaloneTasks.userId, ctx.user.id))
        );
        return { success: true };
      }),
});

export const taskTemplatesRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      const conditions = [];
      if (ctx.user.groupId != null) {
        conditions.push(
          sql`(${taskTemplates.groupId} IS NULL OR ${taskTemplates.groupId} = ${ctx.user.groupId})`
        );
      }

      return await database
        .select()
        .from(taskTemplates)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(taskTemplates.phase, taskTemplates.weekNumber, taskTemplates.title);
    }),

    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1),
          description: z.string().max(2000).optional(),
          phase: z.enum(["CLONING", "VEGA", "FLORA", "MAINTENANCE", "DRYING"]),
          context: z.enum(["TENT_A", "TENT_BC"]),
          weekNumber: z.number().int().min(1).max(12).nullable(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        const [newTemplate] = await database.insert(taskTemplates).values({
          title: input.title,
          description: input.description || null,
          phase: input.phase,
          context: input.context,
          weekNumber: input.weekNumber,
          groupId: ctx.user.groupId ?? null,
        });

        return { success: true, id: (newTemplate as { insertId: number }).insertId };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().min(1),
          description: z.string().max(2000).optional(),
          phase: z.enum(["CLONING", "VEGA", "FLORA", "MAINTENANCE", "DRYING"]),
          context: z.enum(["TENT_A", "TENT_BC"]),
          weekNumber: z.number().int().min(1).max(12).nullable(),
        })
      )
      .mutation(async ({ input, ctx }) => {
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
});
