import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import argon2 from 'argon2';
import type { Request, Response } from 'express';
import { getUserById } from '../db-auth';
import { ENV } from './env';

export interface AuthPayload {
  userId: number;
  email: string;
  iat: number;
  exp: number;
}

/**
 * Hashes de senha:
 *   - Novos hashes: argon2id (estado da arte, recomendado pela OWASP)
 *   - Hashes legados: bcryptjs (`$2a$`/`$2b$`) — comparados em modo legacy
 *
 * Migração transparente: ao fazer login com senha bcrypt, a senha é
 * re-hasheada para argon2 e atualizada no banco (ver `comparePassword`).
 */

// Parâmetros argon2id seguidos pelo OWASP Password Storage Cheat Sheet (2024):
// memoryCost 19MiB, timeCost 2, parallelism 1
const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,   // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

/**
 * Gera hash seguro da senha (sempre argon2id para hashes novos)
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTS);
}

/**
 * Compara uma senha com seu hash, detectando o algoritmo automaticamente.
 * Retorna `{ ok, needsRehash }` — se `needsRehash`, o caller deve gerar
 * um novo hash com argon2 e atualizar no banco.
 */
export async function comparePassword(
  password: string,
  hash: string,
): Promise<{ ok: boolean; needsRehash: boolean }> {
  // Hashes argon2 começam com `$argon2`
  if (hash.startsWith('$argon2')) {
    const ok = await argon2.verify(hash, password);
    // Se os parâmetros mudarem no futuro, argon2 também sinaliza rehash
    const needsRehash = ok && argon2.needsRehash(hash, ARGON2_OPTS);
    return { ok, needsRehash };
  }
  // Legacy bcrypt (`$2a$`, `$2b$`, `$2y$`)
  if (hash.startsWith('$2')) {
    const ok = await bcrypt.compare(password, hash);
    // Se a senha bcrypt está correta, sinaliza rehash para migrar para argon2
    return { ok, needsRehash: ok };
  }
  return { ok: false, needsRehash: false };
}

/**
 * Cria um token JWT
 */
export function createToken(userId: number, email: string, expiresIn: string = '7d'): string {
  return jwt.sign(
    { userId, email },
    ENV.jwtSecret,
    { expiresIn, algorithm: 'HS256' } as jwt.SignOptions
  );
}

/**
 * Verifica e decodifica um token JWT
 */
export function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, ENV.jwtSecret, {
      algorithms: ['HS256'],
    }) as AuthPayload;
    return decoded;
  } catch (error) {
    console.warn('[Auth] Token verification failed', String(error));
    return null;
  }
}

/**
 * Extrai o token do cookie ou header Authorization
 */
export function extractToken(req: Request): string | null {
  // Tentar obter do cookie
  const cookieToken = req.cookies?.auth_token;
  if (cookieToken) return cookieToken;

  // Tentar obter do header Authorization
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * Autentica a requisição e retorna o usuário, ou null se não autenticado
 */
export async function authenticateRequest(req: Request) {
  const token = extractToken(req);
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  try {
    return await getUserById(payload.userId);
  } catch (error) {
    console.warn('[Auth] Failed to fetch user', String(error));
    return null;
  }
}

/**
 * Define o cookie de autenticação HTTP-only
 */
export function setAuthCookie(
  res: Response,
  token: string,
  maxAge: number = 7 * 24 * 60 * 60 * 1000
) {
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: ENV.isProduction,
    sameSite: 'lax',
    maxAge,
    path: '/',
  });
}

/**
 * Limpa o cookie de autenticação
 */
export function clearAuthCookie(res: Response) {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: ENV.isProduction,
    sameSite: 'lax',
    path: '/',
  });
}
