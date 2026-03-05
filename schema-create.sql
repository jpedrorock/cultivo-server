-- ============================================================
-- App Cultivo — MySQL Schema Completo
-- Gerado a partir de drizzle/schema.ts (atualizado em 2026-03)
-- ============================================================
-- Execute este arquivo para criar o banco do zero em um novo servidor.
-- Inclui todas as 32 tabelas, índices e constraints.
-- ============================================================

SET FOREIGN_KEY_CHECKS=0;
SET NAMES utf8mb4;

-- 1. USERS
CREATE TABLE IF NOT EXISTS `users` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `openId`       VARCHAR(64) NOT NULL UNIQUE,
  `name`         TEXT,
  `email`        VARCHAR(320),
  `loginMethod`  VARCHAR(64),
  `role`         ENUM('user', 'admin') DEFAULT 'user' NOT NULL,
  `createdAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  `lastSignedIn` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. TENTS (Estufas)
CREATE TABLE IF NOT EXISTS `tents` (
  `id`        INT AUTO_INCREMENT PRIMARY KEY,
  `name`      VARCHAR(50) NOT NULL,
  `category`  ENUM('MAINTENANCE', 'VEGA', 'FLORA', 'DRYING') NOT NULL,
  `width`     INT NOT NULL,
  `depth`     INT NOT NULL,
  `height`    INT NOT NULL,
  `volume`    DECIMAL(10,3) NOT NULL,
  `powerW`    INT,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. STRAINS (Variedades genéticas)
CREATE TABLE IF NOT EXISTS `strains` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `name`        VARCHAR(100) NOT NULL UNIQUE,
  `description` TEXT,
  `vegaWeeks`   INT DEFAULT 4 NOT NULL,
  `floraWeeks`  INT DEFAULT 8 NOT NULL,
  `isActive`    BOOLEAN DEFAULT TRUE NOT NULL,
  `createdAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. CYCLES (Ciclos de cultivo)
-- NOTA: motherPlantId referencia plants, mas plants ainda não existe aqui.
-- A FK é adicionada via ALTER TABLE após a criação de plants (veja abaixo).
CREATE TABLE IF NOT EXISTS `cycles` (
  `id`               INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`           INT NOT NULL,
  `strainId`         INT,
  `startDate`        TIMESTAMP NOT NULL,
  `cloningStartDate` TIMESTAMP,
  `floraStartDate`   TIMESTAMP,
  `motherPlantId`    INT,
  `clonesProduced`   INT,
  `harvestWeight`    DECIMAL(10,2),
  `harvestNotes`     TEXT,
  `status`           ENUM('ACTIVE', 'FINISHED') DEFAULT 'ACTIVE' NOT NULL,
  `createdAt`        TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`tentId`)   REFERENCES `tents`(`id`)   ON DELETE CASCADE,
  FOREIGN KEY (`strainId`) REFERENCES `strains`(`id`) ON DELETE SET NULL,
  INDEX `tentIdx`   (`tentId`),
  INDEX `strainIdx` (`strainId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. TENT A STATE
CREATE TABLE IF NOT EXISTS `tentAState` (
  `id`                   INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`               INT NOT NULL UNIQUE,
  `mode`                 ENUM('MAINTENANCE', 'CLONING') DEFAULT 'MAINTENANCE' NOT NULL,
  `activeCloningEventId` INT,
  `updatedAt`            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`tentId`) REFERENCES `tents`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. CLONING EVENTS
CREATE TABLE IF NOT EXISTS `cloningEvents` (
  `id`        INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`    INT NOT NULL,
  `startDate` TIMESTAMP NOT NULL,
  `endDate`   TIMESTAMP NOT NULL,
  `status`    ENUM('ACTIVE', 'FINISHED') DEFAULT 'ACTIVE' NOT NULL,
  `notes`     TEXT,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`tentId`) REFERENCES `tents`(`id`) ON DELETE CASCADE,
  INDEX `tentIdx` (`tentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. WEEKLY TARGETS
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
  `phMin`       DECIMAL(3,1),
  `phMax`       DECIMAL(3,1),
  `ecMin`       DECIMAL(4,2),
  `ecMax`       DECIMAL(4,2),
  `lightHours`  INT,
  `notes`       TEXT,
  `createdAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`strainId`) REFERENCES `strains`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `strainPhaseWeekUnique` (`strainId`, `phase`, `weekNumber`),
  INDEX `strainIdx` (`strainId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. DAILY LOGS
CREATE TABLE IF NOT EXISTS `dailyLogs` (
  `id`        INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`    INT NOT NULL,
  `cycleId`   INT,
  `logDate`   TIMESTAMP NOT NULL,
  `turn`      ENUM('AM', 'PM') NOT NULL,
  `temp`      DECIMAL(4,1),
  `rh`        DECIMAL(4,1),
  `ppfd`      INT,
  `ph`        DECIMAL(3,1),
  `ec`        DECIMAL(4,2),
  `co2`       INT,
  `vpd`       DECIMAL(4,2),
  `notes`     TEXT,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`tentId`)  REFERENCES `tents`(`id`)  ON DELETE CASCADE,
  FOREIGN KEY (`cycleId`) REFERENCES `cycles`(`id`) ON DELETE SET NULL,
  INDEX `tentIdx`    (`tentId`),
  INDEX `cycleIdx`   (`cycleId`),
  INDEX `logDateIdx` (`logDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. RECIPES
CREATE TABLE IF NOT EXISTS `recipes` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`       INT NOT NULL,
  `cycleId`      INT,
  `name`         VARCHAR(100) NOT NULL,
  `turn`         ENUM('AM', 'PM') NOT NULL,
  `phase`        VARCHAR(50),
  `weekNumber`   INT,
  `volumeL`      DECIMAL(6,2),
  `ecTarget`     DECIMAL(4,2),
  `phTarget`     DECIMAL(3,1),
  `productsJson` TEXT,
  `notes`        TEXT,
  `createdAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`tentId`)  REFERENCES `tents`(`id`)  ON DELETE CASCADE,
  FOREIGN KEY (`cycleId`) REFERENCES `cycles`(`id`) ON DELETE SET NULL,
  INDEX `tentIdx`  (`tentId`),
  INDEX `cycleIdx` (`cycleId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. RECIPE TEMPLATES
CREATE TABLE IF NOT EXISTS `recipeTemplates` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `name`         VARCHAR(100) NOT NULL,
  `phase`        ENUM('CLONING', 'VEGA', 'FLORA', 'MAINTENANCE', 'DRYING') NOT NULL,
  `weekNumber`   INT,
  `volumeL`      DECIMAL(6,2),
  `ecTarget`     DECIMAL(4,2),
  `phTarget`     DECIMAL(3,1),
  `productsJson` TEXT,
  `notes`        TEXT,
  `isActive`     BOOLEAN DEFAULT TRUE NOT NULL,
  `createdAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. TASK TEMPLATES
CREATE TABLE IF NOT EXISTS `taskTemplates` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `title`       VARCHAR(200) NOT NULL,
  `description` TEXT,
  `context`     ENUM('TENT_A', 'TENT_BC') NOT NULL,
  `phase`       ENUM('CLONING', 'VEGA', 'FLORA', 'MAINTENANCE', 'DRYING') NOT NULL,
  `weekNumber`  INT,
  `isActive`    BOOLEAN DEFAULT TRUE NOT NULL,
  `createdAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. TASK INSTANCES
CREATE TABLE IF NOT EXISTS `taskInstances` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `templateId`  INT,
  `tentId`      INT NOT NULL,
  `cycleId`     INT,
  `title`       VARCHAR(200) NOT NULL,
  `description` TEXT,
  `phase`       VARCHAR(50),
  `weekNumber`  INT,
  `dueDate`     TIMESTAMP,
  `completedAt` TIMESTAMP,
  `status`      ENUM('PENDING', 'DONE', 'SKIPPED') DEFAULT 'PENDING' NOT NULL,
  `notes`       TEXT,
  `createdAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`tentId`)     REFERENCES `tents`(`id`)         ON DELETE CASCADE,
  FOREIGN KEY (`cycleId`)    REFERENCES `cycles`(`id`)        ON DELETE SET NULL,
  FOREIGN KEY (`templateId`) REFERENCES `taskTemplates`(`id`) ON DELETE SET NULL,
  INDEX `tentIdx`   (`tentId`),
  INDEX `cycleIdx`  (`cycleId`),
  INDEX `statusIdx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. ALERTS
CREATE TABLE IF NOT EXISTS `alerts` (
  `id`        INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`    INT NOT NULL,
  `cycleId`   INT,
  `logId`     INT,
  `alertType` ENUM('OUT_OF_RANGE', 'SAFETY_LIMIT', 'TREND') NOT NULL,
  `metric`    ENUM('TEMP', 'RH', 'PPFD', 'PH') NOT NULL,
  `value`     DECIMAL(8,2),
  `turn`      ENUM('AM', 'PM'),
  `message`   TEXT NOT NULL,
  `status`    ENUM('NEW', 'SEEN') DEFAULT 'NEW' NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`tentId`)  REFERENCES `tents`(`id`)     ON DELETE CASCADE,
  FOREIGN KEY (`cycleId`) REFERENCES `cycles`(`id`)    ON DELETE SET NULL,
  FOREIGN KEY (`logId`)   REFERENCES `dailyLogs`(`id`) ON DELETE SET NULL,
  INDEX `tentIdx`    (`tentId`),
  INDEX `statusIdx`  (`status`),
  INDEX `createdIdx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. SAFETY LIMITS
CREATE TABLE IF NOT EXISTS `safetyLimits` (
  `id`        INT AUTO_INCREMENT PRIMARY KEY,
  `context`   ENUM('TENT_A', 'TENT_BC') NOT NULL,
  `phase`     ENUM('CLONING', 'VEGA', 'FLORA', 'MAINTENANCE', 'DRYING') NOT NULL,
  `metric`    ENUM('TEMP', 'RH', 'PPFD', 'PH') NOT NULL,
  `minValue`  DECIMAL(6,2) NOT NULL,
  `maxValue`  DECIMAL(6,2) NOT NULL,
  `unit`      VARCHAR(20) NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY `context_phase_metric` (`context`, `phase`, `metric`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. ALERT SETTINGS
CREATE TABLE IF NOT EXISTS `alertSettings` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `tentId`       INT NOT NULL,
  `metric`       ENUM('TEMP', 'RH', 'PPFD', 'PH') NOT NULL,
  `enabled`      BOOLEAN DEFAULT TRUE NOT NULL,
  `minThreshold` DECIMAL(8,2),
  `maxThreshold` DECIMAL(8,2),
  `createdAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`tentId`) REFERENCES `tents`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `tent_metric` (`tentId`, `metric`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. ALERT HISTORY
CREATE TABLE IF NOT EXISTS `alertHistory` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `alertId`     INT NOT NULL,
  `metric`      ENUM('TEMP', 'RH', 'PPFD', 'PH') NOT NULL,
  `action`      ENUM('CREATED', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED') NOT NULL,
  `performedBy` VARCHAR(100),
  `notes`       TEXT,
  `createdAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`alertId`) REFERENCES `alerts`(`id`) ON DELETE CASCADE,
  INDEX `alertIdx`   (`alertId`),
  INDEX `createdIdx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. PHASE ALERT MARGINS
CREATE TABLE IF NOT EXISTS `phaseAlertMargins` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `phase`       ENUM('MAINTENANCE', 'CLONING', 'VEGA', 'FLORA', 'DRYING') NOT NULL UNIQUE,
  `tempMargin`  DECIMAL(4,1) DEFAULT 2.0,
  `rhMargin`    DECIMAL(4,1) DEFAULT 5.0,
  `ppfdMargin`  INT DEFAULT 50,
  `phMargin`    DECIMAL(3,1) DEFAULT 0.3,
  `ecMargin`    DECIMAL(4,2) DEFAULT 0.2,
  `createdAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. NOTIFICATION HISTORY
CREATE TABLE IF NOT EXISTS `notificationHistory` (
  `id`      INT AUTO_INCREMENT PRIMARY KEY,
  `type`    ENUM('daily_reminder', 'environment_alert', 'task_reminder') NOT NULL,
  `title`   VARCHAR(200) NOT NULL,
  `body`    TEXT,
  `data`    TEXT,
  `sentAt`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `read`    BOOLEAN DEFAULT FALSE NOT NULL,
  INDEX `typeIdx` (`type`),
  INDEX `sentIdx` (`sentAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. NOTIFICATION SETTINGS
CREATE TABLE IF NOT EXISTS `notificationSettings` (
  `id`                   INT AUTO_INCREMENT PRIMARY KEY,
  `systemPaused`         BOOLEAN DEFAULT FALSE NOT NULL,
  `tempAlertsEnabled`    BOOLEAN DEFAULT TRUE NOT NULL,
  `rhAlertsEnabled`      BOOLEAN DEFAULT TRUE NOT NULL,
  `ppfdAlertsEnabled`    BOOLEAN DEFAULT TRUE NOT NULL,
  `phAlertsEnabled`      BOOLEAN DEFAULT TRUE NOT NULL,
  `taskRemindersEnabled` BOOLEAN DEFAULT TRUE NOT NULL,
  `dailySummaryEnabled`  BOOLEAN DEFAULT FALSE NOT NULL,
  `dailySummaryTime`     VARCHAR(5) DEFAULT '09:00',
  `createdAt`            TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 20. ALERT PREFERENCES
CREATE TABLE IF NOT EXISTS `alertPreferences` (
  `id`                   INT AUTO_INCREMENT PRIMARY KEY,
  `pushEnabled`          BOOLEAN DEFAULT FALSE NOT NULL,
  `pushSubscriptionJson` TEXT,
  `emailEnabled`         BOOLEAN DEFAULT FALSE NOT NULL,
  `email`                VARCHAR(320),
  `inAppEnabled`         BOOLEAN DEFAULT TRUE NOT NULL,
  `quietHoursEnabled`    BOOLEAN DEFAULT FALSE NOT NULL,
  `quietHoursStart`      VARCHAR(5) DEFAULT '22:00',
  `quietHoursEnd`        VARCHAR(5) DEFAULT '07:00',
  `createdAt`            TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 21. PLANTS (Plantas individuais)
CREATE TABLE IF NOT EXISTS `plants` (
  `id`                INT AUTO_INCREMENT PRIMARY KEY,
  `name`              VARCHAR(100) NOT NULL,
  `code`              VARCHAR(50),
  `strainId`          INT NOT NULL,
  `currentTentId`     INT,
  `plantStage`        ENUM('CLONE', 'SEEDLING', 'PLANT') DEFAULT 'SEEDLING' NOT NULL,
  `status`            ENUM('ACTIVE', 'AWAITING_DRYING', 'HARVESTED', 'DEAD', 'DISCARDED') DEFAULT 'ACTIVE' NOT NULL,
  `harvestQueueAt`    TIMESTAMP NULL,
  `harvestQueueNotes` TEXT,
  `finishedAt`        TIMESTAMP,
  `finishReason`      TEXT,
  `notes`             TEXT,
  `createdAt`         TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`strainId`)      REFERENCES `strains`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`currentTentId`) REFERENCES `tents`(`id`)   ON DELETE SET NULL,
  INDEX `strainIdx` (`strainId`),
  INDEX `tentIdx`   (`currentTentId`),
  INDEX `statusIdx` (`status`),
  INDEX `stageIdx`  (`plantStage`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Agora que plants existe, adicionar a FK de motherPlantId em cycles
ALTER TABLE `cycles`
  ADD CONSTRAINT `cycles_motherPlantId_plants_id_fk`
  FOREIGN KEY (`motherPlantId`) REFERENCES `plants`(`id`) ON DELETE SET NULL;

-- 22. PLANT TENT HISTORY
CREATE TABLE IF NOT EXISTS `plantTentHistory` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `plantId`    INT NOT NULL,
  `fromTentId` INT,
  `toTentId`   INT NOT NULL,
  `movedAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `reason`     TEXT,
  FOREIGN KEY (`plantId`)    REFERENCES `plants`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`fromTentId`) REFERENCES `tents`(`id`)  ON DELETE SET NULL,
  FOREIGN KEY (`toTentId`)   REFERENCES `tents`(`id`)  ON DELETE RESTRICT,
  INDEX `plantIdx` (`plantId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 23. PLANT OBSERVATIONS
CREATE TABLE IF NOT EXISTS `plantObservations` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `plantId`     INT NOT NULL,
  `observedAt`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `title`       VARCHAR(200),
  `description` TEXT,
  `tags`        TEXT,
  `createdAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`plantId`) REFERENCES `plants`(`id`) ON DELETE CASCADE,
  INDEX `plantIdx`    (`plantId`),
  INDEX `observedIdx` (`observedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 24. PLANT PHOTOS
CREATE TABLE IF NOT EXISTS `plantPhotos` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `plantId`      INT NOT NULL,
  `takenAt`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `url`          TEXT NOT NULL,
  `thumbnailUrl` TEXT,
  `caption`      TEXT,
  `tags`         TEXT,
  `createdAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`plantId`) REFERENCES `plants`(`id`) ON DELETE CASCADE,
  INDEX `plantIdx` (`plantId`),
  INDEX `takenIdx` (`takenAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 25. PLANT RUNOFF LOGS
CREATE TABLE IF NOT EXISTS `plantRunoffLogs` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `plantId`       INT NOT NULL,
  `loggedAt`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `inputVolL`     DECIMAL(5,2),
  `runoffVolL`    DECIMAL(5,2),
  `runoffPercent` DECIMAL(4,1),
  `runoffPh`      DECIMAL(3,1),
  `runoffEc`      DECIMAL(4,2),
  `notes`         TEXT,
  `createdAt`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`plantId`) REFERENCES `plants`(`id`) ON DELETE CASCADE,
  INDEX `plantIdx`  (`plantId`),
  INDEX `loggedIdx` (`loggedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 26. PLANT HEALTH LOGS
CREATE TABLE IF NOT EXISTS `plantHealthLogs` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `plantId`      INT NOT NULL,
  `loggedAt`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `healthStatus` ENUM('HEALTHY', 'STRESSED', 'SICK', 'RECOVERING') NOT NULL,
  `symptoms`     TEXT,
  `treatment`    TEXT,
  `photoUrl`     TEXT,
  `notes`        TEXT,
  `createdAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`plantId`) REFERENCES `plants`(`id`) ON DELETE CASCADE,
  INDEX `plantIdx`  (`plantId`),
  INDEX `loggedIdx` (`loggedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 27. PLANT TRICHOME LOGS
CREATE TABLE IF NOT EXISTS `plantTrichomeLogs` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `plantId`        INT NOT NULL,
  `loggedAt`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `trichomeStatus` ENUM('CLEAR', 'CLOUDY', 'AMBER', 'MIXED') NOT NULL,
  `clearPercent`   INT,
  `cloudyPercent`  INT,
  `amberPercent`   INT,
  `photoUrl`       TEXT,
  `notes`          TEXT,
  `harvestReady`   BOOLEAN DEFAULT FALSE NOT NULL,
  `createdAt`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`plantId`) REFERENCES `plants`(`id`) ON DELETE CASCADE,
  INDEX `plantIdx`  (`plantId`),
  INDEX `loggedIdx` (`loggedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 28. PLANT LST LOGS
CREATE TABLE IF NOT EXISTS `plantLSTLogs` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `plantId`     INT NOT NULL,
  `loggedAt`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `technique`   VARCHAR(100),
  `description` TEXT,
  `photoUrl`    TEXT,
  `notes`       TEXT,
  `createdAt`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`plantId`) REFERENCES `plants`(`id`) ON DELETE CASCADE,
  INDEX `plantIdx`  (`plantId`),
  INDEX `loggedIdx` (`loggedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 29. FERTILIZATION PRESETS
CREATE TABLE IF NOT EXISTS `fertilizationPresets` (
  `id`              INT AUTO_INCREMENT PRIMARY KEY,
  `name`            VARCHAR(100) NOT NULL,
  `description`     TEXT,
  `phase`           ENUM('VEGA', 'FLORA'),
  `weekNumber`      INT,
  `productsJson`    TEXT NOT NULL,
  `calculationMode` ENUM('per-irrigation', 'per-week') NOT NULL,
  `ecTarget`        DECIMAL(4,2),
  `phTarget`        DECIMAL(3,1),
  `isActive`        BOOLEAN DEFAULT TRUE NOT NULL,
  `createdAt`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 30. WATERING PRESETS
CREATE TABLE IF NOT EXISTS `wateringPresets` (
  `id`                  INT AUTO_INCREMENT PRIMARY KEY,
  `name`                VARCHAR(100) NOT NULL,
  `description`         TEXT,
  `phase`               ENUM('VEGA', 'FLORA'),
  `potSizeL`            DECIMAL(5,2),
  `waterPerPotL`        DECIMAL(5,2),
  `targetRunoffPercent` DECIMAL(4,1),
  `notes`               TEXT,
  `isActive`            BOOLEAN DEFAULT TRUE NOT NULL,
  `createdAt`           TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt`           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 31. NUTRIENT APPLICATIONS
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
  FOREIGN KEY (`tentId`)           REFERENCES `tents`(`id`)           ON DELETE CASCADE,
  FOREIGN KEY (`cycleId`)          REFERENCES `cycles`(`id`)          ON DELETE SET NULL,
  FOREIGN KEY (`recipeTemplateId`) REFERENCES `recipeTemplates`(`id`) ON DELETE SET NULL,
  INDEX `tentId_idx`          (`tentId`),
  INDEX `cycleId_idx`         (`cycleId`),
  INDEX `applicationDate_idx` (`applicationDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 32. WATERING APPLICATIONS
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
  FOREIGN KEY (`tentId`)  REFERENCES `tents`(`id`)  ON DELETE CASCADE,
  FOREIGN KEY (`cycleId`) REFERENCES `cycles`(`id`) ON DELETE SET NULL,
  INDEX `tentId_idx`          (`tentId`),
  INDEX `cycleId_idx`         (`cycleId`),
  INDEX `applicationDate_idx` (`applicationDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- DADOS INICIAIS (seed mínimo para o app funcionar)
-- ============================================================

-- Configurações de notificação padrão (uma linha global)
INSERT IGNORE INTO `notificationSettings` (`id`, `systemPaused`) VALUES (1, FALSE);

-- Margens de alerta padrão por fase
INSERT IGNORE INTO `phaseAlertMargins` (`phase`, `tempMargin`, `rhMargin`, `ppfdMargin`, `phMargin`, `ecMargin`) VALUES
  ('MAINTENANCE', 3.0, 8.0, 100, 0.5, 0.3),
  ('CLONING',     2.0, 5.0,  50, 0.3, 0.2),
  ('VEGA',        2.0, 5.0,  75, 0.3, 0.2),
  ('FLORA',       2.0, 5.0,  75, 0.3, 0.2),
  ('DRYING',      2.0, 5.0,   0, 0.0, 0.0);

SET FOREIGN_KEY_CHECKS=1;

-- ============================================================
-- FIM DO SCHEMA
-- ============================================================
-- Para criar o banco do zero:
--   CREATE DATABASE cultivo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   USE cultivo;
--   SOURCE schema-create.sql;
--
-- Para resetar completamente (apagar tudo e recriar):
--   DROP DATABASE cultivo;
--   CREATE DATABASE cultivo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   USE cultivo;
--   SOURCE schema-create.sql;
-- ============================================================
