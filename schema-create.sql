-- ============================================================
-- CULTIVO APP - SCHEMA COMPLETO
-- Gerado a partir de drizzle/schema.ts (sincronizado manualmente)
-- Versão: 2025-03 (com AWAITING_DRYING, harvestQueue, sistema de plantas)
-- ============================================================
-- INSTRUÇÕES DE USO:
--   Para criar do zero:
--     CREATE DATABASE cultivo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--     USE cultivo;
--     SOURCE schema-create.sql;
--
--   Para resetar completamente (via script):
--     pnpm db:restart
-- ============================================================

SET FOREIGN_KEY_CHECKS=0;

-- ============================================================
-- 1. GROUPS (Cultivos / grupos de usuários)
-- ============================================================
CREATE TABLE IF NOT EXISTS `groups` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `name`       VARCHAR(100) NOT NULL,
  `inviteCode` VARCHAR(20) NOT NULL UNIQUE,
  `ownerId`    INT NOT NULL,
  `createdAt`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `email`        VARCHAR(320) NOT NULL UNIQUE,
  `passwordHash` VARCHAR(255) NOT NULL,
  `name`         TEXT,
  `openId`       VARCHAR(64) UNIQUE,
  `loginMethod`  VARCHAR(64),
  `role`         ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  `groupId`      INT NULL,
  `avatarUrl`    TEXT NULL,
  `createdAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  `lastSignedIn` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. TENTS (Estufas)
-- ============================================================
CREATE TABLE IF NOT EXISTS `tents` (
  `id`        INT AUTO_INCREMENT PRIMARY KEY,
  `name`      VARCHAR(50) NOT NULL,
  `category`  ENUM('MAINTENANCE', 'VEGA', 'FLORA', 'DRYING') NOT NULL,
  `width`     INT NOT NULL,
  `depth`     INT NOT NULL,
  `height`    INT NOT NULL,
  `volume`    DECIMAL(10,3) NOT NULL,
  `powerW`    INT,
  `groupId`   INT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. STRAINS (Variedades genéticas)
-- ============================================================
CREATE TABLE IF NOT EXISTS `strains` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `name`        VARCHAR(100) NOT NULL UNIQUE,
  `description` TEXT,
  `vegaWeeks`   INT NOT NULL DEFAULT 4,
  `floraWeeks`  INT NOT NULL DEFAULT 8,
  `isActive`    BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. PLANTS (Plantas individuais) - antes de cycles por FK circular
-- ============================================================
CREATE TABLE IF NOT EXISTS `plants` (
  `id`                INT AUTO_INCREMENT PRIMARY KEY,
  `name`              VARCHAR(100) NOT NULL,
  `code`              VARCHAR(50),
  `strainId`          INT NOT NULL,
  `currentTentId`     INT,
  `plantStage`        ENUM('CLONE', 'SEEDLING', 'PLANT') NOT NULL DEFAULT 'SEEDLING',
  `status`            ENUM('ACTIVE', 'AWAITING_DRYING', 'HARVESTED', 'DEAD', 'DISCARDED') NOT NULL DEFAULT 'ACTIVE',
  `harvestQueueAt`    TIMESTAMP NULL,
  `harvestQueueNotes` TEXT,
  `finishedAt`        TIMESTAMP NULL,
  `finishReason`      TEXT,
  `notes`             TEXT,
  `createdAt`         TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`strainId`)      REFERENCES `strains`(`id`),
  FOREIGN KEY (`currentTentId`) REFERENCES `tents`(`id`),
  INDEX `strainIdx`  (`strainId`),
  INDEX `tentIdx`    (`currentTentId`),
  INDEX `statusIdx`  (`status`),
  INDEX `stageIdx`   (`plantStage`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. CYCLES (Ciclos de cultivo)
-- ============================================================
CREATE TABLE IF NOT EXISTS `cycles` (
  `id`               INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`           INT NOT NULL,
  `strainId`         INT,
  `startDate`        TIMESTAMP NOT NULL,
  `cloningStartDate` TIMESTAMP NULL,
  `floraStartDate`   TIMESTAMP NULL,
  `motherPlantId`    INT,
  `clonesProduced`   INT,
  `harvestWeight`    DECIMAL(10,2),
  `harvestNotes`     TEXT,
  `status`           ENUM('ACTIVE', 'FINISHED') NOT NULL DEFAULT 'ACTIVE',
  `createdAt`        TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`tentId`)        REFERENCES `tents`(`id`),
  FOREIGN KEY (`strainId`)      REFERENCES `strains`(`id`),
  FOREIGN KEY (`motherPlantId`) REFERENCES `plants`(`id`),
  INDEX `tentIdx`   (`tentId`),
  INDEX `strainIdx` (`strainId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. CLONING EVENTS (Eventos de Clonagem - Estufa A)
-- ============================================================
CREATE TABLE IF NOT EXISTS `cloningEvents` (
  `id`        INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`    INT NOT NULL,
  `startDate` TIMESTAMP NOT NULL,
  `endDate`   TIMESTAMP NOT NULL,
  `status`    ENUM('ACTIVE', 'FINISHED') NOT NULL DEFAULT 'ACTIVE',
  `notes`     TEXT,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`tentId`) REFERENCES `tents`(`id`),
  INDEX `tentIdx` (`tentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. TENT A STATE (Estado da Estufa A)
-- ============================================================
CREATE TABLE IF NOT EXISTS `tentAState` (
  `id`                   INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`               INT NOT NULL UNIQUE,
  `mode`                 ENUM('MAINTENANCE', 'CLONING') NOT NULL DEFAULT 'MAINTENANCE',
  `activeCloningEventId` INT,
  `updatedAt`            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`tentId`)               REFERENCES `tents`(`id`),
  FOREIGN KEY (`activeCloningEventId`) REFERENCES `cloningEvents`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. WEEKLY TARGETS (Metas semanais por strain/fase)
-- ============================================================
CREATE TABLE IF NOT EXISTS `weeklyTargets` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `strainId`    INT NOT NULL,
  `phase`       ENUM('CLONING', 'VEGA', 'FLORA', 'MAINTENANCE', 'DRYING') NOT NULL,
  `weekNumber`  INT NOT NULL,
  `tempMin`     DECIMAL(4,1),
  `tempMax`     DECIMAL(4,1),
  `rhMin`       DECIMAL(4,1),
  `rhMax`       DECIMAL(4,1),
  `ppfdMin`     INT,
  `ppfdMax`     INT,
  `photoperiod` VARCHAR(10),
  `phMin`       DECIMAL(3,1),
  `phMax`       DECIMAL(3,1),
  `ecMin`       DECIMAL(3,1),
  `ecMax`       DECIMAL(3,1),
  `notes`       TEXT,
  `createdAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY `strainPhaseWeekUnique` (`strainId`, `phase`, `weekNumber`),
  FOREIGN KEY (`strainId`) REFERENCES `strains`(`id`),
  INDEX `strainIdx` (`strainId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. DAILY LOGS (Registros diários AM/PM)
-- ============================================================
CREATE TABLE IF NOT EXISTS `dailyLogs` (
  `id`                INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`            INT NOT NULL,
  `logDate`           TIMESTAMP NOT NULL,
  `turn`              ENUM('AM', 'PM') NOT NULL,
  `tempC`             DECIMAL(4,1),
  `rhPct`             DECIMAL(4,1),
  `ppfd`              INT,
  `ph`                DECIMAL(3,1),
  `ec`                DECIMAL(4,2),
  `wateringVolume`    INT,
  `runoffCollected`   INT,
  `runoffPercentage`  DECIMAL(5,2),
  `notes`             TEXT,
  `createdAt`         TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY `tentDateTurnUnique` (`tentId`, `logDate`, `turn`),
  FOREIGN KEY (`tentId`) REFERENCES `tents`(`id`),
  INDEX `tentIdx` (`tentId`),
  INDEX `dateIdx` (`logDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. RECIPES (Receitas do dia - fertilização)
-- ============================================================
CREATE TABLE IF NOT EXISTS `recipes` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`       INT NOT NULL,
  `logDate`      TIMESTAMP NOT NULL,
  `turn`         ENUM('AM', 'PM') NOT NULL,
  `volumeTotalL` DECIMAL(6,2),
  `ecTarget`     DECIMAL(4,2),
  `phTarget`     DECIMAL(3,1),
  `productsJson` TEXT,
  `notes`        TEXT,
  `createdAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY `tentDateTurnUnique` (`tentId`, `logDate`, `turn`),
  FOREIGN KEY (`tentId`) REFERENCES `tents`(`id`),
  INDEX `tentIdx` (`tentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 11. RECIPE TEMPLATES (Biblioteca de receitas)
-- ============================================================
CREATE TABLE IF NOT EXISTS `recipeTemplates` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `name`         VARCHAR(100) NOT NULL,
  `phase`        ENUM('CLONING', 'VEGA', 'FLORA', 'MAINTENANCE', 'DRYING') NOT NULL,
  `weekNumber`   INT,
  `volumeTotalL` DECIMAL(6,2),
  `ecTarget`     DECIMAL(4,2),
  `phTarget`     DECIMAL(3,1),
  `productsJson` TEXT NOT NULL,
  `notes`        TEXT,
  `createdAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 12. TASK TEMPLATES (Templates de tarefas)
-- ============================================================
CREATE TABLE IF NOT EXISTS `taskTemplates` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `context`     ENUM('TENT_A', 'TENT_BC') NOT NULL,
  `phase`       ENUM('CLONING', 'VEGA', 'FLORA', 'MAINTENANCE', 'DRYING') NOT NULL,
  `weekNumber`  INT,
  `title`       VARCHAR(200) NOT NULL,
  `description` TEXT,
  `createdAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 13. TASK INSTANCES (Instâncias de tarefas)
-- ============================================================
CREATE TABLE IF NOT EXISTS `taskInstances` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`         INT NOT NULL,
  `taskTemplateId` INT NOT NULL,
  `occurrenceDate` TIMESTAMP NOT NULL,
  `isDone`         BOOLEAN NOT NULL DEFAULT FALSE,
  `completedAt`    TIMESTAMP NULL,
  `notes`          TEXT,
  `createdAt`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY `tentTaskDateUnique` (`tentId`, `taskTemplateId`, `occurrenceDate`),
  FOREIGN KEY (`tentId`)         REFERENCES `tents`(`id`),
  FOREIGN KEY (`taskTemplateId`) REFERENCES `taskTemplates`(`id`),
  INDEX `tentIdx` (`tentId`),
  INDEX `dateIdx` (`occurrenceDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 14. ALERTS (Alertas gerados)
-- ============================================================
CREATE TABLE IF NOT EXISTS `alerts` (
  `id`        INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`    INT NOT NULL,
  `alertType` ENUM('OUT_OF_RANGE', 'SAFETY_LIMIT', 'TREND') NOT NULL,
  `metric`    ENUM('TEMP', 'RH', 'PPFD', 'PH') NOT NULL,
  `logDate`   TIMESTAMP NOT NULL,
  `turn`      ENUM('AM', 'PM'),
  `value`     DECIMAL(10,2),
  `message`   TEXT NOT NULL,
  `status`    ENUM('NEW', 'SEEN') NOT NULL DEFAULT 'NEW',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`tentId`) REFERENCES `tents`(`id`),
  INDEX `tentIdx`   (`tentId`),
  INDEX `statusIdx` (`status`),
  INDEX `dateIdx`   (`logDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 15. SAFETY LIMITS (Limites de segurança por fase)
-- ============================================================
CREATE TABLE IF NOT EXISTS `safetyLimits` (
  `id`        INT AUTO_INCREMENT PRIMARY KEY,
  `context`   ENUM('TENT_A', 'TENT_BC') NOT NULL,
  `phase`     ENUM('CLONING', 'VEGA', 'FLORA', 'MAINTENANCE', 'DRYING') NOT NULL,
  `metric`    ENUM('TEMP', 'RH', 'PPFD', 'PH') NOT NULL,
  `minValue`  DECIMAL(10,2),
  `maxValue`  DECIMAL(10,2),
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY `contextPhaseMetricUnique` (`context`, `phase`, `metric`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 16. ALERT SETTINGS (Configurações de alertas por estufa)
-- ============================================================
CREATE TABLE IF NOT EXISTS `alertSettings` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`        INT NOT NULL UNIQUE,
  `alertsEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `tempEnabled`   BOOLEAN NOT NULL DEFAULT TRUE,
  `rhEnabled`     BOOLEAN NOT NULL DEFAULT TRUE,
  `ppfdEnabled`   BOOLEAN NOT NULL DEFAULT TRUE,
  `phEnabled`     BOOLEAN NOT NULL DEFAULT TRUE,
  `tempMargin`    DECIMAL(3,1) NOT NULL DEFAULT 2.0,
  `rhMargin`      DECIMAL(3,1) NOT NULL DEFAULT 5.0,
  `ppfdMargin`    INT NOT NULL DEFAULT 50,
  `phMargin`      DECIMAL(2,1) NOT NULL DEFAULT 0.2,
  `createdAt`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`tentId`) REFERENCES `tents`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 17. ALERT HISTORY (Histórico de alertas disparados)
-- ============================================================
CREATE TABLE IF NOT EXISTS `alertHistory` (
  `id`                INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`            INT NOT NULL,
  `metric`            ENUM('TEMP', 'RH', 'PPFD', 'PH') NOT NULL,
  `value`             DECIMAL(10,2) NOT NULL,
  `targetMin`         DECIMAL(10,2),
  `targetMax`         DECIMAL(10,2),
  `message`           TEXT NOT NULL,
  `notificationSent`  BOOLEAN NOT NULL DEFAULT FALSE,
  `isRead`            BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt`         TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`tentId`) REFERENCES `tents`(`id`),
  INDEX `tentIdx` (`tentId`),
  INDEX `dateIdx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 18. PHASE ALERT MARGINS (Margens de alerta por fase)
-- ============================================================
CREATE TABLE IF NOT EXISTS `phaseAlertMargins` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `phase`       ENUM('MAINTENANCE', 'CLONING', 'VEGA', 'FLORA', 'DRYING') NOT NULL UNIQUE,
  `tempMargin`  DECIMAL(3,1) NOT NULL,
  `rhMargin`    DECIMAL(3,1) NOT NULL,
  `ppfdMargin`  INT NOT NULL,
  `phMargin`    DECIMAL(2,1),
  `createdAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 19. NOTIFICATION HISTORY (Histórico de notificações enviadas)
-- ============================================================
CREATE TABLE IF NOT EXISTS `notificationHistory` (
  `id`       INT AUTO_INCREMENT PRIMARY KEY,
  `type`     ENUM('daily_reminder', 'environment_alert', 'task_reminder') NOT NULL,
  `title`    VARCHAR(255) NOT NULL,
  `message`  TEXT NOT NULL,
  `metadata` TEXT,
  `isRead`   BOOLEAN NOT NULL DEFAULT FALSE,
  `sentAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `typeIdx` (`type`),
  INDEX `dateIdx` (`sentAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 20. ALERT PREFERENCES (Preferências de alertas globais)
-- ============================================================
CREATE TABLE IF NOT EXISTS `alertPreferences` (
  `id`                 INT AUTO_INCREMENT PRIMARY KEY,
  `temperatureEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `temperatureMin`     DECIMAL(5,2) DEFAULT 18.00,
  `temperatureMax`     DECIMAL(5,2) DEFAULT 28.00,
  `humidityEnabled`    BOOLEAN NOT NULL DEFAULT TRUE,
  `humidityMin`        DECIMAL(5,2) DEFAULT 40.00,
  `humidityMax`        DECIMAL(5,2) DEFAULT 70.00,
  `phEnabled`          BOOLEAN NOT NULL DEFAULT TRUE,
  `phMin`              DECIMAL(4,2) DEFAULT 5.50,
  `phMax`              DECIMAL(4,2) DEFAULT 6.50,
  `ppfdEnabled`        BOOLEAN NOT NULL DEFAULT TRUE,
  `ppfdMin`            DECIMAL(6,2) DEFAULT 400.00,
  `createdAt`          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 21. NOTIFICATION SETTINGS (Configurações de notificações push)
-- ============================================================
CREATE TABLE IF NOT EXISTS `notificationSettings` (
  `id`                   INT AUTO_INCREMENT PRIMARY KEY,
  `systemPaused`         BOOLEAN NOT NULL DEFAULT FALSE,
  `tempAlertsEnabled`    BOOLEAN NOT NULL DEFAULT TRUE,
  `rhAlertsEnabled`      BOOLEAN NOT NULL DEFAULT TRUE,
  `ppfdAlertsEnabled`    BOOLEAN NOT NULL DEFAULT TRUE,
  `phAlertsEnabled`      BOOLEAN NOT NULL DEFAULT TRUE,
  `taskRemindersEnabled`  BOOLEAN NOT NULL DEFAULT TRUE,
  `dailyReminderEnabled`  BOOLEAN NOT NULL DEFAULT FALSE,
  `reminderTimes`         TEXT DEFAULT '[]',
  `dailySummaryEnabled`   BOOLEAN NOT NULL DEFAULT FALSE,
  `dailySummaryTime`      VARCHAR(5) DEFAULT '09:00',
  `createdAt`            TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 22. PLANT TENT HISTORY (Histórico de movimentação de plantas)
-- ============================================================
CREATE TABLE IF NOT EXISTS `plantTentHistory` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `plantId`    INT NOT NULL,
  `fromTentId` INT,
  `toTentId`   INT NULL,   -- nullable: planta pode sair para fila sem estufa destino
  `movedAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `reason`     TEXT,
  FOREIGN KEY (`plantId`)    REFERENCES `plants`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`fromTentId`) REFERENCES `tents`(`id`),
  FOREIGN KEY (`toTentId`)   REFERENCES `tents`(`id`),
  INDEX `plantIdx` (`plantId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 23. PLANT OBSERVATIONS (Observações diárias por planta)
-- ============================================================
CREATE TABLE IF NOT EXISTS `plantObservations` (
  `id`              INT AUTO_INCREMENT PRIMARY KEY,
  `plantId`         INT NOT NULL,
  `observationDate` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `content`         TEXT NOT NULL,
  `createdAt`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`plantId`) REFERENCES `plants`(`id`) ON DELETE CASCADE,
  INDEX `plantIdx` (`plantId`),
  INDEX `dateIdx`  (`observationDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 24. PLANT PHOTOS (Fotos das plantas)
-- ============================================================
CREATE TABLE IF NOT EXISTS `plantPhotos` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `plantId`     INT NOT NULL,
  `photoUrl`    VARCHAR(500) NOT NULL,
  `photoKey`    VARCHAR(500),
  `description` TEXT,
  `photoDate`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `createdAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`plantId`) REFERENCES `plants`(`id`) ON DELETE CASCADE,
  INDEX `plantIdx` (`plantId`),
  INDEX `dateIdx`  (`photoDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 25. PLANT RUNOFF LOGS (Registros de runoff por planta)
-- ============================================================
CREATE TABLE IF NOT EXISTS `plantRunoffLogs` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `plantId`       INT NOT NULL,
  `logDate`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `volumeIn`      DECIMAL(6,2) NOT NULL,
  `volumeOut`     DECIMAL(6,2) NOT NULL,
  `runoffPercent` DECIMAL(5,2) NOT NULL,
  `notes`         TEXT,
  `createdAt`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`plantId`) REFERENCES `plants`(`id`) ON DELETE CASCADE,
  INDEX `plantIdx` (`plantId`),
  INDEX `dateIdx`  (`logDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 26. PLANT HEALTH LOGS (Registros de saúde da planta)
-- ============================================================
CREATE TABLE IF NOT EXISTS `plantHealthLogs` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `plantId`      INT NOT NULL,
  `logDate`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `healthStatus` ENUM('HEALTHY', 'STRESSED', 'SICK', 'RECOVERING') NOT NULL,
  `symptoms`     TEXT,
  `treatment`    TEXT,
  `notes`        TEXT,
  `photoUrl`     VARCHAR(500),
  `photoKey`     VARCHAR(500),
  `createdAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`plantId`) REFERENCES `plants`(`id`) ON DELETE CASCADE,
  INDEX `plantIdx` (`plantId`),
  INDEX `dateIdx`  (`logDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 27. PLANT TRICHOME LOGS (Registros de tricomas)
-- ============================================================
CREATE TABLE IF NOT EXISTS `plantTrichomeLogs` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `plantId`        INT NOT NULL,
  `logDate`        TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `trichomeStatus` ENUM('CLEAR', 'CLOUDY', 'AMBER', 'MIXED') NOT NULL,
  `clearPercent`   INT,
  `cloudyPercent`  INT,
  `amberPercent`   INT,
  `photoUrl`       VARCHAR(500),
  `photoKey`       VARCHAR(500),
  `notes`          TEXT,
  `createdAt`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`plantId`) REFERENCES `plants`(`id`) ON DELETE CASCADE,
  INDEX `plantIdx` (`plantId`),
  INDEX `dateIdx`  (`logDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 28. PLANT LST LOGS (Registros de técnicas LST)
-- ============================================================
CREATE TABLE IF NOT EXISTS `plantLSTLogs` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `plantId`        INT NOT NULL,
  `logDate`        TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `technique`      VARCHAR(100) NOT NULL,
  `beforePhotoUrl` VARCHAR(500),
  `beforePhotoKey` VARCHAR(500),
  `afterPhotoUrl`  VARCHAR(500),
  `afterPhotoKey`  VARCHAR(500),
  `response`       TEXT,
  `notes`          TEXT,
  `createdAt`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`plantId`) REFERENCES `plants`(`id`) ON DELETE CASCADE,
  INDEX `plantIdx` (`plantId`),
  INDEX `dateIdx`  (`logDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 29. FERTILIZATION PRESETS (Predefinições de fertilização)
-- ============================================================
CREATE TABLE IF NOT EXISTS `fertilizationPresets` (
  `id`                  INT AUTO_INCREMENT PRIMARY KEY,
  `name`                VARCHAR(100) NOT NULL,
  `waterVolume`         DECIMAL(10,2) NOT NULL,
  `targetEC`            DECIMAL(10,2) NOT NULL,
  `phase`               ENUM('VEGA', 'FLORA'),
  `weekNumber`          INT,
  `irrigationsPerWeek`  DECIMAL(10,1),
  `calculationMode`     ENUM('per-irrigation', 'per-week') NOT NULL,
  `createdAt`           TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 30. WATERING PRESETS (Predefinições de rega)
-- ============================================================
CREATE TABLE IF NOT EXISTS `wateringPresets` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `name`         VARCHAR(100) NOT NULL,
  `plantCount`   INT NOT NULL,
  `potSize`      DECIMAL(10,1) NOT NULL,
  `targetRunoff` DECIMAL(10,1) NOT NULL,
  `phase`        ENUM('VEGA', 'FLORA'),
  `weekNumber`   INT,
  `createdAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 31. NUTRIENT APPLICATIONS (Histórico de aplicações de nutrientes)
-- ============================================================
CREATE TABLE IF NOT EXISTS `nutrientApplications` (
  `id`               INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`           INT NOT NULL,
  `cycleId`          INT,
  `recipeTemplateId` INT,
  `applicationDate`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `recipeName`       VARCHAR(100) NOT NULL,
  `phase`            ENUM('CLONING', 'VEGA', 'FLORA', 'MAINTENANCE', 'DRYING') NOT NULL,
  `weekNumber`       INT,
  `volumeTotalL`     DECIMAL(6,2) NOT NULL,
  `ecTarget`         DECIMAL(4,2),
  `ecActual`         DECIMAL(4,2),
  `phTarget`         DECIMAL(3,1),
  `phActual`         DECIMAL(3,1),
  `productsJson`     TEXT NOT NULL,
  `notes`            TEXT,
  `createdAt`        TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`tentId`)           REFERENCES `tents`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`cycleId`)          REFERENCES `cycles`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`recipeTemplateId`) REFERENCES `recipeTemplates`(`id`) ON DELETE SET NULL,
  INDEX `tentId_idx`          (`tentId`),
  INDEX `cycleId_idx`         (`cycleId`),
  INDEX `applicationDate_idx` (`applicationDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 32. WATERING APPLICATIONS (Histórico de aplicações de rega)
-- ============================================================
CREATE TABLE IF NOT EXISTS `wateringApplications` (
  `id`                  INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`              INT NOT NULL,
  `cycleId`             INT,
  `applicationDate`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `recipeName`          VARCHAR(100) NOT NULL,
  `potSizeL`            DECIMAL(5,2) NOT NULL,
  `numberOfPots`        INT NOT NULL,
  `waterPerPotL`        DECIMAL(5,2) NOT NULL,
  `totalWaterL`         DECIMAL(7,2) NOT NULL,
  `targetRunoffPercent` DECIMAL(4,1),
  `expectedRunoffL`     DECIMAL(6,2),
  `actualRunoffL`       DECIMAL(6,2),
  `actualRunoffPercent` DECIMAL(4,1),
  `notes`               TEXT,
  `createdAt`           TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`tentId`)  REFERENCES `tents`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`cycleId`) REFERENCES `cycles`(`id`) ON DELETE SET NULL,
  INDEX `tentId_idx`          (`tentId`),
  INDEX `cycleId_idx`         (`cycleId`),
  INDEX `applicationDate_idx` (`applicationDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 33. PUSH SUBSCRIPTIONS (Subscriptions Web Push para notificações em background)
-- ============================================================
CREATE TABLE IF NOT EXISTS `pushSubscriptions` (
  `id`              INT AUTO_INCREMENT PRIMARY KEY,
  `endpoint`        VARCHAR(512) NOT NULL UNIQUE,
  `keysJson`        TEXT NOT NULL,
  `reminderEnabled` TINYINT(1) NOT NULL DEFAULT 0,
  `reminderTimes`   TEXT,
  `createdAt`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ============================================================
-- DADOS INICIAIS (seed mínimo para o app funcionar)
-- ============================================================

-- Configurações de notificação padrão (uma linha global)
INSERT IGNORE INTO `notificationSettings` (`id`, `systemPaused`) VALUES (1, FALSE);

-- Margens de alerta padrão por fase
INSERT IGNORE INTO `phaseAlertMargins` (`phase`, `tempMargin`, `rhMargin`, `ppfdMargin`, `phMargin`) VALUES
  ('MAINTENANCE', 3.0, 8.0, 100, 0.5),
  ('CLONING',     2.0, 5.0,  50, 0.3),
  ('VEGA',        2.0, 5.0,  75, 0.3),
  ('FLORA',       2.0, 5.0,  75, 0.3),
  ('DRYING',      2.0, 5.0,   0, NULL);

SET FOREIGN_KEY_CHECKS=1;

-- ============================================================
-- FIM DO SCHEMA
-- ============================================================
