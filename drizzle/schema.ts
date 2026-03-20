import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  unique,
  index,
} from "drizzle-orm/mysql-core";

/**
 * Grupos — cada grupo tem seus próprios dados de cultivo (estufas, plantas, etc.)
 * Usuários globais compartilham dados dentro do mesmo grupo.
 */
export const groups = mysqlTable("groups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  inviteCode: varchar("inviteCode", { length: 20 }).notNull().unique(),
  ownerId: int("ownerId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Group = typeof groups.$inferSelect;
export type InsertGroup = typeof groups.$inferInsert;

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Email do usuário - único e obrigatório */
  email: varchar("email", { length: 320 }).notNull().unique(),
  /** Hash da senha (bcrypt) - obrigatório para autenticação local */
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  /** Nome do usuário */
  name: text("name"),
  /** Manus OAuth identifier (openId) - opcional, para compatibilidade com versão antiga */
  openId: varchar("openId", { length: 64 }).unique(),
  /** Método de login (email, google, apple, etc) */
  loginMethod: varchar("loginMethod", { length: 64 }),
  /** Role do usuário */
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /** Grupo ao qual o usuário pertence (null = ainda não configurou) */
  groupId: int("groupId"),
  /** URL da foto de perfil (Google OAuth) */
  avatarUrl: text("avatarUrl"),
  /** Timestamps */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Estufas (número ilimitado, categoria selecionável)
 */
export const tents = mysqlTable("tents", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  category: mysqlEnum("category", ["MAINTENANCE", "VEGA", "FLORA", "DRYING"]).notNull(),
  width: int("width").notNull(),
  depth: int("depth").notNull(),
  height: int("height").notNull(),
  volume: decimal("volume", { precision: 10, scale: 3 }).notNull(),
  powerW: int("powerW"),
  /** Grupo ao qual esta estufa pertence */
  groupId: int("groupId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Tent = typeof tents.$inferSelect;
export type InsertTent = typeof tents.$inferInsert;

/**
 * Strains (variedades genéticas)
 */
export const strains = mysqlTable("strains", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  vegaWeeks: int("vegaWeeks").default(4).notNull(),
  floraWeeks: int("floraWeeks").default(8).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  /** null = strain global (visível para todos); preenchido = privada do grupo */
  groupId: int("groupId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Strain = typeof strains.$inferSelect;
export type InsertStrain = typeof strains.$inferInsert;

/**
 * Ciclos ativos (Estufas B e C)
 */
export const cycles = mysqlTable(
  "cycles",
  {
    id: int("id").autoincrement().primaryKey(),
    tentId: int("tentId")
      .notNull()
      .references(() => tents.id),
    strainId: int("strainId")
      .references(() => strains.id), // Opcional: ciclo pode ter múltiplas strains via plantas individuais
    startDate: timestamp("startDate").notNull(),
    cloningStartDate: timestamp("cloningStartDate"),
    floraStartDate: timestamp("floraStartDate"),
    motherPlantId: int("motherPlantId")
      .references(() => plants.id), // Planta-mãe usada para clonagem (quando fase = CLONING)
    clonesProduced: int("clonesProduced"), // Número de clones produzidos ao retornar de CLONING para MAINTENANCE
    harvestWeight: decimal("harvestWeight", { precision: 10, scale: 2 }), // Peso estimado da colheita em gramas
    harvestNotes: text("harvestNotes"), // Notas sobre a colheita
    status: mysqlEnum("status", ["ACTIVE", "FINISHED"]).default("ACTIVE").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tentIdx: index("tentIdx").on(table.tentId),
    strainIdx: index("strainIdx").on(table.strainId),
  })
);

export type Cycle = typeof cycles.$inferSelect;
export type InsertCycle = typeof cycles.$inferInsert;

/**
 * Estado da Estufa A (Manutenção ou Clonagem)
 */
export const tentAState = mysqlTable("tentAState", {
  id: int("id").autoincrement().primaryKey(),
  tentId: int("tentId")
    .notNull()
    .references(() => tents.id)
    .unique(),
  mode: mysqlEnum("mode", ["MAINTENANCE", "CLONING"]).default("MAINTENANCE").notNull(),
  activeCloningEventId: int("activeCloningEventId").references(() => cloningEvents.id),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TentAState = typeof tentAState.$inferSelect;
export type InsertTentAState = typeof tentAState.$inferInsert;

/**
 * Eventos de Clonagem (Estufa A)
 */
export const cloningEvents = mysqlTable(
  "cloningEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    tentId: int("tentId")
      .notNull()
      .references(() => tents.id),
    startDate: timestamp("startDate").notNull(),
    endDate: timestamp("endDate").notNull(),
    status: mysqlEnum("status", ["ACTIVE", "FINISHED"]).default("ACTIVE").notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    tentIdx: index("tentIdx").on(table.tentId),
  })
);

export type CloningEvent = typeof cloningEvents.$inferSelect;
export type InsertCloningEvent = typeof cloningEvents.$inferInsert;

/**
 * Padrões Semanais (targets por strain, fase e semana)
 */
export const weeklyTargets = mysqlTable(
  "weeklyTargets",
  {
    id: int("id").autoincrement().primaryKey(),
    strainId: int("strainId")
      .notNull()
      .references(() => strains.id),
    phase: mysqlEnum("phase", ["CLONING", "VEGA", "FLORA", "MAINTENANCE", "DRYING"]).notNull(),
    weekNumber: int("weekNumber").notNull(),
    tempMin: decimal("tempMin", { precision: 4, scale: 1 }),
    tempMax: decimal("tempMax", { precision: 4, scale: 1 }),
    rhMin: decimal("rhMin", { precision: 4, scale: 1 }),
    rhMax: decimal("rhMax", { precision: 4, scale: 1 }),
    ppfdMin: int("ppfdMin"),
    ppfdMax: int("ppfdMax"),
    photoperiod: varchar("photoperiod", { length: 10 }), // Ex: "18/6", "12/12"
    phMin: decimal("phMin", { precision: 3, scale: 1 }),
    phMax: decimal("phMax", { precision: 3, scale: 1 }),
    ecMin: decimal("ecMin", { precision: 3, scale: 1 }),
    ecMax: decimal("ecMax", { precision: 3, scale: 1 }),
    notes: text("notes"),
    /** Grupo ao qual este target pertence */
    groupId: int("groupId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    strainPhaseWeekUnique: unique("strainPhaseWeekUnique").on(
      table.strainId,
      table.phase,
      table.weekNumber
    ),
    strainIdx: index("strainIdx").on(table.strainId),
  })
);

export type WeeklyTarget = typeof weeklyTargets.$inferSelect;
export type InsertWeeklyTarget = typeof weeklyTargets.$inferInsert;

/**
 * Registros Diários (manhã e noite)
 */
export const dailyLogs = mysqlTable(
  "dailyLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    tentId: int("tentId")
      .notNull()
      .references(() => tents.id),
    logDate: timestamp("logDate").notNull(),
    turn: mysqlEnum("turn", ["AM", "PM"]).notNull(),
    tempC: decimal("tempC", { precision: 4, scale: 1 }),
    rhPct: decimal("rhPct", { precision: 4, scale: 1 }),
    ppfd: int("ppfd"),
    ph: decimal("ph", { precision: 3, scale: 1 }),
    ec: decimal("ec", { precision: 4, scale: 2 }),
    wateringVolume: int("wateringVolume"), // Volume regado em ml
    runoffCollected: int("runoffCollected"), // Runoff coletado em ml
    runoffPercentage: decimal("runoffPercentage", { precision: 5, scale: 2 }), // Calculado: (runoffCollected / wateringVolume) * 100
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    tentDateTurnUnique: unique("tentDateTurnUnique").on(table.tentId, table.logDate, table.turn),
    tentIdx: index("tentIdx").on(table.tentId),
    dateIdx: index("dateIdx").on(table.logDate),
  })
);

export type DailyLog = typeof dailyLogs.$inferSelect;
export type InsertDailyLog = typeof dailyLogs.$inferInsert;

/**
 * Receitas (fertilização do dia)
 */
export const recipes = mysqlTable(
  "recipes",
  {
    id: int("id").autoincrement().primaryKey(),
    tentId: int("tentId")
      .notNull()
      .references(() => tents.id),
    logDate: timestamp("logDate").notNull(),
    turn: mysqlEnum("turn", ["AM", "PM"]).notNull(),
    volumeTotalL: decimal("volumeTotalL", { precision: 6, scale: 2 }),
    ecTarget: decimal("ecTarget", { precision: 4, scale: 2 }),
    phTarget: decimal("phTarget", { precision: 3, scale: 1 }),
    productsJson: text("productsJson"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    tentDateTurnUnique: unique("tentDateTurnUnique").on(table.tentId, table.logDate, table.turn),
    tentIdx: index("tentIdx").on(table.tentId),
  })
);

export type Recipe = typeof recipes.$inferSelect;
export type InsertRecipe = typeof recipes.$inferInsert;

/**
 * Templates de Receitas (biblioteca)
 */
export const recipeTemplates = mysqlTable("recipeTemplates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  phase: mysqlEnum("phase", ["CLONING", "VEGA", "FLORA", "MAINTENANCE", "DRYING"]).notNull(),
  weekNumber: int("weekNumber"),
  volumeTotalL: decimal("volumeTotalL", { precision: 6, scale: 2 }),
  ecTarget: decimal("ecTarget", { precision: 4, scale: 2 }),
  phTarget: decimal("phTarget", { precision: 3, scale: 1 }),
  productsJson: text("productsJson").notNull(),
  notes: text("notes"),
  /** null = template global; preenchido = privado do grupo */
  groupId: int("groupId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RecipeTemplate = typeof recipeTemplates.$inferSelect;
export type InsertRecipeTemplate = typeof recipeTemplates.$inferInsert;

/**
 * Templates de Tarefas (fixas por fase/semana)
 */
export const taskTemplates = mysqlTable("taskTemplates", {
  id: int("id").autoincrement().primaryKey(),
  context: mysqlEnum("context", ["TENT_A", "TENT_BC"]).notNull(),
  phase: mysqlEnum("phase", ["CLONING", "VEGA", "FLORA", "MAINTENANCE", "DRYING"]).notNull(),
  weekNumber: int("weekNumber"),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  /** null = template global; preenchido = privado do grupo */
  groupId: int("groupId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TaskTemplate = typeof taskTemplates.$inferSelect;
export type InsertTaskTemplate = typeof taskTemplates.$inferInsert;

/**
 * Instâncias de Tarefas (execução)
 */
export const taskInstances = mysqlTable(
  "taskInstances",
  {
    id: int("id").autoincrement().primaryKey(),
    tentId: int("tentId")
      .notNull()
      .references(() => tents.id),
    taskTemplateId: int("taskTemplateId")
      .notNull()
      .references(() => taskTemplates.id),
    occurrenceDate: timestamp("occurrenceDate").notNull(),
    isDone: boolean("isDone").default(false).notNull(),
    completedAt: timestamp("completedAt"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    tentTaskDateUnique: unique("tentTaskDateUnique").on(
      table.tentId,
      table.taskTemplateId,
      table.occurrenceDate
    ),
    tentIdx: index("tentIdx").on(table.tentId),
    dateIdx: index("dateIdx").on(table.occurrenceDate),
  })
);

export type TaskInstance = typeof taskInstances.$inferSelect;
export type InsertTaskInstance = typeof taskInstances.$inferInsert;

/**
 * Alertas
 */
export const alerts = mysqlTable(
  "alerts",
  {
    id: int("id").autoincrement().primaryKey(),
    tentId: int("tentId")
      .notNull()
      .references(() => tents.id),
    alertType: mysqlEnum("alertType", ["OUT_OF_RANGE", "SAFETY_LIMIT", "TREND"]).notNull(),
    metric: mysqlEnum("metric", ["TEMP", "RH", "PPFD", "PH"]).notNull(),
    logDate: timestamp("logDate").notNull(),
    turn: mysqlEnum("turn", ["AM", "PM"]),
    value: decimal("value", { precision: 10, scale: 2 }),
    message: text("message").notNull(),
    status: mysqlEnum("status", ["NEW", "SEEN"]).default("NEW").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    tentIdx: index("tentIdx").on(table.tentId),
    statusIdx: index("statusIdx").on(table.status),
    dateIdx: index("dateIdx").on(table.logDate),
  })
);

export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = typeof alerts.$inferInsert;

/**
 * Limites de Segurança (hard limits por fase)
 */
export const safetyLimits = mysqlTable(
  "safetyLimits",
  {
    id: int("id").autoincrement().primaryKey(),
    context: mysqlEnum("context", ["TENT_A", "TENT_BC"]).notNull(),
    phase: mysqlEnum("phase", ["CLONING", "VEGA", "FLORA", "MAINTENANCE", "DRYING"]).notNull(),
    metric: mysqlEnum("metric", ["TEMP", "RH", "PPFD", "PH"]).notNull(),
    minValue: decimal("minValue", { precision: 10, scale: 2 }),
    maxValue: decimal("maxValue", { precision: 10, scale: 2 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    contextPhaseMetricUnique: unique("contextPhaseMetricUnique").on(
      table.context,
      table.phase,
      table.metric
    ),
  })
);

export type SafetyLimit = typeof safetyLimits.$inferSelect;
export type InsertSafetyLimit = typeof safetyLimits.$inferInsert;

/**
 * Histórico de Cálculos (calculadoras)
 */


/**
 * Configurações de Alertas por Estufa
 */
export const alertSettings = mysqlTable("alertSettings", {
  id: int("id").autoincrement().primaryKey(),
  tentId: int("tentId")
    .notNull()
    .references(() => tents.id)
    .unique(),
  alertsEnabled: boolean("alertsEnabled").default(true).notNull(),
  tempEnabled: boolean("tempEnabled").default(true).notNull(),
  rhEnabled: boolean("rhEnabled").default(true).notNull(),
  ppfdEnabled: boolean("ppfdEnabled").default(true).notNull(),
  phEnabled: boolean("phEnabled").default(true).notNull(),
  // Margens de erro globais configuráveis (±)
  tempMargin: decimal("tempMargin", { precision: 3, scale: 1 }).default("2.0").notNull(), // ±2°C
  rhMargin: decimal("rhMargin", { precision: 3, scale: 1 }).default("5.0").notNull(), // ±5%
  ppfdMargin: int("ppfdMargin").default(50).notNull(), // ±50 PPFD
  phMargin: decimal("phMargin", { precision: 2, scale: 1 }).default("0.2").notNull(), // ±0.2 pH
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AlertSettings = typeof alertSettings.$inferSelect;
export type InsertAlertSettings = typeof alertSettings.$inferInsert;

/**
 * Histórico de Alertas Disparados
 */
export const alertHistory = mysqlTable(
  "alertHistory",
  {
    id: int("id").autoincrement().primaryKey(),
    tentId: int("tentId")
      .notNull()
      .references(() => tents.id),
    metric: mysqlEnum("metric", ["TEMP", "RH", "PPFD", "PH"]).notNull(),
    value: decimal("value", { precision: 10, scale: 2 }).notNull(),
    targetMin: decimal("targetMin", { precision: 10, scale: 2 }),
    targetMax: decimal("targetMax", { precision: 10, scale: 2 }),
    message: text("message").notNull(),
    notificationSent: boolean("notificationSent").default(false).notNull(),
    isRead: boolean("isRead").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    tentIdx: index("tentIdx").on(table.tentId),
    dateIdx: index("dateIdx").on(table.createdAt),
  })
);

export type AlertHistory = typeof alertHistory.$inferSelect;
export type InsertAlertHistory = typeof alertHistory.$inferInsert;

/**
 * Margens de Alerta por Fase (configuráveis)
 */
export const phaseAlertMargins = mysqlTable("phaseAlertMargins", {
  id: int("id").autoincrement().primaryKey(),
  phase: mysqlEnum("phase", ["MAINTENANCE", "CLONING", "VEGA", "FLORA", "DRYING"]).notNull().unique(),
  tempMargin: decimal("tempMargin", { precision: 3, scale: 1 }).notNull(), // ±°C
  rhMargin: decimal("rhMargin", { precision: 3, scale: 1 }).notNull(), // ±%
  ppfdMargin: int("ppfdMargin").notNull(), // ±PPFD
  phMargin: decimal("phMargin", { precision: 2, scale: 1 }), // ±pH (nullable para DRYING)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PhaseAlertMargins = typeof phaseAlertMargins.$inferSelect;
export type InsertPhaseAlertMargins = typeof phaseAlertMargins.$inferInsert;

/**
 * Histórico de Notificações Enviadas
 */
export const notificationHistory = mysqlTable(
  "notificationHistory",
  {
    id: int("id").autoincrement().primaryKey(),
    type: mysqlEnum("type", ["daily_reminder", "environment_alert", "task_reminder"]).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),
    metadata: text("metadata"), // JSON string with additional data
    isRead: boolean("isRead").default(false).notNull(),
    sentAt: timestamp("sentAt").defaultNow().notNull(),
    groupId: int("groupId"),
  },
  (table) => ({
    typeIdx: index("typeIdx").on(table.type),
    dateIdx: index("dateIdx").on(table.sentAt),
  })
);

export type NotificationHistory = typeof notificationHistory.$inferSelect;
export type InsertNotificationHistory = typeof notificationHistory.$inferInsert;

/**
 * ========================================
 * SISTEMA DE PLANTAS INDIVIDUAIS
 * ========================================
 */

/**
 * Plantas individuais
 */
export const plants = mysqlTable(
  "plants",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(), // Ex: "Northern Lights #1"
    code: varchar("code", { length: 50 }), // Código opcional (ex: "NL-001")
    strainId: int("strainId")
      .notNull()
      .references(() => strains.id),
    currentTentId: int("currentTentId")
      .references(() => tents.id),
    plantStage: mysqlEnum("plantStage", ["CLONE", "SEEDLING", "PLANT"]).default("SEEDLING").notNull(),
    status: mysqlEnum("status", ["ACTIVE", "AWAITING_DRYING", "HARVESTED", "DEAD", "DISCARDED"]).default("ACTIVE").notNull(),
    harvestQueueAt: timestamp("harvestQueueAt"), // Data em que entrou na fila de secagem
    harvestQueueNotes: text("harvestQueueNotes"), // Notas da colheita ao entrar na fila
    finishedAt: timestamp("finishedAt"),
    finishReason: text("finishReason"),
    notes: text("notes"),
    /** Grupo ao qual a planta pertence */
    groupId: int("groupId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    strainIdx: index("strainIdx").on(table.strainId),
    tentIdx: index("tentIdx").on(table.currentTentId),
    statusIdx: index("statusIdx").on(table.status),
    stageIdx: index("stageIdx").on(table.plantStage),
  })
);

export type Plant = typeof plants.$inferSelect;
export type InsertPlant = typeof plants.$inferInsert;

/**
 * Histórico de movimentação de plantas entre estufas
 */
export const plantTentHistory = mysqlTable(
  "plantTentHistory",
  {
    id: int("id").autoincrement().primaryKey(),
    plantId: int("plantId")
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    fromTentId: int("fromTentId").references(() => tents.id),
    toTentId: int("toTentId")
      .references(() => tents.id), // nullable: planta pode sair para fila sem estufa destino
    movedAt: timestamp("movedAt").defaultNow().notNull(),
    reason: text("reason"),
  },
  (table) => ({
    plantIdx: index("plantIdx").on(table.plantId),
  })
);

export type PlantTentHistory = typeof plantTentHistory.$inferSelect;
export type InsertPlantTentHistory = typeof plantTentHistory.$inferInsert;

/**
 * Observações diárias por planta
 */
export const plantObservations = mysqlTable(
  "plantObservations",
  {
    id: int("id").autoincrement().primaryKey(),
    plantId: int("plantId")
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    observationDate: timestamp("observationDate").defaultNow().notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    plantIdx: index("plantIdx").on(table.plantId),
    dateIdx: index("dateIdx").on(table.observationDate),
  })
);

export type PlantObservation = typeof plantObservations.$inferSelect;
export type InsertPlantObservation = typeof plantObservations.$inferInsert;

/**
 * Fotos das plantas
 */
export const plantPhotos = mysqlTable(
  "plantPhotos",
  {
    id: int("id").autoincrement().primaryKey(),
    plantId: int("plantId")
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    photoUrl: varchar("photoUrl", { length: 500 }).notNull(), // URL local ou S3
    photoKey: varchar("photoKey", { length: 500 }), // S3 key (opcional para uploads locais)
    description: text("description"),
    photoDate: timestamp("photoDate").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    plantIdx: index("plantIdx").on(table.plantId),
    dateIdx: index("dateIdx").on(table.photoDate),
  })
);

export type PlantPhoto = typeof plantPhotos.$inferSelect;
export type InsertPlantPhoto = typeof plantPhotos.$inferInsert;

/**
 * Registros de runoff por planta
 */
export const plantRunoffLogs = mysqlTable(
  "plantRunoffLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    plantId: int("plantId")
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    logDate: timestamp("logDate").defaultNow().notNull(),
    volumeIn: decimal("volumeIn", { precision: 6, scale: 2 }).notNull(), // Litros entrada
    volumeOut: decimal("volumeOut", { precision: 6, scale: 2 }).notNull(), // Litros saída
    runoffPercent: decimal("runoffPercent", { precision: 5, scale: 2 }).notNull(), // % calculado
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    plantIdx: index("plantIdx").on(table.plantId),
    dateIdx: index("dateIdx").on(table.logDate),
  })
);

export type PlantRunoffLog = typeof plantRunoffLogs.$inferSelect;
export type InsertPlantRunoffLog = typeof plantRunoffLogs.$inferInsert;

/**
 * Registros de saúde da planta
 */
export const plantHealthLogs = mysqlTable(
  "plantHealthLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    plantId: int("plantId")
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    logDate: timestamp("logDate").defaultNow().notNull(),
    healthStatus: mysqlEnum("healthStatus", ["HEALTHY", "STRESSED", "SICK", "RECOVERING"]).notNull(),
    symptoms: text("symptoms"), // Deficiências, pragas, etc.
    treatment: text("treatment"), // Ações tomadas
    notes: text("notes"),
    photoUrl: varchar("photoUrl", { length: 500 }), // URL da foto no S3
    photoKey: varchar("photoKey", { length: 500 }), // Chave da foto no S3
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    plantIdx: index("plantIdx").on(table.plantId),
    dateIdx: index("dateIdx").on(table.logDate),
  })
);

export type PlantHealthLog = typeof plantHealthLogs.$inferSelect;
export type InsertPlantHealthLog = typeof plantHealthLogs.$inferInsert;

/**
 * Registros de qualidade dos tricomas
 */
export const plantTrichomeLogs = mysqlTable(
  "plantTrichomeLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    plantId: int("plantId")
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    logDate: timestamp("logDate").defaultNow().notNull(),
    trichomeStatus: mysqlEnum("trichomeStatus", ["CLEAR", "CLOUDY", "AMBER", "MIXED"]).notNull(),
    clearPercent: int("clearPercent"), // % transparentes
    cloudyPercent: int("cloudyPercent"), // % leitosos
    amberPercent: int("amberPercent"), // % âmbar
    photoUrl: varchar("photoUrl", { length: 500 }), // Foto macro
    photoKey: varchar("photoKey", { length: 500 }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    plantIdx: index("plantIdx").on(table.plantId),
    dateIdx: index("dateIdx").on(table.logDate),
  })
);

export type PlantTrichomeLog = typeof plantTrichomeLogs.$inferSelect;
export type InsertPlantTrichomeLog = typeof plantTrichomeLogs.$inferInsert;

/**
 * Registros de técnicas LST (Low Stress Training)
 */
export const plantLSTLogs = mysqlTable(
  "plantLSTLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    plantId: int("plantId")
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    logDate: timestamp("logDate").defaultNow().notNull(),
    technique: varchar("technique", { length: 100 }).notNull(), // Ex: "Topping", "FIM", "LST", "Defoliation"
    beforePhotoUrl: varchar("beforePhotoUrl", { length: 500 }),
    beforePhotoKey: varchar("beforePhotoKey", { length: 500 }),
    afterPhotoUrl: varchar("afterPhotoUrl", { length: 500 }),
    afterPhotoKey: varchar("afterPhotoKey", { length: 500 }),
    response: text("response"), // Como a planta respondeu
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    plantIdx: index("plantIdx").on(table.plantId),
    dateIdx: index("dateIdx").on(table.logDate),
  })
);

export type PlantLSTLog = typeof plantLSTLogs.$inferSelect;
export type InsertPlantLSTLog = typeof plantLSTLogs.$inferInsert;


/**
 * Predefinições personalizadas de fertilização
 */
export const fertilizationPresets = mysqlTable("fertilizationPresets", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  waterVolume: decimal("waterVolume", { precision: 10, scale: 2 }).notNull(),
  targetEC: decimal("targetEC", { precision: 10, scale: 2 }).notNull(),
  phase: mysqlEnum("phase", ["VEGA", "FLORA"]),
  weekNumber: int("weekNumber"),
  irrigationsPerWeek: decimal("irrigationsPerWeek", { precision: 10, scale: 1 }),
  calculationMode: mysqlEnum("calculationMode", ["per-irrigation", "per-week"]).notNull(),
  groupId: int("groupId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FertilizationPreset = typeof fertilizationPresets.$inferSelect;
export type InsertFertilizationPreset = typeof fertilizationPresets.$inferInsert;

/**
 * Predefinições personalizadas de rega
 */
export const wateringPresets = mysqlTable("wateringPresets", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  plantCount: int("plantCount").notNull(),
  potSize: decimal("potSize", { precision: 10, scale: 1 }).notNull(),
  targetRunoff: decimal("targetRunoff", { precision: 10, scale: 1 }).notNull(),
  phase: mysqlEnum("phase", ["VEGA", "FLORA"]),
  weekNumber: int("weekNumber"),
  groupId: int("groupId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WateringPreset = typeof wateringPresets.$inferSelect;
export type InsertWateringPreset = typeof wateringPresets.$inferInsert;


/**
 * Preferências de alertas do usuário
 */
export const alertPreferences = mysqlTable("alertPreferences", {
  id: int("id").autoincrement().primaryKey(),
  
  // Temperatura
  temperatureEnabled: boolean("temperatureEnabled").default(true).notNull(),
  temperatureMin: decimal("temperatureMin", { precision: 5, scale: 2 }).default("18.00"),
  temperatureMax: decimal("temperatureMax", { precision: 5, scale: 2 }).default("28.00"),
  
  // Umidade Relativa
  humidityEnabled: boolean("humidityEnabled").default(true).notNull(),
  humidityMin: decimal("humidityMin", { precision: 5, scale: 2 }).default("40.00"),
  humidityMax: decimal("humidityMax", { precision: 5, scale: 2 }).default("70.00"),
  
  // pH
  phEnabled: boolean("phEnabled").default(true).notNull(),
  phMin: decimal("phMin", { precision: 4, scale: 2 }).default("5.50"),
  phMax: decimal("phMax", { precision: 4, scale: 2 }).default("6.50"),
  
  // PPFD (Luz)
  ppfdEnabled: boolean("ppfdEnabled").default(true).notNull(),
  ppfdMin: decimal("ppfdMin", { precision: 6, scale: 2 }).default("400.00"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AlertPreference = typeof alertPreferences.$inferSelect;
export type InsertAlertPreference = typeof alertPreferences.$inferInsert;

/**
 * Configurações de notificações push do usuário
 */
export const notificationSettings = mysqlTable("notificationSettings", {
  id: int("id").autoincrement().primaryKey(),

  // Pausa geral do sistema (para alertas e monitoramento)
  systemPaused: boolean("systemPaused").default(false).notNull(),
  
  // Habilitar/desabilitar notificações por tipo de alerta
  tempAlertsEnabled: boolean("tempAlertsEnabled").default(true).notNull(),
  rhAlertsEnabled: boolean("rhAlertsEnabled").default(true).notNull(),
  ppfdAlertsEnabled: boolean("ppfdAlertsEnabled").default(true).notNull(),
  phAlertsEnabled: boolean("phAlertsEnabled").default(true).notNull(),
  
  // Habilitar notificações para lembretes de tarefas
  taskRemindersEnabled: boolean("taskRemindersEnabled").default(true).notNull(),
  
  // Lembrete diário de registro
  dailyReminderEnabled: boolean("dailyReminderEnabled").default(false).notNull(),
  reminderTimes: text("reminderTimes").default("[]"), // JSON array de strings HH:MM

  // Habilitar resumo diário
  dailySummaryEnabled: boolean("dailySummaryEnabled").default(false).notNull(),
  dailySummaryTime: varchar("dailySummaryTime", { length: 5 }).default("09:00"), // HH:MM format
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = typeof notificationSettings.$inferInsert;

/**
 * Histórico de Aplicações de Nutrientes
 */
export const nutrientApplications = mysqlTable("nutrientApplications", {
  id: int("id").autoincrement().primaryKey(),
  tentId: int("tentId").notNull(),
  cycleId: int("cycleId"),
  recipeTemplateId: int("recipeTemplateId"),
  
  // Data da aplicação
  applicationDate: timestamp("applicationDate").defaultNow().notNull(),
  
  // Dados da receita aplicada (snapshot)
  recipeName: varchar("recipeName", { length: 100 }).notNull(),
  phase: mysqlEnum("phase", ["CLONING", "VEGA", "FLORA", "MAINTENANCE", "DRYING"]).notNull(),
  weekNumber: int("weekNumber"),
  
  // Volume e targets
  volumeTotalL: decimal("volumeTotalL", { precision: 6, scale: 2 }).notNull(),
  ecTarget: decimal("ecTarget", { precision: 4, scale: 2 }),
  ecActual: decimal("ecActual", { precision: 4, scale: 2 }),
  phTarget: decimal("phTarget", { precision: 3, scale: 1 }),
  phActual: decimal("phActual", { precision: 3, scale: 1 }),
  
  // Produtos aplicados (JSON)
  productsJson: text("productsJson").notNull(),
  
  // Observações
  notes: text("notes"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  tentIdIdx: index("tentId_idx").on(table.tentId),
  cycleIdIdx: index("cycleId_idx").on(table.cycleId),
  applicationDateIdx: index("applicationDate_idx").on(table.applicationDate),
}));

export type NutrientApplication = typeof nutrientApplications.$inferSelect;
export type InsertNutrientApplication = typeof nutrientApplications.$inferInsert;

/**
 * Histórico de Aplicações de Rega
 */
export const wateringApplications = mysqlTable("wateringApplications", {
  id: int("id").autoincrement().primaryKey(),
  tentId: int("tentId").notNull(),
  cycleId: int("cycleId"),
  
  // Data da aplicação
  applicationDate: timestamp("applicationDate").defaultNow().notNull(),
  
  // Dados da receita aplicada (snapshot)
  recipeName: varchar("recipeName", { length: 100 }).notNull(),
  
  // Dados da rega
  potSizeL: decimal("potSizeL", { precision: 5, scale: 2 }).notNull(),
  numberOfPots: int("numberOfPots").notNull(),
  waterPerPotL: decimal("waterPerPotL", { precision: 5, scale: 2 }).notNull(),
  totalWaterL: decimal("totalWaterL", { precision: 7, scale: 2 }).notNull(),
  
  // Runoff
  targetRunoffPercent: decimal("targetRunoffPercent", { precision: 4, scale: 1 }),
  expectedRunoffL: decimal("expectedRunoffL", { precision: 6, scale: 2 }),
  actualRunoffL: decimal("actualRunoffL", { precision: 6, scale: 2 }),
  actualRunoffPercent: decimal("actualRunoffPercent", { precision: 4, scale: 1 }),
  
  // Observações
  notes: text("notes"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  tentIdIdx: index("tentId_idx").on(table.tentId),
  cycleIdIdx: index("cycleId_idx").on(table.cycleId),
  applicationDateIdx: index("applicationDate_idx").on(table.applicationDate),
}));

export type WateringApplication = typeof wateringApplications.$inferSelect;
export type InsertWateringApplication = typeof wateringApplications.$inferInsert;

/**
 * Push Subscriptions — persiste subscriptions Web Push no banco
 * Evita perda de subscriptions quando o servidor reinicia
 */
export const pushSubscriptions = mysqlTable("pushSubscriptions", {
  id: int("id").autoincrement().primaryKey(),
  // Endpoint único da subscription (identifica o dispositivo)
  endpoint: varchar("endpoint", { length: 512 }).notNull().unique(),
  // Chaves da subscription (JSON serializado)
  keysJson: text("keysJson").notNull(),
  // Horários de lembrete configurados para este dispositivo (JSON array: ["08:00","20:00"])
  reminderTimes: text("reminderTimes"),
  // Lembrete diário ativado
  reminderEnabled: boolean("reminderEnabled").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;
