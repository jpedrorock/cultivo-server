import "dotenv/config";
import cookieParser from "cookie-parser";
import path from "path";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerAuthRoutes } from "./authRoutes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import uploadRouter from "../uploadRouter";
import { initializeStorageDirectories } from "../storageLocal";
import { ENV } from "./env";

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

    // Dispositivos controláveis (tomadas, relés, etc.) por estufa
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`tuyaDeviceMappings\` (
        \`id\`          INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\`      INT NOT NULL,
        \`tentId\`      INT NOT NULL,
        \`deviceId\`    VARCHAR(100) NOT NULL,
        \`deviceName\`  VARCHAR(200),
        \`switchCode\`  VARCHAR(50) NOT NULL DEFAULT 'switch_1',
        \`enabled\`     TINYINT(1) NOT NULL DEFAULT 1,
        \`createdAt\`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE KEY \`tuyaDeviceMappings_user_tent_dev\` (\`userId\`, \`tentId\`, \`deviceId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Tabela de cenas manuais
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`tuyaManualScenes\` (
        \`id\`        INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\`    INT NOT NULL,
        \`homeId\`    VARCHAR(50) NOT NULL,
        \`sceneId\`   VARCHAR(100) NOT NULL,
        \`name\`      VARCHAR(200) NOT NULL DEFAULT 'Cena',
        \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE KEY \`tuyaManualScenes_user_scene\` (\`userId\`, \`sceneId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Adicionar homeId à tuyaConfig se não existir
    const [cfgCols]: any = await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tuyaConfig'`
    );
    const cfgColNames = cfgCols.map((r: any) => r.COLUMN_NAME);
    if (!cfgColNames.includes('homeId')) {
      await conn.execute(`ALTER TABLE \`tuyaConfig\` ADD COLUMN \`homeId\` VARCHAR(50) NULL AFTER \`enabled\``);
      console.log("[DB] Coluna homeId adicionada à tuyaConfig");
    }

    // Adicionar coluna type à tuyaManualScenes se não existir
    const [manualCols]: any = await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tuyaManualScenes'`
    );
    const manualColNames = manualCols.map((r: any) => r.COLUMN_NAME);
    if (!manualColNames.includes('type')) {
      await conn.execute(`ALTER TABLE \`tuyaManualScenes\` ADD COLUMN \`type\` VARCHAR(20) NOT NULL DEFAULT 'tap' AFTER \`name\``);
      console.log("[DB] Coluna type adicionada à tuyaManualScenes");
    }

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
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    // CSP: permite scripts/styles inline (necessário para Vite/React) + imagens externas para fotos
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob: https:; " +
      "connect-src 'self' https:; " +
      "font-src 'self' data:; " +
      "frame-ancestors 'none';"
    );
    if (process.env.NODE_ENV === 'production') {
      // HSTS: força HTTPS por 1 ano (só em produção para não bloquear dev HTTP)
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // CORS — auto-detecta o próprio host + ALLOWED_ORIGINS opcional
  // Dev: aceita localhost em qualquer porta
  // Prod: aceita qualquer origin que bata com o Host da requisição (funciona em qualquer domínio)
  //       + entradas extras de ALLOWED_ORIGINS
  const extraOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : [];
  const isProd = process.env.NODE_ENV === 'production';

  app.use((req, res, next) => {
    const origin = req.headers.origin as string | undefined;

    // Sem origin = same-origin ou curl/server-to-server → sempre permitido
    if (!origin) { next(); return; }

    let allowed = false;
    if (!isProd) {
      // Dev: aceita qualquer localhost/127.0.0.1
      allowed = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    } else {
      // Prod: auto-detecta o próprio host via header (funciona atrás de proxy/Coolify)
      const host = (req.headers['x-forwarded-host'] as string || req.headers.host || '').split(':')[0];
      const selfOrigins = host ? [`https://${host}`, `http://${host}`] : [];
      allowed = [...selfOrigins, ...extraOrigins].includes(origin);
    }

    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,trpc-batch-mode');
    }

    if (req.method === 'OPTIONS') {
      res.sendStatus(allowed ? 204 : 403);
      return;
    }

    if (!allowed) {
      res.status(403).json({ error: 'CORS: origem não permitida' });
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

  // Landing page de redirecionamento para QR codes de plantas
  app.get("/scan/plant/:id", (req, res) => {
    const plantId = parseInt(req.params.id, 10);
    if (isNaN(plantId) || plantId <= 0) {
      res.status(400).send("QR inválido");
      return;
    }
    const appUrl = `/plants/${plantId}`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <title>Cultivo — Abrindo planta...</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: oklch(0.07 0.014 230);
      --card: oklch(0.14 0.012 240 / 0.85);
      --border: oklch(0.30 0.015 240 / 0.50);
      --primary: oklch(0.65 0.20 245);
      --primary-fg: oklch(0.97 0.01 245);
      --green: oklch(0.68 0.20 145);
      --text: oklch(0.97 0 0);
      --muted: oklch(0.55 0.010 240);
      --glow: color-mix(in oklch, oklch(0.62 0.17 245) 50%, transparent);
    }
    html, body {
      min-height: 100dvh;
      background:
        radial-gradient(ellipse 90% 65% at 5% -10%, var(--glow) 0%, transparent 65%),
        var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      gap: 0;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 40px;
    }
    .logo-icon {
      width: 42px; height: 42px;
      background: var(--green);
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px;
    }
    .logo-text { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 28px 24px;
      width: 100%;
      max-width: 340px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }
    .plant-icon {
      width: 64px; height: 64px;
      background: linear-gradient(135deg, oklch(0.22 0.028 155 / 0.8), oklch(0.15 0.015 240 / 0.6));
      border: 1px solid var(--border);
      border-radius: 18px;
      display: flex; align-items: center; justify-content: center;
      font-size: 32px;
    }
    .card-title { font-size: 18px; font-weight: 700; text-align: center; }
    .card-sub { font-size: 13px; color: var(--muted); text-align: center; }
    .spinner {
      width: 36px; height: 36px;
      border: 3px solid oklch(0.30 0.015 240 / 0.4);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn {
      display: flex; align-items: center; justify-content: center; gap-8px;
      width: 100%;
      padding: 15px 24px;
      background: var(--primary);
      color: var(--primary-fg);
      border: none; border-radius: 14px;
      font-size: 16px; font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      gap: 8px;
      -webkit-tap-highlight-color: transparent;
      transition: opacity 0.15s;
    }
    .btn:active { opacity: 0.85; }
    .ios-hint {
      display: none;
      background: oklch(0.12 0.012 240 / 0.9);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px 16px;
      font-size: 12px;
      color: var(--muted);
      line-height: 1.6;
      text-align: center;
      width: 100%; max-width: 340px;
      margin-top: 12px;
    }
    .ios-hint strong { color: var(--text); }
    .ios-hint .share-icon {
      display: inline-block;
      background: oklch(0.55 0.14 245);
      color: white;
      border-radius: 5px;
      padding: 1px 5px;
      font-size: 11px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="logo">
    <div class="logo-icon">🌱</div>
    <div class="logo-text">Cultivo</div>
  </div>

  <div class="card">
    <div class="plant-icon">🪴</div>
    <div>
      <div class="card-title">Abrindo planta #${plantId}</div>
      <div class="card-sub" style="margin-top:4px">Redirecionando para o app...</div>
    </div>
    <div class="spinner" id="spinner"></div>
    <a class="btn" href="${appUrl}" id="btn">
      <span>🌿</span> Abrir no App
    </a>
  </div>

  <div class="ios-hint" id="iosHint">
    <strong>Abrir sempre direto no app?</strong><br/>
    No Safari, toque em <span class="share-icon">⬆ Compartilhar</span> e selecione<br/>
    <strong>"Adicionar à Tela de Início"</strong>
  </div>

  <script>
    (function () {
      var dest = "${appUrl}";
      var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      var isStandalone = window.navigator.standalone === true;
      var isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|Chrome/.test(navigator.userAgent);

      // Auto-redirect depois de 1s
      setTimeout(function () {
        window.location.href = dest;
      }, 1000);

      // Mostrar dica de "Adicionar à Tela de Início" para iOS Safari (não PWA)
      if (isIOS && isSafari && !isStandalone) {
        document.getElementById('iosHint').style.display = 'block';
      }

      // Esconder spinner quando chegar a resposta
      document.getElementById('btn').addEventListener('click', function () {
        document.getElementById('spinner').style.display = 'none';
      });
    })();
  </script>
</body>
</html>`);
  });

  // Upload de imagens (multipart/form-data) — antes do tRPC
  app.use("/api/upload", uploadRouter);

  // Rota temporária de importação de banco (protegida por JWT_SECRET)
  {
    const multer = (await import("multer")).default;
    const { exec } = await import("child_process");
    const { writeFile, unlink } = await import("fs/promises");
    const os = await import("os");

    const sqlUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

    app.get("/admin/import", (req, res) => {
      if (req.query.secret !== ENV.jwtSecret) {
        res.status(401).send("Unauthorized");
        return;
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
        <title>Importar Banco — Cultivo</title>
        <style>body{font-family:sans-serif;background:#0d0d0d;color:#eee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
        .box{background:#1a1a1a;padding:2rem;border-radius:12px;min-width:340px;text-align:center}
        h2{margin:0 0 1.5rem}input[type=file]{margin:1rem 0;width:100%}
        button{background:#2563eb;color:#fff;border:none;padding:.75rem 2rem;border-radius:8px;cursor:pointer;font-size:1rem;width:100%}
        #status{margin-top:1rem;font-size:.9rem}</style></head>
      <body><div class="box"><h2>🌱 Importar SQL</h2>
        <form id="f" enctype="multipart/form-data">
          <input type="file" name="sql" accept=".sql" required>
          <button type="submit">Importar</button>
        </form>
        <div id="status"></div>
        <script>
          const f=document.getElementById('f'),s=document.getElementById('status');
          f.onsubmit=async e=>{e.preventDefault();s.textContent='Importando...';
            const fd=new FormData(f);
            const r=await fetch('/admin/import?secret=${encodeURIComponent(ENV.jwtSecret)}',{method:'POST',body:fd});
            const j=await r.json();
            s.textContent=j.message||j.error;s.style.color=r.ok?'#4ade80':'#f87171';};
        </script></div></body></html>`);
    });

    app.post("/admin/import", sqlUpload.single("sql"), async (req: any, res) => {
      if (req.query.secret !== ENV.jwtSecret) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "Nenhum arquivo enviado" });
        return;
      }
      try {
        const mysql2 = await import("mysql2/promise");
        const dbUrl = new URL(ENV.databaseUrl);
        const conn = await mysql2.createConnection({
          host: dbUrl.hostname,
          port: parseInt(dbUrl.port || "3306"),
          user: dbUrl.username,
          password: decodeURIComponent(dbUrl.password),
          database: dbUrl.pathname.slice(1),
          ssl: { rejectUnauthorized: false },
          multipleStatements: true,
        });
        // Modo permissivo para compatibilidade com dumps de versões antigas
        await conn.query("SET sql_mode = ''");
        // Limpar tabelas existentes antes de importar
        await conn.query("SET FOREIGN_KEY_CHECKS=0");
        const [tables] = await conn.query("SHOW TABLES") as any;
        for (const row of tables) {
          const tableName = Object.values(row)[0] as string;
          await conn.query(`DROP TABLE IF EXISTS \`${tableName}\``);
        }
        await conn.query("SET FOREIGN_KEY_CHECKS=1");

        const sql = req.file.buffer.toString("utf8")
          // MariaDB collation não suportada pelo MySQL 8.0
          .replace(/utf8mb4_uca1400_ai_ci/g, "utf8mb4_unicode_ci")
          .replace(/utf8mb3_uca1400_ai_ci/g, "utf8_unicode_ci")
          // MySQL 8.0 não aceita DEFAULT não-nulo em colunas TEXT/BLOB/JSON
          .replace(
            /\b(text|blob|longtext|mediumtext|tinytext|json|longblob|mediumblob|tinyblob)\b(\s+NOT NULL)?\s+DEFAULT\s+'[^']*'/gi,
            (_m, type, notNull) => `${type}${notNull ?? ''} DEFAULT NULL`
          );
        await conn.query(sql);
        await conn.end();
        res.json({ message: "✅ Banco importado com sucesso!" });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });
  }

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
