/**
 * db-migrate.mjs
 * Aplica migrations pendentes sem apagar dados.
 * Roda automaticamente no postbuild (deploy).
 *
 * Para mudanças de schema:
 *   1. Edite drizzle/schema.ts
 *   2. pnpm db:generate  → gera o arquivo de migration
 *   3. Commit + push     → postbuild aplica automaticamente
 *
 * Uso manual: pnpm db:migrate
 */

import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "dotenv";

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "drizzle");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL não definida no .env");
  process.exit(1);
}

async function runMigrations() {
  console.log("🔄 Aplicando migrations pendentes...");

  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection);

  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    console.log("✅ Migrations aplicadas com sucesso — dados preservados.");
  } catch (err) {
    console.error("❌ Erro ao aplicar migrations:", err.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigrations();
