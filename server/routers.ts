import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, adminProcedure, router } from "./_core/trpc";
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
  recipes,
  alerts,
  weeklyTargets,
  taskInstances,
  taskTemplates,
  standaloneTasks,
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

// Helpers compartilhados (validators de ownership) — antes inline aqui,
// agora em routers/_helpers.ts pra que sub-routers extraídos consigam importar.
import {
  validateTentOwnership,
  validateCycleOwnership,
  validatePlantOwnership,
} from "./routers/_helpers";

/**
 * D3 — Seed task instances for a tent immediately after cycle creation.
 * This ensures tasks appear on the Home/Tasks tab without the user
 * needing to navigate to the tasks tab first.
 */

// ─── Backup import validation primitives ─────────────────────────────────────
//
// Usado em backup.import (linha ~6850) — valida cada row do backup uploadado.
// Schema pragmático: aceita primitivos + null, bloqueia arrays/objetos aninhados,
// limita tamanhos pra prevenir DoS. Substituiu z.array(z.any()) que aceitava
// qualquer payload (vetor de XSS-stored e DoS via JSON gigante).
const MAX_BACKUP_ROWS = 100_000;       // por tabela — generoso pra backup grande
const MAX_BACKUP_FIELD_BYTES = 50_000; // 50KB por valor de campo (ex: nodesJson)
const MAX_BACKUP_KEY_LEN = 64;         // nome de coluna razoável

const safeBackupValue = z.union([
  z.string().max(MAX_BACKUP_FIELD_BYTES),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const safeBackupRow = z.record(z.string().max(MAX_BACKUP_KEY_LEN), safeBackupValue);

// ─── Tuya / SmartLife integration router ─────────────────────────────────────

const POLL_INTERVAL_OPTIONS = [30, 60, 180, 480, 720] as const;

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
    const { listTuyaScenesIoTCore } = await import("./lib/tuya");

    // ── Tentativa 1: IoT Core (/v2.0/cloud/scene/rule) ─────────────────────────
    let iotCoreError = "";
    try {
      const iotScenes = await listTuyaScenesIoTCore(cfg.accessId, cfg.accessSecret, cfg.region);
      if (iotScenes.length > 0) {
        console.log(`[Tuya] listScenes: IoT Core retornou ${iotScenes.length} cenas`);
        return iotScenes.map(s => ({
          sceneId: s.sceneId,
          name: s.name,
          homeId: 0,
          homeName: s.type === "automation" ? "Automações" : "Cenas",
          conditions: s.conditions ?? [],
        }));
      }
      iotCoreError = "IoT Core retornou 0 cenas";
    } catch (e: any) {
      iotCoreError = e?.message ?? String(e);
      console.warn(`[Tuya] listScenes IoT Core falhou: ${iotCoreError}`);
    }

    // ── Tentativa 2: Smart Home com homeId manual ───────────────────────────────
    if (cfg.homeId) {
      const { listTuyaScenes, listTuyaAutomations } = await import("./lib/tuya");
      try {
        const [scenes, automations] = await Promise.allSettled([
          listTuyaScenes(Number(cfg.homeId), cfg.accessId, cfg.accessSecret, cfg.region),
          listTuyaAutomations(Number(cfg.homeId), cfg.accessId, cfg.accessSecret, cfg.region),
        ]);

        const result: any[] = [];

        if (scenes.status === "fulfilled") {
          result.push(...scenes.value.map(s => ({ ...s, homeName: "Minha Casa", conditions: [] })));
        }
        if (automations.status === "fulfilled" && automations.value.length > 0) {
          result.push(...automations.value.map(a => ({ ...a, homeName: "Automações", conditions: a.conditions })));
        }

        if (result.length > 0) return result;
      } catch (e: any) {
        console.warn(`[Tuya] listScenes Smart Home homeId=${cfg.homeId}: ${e?.message}`);
      }
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `IoT Core: ${iotCoreError}. Verifique se a região na aba Config está correta (Europa/América/China) e se o serviço "Scene Linkage Rules" está ativo no projeto Tuya.`,
    });
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
      const cfg = await getTuyaConfig(ctx.user.id);
      const { triggerTuyaScene } = await import("./lib/tuya");
      const result = await triggerTuyaScene(input.homeId ?? 0, input.sceneId, cfg.accessId, cfg.accessSecret, cfg.region);
      if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.msg ?? "Falha ao disparar cena" });
      return { ok: true };
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
        `SELECT id, sceneId, name, position FROM tentScenes WHERE tentId = ? ORDER BY position ASC, id ASC`,
        [input.tentId]
      );
      return (rows as any[]).map(r => ({
        id: r.id as number,
        sceneId: r.sceneId as string,
        name: r.name as string,
        position: r.position as number,
      }));
    }),

  /** Adiciona uma cena à estufa (position auto = max+1). Bloqueia duplicatas. */
  add: protectedProcedure
    .input(z.object({
      tentId: z.number(),
      sceneId: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
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
        `INSERT INTO tentScenes (tentId, sceneId, name, position) VALUES (?, ?, ?, ?)`,
        [input.tentId, input.sceneId, input.name, nextPos]
      );
      return { id: ins.insertId as number, position: nextPos };
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
const ICON_HINTS = ['light', 'fan', 'pump', 'heater', 'ac', 'humidifier', 'dehumidifier', 'co2', 'other'] as const;

const tentDevicesRouter = router({
  list: protectedProcedure
    .input(z.object({ tentId: z.number() }))
    .query(async ({ ctx, input }) => {
      await validateTentOwnership(input.tentId, ctx.user.groupId);
      const pool = getMysqlPool();
      const [rows]: any = await pool.execute(
        `SELECT id, deviceId, name, position, iconHint FROM tentDevices WHERE tentId = ? ORDER BY position ASC, id ASC`,
        [input.tentId]
      );
      return (rows as any[]).map(r => ({
        id: r.id as number,
        deviceId: r.deviceId as string,
        name: r.name as string,
        position: r.position as number,
        iconHint: r.iconHint as string | null,
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

      const [ins]: any = await pool.execute(
        `INSERT INTO tentDevices (tentId, deviceId, name, position, iconHint) VALUES (?, ?, ?, ?, ?)`,
        [input.tentId, input.deviceId, input.name, nextPos, input.iconHint ?? null]
      );
      return { id: ins.insertId as number, position: nextPos };
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
        `SELECT id, sceneId, name, position FROM tentScenes WHERE tentId = ?`,
        [input.tentId]
      );
      const [devices]: any = await pool.execute(
        `SELECT id, deviceId, name, position, iconHint FROM tentDevices WHERE tentId = ?`,
        [input.tentId]
      );
      const items = [
        ...(scenes as any[]).map((s: any) => ({
          type: 'scene' as const,
          id: s.id as number,
          refId: s.sceneId as string,
          name: s.name as string,
          position: s.position as number,
          iconHint: null as string | null,
        })),
        ...(devices as any[]).map((d: any) => ({
          type: 'device' as const,
          id: d.id as number,
          refId: d.deviceId as string,
          name: d.name as string,
          position: d.position as number,
          iconHint: d.iconHint as string | null,
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
  tents: router({
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
        
        // Buscar todos os ciclos da estufa (ativos e finalizados)
        const allCycles = await database
          .select({ id: cycles.id })
          .from(cycles)
          .where(eq(cycles.tentId, input.id));
        
        const cycleIds = allCycles.map((c: any) => c.id);
        
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
  dailyLogs: router({
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
  }),

  // Alerts (Alertas)
  alerts: router({
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
  }),

  // Task Instances (Tarefas)
  tasks: router({
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
  }),


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
  database: router({
    export: protectedProcedure.query(async () => {
      const { generateSQLDump } = await import("./databaseExport");
      const sqlDump = await generateSQLDump();
      return { sql: sqlDump };
    }),
    import: adminProcedure
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

  taskTemplates: router({
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

          // Inserir dados do backup — tents/plants/templates recebem o groupId do usuário.
          //
          // ⚠️ NOTA MULTI-TENANCY: o backup preserva os IDs originais (auto-increment
          // PRIMARY KEY). Se algum dos IDs do backup já existir em outra tenant
          // do mesmo DB, o INSERT abaixo falhará com "Duplicate entry for key
          // 'PRIMARY'" e a transação inteira faz rollback (dados ficam intactos).
          // Solução completa exige re-mapear IDs (build old→new map e reescrever
          // FKs em cascata). Pra deploy single-tenant atual (1 group por DB),
          // isso não acontece. Se o app ganhar multi-tenancy real, refazer.
          if (input.data.tents?.length) await tx.insert(tents).values(withGroup(input.data.tents));
          if (input.data.strains?.length) await tx.insert(strains).values(sanitizeDates(input.data.strains));
          if (input.data.cycles?.length) await tx.insert(cycles).values(sanitizeDates(input.data.cycles));
          if (input.data.plants?.length) await tx.insert(plants).values(withGroup(input.data.plants));
          if (input.data.dailyLogs?.length) await tx.insert(dailyLogs).values(sanitizeDates(input.data.dailyLogs));
          if (input.data.taskTemplates?.length) await tx.insert(taskTemplates).values(withGroup(input.data.taskTemplates));
          if (input.data.alertSettings?.length) await tx.insert(alertSettings).values(sanitizeDates(input.data.alertSettings));
          if (input.data.alerts?.length) await tx.insert(alerts).values(sanitizeDates(input.data.alerts));
          if (input.data.plantPhotos?.length) await tx.insert(plantPhotos).values(sanitizeDates(input.data.plantPhotos));
          if (input.data.plantHealthLogs?.length) await tx.insert(plantHealthLogs).values(sanitizeDates(input.data.plantHealthLogs));
          if (input.data.recipeTemplates?.length) await tx.insert(recipeTemplates).values(withGroup(input.data.recipeTemplates));
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
});

export type AppRouter = typeof appRouter;
