/**
 * Funções de banco de dados para autenticação
 * Este arquivo contém as funções necessárias para o novo sistema de autenticação JWT
 */

import { eq, sql } from 'drizzle-orm';
import type { InsertUser, User } from '../drizzle/schema';
import { users } from '../drizzle/schema';
import { getDb } from './db';

/**
 * Busca um usuário por openId (Google OAuth)
 */
export async function getUserByOpenId(openId: string): Promise<User | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.openId, openId))
      .limit(1);
    return result[0] ?? null;
  } catch (error) {
    console.error('[Database] Error getting user by openId:', error);
    return null;
  }
}

/**
 * Cria um novo usuário
 */
/**
 * Conta quantos usuários existem no sistema
 */
export async function countUsers(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
  return Number(result[0]?.count ?? 0);
}

/**
 * Aprova um usuário
 */
export async function approveUser(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(users).set({ approved: true, updatedAt: new Date() }).where(eq(users.id, userId));
}

/**
 * Remove a aprovação de um usuário (rejeitar/revogar acesso)
 */
export async function revokeUser(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(users).set({ approved: false, updatedAt: new Date() }).where(eq(users.id, userId));
}

/**
 * Lista usuários aguardando aprovação
 */
export async function getPendingUsers(): Promise<User[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(eq(users.approved, false));
}

/**
 * Registra usuário fazendo a decisão "primeiro = admin" atomicamente.
 *
 * Sem transação, dois POSTs simultâneos em /api/auth/register com banco vazio
 * resultariam em DOIS admins (race em SELECT COUNT). Aqui usamos GET_LOCK do
 * MySQL como advisory lock — apenas uma requisição executa o SELECT+INSERT
 * por vez. O lock é solto automaticamente ao fim da sessão (try/finally).
 */
export async function registerUserAtomic(userData: {
  email: string;
  passwordHash?: string;
  name: string | null;
  lastSignedIn: Date;
  openId?: string;
  loginMethod?: string;
  avatarUrl?: string | null;
}): Promise<{ user: User; isFirst: boolean }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Lock de 5s para evitar race do "primeiro usuário"
  await db.execute(sql`SELECT GET_LOCK('cultivo_first_user_lock', 5)`);
  try {
    const total = Number((await db.select({ c: sql<number>`COUNT(*)` }).from(users))[0]?.c ?? 0);
    const isFirst = total === 0;

    const user = await createUser({
      ...userData,
      role: isFirst ? 'admin' : 'user',
      approved: isFirst,
    });
    return { user, isFirst };
  } finally {
    await db.execute(sql`SELECT RELEASE_LOCK('cultivo_first_user_lock')`).catch(() => { /* ignore */ });
  }
}

export async function createUser(userData: {
  email: string;
  passwordHash?: string;
  name: string | null;
  role: 'user' | 'admin';
  approved: boolean;
  lastSignedIn: Date;
  openId?: string;
  loginMethod?: string;
  avatarUrl?: string | null;
}): Promise<User> {
  const db = await getDb();
  if (!db) {
    throw new Error('Database not available');
  }

  try {
    const result = await db
      .insert(users)
      .values({
        email: userData.email,
        passwordHash: userData.passwordHash ?? '',
        name: userData.name,
        role: userData.role,
        approved: userData.approved,
        lastSignedIn: userData.lastSignedIn,
        openId: userData.openId ?? null,
        loginMethod: userData.loginMethod ?? null,
        avatarUrl: userData.avatarUrl ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as InsertUser)
      .$returningId();

    // Buscar o usuário criado
    const createdUser = await db
      .select()
      .from(users)
      .where(eq(users.email, userData.email))
      .limit(1);

    if (!createdUser[0]) {
      throw new Error('Failed to create user');
    }

    return createdUser[0] as User;
  } catch (error) {
    console.error('[Database] Error creating user:', error);
    throw error;
  }
}

/**
 * Busca um usuário por email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getDb();
  if (!db) {
    console.warn('[Database] Cannot get user: database not available');
    return null;
  }

  try {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return result[0] ?? null;
  } catch (error) {
    console.error('[Database] Error getting user by email:', error);
    return null;
  }
}

/**
 * Busca um usuário por ID
 */
export async function getUserById(id: number): Promise<User | null> {
  const db = await getDb();
  if (!db) {
    console.warn('[Database] Cannot get user: database not available');
    return null;
  }

  try {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return result[0] ?? null;
  } catch (error) {
    console.error('[Database] Error getting user by id:', error);
    return null;
  }
}

/**
 * Atualiza o timestamp de último login
 */
export async function updateUserLastSignedIn(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error('Database not available');
  }

  try {
    await db
      .update(users)
      .set({ lastSignedIn: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
  } catch (error) {
    console.error('[Database] Error updating lastSignedIn:', error);
    throw error;
  }
}

/**
 * Atualiza a URL do avatar do usuário
 */
export async function updateUserAvatar(userId: number, avatarUrl: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ avatarUrl, updatedAt: new Date() }).where(eq(users.id, userId));
}

/**
 * Vincula um openId externo (ex: Google) a um usuário existente.
 * Usado quando usuário criado por email/senha vincula Google pela primeira vez.
 */
export async function linkUserOpenId(userId: number, openId: string, loginMethod?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({
      openId,
      ...(loginMethod ? { loginMethod } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/**
 * Atualiza a senha de um usuário
 */
export async function updateUserPassword(userId: number, passwordHash: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error('Database not available');
  }

  try {
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));
  } catch (error) {
    console.error('[Database] Error updating password:', error);
    throw error;
  }
}

/**
 * Atualiza o perfil de um usuário
 */
export async function updateUserProfile(
  userId: number,
  updates: { name?: string; email?: string }
): Promise<User | null> {
  const db = await getDb();
  if (!db) {
    throw new Error('Database not available');
  }

  try {
    const updateData: any = { updatedAt: new Date() };
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.email !== undefined) updateData.email = updates.email;

    await db.update(users).set(updateData).where(eq(users.id, userId));

    return getUserById(userId);
  } catch (error) {
    console.error('[Database] Error updating user profile:', error);
    throw error;
  }
}
