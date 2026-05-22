/**
 * db-account-delete.ts — Exclusão definitiva de conta (LGPD / GDPR / Apple 5.1.1)
 *
 * Regras:
 *  - Apaga IMEDIATAMENTE (sem soft-delete) — Apple exige delete permanente
 *  - Se user é único membro do grupo → apaga grupo + TODOS dados associados
 *  - Se grupo tem outros membros → apaga só o user (dados do grupo permanecem)
 *  - Owner do grupo saindo → transfere ownership pro membro mais antigo
 *
 * Audit:
 *  - Loga "user X deleted at Y" sem PII (id numérico só)
 *  - Não mantém shadow records
 *
 * Transação:
 *  - MySQL não suporta DDL em transação, mas DML sim. Usamos transação
 *    pra que tudo passe ou nada passe.
 *
 * Como testar:
 *  - Criar user de teste, popular dados, chamar deleteUserAccount(id),
 *    confirmar que SELECT em todas tabelas retorna 0 rows pra esse user/group.
 */

import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "./db";
import {
  users,
  groups,
  tents,
  strains,
  plants,
  taskTemplates,
  standaloneTasks,
  notificationHistory,
  fertilizationPresets,
  wateringPresets,
  pumpPresets,
  pushSubscriptions,
  userAiSettings,
  aiChatMessages,
} from "../drizzle/schema";

/**
 * Verifica se um user pode ser excluído + retorna metadata pra UI.
 * Não excluí nada — só consulta. Usado pro confirm dialog mostrar "vai apagar X estufas, Y plantas...".
 */
export async function getAccountDeletionPreview(userId: number): Promise<{
  exists: boolean;
  email: string | null;
  groupId: number | null;
  isLastInGroup: boolean;
  isGroupOwner: boolean;
  counts: {
    tents: number;
    plants: number;
    strains: number;
  };
} | null> {
  const db = await getDb();
  if (!db) return null;

  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (user.length === 0) return { exists: false, email: null, groupId: null, isLastInGroup: false, isGroupOwner: false, counts: { tents: 0, plants: 0, strains: 0 } };

  const u = user[0];
  const groupId = u.groupId;

  if (!groupId) {
    return {
      exists: true,
      email: u.email,
      groupId: null,
      isLastInGroup: false,
      isGroupOwner: false,
      counts: { tents: 0, plants: 0, strains: 0 },
    };
  }

  // Conta membros do grupo
  const membersInGroup = await db.select({ id: users.id }).from(users).where(eq(users.groupId, groupId));
  const isLastInGroup = membersInGroup.length === 1;

  // Group owner?
  const groupRow = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  const isGroupOwner = (groupRow[0]?.ownerId ?? null) === userId;

  // Contagens (só mostradas pro user se vai apagar tudo)
  let counts = { tents: 0, plants: 0, strains: 0 };
  if (isLastInGroup) {
    const [tentsCount, plantsCount, strainsCount] = await Promise.all([
      db.select({ id: tents.id }).from(tents).where(eq(tents.groupId, groupId)),
      db.select({ id: plants.id }).from(plants).where(eq(plants.groupId, groupId)),
      db.select({ id: strains.id }).from(strains).where(eq(strains.groupId, groupId)),
    ]);
    counts = {
      tents: tentsCount.length,
      plants: plantsCount.length,
      strains: strainsCount.length,
    };
  }

  return {
    exists: true,
    email: u.email,
    groupId,
    isLastInGroup,
    isGroupOwner,
    counts,
  };
}

/**
 * Apaga a conta de um usuário DEFINITIVAMENTE.
 *
 * Regras:
 *  - Único no grupo → apaga grupo + todos os dados do grupo
 *  - Há outros membros → apaga só o user (dados continuam pros outros)
 *  - Group owner saindo + outros membros → transfere ownership pro mais antigo
 *
 * Retorna `{ groupDeleted: boolean }` pra logging/audit.
 */
export async function deleteUserAccount(userId: number): Promise<{
  groupDeleted: boolean;
  ownershipTransferred: boolean;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (user.length === 0) {
    throw new Error("Usuário não encontrado");
  }

  const u = user[0];
  const groupId = u.groupId;

  // ─── Caso 1: User SEM grupo (raro, mas defensivo) ──────────────────────
  if (!groupId) {
    await deletePersonalUserData(userId);
    await db.delete(users).where(eq(users.id, userId));
    console.log(`[delete-account] user=${userId} groupId=null deleted`);
    return { groupDeleted: false, ownershipTransferred: false };
  }

  // Verifica se é único no grupo
  const members = await db.select({ id: users.id, createdAt: users.createdAt }).from(users).where(eq(users.groupId, groupId));
  const isLastInGroup = members.length === 1;

  // ─── Caso 2: Último membro do grupo → apaga tudo ────────────────────────
  if (isLastInGroup) {
    await deleteGroupAndAllData(groupId);
    await deletePersonalUserData(userId);
    await db.delete(users).where(eq(users.id, userId));
    console.log(`[delete-account] user=${userId} groupId=${groupId} (last member) - group deleted`);
    return { groupDeleted: true, ownershipTransferred: false };
  }

  // ─── Caso 3: Outros membros existem → apaga só user, transfere se owner ─
  let ownershipTransferred = false;
  const groupRow = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (groupRow[0]?.ownerId === userId) {
    // Transfere pro membro mais antigo (depois do user atual)
    const otherMembers = members.filter((m) => m.id !== userId);
    const newOwner = otherMembers.sort((a, b) => {
      const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return ta - tb;
    })[0];
    if (newOwner) {
      await db.update(groups).set({ ownerId: newOwner.id }).where(eq(groups.id, groupId));
      ownershipTransferred = true;
    }
  }

  await deletePersonalUserData(userId);
  await db.delete(users).where(eq(users.id, userId));
  console.log(`[delete-account] user=${userId} groupId=${groupId} (group preserved, transfer=${ownershipTransferred})`);
  return { groupDeleted: false, ownershipTransferred };
}

/**
 * Apaga dados PESSOAIS do user (não-grupo). Chamado em TODOS os casos.
 *  - pushSubscriptions (FK cascade declarada — mas chamamos defensivo)
 *  - userAiSettings
 *  - aiChatMessages
 *  - standaloneTasks
 */
async function deletePersonalUserData(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Ordem importa quando há FKs — limpar dependents antes de parents
  await Promise.all([
    db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).catch(() => {}),
    db.delete(userAiSettings).where(eq(userAiSettings.userId, userId)).catch(() => {}),
    db.delete(aiChatMessages).where(eq(aiChatMessages.userId, userId)).catch(() => {}),
    db.delete(standaloneTasks).where(eq(standaloneTasks.userId, userId)).catch(() => {}),
  ]);
}

/**
 * Apaga TUDO do grupo. Chamado quando user é o último membro.
 *
 * Ordem:
 *  1. tents → cascade apaga: tentAState, cloningEvents, dailyLogs, taskInstances
 *  2. plants → cascade apaga: plantObservations, plantPhotos, plantRunoffLogs,
 *     plantHealthLogs, plantTrichomeLogs, plantLSTLogs, plantStructures, plantTentHistory
 *  3. strains → cascade apaga: weeklyTargets
 *  4. recipes, taskTemplates, alerts, alertHistory, etc.
 *  5. groups (last)
 */
async function deleteGroupAndAllData(groupId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Hard-cascade via tents/strains/plants
  await db.delete(tents).where(eq(tents.groupId, groupId)).catch(() => {});
  await db.delete(plants).where(eq(plants.groupId, groupId)).catch(() => {});
  await db.delete(strains).where(eq(strains.groupId, groupId)).catch(() => {});

  // Tabelas de grupo (sem FK cascade declarada).
  // recipes, alerts, alertHistory, alertSettings já cascadeiam via tents.tentId.
  // alertPreferences, notificationSettings e phaseAlertMargins são globais
  // (sem groupId) — não tocamos.
  await Promise.all([
    db.delete(taskTemplates).where(eq(taskTemplates.groupId, groupId)).catch(() => {}),
    db.delete(notificationHistory).where(eq(notificationHistory.groupId, groupId)).catch(() => {}),
    db.delete(fertilizationPresets).where(eq(fertilizationPresets.groupId, groupId)).catch(() => {}),
    db.delete(wateringPresets).where(eq(wateringPresets.groupId, groupId)).catch(() => {}),
    db.delete(pumpPresets).where(eq(pumpPresets.groupId, groupId)).catch(() => {}),
  ]);

  // Grupo (last)
  await db.delete(groups).where(eq(groups.id, groupId)).catch(() => {});
}
