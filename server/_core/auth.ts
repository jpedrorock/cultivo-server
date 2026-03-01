import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import * as db from '../db';
import { ENV } from './env';

export interface AuthPayload {
  userId: number;
  email: string;
  iat: number;
  exp: number;
}

/**
 * Gera um hash seguro da senha usando bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Compara uma senha com seu hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Cria um token JWT
 */
export function createToken(userId: number, email: string, expiresIn: string = '7d'): string {
  return jwt.sign(
    { userId, email },
    ENV.jwtSecret,
    { expiresIn, algorithm: 'HS256' }
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
  if (cookieToken) {
    return cookieToken;
  }

  // Tentar obter do header Authorization
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * Middleware para verificar autenticação
 */
export async function authenticateRequest(req: Request) {
  const token = extractToken(req);
  
  if (!token) {
    return null;
  }

  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }

  try {
    const user = await db.getUserById(payload.userId);
    return user || null;
  } catch (error) {
    console.warn('[Auth] Failed to fetch user', String(error));
    return null;
  }
}

/**
 * Define o cookie de autenticação
 */
export function setAuthCookie(res: Response, token: string, maxAge: number = 7 * 24 * 60 * 60 * 1000) {
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: ENV.nodeEnv === 'production',
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
    secure: ENV.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
  });
}
