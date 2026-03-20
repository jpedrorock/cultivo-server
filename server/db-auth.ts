/**
 * Funções de banco de dados para autenticação
 * Este arquivo contém as funções necessárias para o novo sistema de autenticação JWT
 */

import { eq } from 'drizzle-orm';
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
export async function createUser(userData: {
  email: string;
  passwordHash?: string;
  name: string | null;
  role: 'user' | 'admin';
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
