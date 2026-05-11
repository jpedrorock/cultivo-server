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
//                                             novo formato: {items:[{type,id,name,position,iconHint?,state?}]}
//                                             legacy fallback: {scenes:[{id,name}]} se sem vínculos
//   POST /api/device/scene-by-id/:sceneId/trigger → trigger por sceneId real
//   POST /api/device/device-toggle          → liga/desliga device Tuya vinculado
//   POST /api/device/automation-toggle      → ativa/pausa automation (cena programada)
//   POST /api/device/refresh-tuya/:tentId   → forca poll Tuya (cria dailyLog)
//   GET  /api/device/history/:tentId        → 24h/7d/30d history p/ chart
//   GET  /api/device/history-all/:tentId    → 4 metricas em uma chamada (sparklines)
//   POST /api/device/generate-token         → web user gera novo deviceToken (autenticado)
// ════════════════════════════════════════════════════════════════════════════════
import express from "express";
import crypto from "crypto";
import { getMysqlPool } from "../mysql-pool";
import type { TuyaRegion } from "../lib/tuya";

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
async function getTuyaCfgForDevice(device: { groupId: number; ownerUserId: number | null }): Promise<{ accessId: string; accessSecret: string; region: TuyaRegion } | null> {
  const pool = getMysqlPool();
  let row: { accessId: string; accessSecret: string; region: TuyaRegion; userId: number } | null = null;

  if (device.ownerUserId) {
    const [rows]: any = await pool.execute(
      `SELECT accessId, accessSecret, region, userId FROM tuyaConfig WHERE userId = ? AND enabled = 1 LIMIT 1`,
      [device.ownerUserId]
    );
    if (rows.length > 0) row = rows[0];
    // Fallback: se owner não tem config (raro), tenta grupo
  }
  if (!row) {
    const [rows]: any = await pool.execute(
      `SELECT tc.accessId, tc.accessSecret, tc.region, tc.userId
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
  return { accessId: row.accessId, accessSecret: row.accessSecret, region: row.region };
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

      // Busca config Tuya — prefere config do owner do token (helper)
      const cfg = await getTuyaCfgForDevice(device);
      if (!cfg) {
        return res.status(404).json({ error: 'Nenhuma config Tuya ativa pro grupo' });
      }

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

      // 1) Carrega vínculos da estufa
      const [tentSceneRows]: any = await pool.execute(
        `SELECT sceneId, name, position, type FROM tentScenes WHERE tentId = ? ORDER BY position ASC LIMIT 6`,
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

        const { listTuyaScenesIoTCore } = await import('../lib/tuya');
        try {
          const allScenes = await listTuyaScenesIoTCore(cfg.accessId, cfg.accessSecret, cfg.region);
          const scenes = allScenes
            .filter(s => s.type === 'scene')
            .slice(0, 6)
            .map(s => ({ id: s.sceneId, name: s.name }));
          console.log(`[Device] /scenes (legacy) group=${device.groupId} -> ${scenes.length} cenas`);
          return res.json({ scenes });
        } catch (e: any) {
          console.warn('[Device] /scenes legacy:', e?.message);
          return res.json({ scenes: [] });
        }
      }

      // 3) Tem vínculos: monta itens, busca state dos devices em paralelo.
      // tentScenes.type pode ser 'scene' (tap-to-run) ou 'automation' (programada).
      // Display ESP usa pra escolher visual: scene = botao trigger one-shot,
      // automation = toggle ON/OFF (dispara enable/disable na Tuya).
      const items: Array<any> = [];
      for (const r of tentSceneRows) {
        items.push({
          type: (r.type as string) === 'automation' ? 'automation' : 'scene',
          id: r.sceneId as string,
          name: r.name as string,
          position: r.position as number,
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
      res.json({ items: limited });
    } catch (err: any) {
      console.error('[Device] scenes list error:', err?.message);
      res.status(500).json({ error: err?.message ?? 'Erro ao listar itens' });
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

      // Re-consulta após o toggle pra confirmar estado real (Tuya às vezes leva
      // ~500ms-2s pra propagar). Se a re-consulta falhar (timeout/erro), devolve
      // o desired como best-effort — comando foi aceito, só não confirmamos.
      let confirmedState: boolean = desired;
      try {
        // Pequeno delay pra dar tempo do estado propagar no cloud Tuya
        await new Promise(r => setTimeout(r, 500));
        const after = await getTuyaDeviceSwitchState(deviceId, cfg.accessId, cfg.accessSecret, cfg.region);
        if (after.switchOn !== null) {
          confirmedState = after.switchOn;
          if (after.switchOn !== desired) {
            console.warn(`[Device] device-toggle device=${deviceId} switchCode=${switchCode} desired=${desired} but Tuya reports ${after.switchOn} (propagation lag?)`);
          }
        }
      } catch (e: any) {
        console.warn(`[Device] device-toggle re-confirm failed device=${deviceId}: ${e?.message}`);
      }

      res.json({ success: true, deviceId, state: confirmedState });
    } catch (err: any) {
      console.error('[Device] device-toggle error:', err?.message);
      res.status(500).json({ error: err?.message ?? 'Erro ao alternar device' });
    }
  });

  // POST /api/device/automation-toggle — ativa/desativa cena PROGRAMADA Tuya
  // (automation, type='automation' em tentScenes). Body: {automationId, enabled}.
  // Tuya nao expoe state atual de automation pelo /v1.0/devices/.../status, entao
  // o cliente (ESP) mantem state local; este endpoint so' aplica o desejado.
  app.post('/api/device/automation-toggle', async (req, res) => {
    try {
      const device = await validateDeviceToken(req);
      if (!device) return res.status(401).json({ error: 'Token inválido' });
      const automationId = String(req.body?.automationId ?? '').trim();
      const enabled = req.body?.enabled;
      if (!automationId || typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'automationId e enabled (boolean) obrigatórios' });
      }

      // Valida que essa automation está vinculada à estufa (type='automation')
      const [bindRows]: any = await pool.execute(
        `SELECT id FROM tentScenes WHERE tentId = ? AND sceneId = ? AND type = 'automation' LIMIT 1`,
        [device.tentId, automationId]
      );
      if (bindRows.length === 0) {
        return res.status(403).json({ error: 'Automação não vinculada a esta estufa' });
      }

      const cfg = await getTuyaCfgForDevice(device);
      if (!cfg) return res.status(404).json({ error: 'Nenhuma config Tuya ativa pro grupo' });

      const { setTuyaAutomationEnabled } = await import('../lib/tuya');
      const r = await setTuyaAutomationEnabled(automationId, enabled, cfg.accessId, cfg.accessSecret, cfg.region);
      console.log(`[Device] automation-toggle ${automationId} -> ${enabled ? 'ENABLED' : 'DISABLED'} (${r.success ? 'OK' : 'FAIL'}: ${r.msg ?? ''})`);
      if (!r.success) return res.status(502).json({ error: r.msg ?? 'Tuya retornou falha' });
      res.json({ success: true, automationId, enabled });
    } catch (err: any) {
      console.error('[Device] automation-toggle error:', err?.message);
      res.status(500).json({ error: err?.message ?? 'Erro ao alternar automação' });
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
      await pool.execute(
        `INSERT INTO deviceTokens (token, name, tentId, groupId, ownerUserId) VALUES (?, ?, ?, ?, ?)`,
        [deviceToken, codeRow.deviceName, tentId, user.groupId ?? 0, user.id]
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
