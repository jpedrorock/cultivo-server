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

const _dirname = dirname(fileURLToPath(import.meta.url));   // disponível se algum import futuro precisar

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  // Em build Docker não há banco disponível — migrations rodam no startup do servidor
  console.log("ℹ️  DATABASE_URL não definida — pulando migrations (serão aplicadas no startup)");
  process.exit(0);
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

  // 2026-03-28: Runoff EC/pH — L5 (removidos do schema: ph/ec já medem o runoff)
  "ALTER TABLE dailyLogs ADD COLUMN runoffPh DECIMAL(3,1) NULL DEFAULT NULL",
  "ALTER TABLE dailyLogs ADD COLUMN runoffEc DECIMAL(4,2) NULL DEFAULT NULL",

  // 2026-03-28: Volume de rega e runoff coletado
  "ALTER TABLE dailyLogs ADD COLUMN wateringVolume INT NULL DEFAULT NULL",
  "ALTER TABLE dailyLogs ADD COLUMN runoffCollected INT NULL DEFAULT NULL",
  "ALTER TABLE dailyLogs ADD COLUMN runoffPercentage DECIMAL(5,2) NULL DEFAULT NULL",

  // 2026-04-04: Captura automática de ciclo e semana nas fotos
  `ALTER TABLE plantPhotos ADD COLUMN cycleId INT NULL`,
  `ALTER TABLE plantPhotos ADD COLUMN weekNumber INT NULL`,

  // 2026-04-06: Snapshot da estrutura no momento de cada sessão de treinamento
  `ALTER TABLE plantLSTLogs ADD COLUMN snapshotJson LONGTEXT NULL`,

  // 2026-04-05: CannaPrune — estrutura visual da planta (nós e galhos)
  `CREATE TABLE IF NOT EXISTS plantStructures (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    plantId   INT NOT NULL UNIQUE,
    nodesJson LONGTEXT NOT NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_plantStructures_plant FOREIGN KEY (plantId) REFERENCES plants(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

/**
 * Políticas de ON DELETE para todas as FKs do schema.
 *
 * Antes deste patch, todas as 18 FKs eram criadas sem ON DELETE
 * (= NO ACTION/RESTRICT padrão). Resultado: deletar uma estufa falhava
 * silenciosamente OU deixava órfãos no banco quando alguma rota burlava
 * a checagem.
 *
 * Política definida (ver schema.ts — fonte canônica):
 * - CASCADE        : registros filhos pertencem ao pai (cycles, alerts, recipes etc.)
 * - SET NULL       : referência opcional (motherPlant, currentTent, fromTent)
 * - RESTRICT       : bloqueia delete se houver dependências (plant ⇒ strain)
 *
 * applyForeignKeyPolicies() é idempotente: lê INFORMATION_SCHEMA, dropa
 * o FK existente (se qualquer) e re-cria com ON DELETE explícito + nome
 * canônico (fk_<table>_<column>) para futuras manutenções.
 */
const FK_POLICIES = [
  // (table, column, refTable, refColumn, action)
  ["cycles",           "tentId",                "tents",         "id", "CASCADE"],
  ["cycles",           "strainId",              "strains",       "id", "SET NULL"],
  ["cycles",           "motherPlantId",         "plants",        "id", "SET NULL"],
  ["tentAState",       "tentId",                "tents",         "id", "CASCADE"],
  ["tentAState",       "activeCloningEventId",  "cloningEvents", "id", "SET NULL"],
  ["cloningEvents",    "tentId",                "tents",         "id", "CASCADE"],
  ["weeklyTargets",    "strainId",              "strains",       "id", "CASCADE"],
  ["dailyLogs",        "tentId",                "tents",         "id", "CASCADE"],
  ["recipes",          "tentId",                "tents",         "id", "CASCADE"],
  ["taskInstances",    "tentId",                "tents",         "id", "CASCADE"],
  ["taskInstances",    "taskTemplateId",        "taskTemplates", "id", "CASCADE"],
  ["alerts",           "tentId",                "tents",         "id", "CASCADE"],
  ["alertSettings",    "tentId",                "tents",         "id", "CASCADE"],
  ["alertHistory",     "tentId",                "tents",         "id", "CASCADE"],
  ["plants",           "strainId",              "strains",       "id", "RESTRICT"],
  ["plants",           "currentTentId",         "tents",         "id", "SET NULL"],
  ["plantTentHistory", "fromTentId",            "tents",         "id", "SET NULL"],
  ["plantTentHistory", "toTentId",              "tents",         "id", "SET NULL"],
];

/**
 * Aplica uma política de ON DELETE de forma idempotente.
 *
 * 1. Procura FK existente em (table.column → refTable.refColumn).
 * 2. Se a regra já está correta, no-op.
 * 3. Caso contrário: DROP FK existente + ADD com nome canônico e regra.
 *
 * Tolera tabelas inexistentes (skipa) — útil quando rodando antes da
 * primeira criação de tabelas pelo `ensure*` no startup do servidor.
 */
async function applyForeignKeyPolicies(connection) {
  let changedCount = 0;
  let skippedCount = 0;

  for (const [table, column, refTable, refColumn, action] of FK_POLICIES) {
    try {
      // Busca FK existente (qualquer nome) que faça (table.column → refTable.refColumn)
      const [rows] = await connection.execute(
        `SELECT k.CONSTRAINT_NAME, r.DELETE_RULE
         FROM information_schema.KEY_COLUMN_USAGE k
         JOIN information_schema.REFERENTIAL_CONSTRAINTS r
           ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
          AND r.CONSTRAINT_NAME   = k.CONSTRAINT_NAME
         WHERE k.CONSTRAINT_SCHEMA = DATABASE()
           AND k.TABLE_NAME            = ?
           AND k.COLUMN_NAME           = ?
           AND k.REFERENCED_TABLE_NAME = ?
           AND k.REFERENCED_COLUMN_NAME= ?
         LIMIT 1`,
        [table, column, refTable, refColumn]
      );

      const existing = rows[0];
      const desiredCanonicalName = `fk_${table}_${column}`;

      // Já está correto: nome canônico + regra correta → no-op
      if (existing && existing.CONSTRAINT_NAME === desiredCanonicalName && existing.DELETE_RULE === action) {
        skippedCount++;
        continue;
      }

      // Drop FK existente (se houver) — não usa prepared statement pois
      // identificadores não podem ser parametrizados no MySQL
      if (existing) {
        await connection.query(
          `ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${existing.CONSTRAINT_NAME}\``
        );
      }

      await connection.query(
        `ALTER TABLE \`${table}\`
         ADD CONSTRAINT \`${desiredCanonicalName}\`
         FOREIGN KEY (\`${column}\`) REFERENCES \`${refTable}\`(\`${refColumn}\`)
         ON DELETE ${action}`
      );

      console.log(`✅ FK ${table}.${column} → ${refTable}.${refColumn} ON DELETE ${action}`);
      changedCount++;
    } catch (e) {
      // errno 1146 = table doesn't exist (ainda não criada por ensure* do server)
      // errno 1452 = foreign key constraint fails (existem órfãos)
      if (e.errno === 1146) {
        // tabela não existe ainda — server vai criá-la com ensure*; FK fica para próxima
        continue;
      }
      if (e.errno === 1452) {
        console.error(
          `⚠️  FK ${table}.${column} → ${refTable}.${refColumn} ON DELETE ${action} ` +
          `falhou: existem registros órfãos em ${table}. Limpe-os e re-rode db:migrate.`
        );
        // não trava o deploy — outras migrations podem prosseguir
        continue;
      }
      console.error(`❌ Erro em FK ${table}.${column}: ${e.message}`);
      throw e;
    }
  }

  if (changedCount === 0 && skippedCount === FK_POLICIES.length) {
    console.log(`✅ Todas as ${FK_POLICIES.length} FKs já estão com política ON DELETE correta.`);
  } else if (changedCount > 0) {
    console.log(`✅ ${changedCount} FK(s) atualizada(s) com política ON DELETE.`);
  }
}

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

    // Após migrations de coluna, garante políticas de ON DELETE nas FKs
    await applyForeignKeyPolicies(connection);
  } catch (err) {
    console.error("❌ Erro crítico nas migrations:", err.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigrations();
