/**
 * db-migrate.mjs
 * Aplica migrations pendentes sem apagar dados.
 * Roda automaticamente no postbuild (deploy).
 *
 * Para mudanças de schema:
 *   1. Edite drizzle/schema.ts
 *   2. Adicione o ALTER TABLE em INCREMENTAL_ALTERS abaixo
 *   3. Commit + push → postbuild aplica automaticamente
 *
 * Uso manual: pnpm db:migrate
 */

import mysql from "mysql2/promise";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { config } from "dotenv";

config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL não definida no .env");
  process.exit(1);
}

/**
 * ALTER TABLE statements incrementais — adicione aqui cada nova mudança de schema.
 * São executados com segurança: erros de "coluna/tabela já existe" são ignorados.
 */
const INCREMENTAL_ALTERS = [
  // 2026-03-27: Soft-delete para lixeira de plantas
  "ALTER TABLE plants ADD COLUMN deletedAt TIMESTAMP NULL DEFAULT NULL",

  // 2026-03-27: Predefinições de bomba para a Calculadora de Rega Automática
  `CREATE TABLE IF NOT EXISTS pumpPresets (
    id                       INT AUTO_INCREMENT PRIMARY KEY,
    name                     VARCHAR(100) NOT NULL,
    totalFlowMlPerMin        DECIMAL(10,2) NOT NULL,
    numOutlets               INT NOT NULL,
    maxRuntimeMin            DECIMAL(10,1) NOT NULL,
    restTimeBetweenCyclesMin DECIMAL(10,1) NOT NULL,
    groupId                  INT NULL,
    createdAt                TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updatedAt                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

async function runMigrations() {
  console.log("🔄 Verificando schema do banco de dados...");

  const connection = await mysql.createConnection(DATABASE_URL);

  try {
    let appliedCount = 0;

    for (const sql of INCREMENTAL_ALTERS) {
      try {
        await connection.execute(sql);
        console.log(`✅ Aplicado: ${sql.slice(0, 80)}...`);
        appliedCount++;
      } catch (e) {
        // errno 1060 = coluna já existe, errno 1050 = tabela já existe → ok
        if (e.errno === 1060 || e.errno === 1050) {
          // já aplicado anteriormente, ignora
        } else {
          console.error(`❌ Erro no ALTER: ${e.message}`);
          throw e;
        }
      }
    }

    if (appliedCount === 0) {
      console.log("✅ Schema já atualizado — nenhuma alteração necessária.");
    } else {
      console.log(`✅ ${appliedCount} alteração(ões) de schema aplicada(s).`);
    }
  } catch (err) {
    console.error("❌ Erro crítico nas migrations:", err.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigrations();
