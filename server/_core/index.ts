import "dotenv/config";
import cookieParser from "cookie-parser";
import path from "path";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerAuthRoutes } from "./authRoutes";
import { registerAppleAuthRoutes } from "./appleAuthRoutes";
import { registerDeviceRoutes } from "./deviceRoutes";
import { registerWaitlistRoutes } from "./waitlistRoutes";
import { registerLegalRoutes } from "./legalRoutes";
import { registerSiteSettingsRoutes } from "./siteSettingsRoutes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import uploadRouter from "../uploadRouter";
import { initializeStorageDirectories } from "../storageLocal";
import { ENV } from "./env";
import { httpLogger, logger } from "./logger";

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

// As migrations de schema vivem em ./dbMigrations.ts (um único arquivo,
// um único pool MySQL compartilhado). Antes haviam 10 funções `ensure*`
// aqui, cada uma abrindo sua própria conexão TCP.
import { runMigrations } from "./dbMigrations";


async function startServer() {
  const app = express();
  const server = createServer(app);

  // Em produção, app fica atrás de proxy (Traefik/Coolify) — confiar nos
  // headers X-Forwarded-* para que req.ip retorne o IP real do cliente.
  // Sem isso, rate-limit veria todos os requests vindo do mesmo IP (proxy).
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);   // 1 hop = só o proxy mais próximo (Traefik)
  }

  // Logger HTTP estruturado — anexa req.log e gera linha por request
  // com requestId (UUID ou X-Request-Id do proxy). Devolve 4xx=warn, 5xx=error.
  app.use(httpLogger);
  // Devolve o request id no response (útil pra debug — usuário pode reportar)
  app.use((req: any, res, next) => {
    if (req.id) res.setHeader("X-Request-Id", String(req.id));
    next();
  });

  // Security headers via Helmet — DEVE vir antes de qualquer route handler
  // para que os headers sejam aplicados a todas as respostas.
  // Em prod: CSP estrita (sem 'unsafe-eval'). Em dev: liberta 'unsafe-eval'
  // para o HMR do Vite e React Refresh funcionarem.
  const { default: helmet } = await import("helmet");
  const isProd = process.env.NODE_ENV === 'production';
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: isProd
          ? ["'self'", "'unsafe-inline'", "https://static.cloudflareinsights.com"]
          : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        // connectSrc whitelist explícita — antes era "https:" (qualquer HTTPS),
        // o que permitia exfiltração arbitrária via XSS. Adicionar domínios
        // aqui APENAS se o CLIENT (browser/WebView) precisar chamar diretamente.
        // Chamadas server-to-server (IA providers, Tuya, open-meteo) NÃO entram
        // aqui — só passam pelo backend.
        connectSrc: [
          "'self'",
          "https://app.cultivo.pro",
          "https://cultivo.pro",
          "https://static.cloudflareinsights.com",    // analytics beacon
          ...(isProd ? [] : ["ws:", "wss:", "http://localhost:*"]),
        ],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-site" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    strictTransportSecurity: isProd
      ? { maxAge: 31536000, includeSubDomains: true, preload: false }
      : false,
    xPermittedCrossDomainPolicies: { permittedPolicies: "none" },
    xFrameOptions: { action: "sameorigin" },
    xContentTypeOptions: true,
    xPoweredBy: true,                           // remove X-Powered-By: Express
    xXssProtection: false,                      // header deprecado, melhor não enviar
  }));
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()');
    next();
  });

  // Healthcheck — útil para Docker HEALTHCHECK / k8s readiness
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: Math.floor(process.uptime()), ts: Date.now() });
  });

  // Aplica todas as migrations de schema (CREATE TABLE / ADD COLUMN +
  // políticas de FK ON DELETE) usando o pool MySQL compartilhado.
  // Antes: 10 chamadas `ensure*` separadas, cada uma abrindo conexão dedicada.
  // Não-fatal: erro de migration não derruba o servidor — app continua,
  // logs mostram o problema e o operador pode corrigir sem downtime total.
  try {
    await runMigrations();
  } catch (migErr) {
    console.error('[Startup] ⚠️  Migrations falharam (app continua):', (migErr as Error).message);
  }


  // Inicializar estrutura de diretórios de uploads
  initializeStorageDirectories();

  // Inicializar cron job de verificação de alertas
  const { startAlertsCheckerCron } = await import("../cron/alertsChecker");
  startAlertsCheckerCron();

  // Inicializar cron job de lembretes diários (verifica a cada minuto)
  const { startDailyReminderCron } = await import("../cron/dailyReminder");
  startDailyReminderCron();

  // Inicializar cron de "registro incompleto" — só pra estufas COM Tuya
  // ativo, notifica se sem registro completo (pH+EC+foto) há 3 dias
  const { startIncompleteRegistrationCron } = await import("../cron/incompleteRegistration");
  startIncompleteRegistrationCron();

  // Inicializar cron job de leitura de sensores Tuya/SmartLife
  const { startTuyaPollerCron } = await import("../cron/tuyaPoller");
  startTuyaPollerCron();

  // CORS — auto-detecta o próprio host + ALLOWED_ORIGINS opcional
  // Dev: aceita localhost em qualquer porta
  // Prod: aceita qualquer origin que bata com o Host da requisição (funciona em qualquer domínio)
  //       + entradas extras de ALLOWED_ORIGINS
  const extraOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : [];

  // Origens permitidas para apps mobile Capacitor empacotado.
  // iOS:     "capacitor://localhost"
  // Android: "https://localhost"
  // Essas duas são sempre aceitas em qualquer ambiente — são scheme exclusivo
  // do WebView empacotado, não atingíveis por browser comum.
  //
  // "http://localhost" foi REMOVIDO do allow-list de prod por ser atingível
  // por browser comum em qualquer máquina (ex: alguém abrindo
  // http://localhost:8080/malicioso.html e fazendo CSRF cross-origin pra API
  // de prod). Continua aceito em dev pelo regex genérico abaixo.
  const capacitorOrigins = ['capacitor://localhost', 'https://localhost'];

  app.use((req, res, next) => {
    const origin = req.headers.origin as string | undefined;

    // Sem origin = same-origin ou curl/server-to-server → sempre permitido
    if (!origin) { next(); return; }

    let allowed = false;

    // Capacitor (iOS/Android nativo) — sempre permitido independente de ambiente
    if (capacitorOrigins.includes(origin)) {
      allowed = true;
    } else if (!isProd) {
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
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,trpc-batch-mode,X-Client');
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

  // Body parser — 5MB cobre payloads tRPC e bases64 pequenos (e.g. avatares).
  // Uploads de imagem reais (fotos de planta) passam por /api/upload (multipart)
  // que tem seu próprio limite no multer. Antes era 50MB no JSON global o que
  // permitia DoS via payloads gigantes mesmo após auth.
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ limit: "5mb", extended: true }));

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

  // Sign in with Apple — obrigatório pra App Store enquanto existir Google OAuth
  // (Guideline 4.8). Endpoint só responde se APPLE_CLIENT_ID estiver setado.
  registerAppleAuthRoutes(app);

  // Rotas REST p/ ESP32 display (X-Device-Token auth, sem JWT)
  registerDeviceRoutes(app);

  // Captura de email do site público cultivo.pro (POST /api/waitlist)
  registerWaitlistRoutes(app);

  // Configurações globais do site (painel /admin do cultivo-site)
  registerSiteSettingsRoutes(app);

  // Páginas legais (Privacy Policy + Terms of Service) servidas estaticamente
  // em /privacy e /terms — pré-requisito Apple/Google Play.
  registerLegalRoutes(app);

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

  // ❌ REMOVIDO: rotas /admin/import e /admin/import-photos
  //
  // Eram backdoors administrativos autenticados por ?secret=$JWT_SECRET na
  // querystring — secret vazava em logs de proxy (nginx/Traefik), header
  // Referer, histórico do browser, screenshots de operação, etc. Quem
  // descobre o secret pode forjar JWTs de qualquer usuário, dropar todo o
  // banco, e descriptografar API keys de IA dos usuários (mesmo secret).
  //
  // Para importar dump SQL ou ZIP de fotos em produção, use a Terminal do
  // Coolify (ou SSH) e execute scripts CLI direto no container. Exemplos:
  //
  //   # SQL:
  //   docker exec -i $APP_CONTAINER mysql -u user -p$MYSQL_PASSWORD cultivo < dump.sql
  //
  //   # Fotos (zip → /app/uploads):
  //   docker cp fotos.zip $APP_CONTAINER:/tmp/
  //   docker exec $APP_CONTAINER sh -c 'cd /tmp && unzip -o fotos.zip -d /app/uploads/'
  //
  // Em ambos os casos, o operador tem que ter acesso ao servidor — não dá
  // para escalar privilégio a partir do navegador.

  // Rate limit no tRPC — protege contra DoS de cliente autenticado.
  // 600 req/min por IP é folgado: a Home faz ~5-10 queries em batch (= 1 HTTP
  // request), e há polling em alguns hooks. Atacante consegue no máximo 10
  // requests/seg antes de tomar 429.
  const { default: rateLimit } = await import("express-rate-limit");
  const trpcLimiter = rateLimit({
    windowMs: 60 * 1000,            // 1 minuto
    limit: 600,                     // 600 requests/min/IP
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Muitas requisições. Aguarde um momento." },
  });

  // tRPC API
  app.use(
    "/api/trpc",
    trpcLimiter,
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

  // Shutdown gracioso — fecha pools MySQL antes de encerrar
  // para evitar conexões zumbis e dar chance das queries em andamento finalizarem.
  let shuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[Shutdown] Recebido ${signal} — encerrando graciosamente...`);

    // Para de aceitar novas conexões HTTP
    server.close((err) => {
      if (err) console.warn('[Shutdown] Erro ao fechar HTTP server:', err.message);
      else console.log('[Shutdown] HTTP server fechado');
    });

    // Fecha pools de banco (Drizzle + raw)
    try {
      const { closeDb } = await import('../db');
      const { closeMysqlPool } = await import('../mysql-pool');
      await Promise.allSettled([closeDb(), closeMysqlPool()]);
    } catch (err: any) {
      console.warn('[Shutdown] Erro ao fechar pools:', err?.message);
    }

    // Force-exit após 10s caso algo trave (cron, requests pendurados)
    setTimeout(() => {
      console.warn('[Shutdown] Timeout — forçando saída');
      process.exit(1);
    }, 10_000).unref();

    process.exit(0);
  };

  process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
  process.on('SIGINT',  () => { void gracefulShutdown('SIGINT'); });
}

startServer().catch(console.error);
