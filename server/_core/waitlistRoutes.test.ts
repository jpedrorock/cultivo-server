/**
 * waitlistRoutes.test.ts — Testes unitários para POST /api/waitlist
 *
 * Estratégia de mock:
 *  - mysql-pool: mock via vi.mock — getMysqlPool retorna pool fake com execute spy
 *  - emailService: mock via vi.mock — sendWelcomeEmail é spy que resolve imediatamente
 *  - express-rate-limit: desativado via mock (passthrough) para não impedir os testes
 *
 * Infraestrutura: Express real + servidor HTTP na porta 0 (random) + fetch nativo
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { AddressInfo } from 'node:net';

// ── vi.hoisted: variáveis disponíveis ANTES da hoisting dos vi.mock ───────────
const mockExecute = vi.hoisted(() => vi.fn().mockResolvedValue([{ affectedRows: 1 }]));
const mockSendWelcomeEmail = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

// Rate limiter substituído por passthrough para não bloquear os testes (5 req/h)
const mockRateLimit = vi.hoisted(() =>
  vi.fn().mockReturnValue((_req: unknown, _res: unknown, next: () => void) => next()),
);

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock('../mysql-pool', () => ({
  getMysqlPool: vi.fn().mockReturnValue({ execute: mockExecute }),
}));

vi.mock('./emailService', () => ({
  sendWelcomeEmail: mockSendWelcomeEmail,
}));

vi.mock('express-rate-limit', () => ({
  default: mockRateLimit,
}));

// ── Imports após mocks ────────────────────────────────────────────────────────
import express from 'express';
import { createServer } from 'node:http';
import { registerWaitlistRoutes } from './waitlistRoutes';

// ── Servidor de teste ─────────────────────────────────────────────────────────
let baseUrl: string;
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerWaitlistRoutes(app);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(err => (err ? reject(err) : resolve())),
  );
});

// ── Helper ────────────────────────────────────────────────────────────────────
function post(body: Record<string, unknown>, origin?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  return fetch(`${baseUrl}/api/waitlist`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// =============================================================================
describe('POST /api/waitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
    mockSendWelcomeEmail.mockResolvedValue(undefined);
  });

  it('happy path: email válido → INSERT executado e retorna 200', async () => {
    const res = await post({ email: 'user@example.com' });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(mockExecute).toHaveBeenCalledOnce();
    const [sql, params] = mockExecute.mock.calls[0] as [string, string[]];
    expect(sql).toContain('INSERT IGNORE INTO waitlist');
    expect(params[0]).toBe('user@example.com');
  });

  it('email inválido → 400 sem chamar o banco', async () => {
    const res = await post({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toContain('Invalid email');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('email ausente no body → 400', async () => {
    const res = await post({});

    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toContain('Email required');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('origin não autorizado com header Origin → 403', async () => {
    const res = await post({ email: 'user@example.com' }, 'https://evil.com');

    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toContain('Origin not allowed');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('origin autorizado (cultivo.pro) → 200 com CORS headers corretos', async () => {
    const res = await post({ email: 'cors@test.com' }, 'https://cultivo.pro');

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://cultivo.pro');
  });

  it('normaliza email: trim e lowercase antes de INSERT', async () => {
    const res = await post({ email: '  UPPER@Example.COM  ' });

    expect(res.status).toBe(200);
    const [, params] = mockExecute.mock.calls[0] as [string, string[]];
    expect(params[0]).toBe('upper@example.com');
  });

  it('dispara sendWelcomeEmail com locale correto após INSERT', async () => {
    await post({ email: 'welcome@test.com', locale: 'pt' });

    expect(mockSendWelcomeEmail).toHaveBeenCalledWith('welcome@test.com', 'pt');
  });

  it('retorna 200 mesmo quando sendWelcomeEmail lança erro', async () => {
    mockSendWelcomeEmail.mockRejectedValue(new Error('Resend down'));

    const res = await post({ email: 'erroremail@test.com' });

    expect(res.status).toBe(200);
  });
});
