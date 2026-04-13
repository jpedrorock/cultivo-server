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
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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
