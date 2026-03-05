/**
 * db-reset.mjs
 * Reseta completamente o banco de dados:
 *   1. Desabilita FK checks
 *   2. Dropa todas as tabelas (na ordem inversa das dependências)
 *   3. Reabilita FK checks
 *   4. Roda o drizzle-kit push para recriar o schema
 *   5. Roda o seed para inserir dados iniciais
 *
 * Uso: pnpm db:restart
 */

import mysql from "mysql2/promise";
import { execSync } from "child_process";
import { config } from "dotenv";

config(); // Carrega .env

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL não definida no .env");
  process.exit(1);
}

// Tabelas na ordem inversa das dependências (filhas antes das pais)
const TABLES_DROP_ORDER = [
  "alertHistory",
  "alertSettings",
  "alerts",
  "taskInstances",
  "taskTemplates",
  "wateringApplications",
  "nutrientApplications",
  "recipes",
  "dailyLogs",
  "weeklyTargets",
  "cloningEvents",
  "tentAState",
  "plantLSTLogs",
  "plantTrichomeLogs",
  "plantHealthLogs",
  "plantRunoffLogs",
  "plantPhotos",
  "plantObservations",
  "plantTentHistory",
  "plants",
  "cycles",
  "strains",
  "tents",
  "users",
  "recipeTemplates",
  "fertilizationPresets",
  "wateringPresets",
  "phaseAlertMargins",
  "notificationHistory",
  "notificationSettings",
  "alertPreferences",
];

async function reset() {
  console.log("🔄 Iniciando reset completo do banco de dados...\n");

  const conn = await mysql.createConnection(DATABASE_URL);

  try {
    // 1. Desabilitar FK checks
    console.log("⏸  Desabilitando foreign key checks...");
    await conn.execute("SET FOREIGN_KEY_CHECKS = 0");

    // 2. Dropar todas as tabelas
    console.log("🗑  Dropando tabelas...");
    for (const table of TABLES_DROP_ORDER) {
      try {
        await conn.execute(`DROP TABLE IF EXISTS \`${table}\``);
        console.log(`   ✓ ${table}`);
      } catch (err) {
        console.warn(`   ⚠ ${table}: ${err.message}`);
      }
    }

    // 3. Reabilitar FK checks
    console.log("\n▶  Reabilitando foreign key checks...");
    await conn.execute("SET FOREIGN_KEY_CHECKS = 1");

    await conn.end();
    console.log("✅ Todas as tabelas removidas!\n");
  } catch (err) {
    await conn.execute("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});
    await conn.end();
    throw err;
  }

  // 4. Recriar schema via drizzle-kit push
  console.log("🏗  Recriando schema com drizzle-kit push...");
  try {
    execSync("pnpm drizzle-kit push", { stdio: "inherit" });
    console.log("✅ Schema recriado!\n");
  } catch (err) {
    console.error("❌ Erro ao recriar schema:", err.message);
    process.exit(1);
  }

  // 5. Rodar seed
  console.log("🌱 Rodando seed...");
  try {
    execSync("node server/seed.mjs", { stdio: "inherit" });
    console.log("✅ Seed concluído!\n");
  } catch (err) {
    console.error("❌ Erro ao rodar seed:", err.message);
    process.exit(1);
  }

  console.log("🎉 Reset completo! Banco de dados recriado do zero.");
  process.exit(0);
}

reset().catch((err) => {
  console.error("❌ Erro fatal no reset:", err);
  process.exit(1);
});
