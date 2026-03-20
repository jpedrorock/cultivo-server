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

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Garantir que a tabela pushSubscriptions existe (migration incremental)
  await ensurePushSubscriptionsTable();

  // Garantir que a coluna approved existe na tabela users
  await ensureUsersApprovedColumn();

  // Garantir que as colunas de lembrete diário existem na tabela notificationSettings
  await ensureNotificationSettingsColumns();

  // Inicializar estrutura de diretórios de uploads
  initializeStorageDirectories();

  // Inicializar cron job de verificação de alertas
  const { startAlertsCheckerCron } = await import("../cron/alertsChecker");
  startAlertsCheckerCron();

  // Inicializar cron job de lembretes diários (verifica a cada minuto)
  const { startDailyReminderCron } = await import("../cron/dailyReminder");
  startDailyReminderCron();

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
