// ════════════════════════════════════════════════════════════════════════════════
// deviceRoutes.ts — endpoints HTTP REST para o ESP32 display (estufa)
//
// Diferente do tRPC (autenticado via JWT cookie), aqui o ESP32 usa header
// X-Device-Token contra a tabela `deviceTokens`. Cada token bate em uma
// tentId+groupId fixos. Rotas:
//
//   GET  /api/device/display/:tentId        → dados pra render no display
//   POST /api/device/readings               → grava pH/EC/PPFD da leitura ESP
//   POST /api/device/watering               → registra rega manual
//   GET  /api/device/tasks/:tentId          → tarefas pendentes
//   POST /api/device/task-complete          → toggle done
//   POST /api/device/scene/:slotIdx/trigger → trigger cena Tuya (slot 0-9 -> env TUYA_SCENE_X)
//   GET  /api/device/scenes                 → itens vinculados à estufa (cenas+devices)
//                                             novo formato: {items:[{type,id,name,position,iconHint?,state?,sceneType?,executionSec?}]}
//                                             legacy fallback: {scenes:[{id,name}]} se sem vínculos
//   POST /api/device/scene-by-id/:sceneId/trigger → trigger por sceneId real
//   POST /api/device/device-toggle          → liga/desliga device Tuya vinculado
//   POST /api/device/refresh-tuya/:tentId   → forca poll Tuya (cria dailyLog)
//   GET  /api/device/history/:tentId        → 24h/7d/30d history p/ chart
//   GET  /api/device/history-all/:tentId    → 4 metricas em uma chamada (sparklines)
//   POST /api/device/generate-token         → web user gera novo deviceToken (autenticado)
// ════════════════════════════════════════════════════════════════════════════════
import express from "express";
import crypto from "crypto";
import path from "path";
import fsp from "fs/promises";
import { createRequire } from "module";
import { getMysqlPool } from "../mysql-pool";
import type { TuyaRegion } from "../lib/tuya";

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

// ─── Cache do /api/device/scenes ────────────────────────────────────────────
// O ESP32 chama /scenes a cada ~30s pra atualizar a tela. Cada chamada
// consultava a Tuya AO VIVO (listTuyaScenesIoTCore + getTuyaDeviceSwitchState
// por device), o que estourava a cota da API Tuya (~15k chamadas/dia com 3
// devices → trial de 26k/mês morria em ~2 dias).
//
// Solução: cachear a resposta montada por tentId. O estado on/off de um device
// raramente muda em 90s, e quando o user dá toggle pelo app/display nós
// invalidamos o cache explicitamente (invalidateScenesCache) pra refletir na hora.
// Corta ~95% das chamadas Tuya mantendo a tela responsiva.
const SCENES_CACHE_TTL_MS = 90 * 1000;
const scenesCache = new Map<number, { at: number; payload: unknown }>();

/** Invalida o cache de /scenes de uma estufa — chamar após toggle/trigger. */
function invalidateScenesCache(tentId: number): void {
  scenesCache.delete(tentId);
}

// Sharp via createRequire pra resolver módulo nativo no bundle ESM
// (mesmo padrão de uploadRouter.ts). Usado pelo /plant/:id/photo pra
// resizar a foto de saúde antes de enviar pro ESP32 — se falhar, o
// endpoint devolve a imagem original sem resize.
const _require = createRequire(import.meta.url);
let sharpLib: typeof import("sharp") | null = null;
try {
  sharpLib = _require("sharp");
} catch {
  console.warn("[device] sharp indisponível — fotos vão sem resize");
}

/**
 * Valida o X-Device-Token e devolve dados pra contextualizar a request.
 *
 * `ownerUserId` é o user que criou o token (ADENDO 2 do HANDOFF). Usado
 * pelo /device-toggle pra pegar a config Tuya CERTA — antes pegava
 * "WHERE u.groupId=? LIMIT 1" e podia escolher um user com config errada.
 * NULL pra rows antigas (criadas antes da migration add-deviceTokens-ownerUserId).
 */
async function validateDeviceToken(req: express.Request): Promise<{ tentId: number; groupId: number; ownerUserId: number | null } | null> {
  const token = req.headers['x-device-token'] as string | undefined;
  if (!token) return null;
  try {
    const pool = getMysqlPool();
    const [rows]: any = await pool.execute(
      `SELECT tentId, groupId, ownerUserId FROM deviceTokens WHERE token = ? LIMIT 1`,
      [token]
    );
    if (rows.length === 0) return null;
    return {
      tentId: rows[0].tentId,
      groupId: rows[0].groupId,
      ownerUserId: rows[0].ownerUserId ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Busca a config Tuya pra um device-token. Estratégia:
 *   1. Se ownerUserId conhecido → config DESSE user (alinha com o caminho
 *      do app web `getTuyaConfig(ctx.user.id)` — fix do ADENDO 2).
 *   2. Senão (rows antigas pré-migration) → fallback pro LIMIT 1 antigo.
 *
 * Retorna null se nenhuma config for encontrada.
 *
 * IMPORTANTE: `accessSecret` no banco e' CRIPTOGRAFADO. Esta funcao decifra
 * (igual `getTuyaConfig` do routers.ts faz pro tRPC do app web). Sem decifrar,
 * a auth Tuya silenciosamente falha — controlTuyaDevice retorna success=false,
 * endpoint retorna 502, ESP reverte UI ("liga e apaga"). Bug descoberto em
 * prod apos 3 re-pairs nao resolverem.
 */
async function getTuyaCfgForDevice(device: { groupId: number; ownerUserId: number | null }): Promise<{ accessId: string; accessSecret: string; region: TuyaRegion; homeId: string | null; userId: number } | null> {
  const pool = getMysqlPool();
  let row: { accessId: string; accessSecret: string; region: TuyaRegion; homeId: string | null; userId: number } | null = null;

  if (device.ownerUserId) {
    const [rows]: any = await pool.execute(
      `SELECT accessId, accessSecret, region, homeId, userId FROM tuyaConfig WHERE userId = ? AND enabled = 1 LIMIT 1`,
      [device.ownerUserId]
    );
    if (rows.length > 0) row = rows[0];
    // Fallback: se owner não tem config (raro), tenta grupo
  }
  if (!row) {
    const [rows]: any = await pool.execute(
      `SELECT tc.accessId, tc.accessSecret, tc.region, tc.homeId, tc.userId
       FROM tuyaConfig tc INNER JOIN users u ON u.id = tc.userId
       WHERE tc.enabled = 1 AND u.groupId = ? LIMIT 1`,
      [device.groupId]
    );
    if (rows.length > 0) row = rows[0];
  }
  if (!row) return null;

  // Decifrar accessSecret (igual o tRPC faz). decryptAndMigrate tambem
  // re-criptografa com chave atual e atualiza row no DB se a chave mudou.
  try {
    const { decryptAndMigrate } = await import("../aiCrypto");
    const userId = row.userId;
    row.accessSecret = await decryptAndMigrate(row.accessSecret, async (newCipher) => {
      await pool.execute(`UPDATE tuyaConfig SET accessSecret = ? WHERE userId = ?`, [newCipher, userId]);
    });
  } catch (err: any) {
    console.error('[Device] getTuyaCfgForDevice decrypt failed:', err?.message);
    return null;
  }
  return { accessId: row.accessId, accessSecret: row.accessSecret, region: row.region, homeId: row.homeId ?? null, userId: row.userId };
}

/**
 * Resolve o homeId pra cenas Smart Home. Usa o salvo na config; se NULL,
 * auto-detecta via listTuyaHomes (1ª casa). Cacheado em memória por accessId
 * pra não chamar a Tuya toda vez. Retorna 0 se não conseguir (cai no fallback).
 */
const homeIdCache = new Map<string, { at: number; homeId: number }>();
const HOMEID_CACHE_TTL_MS = 30 * 60 * 1000; // 30min — casa raramente muda
async function resolveHomeId(cfg: { accessId: string; accessSecret: string; region: TuyaRegion; homeId: string | null }): Promise<number> {
  const saved = cfg.homeId ? parseInt(cfg.homeId) : 0;
  if (saved) return saved;
  // homeId NULL no DB → tenta auto-detectar (com cache)
  const cached = homeIdCache.get(cfg.accessId);
  if (cached && Date.now() - cached.at < HOMEID_CACHE_TTL_MS) return cached.homeId;
  try {
    const { listTuyaHomes } = await import('../lib/tuya');
    const homes = await listTuyaHomes(cfg.accessId, cfg.accessSecret, cfg.region);
    const first = homes?.[0]?.homeId ? Number(homes[0].homeId) : 0;
    if (first) homeIdCache.set(cfg.accessId, { at: Date.now(), homeId: first });
    return first;
  } catch (e: any) {
    console.warn('[Device] resolveHomeId falhou:', e?.message);
    return 0;
  }
}

function registerDeviceRoutes(app: express.Application) {
  const pool = getMysqlPool();

  // GET /api/device/display/:tentId — dados para o display ESP32
  app.get('/api/device/display/:tentId', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });
      const tentId = parseInt(req.params.tentId);
      if (device.tentId !== tentId) return res.status(403).json({ error: 'Token não autorizado para esta estufa' });

      // SELECT inclui category — pra estufas de MAINTENANCE/DRYING, o ciclo
      // VEGA/FLORA nao se aplica (display mostrava "Sem 1/8 VEGA" errado).
      const [tentRows]: any = await pool.execute(
        `SELECT name, category FROM tents WHERE id = ? LIMIT 1`, [tentId]);
      const tentName: string = tentRows[0]?.name ?? 'ESTUFA';
      const category: string = (tentRows[0]?.category ?? 'VEGA').toUpperCase();

      let fase: string;
      let semana = 0;
      let totalSem = 0;

      // Pra estufas que NAO sao VEGA/FLORA (= sem cycle do tipo plantando),
      // a fase vem da categoria da tent. Semana=0 indica "sem ciclo ativo"
      // (display pode ocultar "Sem X/Y" e so' mostrar a fase).
      if (category === 'MAINTENANCE') {
        fase = 'MAINTENANCE';
      } else if (category === 'DRYING') {
        fase = 'DRYING';
      } else {
        // VEGA / FLORA / outros: olha cycle ativo pra refinar fase + semana
        const [cycleRows]: any = await pool.execute(
          `SELECT c.startDate, c.floraStartDate, s.floraWeeks, s.vegaWeeks
           FROM cycles c
           LEFT JOIN strains s ON s.id = c.strainId
           WHERE c.tentId = ? AND c.status = 'ACTIVE'
           LIMIT 1`,
          [tentId]
        );

        fase = 'VEGA';
        semana = 1;
        totalSem = 8;
        if (cycleRows.length > 0) {
          const cy = cycleRows[0];
          const now = Date.now();
          if (cy.floraStartDate) {
            fase = 'FLORA';
            semana = Math.max(1, Math.ceil((now - new Date(cy.floraStartDate).getTime()) / 604800000));
            totalSem = cy.floraWeeks ?? 8;
          } else {
            fase = 'VEGA';
            semana = Math.max(1, Math.ceil((now - new Date(cy.startDate).getTime()) / 604800000));
            totalSem = cy.vegaWeeks ?? 4;
          }
        }
      }

      const [logRows]: any = await pool.execute(
        `SELECT tempC, rhPct, ph, ec, ppfd, logDate FROM dailyLogs WHERE tentId = ? ORDER BY logDate DESC LIMIT 1`,
        [tentId]
      );

      let tempC: number | null = null, rh: number | null = null, vpd: number | null = null;
      let ph: number | null = null, ec: number | null = null;
      let ppfd: number | null = null, lux: number | null = null;
      let dailyLogAgeSec: number | null = null;
      if (logRows.length > 0) {
        const l = logRows[0];
        tempC = l.tempC != null ? parseFloat(l.tempC) : null;
        rh    = l.rhPct != null ? parseFloat(l.rhPct) : null;
        ph    = l.ph   != null ? parseFloat(l.ph)   : null;
        ec    = l.ec   != null ? parseFloat(l.ec)   : null;
        ppfd  = l.ppfd != null ? parseInt(l.ppfd)   : null;
        // LUX ~ PPFD * 54 (aprox. pra LED cultivo full-spectrum)
        lux   = ppfd !== null ? Math.round(ppfd * 54) : null;
        if (tempC !== null && rh !== null) {
          const svp = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
          vpd = parseFloat((svp * (1 - rh / 100)).toFixed(2));
        }
        if (l.logDate) {
          dailyLogAgeSec = Math.floor((Date.now() - new Date(l.logDate).getTime()) / 1000);
        }
      }

      // Idade do sensor Tuya — leitura mais recente em sensorLatestReadings.
      // Display usa pra mostrar badge verde/amarelo/vermelho de freshness:
      // verde <120s, amarelo <900s (15min), vermelho >900s ou null.
      let sensorAgeSec: number | null = null;
      try {
        const [sensorRows]: any = await pool.execute(
          `SELECT MAX(slr.readAt) AS lastReadAt
           FROM sensorLatestReadings slr
           INNER JOIN tuyaSensorMappings tsm ON tsm.deviceId = slr.deviceId AND tsm.userId = slr.userId
           INNER JOIN users u ON u.id = tsm.userId
           WHERE tsm.tentId = ? AND tsm.enabled = 1 AND u.groupId = ?`,
          [tentId, device.groupId]
        );
        if (sensorRows[0]?.lastReadAt) {
          sensorAgeSec = Math.floor((Date.now() - new Date(sensorRows[0].lastReadAt).getTime()) / 1000);
        }
      } catch {
        // sem mapping Tuya — fica null, ESP mostra "sem sensor" / cinza
      }

      // Light schedule da fase atual — ESP usa pra dormir automaticamente
      // no periodo escuro (luz off da estufa). Defaults padrao de cultivo:
      //   VEGA / CLONING:        18/6 (luz 6h-24h, escuro 24h-6h)
      //   FLORA:                 12/12 (luz 6h-18h, escuro 18h-6h)
      //   MAINTENANCE:           24/0 (sempre on)
      //   DRYING / CURING:       0/24 (sempre off)
      // lightOnHour e lightOffHour sao 0-23 (hora do dia local).
      // lightOnHour == lightOffHour significa "sempre" (on ou off conforme
      // semantica) — ESP trata especial.
      let lightOnHour: number = 6;   // default veg-friendly
      let lightOffHour: number = 24; // 18/6
      const faseUpper = (fase || '').toUpperCase();
      if (faseUpper.startsWith('FLO')) {
        // FLORA / FLORACAO -> 12/12
        lightOnHour = 6;
        lightOffHour = 18;
      } else if (faseUpper.startsWith('MAN') || faseUpper.startsWith('MAINT')) {
        // MANUTENCAO -> 24h on
        lightOnHour = 0;
        lightOffHour = 0;  // (off==on) = sempre on
      } else if (faseUpper.startsWith('DRY') || faseUpper.startsWith('SEC') || faseUpper.startsWith('CUR')) {
        // DRYING / SECAGEM / CURING -> sempre off
        lightOnHour = 24; lightOffHour = 24;  // never on
      }

      res.json({
        tentName, tempC, rh, vpd, ph, ec, lux, ppfd, fase, semana, totalSem,
        // Idades em segundos pra ESP renderizar badge de freshness.
        sensorAgeSec,
        dailyLogAgeSec,
        // Horario da luz (timezone do tent — assume BRT-3 por enquanto).
        // ESP usa pra dormir automaticamente no periodo escuro.
        lightOnHour,
        lightOffHour,
      });
    } catch (err: any) {
      console.error('[Device] display error:', err?.message);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /api/device/readings — salva medição de pH/EC/PPFD do display
  app.post('/api/device/readings', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });
      const { tentId, tempC, rh, ph, ec, ppfd, turn = 'AM' } = req.body;
      if (!tentId || device.tentId !== tentId) return res.status(403).json({ error: 'Não autorizado' });
      const dateOnly = new Date(); dateOnly.setHours(0, 0, 0, 0);
      await pool.execute(
        `INSERT INTO dailyLogs (tentId, logDate, turn, tempC, rhPct, ph, ec, ppfd, source, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ESP32', NOW())
         ON DUPLICATE KEY UPDATE
            tempC = COALESCE(VALUES(tempC), tempC),
            rhPct = COALESCE(VALUES(rhPct), rhPct),
            ph    = COALESCE(VALUES(ph), ph),
            ec    = COALESCE(VALUES(ec), ec),
            ppfd  = COALESCE(VALUES(ppfd), ppfd),
            source = 'ESP32'`,
        [tentId, dateOnly, turn, tempC ?? null, rh ?? null, ph ?? null, ec ?? null, ppfd ?? null]
      );
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Device] readings error:', err?.message);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /api/device/stream/:tentId — Server-Sent Events com alertas em tempo real
  //
  // Substitui polling de /api/device/alerts pelo ESP. Server mantém conexão
  // aberta e flusha eventos quando ha' alerta novo. Combo killer com buzzer:
  // alerta critico chega no display em <5s + beep audivel.
  //
  // Protocolo:
  //   - Initial: ": connected <iso>\n\n" pra ack
  //   - Per alert: "event: alert\ndata: {...}\n\n"
  //   - Heartbeat: ": ping\n\n" a cada 25s (Cloudflare idle timeout ~100s)
  //   - Polling do alerts table a cada 5s — barato com index (status, tentId)
  //
  // Client (ESP) reconecta com ?since=<lastSeenId> pra evitar duplicar alertas
  // ja vistos em desconexao temporaria. Sem since, comeca do 0 (todos NEW).
  app.get('/api/device/stream/:tentId', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });
      const tentId = parseInt(req.params.tentId);
      if (device.tentId !== tentId) return res.status(403).json({ error: 'Não autorizado' });

      // SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      // Hint pra Nginx/Cloudflare nao bufferizar — flush imediato dos chunks
      res.setHeader('X-Accel-Buffering', 'no');
      (res as any).flushHeaders?.();

      // Send initial conn ack
      res.write(`: connected ${new Date().toISOString()}\n\n`);

      let lastSeenId = parseInt(String(req.query.since ?? '0')) || 0;
      let closed = false;

      const sendNewAlerts = async () => {
        if (closed) return;
        try {
          const [rows]: any = await pool.execute(
            `SELECT id, alertType, metric, message, value,
                    UNIX_TIMESTAMP(createdAt) AS t
             FROM alerts WHERE tentId = ? AND id > ? AND status = 'NEW'
             ORDER BY id ASC LIMIT 10`,
            [tentId, lastSeenId]
          );
          for (const r of rows as any[]) {
            if (closed) return;
            const payload = {
              id: r.id,
              type: r.alertType,
              metric: r.metric,
              message: r.message,
              value: r.value != null ? parseFloat(r.value) : null,
              t: Number(r.t),
            };
            res.write(`event: alert\ndata: ${JSON.stringify(payload)}\n\n`);
            lastSeenId = Math.max(lastSeenId, r.id);
          }
        } catch (e: any) {
          console.warn('[Device] stream poll error:', e?.message);
          // Nao mata a conexao — tenta de novo no proximo tick
        }
      };

      // Envia alertas pendentes na conexao
      await sendNewAlerts();

      // Poll DB a cada 5s pra novos alertas (mantido — alerts vem do alertChecker
      // cron que escreve direto no DB, sem passar pelo EventEmitter).
      const pollTimer = setInterval(() => { sendNewAlerts().catch(() => {}); }, 5000);
      // Heartbeat 25s — keepalive contra timeouts intermediarios (CF, LB).
      // Comment SSE "::" nao gera event no client, so' mantem conexao viva.
      const heartbeatTimer = setInterval(() => {
        if (closed) return;
        res.write(`: ping ${Date.now()}\n\n`);
      }, 25000);

      // Subscribe ao EventEmitter pra eventos PUSH em tempo real (event 'photo'
      // disparado pelo plantPhotos.upload quando user sobe foto nova). ESP
      // recebe e dispara prefetch pra deixar a foto cacheada antes do tap.
      const { deviceEvents } = await import('./deviceEvents');
      const unsubscribe = deviceEvents.onTent(tentId, (evt) => {
        if (closed) return;
        try {
          res.write(`event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`);
        } catch {
          // Connection drop — cleanup via close handler abaixo
        }
      });

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(pollTimer);
        clearInterval(heartbeatTimer);
        unsubscribe();
      };
      req.on('close', cleanup);
      req.on('error', cleanup);
      res.on('close', cleanup);
    } catch (err: any) {
      console.error('[Device] stream error:', err?.message);
      try { res.status(500).end(); } catch { /* ja respondido */ }
    }
  });

  // POST /api/device/alert-ack — marca alerta como visto (status NEW -> SEEN)
  // ESP chama quando user tocou no toast/banner do alerta no display.
  app.post('/api/device/alert-ack', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });
      const alertId = parseInt(req.body?.alertId ?? '0');
      if (!alertId) return res.status(400).json({ error: 'alertId obrigatório' });
      // Valida ownership via tentId
      const [r]: any = await pool.execute(
        `UPDATE alerts SET status = 'SEEN' WHERE id = ? AND tentId = ?`,
        [alertId, device.tentId]
      );
      if (r.affectedRows === 0) return res.status(404).json({ error: 'Alerta não encontrado' });
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Device] alert-ack error:', err?.message);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /api/device/quick-log — log rapido do ESP (FAB na aba Plantas)
  //
  // Endpoint multi-uso pra reduzir fricao do user fazer log via display em
  // vez de abrir o app web. Aceita tipos:
  //
  //   - water:   {type, liters}        -> dailyLogs.wateringVolume (ml)
  //   - feed:    {type, ph, ec}        -> dailyLogs.ph + ec
  //   - note:    {type, plantId, text} -> plantHealthLogs.notes (precisa plant)
  //
  // Todos os tipos respeitam multi-tenancy via device.groupId.
  // dailyLogs usa UPSERT por tentId+date+turn (preserva outros campos da hora).
  app.post('/api/device/quick-log', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });
      const type = String(req.body?.type ?? '').toLowerCase();
      const now = new Date();
      const turn = now.getHours() < 14 ? 'AM' : 'PM';
      const dateOnly = new Date(now);
      dateOnly.setHours(0, 0, 0, 0);

      if (type === 'water') {
        const liters = parseFloat(req.body?.liters ?? '0');
        if (!isFinite(liters) || liters <= 0 || liters > 100) {
          return res.status(400).json({ error: 'liters inválido (0-100)' });
        }
        const volumeMl = Math.round(liters * 1000);
        await pool.execute(
          `INSERT INTO dailyLogs (tentId, logDate, turn, wateringVolume, source, createdAt)
           VALUES (?, ?, ?, ?, 'ESP32', NOW())
           ON DUPLICATE KEY UPDATE wateringVolume=VALUES(wateringVolume), source='ESP32'`,
          [device.tentId, dateOnly, turn, volumeMl]
        );
        return res.json({ success: true, type: 'water', liters, turn });
      }

      if (type === 'feed') {
        const ph = parseFloat(req.body?.ph ?? '');
        const ec = parseFloat(req.body?.ec ?? '');
        if (!isFinite(ph) && !isFinite(ec)) {
          return res.status(400).json({ error: 'ph ou ec obrigatório' });
        }
        // Valida ranges sanos pra evitar typo destruidor
        if (isFinite(ph) && (ph < 0 || ph > 14)) return res.status(400).json({ error: 'ph fora do range' });
        if (isFinite(ec) && (ec < 0 || ec > 10)) return res.status(400).json({ error: 'ec fora do range' });
        await pool.execute(
          `INSERT INTO dailyLogs (tentId, logDate, turn, ph, ec, source, createdAt)
           VALUES (?, ?, ?, ?, ?, 'ESP32', NOW())
           ON DUPLICATE KEY UPDATE
             ph = COALESCE(VALUES(ph), ph),
             ec = COALESCE(VALUES(ec), ec),
             source = 'ESP32'`,
          [device.tentId, dateOnly, turn,
           isFinite(ph) ? ph : null,
           isFinite(ec) ? ec : null]
        );
        return res.json({ success: true, type: 'feed', ph, ec, turn });
      }

      if (type === 'note') {
        const plantId = parseInt(req.body?.plantId ?? '0');
        const text = String(req.body?.text ?? '').trim();
        if (!plantId || !text) {
          return res.status(400).json({ error: 'plantId + text obrigatórios' });
        }
        if (text.length > 500) {
          return res.status(400).json({ error: 'text muito longo (max 500)' });
        }
        // Valida ownership: plant tem que ser da tent + group do device
        const [pRows]: any = await pool.execute(
          `SELECT id FROM plants WHERE id = ? AND currentTentId = ? AND groupId = ? LIMIT 1`,
          [plantId, device.tentId, device.groupId]
        );
        if (pRows.length === 0) return res.status(404).json({ error: 'Planta não encontrada na estufa' });
        await pool.execute(
          `INSERT INTO plantHealthLogs (plantId, logDate, healthStatus, notes, createdAt)
           VALUES (?, NOW(), 'HEALTHY', ?, NOW())`,
          [plantId, text]
        );
        return res.json({ success: true, type: 'note', plantId });
      }

      return res.status(400).json({ error: 'type inválido (water/feed/note)' });
    } catch (err: any) {
      console.error('[Device] quick-log error:', err?.message);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /api/device/watering — registra rega
  app.post('/api/device/watering', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });
      const { tentId, litros } = req.body;
      if (!tentId || device.tentId !== tentId) return res.status(403).json({ error: 'Não autorizado' });
      const now = new Date(); const turn = now.getHours() < 14 ? 'AM' : 'PM';
      const dateOnly = new Date(now); dateOnly.setHours(0, 0, 0, 0);
      const volumeMl = Math.round((parseFloat(litros) || 0) * 1000);
      await pool.execute(
        `INSERT INTO dailyLogs (tentId, logDate, turn, wateringVolume, source, createdAt)
         VALUES (?, ?, ?, ?, 'ESP32', NOW())
         ON DUPLICATE KEY UPDATE wateringVolume=VALUES(wateringVolume), source='ESP32'`,
        [tentId, dateOnly, turn, volumeMl]
      );
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Device] watering error:', err?.message);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /api/device/tasks/:tentId — tarefas da semana atual do ciclo ativo
  //
  // Tarefas reais do app vem de `taskInstances` (tabela ligada a `cycles`),
  // NAO de `standaloneTasks`. Cada ciclo tem fase (CLONING/VEGA/FLORA/
  // MAINTENANCE/DRYING) + week number, e templates em `taskTemplates`
  // sao materializados como `taskInstances` por semana.
  //
  // Endpoint reproduz a logica do getCurrentWeekTasks do tRPC:
  //  1. Acha ciclo ACTIVE da estufa
  //  2. Calcula fase + weekNumber baseado em tent.category + cycle dates
  //  3. Lazy-materializa instances pra semana atual via INSERT IGNORE
  //  4. Retorna instances (id + title + isDone)
  //
  // Tambem inclui standaloneTasks tagged pra estufa ou sem tent (lembretes).
  app.get('/api/device/tasks/:tentId', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });
      const tentId = parseInt(req.params.tentId);
      if (device.tentId !== tentId) return res.status(403).json({ error: 'Não autorizado' });

      // range=current (default) -> semana atual so'
      // range=7d                -> semana atual + proxima + atrasadas (calendar view)
      const range = String(req.query.range ?? 'current');

      // 1) Busca estufa + ciclo ativo
      const [tentRows]: any = await pool.execute(
        `SELECT id, category FROM tents WHERE id = ? AND groupId = ? LIMIT 1`,
        [tentId, device.groupId]
      );
      if (tentRows.length === 0) return res.status(404).json({ error: 'Estufa nao encontrada' });
      const tentCategory: string = tentRows[0].category;

      const [cycleRows]: any = await pool.execute(
        `SELECT id, startDate, floraStartDate FROM cycles
         WHERE tentId = ? AND status = 'ACTIVE'
         ORDER BY id DESC LIMIT 1`,
        [tentId]
      );

      // Result item agora inclui dueDate (epoch sec) pra ESP agrupar por dia.
      type TaskOut = { id: number; texto: string; feito: boolean; dueDate?: number; overdue?: boolean };
      const results: TaskOut[] = [];

      // 2) Se ha ciclo ativo, calcula fase + week + materializa instances
      if (cycleRows.length > 0) {
        const cycle = cycleRows[0];
        const now = new Date();
        const startDate = new Date(cycle.startDate);
        const floraStartDate = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;

        let phase: string;
        let context: string;
        const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

        // Calcula weekNumber pra fase atual e proxima (range=7d)
        let currentWeek: number | null = null;
        const calcWeek = (refDate: Date) => Math.max(1, Math.floor((now.getTime() - refDate.getTime()) / WEEK_MS) + 1);

        if (tentCategory === 'MAINTENANCE') {
          phase = 'MAINTENANCE'; context = 'TENT_A';
        } else if (tentCategory === 'DRYING') {
          phase = 'DRYING'; context = 'TENT_BC';
        } else if (tentCategory === 'FLORA') {
          phase = 'FLORA'; context = 'TENT_BC';
          currentWeek = calcWeek(floraStartDate ?? startDate);
        } else if (tentCategory === 'VEGA') {
          phase = 'VEGA'; context = 'TENT_BC';
          currentWeek = calcWeek(startDate);
        } else {
          phase = 'MAINTENANCE'; context = 'TENT_A';
        }

        // Lista de semanas pra incluir: [current] (range=current) ou [current, next] (range=7d)
        const weeksToInclude = (range === '7d' && currentWeek != null)
          ? [currentWeek, currentWeek + 1]
          : [currentWeek];

        // Start of current week (domingo 00:00)
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        for (let wi = 0; wi < weeksToInclude.length; wi++) {
          const wNumber = weeksToInclude[wi];
          const wDate = new Date(startOfWeek.getTime() + wi * WEEK_MS);

          // Busca templates da fase/semana
          const templateQuery = wNumber == null
            ? `SELECT id, title FROM taskTemplates WHERE context = ? AND phase = ? AND (groupId IS NULL OR groupId = ?)`
            : `SELECT id, title FROM taskTemplates WHERE context = ? AND phase = ? AND weekNumber = ? AND (groupId IS NULL OR groupId = ?)`;
          const templateParams = wNumber == null
            ? [context, phase, device.groupId]
            : [context, phase, wNumber, device.groupId];
          const [templates]: any = await pool.execute(templateQuery, templateParams);

          // Lazy-materialize na semana especifica
          for (const t of templates as any[]) {
            await pool.execute(
              `INSERT IGNORE INTO taskInstances (tentId, taskTemplateId, occurrenceDate, isDone)
               VALUES (?, ?, ?, 0)`,
              [tentId, t.id, wDate]
            );
          }

          // Le instances dessa semana
          const [instances]: any = await pool.execute(
            `SELECT i.id, tt.title, i.isDone, UNIX_TIMESTAMP(i.occurrenceDate) AS dueDate
             FROM taskInstances i
             INNER JOIN taskTemplates tt ON tt.id = i.taskTemplateId
             WHERE i.tentId = ? AND i.occurrenceDate = ?
             ORDER BY i.isDone ASC, tt.title ASC`,
            [tentId, wDate]
          );
          for (const r of instances as any[]) {
            results.push({
              id: r.id,
              texto: r.title,
              feito: !!r.isDone,
              dueDate: Number(r.dueDate),
            });
          }
        }

        // range=7d tambem inclui tarefas ATRASADAS (occurrenceDate < startOfWeek
        // E ainda nao feitas). Limita a 5 mais recentes pra nao explodir payload.
        if (range === '7d') {
          const [overdue]: any = await pool.execute(
            `SELECT i.id, tt.title, UNIX_TIMESTAMP(i.occurrenceDate) AS dueDate
             FROM taskInstances i
             INNER JOIN taskTemplates tt ON tt.id = i.taskTemplateId
             WHERE i.tentId = ? AND i.occurrenceDate < ? AND i.isDone = 0
             ORDER BY i.occurrenceDate DESC
             LIMIT 5`,
            [tentId, startOfWeek]
          );
          for (const r of overdue as any[]) {
            results.push({
              id: r.id,
              texto: r.title,
              feito: false,
              dueDate: Number(r.dueDate),
              overdue: true,
            });
          }
        }
      }

      // 3) Tambem inclui standaloneTasks (lembretes) — id negativo pra
      // diferenciar de taskInstance no toggle (-id == standaloneId)
      // LIMIT inlined: mysql2 pool.execute() com prepared statements tem
      // bug conhecido em LIMIT ? — causava HTTP 500 quando range=7d.
      // Como standaloneLimit e' computed (nao user input), inlineamos safe.
      const standaloneLimit = range === '7d' ? 10 : 5;
      const [standalone]: any = await pool.execute(
        `SELECT t.id, t.title, t.isDone, UNIX_TIMESTAMP(t.dueDate) AS dueDate
         FROM standaloneTasks t
         INNER JOIN users u ON u.id = t.userId
         WHERE u.groupId = ?
           AND (t.tentId = ? OR t.tentId IS NULL)
         ORDER BY t.isDone ASC, t.createdAt DESC
         LIMIT ${standaloneLimit}`,
        [device.groupId, tentId]
      );
      for (const r of standalone as any[]) {
        results.push({
          id: -r.id,
          texto: r.title,
          feito: !!r.isDone,
          dueDate: r.dueDate ? Number(r.dueDate) : undefined,
        });
      }

      // range=current limita a 10 (display compacto), range=7d limita a 25 (calendar)
      const cap = range === '7d' ? 25 : 10;
      res.json(results.slice(0, cap));
    } catch (err: any) {
      // Stack completo pra debug — sem isso so' aparecia err.message generico
      console.error('[Device] tasks error:', err?.message, err?.stack);
      res.status(500).json({ error: 'Erro interno', detail: err?.message });
    }
  });

  // POST /api/device/task-complete — alterna estado de conclusão
  //
  // taskId:
  //   - Positivo: id de taskInstances (tarefa de ciclo)
  //   - Negativo: id de standaloneTasks (lembrete; usa abs)
  // Multi-tenancy via groupId em ambos os casos.
  app.post('/api/device/task-complete', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });
      const rawId = req.body?.taskId;
      if (typeof rawId !== 'number' || rawId === 0) {
        return res.status(400).json({ error: 'taskId obrigatório' });
      }

      if (rawId > 0) {
        // taskInstances: valida via tent.groupId
        const [rows]: any = await pool.execute(
          `SELECT i.id, i.isDone
           FROM taskInstances i
           INNER JOIN tents te ON te.id = i.tentId
           WHERE i.id = ? AND te.groupId = ? AND i.tentId = ?`,
          [rawId, device.groupId, device.tentId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada' });
        const newState = rows[0].isDone ? 0 : 1;
        await pool.execute(
          `UPDATE taskInstances SET isDone = ?, completedAt = ? WHERE id = ?`,
          [newState, newState ? new Date() : null, rawId]
        );
        return res.json({ success: true, feito: !!newState });
      } else {
        // standaloneTasks: rawId negativo → usa abs
        const id = -rawId;
        const [rows]: any = await pool.execute(
          `SELECT t.id, t.isDone
           FROM standaloneTasks t
           INNER JOIN users u ON u.id = t.userId
           WHERE t.id = ?
             AND u.groupId = ?
             AND (t.tentId = ? OR t.tentId IS NULL)`,
          [id, device.groupId, device.tentId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada' });
        const newState = rows[0].isDone ? 0 : 1;
        await pool.execute(
          `UPDATE standaloneTasks SET isDone = ?, completedAt = ? WHERE id = ?`,
          [newState, newState ? new Date() : null, id]
        );
        return res.json({ success: true, feito: !!newState });
      }
    } catch (err: any) {
      console.error('[Device] task-complete error:', err?.message);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /api/device/scene/:slotIdx/trigger — dispara cena Tuya pre-mapeada
  // Slots 0/1/2 mapeiam p/ env vars TUYA_SCENE_{0,1,2} = '<sceneId>' OU
  // '<homeId>:<sceneId>' (homeId opcional). Usa a config Tuya do grupo do
  // device. ESP sem precisar conhecer IDs reais — so' sabe qual slot esta
  // tocando ('irrigar', 'luz-off', 'custom').
  app.post('/api/device/scene/:slotIdx/trigger', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });
      const slotIdx = parseInt(req.params.slotIdx);
      if (isNaN(slotIdx) || slotIdx < 0 || slotIdx > 9) {
        return res.status(400).json({ error: 'slotIdx fora do range (0-9)' });
      }

      const envKey = `TUYA_SCENE_${slotIdx}`;
      const cfgRaw = process.env[envKey];
      if (!cfgRaw) {
        return res.status(404).json({ error: `${envKey} nao configurado no servidor` });
      }
      // Formato: 'sceneId' ou 'homeId:sceneId' (homeId obrigatorio em Smart Home Home)
      const [maybeHomeId, maybeSceneId] = cfgRaw.includes(':')
        ? cfgRaw.split(':', 2)
        : ['0', cfgRaw];
      const homeId = parseInt(maybeHomeId) || 0;
      const sceneId = (maybeSceneId || '').trim();
      if (!sceneId) return res.status(500).json({ error: `${envKey} formato invalido` });

      // Busca config Tuya — prefere config do owner do token (helper)
      const cfg = await getTuyaCfgForDevice(device);
      if (!cfg) {
        return res.status(404).json({ error: 'Nenhuma config Tuya ativa pro grupo' });
      }

      const { triggerTuyaScene } = await import('../lib/tuya');
      const result = await triggerTuyaScene(homeId, sceneId, cfg.accessId, cfg.accessSecret, cfg.region);
      console.log(`[Device] scene slot=${slotIdx} -> ${result.success ? 'OK' : 'FAIL'} (${result.msg ?? ''})`);
      if (!result.success) return res.status(502).json({ error: result.msg ?? 'Tuya retornou falha' });
      // Cena pode ligar/desligar devices → invalida cache pro display refletir
      invalidateScenesCache(device.tentId);
      res.json({ success: true, slotIdx });
    } catch (err: any) {
      console.error('[Device] scene trigger error:', err?.message);
      res.status(500).json({ error: err?.message ?? 'Erro ao disparar cena' });
    }
  });

  // GET /api/device/scenes — itens (cenas + dispositivos) vinculados à estufa
  // deste display. Filtra por tentScenes/tentDevices WHERE tentId = device.tentId.
  // Max 6 itens (grid 2x3). Devices têm `state` com switch on/off atual (lido
  // em paralelo da Tuya). Itens ordenados por position.
  //
  // BACKWARD COMPAT: se NÃO houver itens vinculados na nova tabela mas o user
  // tiver cenas Tuya manuais, retorna formato antigo `{scenes:[...]}` pra não
  // quebrar firmwares antigos. Quando user vincular ao menos 1 item via app
  // web, passa pro formato novo `{items:[...]}`.
  app.get('/api/device/scenes', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });

      // Cache hit? Evita martelar a Tuya a cada poll do ESP32 (~30s).
      // TTL curto (90s) + invalidação no toggle mantém a tela responsiva.
      const cached = scenesCache.get(device.tentId);
      if (cached && Date.now() - cached.at < SCENES_CACHE_TTL_MS) {
        return res.json(cached.payload);
      }

      // 1) Carrega vínculos da estufa.
      // SELECT inclui iconHint + type + executionSec pra cenas. ESP usa pra:
      //   - iconHint: mapear pro icone correto (light, pump, schedule, etc)
      //   - type: badge de "agendado" se automation
      //   - executionSec: duração real da cena pra spinner "executando"
      //     (antes era 5s fixo; agora respeita rega manual de 10s, 30s, 1min, etc)
      const [tentSceneRows]: any = await pool.execute(
        `SELECT sceneId, name, position, iconHint, type, executionSec FROM tentScenes WHERE tentId = ? ORDER BY position ASC LIMIT 6`,
        [device.tentId]
      );
      const [tentDeviceRows]: any = await pool.execute(
        `SELECT deviceId, name, position, iconHint FROM tentDevices WHERE tentId = ? ORDER BY position ASC LIMIT 6`,
        [device.tentId]
      );

      // 2) Sem vínculos? Cai no comportamento legado (cenas do grupo inteiro)
      if (tentSceneRows.length === 0 && tentDeviceRows.length === 0) {
        const cfg = await getTuyaCfgForDevice(device);
        if (!cfg) return res.json({ scenes: [] });

        // Smart Home (/v1.0/homes/{homeId}/scenes) PRIMEIRO — serviço permanente.
        // IoT Core (/v2.0/cloud/scene/rule) é DEPRECATED pela Tuya (só trial),
        // fica só como último recurso.
        let scenes: Array<{ id: string; name: string }> = [];
        const homeId = await resolveHomeId(cfg);
        if (homeId) {
          try {
            const { listTuyaScenes } = await import('../lib/tuya');
            const sh = await listTuyaScenes(homeId, cfg.accessId, cfg.accessSecret, cfg.region);
            scenes = sh.slice(0, 6).map(s => ({ id: s.sceneId, name: s.name }));
            console.log(`[Device] /scenes (SmartHome) home=${homeId} -> ${scenes.length} cenas`);
          } catch (e: any) {
            console.warn('[Device] /scenes SmartHome:', e?.message);
          }
        }
        // Fallback IoT Core deprecated (só se Smart Home não trouxe nada)
        if (scenes.length === 0) {
          try {
            const { listTuyaScenesIoTCore } = await import('../lib/tuya');
            const allScenes = await listTuyaScenesIoTCore(cfg.accessId, cfg.accessSecret, cfg.region);
            scenes = allScenes.filter(s => s.type === 'scene').slice(0, 6).map(s => ({ id: s.sceneId, name: s.name }));
            console.log(`[Device] /scenes (IoTCore fallback) group=${device.groupId} -> ${scenes.length} cenas`);
          } catch (e: any) {
            console.warn('[Device] /scenes IoTCore fallback:', e?.message);
          }
        }
        const legacyPayload = { scenes };
        scenesCache.set(device.tentId, { at: Date.now(), payload: legacyPayload });
        return res.json(legacyPayload);
      }

      // 3) Tem vínculos: monta itens, busca state dos devices em paralelo
      const items: Array<any> = [];
      for (const r of tentSceneRows) {
        items.push({
          type: 'scene',
          id: r.sceneId as string,
          name: r.name as string,
          position: r.position as number,
          iconHint: r.iconHint as string | null,
          sceneType: (r.type === 'automation' ? 'automation' : 'scene') as 'scene' | 'automation',
          // Duração real em segundos. ESP usa pra spinner/animação até
          // a duração real terminar (substitui o 5s default).
          executionSec: (r.executionSec as number | null) ?? 5,
        });
      }

      let cfg: any = null;
      if (tentDeviceRows.length > 0) {
        cfg = await getTuyaCfgForDevice(device);
      }

      // Lê estado de TODOS os devices em paralelo (sem state se cfg ausente).
      // debug=true → cada call inclui debugDps (lista de DPs que o device expôs)
      // pra ajudar a diagnosticar quando switchOn=null.
      const { getTuyaDeviceSwitchState } = await import('../lib/tuya');
      const deviceStates = await Promise.allSettled(
        tentDeviceRows.map((r: any) =>
          cfg
            ? getTuyaDeviceSwitchState(r.deviceId, cfg.accessId, cfg.accessSecret, cfg.region, { debug: true })
            : Promise.resolve({ online: false, switchOn: null, switchCode: null, debugDps: [] as string[] })
        )
      );

      tentDeviceRows.forEach((r: any, idx: number) => {
        const stateRes = deviceStates[idx];
        const ok = stateRes.status === 'fulfilled';
        const state = ok ? stateRes.value : { online: false, switchOn: null, switchCode: null, debugDps: [] };
        const errMsg = ok ? null : (stateRes.reason instanceof Error ? stateRes.reason.message : String(stateRes.reason));
        // Log detalhado por device pra diagnosticar state=null em prod
        console.log(
          `[Device] /scenes device=${r.deviceId} name="${r.name}" ` +
          `online=${state.online} switchOn=${state.switchOn} ` +
          `switchCode=${state.switchCode ?? '(none)'} ` +
          `dps=[${(state as any).debugDps?.join(',') ?? ''}] ` +
          `${errMsg ? `error="${errMsg}"` : ''}`
        );
        items.push({
          type: 'device',
          id: r.deviceId as string,
          name: r.name as string,
          position: r.position as number,
          iconHint: r.iconHint as string | null,
          state: state.switchOn,    // boolean | null
          online: state.online,
        });
      });

      // Ordena por position (cenas e devices misturados)
      items.sort((a, b) => a.position - b.position);

      // Limita a 6 totais (caso user tenha cadastrado mais que isso)
      const limited = items.slice(0, 6);

      console.log(`[Device] /scenes tent=${device.tentId} -> ${limited.length} items (${tentSceneRows.length}s+${tentDeviceRows.length}d)`);
      const itemsPayload = { items: limited };
      scenesCache.set(device.tentId, { at: Date.now(), payload: itemsPayload });
      res.json(itemsPayload);
    } catch (err: any) {
      console.error('[Device] scenes list error:', err?.message);
      res.status(500).json({ error: err?.message ?? 'Erro ao listar itens' });
    }
  });

  // GET /api/device/diag-scenes — DIAGNÓSTICO TEMPORÁRIO (autenticado via cookie JWT).
  // Testa TODOS os caminhos de cena Tuya com as credenciais do user logado e
  // devolve a resposta crua no navegador. Pra entender por que cenas não listam.
  // REMOVER após o diagnóstico.
  app.get('/api/device/diag-scenes', async (req, res) => {
    try {
      const { authenticateRequest } = await import('./auth');
      const user = await authenticateRequest(req);
      if (!user) return res.status(401).json({ error: 'Não autenticado — faça login no app primeiro' });

      // Pega config Tuya do user
      const [cfgRows]: any = await pool.execute(
        `SELECT accessId, accessSecret, region, homeId FROM tuyaConfig WHERE userId = ? AND enabled = 1 LIMIT 1`,
        [user.id]
      );
      if (cfgRows.length === 0) return res.json({ error: 'Sem config Tuya ativa pra este user', userId: user.id });
      const cfg = cfgRows[0];

      const { decryptAndMigrate } = await import('../aiCrypto');
      const secret = await decryptAndMigrate(cfg.accessSecret, async (n: string) => {
        await pool.execute(`UPDATE tuyaConfig SET accessSecret = ? WHERE userId = ?`, [n, user.id]);
      });

      const out: any = { userId: user.id, region: cfg.region, homeIdSalvo: cfg.homeId };
      const tuya = await import('../lib/tuya');

      // 1) Casas reais
      try {
        out.casasReais = await tuya.listTuyaHomes(cfg.accessId, secret, cfg.region);
      } catch (e: any) { out.casasReais_ERRO = e?.message; }

      // 2) Smart Home scenes por cada home encontrada
      out.smartHomeScenes = {};
      const homeIds = [
        ...(cfg.homeId ? [Number(cfg.homeId)] : []),
        ...((out.casasReais ?? []).map((h: any) => Number(h.homeId))),
      ].filter((v, i, a) => v && a.indexOf(v) === i);
      for (const hid of homeIds) {
        try {
          const sc = await tuya.listTuyaScenes(hid, cfg.accessId, secret, cfg.region);
          out.smartHomeScenes[hid] = { count: sc.length, scenes: sc };
        } catch (e: any) { out.smartHomeScenes[hid] = { ERRO: e?.message }; }
      }

      // 3) IoT Core (deprecated) — pra comparar
      try {
        const iot = await tuya.listTuyaScenesIoTCore(cfg.accessId, secret, cfg.region);
        out.iotCoreScenes = { count: iot.length, scenes: iot };
      } catch (e: any) { out.iotCoreScenes_ERRO = e?.message; }

      // 4) RAW: testa cada versão de endpoint diretamente pra ver QUAL funciona
      const hid = cfg.homeId ?? '41147406';
      out.rawTest = await tuya.diagRawPaths([
        `/v1.1/users/${user.id}/homes?page_no=1&page_size=20`,  // placeholder — uid real abaixo
        `/v1.0/homes/${hid}/scenes?page_no=1&page_size=50`,
        `/v1.1/homes/${hid}/scenes?page_no=1&page_size=50`,
        `/v2.0/homes/${hid}/scenes?page_no=1&page_size=50`,
        `/v1.1/homes/${hid}/automations?page_no=1&page_size=50`,
        `/v2.0/cloud/scene/rule?space_id=${hid}&page_size=50`,
      ], cfg.accessId, secret, cfg.region);

      res.json(out);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Erro no diag', stack: err?.stack });
    }
  });

  // POST /api/device/device-toggle — liga/desliga um dispositivo Tuya vinculado
  // à estufa deste display. Body: {deviceId, state: boolean}.
  // Valida que o deviceId pertence à tentId do device antes de comandar.
  app.post('/api/device/device-toggle', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });

      const deviceId = String(req.body?.deviceId ?? '').trim();
      const desired = req.body?.state;
      if (!deviceId || typeof desired !== 'boolean') {
        return res.status(400).json({ error: 'deviceId e state (boolean) obrigatórios' });
      }

      // Valida que esse device está vinculado à estufa do display E pega o
      // switchCode salvo (HANDOFF_CENAS_ESTUFA.md ADENDO 2 — bug fix). Antes
      // descobríamos on-the-fly via getTuyaDeviceSwitchState, que pegava o
      // primeiro DP de SWITCH_CODES. Pra LED 65W podia pegar 'switch_1' (que
      // Tuya aceita silenciosamente sem fazer nada) em vez de 'switch_led'.
      // Agora salvamos no add() e usamos direto.
      const [bindRows]: any = await pool.execute(
        `SELECT id, switchCode FROM tentDevices WHERE tentId = ? AND deviceId = ? LIMIT 1`,
        [device.tentId, deviceId]
      );
      if (bindRows.length === 0) {
        return res.status(403).json({ error: 'Device não vinculado a esta estufa' });
      }
      const bindRow = bindRows[0];

      // Busca config Tuya — ADENDO 2 do HANDOFF: usa helper que prefere a
      // config DO USER que criou o token (alinha com getTuyaConfig(ctx.user.id)
      // do app web). Fallback pra LIMIT 1 do grupo se ownerUserId NULL.
      const cfg = await getTuyaCfgForDevice(device);
      if (!cfg) {
        return res.status(404).json({
          error: device.ownerUserId
            ? 'Config Tuya do dono do display não encontrada (configure SmartLife na conta dele)'
            : 'Nenhuma config Tuya ativa pro grupo',
        });
      }
      console.log(`[Device] device-toggle using cfg from ${device.ownerUserId ? `ownerUserId=${device.ownerUserId}` : `groupId=${device.groupId} (LIMIT 1, pré-fix)`}`);

      // Resolve switchCode: 1) usa o salvo se houver, 2) descobre + persiste se NULL
      // (rows criadas antes desse fix, ou casos onde a discovery falhou no add)
      const { getTuyaDeviceSwitchState, controlTuyaDevice } = await import('../lib/tuya');
      let switchCode: string | null = bindRow.switchCode;
      if (!switchCode) {
        const cur = await getTuyaDeviceSwitchState(deviceId, cfg.accessId, cfg.accessSecret, cfg.region, { debug: true });
        switchCode = cur.switchCode;
        if (switchCode) {
          // Persiste pra próximas vezes — uma única descoberta cura todas as rows antigas
          await pool.execute(`UPDATE tentDevices SET switchCode = ? WHERE id = ?`, [switchCode, bindRow.id]);
          console.log(`[Device] device-toggle backfilled switchCode=${switchCode} for device=${deviceId} (dps=[${(cur as any).debugDps?.join(',') ?? ''}])`);
        }
      }
      if (!switchCode) {
        return res.status(422).json({ error: 'Dispositivo não expõe switch (não controlável)' });
      }

      const r = await controlTuyaDevice(deviceId, switchCode, desired, cfg.accessId, cfg.accessSecret, cfg.region);
      console.log(`[Device] device-toggle device=${deviceId} switchCode=${switchCode} -> ${desired} (${r.success ? 'OK' : 'FAIL'}: ${r.msg ?? ''})`);
      if (!r.success) return res.status(502).json({ error: r.msg ?? 'Tuya retornou falha' });

      // NÃO re-consultamos a Tuya aqui — economiza 1 chamada por toggle.
      // O ESP é optimistic (mostra o estado desejado na hora) e o próximo poll
      // de /scenes (cache invalidado abaixo) confirma o estado REAL em ~30s,
      // revertendo se a Tuya não executou. A re-consulta imediata de 500ms era
      // desperdiçada: o firmware ignorava o resultado de qualquer forma.
      invalidateScenesCache(device.tentId);

      res.json({ success: true, deviceId, state: desired });
    } catch (err: any) {
      console.error('[Device] device-toggle error:', err?.message);
      res.status(500).json({ error: err?.message ?? 'Erro ao alternar device' });
    }
  });

  // POST /api/device/scene-by-id/:sceneId/trigger — dispara cena Tuya por
  // ID real (sceneId vem de GET /api/device/scenes). Diferente do
  // /scene/:slotIdx/trigger que usa env vars TUYA_SCENE_X.
  app.post('/api/device/scene-by-id/:sceneId/trigger', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });
      const sceneId = String(req.params.sceneId ?? '').trim();
      if (!sceneId) return res.status(400).json({ error: 'sceneId vazio' });

      // Prefere config do owner do token (helper)
      const cfg = await getTuyaCfgForDevice(device);
      if (!cfg) {
        return res.status(404).json({ error: 'Nenhuma config Tuya ativa pro grupo' });
      }
      const homeId = parseInt(process.env.TUYA_HOME_ID ?? '0') || 0;

      const { triggerTuyaScene } = await import('../lib/tuya');
      const result = await triggerTuyaScene(homeId, sceneId, cfg.accessId, cfg.accessSecret, cfg.region);
      console.log(`[Device] scene-by-id ${sceneId} -> ${result.success ? 'OK' : 'FAIL'} (${result.msg ?? ''})`);
      if (!result.success) return res.status(502).json({ error: result.msg ?? 'Tuya retornou falha' });
      // Cena pode ligar/desligar devices → invalida cache pro display refletir
      invalidateScenesCache(device.tentId);
      res.json({ success: true, sceneId });
    } catch (err: any) {
      console.error('[Device] scene-by-id trigger error:', err?.message);
      res.status(500).json({ error: err?.message ?? 'Erro ao disparar cena' });
    }
  });

  // GET /api/device/plants/:tentId — lista plantas ATIVAS da estufa pro display
  //
  // Pro menu "Plantas" no ESP. Retorna metadata leve (sem foto ainda) +
  // healthStatus mais recente. ESP usa essa lista pra renderizar o menu;
  // quando user toca uma planta, vai em /plant/:id/photo pra baixar o JPEG.
  //
  // Resposta:
  //   {
  //     plants: [
  //       {
  //         id, name, code, stage,
  //         healthStatus: 'HEALTHY'|'STRESSED'|'SICK'|'RECOVERING'|null,
  //         lastPhotoDate: ISO string | null,
  //         hasPhoto: boolean
  //       }, ...
  //     ]
  //   }
  app.get('/api/device/plants/:tentId', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });

      const tentId = parseInt(req.params.tentId);
      if (!Number.isInteger(tentId) || tentId <= 0) {
        return res.status(400).json({ error: 'tentId inválido' });
      }
      // Garante que o token bate com a estufa pedida (mesmo padrão dos
      // outros endpoints — evita um device-token de outra estufa listar
      // plantas alheias).
      if (device.tentId !== tentId) {
        return res.status(403).json({ error: 'Token não autoriza essa estufa' });
      }

      // Subselects correlacionados: 1 por planta. Como cada estufa tem
      // poucas plantas (<30), o overhead é desprezível e o índice
      // (plantHealthLogs.plantIdx) cobre as buscas.
      //
      // IMPORTANTE: usamos `photoUrl IS NOT NULL` (não `photoKey`). O
      // caminho moderno do plantHealth.create salva só `photoUrl` (URL
      // tipo `/uploads/plant-photos/...`) e deixa `photoKey` NULL — só o
      // fallback legado base64 preenchia photoKey. Filtrar por photoKey
      // dava falso negativo pra todas as fotos novas.
      const [rows]: any = await pool.execute(
        `SELECT
           p.id, p.name, p.code, p.plantStage AS stage,
           s.name AS strainName, s.vegaWeeks, s.floraWeeks, s.origin AS strainOrigin,
           (SELECT healthStatus FROM plantHealthLogs WHERE plantId = p.id ORDER BY id DESC LIMIT 1) AS healthStatus,
           (SELECT logDate FROM plantHealthLogs WHERE plantId = p.id AND photoUrl IS NOT NULL ORDER BY id DESC LIMIT 1) AS lastPhotoDate
         FROM plants p
         LEFT JOIN strains s ON s.id = p.strainId
         WHERE p.currentTentId = ?
           AND p.status = 'ACTIVE'
           AND p.deletedAt IS NULL
         ORDER BY p.name ASC`,
        [tentId]
      );

      const plants = (rows as any[]).map(r => ({
        id: r.id as number,
        name: r.name as string,
        code: (r.code as string | null) ?? null,
        stage: r.stage as 'CLONE' | 'SEEDLING' | 'PLANT',
        healthStatus: (r.healthStatus as string | null) ?? null,
        lastPhotoDate: r.lastPhotoDate ? new Date(r.lastPhotoDate).toISOString() : null,
        hasPhoto: r.lastPhotoDate != null,
        // Strain info — usado pelo display no detalhe da planta pra
        // mostrar nome + semanas esperadas + tipo. Campos null quando
        // strain foi deletada (mas plant.strainId nao zera por integrity).
        strain: r.strainName ? {
          name: r.strainName as string,
          vegaWeeks: r.vegaWeeks as number,
          floraWeeks: r.floraWeeks as number,
          origin: (r.strainOrigin as string | null) ?? null,
        } : null,
      }));

      res.json({ plants });
    } catch (err: any) {
      console.error('[Device] plants list error:', err?.message);
      res.status(500).json({ error: err?.message ?? 'Erro ao listar plantas' });
    }
  });

  // GET /api/device/plant/:plantId/photos — lista metadata das fotos da planta
  //
  // Pro Photo Timeline no ESP: display pega a lista (~10 fotos mais recentes),
  // depois usa /plant/:id/photo?photoId=X pra baixar foto especifica ao
  // navegar com setas ← →. Lista e' barata (so' metadata, sem bytes).
  app.get('/api/device/plant/:plantId/photos', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });
      const plantId = parseInt(req.params.plantId);
      if (!Number.isInteger(plantId) || plantId <= 0) {
        return res.status(400).json({ error: 'plantId inválido' });
      }
      // Multi-tenancy: planta tem que pertencer ao grupo do device
      const [pRows]: any = await pool.execute(
        `SELECT groupId FROM plants WHERE id = ? LIMIT 1`,
        [plantId]
      );
      if (pRows.length === 0) return res.status(404).json({ error: 'Planta não encontrada' });
      if (pRows[0].groupId !== device.groupId) {
        return res.status(403).json({ error: 'Planta de outro grupo' });
      }
      const [rows]: any = await pool.execute(
        `SELECT id, healthStatus, UNIX_TIMESTAMP(logDate) AS t
         FROM plantHealthLogs
         WHERE plantId = ? AND (photoKey IS NOT NULL OR photoUrl IS NOT NULL)
         ORDER BY logDate DESC
         LIMIT 10`,
        [plantId]
      );
      res.json({
        photos: (rows as any[]).map(r => ({
          id: r.id as number,
          healthStatus: (r.healthStatus as string | null) ?? null,
          t: Number(r.t),  // epoch sec
        })),
      });
    } catch (err: any) {
      console.error('[Device] plant photos list error:', err?.message);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /api/device/plant/:plantId/photo — última foto do registro de saúde
  //
  // Lê o arquivo do disco (`uploads/<photoKey>`), resiza com Sharp pro
  // tamanho amigável ao display, devolve JPEG binário.
  //
  // Multi-tenancy: planta precisa pertencer ao groupId do token.
  //
  // Query params (opcionais):
  //   - ?w=320&h=240  — dimensões (default 320x240, max 1280x720)
  //   - &q=70         — qualidade JPEG (default 70, range 20-95)
  //
  // Status:
  //   200 → image/jpeg + binário
  //   404 → planta sem foto de saúde registrada (ESP mostra placeholder)
  //   403 → planta de outro grupo
  //   500 → erro lendo arquivo
  app.get('/api/device/plant/:plantId/photo', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });

      const plantId = parseInt(req.params.plantId);
      if (!Number.isInteger(plantId) || plantId <= 0) {
        return res.status(400).json({ error: 'plantId inválido' });
      }

      // fmt=rgb565 → retorna pixel data raw (320x240x2 = 153600 bytes)
      // direto pro framebuffer do ESP, sem precisar decodar JPEG no display.
      // Eliminou tela preta causada por:
      //  - JFIF marker ausente (Sharp omite)
      //  - LV_USE_FS_MEMFS heap crash
      //  - Chunked transfer encoding do Cloudflare
      // Trade-off: 150KB transfer vs ~10KB JPEG, mas com no-transform e
      // Content-Length, vem em ~150-300ms via WiFi.
      const fmt = String(req.query.fmt ?? 'jpeg').toLowerCase();
      const wantRgb565 = (fmt === 'rgb565');

      const w = Math.min(1280, Math.max(80, parseInt(String(req.query.w ?? '320')) || 320));
      const h = Math.min(720, Math.max(60, parseInt(String(req.query.h ?? '240')) || 240));
      const q = Math.min(95, Math.max(20, parseInt(String(req.query.q ?? '70')) || 70));

      // ?photoId=X: foto especifica (timeline navigation). Sem param,
      // pega a mais recente.
      const photoIdParam = parseInt(String(req.query.photoId ?? '0'));
      const wantSpecific = Number.isInteger(photoIdParam) && photoIdParam > 0;

      // Busca foto (especifica OU ultima) + verifica ownership via groupId.
      // Caminho moderno do plantHealth.create salva só `photoUrl`
      // (`/uploads/<key>`) e deixa `photoKey` NULL. Caminho legado base64
      // preenchia photoKey. Aceitamos ambos e derivamos o fileKey.
      const [rows]: any = wantSpecific
        ? await pool.execute(
            `SELECT h.photoKey, h.photoUrl, h.logDate, h.healthStatus, p.groupId
             FROM plantHealthLogs h
             INNER JOIN plants p ON p.id = h.plantId
             WHERE h.id = ? AND h.plantId = ?
               AND (h.photoKey IS NOT NULL OR h.photoUrl IS NOT NULL)
             LIMIT 1`,
            [photoIdParam, plantId]
          )
        : await pool.execute(
            `SELECT h.photoKey, h.photoUrl, h.logDate, h.healthStatus, p.groupId
             FROM plantHealthLogs h
             INNER JOIN plants p ON p.id = h.plantId
             WHERE h.plantId = ?
               AND (h.photoKey IS NOT NULL OR h.photoUrl IS NOT NULL)
             ORDER BY h.id DESC
             LIMIT 1`,
            [plantId]
          );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Planta sem foto de saúde registrada' });
      }
      const row = rows[0];
      if (row.groupId !== device.groupId) {
        return res.status(403).json({ error: 'Planta de outro grupo' });
      }

      // Resolve fileKey: prefere photoKey (legado), senão deriva do
      // photoUrl removendo o prefixo `/uploads/`. Se photoUrl for URL
      // externa (https://...), aborta — só local storage suportado.
      let fileKey: string;
      if (row.photoKey) {
        fileKey = String(row.photoKey).replace(/^\/+/, '');
      } else {
        const url = String(row.photoUrl);
        if (!url.startsWith('/uploads/')) {
          console.warn(`[Device] photoUrl não é local: ${url}`);
          return res.status(404).json({ error: 'Foto em storage externo não suportado' });
        }
        fileKey = url.replace(/^\/uploads\//, '');
      }

      // Lê o arquivo do disco. fileKey é um caminho relativo dentro
      // de UPLOADS_DIR — normaliza com path.join e valida que continua
      // dentro de UPLOADS_DIR (defesa contra `../../etc/passwd`).
      const filePath = path.join(UPLOADS_DIR, fileKey);
      if (!filePath.startsWith(UPLOADS_DIR + path.sep)) {
        return res.status(400).json({ error: 'fileKey inválido' });
      }

      // RGB565 RAW PATH: ESP nao precisa decoder JPEG — recebe pixels
      // 16-bit big-endian (320x240 = 153600 bytes) prontos pra framebuffer.
      // Sharp converte JPEG -> raw RGB888, depois empacotamos RGB565.
      if (wantRgb565) {
        if (!sharpLib) return res.status(500).json({ error: 'Sharp indisponivel pra RGB565' });
        try {
          const inputBuffer = await fsp.readFile(filePath);
          const { data: rgb888, info } = await sharpLib(inputBuffer)
            .rotate()
            .resize({ width: w, height: h, fit: 'cover', position: 'center' })  // cover pra evitar letterbox
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          // RGB888 -> RGB565 big-endian (LVGL com LV_COLOR_DEPTH=16 RGB565 LE
          // por default, mas alguns displays AXS15231B esperam BE). Tentamos
          // little-endian primeiro; se cores ficarem trocadas ajustamos.
          const pixelCount = info.width * info.height;
          const rgb565 = Buffer.allocUnsafe(pixelCount * 2);
          for (let i = 0, j = 0; i < pixelCount; i++, j += 3) {
            const r = rgb888[j] >> 3;            // 5 bits
            const g = rgb888[j + 1] >> 2;        // 6 bits
            const b = rgb888[j + 2] >> 3;        // 5 bits
            const px = (r << 11) | (g << 5) | b;
            // little-endian: low byte first
            rgb565[i * 2] = px & 0xFF;
            rgb565[i * 2 + 1] = (px >> 8) & 0xFF;
          }
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Cache-Control', 'public, max-age=30, no-transform');
          res.setHeader('Content-Length', String(rgb565.length));
          res.setHeader('X-Pixel-Format', 'RGB565LE');
          res.setHeader('X-Pixel-Width', String(info.width));
          res.setHeader('X-Pixel-Height', String(info.height));
          res.setHeader('X-Health-Status', String(row.healthStatus ?? ''));
          res.setHeader('X-Log-Date', new Date(row.logDate).toISOString());
          return res.status(200).end(rgb565);
        } catch (e: any) {
          console.warn(`[Device] rgb565 fail: ${e?.message}`);
          return res.status(500).json({ error: 'Erro convertendo p/ RGB565' });
        }
      }

      // FAST PATH: tenta servir o variant ESP pre-gerado no upload
      // (320x240 baseline JPEG q70, ~10KB). Pula Sharp resize na request
      // → response em <500ms vs ~16s on-demand observado no display.
      //
      // Variant existe so' pra uploads via /api/upload/image apos esse
      // commit. Uploads antigos caem no fallback Sharp on-demand abaixo.
      //
      // Tambem so' aplica se cliente pediu defaults (w=320, h=240, q=70).
      // Curl com tamanhos diferentes (?w=800&h=600&q=90) ainda vai pelo
      // path Sharp pra honrar os params.
      const isDefaultSize = (w === 320 && h === 240 && q === 70);
      if (isDefaultSize) {
        const espKey = fileKey.replace(/\.[^.]+$/, '.esp.jpg');
        const espPath = path.join(UPLOADS_DIR, espKey);
        try {
          const espBuffer = await fsp.readFile(espPath);
          res.setHeader('Content-Type', 'image/jpeg');
          // no-transform: instrui proxies (Cloudflare) a NAO modificar
          // a response — sem isso, CF adiciona chunked transfer encoding
          // mesmo com Content-Length explicito. ESP HTTPClient.getStreamPtr()
          // retorna o socket raw com chunks markers, TJPGD le bytes errados
          // e falha (tela preta). max-age curto pq foto pode mudar.
          res.setHeader('Cache-Control', 'public, max-age=30, no-transform');
          res.setHeader('Content-Length', String(espBuffer.length));
          res.setHeader('X-Health-Status', String(row.healthStatus ?? ''));
          res.setHeader('X-Log-Date', new Date(row.logDate).toISOString());
          res.setHeader('X-ESP-Variant', 'pre-generated');
          return res.status(200).end(espBuffer);
        } catch {
          // Variant nao existe — cai no fallback Sharp on-demand
        }
      }

      let inputBuffer: Buffer;
      try {
        inputBuffer = await fsp.readFile(filePath);
      } catch (err: any) {
        if (err?.code === 'ENOENT') {
          console.warn(`[Device] fileKey aponta pra arquivo inexistente: ${fileKey}`);
          return res.status(404).json({ error: 'Arquivo da foto não encontrado no disco' });
        }
        throw err;
      }

      // Resize via Sharp (se disponível). Se falhar, devolve original.
      let outBuffer: Buffer = inputBuffer;
      if (sharpLib) {
        try {
          outBuffer = await sharpLib(inputBuffer)
            .rotate()                                                    // respeita EXIF orientation
            .resize({ width: w, height: h, fit: 'inside' })
            // SEM mozjpeg: ESP decoda via TJPGD que so' suporta JPEG
            // baseline. mozjpeg encoder forca progressive (passes
            // encoding) ignorando o flag progressive:false. Resultado:
            // foto baixa, "aplica", mas a tela fica preta no display.
            // libjpeg-turbo default da baseline garantido — hit ~10-15%
            // de tamanho (irrelevante pra arquivos de ~5KB).
            .jpeg({ quality: q, progressive: false })
            .toBuffer();
        } catch (e: any) {
          console.warn(`[Device] sharp resize falhou, devolvendo original: ${e?.message}`);
        }
      }

      // Headers úteis pro ESP — healthStatus + logDate em headers custom
      // pra evitar chamar /plants antes de mostrar a foto.
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.setHeader('Content-Length', String(outBuffer.length));
      res.setHeader('X-Health-Status', String(row.healthStatus ?? ''));
      res.setHeader('X-Log-Date', new Date(row.logDate).toISOString());
      res.status(200).end(outBuffer);
    } catch (err: any) {
      console.error('[Device] plant photo error:', err?.message);
      res.status(500).json({ error: err?.message ?? 'Erro ao ler foto' });
    }
  });

  // POST /api/device/refresh-tuya/:tentId — forca leitura imediata do sensor Tuya
  app.post('/api/device/refresh-tuya/:tentId', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });
      const tentId = parseInt(req.params.tentId);
      if (device.tentId !== tentId) return res.status(403).json({ error: 'Não autorizado' });

      // Busca config Tuya de qualquer usuário do grupo com mapeamento para esta estufa
      const [cfgRows]: any = await pool.execute(
        `SELECT tc.accessId, tc.accessSecret, tc.region, tsm.deviceId, tc.userId
         FROM tuyaConfig tc
         INNER JOIN tuyaSensorMappings tsm ON tsm.userId = tc.userId AND tsm.tentId = ? AND tsm.enabled = 1
         INNER JOIN users u ON u.id = tc.userId
         WHERE tc.enabled = 1 AND u.groupId = ?
         LIMIT 1`,
        [tentId, device.groupId]
      );
      if (cfgRows.length === 0) {
        return res.status(404).json({ error: 'Nenhum sensor Tuya ativo para esta estufa' });
      }
      const cfg = cfgRows[0];

      const { readTuyaDeviceStatus } = await import("../lib/tuya");
      const reading = await readTuyaDeviceStatus(cfg.deviceId, cfg.accessId, cfg.accessSecret, cfg.region);

      // Atualiza cache de leituras
      await pool.execute(
        `INSERT INTO sensorLatestReadings (userId, deviceId, tempC, rhPct, readAt)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE tempC=VALUES(tempC), rhPct=VALUES(rhPct), readAt=NOW()`,
        [cfg.userId, cfg.deviceId, reading.tempC ?? null, reading.rhPct ?? null]
      );

      // Atualiza dailyLogs (AUTO) para a hora atual
      const turn = new Date().getHours() < 18 ? 'AM' : 'PM';
      await pool.execute(
        `INSERT INTO dailyLogs (tentId, logDate, turn, tempC, rhPct, source)
         VALUES (?, DATE_FORMAT(NOW(), '%Y-%m-%d %H:00:00'), ?, ?, ?, 'AUTO')
         ON DUPLICATE KEY UPDATE tempC=VALUES(tempC), rhPct=VALUES(rhPct), source='AUTO'`,
        [tentId, turn, reading.tempC ?? null, reading.rhPct ?? null]
      );

      let vpd: number | null = null;
      if (reading.tempC !== null && reading.rhPct !== null) {
        const svp = 0.6108 * Math.exp((17.27 * reading.tempC) / (reading.tempC + 237.3));
        vpd = parseFloat((svp * (1 - reading.rhPct / 100)).toFixed(2));
      }
      res.json({ tempC: reading.tempC, rh: reading.rhPct, vpd });
    } catch (err: any) {
      console.error('[Device] refresh-tuya error:', err?.message);
      res.status(500).json({ error: err?.message ?? 'Erro ao ler sensor' });
    }
  });

  // GET /api/device/history/:tentId?metric=temp&period=24h
  //
  // Periods:
  //   - 24h: raw hourly points (~24-48 pontos com {t, v})
  //   - 7d/30d: DAILY aggregates com {t, v (avg), min, max}
  //     Sem agregacao, 30d = 720 pontos -> chart fica ilegivel.
  //
  // Format unificado: array de {t: epoch, v: avg-or-raw, min?, max?}.
  // min/max so' presentes em 7d/30d. ESP renderiza banda colorida entre
  // min/max + linha em v (avg) pra leitura rapida da variacao.
  app.get('/api/device/history/:tentId', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });
      const tentId = parseInt(req.params.tentId);
      if (device.tentId !== tentId) return res.status(403).json({ error: 'Não autorizado' });

      const metric = String(req.query.metric ?? 'temp');
      const period = String(req.query.period ?? '24h');

      const colMap: Record<string, string> = {
        temp: 'tempC', rh: 'rhPct', ph: 'ph', ec: 'ec', watering: 'wateringVolume',
      };
      const col = colMap[metric];
      if (!col) return res.status(400).json({ error: 'metric inválido' });

      const hoursMap: Record<string, number> = { '24h': 24, '7d': 168, '30d': 720 };
      const hours = hoursMap[period];
      if (hours == null) return res.status(400).json({ error: 'period inválido' });

      if (period === '24h') {
        // Raw hourly points — comportamento original
        const [rows]: any = await pool.execute(
          `SELECT UNIX_TIMESTAMP(logDate) AS t, ${col} AS v
           FROM dailyLogs
           WHERE tentId = ? AND logDate >= NOW() - INTERVAL ? HOUR AND ${col} IS NOT NULL
           ORDER BY logDate ASC
           LIMIT 48`,
          [tentId, hours]
        );
        return res.json(rows.map((r: any) => ({
          t: Number(r.t),
          v: r.v != null ? parseFloat(r.v) : null,
        })));
      }

      // 7d/30d: agregado por dia (GROUP BY DATE). Cada ponto vira a "barriga"
      // do dia (min..max) + ponto central (avg). Reduz 720 pontos pra 30.
      const [rows]: any = await pool.execute(
        `SELECT UNIX_TIMESTAMP(DATE(logDate)) AS t,
                AVG(${col}) AS v,
                MIN(${col}) AS minV,
                MAX(${col}) AS maxV
         FROM dailyLogs
         WHERE tentId = ? AND logDate >= NOW() - INTERVAL ? HOUR AND ${col} IS NOT NULL
         GROUP BY DATE(logDate)
         ORDER BY DATE(logDate) ASC`,
        [tentId, hours]
      );
      res.json(rows.map((r: any) => ({
        t:   Number(r.t),
        v:   r.v    != null ? parseFloat(r.v)    : null,
        min: r.minV != null ? parseFloat(r.minV) : null,
        max: r.maxV != null ? parseFloat(r.maxV) : null,
      })));
    } catch (err: any) {
      console.error('[Device] history error:', err?.message);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /api/device/history-all/:tentId?period=24h — bulk para sparklines (4 metricas)
  app.get('/api/device/history-all/:tentId', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });
      const tentId = parseInt(req.params.tentId);
      if (device.tentId !== tentId) return res.status(403).json({ error: 'Não autorizado' });
      const period = String(req.query.period ?? '24h');
      const hoursMap: Record<string, number> = { '24h': 24, '7d': 168, '30d': 720 };
      const hours = hoursMap[period] ?? 24;

      const [rows]: any = await pool.execute(
        `SELECT tempC, rhPct, ph, ec
         FROM dailyLogs
         WHERE tentId = ? AND logDate >= NOW() - INTERVAL ? HOUR
         ORDER BY logDate ASC
         LIMIT 60`,
        [tentId, hours]
      );
      const out: Record<string, number[]> = { temp: [], rh: [], ph: [], ec: [] };
      for (const r of rows) {
        if (r.tempC != null) out.temp.push(parseFloat(r.tempC));
        if (r.rhPct != null) out.rh.push(parseFloat(r.rhPct));
        if (r.ph    != null) out.ph.push(parseFloat(r.ph));
        if (r.ec    != null) out.ec.push(parseFloat(r.ec));
      }
      res.json(out);
    } catch (err: any) {
      console.error('[Device] history-all error:', err?.message);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /api/device/tokens — lista tokens (admin via app, protegido por cookie JWT)
  // Esta rota é usada apenas internamente; gestão real via tRPC device.*
  app.post('/api/device/generate-token', async (req, res) => {
    try {
      const { authenticateRequest } = await import('./auth');
      const user = await authenticateRequest(req);
      if (!user) return res.status(401).json({ error: 'Não autenticado' });
      const { tentId, name } = req.body;
      if (!tentId || !name) return res.status(400).json({ error: 'tentId e name obrigatórios' });
      const token = crypto.randomBytes(32).toString('hex');
      // ownerUserId = quem gerou o token. Usado pelo /device-toggle pra
      // pegar a config Tuya CERTA (alinha com o caminho do app web).
      await pool.execute(
        `INSERT INTO deviceTokens (token, name, tentId, groupId, ownerUserId) VALUES (?, ?, ?, ?, ?)`,
        [token, name, tentId, user.groupId ?? 0, user.id]
      );
      res.json({ token });
    } catch (err: any) {
      console.error('[Device] generate-token error:', err?.message);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // RFC 8628 — Device Authorization Grant (pareamento user-friendly)
  //
  // Fluxo:
  //   1. ESP32 sem token → POST /pair-init → recebe { code:"MR-4F8K", expiresIn:600 }
  //   2. ESP32 mostra na tela: "Vá em app.cultivo.pro → Estufa → Conectar Display
  //                             e digite: MR-4F8K"
  //   3. ESP32 polla GET /pair-status?code=MR-4F8K cada 5s
  //   4. User no app → POST /pair-claim { code, tentId } (autenticado JWT)
  //                  → backend gera deviceToken longo, vincula tudo
  //   5. ESP32 vê paired=true → recebe { token, tentId } → salva NVS → bora
  //
  // Segurança:
  //   - Code 6 chars [A-HJ-NP-Z2-9] (sem 0/O/1/I/L pra não confundir) ~25 bilhões
  //   - Expira em 10 min, single-use
  //   - Token longo (64 hex) gerado server-side, NUNCA aparece pro usuário
  //   - Rate limit grosseiro: max 5 codes ativos por IP simultaneamente
  // ════════════════════════════════════════════════════════════════════════════

  // Alfabeto sem caracteres ambíguos (0 vs O, 1 vs I/L)
  const PAIR_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function generatePairCode(): string {
    // 6 chars formato XXX-XXX (visualmente fácil de ler/digitar)
    let s = '';
    for (let i = 0; i < 6; i++) {
      s += PAIR_CODE_ALPHABET[crypto.randomInt(0, PAIR_CODE_ALPHABET.length)];
    }
    return s.slice(0, 3) + '-' + s.slice(3);  // "MR4-K8X" → 7 chars com hifen
  }

  // POST /api/device/pair-init — ESP32 (não-autenticado, rate limited)
  app.post('/api/device/pair-init', async (req, res) => {
    try {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || 'unknown';

      // Rate limit grosseiro: limpa expirados e conta ativos por IP nos headers
      // (não temos coluna ip — usa expiresAt como proxy: se já tem 5 ativos, espera)
      await pool.execute(`DELETE FROM devicePairingCodes WHERE expiresAt < NOW() AND claimedByUserId IS NULL`);
      const [activeRows]: any = await pool.execute(
        `SELECT COUNT(*) AS n FROM devicePairingCodes WHERE expiresAt > NOW() AND claimedByUserId IS NULL`
      );
      if (activeRows[0].n >= 50) {
        // limite global pra prevenir flood — 50 códigos pendentes simultâneos é mais que suficiente
        return res.status(429).json({ error: 'Muitos códigos ativos. Tente novamente em alguns minutos.' });
      }

      const deviceName = (req.body?.deviceName as string)?.slice(0, 100) || 'ESP32 display';

      // Gera código único (retry se colisão)
      let code = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        code = generatePairCode();
        try {
          await pool.execute(
            `INSERT INTO devicePairingCodes (code, deviceName, expiresAt) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
            [code, deviceName]
          );
          break;
        } catch (e: any) {
          if (e.errno === 1062 && attempt < 4) continue;  // duplicate key, retry
          throw e;
        }
      }

      console.log(`[Device] pair-init code=${code} ip=${ip}`);
      res.json({ code, expiresIn: 600, pollIntervalSec: 5 });
    } catch (err: any) {
      console.error('[Device] pair-init error:', err?.message);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /api/device/pair-claim — User (autenticado JWT)
  // Body: { code: "MR4-K8X", tentId: 1 }
  app.post('/api/device/pair-claim', async (req, res) => {
    try {
      const { authenticateRequest } = await import('./auth');
      const user = await authenticateRequest(req);
      if (!user) return res.status(401).json({ error: 'Não autenticado' });

      const code = String(req.body?.code || '').trim().toUpperCase();
      const tentId = Number(req.body?.tentId);
      if (!code || !tentId) return res.status(400).json({ error: 'code e tentId obrigatórios' });

      // Verifica que a tent pertence ao group do user
      const [tentRows]: any = await pool.execute(
        `SELECT id FROM tents WHERE id = ? AND groupId = ? LIMIT 1`,
        [tentId, user.groupId ?? 0]
      );
      if (tentRows.length === 0) return res.status(403).json({ error: 'Estufa não pertence a você' });

      // Busca o code, valida que não expirou nem foi usado
      const [codeRows]: any = await pool.execute(
        `SELECT deviceName, expiresAt, claimedByUserId FROM devicePairingCodes WHERE code = ? LIMIT 1`,
        [code]
      );
      if (codeRows.length === 0) return res.status(404).json({ error: 'Código inválido ou inexistente' });
      const codeRow = codeRows[0];
      if (new Date(codeRow.expiresAt).getTime() < Date.now()) return res.status(410).json({ error: 'Código expirado, gere outro no display' });
      if (codeRow.claimedByUserId) return res.status(409).json({ error: 'Código já foi usado' });

      // Gera deviceToken longo + insere em deviceTokens + marca code como claimed.
      // ownerUserId = user que pareou (usado pelo /device-toggle pra pegar
      // a config Tuya CERTA, alinha com o web).
      const deviceToken = crypto.randomBytes(32).toString('hex');

      // 1 token por estufa: se a estufa já tem display pareado, invalida o
      // anterior. Cobre o caso real de "troquei o ESP fisicamente, quero
      // que o novo funcione e o velho pare". Se a pessoa tem 2 ESPs e quer
      // que ambos mostrem a mesma estufa, ela tem que usar o caminho
      // "Dispositivos" (avançado) que permite múltiplos tokens por tent.
      const [existing]: any = await pool.execute(
        `SELECT id, name FROM deviceTokens WHERE tentId = ? AND groupId = ?`,
        [tentId, user.groupId ?? 0]
      );
      let replacedCount = 0;
      if (existing.length > 0) {
        await pool.execute(
          `DELETE FROM deviceTokens WHERE tentId = ? AND groupId = ?`,
          [tentId, user.groupId ?? 0]
        );
        replacedCount = existing.length;
        console.log(`[Device] pair-claim substituiu ${replacedCount} token(s) anterior(es) da estufa ${tentId}`);
      }

      await pool.execute(
        `INSERT INTO deviceTokens (token, name, tentId, groupId, ownerUserId) VALUES (?, ?, ?, ?, ?)`,
        [deviceToken, codeRow.deviceName, tentId, user.groupId ?? 0, user.id]
      );
      await pool.execute(
        `UPDATE devicePairingCodes SET claimedByUserId = ?, tentId = ?, generatedToken = ? WHERE code = ?`,
        [user.id, tentId, deviceToken, code]
      );

      console.log(`[Device] pair-claim code=${code} userId=${user.id} tentId=${tentId} replaced=${replacedCount}`);
      res.json({ success: true, deviceName: codeRow.deviceName, replacedPrevious: replacedCount });
    } catch (err: any) {
      console.error('[Device] pair-claim error:', err?.message);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /api/device/pair-status?code=XXX — ESP32 polla (não-autenticado)
  app.get('/api/device/pair-status', async (req, res) => {
    try {
      const code = String(req.query?.code || '').trim().toUpperCase();
      if (!code) return res.status(400).json({ error: 'code obrigatório' });

      const [rows]: any = await pool.execute(
        `SELECT expiresAt, claimedByUserId, tentId, generatedToken FROM devicePairingCodes WHERE code = ? LIMIT 1`,
        [code]
      );
      if (rows.length === 0) return res.status(404).json({ status: 'not_found' });
      const r = rows[0];

      if (r.claimedByUserId && r.generatedToken) {
        // Pareado! Devolve o token UMA VEZ e deleta o code (single-use)
        const token = r.generatedToken as string;
        const tentId = r.tentId as number;
        await pool.execute(`DELETE FROM devicePairingCodes WHERE code = ?`, [code]);
        console.log(`[Device] pair-status code=${code} → DELIVERED tentId=${tentId}`);
        return res.json({ status: 'paired', token, tentId });
      }

      if (new Date(r.expiresAt).getTime() < Date.now()) {
        await pool.execute(`DELETE FROM devicePairingCodes WHERE code = ?`, [code]);
        return res.status(410).json({ status: 'expired' });
      }

      return res.json({ status: 'pending' });
    } catch (err: any) {
      console.error('[Device] pair-status error:', err?.message);
      res.status(500).json({ error: 'Erro interno' });
    }
  });
}

export { registerDeviceRoutes };
