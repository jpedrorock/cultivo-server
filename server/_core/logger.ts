/**
 * Logger estruturado (pino) — JSON em produção, pretty em dev.
 *
 * Uso:
 *   import { logger } from "./logger";
 *   logger.info({ userId }, "user signed in");
 *   logger.error({ err, ctx }, "failed to save");
 *
 * HTTP:
 *   import { httpLogger } from "./logger";
 *   app.use(httpLogger);  // adiciona req.log e logs por request
 *
 * Cada request ganha um `requestId` automático (header X-Request-Id quando
 * fornecido pelo proxy, ou UUID novo). Use `req.log` para logar dentro de
 * handlers — todas as entradas terão o mesmo `req.id` para correlação.
 */

import pino, { type LoggerOptions } from "pino";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const isProduction = process.env.NODE_ENV === "production";

const baseOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  base: { app: "cultivo-server" },
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "*.passwordHash",
      "*.password",
      "*.secret",
      "*.token",
      "*.apiKey",
    ],
    censor: "[REDACTED]",
  },
};

// Em dev: stream pretty colorido. Em prod: JSON puro (logs agregáveis)
export const logger = isProduction
  ? pino(baseOptions)
  : pino({
      ...baseOptions,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname,app",
          singleLine: false,
        },
      },
    });

/**
 * Middleware HTTP — anexa `req.log` e gera linha por request.
 *
 * Configurações:
 *  - genReqId: usa X-Request-Id se vier do proxy, senão UUID
 *  - level customizado: 4xx = warn, 5xx = error, resto = info
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req: IncomingMessage) => {
    const headerId = req.headers["x-request-id"];
    if (typeof headerId === "string" && headerId.length > 0) return headerId;
    return randomUUID();
  },
  customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    if (res.statusCode >= 300) return "silent";  // redirects são ruído
    return "info";
  },
  customSuccessMessage: (req: IncomingMessage, res: ServerResponse) => {
    return `${req.method} ${req.url} → ${res.statusCode}`;
  },
  customErrorMessage: (req: IncomingMessage, res: ServerResponse, err: Error) => {
    return `${req.method} ${req.url} → ${res.statusCode} (${err.message})`;
  },
  // Não loga assets estáticos / health checks (ruído)
  autoLogging: {
    ignore: (req: IncomingMessage) => {
      const url = req.url ?? "";
      return (
        url.startsWith("/uploads/") ||
        url.startsWith("/assets/") ||
        url.startsWith("/@vite/") ||
        url.startsWith("/@fs/") ||
        url.startsWith("/@id/") ||
        url.startsWith("/src/") ||
        url.startsWith("/node_modules/") ||
        url === "/health" ||
        url === "/favicon.ico" ||
        url === "/api/auth/me"
      );
    },
  },
  serializers: {
    // Reduz ruído nos request logs — só fica com método, url, id
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});
