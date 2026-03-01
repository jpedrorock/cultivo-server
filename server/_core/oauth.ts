/**
 * OAuth — Stub de Compatibilidade
 *
 * O OAuth do Manus foi removido. A autenticação agora usa JWT com email/senha.
 * Este arquivo existe apenas para compatibilidade com imports existentes.
 *
 * As rotas de autenticação estão em: server/_core/authRoutes.ts
 * Registradas em: server/_core/index.ts via registerAuthRoutes()
 */
import type { Express } from 'express';

/**
 * Stub vazio — OAuth do Manus removido.
 * A autenticação JWT é registrada em authRoutes.ts
 */
export function registerOAuthRoutes(_app: Express): void {
  // Nada a fazer — autenticação JWT registrada em authRoutes.ts
}
