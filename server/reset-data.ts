/**
 * Reset completo dos dados de domínio do banco local, mantendo `users` e `groups`.
 * Útil pra desbloquear import de backup quando IDs colidem em várias tabelas
 * (strains globais, tents/plants de groups antigos, etc.).
 *
 * Uso:
 *   tsx server/reset-data.ts             # dry-run
 *   tsx server/reset-data.ts --confirm   # apaga de verdade
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

async function main() {
  const confirm = process.argv.includes("--confirm");
  const db = await getDb();
  if (!db) { console.error("Banco indisponível"); process.exit(1); }

  // Tabelas de domínio (não inclui users/groups). Ordem importa por causa de FKs.
  const tablesToReset = [
    // Dependentes de plants (CASCADE limpa, mas TRUNCATE explícito é mais rápido)
    "plantPhotos", "plantHealthLogs", "plantObservations",
    "plantRunoffLogs", "plantTrichomeLogs", "plantLSTLogs",
    "plantTentHistory", "plantStructures",
    // Dependentes de tents
    "cycles", "dailyLogs", "alerts", "alertSettings", "alertHistory",
    "recipes", "taskInstances", "cloningEvents", "tentAState",
    "nutrientApplications", "wateringApplications",
    // Dependentes de strains
    "weeklyTargets",
    // Principais
    "plants", "tents", "strains",
    // Templates/presets
    "taskTemplates", "recipeTemplates",
    "fertilizationPresets", "wateringPresets", "pumpPresets",
    // Histórico/notificações
    "notificationHistory",
    // AI chat
    "aiChatMessages",
  ];

  // Contagens antes
  console.log("Estado atual:");
  for (const t of tablesToReset) {
    const r = (await db.execute(sql.raw(`SELECT COUNT(*) as c FROM \`${t}\``))) as any;
    const row = Array.isArray(r) ? r[0]?.[0] ?? r[0] : r;
    const count = row?.c ?? row?.[0]?.c ?? 0;
    console.log(`  ${t}: ${count}`);
  }

  if (!confirm) {
    console.log("\n⚠️  DRY-RUN — nada foi apagado. Rode com --confirm pra aplicar.");
    process.exit(0);
  }

  // Desliga FK checks temporariamente pra agilizar — re-ativa no final
  await db.execute(sql.raw("SET FOREIGN_KEY_CHECKS = 0"));
  try {
    for (const t of tablesToReset) {
      await db.execute(sql.raw(`TRUNCATE TABLE \`${t}\``));
      console.log(`✓ ${t} truncated`);
    }
  } finally {
    await db.execute(sql.raw("SET FOREIGN_KEY_CHECKS = 1"));
  }

  console.log("\n✓ Reset concluído. Pode importar o backup novamente.");
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
