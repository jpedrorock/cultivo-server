import "dotenv/config";
import cookieParser from "cookie-parser";
import path from "path";
import express from "express";
import { createServer } from "http";
import net from "net";
import crypto from "node:crypto";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerAuthRoutes } from "./authRoutes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import uploadRouter from "../uploadRouter";
import { initializeStorageDirectories } from "../storageLocal";
import { getMysqlPool } from "../mysql-pool";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function ensurePushSubscriptionsTable() {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return;
    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(connectionString);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`pushSubscriptions\` (
        \`id\`              INT AUTO_INCREMENT PRIMARY KEY,
        \`endpoint\`        TEXT NOT NULL,
        \`keysJson\`        TEXT NOT NULL,
        \`reminderEnabled\` TINYINT(1) NOT NULL DEFAULT 0,
        \`reminderTimes\`   TEXT,
        \`createdAt\`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        \`updatedAt\`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.end();
    console.log("[DB] Tabela pushSubscriptions OK");
  } catch (err: any) {
    console.warn("[DB] Erro ao criar pushSubscriptions:", err?.message);
  }
}

async function ensureUsersApprovedColumn() {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return;
    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(connectionString);

    const [rows]: any = await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`
    );
    const existingCols = rows.map((r: any) => r.COLUMN_NAME);

    if (!existingCols.includes('approved')) {
      // Adicionar coluna — usuários existentes recebem approved=TRUE para não perder acesso
      await conn.execute(`ALTER TABLE \`users\` ADD COLUMN \`approved\` TINYINT(1) NOT NULL DEFAULT 1`);
      console.log("[DB] Coluna approved adicionada à tabela users (existentes aprovados automaticamente)");
    }

    await conn.end();
  } catch (err: any) {
    console.warn("[DB] Erro ao migrar users.approved:", err?.message);
  }
}

async function ensureNotificationSettingsColumns() {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return;
    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(connectionString);

    // Verificar quais colunas já existem (compatível com MySQL 5.7+)
    const [rows]: any = await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notificationSettings'`
    );
    const existingCols = rows.map((r: any) => r.COLUMN_NAME);

    if (!existingCols.includes('dailyReminderEnabled')) {
      await conn.execute(`ALTER TABLE \`notificationSettings\` ADD COLUMN \`dailyReminderEnabled\` TINYINT(1) NOT NULL DEFAULT 0`);
      console.log("[DB] Coluna dailyReminderEnabled adicionada");
    }
    if (!existingCols.includes('reminderTimes')) {
      await conn.execute(`ALTER TABLE \`notificationSettings\` ADD COLUMN \`reminderTimes\` TEXT DEFAULT '[]'`);
      console.log("[DB] Coluna reminderTimes adicionada");
    }

    await conn.end();
    console.log("[DB] Colunas notificationSettings OK");
  } catch (err: any) {
    console.warn("[DB] Erro ao migrar notificationSettings:", err?.message);
  }
}

async function ensureUserAiSettingsTable() {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return;
    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(connectionString);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`userAiSettings\` (
        \`id\`        INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\`    INT NOT NULL,
        \`provider\`  VARCHAR(32) NOT NULL,
        \`apiKey\`    TEXT NOT NULL,
        \`model\`     VARCHAR(64),
        \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
        UNIQUE KEY \`userAiSettings_userId_unique\` (\`userId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.end();
    console.log("[DB] Tabela userAiSettings OK");
  } catch (err: any) {
    console.warn("[DB] Erro ao criar userAiSettings:", err?.message);
  }
}

async function ensureAiChatMessagesTable() {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return;
    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(connectionString);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`aiChatMessages\` (
        \`id\`        INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\`    INT NOT NULL,
        \`plantId\`   INT,
        \`role\`      ENUM('user','assistant') NOT NULL,
        \`content\`   TEXT NOT NULL,
        \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        INDEX \`userPlantIdx\` (\`userId\`, \`plantId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.end();
    console.log("[DB] Tabela aiChatMessages OK");
  } catch (err: any) {
    console.warn("[DB] Erro ao criar aiChatMessages:", err?.message);
  }
}

async function ensureSourceColumn() {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return;
    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(connectionString);
    try {
      await conn.execute(
        `ALTER TABLE \`dailyLogs\` ADD COLUMN \`source\` VARCHAR(10) NOT NULL DEFAULT 'MANUAL'`
      );
      console.log("[DB] Coluna source adicionada à tabela dailyLogs");
    } catch (alterErr: any) {
      if (alterErr?.code === 'ER_DUP_FIELDNAME') {
        // Coluna já existe — OK
      } else {
        throw alterErr;
      }
    }
    await conn.end();
    console.log("[DB] Coluna dailyLogs.source OK");
  } catch (err: any) {
    console.warn("[DB] Erro ao migrar dailyLogs.source:", err?.message);
  }
}

async function ensureTuyaTables() {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return;
    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(connectionString);

    // Credenciais Tuya por usuário
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`tuyaConfig\` (
        \`id\`              INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\`          INT NOT NULL,
        \`accessId\`        VARCHAR(100) NOT NULL,
        \`accessSecret\`    VARCHAR(100) NOT NULL,
        \`region\`          VARCHAR(10) NOT NULL DEFAULT 'eu',
        \`pollIntervalMin\` INT NOT NULL DEFAULT 60,
        \`enabled\`         TINYINT(1) NOT NULL DEFAULT 1,
        \`createdAt\`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        \`updatedAt\`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
        UNIQUE KEY \`tuyaConfig_userId\` (\`userId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Mapeamento dispositivo ↔ estufa por usuário
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`tuyaSensorMappings\` (
        \`id\`          INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\`      INT NOT NULL,
        \`tentId\`      INT NOT NULL,
        \`deviceId\`    VARCHAR(100) NOT NULL,
        \`deviceName\`  VARCHAR(200),
        \`enabled\`     TINYINT(1) NOT NULL DEFAULT 1,
        \`createdAt\`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE KEY \`tuyaSensorMappings_userId_tentId\` (\`userId\`, \`tentId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Cache da última leitura por dispositivo
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`sensorLatestReadings\` (
        \`id\`        INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\`    INT NOT NULL,
        \`deviceId\`  VARCHAR(100) NOT NULL,
        \`tempC\`     DECIMAL(4,1),
        \`rhPct\`     DECIMAL(4,1),
        \`readAt\`    TIMESTAMP NOT NULL,
        \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
        UNIQUE KEY \`sensorLatestReadings_deviceId\` (\`deviceId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.end();
    console.log("[DB] Tabelas Tuya OK");
  } catch (err: any) {
    console.warn("[DB] Erro ao criar tabelas Tuya:", err?.message);
  }
}

async function ensurePlantLSTLogsColumns() {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return;
    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(connectionString);

    const [rows]: any = await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'plantLSTLogs'`
    );
    const existingCols = rows.map((r: any) => r.COLUMN_NAME);

    if (!existingCols.includes('techniqueConfig')) {
      await conn.execute(`ALTER TABLE \`plantLSTLogs\` ADD COLUMN \`techniqueConfig\` TEXT`);
      console.log("[DB] Coluna techniqueConfig adicionada em plantLSTLogs");
    }
    if (!existingCols.includes('actualResult')) {
      await conn.execute(`ALTER TABLE \`plantLSTLogs\` ADD COLUMN \`actualResult\` TEXT`);
      console.log("[DB] Coluna actualResult adicionada em plantLSTLogs");
    }
    if (!existingCols.includes('nodePosition')) {
      await conn.execute(`ALTER TABLE \`plantLSTLogs\` ADD COLUMN \`nodePosition\` VARCHAR(200)`);
      console.log("[DB] Coluna nodePosition adicionada em plantLSTLogs");
    }
    if (!existingCols.includes('snapshotJson')) {
      await conn.execute(`ALTER TABLE \`plantLSTLogs\` ADD COLUMN \`snapshotJson\` LONGTEXT`);
      console.log("[DB] Coluna snapshotJson adicionada em plantLSTLogs");
    }

    await conn.end();
    console.log("[DB] Colunas plantLSTLogs OK");
  } catch (err: any) {
    console.warn("[DB] Erro ao migrar plantLSTLogs:", err?.message);
  }
}

async function ensureStandaloneTasksTable() {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return;
    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(connectionString);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`standaloneTasks\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\` INT NOT NULL,
        \`tentId\` INT,
        \`title\` VARCHAR(200) NOT NULL,
        \`description\` TEXT,
        \`priority\` ENUM('LOW','MEDIUM','HIGH') DEFAULT 'MEDIUM' NOT NULL,
        \`dueDate\` TIMESTAMP NULL,
        \`isDone\` TINYINT(1) DEFAULT 0 NOT NULL,
        \`completedAt\` TIMESTAMP NULL,
        \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        INDEX \`standaloneUserIdx\` (\`userId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.end();
    console.log("[DB] Tabela standaloneTasks OK");
  } catch (err: any) {
    console.warn("[DB] Erro ao criar standaloneTasks:", err?.message);
  }
}

async function ensureStrainOriginColumn() {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return;
    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(connectionString);
    const [rows]: any = await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'strains' AND COLUMN_NAME = 'origin'`
    );
    if (rows.length === 0) {
      await conn.execute(
        `ALTER TABLE \`strains\` ADD COLUMN \`origin\` ENUM('FEMINIZED','AUTOFLOWER','CLONE') DEFAULT 'FEMINIZED'`
      );
      console.log("[DB] Coluna origin adicionada em strains");
    }
    await conn.end();
  } catch (err: any) {
    console.warn("[DB] Erro ao migrar strains origin:", err?.message);
  }
}

async function ensureDeviceTokensTable() {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return;
    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(connectionString);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`deviceTokens\` (
        \`id\`        INT AUTO_INCREMENT PRIMARY KEY,
        \`token\`     VARCHAR(64) NOT NULL UNIQUE,
        \`name\`      VARCHAR(100) NOT NULL,
        \`tentId\`    INT NOT NULL,
        \`groupId\`   INT NOT NULL,
        \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.end();
    console.log("[DB] Tabela deviceTokens OK");
  } catch (err: any) {
    console.warn("[DB] Erro ao criar deviceTokens:", err?.message);
  }
}

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

  // GET /api/device/scenes — lista cenas Tuya manuais do grupo do device.
  // ESP usa pra popular o grid Cenas dinamicamente (em vez de SCENES[]
  // hardcoded). Max 12 cenas (grid 2x6 do display).
  // Resposta: { scenes: [{id, name}, ...] }
  // Opt-in homeId via env TUYA_HOME_ID — se nao setado, tenta endpoints
  // genericos sem space_id.
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
        return res.json({ scenes: [] });  // sem config Tuya: lista vazia (UI mostra fallback)
      }
      const cfg = cfgRows[0];
      const homeId = parseInt(process.env.TUYA_HOME_ID ?? '0') || 0;

      const { listManualScenes } = await import('../lib/tuya');
      const scenes = await listManualScenes(homeId, cfg.accessId, cfg.accessSecret, cfg.region);
      console.log(`[Device] /scenes group=${device.groupId} -> ${scenes.length} cenas`);
      res.json({ scenes });
    } catch (err: any) {
      console.error('[Device] scenes list error:', err?.message);
      res.status(500).json({ error: err?.message ?? 'Erro ao listar cenas' });
    }
  });

  // POST /api/device/scene-by-id/:sceneId/trigger — dispara cena Tuya por ID
  // real (sceneId vem de /api/device/scenes). Usado pelo grid dinamico de
  // Cenas no ESP. Diferente do /scene/:slotIdx/trigger que usa env vars.
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
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Garantir que a tabela pushSubscriptions existe (migration incremental)
  await ensurePushSubscriptionsTable();

  // Garantir que a coluna approved existe na tabela users
  await ensureUsersApprovedColumn();

  // Garantir que as colunas de lembrete diário existem na tabela notificationSettings
  await ensureNotificationSettingsColumns();

  // Garantir que as colunas extras de plantLSTLogs existem (snapshotJson, techniqueConfig, etc.)
  await ensurePlantLSTLogsColumns();

  // Garantir que a tabela de configurações de IA do usuário existe
  await ensureUserAiSettingsTable();

  // Garantir que a tabela de histórico do chat de IA existe
  await ensureAiChatMessagesTable();

  // Garantir que as tabelas de integração Tuya/SmartLife existem
  await ensureTuyaTables();

  // Garantir que a tabela standaloneTasks existe
  await ensureStandaloneTasksTable();

  // Garantir que a coluna origin existe na tabela strains
  await ensureStrainOriginColumn();

  // Garantir que a coluna source existe na tabela dailyLogs
  await ensureSourceColumn();

  // Garantir que a tabela deviceTokens existe (Fase D — terminais ESP32)
  await ensureDeviceTokensTable();

  // Inicializar estrutura de diretórios de uploads
  initializeStorageDirectories();

  // Inicializar cron job de verificação de alertas
  const { startAlertsCheckerCron } = await import("../cron/alertsChecker");
  startAlertsCheckerCron();

  // Inicializar cron job de lembretes diários (verifica a cada minuto)
  const { startDailyReminderCron } = await import("../cron/dailyReminder");
  startDailyReminderCron();

  // Inicializar cron job de leitura de sensores Tuya/SmartLife
  const { startTuyaPollerCron } = await import("../cron/tuyaPoller");
  startTuyaPollerCron();

  // Security headers inline (sem dependência de pacote externo)
  if (process.env.NODE_ENV === 'production') {
    app.use((_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('X-XSS-Protection', '0');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
      next();
    });
  }

  // CORS inline — se ALLOWED_ORIGINS estiver definida, restringir; caso contrário, permitir tudo
  // (proteção CSRF principal vem do cookie sameSite:lax + httpOnly)
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [];
  app.use((req, res, next) => {
    const origin = req.headers.origin as string | undefined;
    const isProd = process.env.NODE_ENV === 'production';

    // Determinar se origin é permitida
    let allowed = true;
    if (origin && isProd && allowedOrigins.length > 0) {
      allowed = allowedOrigins.includes(origin);
    }

    if (allowed && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,trpc-batch-mode');
    }

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    if (!allowed) {
      res.status(403).json({ error: `CORS: origem não permitida — ${origin}` });
      return;
    }

    next();
  });

  // Body parser com limite maior para uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Cookie parser para autenticação JWT
  app.use(cookieParser());

  // Servir arquivos estáticos da pasta /uploads
  const uploadsPath = path.join(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsPath, {
    maxAge: '7d', // Cache de 7 dias para imagens
    etag: true,
  }));

  // Rotas de autenticação JWT (registro, login, logout, me)
  registerAuthRoutes(app);

  // Rotas REST para terminais ESP32 (/api/device/*)
  registerDeviceRoutes(app);

  // Upload de imagens (multipart/form-data) — antes do tRPC
  app.use("/api/upload", uploadRouter);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Desenvolvimento: Vite dev server | Produção: arquivos estáticos
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`\n🌱 App Cultivo Server rodando em http://localhost:${port}/`);
    console.log(`📁 Uploads: ${uploadsPath}`);
    console.log(`🔐 Auth: JWT (email/senha)`);
    console.log(`⏰ AlertsChecker: Cron job ativo`);
  console.log(`🔔 DailyReminder: Cron job ativo\n`);
  });
}

startServer().catch(console.error);
