/**
 * alerts + weeklyTargets — sub-routers de alertas/notificações e targets semanais.
 * Antes inline em routers.ts (linhas ~1738-2417).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, or, desc, asc, sql, isNull, isNotNull, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { getDb } from "../db";
import {
  alerts, alertSettings, alertHistory, weeklyTargets,
  notificationHistory, tents, strains, dailyLogs, cycles, plants,
} from "../../drizzle/schema";
import { validateTentOwnership } from "./_helpers";

export const alertsRouter = router({
    // Configurações de alertas
    getSettings: protectedProcedure
      .input(z.object({ tentId: z.number() }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validateTentOwnership(input.tentId, ctx.user.groupId);
        const settings = await database
          .select()
          .from(alertSettings)
          .where(eq(alertSettings.tentId, input.tentId))
          .limit(1);
        return settings[0] || null;
      }),

    getIdealValues: protectedProcedure
      .input(z.object({ tentId: z.number() }))
      .query(async ({ input, ctx }) => {
        await validateTentOwnership(input.tentId, ctx.user.groupId);
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
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        await validateTentOwnership(input.tentId, ctx.user.groupId);

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
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) return [];
        if (input.tentId) await validateTentOwnership(input.tentId, ctx.user.groupId);

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
      .query(async ({ input, ctx }) => {
        if (input.tentId) await validateTentOwnership(input.tentId, ctx.user.groupId);
        return db.getAlerts(input.tentId, input.status);
      }),
    getNewCount: protectedProcedure
      .input(z.object({ tentId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        if (input.tentId) await validateTentOwnership(input.tentId, ctx.user.groupId);
        return db.getNewAlertsCount(input.tentId);
      }),
    markAsSeen: protectedProcedure
      .input(z.object({ alertId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        const [alert] = await database.select({ tentId: alerts.tentId }).from(alerts).where(eq(alerts.id, input.alertId)).limit(1);
        if (alert) await validateTentOwnership(alert.tentId, ctx.user.groupId);
        await database.update(alerts).set({ status: "SEEN" }).where(eq(alerts.id, input.alertId));
        return { success: true };
      }),

    markAllAsSeen: protectedProcedure
      .input(z.object({ tentId: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        if (input.tentId) await validateTentOwnership(input.tentId, ctx.user.groupId);
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
      .mutation(async ({ input, ctx }) => {
        await validateTentOwnership(input.tentId, ctx.user.groupId);
        return db.checkAlertsForTent(input.tentId);
      }),
    
    checkAllTents: protectedProcedure
      .mutation(async () => {
        const { checkAllTentsAlerts } = await import("../cron/alertsChecker");
        return checkAllTentsAlerts();
      }),
    
    // Phase Alert Margins (Margens de Alertas por Fase)
    getPhaseMargins: protectedProcedure.query(async () => {
      const database = await getDb();
      if (!database) return [];
      const { phaseAlertMargins } = await import("../../drizzle/schema");
      return database.select().from(phaseAlertMargins).orderBy(phaseAlertMargins.phase);
    }),
    
    updatePhaseMargin: protectedProcedure
      .input(
        z.object({
          phase: z.enum(["MAINTENANCE", "CLONING", "VEGA", "PRE_FLORA", "FLORA", "DRYING"]),
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
        
        const { phaseAlertMargins } = await import("../../drizzle/schema");
        
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
          phase: z.enum(["MAINTENANCE", "CLONING", "VEGA", "PRE_FLORA", "FLORA", "DRYING"]),
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
        const { phaseAlertMargins } = await import("../../drizzle/schema");

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
      const { notificationSettings } = await import("../../drizzle/schema");
      
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
        const { notificationSettings } = await import("../../drizzle/schema");
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
        
        const { notificationSettings } = await import("../../drizzle/schema");
        
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
});

  // Weekly Targets (Padrões Semanais)
export const weeklyTargetsRouter = router({
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
          // EC alvo Kroma (@kromafarms) — planilha do João. Flora em 3 blocos:
          // 1–3 = 2,67 · 4–7 = 2,28 · finalização (8+) = 2,00. Vega = 2,49.
          let defaultEC: number;
          if (input.phase === "vega") {
            defaultEC = 2.49;
          } else {
            const w = Math.max(input.weekNumber, 1);
            defaultEC = w <= 3 ? 2.67 : w <= 7 ? 2.28 : 2.00;
          }

          return {
            targetEC: defaultEC.toFixed(2),
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
          phase: z.enum(["CLONING", "VEGA", "PRE_FLORA", "FLORA", "MAINTENANCE"]),
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
          phase: z.enum(["CLONING", "VEGA", "PRE_FLORA", "FLORA", "MAINTENANCE"]),
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
          phase: z.enum(["CLONING", "VEGA", "PRE_FLORA", "FLORA", "MAINTENANCE"]),
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
          notes: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        await database.insert(weeklyTargets).values({ ...input, groupId: ctx.user.groupId ?? null });
        return { success: true };
      }),

    // Upsert: atualiza se já existe (strainId+phase+weekNumber), senão cria
    upsert: protectedProcedure
      .input(
        z.object({
          strainId: z.number(),
          phase: z.enum(["CLONING", "VEGA", "PRE_FLORA", "FLORA", "MAINTENANCE"]),
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
          notes: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        const { strainId, phase, weekNumber, ...fields } = input;

        // Verificar se já existe target para esta cepa/fase/semana
        const existing = await database
          .select({ id: weeklyTargets.id })
          .from(weeklyTargets)
          .where(and(
            eq(weeklyTargets.strainId, strainId),
            eq(weeklyTargets.phase, phase),
            eq(weeklyTargets.weekNumber, weekNumber),
          ))
          .limit(1);

        if (existing.length > 0) {
          await database
            .update(weeklyTargets)
            .set(fields)
            .where(eq(weeklyTargets.id, existing[0].id));
          return { success: true, action: "updated" };
        } else {
          await database.insert(weeklyTargets).values({ strainId, phase, weekNumber, ...fields, groupId: ctx.user.groupId ?? null });
          return { success: true, action: "created" };
        }
      }),
});
