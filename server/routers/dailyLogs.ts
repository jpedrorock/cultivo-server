/**
 * dailyLogs — sub-router tRPC dos registros diários (temp/RH/PPFD/pH/EC/rega).
 * Antes inline em routers.ts (linhas ~1346-1735).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, or, desc, asc, sql, isNull, isNotNull, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { getDb } from "../db";
import { getMysqlPool } from "../mysql-pool";
import { dailyLogs, tents } from "../../drizzle/schema";
import { validateTentOwnership } from "./_helpers";

export const dailyLogsRouter = router({
    list: protectedProcedure
      .input(
        z.object({
          tentId: z.number(),
          limit: z.number().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        await validateTentOwnership(input.tentId, ctx.user.groupId);
        return db.getDailyLogs(input.tentId, input.limit);
      }),
    // Últimas N leituras de runoff (pH/EC) da estufa, mais-recente-primeiro.
    // Alimenta o diagnóstico da calculadora (flush preventivo por tendência).
    // Reusa o dailyLogs (ph/ec já SÃO a leitura de runoff — ver schema).
    recentRunoff: protectedProcedure
      .input(z.object({ tentId: z.number(), limit: z.number().min(1).max(20).default(5) }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validateTentOwnership(input.tentId, ctx.user.groupId);
        const rows = await database
          .select({ logDate: dailyLogs.logDate, ph: dailyLogs.ph, ec: dailyLogs.ec })
          .from(dailyLogs)
          .where(and(eq(dailyLogs.tentId, input.tentId), or(isNotNull(dailyLogs.ph), isNotNull(dailyLogs.ec))))
          .orderBy(desc(dailyLogs.logDate))
          .limit(input.limit);
        return rows.map((r) => ({
          logDate: r.logDate,
          ph: r.ph != null ? parseFloat(String(r.ph)) : null,
          ec: r.ec != null ? parseFloat(String(r.ec)) : null,
        }));
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
          // runoffPh e runoffEc removidos: ph/ec da rega já medem o runoff
          notes: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        await validateTentOwnership(input.tentId, ctx.user.groupId);

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
        const { checkAndNotifyAlerts } = await import("../alertChecker");
        await checkAndNotifyAlerts(input.tentId, {
          tempC: input.tempC,
          rhPct: input.rhPct,
          ppfd: input.ppfd,
        });
        
        return { success: true };
      }),
    getLatestByTent: protectedProcedure
      .input(z.object({ tentId: z.number() }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validateTentOwnership(input.tentId, ctx.user.groupId);
        const result = await database
          .select()
          .from(dailyLogs)
          .where(eq(dailyLogs.tentId, input.tentId))
          .orderBy(desc(dailyLogs.logDate))
          .limit(1);
        return result[0] || null;
      }),
    
    sparkline: protectedProcedure
      .input(z.object({ tentId: z.number(), days: z.number().default(14) }))
      .query(async ({ input, ctx }) => {
        await validateTentOwnership(input.tentId, ctx.user.groupId);
        const pool = getMysqlPool();
        // Group by calendar day → genuine day-over-day variation
        const [rows]: any = await pool.execute(
          `SELECT
             DATE(logDate) AS day,
             AVG(CAST(tempC AS DECIMAL(6,2))) AS tempC,
             AVG(CAST(rhPct  AS DECIMAL(6,2))) AS rhPct
           FROM dailyLogs
           WHERE tentId = ?
             AND logDate >= DATE_SUB(NOW(), INTERVAL ? DAY)
             AND (tempC IS NOT NULL OR rhPct IS NOT NULL)
           GROUP BY DATE(logDate)
           ORDER BY day ASC
           LIMIT 14`,
          [input.tentId, input.days]
        );
        return (rows as any[]).map((r: any) => ({
          day:   String(r.day),
          tempC: r.tempC != null ? parseFloat(r.tempC) : null,
          rhPct: r.rhPct  != null ? parseFloat(r.rhPct)  : null,
        }));
      }),

    getWeeklyData: protectedProcedure
      .input(z.object({ tentId: z.number() }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validateTentOwnership(input.tentId, ctx.user.groupId);
        
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
          limit: z.number().default(50),
          offset: z.number().default(0),
        })
      )
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        // Validate tent ownership if tentId provided
        if (input.tentId) await validateTentOwnership(input.tentId, ctx.user.groupId);

        // Build filter conditions
        const conditions = [];
        if (input.tentId) {
          conditions.push(eq(dailyLogs.tentId, input.tentId));
        }
        // Filter by groupId when no specific tentId (show only logs from tents of same group)
        if (!input.tentId && ctx.user.groupId != null) {
          conditions.push(eq(tents.groupId, ctx.user.groupId));
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
        
        // Get total count for pagination (must include the same JOIN as baseQuery)
        let countQuery = database
          .select({ count: sql<number>`count(*)` })
          .from(dailyLogs)
          .leftJoin(tents, eq(dailyLogs.tentId, tents.id))
          .$dynamic();

        if (conditions.length > 0) {
          countQuery = countQuery.where(and(...conditions));
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
          notes: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        // Validate ownership via the log's tentId
        const [log] = await database.select({ tentId: dailyLogs.tentId }).from(dailyLogs).where(eq(dailyLogs.id, input.id)).limit(1);
        if (log) await validateTentOwnership(log.tentId, ctx.user.groupId);

        const { id, ...updateData } = input;

        await database
          .update(dailyLogs)
          .set(updateData)
          .where(eq(dailyLogs.id, id));

        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) {
          throw new Error("Banco de dados não inicializado. Execute 'pnpm db:push' para criar as tabelas.");
        }
        const [log] = await database.select({ tentId: dailyLogs.tentId }).from(dailyLogs).where(eq(dailyLogs.id, input.id)).limit(1);
        if (log) await validateTentOwnership(log.tentId, ctx.user.groupId);

        await database
          .delete(dailyLogs)
          .where(eq(dailyLogs.id, input.id));

        return { success: true };
      }),

    // Buscar último log de cada estufa em batch (evita N+1 no MorningCheck)
    latestByTents: protectedProcedure
      .input(z.object({ tentIds: z.array(z.number()) }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        if (input.tentIds.length === 0) return {};

        // 1 query: buscar todos os logs das estufas solicitadas, ordenado por data desc
        const rows = await database
          .select()
          .from(dailyLogs)
          .where(inArray(dailyLogs.tentId, input.tentIds))
          .orderBy(desc(dailyLogs.logDate));

        // Manter apenas o mais recente por estufa
        const latest: Record<number, typeof rows[0]> = {};
        for (const row of rows) {
          if (row.tentId != null && !(row.tentId in latest)) {
            latest[row.tentId] = row;
          }
        }
        return latest;
      }),

    // Streak de registros diários consecutivos para uma estufa
    streak: protectedProcedure
      .input(z.object({ tentId: z.number() }))
      .query(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        await validateTentOwnership(input.tentId, ctx.user.groupId);

        // Busca todos os logs da estufa em DESC — precisamos de datas únicas por dia
        const rows = await database
          .select({ logDate: dailyLogs.logDate })
          .from(dailyLogs)
          .where(eq(dailyLogs.tentId, input.tentId))
          .orderBy(desc(dailyLogs.logDate));

        if (rows.length === 0) return { current: 0, longest: 0, todayDone: false };

        // Extrair set de datas únicas (YYYY-MM-DD) em ordem DESC
        const toDay = (d: Date | string) => {
          const dt = typeof d === 'string' ? new Date(d) : d;
          return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
        };

        const uniqueDays: string[] = Array.from(new Set(rows.map((r: { logDate: Date | string }) => toDay(r.logDate))));

        const today = toDay(new Date());
        const yesterday = toDay(new Date(Date.now() - 86400_000));

        const todayDone = uniqueDays[0] === today;

        // Contar streak atual a partir do dia mais recente
        let current = 0;
        let longest = 0;
        let streak = 0;

        // Sem dias = sem streak
        const firstDay = uniqueDays[0];
        if (!firstDay) {
          return { current, longest, todayDone: false };
        }

        // Construir array de dias consecutivos
        let refDay = new Date(firstDay);
        for (const day of uniqueDays) {
          const refStr = toDay(refDay);
          if (day === refStr) {
            streak++;
            refDay = new Date(refDay.getTime() - 86400_000);
          } else {
            if (streak > longest) longest = streak;
            if (current === 0) current = streak; // primeiro break = fim do streak atual
            streak = 1;
            refDay = new Date(new Date(day).getTime() - 86400_000);
          }
        }
        if (streak > longest) longest = streak;
        if (current === 0) current = streak;

        // Se o último log não é hoje nem ontem, streak atual = 0
        if (uniqueDays[0] !== today && uniqueDays[0] !== yesterday) {
          current = 0;
        }

        return { current, longest, todayDone };
      }),
});
