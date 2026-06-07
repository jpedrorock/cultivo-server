/**
 * waitlistRoutes.test.ts — Testes unitários para POST /api/waitlist
 *
 * Estratégia:
 *  - express-rate-limit: mocked como passthrough (sem limite em testes)
 *  - mysql-pool: pool.execute mockado via vi.mock
 *  - emailService: sendWelcomeEmail mockado via vi.mock
 *  - HTTP: Express + http.createServer + fetch nativo (Node 18+)
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import http from 'node:http';

// ── vi.hoisted: refs disponíveis ANTES da hoisting dos vi.mock ────────────────
const mockExecute = vi.hoisted(() => vi.fn());
const mockSendWelcomeEmail = vi.hoisted(() => vi.fn());

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Bypassa o rate limiter: cada request segue direto para o handler
vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../mysql-pool', () => ({
  getMysqlPool: vi.fn(() => ({ execute: mockExecute })),
}));

vi.mock('./emailService', () => ({
  sendWelcomeEmail: mockSendWelcomeEmail,
}));

import { registerWaitlistRoutes } from './waitlistRoutes';

// ── Servidor HTTP de teste ────────────────────────────────────────────────────
let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerWaitlistRoutes(app);
  await new Promise<void>((resolve) => {
    server = http.createServer(app).listen(0, () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://localhost:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function post(body: unknown, origin = 'https://cultivo.pro') {
  return fetch(`${baseUrl}/api/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify(body),
  });
}

// =============================================================================
describe('POST /api/waitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue([{ insertId: 1, affectedRows: 1 }]);
    mockSendWelcomeEmail.mockResolvedValue(undefined);
  });

  it('email válido → 200, pool.execute chamado com email normalizado', async () => {
    const res = await post({ email: 'Test@Example.com', locale: 'pt' });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(mockExecute).toHaveBeenCalledOnce();
    // Primeiro parâmetro do array de valores deve ser o email em lowercase
    const values = (mockExecute.mock.calls[0] as unknown[][])[1] as string[];
    expect(values[0]).toBe('test@example.com');
  });

  it('email inválido → 400, pool.execute não chamado', async () => {
    const res = await post({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBeDefined();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('body sem email → 400, pool.execute não chamado', async () => {
    const res = await post({ locale: 'en', source: 'site' });

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toMatch(/email/i);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('origin não autorizado → 403, pool.execute não chamado', async () => {
    const res = await post({ email: 'user@example.com' }, 'https://evil.com');

    expect(res.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('sendWelcomeEmail chamado com email e locale após INSERT bem-sucedido', async () => {
    const res = await post({ email: 'user@test.com', locale: 'en' });

    expect(res.status).toBe(200);
    // sendWelcomeEmail é disparado em background via .catch(); aguarda microtasks
    await new Promise((r) => setTimeout(r, 20));
    expect(mockSendWelcomeEmail).toHaveBeenCalledOnce();
    expect(mockSendWelcomeEmail).toHaveBeenCalledWith('user@test.com', 'en');
  });
});
