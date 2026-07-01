/**
 * Utilitários compartilhados para a suite de testes.
 *
 * createTestContext() devolve um TrpcContext com um usuário mock que satisfaz
 * protectedProcedure. O usuário usa o id/groupId de "pro@cultivo.pro" (seed do
 * DB local de dev/test) para que routers que fazem JOIN por groupId funcionem.
 */
import type { Request, Response } from "express";
import type { TrpcContext } from "./context";
import type { User } from "../../drizzle/schema";

/** Usuário de teste — espelha o seed em drizzle/seed.ts (id=6, groupId=4). */
export const TEST_USER: User = {
  id: 6,
  email: "pro@cultivo.pro",
  passwordHash: "$argon2id$test",
  name: "Test User",
  openId: null,
  loginMethod: "email",
  role: "user",
  groupId: 4,
  avatarUrl: null,
  companionName: null,
  companionNamedAt: null,
  approved: true,
  plan: "pro" as const,
  planExpiresAt: null,
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-01T00:00:00Z"),
  lastSignedIn: new Date("2024-01-01T00:00:00Z"),
};

/**
 * Contexto tRPC autenticado para testes.
 * Usar em: appRouter.createCaller(createTestContext())
 */
export function createTestContext(overrides?: Partial<User>): TrpcContext {
  const user = overrides ? { ...TEST_USER, ...overrides } : TEST_USER;
  return {
    req: {} as Request,
    res: {} as Response,
    user,
  };
}

/**
 * Contexto tRPC sem autenticação.
 * Usar quando se quer testar que a rota rejeita usuários não autenticados.
 */
export function createAnonymousContext(): TrpcContext {
  return {
    req: {} as Request,
    res: {} as Response,
    user: null,
  };
}
