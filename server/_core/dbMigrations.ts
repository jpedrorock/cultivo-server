/**
 * Migrations consolidadas — fonte única de verdade para schema do banco.
 *
 * Antes:
 * - 10 funções `ensure*` em index.ts (~390 linhas), cada uma abrindo sua
 *   própria conexão MySQL (10 conexões TCP no boot)
 * - INCREMENTAL_ALTERS em db-migrate.mjs (manual via `pnpm db:migrate`)
 * - Drift potencial entre os dois sistemas
 *
 * Agora:
 * - Um único `MIGRATIONS[]` aqui, expressando cada mudança como dado
 * - Um único pool MySQL compartilhado (do mysql-pool.ts) — não abre
 *   conexões dedicadas para migration
 * - Idempotente: pula migrations já aplicadas via INFORMATION_SCHEMA
 * - CLI entry no fim do arquivo: `tsx dbMigrations.ts`
 *   (substitui db-migrate.mjs)
 *
 * Para adicionar uma nova migration:
 *   1. Edite drizzle/schema.ts (declaração canônica para drizzle-kit push)
 *   2. Adicione uma entry em MIGRATIONS abaixo
 *   3. Commit + restart → aplica no boot do servidor
 *
 * Como o MIGRATIONS é processado em ordem e cada step é idempotente,
 * NUNCA reordene ou delete entries — só adicione no fim.
 */

import 'dotenv/config';
import type { Pool, PoolConnection } from 'mysql2/promise';

type Conn = Pool | PoolConnection;

interface Migration {
  /** ID estável (kebab-case). Aparece em logs. */
  id: string;
  /** Descrição curta do que faz. */
  description: string;
  /** Função idempotente. Recebe conexão do pool compartilhado. */
  run: (conn: Conn) => Promise<void>;
}

// ── Helpers idempotentes ─────────────────────────────────────────────────────

async function tableExists(conn: Conn, table: string): Promise<boolean> {
  const [rows] = (await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table]
  )) as [Array<unknown>, unknown];
  return rows.length > 0;
}

async function columnExists(conn: Conn, table: string, column: string): Promise<boolean> {
  const [rows] = (await conn.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  )) as [Array<unknown>, unknown];
  return rows.length > 0;
}

/** Adiciona uma coluna se não existir. Não-destrutivo. */
async function addColumnIfNotExists(
  conn: Conn,
  table: string,
  column: string,
  definition: string
): Promise<boolean> {
  if (!(await tableExists(conn, table))) return false;
  if (await columnExists(conn, table, column)) return false;
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  return true;
}

/** True se já existe uma FK de table.column → referenced(id). */
async function fkExists(conn: Conn, table: string, column: string, referenced: string): Promise<boolean> {
  const [rows] = (await conn.execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
       AND REFERENCED_TABLE_NAME = ? LIMIT 1`,
    [table, column, referenced]
  )) as [Array<unknown>, unknown];
  return rows.length > 0;
}

// ── Migrations ───────────────────────────────────────────────────────────────

const MIGRATIONS: Migration[] = [
  // ─── pushSubscriptions ──────────────────────────────────────────────
  {
    id: 'create-push-subscriptions',
    description: 'Cria tabela pushSubscriptions',
    run: async (c) => {
      await c.query(`
        CREATE TABLE IF NOT EXISTS \`pushSubscriptions\` (
          \`id\`              INT AUTO_INCREMENT PRIMARY KEY,
          \`endpoint\`        VARCHAR(512) NOT NULL UNIQUE,
          \`keysJson\`        TEXT NOT NULL,
          \`reminderEnabled\` TINYINT(1) NOT NULL DEFAULT 0,
          \`reminderTimes\`   TEXT,
          \`createdAt\`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          \`updatedAt\`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    // SEGURANÇA: subscriptions antigas sem userId recebiam pushes de TODOS
    // os usuários (vazamento). Apaga rows antigas antes de adicionar a coluna —
    // usuários precisarão reaprovar push. Migration roda 1x.
    id: 'add-push-subscriptions-userId',
    description: 'Adiciona pushSubscriptions.userId (deleta órfãos antigos)',
    run: async (c) => {
      if (!(await tableExists(c, 'pushSubscriptions'))) return;
      if (await columnExists(c, 'pushSubscriptions', 'userId')) return;

      const [pre] = (await c.execute(
        `SELECT COUNT(*) AS n FROM \`pushSubscriptions\``
      )) as [Array<{ n: number }>, unknown];
      const existingCount = pre[0]?.n ?? 0;
      if (existingCount > 0) {
        await c.query(`DELETE FROM \`pushSubscriptions\``);
        console.log(
          `[Migrations] Removidas ${existingCount} subscription(s) push antigas sem userId — usuários precisarão reaprovar push.`
        );
      }
      await c.query(`ALTER TABLE \`pushSubscriptions\` ADD COLUMN \`userId\` INT NOT NULL`);
      try {
        await c.query(
          `ALTER TABLE \`pushSubscriptions\`
           ADD CONSTRAINT \`fk_push_user\`
           FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE`
        );
      } catch (e) {
        console.warn(
          `[Migrations] Não foi possível criar FK pushSubscriptions.userId → users.id: ${(e as Error)?.message}`
        );
      }
    },
  },
  {
    id: 'add-push-subscriptions-groupId',
    description: 'Adiciona pushSubscriptions.groupId',
    run: async (c) => {
      await addColumnIfNotExists(c, 'pushSubscriptions', 'groupId', 'INT NULL');
    },
  },
  {
    id: 'add-push-subscriptions-timezone',
    description: 'Adiciona pushSubscriptions.timezone',
    run: async (c) => {
      await addColumnIfNotExists(c, 'pushSubscriptions', 'timezone', 'VARCHAR(64) NULL');
    },
  },

  // ─── users ──────────────────────────────────────────────────────────
  {
    // Default 1 = usuários existentes ficam aprovados automaticamente
    // (sem isso, o switch para "primeiro user é admin" travaria todo mundo)
    id: 'add-users-approved',
    description: 'Adiciona users.approved',
    run: async (c) => {
      await addColumnIfNotExists(c, 'users', 'approved', 'TINYINT(1) NOT NULL DEFAULT 1');
    },
  },

  // ─── notificationSettings ───────────────────────────────────────────
  {
    id: 'add-notification-dailyReminderEnabled',
    description: 'Adiciona notificationSettings.dailyReminderEnabled',
    run: async (c) => {
      await addColumnIfNotExists(
        c,
        'notificationSettings',
        'dailyReminderEnabled',
        "TINYINT(1) NOT NULL DEFAULT 0"
      );
    },
  },
  {
    id: 'add-notification-reminderTimes',
    description: 'Adiciona notificationSettings.reminderTimes',
    run: async (c) => {
      await addColumnIfNotExists(c, 'notificationSettings', 'reminderTimes', "TEXT DEFAULT '[]'");
    },
  },

  // ─── userAiSettings ─────────────────────────────────────────────────
  {
    id: 'create-userAiSettings',
    description: 'Cria tabela userAiSettings',
    run: async (c) => {
      await c.query(`
        CREATE TABLE IF NOT EXISTS \`userAiSettings\` (
          \`id\`        INT AUTO_INCREMENT PRIMARY KEY,
          \`userId\`    INT NOT NULL,
          \`provider\`  VARCHAR(32) NOT NULL,
          \`apiKey\`    TEXT NOT NULL,
          \`model\`     VARCHAR(64),
          \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          UNIQUE KEY \`userAiSettings_userId_unique\` (\`userId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },

  // ─── aiChatMessages ─────────────────────────────────────────────────
  {
    id: 'create-aiChatMessages',
    description: 'Cria tabela aiChatMessages',
    run: async (c) => {
      await c.query(`
        CREATE TABLE IF NOT EXISTS \`aiChatMessages\` (
          \`id\`        INT AUTO_INCREMENT PRIMARY KEY,
          \`userId\`    INT NOT NULL,
          \`plantId\`   INT,
          \`role\`      ENUM('user','assistant') NOT NULL,
          \`content\`   TEXT NOT NULL,
          \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          INDEX \`userPlantIdx\` (\`userId\`, \`plantId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },

  // ─── dailyLogs ──────────────────────────────────────────────────────
  {
    id: 'add-dailyLogs-source',
    description: 'Adiciona dailyLogs.source (MANUAL/AUTO)',
    run: async (c) => {
      await addColumnIfNotExists(c, 'dailyLogs', 'source', "VARCHAR(10) NOT NULL DEFAULT 'MANUAL'");
    },
  },

  // ─── plants ─────────────────────────────────────────────────────────
  {
    id: 'add-plants-deletedAt',
    description: 'Adiciona plants.deletedAt (soft-delete / lixeira)',
    run: async (c) => {
      await addColumnIfNotExists(c, 'plants', 'deletedAt', 'TIMESTAMP NULL DEFAULT NULL');
    },
  },

  // ─── pumpPresets ────────────────────────────────────────────────────
  {
    id: 'create-pumpPresets',
    description: 'Cria tabela pumpPresets (Calculadora de Rega)',
    run: async (c) => {
      await c.query(`
        CREATE TABLE IF NOT EXISTS \`pumpPresets\` (
          \`id\`                       INT AUTO_INCREMENT PRIMARY KEY,
          \`name\`                     VARCHAR(100) NOT NULL,
          \`totalFlowMlPerMin\`        DECIMAL(10,2) NOT NULL,
          \`numOutlets\`               INT NOT NULL,
          \`maxRuntimeMin\`            DECIMAL(10,1) NOT NULL,
          \`restTimeBetweenCyclesMin\` DECIMAL(10,1) NOT NULL,
          \`groupId\`                  INT NULL,
          \`createdAt\`                TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          \`updatedAt\`                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },

  // ─── dailyLogs (runoff + watering volume) ───────────────────────────
  {
    id: 'add-dailyLogs-runoffPh',
    description: 'Adiciona dailyLogs.runoffPh',
    run: async (c) => {
      await addColumnIfNotExists(c, 'dailyLogs', 'runoffPh', 'DECIMAL(3,1) NULL DEFAULT NULL');
    },
  },
  {
    id: 'add-dailyLogs-runoffEc',
    description: 'Adiciona dailyLogs.runoffEc',
    run: async (c) => {
      await addColumnIfNotExists(c, 'dailyLogs', 'runoffEc', 'DECIMAL(4,2) NULL DEFAULT NULL');
    },
  },
  {
    id: 'add-dailyLogs-wateringVolume',
    description: 'Adiciona dailyLogs.wateringVolume',
    run: async (c) => {
      await addColumnIfNotExists(c, 'dailyLogs', 'wateringVolume', 'INT NULL DEFAULT NULL');
    },
  },
  {
    id: 'add-dailyLogs-runoffCollected',
    description: 'Adiciona dailyLogs.runoffCollected',
    run: async (c) => {
      await addColumnIfNotExists(c, 'dailyLogs', 'runoffCollected', 'INT NULL DEFAULT NULL');
    },
  },
  {
    id: 'add-dailyLogs-runoffPercentage',
    description: 'Adiciona dailyLogs.runoffPercentage',
    run: async (c) => {
      await addColumnIfNotExists(c, 'dailyLogs', 'runoffPercentage', 'DECIMAL(5,2) NULL DEFAULT NULL');
    },
  },

  // ─── plantPhotos ────────────────────────────────────────────────────
  {
    id: 'add-plantPhotos-cycleId',
    description: 'Adiciona plantPhotos.cycleId (auto-captura de ciclo)',
    run: async (c) => {
      await addColumnIfNotExists(c, 'plantPhotos', 'cycleId', 'INT NULL');
    },
  },
  {
    id: 'add-plantPhotos-weekNumber',
    description: 'Adiciona plantPhotos.weekNumber',
    run: async (c) => {
      await addColumnIfNotExists(c, 'plantPhotos', 'weekNumber', 'INT NULL');
    },
  },

  // ─── plantLSTLogs ──────────────────────────────────────────────────
  {
    id: 'add-plantLSTLogs-techniqueConfig',
    description: 'Adiciona plantLSTLogs.techniqueConfig',
    run: async (c) => {
      await addColumnIfNotExists(c, 'plantLSTLogs', 'techniqueConfig', 'TEXT');
    },
  },
  {
    id: 'add-plantLSTLogs-actualResult',
    description: 'Adiciona plantLSTLogs.actualResult',
    run: async (c) => {
      await addColumnIfNotExists(c, 'plantLSTLogs', 'actualResult', 'TEXT');
    },
  },
  {
    id: 'add-plantLSTLogs-nodePosition',
    description: 'Adiciona plantLSTLogs.nodePosition',
    run: async (c) => {
      await addColumnIfNotExists(c, 'plantLSTLogs', 'nodePosition', 'VARCHAR(200)');
    },
  },
  {
    id: 'add-plantLSTLogs-snapshotJson',
    description: 'Adiciona plantLSTLogs.snapshotJson',
    run: async (c) => {
      await addColumnIfNotExists(c, 'plantLSTLogs', 'snapshotJson', 'LONGTEXT');
    },
  },

  // ─── plantStructures (CannaPrune 3D) ────────────────────────────────
  {
    id: 'create-plantStructures',
    description: 'Cria tabela plantStructures',
    run: async (c) => {
      await c.query(`
        CREATE TABLE IF NOT EXISTS \`plantStructures\` (
          \`id\`        INT AUTO_INCREMENT PRIMARY KEY,
          \`plantId\`   INT NOT NULL UNIQUE,
          \`nodesJson\` LONGTEXT NOT NULL,
          \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          CONSTRAINT \`fk_plantStructures_plant\` FOREIGN KEY (\`plantId\`)
            REFERENCES \`plants\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },

  // ─── tuya / smartlife ───────────────────────────────────────────────
  {
    id: 'create-tuyaConfig',
    description: 'Cria tabela tuyaConfig',
    run: async (c) => {
      await c.query(`
        CREATE TABLE IF NOT EXISTS \`tuyaConfig\` (
          \`id\`              INT AUTO_INCREMENT PRIMARY KEY,
          \`userId\`          INT NOT NULL,
          \`accessId\`        VARCHAR(100) NOT NULL,
          \`accessSecret\`    VARCHAR(100) NOT NULL,
          \`region\`          VARCHAR(10) NOT NULL DEFAULT 'eu',
          \`pollIntervalMin\` INT NOT NULL DEFAULT 60,
          \`enabled\`         TINYINT(1) NOT NULL DEFAULT 1,
          \`createdAt\`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          \`updatedAt\`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          UNIQUE KEY \`tuyaConfig_userId\` (\`userId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    id: 'create-tuyaSensorMappings',
    description: 'Cria tabela tuyaSensorMappings',
    run: async (c) => {
      await c.query(`
        CREATE TABLE IF NOT EXISTS \`tuyaSensorMappings\` (
          \`id\`         INT AUTO_INCREMENT PRIMARY KEY,
          \`userId\`     INT NOT NULL,
          \`tentId\`     INT NOT NULL,
          \`deviceId\`   VARCHAR(100) NOT NULL,
          \`deviceName\` VARCHAR(200),
          \`enabled\`    TINYINT(1) NOT NULL DEFAULT 1,
          \`createdAt\`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          UNIQUE KEY \`tuyaSensorMappings_userId_tentId\` (\`userId\`, \`tentId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    id: 'create-sensorLatestReadings',
    description: 'Cria tabela sensorLatestReadings',
    run: async (c) => {
      await c.query(`
        CREATE TABLE IF NOT EXISTS \`sensorLatestReadings\` (
          \`id\`        INT AUTO_INCREMENT PRIMARY KEY,
          \`userId\`    INT NOT NULL,
          \`deviceId\`  VARCHAR(100) NOT NULL,
          \`tempC\`     DECIMAL(4,1),
          \`rhPct\`     DECIMAL(4,1),
          \`readAt\`    TIMESTAMP NOT NULL,
          \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          UNIQUE KEY \`sensorLatestReadings_deviceId\` (\`deviceId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    id: 'create-tuyaDeviceMappings',
    description: 'Cria tabela tuyaDeviceMappings',
    run: async (c) => {
      await c.query(`
        CREATE TABLE IF NOT EXISTS \`tuyaDeviceMappings\` (
          \`id\`         INT AUTO_INCREMENT PRIMARY KEY,
          \`userId\`     INT NOT NULL,
          \`tentId\`     INT NOT NULL,
          \`deviceId\`   VARCHAR(100) NOT NULL,
          \`deviceName\` VARCHAR(200),
          \`switchCode\` VARCHAR(50) NOT NULL DEFAULT 'switch_1',
          \`enabled\`    TINYINT(1) NOT NULL DEFAULT 1,
          \`createdAt\`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          UNIQUE KEY \`tuyaDeviceMappings_user_tent_dev\` (\`userId\`, \`tentId\`, \`deviceId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    id: 'create-tuyaManualScenes',
    description: 'Cria tabela tuyaManualScenes',
    run: async (c) => {
      await c.query(`
        CREATE TABLE IF NOT EXISTS \`tuyaManualScenes\` (
          \`id\`        INT AUTO_INCREMENT PRIMARY KEY,
          \`userId\`    INT NOT NULL,
          \`homeId\`    VARCHAR(50) NOT NULL,
          \`sceneId\`   VARCHAR(100) NOT NULL,
          \`name\`      VARCHAR(200) NOT NULL DEFAULT 'Cena',
          \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          UNIQUE KEY \`tuyaManualScenes_user_scene\` (\`userId\`, \`sceneId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    id: 'add-tuyaConfig-homeId',
    description: 'Adiciona tuyaConfig.homeId',
    run: async (c) => {
      await addColumnIfNotExists(c, 'tuyaConfig', 'homeId', 'VARCHAR(50) NULL AFTER `enabled`');
    },
  },
  {
    id: 'add-tuyaManualScenes-type',
    description: 'Adiciona tuyaManualScenes.type',
    run: async (c) => {
      await addColumnIfNotExists(
        c,
        'tuyaManualScenes',
        'type',
        "VARCHAR(20) NOT NULL DEFAULT 'tap' AFTER `name`"
      );
    },
  },

  // ─── standaloneTasks ────────────────────────────────────────────────
  {
    id: 'create-standaloneTasks',
    description: 'Cria tabela standaloneTasks',
    run: async (c) => {
      await c.query(`
        CREATE TABLE IF NOT EXISTS \`standaloneTasks\` (
          \`id\`          INT AUTO_INCREMENT PRIMARY KEY,
          \`userId\`      INT NOT NULL,
          \`tentId\`      INT,
          \`title\`       VARCHAR(200) NOT NULL,
          \`description\` TEXT,
          \`priority\`    ENUM('LOW','MEDIUM','HIGH') DEFAULT 'MEDIUM' NOT NULL,
          \`dueDate\`     TIMESTAMP NULL,
          \`isDone\`      TINYINT(1) DEFAULT 0 NOT NULL,
          \`completedAt\` TIMESTAMP NULL,
          \`createdAt\`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          INDEX \`standaloneUserIdx\` (\`userId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },

  // ─── strains ────────────────────────────────────────────────────────
  {
    id: 'add-strains-origin',
    description: 'Adiciona strains.origin (FEMINIZED/AUTOFLOWER/CLONE)',
    run: async (c) => {
      await addColumnIfNotExists(
        c,
        'strains',
        'origin',
        "ENUM('FEMINIZED','AUTOFLOWER','CLONE') DEFAULT 'FEMINIZED'"
      );
    },
  },
  {
    id: 'add-plantStructures-potSizeL',
    description: 'Adiciona plantStructures.potSizeL (tamanho do vaso em litros)',
    run: async (c) => {
      await addColumnIfNotExists(c, 'plantStructures', 'potSizeL', 'FLOAT NOT NULL DEFAULT 5');
    },
  },
  {
    id: 'create-deviceTokens',
    description: 'Cria tabela deviceTokens (X-Device-Token p/ ESP32 display)',
    run: async (c) => {
      await c.query(`
        CREATE TABLE IF NOT EXISTS \`deviceTokens\` (
          \`id\`        INT AUTO_INCREMENT PRIMARY KEY,
          \`token\`     VARCHAR(64) NOT NULL UNIQUE,
          \`name\`      VARCHAR(100) NOT NULL,
          \`tentId\`    INT NOT NULL,
          \`groupId\`   INT NOT NULL,
          \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          INDEX \`idx_deviceTokens_tent\` (\`tentId\`),
          INDEX \`idx_deviceTokens_group\` (\`groupId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    // Pareamento estilo OAuth 2.0 Device Authorization Grant (RFC 8628):
    // ESP32 chama /pair-init → recebe código curto → mostra na tela
    // User digita esse código no app web → backend vincula ao tentId
    // ESP32 polla /pair-status → recebe deviceToken longo
    id: 'create-devicePairingCodes',
    description: 'Cria tabela devicePairingCodes (RFC 8628 device pairing flow)',
    run: async (c) => {
      await c.query(`
        CREATE TABLE IF NOT EXISTS \`devicePairingCodes\` (
          \`code\`           VARCHAR(8) PRIMARY KEY,
          \`deviceName\`     VARCHAR(100) NOT NULL DEFAULT 'ESP32 display',
          \`createdAt\`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          \`expiresAt\`      TIMESTAMP NOT NULL,
          \`claimedByUserId\` INT NULL,
          \`tentId\`         INT NULL,
          \`generatedToken\` VARCHAR(64) NULL,
          INDEX \`idx_devicePairingCodes_expires\` (\`expiresAt\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    // Vincula cenas Tuya específicas a uma estufa.
    // Mesmo sceneId pode aparecer em N estufas (compartilhada).
    // Display ESP32 lê tentScenes WHERE tentId = device.tentId, ordenado por position.
    id: 'create-tentScenes',
    description: 'Cria tabela tentScenes (cenas Tuya vinculadas a estufa)',
    run: async (c) => {
      await c.query(`
        CREATE TABLE IF NOT EXISTS \`tentScenes\` (
          \`id\`        INT AUTO_INCREMENT PRIMARY KEY,
          \`tentId\`    INT NOT NULL,
          \`sceneId\`   VARCHAR(64) NOT NULL,
          \`name\`      VARCHAR(100) NOT NULL DEFAULT 'Cena',
          \`position\`  INT NOT NULL DEFAULT 0,
          \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          INDEX \`idx_tentScenes_tent_pos\` (\`tentId\`, \`position\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    // Vincula dispositivos Tuya (lâmpada, exaustor, etc) a uma estufa.
    // ESP32 mostra junto das cenas no mesmo grid 2x3.
    // iconHint: "light"|"fan"|"pump"|"heater"|"ac" — ESP escolhe ícone.
    id: 'create-tentDevices',
    description: 'Cria tabela tentDevices (dispositivos Tuya vinculados a estufa)',
    run: async (c) => {
      await c.query(`
        CREATE TABLE IF NOT EXISTS \`tentDevices\` (
          \`id\`        INT AUTO_INCREMENT PRIMARY KEY,
          \`tentId\`    INT NOT NULL,
          \`deviceId\`  VARCHAR(64) NOT NULL,
          \`name\`      VARCHAR(100) NOT NULL DEFAULT 'Dispositivo',
          \`position\`  INT NOT NULL DEFAULT 0,
          \`iconHint\`  VARCHAR(20) NULL,
          \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          INDEX \`idx_tentDevices_tent_pos\` (\`tentId\`, \`position\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    // Bug em prod (HANDOFF_CENAS_ESTUFA.md ADENDO 2): /api/device/device-toggle
    // descobria switchCode on-the-fly via getTuyaDeviceSwitchState que pegava
    // o PRIMEIRO match de SWITCH_CODES — pra device LED, podia pegar 'switch_1'
    // (que Tuya aceita silenciosamente sem fazer nada) em vez de 'switch_led'
    // (correto). Agora salvamos o switchCode na hora de adicionar o device,
    // igual o app web faz com tuyaSensorMappings.switchCode. Toggle usa o
    // valor salvo direto. Fallback pra discovery se NULL (rows antigas).
    id: 'add-tentDevices-switchCode',
    description: 'Adiciona tentDevices.switchCode (DP do switch — fix toggle)',
    run: async (c) => {
      await addColumnIfNotExists(c, 'tentDevices', 'switchCode', 'VARCHAR(50) NULL AFTER `iconHint`');
    },
  },
  {
    // ADENDO 2 do HANDOFF — bug "device-toggle não muda nada no ESP, mas
    // funciona no app web". Causa raiz: web usa getTuyaConfig(ctx.user.id),
    // ESP REST usa "WHERE u.groupId=? LIMIT 1" pegando QUALQUER user do
    // grupo. Se grupo tem múltiplos users com configs Tuya diferentes,
    // ESP pode pegar a errada.
    //
    // Fix: salvar ownerUserId em deviceTokens (no generate-token e no
    // pair-claim), e no /device-toggle usar getTuyaConfig(ownerUserId)
    // — alinha 100% com o caminho do web.
    id: 'add-deviceTokens-ownerUserId',
    description: 'Adiciona deviceTokens.ownerUserId (fix toggle — usar cfg do user que criou o token)',
    run: async (c) => {
      await addColumnIfNotExists(c, 'deviceTokens', 'ownerUserId', 'INT NULL AFTER `groupId`');
    },
  },
  {
    // Tuya separa "scenes" (Tap-to-Run, one-shot) de "automations" (cenas
    // programadas com gatilho — ex: "Se hora=18:00, ligar luz"). UI precisa
    // diferenciar pra mostrar o botão certo:
    //   scene      → ▶ Disparar (one-shot)
    //   automation → ⏰ Toggle ativa/desativa
    // Antes não salvava o tipo no INSERT — toda cena vinculada virava "scene"
    // por default. Agora salva o tipo real vindo da API Tuya.
    id: 'add-tentScenes-type',
    description: 'Adiciona tentScenes.type (scene | automation — UI usa pra escolher botão)',
    run: async (c) => {
      await addColumnIfNotExists(c, 'tentScenes', 'type', "VARCHAR(20) NOT NULL DEFAULT 'scene' AFTER `name`");
    },
  },
  {
    // Cron novo (incompleteRegistrationReminder) precisa de um type novo pra
    // não confundir com daily_reminder. notificationHistory é usado tambem
    // pra dedupe — não notificar a mesma estufa 2x em 24h.
    id: 'add-notificationHistory-incomplete-log-enum',
    description: 'Adiciona valor "incomplete_log" no enum notificationHistory.type',
    run: async (c) => {
      const [rows] = (await c.execute(
        `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'notificationHistory'
           AND COLUMN_NAME = 'type'
         LIMIT 1`
      )) as [Array<{ COLUMN_TYPE: string }>, unknown];
      if (rows.length === 0) return; // tabela ainda não existe
      if (rows[0].COLUMN_TYPE.includes("'incomplete_log'")) return; // já tem
      await c.query(`
        ALTER TABLE \`notificationHistory\`
        MODIFY COLUMN \`type\` ENUM('daily_reminder','environment_alert','task_reminder','incomplete_log') NOT NULL
      `);
    },
  },
  {
    // Devices já tem iconHint pra mostrar ícone certo no display ESP + UI.
    // Cenas precisam do mesmo: "Rega Manual" → gota, "Lâmpada noite" →
    // lâmpada, etc. Antes era hardcoded Zap pra TODA cena, sem distinção.
    id: 'add-tentScenes-iconHint',
    description: 'Adiciona tentScenes.iconHint (mesmo padrão de tentDevices)',
    run: async (c) => {
      await addColumnIfNotExists(c, 'tentScenes', 'iconHint', 'VARCHAR(20) NULL AFTER `type`');
    },
  },
  {
    // ESP display mostra cenas como "executando" por 5s fixo após o tap.
    // Não bate com a realidade — rega manual pode ter 10s, 30s, 1min, etc.
    // Esse campo permite o user configurar a duração real → ESP usa esse
    // valor pra spinner/animação até a duração real terminar.
    // Default 5s (= comportamento antigo). Range 1-600s (10min max).
    id: 'add-tentScenes-executionSec',
    description: 'Adiciona tentScenes.executionSec (duração real da cena pro ESP usar)',
    run: async (c) => {
      await addColumnIfNotExists(c, 'tentScenes', 'executionSec', 'INT NOT NULL DEFAULT 5 AFTER `iconHint`');
    },
  },
  {
    // Captura de email do site cultivo.pro (waitlist beta).
    // Substitui Formspree quando endpoint próprio for usado.
    // Anti-enumeração: backend retorna sempre 200 mesmo se email duplicado.
    id: 'create-waitlist',
    description: 'Cria tabela waitlist (capturas do form do site público)',
    run: async (c) => {
      await c.query(`
        CREATE TABLE IF NOT EXISTS \`waitlist\` (
          \`id\`        INT AUTO_INCREMENT PRIMARY KEY,
          \`email\`     VARCHAR(200) NOT NULL,
          \`source\`    VARCHAR(50) DEFAULT 'site',
          \`locale\`    VARCHAR(8) DEFAULT 'en',
          \`utmSource\` VARCHAR(64) DEFAULT NULL,
          \`utmMedium\` VARCHAR(64) DEFAULT NULL,
          \`utmCampaign\` VARCHAR(64) DEFAULT NULL,
          \`ipHash\`    VARCHAR(64) DEFAULT NULL,
          \`userAgent\` VARCHAR(255) DEFAULT NULL,
          \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          UNIQUE KEY \`uniq_email\` (\`email\`),
          INDEX \`idx_waitlist_created\` (\`createdAt\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    // Coluna `plan` e `planExpiresAt` em users.
    // Usuários existentes ficam como 'pro' (grandfather — não quebrar ninguém em produção).
    // Novos usuários registrados após esta migration entram como 'free' (default da coluna).
    id: 'users-plan-column',
    description: 'Adiciona coluna plan e planExpiresAt em users; marca existentes como pro',
    run: async (c) => {
      // Verificar se a coluna 'plan' já existe (compatibilidade com MySQL que não suporta ADD COLUMN IF NOT EXISTS)
      const [planColRows] = await c.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'plan'`
      ) as [Array<{ COLUMN_NAME: string }>, unknown];

      if (!planColRows || (planColRows as any[]).length === 0) {
        await c.query(`ALTER TABLE \`users\` ADD COLUMN \`plan\` ENUM('free','pro','team') NOT NULL DEFAULT 'free'`);
      }

      // Verificar planExpiresAt separadamente
      const [expiresColRows] = await c.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'planExpiresAt'`
      ) as [Array<{ COLUMN_NAME: string }>, unknown];

      if (!expiresColRows || (expiresColRows as any[]).length === 0) {
        await c.query(`ALTER TABLE \`users\` ADD COLUMN \`planExpiresAt\` TIMESTAMP NULL DEFAULT NULL`);
      }

      // Grandfather: todos os usuários já existentes ficam como 'pro' (nunca expira)
      await c.query(`UPDATE \`users\` SET \`plan\` = 'pro' WHERE \`plan\` = 'free'`);
    },
  },
  {
    // Configurações globais do site (singleton, id=1).
    // Painel /admin do cultivo-site lê/escreve via GET + PATCH /api/admin/site-settings.
    id: 'create-site-settings',
    description: 'Cria tabela siteSettings (configurações globais do site, singleton)',
    run: async (c) => {
      await c.query(`
        CREATE TABLE IF NOT EXISTS \`siteSettings\` (
          \`id\`                  INT AUTO_INCREMENT PRIMARY KEY,
          \`pricingPt\`           VARCHAR(200) DEFAULT NULL,
          \`pricingEn\`           VARCHAR(200) DEFAULT NULL,
          \`contactEmail\`        VARCHAR(200) DEFAULT NULL,
          \`formspreeId\`         VARCHAR(100) DEFAULT NULL,
          \`betaWaitlistEnabled\` TINYINT(1) DEFAULT 0,
          \`updatedAt\`           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      // Garante que o row singleton (id=1) sempre existe
      await c.query(`INSERT IGNORE INTO \`siteSettings\` (\`id\`) VALUES (1)`);
    },
  },
  {
    // Cultivo Orgânico Fase 1 — método de cultivo por estufa.
    // DEFAULT 'MINERAL' cobre todas as estufas existentes (app nasceu mineral),
    // então zero backfill manual. Driver do comportamento por modo no client
    // (esconde EC/runoff, pH opcional). Ver ORGANIC-IMPLEMENTATION-PLAN.md.
    id: 'add-tents-cultivationMethod',
    description: 'Adiciona tents.cultivationMethod (MINERAL/ORGANIC/COCO/HYDRO, default MINERAL)',
    run: async (c) => {
      await addColumnIfNotExists(c, 'tents', 'cultivationMethod', "VARCHAR(16) NOT NULL DEFAULT 'MINERAL' AFTER `category`");
    },
  },
  {
    // Pricing 4-tier — migra enum users.plan de free/pro/team → free/starter/cloud/pro.
    // Grandfather: 'pro' antigo → 'cloud' (tier destaque, tem tudo que o pro antigo tinha);
    //              'team' antigo → 'pro' (Pro é o novo topo, com equipe).
    // Ordem importa: expandir o enum (superset com os 5 valores temporários) ANTES de
    // remapear os dados, senão o UPDATE pra 'cloud'/'starter' falha (valor inválido no enum antigo).
    // Idempotente: confere se 'cloud' já está no enum antes de mexer.
    id: 'users-plan-4tier',
    description: 'Migra users.plan para 4 tiers (free/starter/cloud/pro) + grandfather pro→cloud, team→pro',
    run: async (c) => {
      // Lê a definição atual da coluna pra checar idempotência
      const [colRows] = await c.query(
        `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'plan'`
      ) as [Array<{ COLUMN_TYPE: string }>, unknown];
      const colType = colRows?.[0]?.COLUMN_TYPE ?? '';
      // Se já tem 'cloud' e NÃO tem 'team', a migração já rodou — sai.
      if (colType.includes("'cloud'") && !colType.includes("'team'")) return;

      // 1. Enum transitório com TODOS os valores (antigos + novos), pra permitir o remap.
      await c.query(
        `ALTER TABLE \`users\` MODIFY COLUMN \`plan\` ENUM('free','pro','team','starter','cloud') NOT NULL DEFAULT 'free'`
      );
      // 2. Grandfather dos dados existentes (ordem: team→pro depois pro→cloud não pode
      //    ser na ordem inversa senão 'team' viraria 'cloud'. Fazemos team→pro primeiro
      //    com um valor sentinela pra evitar colisão).
      await c.query(`UPDATE \`users\` SET \`plan\` = 'starter' WHERE \`plan\` = 'team'`); // sentinela temporária
      await c.query(`UPDATE \`users\` SET \`plan\` = 'cloud'   WHERE \`plan\` = 'pro'`);  // pro antigo → cloud
      await c.query(`UPDATE \`users\` SET \`plan\` = 'pro'     WHERE \`plan\` = 'starter'`); // sentinela → pro (era team)
      // 3. Enum final, só com os 4 valores válidos.
      await c.query(
        `ALTER TABLE \`users\` MODIFY COLUMN \`plan\` ENUM('free','starter','cloud','pro') NOT NULL DEFAULT 'free'`
      );
    },
  },

  // ─── Auditoria 2026-06: pré-flora, tricomas weekNumber, alerta de planta doente ─
  {
    id: 'add-cycles-preFloraStartDate',
    description: 'Adiciona cycles.preFloraStartDate (fase pré-flora)',
    run: async (c) => {
      await addColumnIfNotExists(c, 'cycles', 'preFloraStartDate', 'TIMESTAMP NULL');
    },
  },
  {
    id: 'extend-phase-enums-pre-flora',
    description: 'Adiciona PRE_FLORA aos enums de fase',
    run: async (c) => {
      for (const t of ['weeklyTargets', 'recipeTemplates', 'taskTemplates', 'safetyLimits', 'nutrientApplications']) {
        if (await tableExists(c, t)) {
          await c.query(`ALTER TABLE \`${t}\` MODIFY COLUMN \`phase\` ENUM('CLONING','VEGA','PRE_FLORA','FLORA','MAINTENANCE','DRYING') NOT NULL`);
        }
      }
      if (await tableExists(c, 'phaseAlertMargins')) {
        await c.query(`ALTER TABLE \`phaseAlertMargins\` MODIFY COLUMN \`phase\` ENUM('MAINTENANCE','CLONING','VEGA','PRE_FLORA','FLORA','DRYING') NOT NULL`);
      }
      for (const t of ['fertilizationPresets', 'wateringPresets']) {
        if (await tableExists(c, t)) {
          await c.query(`ALTER TABLE \`${t}\` MODIFY COLUMN \`phase\` ENUM('VEGA','PRE_FLORA','FLORA')`);
        }
      }
    },
  },
  {
    id: 'add-plantTrichomeLogs-weekNumber',
    description: 'Adiciona plantTrichomeLogs.weekNumber',
    run: async (c) => {
      await addColumnIfNotExists(c, 'plantTrichomeLogs', 'weekNumber', 'INT NULL');
    },
  },
  {
    id: 'extend-alerts-enums-plant-health',
    description: 'Adiciona PLANT_HEALTH/HEALTH aos enums de alerts (alerta de planta doente)',
    run: async (c) => {
      if (await tableExists(c, 'alerts')) {
        await c.query(`ALTER TABLE \`alerts\` MODIFY COLUMN \`alertType\` ENUM('OUT_OF_RANGE','SAFETY_LIMIT','TREND','PLANT_HEALTH') NOT NULL`);
        await c.query(`ALTER TABLE \`alerts\` MODIFY COLUMN \`metric\` ENUM('TEMP','RH','PPFD','PH','HEALTH') NOT NULL`);
      }
    },
  },
  {
    // T12 — integridade referencial multi-tenant. ON DELETE SET NULL (decisão do
    // João): deletar grupo NÃO apaga os dados via cascata (a deleção de conta já
    // remove tudo explicitamente em db-account-delete.ts). Limpa órfãos antes de
    // criar a FK pra o ALTER não falhar. ownerId fica de fora (é NOT NULL).
    id: 'add-groupId-foreign-keys',
    description: 'FK groupId → groups.id (ON DELETE SET NULL) nas tabelas multi-tenant',
    run: async (c) => {
      const tables = [
        'users', 'tents', 'strains', 'plants', 'taskTemplates', 'recipeTemplates',
        'wateringPresets', 'fertilizationPresets', 'weeklyTargets',
        'notificationHistory', 'pushSubscriptions', 'pumpPresets', 'phaseAlertMargins',
      ];
      for (const t of tables) {
        if (!(await tableExists(c, t))) continue;
        if (!(await columnExists(c, t, 'groupId'))) continue;
        if (await fkExists(c, t, 'groupId', 'groups')) continue;
        // 1. Limpa órfãos: groupId apontando pra grupo inexistente vira NULL.
        await c.query(
          `UPDATE \`${t}\` SET \`groupId\` = NULL
           WHERE \`groupId\` IS NOT NULL AND \`groupId\` NOT IN (SELECT id FROM \`groups\`)`
        );
        // 2. Cria a FK.
        try {
          await c.query(
            `ALTER TABLE \`${t}\` ADD CONSTRAINT \`${t}_groupId_groups_fk\`
             FOREIGN KEY (\`groupId\`) REFERENCES \`groups\`(\`id\`) ON DELETE SET NULL`
          );
          console.log(`[Migrations] FK groupId adicionada em ${t}`);
        } catch (e) {
          console.warn(`[Migrations] FK groupId em ${t} não criada: ${(e as Error)?.message}`);
        }
      }
    },
  },
];

// ── Políticas de ON DELETE para FKs ──────────────────────────────────────────

/**
 * Antes deste patch, todas as 18 FKs eram criadas sem ON DELETE
 * (= NO ACTION/RESTRICT padrão). Resultado: deletar uma estufa falhava
 * silenciosamente OU deixava órfãos no banco quando alguma rota burlava
 * a checagem.
 *
 * Política definida (ver schema.ts — fonte canônica):
 * - CASCADE  : registros filhos pertencem ao pai (cycles, alerts, recipes)
 * - SET NULL : referência opcional (motherPlant, currentTent, fromTent)
 * - RESTRICT : bloqueia delete se houver dependências (plant ⇒ strain)
 */
const FK_POLICIES: ReadonlyArray<readonly [string, string, string, string, string]> = [
  // [table, column, refTable, refColumn, action]
  ['cycles',           'tentId',                'tents',         'id', 'CASCADE'],
  ['cycles',           'strainId',              'strains',       'id', 'SET NULL'],
  ['cycles',           'motherPlantId',         'plants',        'id', 'SET NULL'],
  ['tentAState',       'tentId',                'tents',         'id', 'CASCADE'],
  ['tentAState',       'activeCloningEventId',  'cloningEvents', 'id', 'SET NULL'],
  ['cloningEvents',    'tentId',                'tents',         'id', 'CASCADE'],
  ['weeklyTargets',    'strainId',              'strains',       'id', 'CASCADE'],
  ['dailyLogs',        'tentId',                'tents',         'id', 'CASCADE'],
  ['recipes',          'tentId',                'tents',         'id', 'CASCADE'],
  ['taskInstances',    'tentId',                'tents',         'id', 'CASCADE'],
  ['taskInstances',    'taskTemplateId',        'taskTemplates', 'id', 'CASCADE'],
  ['alerts',           'tentId',                'tents',         'id', 'CASCADE'],
  ['alertSettings',    'tentId',                'tents',         'id', 'CASCADE'],
  ['alertHistory',     'tentId',                'tents',         'id', 'CASCADE'],
  ['plants',           'strainId',              'strains',       'id', 'RESTRICT'],
  ['plants',           'currentTentId',         'tents',         'id', 'SET NULL'],
  ['plantTentHistory', 'fromTentId',            'tents',         'id', 'SET NULL'],
  ['plantTentHistory', 'toTentId',              'tents',         'id', 'SET NULL'],
];

async function applyForeignKeyPolicies(conn: Conn): Promise<void> {
  let changedCount = 0;
  let skippedCount = 0;

  for (const [table, column, refTable, refColumn, action] of FK_POLICIES) {
    try {
      const [rows] = (await conn.execute(
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
      )) as [Array<{ CONSTRAINT_NAME: string; DELETE_RULE: string }>, unknown];

      const existing = rows[0];
      const desiredCanonicalName = `fk_${table}_${column}`;

      if (
        existing &&
        existing.CONSTRAINT_NAME === desiredCanonicalName &&
        existing.DELETE_RULE === action
      ) {
        skippedCount++;
        continue;
      }

      if (existing) {
        await conn.query(
          `ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${existing.CONSTRAINT_NAME}\``
        );
      }

      await conn.query(
        `ALTER TABLE \`${table}\`
         ADD CONSTRAINT \`${desiredCanonicalName}\`
         FOREIGN KEY (\`${column}\`) REFERENCES \`${refTable}\`(\`${refColumn}\`)
         ON DELETE ${action}`
      );

      console.log(`[Migrations] ✅ FK ${table}.${column} → ${refTable}.${refColumn} ON DELETE ${action}`);
      changedCount++;
    } catch (e) {
      const errno = (e as { errno?: number })?.errno;
      // 1146 = table doesn't exist (ainda não criada — pula, próxima execução pega)
      // 1452 = FK constraint fails (existem órfãos — não trava deploy)
      if (errno === 1146) continue;
      if (errno === 1452) {
        console.error(
          `[Migrations] ⚠️  FK ${table}.${column} → ${refTable}.${refColumn} ON DELETE ${action} ` +
            `falhou: existem órfãos em ${table}. Limpe-os e re-rode db:migrate.`
        );
        continue;
      }
      console.error(`[Migrations] ❌ Erro em FK ${table}.${column}: ${(e as Error).message}`);
      throw e;
    }
  }

  if (changedCount === 0 && skippedCount === FK_POLICIES.length) {
    console.log(`[Migrations] ✅ Todas as ${FK_POLICIES.length} FKs já têm política ON DELETE correta.`);
  } else if (changedCount > 0) {
    console.log(`[Migrations] ✅ ${changedCount} FK(s) atualizada(s).`);
  }
}

// ── Runner principal ─────────────────────────────────────────────────────────

/**
 * Executa todas as migrations + políticas de FK no pool fornecido.
 *
 * Se nenhum pool for passado, usa o singleton de mysql-pool.ts.
 * Idempotente: rodar 2x não faz nada na segunda.
 */
export async function runMigrations(pool?: Pool): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log('[Migrations] DATABASE_URL não definida — pulando migrations.');
    return;
  }

  console.log('[Migrations] 🔄 Verificando schema do banco...');

  // Resolve pool: passado, ou singleton compartilhado
  let activePool: Pool;
  if (pool) {
    activePool = pool;
  } else {
    const { getMysqlPool } = await import('../mysql-pool');
    activePool = getMysqlPool();
  }

  let appliedCount = 0;
  for (const migration of MIGRATIONS) {
    try {
      await migration.run(activePool);
      // Não loga cada step (ruidoso) — só os que efetivamente mudam algo
      // logam dentro do próprio run() com mensagens [Migrations] ...
      appliedCount++;
    } catch (e) {
      const errno = (e as { errno?: number })?.errno;
      // 1060 = coluna duplicada, 1050 = tabela duplicada → idempotência
      if (errno === 1060 || errno === 1050) continue;
      console.error(`[Migrations] ❌ ${migration.id} falhou: ${(e as Error).message}`);
      throw e;
    }
  }

  console.log(`[Migrations] ✅ ${appliedCount}/${MIGRATIONS.length} migrations processadas.`);

  // Após todas as DDLs, aplica políticas de FK
  await applyForeignKeyPolicies(activePool);

  console.log('[Migrations] ✅ Schema sincronizado.');
}

// NOTA: O CLI entrypoint foi removido daqui para evitar conflito com o bundle
// do esbuild. Quando empacotado, import.meta.url aponta para o bundle (dist/index.js),
// então o check `isMainModule` retornava true ao subir o servidor e chamava
// process.exit(0) — causando restart loop em produção.
//
// Para rodar migrations manualmente: pnpm db:migrate
// (usa db-migrate.mjs que não depende desse arquivo)
