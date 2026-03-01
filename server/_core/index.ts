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

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Inicializar estrutura de diretórios de uploads
  initializeStorageDirectories();

  // Inicializar cron job de verificação de alertas
  const { startAlertsCheckerCron } = await import("../cron/alertsChecker");
  startAlertsCheckerCron();

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
    console.log(`⏰ AlertsChecker: Cron job ativo\n`);
  });
}

startServer().catch(console.error);
