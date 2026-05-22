/**
 * Limpa dados de groups órfãos (sem usuário ativo). Útil pra desbloquear
 * imports de backup quando os IDs do backup colidem com IDs de grupos antigos.
 *
 * Uso:
 *   tsx server/cleanup-orphan-groups.ts             # dry-run (só mostra o que ia apagar)
 *   tsx server/cleanup-orphan-groups.ts --confirm   # apaga de verdade
 */
import "dotenv/config";
import { eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "./db";
import {
  groups, users, tents, plants, strains, cycles, dailyLogs,
  alerts, alertSettings, alertHistory, recipes, taskTemplates, taskInstances,
  cloningEvents, tentAState, plantPhotos, plantHealthLogs, plantObservations,
  plantRunoffLogs, plantTrichomeLogs, plantLSTLogs, plantTentHistory,
  weeklyTargets, nutrientApplications, wateringApplications,
  recipeTemplates, wateringPresets, fertilizationPresets, notificationHistory,
} from "../drizzle/schema";

async function main() {
  const confirm = process.argv.includes("--confirm");
  const db = await getDb();
  if (!db) { console.error("Banco indisponível"); process.exit(1); }

  // 1. Identifica groups órfãos (sem nenhum user vivo apontando pra ele)
  const allGroups = await db.select().from(groups);
  const allUsers = await db.select({ id: users.id, groupId: users.groupId }).from(users);
  const activeGroupIds = new Set(allUsers.map(u => u.groupId).filter((g): g is number => g != null));

  const orphanGroups = allGroups.filter(g => !activeGroupIds.has(g.id));
  if (orphanGroups.length === 0) {
    console.log("✓ Nenhum group órfão. Nada a limpar.");
    process.exit(0);
  }

  console.log(`Groups órfãos identificados (${orphanGroups.length}):`);
  orphanGroups.forEach(g => console.log(`  id=${g.id} name=${g.name} (owner=${g.ownerId})`));

  const orphanIds = orphanGroups.map(g => g.id);

  // 2. Conta o que vai sumir
  const counts = {
    tents: (await db.select().from(tents).where(inArray(tents.groupId, orphanIds))).length,
    plants: (await db.select().from(plants).where(inArray(plants.groupId, orphanIds))).length,
    strains: (await db.select().from(strains).where(inArray(strains.groupId, orphanIds))).length,
    taskTemplates: (await db.select().from(taskTemplates).where(inArray(taskTemplates.groupId, orphanIds))).length,
    recipeTemplates: (await db.select().from(recipeTemplates).where(inArray(recipeTemplates.groupId, orphanIds))).length,
  };
  console.log("\nRegistros que serão apagados:");
  Object.entries(counts).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  if (!confirm) {
    console.log("\n⚠️  DRY-RUN — nada foi apagado. Rode com --confirm pra aplicar.");
    process.exit(0);
  }

  // 3. Apaga de verdade dentro de transação
  await db.transaction(async (tx: any) => {
    // Tents órfãs → tents.tentId em nutrientApplications/wateringApplications precisa ser limpo antes
    await tx.delete(nutrientApplications).where(
      inArray(nutrientApplications.tentId,
        tx.select({ id: tents.id }).from(tents).where(inArray(tents.groupId, orphanIds)))
    );
    await tx.delete(wateringApplications).where(
      inArray(wateringApplications.tentId,
        tx.select({ id: tents.id }).from(tents).where(inArray(tents.groupId, orphanIds)))
    );

    // plants do group → CASCADE limpa plant_*
    await tx.delete(plants).where(inArray(plants.groupId, orphanIds));
    // tents do group → CASCADE limpa cycles/dailyLogs/alerts/etc
    await tx.delete(tents).where(inArray(tents.groupId, orphanIds));
    // strains do group → CASCADE limpa weeklyTargets
    await tx.delete(strains).where(inArray(strains.groupId, orphanIds));
    // Templates e presets
    await tx.delete(taskTemplates).where(inArray(taskTemplates.groupId, orphanIds));
    await tx.delete(recipeTemplates).where(inArray(recipeTemplates.groupId, orphanIds));
    await tx.delete(wateringPresets).where(inArray(wateringPresets.groupId, orphanIds));
    await tx.delete(fertilizationPresets).where(inArray(fertilizationPresets.groupId, orphanIds));
    await tx.delete(notificationHistory).where(inArray(notificationHistory.groupId, orphanIds));
    // Por último, os groups
    await tx.delete(groups).where(inArray(groups.id, orphanIds));
  });

  console.log(`\n✓ Limpeza concluída. Grupos ${orphanIds.join(", ")} removidos.`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
