/**
 * db-reset.mjs
 * Reseta completamente o banco de dados:
 *   1. Desabilita FK checks
 *   2. Dropa todas as tabelas (na ordem inversa das dependências)
 *   3. Executa o schema-create.sql para recriar todas as tabelas
 *   4. Reabilita FK checks
 *   5. Roda o seed para inserir dados iniciais
 *
 * Uso: pnpm db:restart
 */

import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "dotenv";
import { seed } from "./seed-fn.mjs";

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL não definida no .env");
  process.exit(1);
}

// Tabelas na ordem inversa das dependências (filhas antes das pais)
const TABLES_DROP_ORDER = [
  "alertHistory",
  "alertSettings",
  "safetyLimits",
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
  "groups",
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
    console.log("✅ Todas as tabelas removidas!\n");

    // 3. Recriar schema via schema-create.sql
    console.log("🏗  Recriando schema via schema-create.sql...");
    const sqlFile = join(ROOT, "schema-create.sql");
    const sqlContent = readFileSync(sqlFile, "utf-8");

    // Dividir em statements individuais (separados por ;)
    // Remover comentários de linha e statements vazios
    const statements = sqlContent
      .split(";")
      .map((s) => s.trim())
      .filter((s) => {
        if (!s) return false;
        // Remover linhas que são só comentários
        const lines = s.split("\n").filter((l) => !l.trim().startsWith("--"));
        return lines.join("\n").trim().length > 0;
      });

    let created = 0;
    for (const stmt of statements) {
      const cleanStmt = stmt
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n")
        .trim();

      if (!cleanStmt) continue;

      try {
        await conn.execute(cleanStmt);
        if (cleanStmt.toUpperCase().startsWith("CREATE TABLE")) {
          const match = cleanStmt.match(/CREATE TABLE.*?`(\w+)`/i);
          if (match) {
            console.log(`   ✓ ${match[1]}`);
            created++;
          }
        }
      } catch (err) {
        if (!err.message.includes("already exists")) {
          console.warn(`   ⚠ ${err.message.substring(0, 100)}`);
        }
      }
    }

    // 4. Reabilitar FK checks
    await conn.execute("SET FOREIGN_KEY_CHECKS = 1");
    console.log(`\n✅ Schema recriado! (${created} tabelas criadas)\n`);

    await conn.end();
  } catch (err) {
    try { await conn.execute("SET FOREIGN_KEY_CHECKS = 1"); } catch {}
    await conn.end();
    throw err;
  }

  // 5. Rodar seed
  console.log("🌱 Rodando seed...");
  await seed();

  console.log("\n🎉 Reset completo! Banco de dados recriado do zero.");
  process.exit(0);
}

reset().catch((err) => {
  console.error("❌ Erro fatal no reset:", err);
  process.exit(1);
});
