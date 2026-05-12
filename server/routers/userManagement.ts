/**
 * userManagement — sub-routers tRPC relacionados a usuários, grupos e admin.
 *
 * Antes vivia inline em server/routers.ts (linhas ~7359-7524). Extraído pra
 * cá pra reduzir tamanho do arquivo principal e isolar o domínio "user/auth"
 * dos domínios de cultivo (plants, cycles, tents).
 *
 * Exporta 3 routers:
 *   - groupsRouter: grupos colaborativos (mine, create, join, regenerateCode, removeMember)
 *   - profileRouter: dados do user logado (get, updateName, updatePassword, deleteAccount)
 *   - adminRouter: gestão de usuários (listUsers, listPendingUsers, approveUser, revokeUser, deleteUser, setRole)
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { hashPassword, comparePassword } from "../_core/auth";
import { getDb } from "../db";
import {
  getUserById,
  updateUserProfile,
  updateUserPassword,
  approveUser,
  revokeUser,
  getPendingUsers,
} from "../db-auth";
import { users, groups } from "../../drizzle/schema";

// ─── groups: grupos colaborativos (multi-user num mesmo cultivo) ─────────────
export const groupsRouter = router({
  // Buscar grupo do usuário atual
  mine: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.groupId) return null;
    const database = await getDb();
    if (!database) throw new Error('Banco indisponível');
    const [group] = await database.select().from(groups).where(eq(groups.id, ctx.user.groupId)).limit(1);
    if (!group) return null;
    // Contar membros
    const members = await database.select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users).where(eq(users.groupId, ctx.user.groupId));
    return { ...group, members, isOwner: group.ownerId === ctx.user.id };
  }),

  // Criar novo grupo
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new Error('Banco indisponível');
      const inviteCode = nanoid(8).toUpperCase();
      const [result] = await database.insert(groups).values({
        name: input.name,
        inviteCode,
        ownerId: ctx.user.id,
      });
      const groupId = result.insertId;
      // Atribuir usuário ao grupo
      await database.update(users).set({ groupId }).where(eq(users.id, ctx.user.id));
      return { success: true, groupId, inviteCode };
    }),

  // Entrar em um grupo via código de convite
  join: protectedProcedure
    .input(z.object({ inviteCode: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new Error('Banco indisponível');
      const [group] = await database.select().from(groups)
        .where(eq(groups.inviteCode, input.inviteCode.toUpperCase())).limit(1);
      if (!group) throw new Error('Código de convite inválido');
      await database.update(users).set({ groupId: group.id }).where(eq(users.id, ctx.user.id));
      return { success: true, groupId: group.id, groupName: group.name };
    }),

  // Regenerar código de convite (só o dono)
  regenerateCode: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user.groupId) throw new Error('Você não pertence a nenhum grupo');
    const database = await getDb();
    if (!database) throw new Error('Banco indisponível');
    const [group] = await database.select().from(groups).where(eq(groups.id, ctx.user.groupId)).limit(1);
    if (!group || group.ownerId !== ctx.user.id) throw new Error('Apenas o dono pode regenerar o código');
    const inviteCode = nanoid(8).toUpperCase();
    await database.update(groups).set({ inviteCode }).where(eq(groups.id, ctx.user.groupId));
    return { inviteCode };
  }),

  // Remover membro do grupo (só o dono)
  removeMember: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.groupId) throw new Error('Você não pertence a nenhum grupo');
      const database = await getDb();
      if (!database) throw new Error('Banco indisponível');
      const [group] = await database.select().from(groups).where(eq(groups.id, ctx.user.groupId)).limit(1);
      if (!group || group.ownerId !== ctx.user.id) throw new Error('Apenas o dono pode remover membros');
      if (input.userId === ctx.user.id) throw new Error('Não pode se remover do grupo');
      await database.update(users).set({ groupId: null }).where(eq(users.id, input.userId));
      return { success: true };
    }),
});

// ─── profile: dados do user logado ───────────────────────────────────────────
export const profileRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserById(ctx.user.id);
    if (!user) throw new Error('Usuário não encontrado');
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }),

  updateName: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      await updateUserProfile(ctx.user.id, { name: input.name });
      return { success: true };
    }),

  updatePassword: protectedProcedure
    .input(z.object({ currentPassword: z.string(), newPassword: z.string().min(6) }))
    .mutation(async ({ ctx, input }) => {
      const user = await getUserById(ctx.user.id);
      if (!user) throw new Error('Usuário não encontrado');
      if (user.passwordHash) {
        const { ok } = await comparePassword(input.currentPassword, user.passwordHash);
        if (!ok) throw new Error('Senha atual incorreta');
      }
      const hash = await hashPassword(input.newPassword);
      await updateUserPassword(ctx.user.id, hash);
      return { success: true };
    }),

  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const database = await getDb();
    if (!database) throw new Error('Banco indisponível');
    // Se for dono de um cultivo, dissolver o grupo (remover todos os membros)
    if (ctx.user.groupId) {
      const [group] = await database.select().from(groups).where(eq(groups.id, ctx.user.groupId)).limit(1);
      if (group && group.ownerId === ctx.user.id) {
        await database.update(users).set({ groupId: null }).where(eq(users.groupId, ctx.user.groupId));
        await database.delete(groups).where(eq(groups.id, ctx.user.groupId));
      }
    }
    await database.delete(users).where(eq(users.id, ctx.user.id));
    return { success: true };
  }),
});

// ─── admin: gestão de usuários (só admins) ───────────────────────────────────
export const adminRouter = router({
  listUsers: adminProcedure.query(async () => {
    const database = await getDb();
    if (!database) throw new Error('Banco indisponível');
    const result = await database
      .select({ id: users.id, email: users.email, name: users.name, role: users.role, approved: users.approved, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn })
      .from(users)
      .orderBy(users.createdAt);
    return result;
  }),

  listPendingUsers: adminProcedure.query(async () => {
    return getPendingUsers();
  }),

  approveUser: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      await approveUser(input.userId);
      return { success: true };
    }),

  revokeUser: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) throw new Error('Não pode revogar o próprio acesso');
      await revokeUser(input.userId);
      return { success: true };
    }),

  deleteUser: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) throw new Error('Não pode excluir sua própria conta por aqui');
      const database = await getDb();
      if (!database) throw new Error('Banco indisponível');
      await database.delete(users).where(eq(users.id, input.userId));
      return { success: true };
    }),

  setRole: adminProcedure
    .input(z.object({ userId: z.number(), role: z.enum(['user', 'admin']) }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) throw new Error('Não pode alterar seu próprio role');
      const database = await getDb();
      if (!database) throw new Error('Banco indisponível');
      await database.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
      return { success: true };
    }),
});
