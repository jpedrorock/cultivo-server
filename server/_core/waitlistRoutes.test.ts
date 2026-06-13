/**
 * waitlistRoutes.test.ts — testes unitários para o endpoint de waitlist.
 *
 * Estratégia:
 * - mysql-pool: mock de getMysqlPool → { execute: spy }
 * - emailService: mock de sendWelcomeEmail → spy
 * - express-rate-limit: mock passthrough (não testar throttling aqui)
 * - HTTP: fetch global (Node.js 18+) contra servidor Express temporário em porta aleatória
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// ── vi.hoisted: variáveis disponíveis ANTES da hoisting dos vi.mock ───────────
const mockExecute = vi.hoisted(() => vi.fn());
const mockSendWelcomeEmail = vi.hoisted(() => vi.fn());

// ── Mock do pool MySQL ────────────────────────────────────────────────────────
vi.mock('../mysql-pool', () => ({
  getMysqlPool: () => ({ execute: mockExecute }),
}));

// ── Mock do serviço de email ─────────────────────────────────────────────────
vi.mock('./emailService', () => ({
  sendWelcomeEmail: mockSendWelcomeEmail,
}));

// ── Mock do rate limiter → passthrough em testes ─────────────────────────────
vi.mock('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ── Import após mocks ─────────────────────────────────────────────────────────
import { registerWaitlistRoutes } from './waitlistRoutes';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  registerWaitlistRoutes(app);
  return app;
}

function startServer(
  app: express.Express,
): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

// ── Testes ─────────────────────────────────────────────────────────────────────
describe('waitlistRoutes', () => {
  let port: number;
  let closeServer: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
    mockSendWelcomeEmail.mockResolvedValue(undefined);

    const server = await startServer(makeApp());
    port = server.port;
    closeServer = server.close;
  });

  afterEach(async () => {
    await closeServer();
  });

  it('POST com email válido retorna 200 com success: true', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', locale: 'en' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ success: true });
    expect(mockExecute).toHaveBeenCalledOnce();
  });

  it('POST sem email retorna 400 com campo error', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'pt' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('error');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('POST com email inválido retorna 400 com Invalid email format', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ error: 'Invalid email format' });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('mesmo email enviado duas vezes retorna 200 nas duas (idempotência via INSERT IGNORE)', async () => {
    mockExecute
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 0 }]);

    const payload = JSON.stringify({ email: 'dup@example.com', locale: 'pt' });
    const headers = { 'Content-Type': 'application/json' };

    const res1 = await fetch(`http://127.0.0.1:${port}/api/waitlist`, {
      method: 'POST',
      headers,
      body: payload,
    });
    const res2 = await fetch(`http://127.0.0.1:${port}/api/waitlist`, {
      method: 'POST',
      headers,
      body: payload,
    });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('email de boas-vindas é disparado após signup bem-sucedido', async () => {
    await fetch(`http://127.0.0.1:${port}/api/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'welcome@test.com', locale: 'pt' }),
    });

    expect(mockSendWelcomeEmail).toHaveBeenCalledWith('welcome@test.com', 'pt');
  });

  it('origin não permitida retorna 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/waitlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.com',
      },
      body: JSON.stringify({ email: 'x@evil.com' }),
    });

    expect(res.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
