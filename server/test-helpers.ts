/**
 * test-helpers.ts — Utilitários compartilhados para testes
 *
 * Importar esses helpers em vez de recriar o contexto em cada arquivo.
 *
 * @example
 * import { createTestContext, DB_AVAILABLE } from './test-helpers';
 *
 * // Contexto com usuário autenticado (sem DB):
 * const caller = appRouter.createCaller(createTestContext());
 *
 * // Pular testes que precisam de DB real:
 * describe.skipIf(!DB_AVAILABLE)('My DB test', () => { ... });
 */

import type { TrpcContext } from './_core/context';

/**
 * Cria contexto tRPC com usuário autenticado para testes unitários.
 * Não precisa de banco de dados — ideal para testes de lógica pura e mocks.
 */
export function createTestContext(overrides?: Partial<TrpcContext>): TrpcContext {
  return {
    user: {
      // id=6, groupId=4 espelham o seed "pro@cultivo.pro" no DB de dev/test.
      // groupId: 4 é necessário para validateTentOwnership não rejeitar o caller.
      id: 6,
      openId: null,
      email: 'pro@cultivo.pro',
      name: 'Test User',
      passwordHash: '$argon2id$test',
      loginMethod: 'email',
      role: 'user' as const,
      groupId: 4,
      avatarUrl: null,
      approved: true,
      plan: 'pro' as const,
      planExpiresAt: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      lastSignedIn: new Date('2024-01-01'),
    },
    req: { headers: {}, protocol: 'http' } as TrpcContext['req'],
    res: { clearCookie: () => {}, cookie: () => {} } as unknown as TrpcContext['res'],
    ...overrides,
  };
}

/**
 * Indica se o banco de dados está disponível no ambiente atual.
 *
 * Testes de integração que precisam de MySQL devem usar:
 *   describe.skipIf(!DB_AVAILABLE)('...')
 *   it.skipIf(!DB_AVAILABLE)('...')
 */
export const DB_AVAILABLE = !!process.env.DATABASE_URL;
