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

/**
 * D3 — Seed task instances for a tent immediately after cycle creation.
 * This ensures tasks appear on the Home/Tasks tab without the user
 * needing to navigate to the tasks tab first.
 */

// Backup helpers (MAX_BACKUP_*, safeBackupValue, safeBackupRow) foram movidos
// pra server/routers/backup.ts junto com o backup router que os usava.

// ─── Tuya / SmartLife integration router ─────────────────────────────────────

// 5 opções: 1h, 3h, 8h (recomendado), 12h, 24h
// Removida 30min (agressivo demais — queimava quota Tuya Trial em dias)
const POLL_INTERVAL_OPTIONS = [60, 180, 480, 720, 1440] as const;

/** Busca credenciais Tuya do usuário no banco. Lança NOT_FOUND se não configurado. */
async function getTuyaConfig(userId: number, opts: { requireEnabled?: boolean } = {}) {
  const pool = getMysqlPool();
  const enabledClause = opts.requireEnabled ? ' AND enabled = 1' : '';
  const [rows]: any = await pool.execute(
    `SELECT accessId, accessSecret, region, homeId FROM tuyaConfig WHERE userId = ?${enabledClause}`,
    [userId]
  );
  if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Configure as credenciais Tuya primeiro" });
  const row = rows[0] as { accessId: string; accessSecret: string; region: import("./lib/tuya").TuyaRegion; homeId: string | null };
  try {
    const { decryptAndMigrate } = await import("./aiCrypto");
    row.accessSecret = await decryptAndMigrate(row.accessSecret, async (newCipher) => {
      await pool.execute(`UPDATE tuyaConfig SET accessSecret = ? WHERE userId = ?`, [newCipher, userId]);
    });
  } catch (err) {
    console.warn("[Tuya] decrypt accessSecret failed", (err as Error).message);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao decifrar credenciais Tuya. Reconfigure no Settings." });
  }
  return row;
}

const tuyaRouter = router({
  /** Salva credenciais Tuya do usuário */
  saveConfig: protectedProcedure
    .input(z.object({
      accessId: z.string().min(1).max(100),
      // Vazio = manter segredo existente no banco (não sobrescrever)
      accessSecret: z.string().max(100).optional(),
      region: z.enum(["eu", "us", "cn", "in"]),
      pollIntervalMin: z.number().refine(v => POLL_INTERVAL_OPTIONS.includes(v as any)),
      enabled: z.boolean(),
      homeId: z.string().max(50).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Integração IoT (Tuya) é recurso do plano Cloud+ — bloqueia Free/Starter (T28)
      requirePlanFeature(ctx.user, "iot");
      const pool = getMysqlPool();
      if (input.accessSecret) {
        // Novo segredo fornecido: criptografar e salvar
        const { encryptApiKey } = await import("./aiCrypto");
        const encryptedSecret = encryptApiKey(input.accessSecret);
        await pool.execute(
          `INSERT INTO tuyaConfig (userId, accessId, accessSecret, region, pollIntervalMin, enabled, homeId)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             accessId = VALUES(accessId),
             accessSecret = VALUES(accessSecret),
             region = VALUES(region),
             pollIntervalMin = VALUES(pollIntervalMin),
             enabled = VALUES(enabled),
             homeId = VALUES(homeId)`,
          [ctx.user.id, input.accessId, encryptedSecret, input.region, input.pollIntervalMin, input.enabled ? 1 : 0, input.homeId ?? null]
        );
      } else {
        // Sem novo segredo: atualizar tudo exceto accessSecret
        await pool.execute(
          `INSERT INTO tuyaConfig (userId, accessId, accessSecret, region, pollIntervalMin, enabled, homeId)
           VALUES (?, ?, '', ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             accessId = VALUES(accessId),
             region = VALUES(region),
             pollIntervalMin = VALUES(pollIntervalMin),
             enabled = VALUES(enabled),
             homeId = VALUES(homeId)`,
          [ctx.user.id, input.accessId, input.region, input.pollIntervalMin, input.enabled ? 1 : 0, input.homeId ?? null]
        );
      }
      return { ok: true };
    }),

  /** Busca credenciais salvas — accessSecret retorna mascarado ao client */
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const pool = getMysqlPool();
    const [rows]: any = await pool.execute(
      `SELECT accessId, accessSecret, region, pollIntervalMin, enabled, homeId FROM tuyaConfig WHERE userId = ?`,
      [ctx.user.id]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    // Nunca retornar o segredo descriptografado ao client; apenas indicar se está configurado
    const hasSecret = Boolean(r.accessSecret);
    return {
      accessId: r.accessId as string,
      accessSecretMasked: hasSecret ? "••••••••••••" : "",
      region: r.region as string,
      pollIntervalMin: r.pollIntervalMin as number,
      enabled: Boolean(r.enabled),
      homeId: r.homeId as string | null,
    };
  }),

  /** Testa a conexão com a API Tuya */
  testConnection: protectedProcedure
    .input(z.object({
      accessId: z.string().min(1),
      accessSecret: z.string().min(1),
      region: z.enum(["eu", "us", "cn", "in"]),
    }))
    .mutation(async ({ input }) => {
      const { testTuyaConnection } = await import("./lib/tuya");
      return testTuyaConnection(input.accessId, input.accessSecret, input.region);
    }),

  /**
   * Dado o UID do usuário SmartLife, busca as casas (homeId + nome).
   * Usar no Config tab: usuário cola o UID que encontrou no API Explorer.
   */
  resolveHomeId: protectedProcedure
    .input(z.object({ smartlifeUid: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/, "UID inválido") }))
    .mutation(async ({ ctx, input }) => {
      const cfg = await getTuyaConfig(ctx.user.id);
      const { listHomesForUid } = await import("./lib/tuya");
      try {
        const homes = await listHomesForUid(input.smartlifeUid, cfg.accessId, cfg.accessSecret, cfg.region);
        return homes;
      } catch (e: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Tuya: ${e?.message ?? String(e)}` });
      }
    }),

  getAutomationDetails: protectedProcedure
    .input(z.object({ ruleId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const cfg = await getTuyaConfig(ctx.user.id);
      const { getTuyaRuleDetails } = await import("./lib/tuya");
      try {
        return await getTuyaRuleDetails(input.ruleId, cfg.accessId, cfg.accessSecret, cfg.region, cfg.homeId ? Number(cfg.homeId) : undefined);
      } catch (e: any) {
        return { conditions: [], actions: [], found: false };
      }
    }),

  /** Lista dispositivos da conta Tuya */
  listDevices: protectedProcedure.query(async ({ ctx }) => {
    const cfg = await getTuyaConfig(ctx.user.id, { requireEnabled: true });
    const { listTuyaDevices } = await import("./lib/tuya");
    return listTuyaDevices(cfg.accessId, cfg.accessSecret, cfg.region, cfg.homeId ? Number(cfg.homeId) : undefined);
  }),

  /** Salva mapeamento dispositivo ↔ estufa */
  saveMappings: protectedProcedure
    .input(z.array(z.object({
      tentId: z.number(),
      deviceId: z.string(),
      deviceName: z.string(),
      enabled: z.boolean(),
    })))
    .mutation(async ({ ctx, input }) => {
      const pool = getMysqlPool();
      await pool.execute(`DELETE FROM tuyaSensorMappings WHERE userId = ?`, [ctx.user.id]);
      for (const m of input) {
        await pool.execute(
          `INSERT INTO tuyaSensorMappings (userId, tentId, deviceId, deviceName, enabled)
           VALUES (?, ?, ?, ?, ?)`,
          [ctx.user.id, m.tentId, m.deviceId, m.deviceName, m.enabled ? 1 : 0]
        );
      }
      return { ok: true };
    }),

  /** Busca mapeamentos salvos */
  getMappings: protectedProcedure.query(async ({ ctx }) => {
    const pool = getMysqlPool();
    const [rows]: any = await pool.execute(
      `SELECT tentId, deviceId, deviceName, enabled FROM tuyaSensorMappings WHERE userId = ?`,
      [ctx.user.id]
    );
    return (rows as any[]).map(r => ({
      tentId: r.tentId as number,
      deviceId: r.deviceId as string,
      deviceName: r.deviceName as string,
      enabled: Boolean(r.enabled),
    }));
  }),

  /** Retorna a leitura mais recente do sensor de uma estufa específica */
  getLatestReadingForTent: protectedProcedure
    .input(z.object({ tentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const pool = getMysqlPool();

      // 1. Verifica se há mapeamento ativo (sensor configurado para esta estufa)
      const [mappingRows]: any = await pool.execute(
        `SELECT id FROM tuyaSensorMappings WHERE userId = ? AND tentId = ? AND enabled = 1 LIMIT 1`,
        [ctx.user.id, input.tentId]
      );
      if (mappingRows.length === 0) return null; // sensor não configurado

      // 2. Busca leitura mais recente (pode não existir ainda)
      const [rows]: any = await pool.execute(
        `SELECT slr.tempC, slr.rhPct, slr.readAt
         FROM tuyaSensorMappings tsm
         INNER JOIN sensorLatestReadings slr ON slr.deviceId = tsm.deviceId
         WHERE tsm.userId = ? AND tsm.tentId = ?
         LIMIT 1`,
        [ctx.user.id, input.tentId]
      );

      // Sensor configurado mas ainda sem leitura
      if (rows.length === 0) return { hasSensor: true, isFresh: false, tempC: null, rhPct: null, readAt: null };

      const r = rows[0];
      const readAt = r.readAt instanceof Date ? r.readAt : new Date(r.readAt);
      return {
        hasSensor: true,
        tempC: r.tempC != null ? parseFloat(r.tempC) : null,
        rhPct: r.rhPct != null ? parseFloat(r.rhPct) : null,
        readAt,
        isFresh: (Date.now() - readAt.getTime()) < 2 * 60 * 60 * 1000,
      };
    }),

  /** Retorna a última leitura de todos os sensores (todas as estufas) */
  getLatestReadingsAll: protectedProcedure.query(async ({ ctx }) => {
    const pool = getMysqlPool();
    const [rows]: any = await pool.execute(
      `SELECT tsm.tentId, slr.tempC, slr.rhPct, slr.readAt
       FROM tuyaSensorMappings tsm
       INNER JOIN sensorLatestReadings slr ON slr.deviceId = tsm.deviceId AND slr.userId = tsm.userId
       WHERE tsm.userId = ? AND tsm.enabled = 1`,
      [ctx.user.id]
    );
    const result: Record<number, { tempC: number | null; rhPct: number | null; readAt: Date }> = {};
    for (const r of rows) {
      result[r.tentId] = {
        tempC: r.tempC != null ? parseFloat(r.tempC) : null,
        rhPct: r.rhPct != null ? parseFloat(r.rhPct) : null,
        readAt: r.readAt instanceof Date ? r.readAt : new Date(r.readAt),
      };
    }
    return result;
  }),

  /** Força leitura imediata de todos os sensores desta estufa */
  readNow: protectedProcedure
    .input(z.object({ tentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const pool = getMysqlPool();

      const [cfgRows]: any = await pool.execute(
        `SELECT tc.accessId, tc.accessSecret, tc.region, tsm.deviceId
         FROM tuyaConfig tc
         INNER JOIN tuyaSensorMappings tsm ON tsm.userId = tc.userId AND tsm.tentId = ? AND tsm.enabled = 1
         WHERE tc.userId = ? AND tc.enabled = 1`,
        [input.tentId, ctx.user.id]
      );
      if (cfgRows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum sensor ativo para esta estufa" });
      const cfg = cfgRows[0];

      // accessSecret está cifrado no banco — decifra e migra para v1 se for legado
      const { decryptAndMigrate } = await import("./aiCrypto");
      const accessSecret = await decryptAndMigrate(cfg.accessSecret, async (newCipher) => {
        await pool.execute(`UPDATE tuyaConfig SET accessSecret = ? WHERE userId = ?`, [newCipher, ctx.user.id]);
      });

      const { readTuyaDeviceStatus } = await import("./lib/tuya");
      let reading: { tempC: number | null; rhPct: number | null };
      try {
        reading = await readTuyaDeviceStatus(cfg.deviceId, cfg.accessId, accessSecret, cfg.region);
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        // "permission deny" → orientar o usuário a vincular o dispositivo no portal
        if (msg.includes("permission deny") || msg.includes("1010")) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Dispositivo sem permissão. Acesse iot.tuya.com → Devices → Link App Account e vincule sua conta SmartLife.",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Sensor: ${msg}` });
      }

      // Upsert leitura mais recente
      await pool.execute(
        `INSERT INTO sensorLatestReadings (userId, deviceId, tempC, rhPct, readAt)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE tempC = VALUES(tempC), rhPct = VALUES(rhPct), readAt = NOW()`,
        [ctx.user.id, cfg.deviceId, reading.tempC ?? null, reading.rhPct ?? null]
      );

      // Busca último log manual para carregar pH, EC, ppfd, etc.
      const [lastManual]: any = await pool.execute(
        `SELECT ph, ec, ppfd, wateringVolume, runoffCollected, runoffPercentage
         FROM dailyLogs
         WHERE tentId = ? AND (source = 'MANUAL' OR source IS NULL)
         ORDER BY logDate DESC LIMIT 1`,
        [input.tentId]
      );
      const prev = (lastManual as any[])[0] ?? {};

      // Upsert log automático com temp/rh atuais + últimos valores manuais
      const turn = new Date().getHours() < 18 ? 'AM' : 'PM';
      await pool.execute(
        `INSERT INTO dailyLogs
           (tentId, logDate, turn, tempC, rhPct, ph, ec, ppfd,
            wateringVolume, runoffCollected, runoffPercentage, source)
         VALUES (?, DATE_FORMAT(NOW(), '%Y-%m-%d %H:00:00'), ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AUTO')
         ON DUPLICATE KEY UPDATE
           tempC  = VALUES(tempC),
           rhPct  = VALUES(rhPct),
           source = 'AUTO'`,
        [
          input.tentId, turn,
          reading.tempC ?? null, reading.rhPct ?? null,
          prev.ph ?? null, prev.ec ?? null, prev.ppfd ?? null,
          prev.wateringVolume ?? null, prev.runoffCollected ?? null, prev.runoffPercentage ?? null,
        ]
      );

      return { ...reading, readAt: new Date() };
    }),

  // ─── Device control ─────────────────────────────────────────────────────────

  /** Salva mapeamentos de dispositivos controláveis por estufa */
  saveDeviceMappings: protectedProcedure
    .input(z.array(z.object({
      tentId: z.number(),
      deviceId: z.string().min(1),
      deviceName: z.string(),
      switchCode: z.string().default("switch_1"),
      enabled: z.boolean(),
    })))
    .mutation(async ({ ctx, input }) => {
      const pool = getMysqlPool();
      const tentIds = [...new Set(input.map(m => m.tentId))];
      for (const tentId of tentIds) {
        await pool.execute(
          `DELETE FROM tuyaDeviceMappings WHERE userId = ? AND tentId = ?`,
          [ctx.user.id, tentId]
        );
      }
      for (const m of input) {
        await pool.execute(
          `INSERT INTO tuyaDeviceMappings (userId, tentId, deviceId, deviceName, switchCode, enabled)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE deviceName=VALUES(deviceName), switchCode=VALUES(switchCode), enabled=VALUES(enabled)`,
          [ctx.user.id, m.tentId, m.deviceId, m.deviceName, m.switchCode, m.enabled ? 1 : 0]
        );
      }
      return { ok: true };
    }),

  /** Busca mapeamentos de dispositivos controláveis */
  getDeviceMappings: protectedProcedure.query(async ({ ctx }) => {
    const pool = getMysqlPool();
    const [rows]: any = await pool.execute(
      `SELECT tentId, deviceId, deviceName, switchCode, enabled FROM tuyaDeviceMappings WHERE userId = ? AND enabled = 1`,
      [ctx.user.id]
    );
    return (rows as any[]).map(r => ({
      tentId: r.tentId as number,
      deviceId: r.deviceId as string,
      deviceName: r.deviceName as string,
      switchCode: r.switchCode as string,
      enabled: Boolean(r.enabled),
    }));
  }),

  /** Estado atual (online + switch on/off) de um dispositivo */
  getDeviceCurrentStatus: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const cfg = await getTuyaConfig(ctx.user.id, { requireEnabled: true });
      const { getTuyaDeviceSwitchState } = await import("./lib/tuya");
      return getTuyaDeviceSwitchState(input.deviceId, cfg.accessId, cfg.accessSecret, cfg.region);
    }),

  /** Liga / desliga um dispositivo */
  sendDeviceCommand: protectedProcedure
    .input(z.object({
      deviceId: z.string(),
      switchCode: z.string().default("switch_1"),
      value: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      requirePlanFeature(ctx.user, "iot"); // controle IoT é Cloud+ (T28)
      const cfg = await getTuyaConfig(ctx.user.id, { requireEnabled: true });
      const { controlTuyaDevice } = await import("./lib/tuya");
      const result = await controlTuyaDevice(input.deviceId, input.switchCode, input.value, cfg.accessId, cfg.accessSecret, cfg.region);
      if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.msg ?? "Erro ao controlar dispositivo" });
      return { ok: true };
    }),

  // ─── SmartLife scenes ────────────────────────────────────────────────────────

  /** Lista todas as cenas SmartLife.
   *  Se homeId estiver salvo na config, usa diretamente (bypass da listTuyaHomes).
   *  Caso contrário, tenta auto-detectar as casas via API. */
  listScenes: protectedProcedure.query(async ({ ctx }) => {
    const cfg = await getTuyaConfig(ctx.user.id);
    const { listTuyaScenes, listTuyaAutomations, listTuyaHomes } = await import("./lib/tuya");

    // Resolve homeId (salvo ou auto-detect)
    let homeId = cfg.homeId ? Number(cfg.homeId) : 0;
    if (!homeId) {
      try {
        const homes = await listTuyaHomes(cfg.accessId, cfg.accessSecret, cfg.region);
        homeId = homes?.[0]?.homeId ? Number(homes[0].homeId) : 0;
      } catch { /* segue */ }
    }

    const result: any[] = [];
    if (homeId) {
      // Tap-to-run (cenas manuais) E automações — independentes (allSettled).
      // IMPORTANTE: tap-to-run depende do serviço "Smart Home Scene Linkage",
      // que a Tuya marcou [Deprecate]/trial. Quando ele falha (28841101 not
      // subscribed), AINDA mostramos as automações, que usam serviço permanente.
      const [scenes, automations] = await Promise.allSettled([
        listTuyaScenes(homeId, cfg.accessId, cfg.accessSecret, cfg.region),
        listTuyaAutomations(homeId, cfg.accessId, cfg.accessSecret, cfg.region),
      ]);
      if (scenes.status === "fulfilled") {
        result.push(...scenes.value.map(s => ({ ...s, homeName: "Cenas", conditions: [] })));
      } else {
        console.warn(`[Tuya] listScenes tap-to-run falhou (esperado se serviço não assinado): ${scenes.reason?.message}`);
      }
      if (automations.status === "fulfilled" && automations.value.length > 0) {
        result.push(...automations.value.map(a => ({ ...a, homeName: "Automações", conditions: a.conditions })));
      }
    }

    // Retorna o que conseguiu (pode ser só automações, ou vazio).
    // NÃO lança erro: a tela mostra o que veio + o "Adicionar manualmente"
    // pras tap-to-run (cujo trigger funciona mesmo sem listagem).
    console.log(`[Tuya] listScenes: home=${homeId} retornou ${result.length} item(ns)`);
    return result;
  }),

  /** Lista cenas salvas manualmente */
  listManualScenes: protectedProcedure.query(async ({ ctx }) => {
    const pool = getMysqlPool();
    const [rows]: any = await pool.execute(
      `SELECT id, homeId, sceneId, name, COALESCE(type, 'tap') as type FROM tuyaManualScenes WHERE userId = ? ORDER BY createdAt DESC`,
      [ctx.user.id]
    );
    return (rows as any[]).map((r: any) => ({
      id: r.id as number,
      homeId: Number(r.homeId),
      sceneId: r.sceneId as string,
      name: r.name as string,
      type: (r.type as string) === 'automation' ? 'automation' : 'tap',
    }));
  }),

  /** Salva uma cena manual */
  saveManualScene: protectedProcedure
    .input(z.object({ homeId: z.string().max(50).optional(), sceneId: z.string().min(1), name: z.string().min(1).max(200), type: z.enum(['tap', 'automation']).default('tap') }))
    .mutation(async ({ ctx, input }) => {
      const pool = getMysqlPool();
      await pool.execute(
        `INSERT INTO tuyaManualScenes (userId, homeId, sceneId, name, type)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE homeId = VALUES(homeId), name = VALUES(name), type = VALUES(type)`,
        [ctx.user.id, input.homeId ?? '', input.sceneId, input.name, input.type]
      );
      return { ok: true };
    }),

  /** Remove uma cena manual */
  deleteManualScene: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const pool = getMysqlPool();
      await pool.execute(`DELETE FROM tuyaManualScenes WHERE id = ? AND userId = ?`, [input.id, ctx.user.id]);
      return { ok: true };
    }),

  /** Dispara uma cena SmartLife (homeId opcional — tenta endpoints sem homeId como fallback) */
  triggerScene: protectedProcedure
    .input(z.object({ homeId: z.number().optional(), sceneId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requirePlanFeature(ctx.user, "iot"); // disparar cena IoT é Cloud+ (T28)
      const cfg = await getTuyaConfig(ctx.user.id);
      const { triggerTuyaScene } = await import("./lib/tuya");
      const result = await triggerTuyaScene(input.homeId ?? 0, input.sceneId, cfg.accessId, cfg.accessSecret, cfg.region);
      if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.msg ?? "Falha ao disparar cena" });
      return { ok: true };
    }),

  /** Lê o estado enabled/disabled de uma automation Tuya (cena programada). */
  getAutomationEnabled: protectedProcedure
    .input(z.object({ automationId: z.string(), homeId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const cfg = await getTuyaConfig(ctx.user.id);
      const { getTuyaAutomationEnabled } = await import("./lib/tuya");
      const enabled = await getTuyaAutomationEnabled(input.automationId, cfg.accessId, cfg.accessSecret, cfg.region, input.homeId ?? 0);
      return { enabled };
    }),

  /** Habilita/desabilita uma automation Tuya (cena programada). */
  toggleAutomation: protectedProcedure
    .input(z.object({ automationId: z.string(), enabled: z.boolean(), homeId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const cfg = await getTuyaConfig(ctx.user.id);
      const { setTuyaAutomationEnabled } = await import("./lib/tuya");
      const result = await setTuyaAutomationEnabled(input.automationId, input.enabled, cfg.accessId, cfg.accessSecret, cfg.region, input.homeId ?? 0);
      if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.msg ?? "Falha ao alterar automação" });
      return { ok: true, enabled: input.enabled };
    }),

  /**
   * Aloca uma URL de stream pra uma câmera Tuya/SmartLife.
   *
   * Mutation (não query) porque a chamada ao Tuya tem side-effect de alocar
   * recursos no lado deles + URL expira (~10min). Cliente chama uma vez
   * pra abrir o player, e re-chama periodicamente pra renovar.
   *
   * Type default 'hls' (player web via hls.js).
   */
  getCameraStream: protectedProcedure
    .input(z.object({
      deviceId: z.string().min(1).max(64),
      type: z.enum(['hls', 'rtsp']).default('hls'),
    }))
    .mutation(async ({ ctx, input }) => {
      const cfg = await getTuyaConfig(ctx.user.id);
      const { allocateTuyaCameraStream } = await import("./lib/tuya");
      const result = await allocateTuyaCameraStream(input.deviceId, input.type, cfg.accessId, cfg.accessSecret, cfg.region);
      if (!result.url) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.msg ?? "Tuya não retornou URL de stream" });
      return { url: result.url, type: input.type };
    }),
});

// ─── tentScenes router (cenas Tuya vinculadas a estufa) ────────────────────────
//
// Permite ao user vincular cenas Tuya específicas a uma estufa, controlando
// quais aparecem no display ESP32 dela. Mesma cena pode ser vinculada a
// múltiplas estufas (compartilhada).
const tentScenesRouter = router({
  /** Lista cenas vinculadas a uma estufa (ordenadas por position) */
  list: protectedProcedure
    .input(z.object({ tentId: z.number() }))
    .query(async ({ ctx, input }) => {
      await validateTentOwnership(input.tentId, ctx.user.groupId);
      const pool = getMysqlPool();
      const [rows]: any = await pool.execute(
        `SELECT id, sceneId, name, position, type, iconHint, executionSec FROM tentScenes WHERE tentId = ? ORDER BY position ASC, id ASC`,
        [input.tentId]
      );
      return (rows as any[]).map(r => ({
        id: r.id as number,
        sceneId: r.sceneId as string,
        name: r.name as string,
        position: r.position as number,
        type: (r.type === 'automation' ? 'automation' : 'scene') as 'scene' | 'automation',
        iconHint: r.iconHint as string | null,
        executionSec: (r.executionSec as number | null) ?? 5,
      }));
    }),

  /** Adiciona uma cena à estufa (position auto = max+1). Bloqueia duplicatas. */
  add: protectedProcedure
    .input(z.object({
      tentId: z.number(),
      sceneId: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      // Tipo vindo da listagem Tuya — afeta qual botão a UI mostra
      // (scene = Tap-to-Run → ▶ play one-shot;
      //  automation = scheduled rule → ⏰ toggle enable/disable).
      type: z.enum(['scene', 'automation']).default('scene'),
      // Mesmo enum dos devices — UI escolhe ícone do mapeamento (light=Lightbulb,
      // pump=Droplet pra rega, fan=Fan, schedule=Timer pra automações, etc).
      // Opcional — fallback Zap (raio).
      iconHint: z.enum(['light', 'fan', 'pump', 'heater', 'ac', 'humidifier', 'dehumidifier', 'co2', 'schedule', 'refresh', 'camera', 'other']).optional(),
      // Duração real da cena em segundos. ESP usa pra mostrar spinner "executando"
      // até a duração real terminar (em vez de 5s fixo). Range 1-600s (10min).
      // Default 5 (= comportamento antigo).
      executionSec: z.number().int().min(1).max(600).default(5),
    }))
    .mutation(async ({ ctx, input }) => {
      await validateTentOwnership(input.tentId, ctx.user.groupId);
      const pool = getMysqlPool();

      // Verifica duplicata
      const [dup]: any = await pool.execute(
        `SELECT id FROM tentScenes WHERE tentId = ? AND sceneId = ? LIMIT 1`,
        [input.tentId, input.sceneId]
      );
      if (dup.length > 0) throw new TRPCError({ code: 'CONFLICT', message: 'Cena já vinculada a esta estufa' });

      // Limita a 6 itens totais (cenas + devices)
      const [counts]: any = await pool.execute(
        `SELECT
           (SELECT COUNT(*) FROM tentScenes WHERE tentId = ?) +
           (SELECT COUNT(*) FROM tentDevices WHERE tentId = ?) AS total`,
        [input.tentId, input.tentId]
      );
      if (counts[0].total >= 6) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Limite de 6 itens (cenas + devices) por estufa atingido' });
      }

      // position = max+1 ENTRE AS DUAS TABELAS (apêndice no final do grid combinado)
      const [maxRow]: any = await pool.execute(
        `SELECT GREATEST(
           COALESCE((SELECT MAX(position) FROM tentScenes  WHERE tentId = ?), -1),
           COALESCE((SELECT MAX(position) FROM tentDevices WHERE tentId = ?), -1)
         ) + 1 AS next_pos`,
        [input.tentId, input.tentId]
      );
      const nextPos = maxRow[0].next_pos;

      const [ins]: any = await pool.execute(
        `INSERT INTO tentScenes (tentId, sceneId, name, position, type, iconHint, executionSec) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [input.tentId, input.sceneId, input.name, nextPos, input.type, input.iconHint ?? null, input.executionSec]
      );
      return { id: ins.insertId as number, position: nextPos, type: input.type };
    }),

  /** Remove uma cena vinculada (compacta positions depois). */
  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const pool = getMysqlPool();
      // Carrega tentId e valida ownership
      const [rows]: any = await pool.execute(
        `SELECT tentId FROM tentScenes WHERE id = ? LIMIT 1`,
        [input.id]
      );
      if (rows.length === 0) throw new TRPCError({ code: 'NOT_FOUND' });
      await validateTentOwnership(rows[0].tentId, ctx.user.groupId);

      await pool.execute(`DELETE FROM tentScenes WHERE id = ?`, [input.id]);
      return { ok: true };
    }),

  /** Reordena: aceita lista [{id, position}] em batch. */
  reorder: protectedProcedure
    .input(z.object({
      tentId: z.number(),
      order: z.array(z.object({ id: z.number(), position: z.number().int().min(0).max(99) })).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      await validateTentOwnership(input.tentId, ctx.user.groupId);
      const pool = getMysqlPool();
      // Valida que todos os IDs pertencem à tentId (anti-tamper)
      if (input.order.length > 0) {
        const ids = input.order.map(o => o.id);
        const placeholders = ids.map(() => '?').join(',');
        const [rows]: any = await pool.execute(
          `SELECT id FROM tentScenes WHERE tentId = ? AND id IN (${placeholders})`,
          [input.tentId, ...ids]
        );
        if (rows.length !== ids.length) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'IDs inválidos' });
        }
      }
      for (const o of input.order) {
        await pool.execute(`UPDATE tentScenes SET position = ? WHERE id = ?`, [o.position, o.id]);
      }
      return { ok: true };
    }),
});

// ─── tentDevices router (dispositivos Tuya vinculados a estufa) ────────────────
const ICON_HINTS = ['light', 'fan', 'pump', 'heater', 'ac', 'humidifier', 'dehumidifier', 'co2', 'schedule', 'refresh', 'camera', 'other'] as const;

const tentDevicesRouter = router({
  list: protectedProcedure
    .input(z.object({ tentId: z.number() }))
    .query(async ({ ctx, input }) => {
      await validateTentOwnership(input.tentId, ctx.user.groupId);
      const pool = getMysqlPool();
      const [rows]: any = await pool.execute(
        `SELECT id, deviceId, name, position, iconHint, switchCode FROM tentDevices WHERE tentId = ? ORDER BY position ASC, id ASC`,
        [input.tentId]
      );
      return (rows as any[]).map(r => ({
        id: r.id as number,
        deviceId: r.deviceId as string,
        name: r.name as string,
        position: r.position as number,
        iconHint: r.iconHint as string | null,
        switchCode: r.switchCode as string | null,
      }));
    }),

  add: protectedProcedure
    .input(z.object({
      tentId: z.number(),
      deviceId: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      iconHint: z.enum(ICON_HINTS).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await validateTentOwnership(input.tentId, ctx.user.groupId);
      const pool = getMysqlPool();

      const [dup]: any = await pool.execute(
        `SELECT id FROM tentDevices WHERE tentId = ? AND deviceId = ? LIMIT 1`,
        [input.tentId, input.deviceId]
      );
      if (dup.length > 0) throw new TRPCError({ code: 'CONFLICT', message: 'Device já vinculado a esta estufa' });

      const [counts]: any = await pool.execute(
        `SELECT
           (SELECT COUNT(*) FROM tentScenes WHERE tentId = ?) +
           (SELECT COUNT(*) FROM tentDevices WHERE tentId = ?) AS total`,
        [input.tentId, input.tentId]
      );
      if (counts[0].total >= 6) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Limite de 6 itens (cenas + devices) por estufa atingido' });
      }

      // position = max+1 ENTRE AS DUAS TABELAS (apêndice no final do grid combinado)
      const [maxRow]: any = await pool.execute(
        `SELECT GREATEST(
           COALESCE((SELECT MAX(position) FROM tentScenes  WHERE tentId = ?), -1),
           COALESCE((SELECT MAX(position) FROM tentDevices WHERE tentId = ?), -1)
         ) + 1 AS next_pos`,
        [input.tentId, input.tentId]
      );
      const nextPos = maxRow[0].next_pos;

      // Descobre switchCode AGORA (não depende disso pra criar — falha silenciosa
      // se Tuya estiver lenta/offline; o /device-toggle faz fallback de discovery
      // pra rows sem switchCode salvo).
      // Bug fix: ANTES o switchCode era descoberto a cada toggle e podia escolher
      // o DP errado (ex: switch_1 em vez de switch_led pra LEDs). Agora salvamos
      // o switchCode de uma vez e o toggle usa direto — alinha com o pattern do
      // app web (tuyaSensorMappings.switchCode).
      let switchCode: string | null = null;
      try {
        const [cfgRows]: any = await pool.execute(
          `SELECT accessId, accessSecret, region FROM tuyaConfig WHERE userId = ? AND enabled = 1 LIMIT 1`,
          [ctx.user.id]
        );
        if (cfgRows.length > 0) {
          const cfg = cfgRows[0];
          const { getTuyaDeviceSwitchState } = await import("./lib/tuya");
          const state = await getTuyaDeviceSwitchState(input.deviceId, cfg.accessId, cfg.accessSecret, cfg.region);
          switchCode = state.switchCode;
          console.log(`[tentDevices.add] device=${input.deviceId} switchCode descoberto: ${switchCode ?? '(null — device não expõe switch)'}`);
        }
      } catch (e: any) {
        console.warn(`[tentDevices.add] device=${input.deviceId} falhou descoberta de switchCode: ${e?.message} — segue NULL, /device-toggle vai re-tentar`);
      }

      const [ins]: any = await pool.execute(
        `INSERT INTO tentDevices (tentId, deviceId, name, position, iconHint, switchCode) VALUES (?, ?, ?, ?, ?, ?)`,
        [input.tentId, input.deviceId, input.name, nextPos, input.iconHint ?? null, switchCode]
      );
      return { id: ins.insertId as number, position: nextPos, switchCode };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const pool = getMysqlPool();
      const [rows]: any = await pool.execute(
        `SELECT tentId FROM tentDevices WHERE id = ? LIMIT 1`,
        [input.id]
      );
      if (rows.length === 0) throw new TRPCError({ code: 'NOT_FOUND' });
      await validateTentOwnership(rows[0].tentId, ctx.user.groupId);
      await pool.execute(`DELETE FROM tentDevices WHERE id = ?`, [input.id]);
      return { ok: true };
    }),

  reorder: protectedProcedure
    .input(z.object({
      tentId: z.number(),
      order: z.array(z.object({ id: z.number(), position: z.number().int().min(0).max(99) })).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      await validateTentOwnership(input.tentId, ctx.user.groupId);
      const pool = getMysqlPool();
      if (input.order.length > 0) {
        const ids = input.order.map(o => o.id);
        const placeholders = ids.map(() => '?').join(',');
        const [rows]: any = await pool.execute(
          `SELECT id FROM tentDevices WHERE tentId = ? AND id IN (${placeholders})`,
          [input.tentId, ...ids]
        );
        if (rows.length !== ids.length) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'IDs inválidos' });
        }
      }
      for (const o of input.order) {
        await pool.execute(`UPDATE tentDevices SET position = ? WHERE id = ?`, [o.position, o.id]);
      }
      return { ok: true };
    }),
});

// ─── tentDisplay router (operações que cruzam scenes + devices) ────────────────
//
// Endpoint reorder unificado: aceita lista combinada [{type, id, position}]
// e atualiza positions nas duas tabelas em sequência. Sem transação MySQL —
// se cair no meio, fica inconsistente, mas como é só UI ordering, baixo risco.
const tentDisplayRouter = router({
  /**
   * Lista TUDO (scenes + devices) já merged, ordenado por position.
   * Usado pra pintar o grid 2x3 de preview no app web.
   */
  listItems: protectedProcedure
    .input(z.object({ tentId: z.number() }))
    .query(async ({ ctx, input }) => {
      await validateTentOwnership(input.tentId, ctx.user.groupId);
      const pool = getMysqlPool();
      const [scenes]: any = await pool.execute(
        `SELECT id, sceneId, name, position, type, iconHint, executionSec FROM tentScenes WHERE tentId = ?`,
        [input.tentId]
      );
      const [devices]: any = await pool.execute(
        `SELECT id, deviceId, name, position, iconHint, switchCode FROM tentDevices WHERE tentId = ?`,
        [input.tentId]
      );
      const items = [
        ...(scenes as any[]).map((s: any) => ({
          // 'type' aqui é tipo do item (scene vs device pra UI saber qual lista),
          // 'sceneType' é tipo da CENA Tuya (scene one-shot vs automation enable/disable)
          type: 'scene' as const,
          sceneType: (s.type === 'automation' ? 'automation' : 'scene') as 'scene' | 'automation',
          id: s.id as number,
          refId: s.sceneId as string,
          name: s.name as string,
          position: s.position as number,
          iconHint: s.iconHint as string | null,
          switchCode: null as string | null,
          executionSec: (s.executionSec as number | null) ?? 5,
        })),
        ...(devices as any[]).map((d: any) => ({
          type: 'device' as const,
          sceneType: null as 'scene' | 'automation' | null,
          id: d.id as number,
          refId: d.deviceId as string,
          name: d.name as string,
          position: d.position as number,
          iconHint: d.iconHint as string | null,
          switchCode: d.switchCode as string | null,
          executionSec: null as number | null,  // só faz sentido pra cenas
        })),
      ];
      items.sort((a, b) => a.position - b.position || a.id - b.id);
      return items;
    }),

  /**
   * Reordena combinando scenes + devices. Aceita batch de [{type, id, position}].
   * Tipo decide qual tabela atualizar.
   */
  reorder: protectedProcedure
    .input(z.object({
      tentId: z.number(),
      order: z.array(z.object({
        type: z.enum(['scene', 'device']),
        id: z.number(),
        position: z.number().int().min(0).max(99),
      })).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      await validateTentOwnership(input.tentId, ctx.user.groupId);
      const pool = getMysqlPool();

      // Anti-tamper: valida que cada (id,type) pertence à tentId
      const sceneIds = input.order.filter(o => o.type === 'scene').map(o => o.id);
      const deviceIds = input.order.filter(o => o.type === 'device').map(o => o.id);

      if (sceneIds.length > 0) {
        const ph = sceneIds.map(() => '?').join(',');
        const [rows]: any = await pool.execute(
          `SELECT id FROM tentScenes WHERE tentId = ? AND id IN (${ph})`,
          [input.tentId, ...sceneIds]
        );
        if (rows.length !== sceneIds.length) throw new TRPCError({ code: 'FORBIDDEN', message: 'IDs de cena inválidos' });
      }
      if (deviceIds.length > 0) {
        const ph = deviceIds.map(() => '?').join(',');
        const [rows]: any = await pool.execute(
          `SELECT id FROM tentDevices WHERE tentId = ? AND id IN (${ph})`,
          [input.tentId, ...deviceIds]
        );
        if (rows.length !== deviceIds.length) throw new TRPCError({ code: 'FORBIDDEN', message: 'IDs de device inválidos' });
      }

      for (const o of input.order) {
        const table = o.type === 'scene' ? 'tentScenes' : 'tentDevices';
        await pool.execute(`UPDATE ${table} SET position = ? WHERE id = ?`, [o.position, o.id]);
      }
      return { ok: true };
    }),
});

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
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
      .input(z.object({ phase: z.enum(["CLONING", "VEGA", "FLORA", "MAINTENANCE", "DRYING"]).optional() }).optional())
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
