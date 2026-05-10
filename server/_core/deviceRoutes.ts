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
//   GET  /api/device/scenes                 → lista cenas Tuya manuais do user (max 6)
//   POST /api/device/scene-by-id/:sceneId/trigger → trigger por sceneId real (do GET /scenes)
//   POST /api/device/refresh-tuya/:tentId   → forca poll Tuya (cria dailyLog)
//   GET  /api/device/history/:tentId        → 24h/7d/30d history p/ chart
//   GET  /api/device/history-all/:tentId    → 4 metricas em uma chamada (sparklines)
//   POST /api/device/generate-token         → web user gera novo deviceToken (autenticado)
// ════════════════════════════════════════════════════════════════════════════════
import express from "express";
import crypto from "crypto";
import { getMysqlPool } from "../mysql-pool";

async function validateDeviceToken(req: express.Request): Promise<{ tentId: number; groupId: number } | null> {
  const token = req.headers['x-device-token'] as string | undefined;
  if (!token) return null;
  try {
    const pool = getMysqlPool();
    const [rows]: any = await pool.execute(
      `SELECT tentId, groupId FROM deviceTokens WHERE token = ? LIMIT 1`,
      [token]
    );
    return rows.length > 0 ? { tentId: rows[0].tentId, groupId: rows[0].groupId } : null;
  } catch {
    return null;
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

      const [tentRows]: any = await pool.execute(`SELECT name FROM tents WHERE id = ? LIMIT 1`, [tentId]);
      const tentName: string = tentRows[0]?.name ?? 'ESTUFA';

      const [cycleRows]: any = await pool.execute(
        `SELECT c.startDate, c.floraStartDate, s.floraWeeks, s.vegaWeeks
         FROM cycles c
         LEFT JOIN strains s ON s.id = c.strainId
         WHERE c.tentId = ? AND c.status = 'ACTIVE'
         LIMIT 1`,
        [tentId]
      );

      let fase = 'VEGA', semana = 1, totalSem = 8;
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

      const [logRows]: any = await pool.execute(
        `SELECT tempC, rhPct, ph, ec, ppfd FROM dailyLogs WHERE tentId = ? ORDER BY logDate DESC LIMIT 1`,
        [tentId]
      );

      let tempC: number | null = null, rh: number | null = null, vpd: number | null = null;
      let ph: number | null = null, ec: number | null = null;
      let ppfd: number | null = null, lux: number | null = null;
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
      }

      res.json({ tentName, tempC, rh, vpd, ph, ec, lux, ppfd, fase, semana, totalSem });
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

  // GET /api/device/tasks/:tentId — lista tarefas da estufa
  app.get('/api/device/tasks/:tentId', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });
      const tentId = parseInt(req.params.tentId);
      if (device.tentId !== tentId) return res.status(403).json({ error: 'Não autorizado' });
      const [rows]: any = await pool.execute(
        `SELECT id, title, isDone FROM standaloneTasks WHERE tentId = ? ORDER BY createdAt DESC LIMIT 10`,
        [tentId]
      );
      res.json(rows.map((r: any) => ({ id: r.id, texto: r.title, feito: !!r.isDone })));
    } catch (err: any) {
      console.error('[Device] tasks error:', err?.message);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /api/device/task-complete — alterna estado de conclusão de tarefa
  app.post('/api/device/task-complete', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });
      const { taskId } = req.body;
      if (!taskId) return res.status(400).json({ error: 'taskId obrigatório' });
      const [rows]: any = await pool.execute(
        `SELECT id, isDone FROM standaloneTasks WHERE id = ? AND tentId = ?`,
        [taskId, device.tentId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada' });
      const newState = rows[0].isDone ? 0 : 1;
      await pool.execute(
        `UPDATE standaloneTasks SET isDone = ?, completedAt = ? WHERE id = ?`,
        [newState, newState ? new Date() : null, taskId]
      );
      res.json({ success: true, feito: !!newState });
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

      // Busca config Tuya do grupo do device (qualquer user com tuya enabled)
      const [cfgRows]: any = await pool.execute(
        `SELECT tc.accessId, tc.accessSecret, tc.region
         FROM tuyaConfig tc INNER JOIN users u ON u.id = tc.userId
         WHERE tc.enabled = 1 AND u.groupId = ? LIMIT 1`,
        [device.groupId]
      );
      if (cfgRows.length === 0) {
        return res.status(404).json({ error: 'Nenhuma config Tuya ativa pro grupo' });
      }
      const cfg = cfgRows[0];

      const { triggerTuyaScene } = await import('../lib/tuya');
      const result = await triggerTuyaScene(homeId, sceneId, cfg.accessId, cfg.accessSecret, cfg.region);
      console.log(`[Device] scene slot=${slotIdx} -> ${result.success ? 'OK' : 'FAIL'} (${result.msg ?? ''})`);
      if (!result.success) return res.status(502).json({ error: result.msg ?? 'Tuya retornou falha' });
      res.json({ success: true, slotIdx });
    } catch (err: any) {
      console.error('[Device] scene trigger error:', err?.message);
      res.status(500).json({ error: err?.message ?? 'Erro ao disparar cena' });
    }
  });

  // GET /api/device/scenes — lista cenas Tuya manuais (tap-to-run) do grupo
  // do device. ESP usa pra popular o grid Cenas dinamicamente em vez de
  // SCENES[] hardcoded. Max 6 cenas (grid 2x3 do display ESP32).
  // Resposta: { scenes: [{id, name}, ...] } — id = sceneId Tuya real,
  // usado depois em POST /api/device/scene-by-id/:sceneId/trigger.
  // Usa listTuyaScenesIoTCore (mesmo helper do app web).
  app.get('/api/device/scenes', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });

      const [cfgRows]: any = await pool.execute(
        `SELECT tc.accessId, tc.accessSecret, tc.region
         FROM tuyaConfig tc INNER JOIN users u ON u.id = tc.userId
         WHERE tc.enabled = 1 AND u.groupId = ? LIMIT 1`,
        [device.groupId]
      );
      if (cfgRows.length === 0) {
        return res.json({ scenes: [] });  // sem Tuya configurada
      }
      const cfg = cfgRows[0];

      const { listTuyaScenesIoTCore } = await import('../lib/tuya');
      let allScenes: Array<{ sceneId: string; name: string; type: string }> = [];
      try {
        allScenes = await listTuyaScenesIoTCore(cfg.accessId, cfg.accessSecret, cfg.region);
      } catch (e: any) {
        console.warn('[Device] /scenes listTuyaScenesIoTCore:', e?.message);
        return res.json({ scenes: [] });
      }

      // Filtra so' tap-to-run (manuais) — automacoes nao fazem sentido no
      // grid (rodam sozinhas). Pega max 6 pra caber no grid 2x3 do ESP.
      const scenes = allScenes
        .filter(s => s.type === 'scene')
        .slice(0, 6)
        .map(s => ({ id: s.sceneId, name: s.name }));

      console.log(`[Device] /scenes group=${device.groupId} -> ${scenes.length} cenas`);
      res.json({ scenes });
    } catch (err: any) {
      console.error('[Device] scenes list error:', err?.message);
      res.status(500).json({ error: err?.message ?? 'Erro ao listar cenas' });
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

      const [cfgRows]: any = await pool.execute(
        `SELECT tc.accessId, tc.accessSecret, tc.region
         FROM tuyaConfig tc INNER JOIN users u ON u.id = tc.userId
         WHERE tc.enabled = 1 AND u.groupId = ? LIMIT 1`,
        [device.groupId]
      );
      if (cfgRows.length === 0) {
        return res.status(404).json({ error: 'Nenhuma config Tuya ativa pro grupo' });
      }
      const cfg = cfgRows[0];
      const homeId = parseInt(process.env.TUYA_HOME_ID ?? '0') || 0;

      const { triggerTuyaScene } = await import('../lib/tuya');
      const result = await triggerTuyaScene(homeId, sceneId, cfg.accessId, cfg.accessSecret, cfg.region);
      console.log(`[Device] scene-by-id ${sceneId} -> ${result.success ? 'OK' : 'FAIL'} (${result.msg ?? ''})`);
      if (!result.success) return res.status(502).json({ error: result.msg ?? 'Tuya retornou falha' });
      res.json({ success: true, sceneId });
    } catch (err: any) {
      console.error('[Device] scene-by-id trigger error:', err?.message);
      res.status(500).json({ error: err?.message ?? 'Erro ao disparar cena' });
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

  // GET /api/device/history/:tentId?metric=temp&period=24h — historico p/ graficos
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

      // Janela de tempo + limite de pontos
      const hoursMap: Record<string, number> = { '24h': 24, '7d': 168, '30d': 720 };
      const hours = hoursMap[period] ?? 24;
      const limit = period === '24h' ? 48 : period === '7d' ? 56 : 60;

      const [rows]: any = await pool.execute(
        `SELECT UNIX_TIMESTAMP(logDate) AS t, ${col} AS v
         FROM dailyLogs
         WHERE tentId = ? AND logDate >= NOW() - INTERVAL ? HOUR AND ${col} IS NOT NULL
         ORDER BY logDate ASC
         LIMIT ?`,
        [tentId, hours, limit]
      );
      res.json(rows.map((r: any) => ({ t: Number(r.t), v: r.v != null ? parseFloat(r.v) : null })));
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
      await pool.execute(
        `INSERT INTO deviceTokens (token, name, tentId, groupId) VALUES (?, ?, ?, ?)`,
        [token, name, tentId, user.groupId ?? 0]
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

      // Gera deviceToken longo + insere em deviceTokens + marca code como claimed
      const deviceToken = crypto.randomBytes(32).toString('hex');
      await pool.execute(
        `INSERT INTO deviceTokens (token, name, tentId, groupId) VALUES (?, ?, ?, ?)`,
        [deviceToken, codeRow.deviceName, tentId, user.groupId ?? 0]
      );
      await pool.execute(
        `UPDATE devicePairingCodes SET claimedByUserId = ?, tentId = ?, generatedToken = ? WHERE code = ?`,
        [user.id, tentId, deviceToken, code]
      );

      console.log(`[Device] pair-claim code=${code} userId=${user.id} tentId=${tentId}`);
      res.json({ success: true, deviceName: codeRow.deviceName });
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
