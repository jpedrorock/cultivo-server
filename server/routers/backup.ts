/**
 * backup — sub-router pra export/import full backup do user.
 * Antes inline em routers.ts (~3584-3792).
 */
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  tents, strains, cycles, plants, plantTentHistory, plantPhotos,
  plantHealthLogs, plantObservations, plantRunoffLogs, plantTrichomeLogs, plantLSTLogs,
  dailyLogs, taskTemplates, taskInstances, alerts, alertSettings, alertHistory,
  recipes, recipeTemplates, wateringPresets, fertilizationPresets,
  nutrientApplications, wateringApplications, weeklyTargets,
  cloningEvents, tentAState, notificationHistory,
} from "../../drizzle/schema";

// Backup import validation primitives — antes ficavam inline no topo de routers.ts.
const MAX_BACKUP_ROWS = 100_000;
const MAX_BACKUP_FIELD_BYTES = 50_000;
const MAX_BACKUP_KEY_LEN = 64;

const safeBackupValue = z.union([
  z.string().max(MAX_BACKUP_FIELD_BYTES),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const safeBackupRow = z.record(z.string().max(MAX_BACKUP_KEY_LEN), safeBackupValue);

export const backupRouter = router({
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
    //
    // SEGURANÇA — antes era z.array(z.any()) em cada tabela, aceitando QUALQUER
    // payload. Riscos: DoS via array gigante / strings de GBs / nesting infinito,
    // e XSS-stored se algum render usasse dangerouslySetInnerHTML. Agora valida:
    //   - cada row é dict de chaves primitivas (sem arrays/objetos aninhados)
    //   - chaves max 64 chars
    //   - valores max 50KB de string
    //   - max 100k rows por tabela
    //
    // PRAGMÁTICO: não enumera campos exatos de cada tabela (overkill — 13 tabelas
    // × ~20 colunas cada = 260 campos pra mapear). Drizzle valida tipo no insert
    // contra schema real; se o cliente passar `name: 999` em vez de string,
    // MySQL rejeita. Esta validação é "front line" pra DoS + estrutura.
    import: protectedProcedure
      .input(
        z.object({
          version: z.string().max(32),
          exportDate: z.string().max(64),
          data: z.object({
            tents:                z.array(safeBackupRow).max(MAX_BACKUP_ROWS).optional(),
            strains:              z.array(safeBackupRow).max(MAX_BACKUP_ROWS).optional(),
            cycles:               z.array(safeBackupRow).max(MAX_BACKUP_ROWS).optional(),
            plants:               z.array(safeBackupRow).max(MAX_BACKUP_ROWS).optional(),
            dailyLogs:            z.array(safeBackupRow).max(MAX_BACKUP_ROWS).optional(),
            taskTemplates:        z.array(safeBackupRow).max(MAX_BACKUP_ROWS).optional(),
            alertSettings:        z.array(safeBackupRow).max(MAX_BACKUP_ROWS).optional(),
            alerts:               z.array(safeBackupRow).max(MAX_BACKUP_ROWS).optional(),
            plantPhotos:          z.array(safeBackupRow).max(MAX_BACKUP_ROWS).optional(),
            plantHealthLogs:      z.array(safeBackupRow).max(MAX_BACKUP_ROWS).optional(),
            recipeTemplates:      z.array(safeBackupRow).max(MAX_BACKUP_ROWS).optional(),
            nutrientApplications: z.array(safeBackupRow).max(MAX_BACKUP_ROWS).optional(),
            wateringApplications: z.array(safeBackupRow).max(MAX_BACKUP_ROWS).optional(),
          }),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const database = await getDb();
        if (!database) throw new Error("Database not available");

        // Validar versão
        if (input.version !== "1.0") {
          throw new Error("Versão de backup não suportada");
        }

        const gid = ctx.user.groupId ?? null;

        // Função auxiliar: converte strings de data para objetos Date
        // Suporta: "2024-01-15T12:00:00Z" (datetime) e "2024-01-15" (date only)
        const sanitizeDates = (rows: any[]): any[] =>
          rows.map((row) => {
            const out: Record<string, any> = {};
            for (const [k, v] of Object.entries(row)) {
              if (typeof v === "string" && (
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) ||
                /^\d{4}-\d{2}-\d{2}$/.test(v)
              )) {
                const d = new Date(v);
                out[k] = isNaN(d.getTime()) ? null : d;
              } else {
                out[k] = v;
              }
            }
            return out;
          });

        // Carimbra o groupId do usuário logado nos recursos que pertencem ao grupo
        const withGroup = (rows: any[]): any[] =>
          sanitizeDates(rows).map((row) => ({ ...row, groupId: gid }));

        // groupId obrigatório — sem ele não dá pra escopar os deletes e o
        // import vira destrutivo global (vazaria pra outros tenants).
        if (gid == null) throw new Error("Usuário sem groupId — import bloqueado por segurança");

        // Tudo dentro de uma transação: se qualquer operação falhar,
        // o banco volta ao estado original automaticamente.
        await database.transaction(async (tx: any) => {
          // ════════════════════════════════════════════════════════════════
          // SEGURANÇA MULTI-TENANCY:
          // Antes, todo `tx.delete(table)` era SEM .where() — em DB com
          // múltiplos users/groups, importar backup APAGAVA dados de TODOS
          // os tenants. Agora cada delete filtra por groupId (direto ou via
          // FK CASCADE).
          //
          // Tabelas com groupId direto: tents, plants, strains, taskTemplates,
          //   recipeTemplates, wateringPresets, fertilizationPresets,
          //   notificationHistory.
          // Tabelas que cascateiam de tents (via FK ON DELETE CASCADE):
          //   cycles, dailyLogs, alerts, alertSettings, alertHistory, recipes,
          //   taskInstances, cloningEvents, tentAState.
          // Tabelas que cascateiam de plants (FK CASCADE):
          //   plantPhotos, plantHealthLogs, plantObservations, plantRunoffLogs,
          //   plantTrichomeLogs, plantLSTLogs, plantTentHistory.
          // Tabelas que cascateiam de strains (FK CASCADE): weeklyTargets.
          // Tabelas SEM FK CASCADE (delete explícito via subquery):
          //   nutrientApplications, wateringApplications.
          //
          // Ordem importa: plants antes de strains (FK RESTRICT).
          // ════════════════════════════════════════════════════════════════

          // 1) Tabelas SEM FK CASCADE — limpar via subquery por tents do grupo
          await tx
            .delete(nutrientApplications)
            .where(
              inArray(
                nutrientApplications.tentId,
                tx.select({ id: tents.id }).from(tents).where(eq(tents.groupId, gid))
              )
            );
          await tx
            .delete(wateringApplications)
            .where(
              inArray(
                wateringApplications.tentId,
                tx.select({ id: tents.id }).from(tents).where(eq(tents.groupId, gid))
              )
            );

          // 2) plants do grupo → CASCADE remove plant_* (Photos, Health, Obs,
          //    Runoff, Trichome, LST, TentHistory). Antes de strains pra
          //    liberar o RESTRICT da FK plants.strainId.
          await tx.delete(plants).where(eq(plants.groupId, gid));

          // 3) tents do grupo → CASCADE remove cycles, dailyLogs, alerts,
          //    alertSettings, alertHistory, recipes, taskInstances,
          //    cloningEvents, tentAState.
          await tx.delete(tents).where(eq(tents.groupId, gid));

          // 4) strains do grupo → CASCADE remove weeklyTargets
          await tx.delete(strains).where(eq(strains.groupId, gid));

          // 5) Templates / presets / histórico — independentes, com groupId direto
          await tx.delete(taskTemplates).where(eq(taskTemplates.groupId, gid));
          await tx.delete(recipeTemplates).where(eq(recipeTemplates.groupId, gid));
          await tx.delete(wateringPresets).where(eq(wateringPresets.groupId, gid));
          await tx.delete(fertilizationPresets).where(eq(fertilizationPresets.groupId, gid));
          await tx.delete(notificationHistory).where(eq(notificationHistory.groupId, gid));

          // ════════════════════════════════════════════════════════════════
          // MULTI-TENANCY: o backup preserva os IDs originais (auto-increment
          // PRIMARY KEY), mas se algum desses IDs já existir em outra tenant
          // do mesmo DB, INSERT falha com "Duplicate entry for key 'PRIMARY'".
          //
          // Estratégia: inserir SEM o id original (deixar MySQL gerar novo)
          // e manter um mapa old→new pra remapear FKs em cascata.
          // ════════════════════════════════════════════════════════════════

          const tentIdMap   = new Map<number, number>();
          const strainIdMap = new Map<number, number>();
          const plantIdMap  = new Map<number, number>();
          const cycleIdMap  = new Map<number, number>();

          // Helper: insere uma linha por vez, retorna insertId
          async function insertOne(table: any, row: any): Promise<number> {
            const [result] = await tx.insert(table).values(row);
            return (result as any).insertId as number;
          }

          // 1) tents — sem FK, só carimba groupId do usuário
          for (const raw of sanitizeDates(input.data.tents ?? [])) {
            const { id: oldId, groupId: _gid, ...rest } = raw;
            const newId = await insertOne(tents, { ...rest, groupId: gid });
            if (typeof oldId === "number") tentIdMap.set(oldId, newId);
          }

          // 2) strains — sem FK, carimba groupId do usuário
          for (const raw of sanitizeDates(input.data.strains ?? [])) {
            const { id: oldId, groupId: _gid, ...rest } = raw;
            const newId = await insertOne(strains, { ...rest, groupId: gid });
            if (typeof oldId === "number") strainIdMap.set(oldId, newId);
          }

          // 3) plants — FK: strainId, currentTentId
          for (const raw of sanitizeDates(input.data.plants ?? [])) {
            const { id: oldId, groupId: _gid, strainId, currentTentId, ...rest } = raw;
            const remappedStrain = typeof strainId === "number" ? strainIdMap.get(strainId) ?? null : null;
            const remappedTent   = typeof currentTentId === "number" ? tentIdMap.get(currentTentId) ?? null : null;
            const newId = await insertOne(plants, {
              ...rest,
              strainId: remappedStrain,
              currentTentId: remappedTent,
              groupId: gid,
            });
            if (typeof oldId === "number") plantIdMap.set(oldId, newId);
          }

          // 4) cycles — FK: tentId, strainId, motherPlantId
          for (const raw of sanitizeDates(input.data.cycles ?? [])) {
            const { id: oldId, tentId, strainId, motherPlantId, ...rest } = raw;
            const remappedTent   = typeof tentId === "number" ? tentIdMap.get(tentId) ?? null : null;
            const remappedStrain = typeof strainId === "number" ? strainIdMap.get(strainId) ?? null : null;
            const remappedMother = typeof motherPlantId === "number" ? plantIdMap.get(motherPlantId) ?? null : null;
            if (remappedTent === null) continue; // cycle órfão sem tent — pula
            const newId = await insertOne(cycles, {
              ...rest,
              tentId: remappedTent,
              strainId: remappedStrain,
              motherPlantId: remappedMother,
            });
            if (typeof oldId === "number") cycleIdMap.set(oldId, newId);
          }

          // Helper genérico pra tabelas dependentes — remapeia campos de FK e dropa linha se FK essencial faltar
          async function bulkInsertRemapped(
            table: any,
            rows: any[] | undefined,
            opts: { tentField?: string; plantField?: string; cycleField?: string; requireTent?: boolean; requirePlant?: boolean }
          ) {
            if (!rows?.length) return;
            for (const raw of sanitizeDates(rows)) {
              const { id: _id, ...rest } = raw;
              const out: any = { ...rest };
              if (opts.tentField && typeof rest[opts.tentField] === "number") {
                const mapped = tentIdMap.get(rest[opts.tentField]);
                if (!mapped && opts.requireTent) continue;
                out[opts.tentField] = mapped ?? null;
              }
              if (opts.plantField && typeof rest[opts.plantField] === "number") {
                const mapped = plantIdMap.get(rest[opts.plantField]);
                if (!mapped && opts.requirePlant) continue;
                out[opts.plantField] = mapped ?? null;
              }
              if (opts.cycleField && typeof rest[opts.cycleField] === "number") {
                out[opts.cycleField] = cycleIdMap.get(rest[opts.cycleField]) ?? null;
              }
              await tx.insert(table).values(out);
            }
          }

          // 5) dailyLogs — FK: tentId (required)
          await bulkInsertRemapped(dailyLogs, input.data.dailyLogs, { tentField: "tentId", requireTent: true });

          // 6) taskTemplates — sem FK, carimba groupId
          if (input.data.taskTemplates?.length) {
            for (const raw of sanitizeDates(input.data.taskTemplates)) {
              const { id: _id, groupId: _gid, ...rest } = raw;
              await tx.insert(taskTemplates).values({ ...rest, groupId: gid });
            }
          }

          // 7) alertSettings — FK: tentId (required)
          await bulkInsertRemapped(alertSettings, input.data.alertSettings, { tentField: "tentId", requireTent: true });

          // 8) alerts — FK: tentId (required)
          await bulkInsertRemapped(alerts, input.data.alerts, { tentField: "tentId", requireTent: true });

          // 9) plantPhotos — FK: plantId (required), cycleId (optional)
          await bulkInsertRemapped(plantPhotos, input.data.plantPhotos, {
            plantField: "plantId",
            cycleField: "cycleId",
            requirePlant: true,
          });

          // 10) plantHealthLogs — FK: plantId (required)
          await bulkInsertRemapped(plantHealthLogs, input.data.plantHealthLogs, {
            plantField: "plantId",
            requirePlant: true,
          });

          // 11) recipeTemplates — sem FK, carimba groupId
          if (input.data.recipeTemplates?.length) {
            for (const raw of sanitizeDates(input.data.recipeTemplates)) {
              const { id: _id, groupId: _gid, ...rest } = raw;
              await tx.insert(recipeTemplates).values({ ...rest, groupId: gid });
            }
          }

          // 12) nutrientApplications — FK: tentId (required), cycleId (optional)
          await bulkInsertRemapped(nutrientApplications, input.data.nutrientApplications, {
            tentField: "tentId",
            cycleField: "cycleId",
            requireTent: true,
          });

          // 13) wateringApplications — FK: tentId (required), cycleId (optional)
          await bulkInsertRemapped(wateringApplications, input.data.wateringApplications, {
            tentField: "tentId",
            cycleField: "cycleId",
            requireTent: true,
          });
        });

        return { success: true, message: "Backup restaurado com sucesso" };
      }),
});
