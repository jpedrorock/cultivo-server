/**
 * tuya — integração Tuya/SmartLife + cenas/devices/display por estufa.
 * Extraído de server/routers.ts (T9 da auditoria) pra reduzir o monolito.
 * Mantém as queries SQL raw (via getMysqlPool) — migração pra Drizzle é T1.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getMysqlPool } from "../mysql-pool";
import { validateTentOwnership, requirePlanFeature } from "./_helpers";

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
  const row = rows[0] as { accessId: string; accessSecret: string; region: import("../lib/tuya").TuyaRegion; homeId: string | null };
  try {
    const { decryptAndMigrate } = await import("../aiCrypto");
    row.accessSecret = await decryptAndMigrate(row.accessSecret, async (newCipher) => {
      await pool.execute(`UPDATE tuyaConfig SET accessSecret = ? WHERE userId = ?`, [newCipher, userId]);
    });
  } catch (err) {
    console.warn("[Tuya] decrypt accessSecret failed", (err as Error).message);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao decifrar credenciais Tuya. Reconfigure no Settings." });
  }
  return row;
}

export const tuyaRouter = router({
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
        const { encryptApiKey } = await import("../aiCrypto");
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
      const { testTuyaConnection } = await import("../lib/tuya");
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
      const { listHomesForUid } = await import("../lib/tuya");
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
      const { getTuyaRuleDetails } = await import("../lib/tuya");
      try {
        return await getTuyaRuleDetails(input.ruleId, cfg.accessId, cfg.accessSecret, cfg.region, cfg.homeId ? Number(cfg.homeId) : undefined);
      } catch (e: any) {
        return { conditions: [], actions: [], found: false };
      }
    }),

  /** Lista dispositivos da conta Tuya */
  listDevices: protectedProcedure.query(async ({ ctx }) => {
    const cfg = await getTuyaConfig(ctx.user.id, { requireEnabled: true });
    const { listTuyaDevices } = await import("../lib/tuya");
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
      // Valida ownership de cada estufa ANTES de gravar — impede mapear um
      // sensor para estufa de outro grupo (vazamento cross-tenant).
      const tentIds = [...new Set(input.map(m => m.tentId))];
      for (const tentId of tentIds) {
        await validateTentOwnership(tentId, ctx.user.groupId);
      }
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
      const { decryptAndMigrate } = await import("../aiCrypto");
      const accessSecret = await decryptAndMigrate(cfg.accessSecret, async (newCipher) => {
        await pool.execute(`UPDATE tuyaConfig SET accessSecret = ? WHERE userId = ?`, [newCipher, ctx.user.id]);
      });

      const { readTuyaDeviceStatus } = await import("../lib/tuya");
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
      // Valida ownership de cada estufa ANTES de gravar — impede mapear um
      // device controlável para estufa de outro grupo (vazamento cross-tenant).
      for (const tentId of tentIds) {
        await validateTentOwnership(tentId, ctx.user.groupId);
      }
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
      const { getTuyaDeviceSwitchState } = await import("../lib/tuya");
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
      const { controlTuyaDevice } = await import("../lib/tuya");
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
    const { listTuyaScenes, listTuyaAutomations, listTuyaHomes } = await import("../lib/tuya");

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
      const { triggerTuyaScene } = await import("../lib/tuya");
      const result = await triggerTuyaScene(input.homeId ?? 0, input.sceneId, cfg.accessId, cfg.accessSecret, cfg.region);
      if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.msg ?? "Falha ao disparar cena" });
      return { ok: true };
    }),

  /** Lê o estado enabled/disabled de uma automation Tuya (cena programada). */
  getAutomationEnabled: protectedProcedure
    .input(z.object({ automationId: z.string(), homeId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const cfg = await getTuyaConfig(ctx.user.id);
      const { getTuyaAutomationEnabled } = await import("../lib/tuya");
      const enabled = await getTuyaAutomationEnabled(input.automationId, cfg.accessId, cfg.accessSecret, cfg.region, input.homeId ?? 0);
      return { enabled };
    }),

  /** Habilita/desabilita uma automation Tuya (cena programada). */
  toggleAutomation: protectedProcedure
    .input(z.object({ automationId: z.string(), enabled: z.boolean(), homeId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const cfg = await getTuyaConfig(ctx.user.id);
      const { setTuyaAutomationEnabled } = await import("../lib/tuya");
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
      const { allocateTuyaCameraStream } = await import("../lib/tuya");
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
export const tentScenesRouter = router({
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

export const tentDevicesRouter = router({
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
          const { getTuyaDeviceSwitchState } = await import("../lib/tuya");
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
export const tentDisplayRouter = router({
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

