import { eq, and, desc, sql, isNotNull, or } from "drizzle-orm";
import { drizzle as drizzleMysql } from "drizzle-orm/mysql2";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import mysql from "mysql2/promise";
import {
  InsertUser,
  users,
  tents,
  strains,
  cycles,
  tentAState,
  cloningEvents,
  weeklyTargets,
  dailyLogs,
  recipes,
  recipeTemplates,
  taskTemplates,
  taskInstances,
  alerts,
  safetyLimits,
  plants,
  phaseAlertMargins,
  alertHistory,
  type Tent,
  type Strain,
  type Cycle,
  type TentAState,
  type CloningEvent,
  type WeeklyTarget,
  type DailyLog,
  type Recipe,
  type RecipeTemplate,
  type TaskTemplate,
  type TaskInstance,
  type Alert,
  type SafetyLimit,
  type PhaseAlertMargins,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: any = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL || "file:./local.db";
    const isSQLite = connectionString.startsWith("file:");
    
    try {
      if (isSQLite) {
        // SQLite connection (local)
        const dbPath = connectionString.replace("file:", "");
        const sqlite = new Database(dbPath);
        _db = drizzleSqlite(sqlite);
        console.log(`[Database] Connected to SQLite: ${dbPath}`);
      } else {
        // MySQL connection (production) - using pool for auto-reconnection
        const pool = mysql.createPool({
          uri: connectionString,
          waitForConnections: true,
          connectionLimit: 10,
          idleTimeout: 60000,
          enableKeepAlive: true,
          keepAliveInitialDelay: 30000,
        });
        _db = drizzleMysql(pool);
        console.log(`[Database] Connected to MySQL (pool)`);
      }
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }

    await db
      .insert(users)
      .values(values)
      .onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Error upserting user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return null;
  }

  try {
    const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    return result[0] ?? null;
  } catch (error) {
    console.error("[Database] Error getting user by openId:", error);
    return null;
  }
}

export async function getAllTents(): Promise<(Tent & { plantCount: number; seedlingCount: number; lastReadingAt: number | null; lastCloningAt: number | null; lastCloningCount: number | null })[]> {
  const db = await getDb();
  if (!db) return [];
  
  const allTents = await db.select().from(tents).orderBy(tents.id);
  
  // Para cada estufa, contar plantas e mudas ativas separadamente + buscar última leitura
  const tentsWithPlantCount = await Promise.all(
    allTents.map(async (tent: Tent) => {
      const plantsList = await db
        .select()
        .from(plants)
        .where(and(eq(plants.currentTentId, tent.id), eq(plants.status, 'ACTIVE')));
      
      const plantsOnly = plantsList.filter((p: any) => p.plantStage === 'PLANT');
      const seedlingsOnly = plantsList.filter((p: any) => p.plantStage === 'SEEDLING');
      
      // Buscar último registro (daily log) desta estufa
      const lastLog = await db
        .select()
        .from(dailyLogs)
        .where(eq(dailyLogs.tentId, tent.id))
        .orderBy(desc(dailyLogs.logDate))
        .limit(1);

      // Para estufas de manutenção, buscar último evento de clonagem
      let lastCloningAt: number | null = null;
      let lastCloningCount: number | null = null;
      if (tent.category === 'MAINTENANCE') {
        const lastCloning = await db
          .select()
          .from(cloningEvents)
          .where(eq(cloningEvents.tentId, tent.id))
          .orderBy(desc(cloningEvents.startDate))
          .limit(1);
        if (lastCloning[0]) {
          lastCloningAt = new Date(lastCloning[0].startDate).getTime();
          lastCloningCount = lastCloning[0].clonesProduced ?? null;
        }
      }
      
      return {
        ...tent,
        plantCount: plantsOnly.length,
        seedlingCount: seedlingsOnly.length,
        lastReadingAt: lastLog[0]?.logDate ? new Date(lastLog[0].logDate).getTime() : null,
        lastCloningAt,
        lastCloningCount,
      };
    })
  );
  
  return tentsWithPlantCount;
}

export async function getTentById(id: number): Promise<Tent | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tents).where(eq(tents.id, id)).limit(1);
  return result[0];
}

export async function getAllStrains(): Promise<Strain[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(strains).orderBy(strains.name);
}

export async function getStrainById(id: number): Promise<Strain | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(strains).where(eq(strains.id, id)).limit(1);
  return result[0];
}

export async function getAllCycles(): Promise<Cycle[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cycles).orderBy(desc(cycles.startDate));
}

export async function getCycleById(id: number): Promise<Cycle | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(cycles).where(eq(cycles.id, id)).limit(1);
  return result[0];
}

export async function getCycleByTentId(tentId: number): Promise<Cycle | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(cycles)
    .where(and(eq(cycles.tentId, tentId), eq(cycles.status, "ACTIVE")))
    .orderBy(desc(cycles.startDate))
    .limit(1);
  return result[0];
}

export async function getTentAState(tentId: number): Promise<TentAState | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tentAState).where(eq(tentAState.tentId, tentId)).limit(1);
  return result[0];
}

export async function getCloningEvents(tentId?: number): Promise<CloningEvent[]> {
  const db = await getDb();
  if (!db) return [];
  if (tentId) {
    return db.select().from(cloningEvents).where(eq(cloningEvents.tentId, tentId)).orderBy(desc(cloningEvents.startDate));
  }
  return db.select().from(cloningEvents).orderBy(desc(cloningEvents.startDate));
}

export async function getWeeklyTargetsByStrain(strainId: number): Promise<WeeklyTarget[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(weeklyTargets).where(eq(weeklyTargets.strainId, strainId)).orderBy(weeklyTargets.phase, weeklyTargets.weekNumber);
}

export async function getWeeklyTarget(
  strainId: number,
  phase: "CLONING" | "VEGA" | "FLORA" | "MAINTENANCE" | "DRYING",
  weekNumber: number
): Promise<WeeklyTarget | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(weeklyTargets)
    .where(
      and(
        eq(weeklyTargets.strainId, strainId),
        eq(weeklyTargets.phase, phase),
        eq(weeklyTargets.weekNumber, weekNumber)
      )
    )
    .limit(1);
  return result[0];
}

export async function getDailyLogs(tentId?: number, limit?: number): Promise<DailyLog[]> {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(dailyLogs);
  
  if (tentId) {
    query = query.where(eq(dailyLogs.tentId, tentId)) as any;
  }
  
  query = query.orderBy(desc(dailyLogs.logDate), desc(dailyLogs.turn)) as any;
  
  if (limit) {
    query = query.limit(limit) as any;
  }
  
  return query;
}

export async function getLatestDailyLog(tentId: number): Promise<DailyLog | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(dailyLogs)
    .where(eq(dailyLogs.tentId, tentId))
    .orderBy(desc(dailyLogs.logDate), desc(dailyLogs.turn))
    .limit(1);
  return result[0];
}

export async function getRecipes(tentId?: number): Promise<Recipe[]> {
  const db = await getDb();
  if (!db) return [];
  if (tentId) {
    return db.select().from(recipes).where(eq(recipes.tentId, tentId)).orderBy(desc(recipes.createdAt));
  }
  return db.select().from(recipes).orderBy(desc(recipes.createdAt));
}

export async function getRecipeTemplates(): Promise<RecipeTemplate[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(recipeTemplates).orderBy(recipeTemplates.name);
}

export async function getTaskTemplates(phase?: "CLONING" | "VEGA" | "FLORA" | "MAINTENANCE" | "DRYING"): Promise<TaskTemplate[]> {
  const db = await getDb();
  if (!db) return [];
  if (phase) {
    return db.select().from(taskTemplates).where(eq(taskTemplates.phase, phase)).orderBy(taskTemplates.weekNumber, taskTemplates.title);
  }
  return db.select().from(taskTemplates).orderBy(taskTemplates.phase, taskTemplates.weekNumber, taskTemplates.title);
}

export async function getTaskInstances(tentId?: number): Promise<TaskInstance[]> {
  const db = await getDb();
  if (!db) return [];
  if (tentId) {
    return db.select().from(taskInstances).where(eq(taskInstances.tentId, tentId)).orderBy(taskInstances.occurrenceDate);
  }
  return db.select().from(taskInstances).orderBy(taskInstances.occurrenceDate);
}

export async function getAlerts(tentId?: number, status?: "NEW" | "SEEN"): Promise<Alert[]> {
  const db = await getDb();
  if (!db) return [];
  
  let conditions = [];
  if (tentId) conditions.push(eq(alerts.tentId, tentId));
  if (status) conditions.push(eq(alerts.status, status));
  
  if (conditions.length === 0) {
    return db.select().from(alerts).orderBy(desc(alerts.createdAt));
  }
  
  return db.select().from(alerts).where(and(...conditions)).orderBy(desc(alerts.createdAt));
}

export async function getNewAlertsCount(tentId?: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  let query = db.select({ count: sql<number>`count(*)` }).from(alerts).where(eq(alerts.status, "NEW"));
  
  if (tentId) {
    query = query.where(and(eq(alerts.status, "NEW"), eq(alerts.tentId, tentId))) as any;
  }
  
  const result = await query;
  return result[0]?.count ?? 0;
}

export async function getSafetyLimits(phase?: "CLONING" | "VEGA" | "FLORA" | "MAINTENANCE" | "DRYING"): Promise<SafetyLimit[]> {
  const db = await getDb();
  if (!db) return [];
  if (phase) {
    return db.select().from(safetyLimits).where(eq(safetyLimits.phase, phase));
  }
  return db.select().from(safetyLimits);
}

/**
 * Calcula valores ideais para uma estufa baseado na strain/semana ativa
 * Retorna média quando há múltiplas strains na mesma estufa
 */
export async function getIdealValuesByTent(tentId: number): Promise<{
  tempMin: number | null;
  tempMax: number | null;
  rhMin: number | null;
  rhMax: number | null;
  ppfdMin: number | null;
  ppfdMax: number | null;
  phMin: number | null;
  phMax: number | null;
} | null> {
  const db = await getDb();
  if (!db) return null;

  // Buscar ciclo ativo da estufa
  const cycle = await getCycleByTentId(tentId);
  if (!cycle) return null;

  // Buscar informações da estufa para determinar categoria
  const tentResult = await db.select().from(tents).where(eq(tents.id, tentId)).limit(1);
  if (tentResult.length === 0) return null;
  const tent = tentResult[0];

  // Calcular fase e semana atual baseado na categoria da estufa e datas do ciclo
  const now = new Date();
  const startDate = new Date(cycle.startDate);
  const floraStartDate = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;

  let currentPhase: "CLONING" | "VEGA" | "FLORA" | "MAINTENANCE" | "DRYING";
  let weekNumber: number;

  // Determinar fase baseado na categoria da estufa
  if (tent.category === "MAINTENANCE") {
    currentPhase = "MAINTENANCE";
    weekNumber = 1;
  } else if (tent.category === "VEGA") {
    currentPhase = "VEGA";
    const weeksSinceStart = Math.floor(
      (now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
    weekNumber = weeksSinceStart + 1;
  } else if (tent.category === "FLORA") {
    currentPhase = "FLORA";
    const weeksSinceStart = floraStartDate
      ? Math.floor((now.getTime() - floraStartDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
      : Math.floor((now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
    weekNumber = weeksSinceStart + 1;
  } else if (tent.category === "DRYING") {
    currentPhase = "DRYING";
    const weeksSinceStart = Math.floor(
      (now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
    weekNumber = Math.min(weeksSinceStart + 1, 2); // Máximo 2 semanas de secagem
  } else {
    // Fallback
    currentPhase = "MAINTENANCE";
    weekNumber = 1;
  }

  let targets: WeeklyTarget[] = [];

  // Se ciclo tem strainId definida, usar targets dessa strain
  if (cycle.strainId) {
    const target = await getWeeklyTarget(
      cycle.strainId,
      currentPhase,
      weekNumber
    );
    if (target) targets = [target];
  } else {
    // Buscar strains únicas das plantas ativas na estufa
    const tentPlants = await db
      .select({ strainId: plants.strainId })
      .from(plants)
      .where(and(
        eq(plants.currentTentId, tentId),
        eq(plants.status, "ACTIVE")
      ));
    
    const uniqueStrainIds = Array.from(new Set(tentPlants.map((p: any) => p.strainId)));
    
    if (uniqueStrainIds.length === 1) {
      // Uma única strain, usar targets diretamente
      const target = await getWeeklyTarget(
        uniqueStrainIds[0] as number,
        currentPhase,
        weekNumber
      );
      if (target) targets = [target];
    } else if (uniqueStrainIds.length > 1) {
      // Múltiplas strains: buscar targets de todas e calcular média
      const allTargets = await Promise.all(
        uniqueStrainIds.map((sid: any) => 
          getWeeklyTarget(sid, currentPhase, weekNumber)
        )
      );
      targets = allTargets.filter(t => t !== undefined) as WeeklyTarget[];
    }
  }

  // Se não houver targets, usar safetyLimits como fallback
  if (targets.length === 0) {
    // Mapear categoria da estufa para contexto do safetyLimits
    // MAINTENANCE → TENT_A, VEGA/FLORA/DRYING → TENT_BC
    const safetyContext: "TENT_A" | "TENT_BC" = tent.category === "MAINTENANCE" ? "TENT_A" : "TENT_BC";
    
    const limits = await db
      .select()
      .from(safetyLimits)
      .where(
        and(
          eq(safetyLimits.context, safetyContext),
          eq(safetyLimits.phase, currentPhase)
        )
      );
    
    if (limits.length === 0) return null;
    
    // Converter array de métricas em objeto de valores ideais
    const byMetric = Object.fromEntries(
      limits.map((l: SafetyLimit) => [
        l.metric,
        {
          min: l.minValue ? parseFloat(String(l.minValue)) : null,
          max: l.maxValue ? parseFloat(String(l.maxValue)) : null,
        },
      ])
    );
    
    return {
      tempMin: byMetric['TEMP']?.min ?? null,
      tempMax: byMetric['TEMP']?.max ?? null,
      rhMin:   byMetric['RH']?.min   ?? null,
      rhMax:   byMetric['RH']?.max   ?? null,
      ppfdMin: byMetric['PPFD']?.min != null ? Math.round(byMetric['PPFD'].min) : null,
      ppfdMax: byMetric['PPFD']?.max != null ? Math.round(byMetric['PPFD'].max) : null,
      phMin:   byMetric['PH']?.min   ?? null,
      phMax:   byMetric['PH']?.max   ?? null,
    };
  }

  // Se houver apenas um target, retornar diretamente
  if (targets.length === 1) {
    const t = targets[0];
    return {
      tempMin: t.tempMin ? parseFloat(String(t.tempMin)) : null,
      tempMax: t.tempMax ? parseFloat(String(t.tempMax)) : null,
      rhMin: t.rhMin ? parseFloat(String(t.rhMin)) : null,
      rhMax: t.rhMax ? parseFloat(String(t.rhMax)) : null,
      ppfdMin: t.ppfdMin ? Number(t.ppfdMin) : null,
      ppfdMax: t.ppfdMax ? Number(t.ppfdMax) : null,
      phMin: t.phMin ? parseFloat(String(t.phMin)) : null,
      phMax: t.phMax ? parseFloat(String(t.phMax)) : null,
    };
  }

  // Múltiplos targets: calcular média
  const avgDecimal = (field: keyof WeeklyTarget) => {
    const vals = targets.map(t => t[field]).filter(v => v !== null && v !== undefined);
    if (vals.length === 0) return null;
    const sum = vals.reduce((a: number, b: any) => a + parseFloat(String(b)), 0);
    return sum / vals.length;
  };
  
  const avgInt = (field: keyof WeeklyTarget) => {
    const vals = targets.map(t => t[field]).filter(v => v !== null && v !== undefined);
    if (vals.length === 0) return null;
    const sum = vals.reduce((a: number, b: any) => a + Number(b), 0);
    return Math.round(sum / vals.length);
  };

  return {
    tempMin: avgDecimal('tempMin'),
    tempMax: avgDecimal('tempMax'),
    rhMin: avgDecimal('rhMin'),
    rhMax: avgDecimal('rhMax'),
    ppfdMin: avgInt('ppfdMin'),
    ppfdMax: avgInt('ppfdMax'),
    phMin: avgDecimal('phMin'),
    phMax: avgDecimal('phMax'),
  };
}

/**
 * Verifica alertas para uma estufa comparando valores reais vs ideais com margens da fase
 * Gera alertas contextuais e salva no banco
 */
export async function checkAlertsForTent(tentId: number): Promise<{
  alertsGenerated: number;
  messages: string[];
}> {
  const db = await getDb();
  if (!db) return { alertsGenerated: 0, messages: [] };

  // Buscar última leitura da estufa
  const latestLog = await getLatestDailyLog(tentId);
  if (!latestLog) return { alertsGenerated: 0, messages: [] };

  // Buscar valores ideais
  const idealValues = await getIdealValuesByTent(tentId);
  if (!idealValues) return { alertsGenerated: 0, messages: [] };

  // Buscar estufa para pegar categoria e nome
  const tent = await getTentById(tentId);
  if (!tent) return { alertsGenerated: 0, messages: [] };

  // Buscar margens da fase
  const marginsResult = await db
    .select()
    .from(phaseAlertMargins)
    .where(eq(phaseAlertMargins.phase, tent.category))
    .limit(1);
  
  if (marginsResult.length === 0) return { alertsGenerated: 0, messages: [] };
  const margins = marginsResult[0];

  // Buscar strain name para mensagem contextual
  const cycle = await getCycleByTentId(tentId);
  let strainName = "strain desconhecida";
  if (cycle?.strainId) {
    const strain = await getStrainById(cycle.strainId);
    if (strain) strainName = strain.name;
  }

  const alertsToInsert: any[] = [];
  const messages: string[] = [];

  // Verificar temperatura
  if (latestLog.tempC !== null && idealValues.tempMin !== null && idealValues.tempMax !== null) {
    const temp = parseFloat(String(latestLog.tempC));
    const idealMin = idealValues.tempMin - parseFloat(String(margins.tempMargin));
    const idealMax = idealValues.tempMax + parseFloat(String(margins.tempMargin));
    
    if (temp < idealMin) {
      const message = `${tent.name}: Temp ${temp.toFixed(1)}°C abaixo do ideal ${idealValues.tempMin.toFixed(1)}°C (±${margins.tempMargin}°C) para ${strainName}`;
      messages.push(message);
      alertsToInsert.push({
        tentId,
        alertType: "OUT_OF_RANGE",
        metric: "TEMP",
        logDate: latestLog.logDate,
        turn: latestLog.turn,
        value: String(temp),
        message,
        status: "NEW",
      });
    } else if (temp > idealMax) {
      const message = `${tent.name}: Temp ${temp.toFixed(1)}°C acima do ideal ${idealValues.tempMax.toFixed(1)}°C (±${margins.tempMargin}°C) para ${strainName}`;
      messages.push(message);
      alertsToInsert.push({
        tentId,
        alertType: "OUT_OF_RANGE",
        metric: "TEMP",
        logDate: latestLog.logDate,
        turn: latestLog.turn,
        value: String(temp),
        message,
        status: "NEW",
      });
    }
  }

  // Verificar umidade
  if (latestLog.rhPct !== null && idealValues.rhMin !== null && idealValues.rhMax !== null) {
    const rh = parseFloat(String(latestLog.rhPct));
    const idealMin = idealValues.rhMin - parseFloat(String(margins.rhMargin));
    const idealMax = idealValues.rhMax + parseFloat(String(margins.rhMargin));
    
    if (rh < idealMin) {
      const message = `${tent.name}: RH ${rh.toFixed(1)}% abaixo do ideal ${idealValues.rhMin.toFixed(1)}% (±${margins.rhMargin}%) para ${strainName}`;
      messages.push(message);
      alertsToInsert.push({
        tentId,
        alertType: "OUT_OF_RANGE",
        metric: "RH",
        logDate: latestLog.logDate,
        turn: latestLog.turn,
        value: String(rh),
        message,
        status: "NEW",
      });
    } else if (rh > idealMax) {
      const message = `${tent.name}: RH ${rh.toFixed(1)}% acima do ideal ${idealValues.rhMax.toFixed(1)}% (±${margins.rhMargin}%) para ${strainName}`;
      messages.push(message);
      alertsToInsert.push({
        tentId,
        alertType: "OUT_OF_RANGE",
        metric: "RH",
        logDate: latestLog.logDate,
        turn: latestLog.turn,
        value: String(rh),
        message,
        status: "NEW",
      });
    }
  }

  // Verificar PPFD
  if (latestLog.ppfd !== null && idealValues.ppfdMin !== null && idealValues.ppfdMax !== null) {
    const ppfd = Number(latestLog.ppfd);
    const idealMin = idealValues.ppfdMin - margins.ppfdMargin;
    const idealMax = idealValues.ppfdMax + margins.ppfdMargin;
    
    if (ppfd < idealMin) {
      const message = `${tent.name}: PPFD ${ppfd} abaixo do ideal ${idealValues.ppfdMin} (±${margins.ppfdMargin}) para ${strainName}`;
      messages.push(message);
      alertsToInsert.push({
        tentId,
        alertType: "OUT_OF_RANGE",
        metric: "PPFD",
        logDate: latestLog.logDate,
        turn: latestLog.turn,
        value: String(ppfd),
        message,
        status: "NEW",
      });
    } else if (ppfd > idealMax) {
      const message = `${tent.name}: PPFD ${ppfd} acima do ideal ${idealValues.ppfdMax} (±${margins.ppfdMargin}) para ${strainName}`;
      messages.push(message);
      alertsToInsert.push({
        tentId,
        alertType: "OUT_OF_RANGE",
        metric: "PPFD",
        logDate: latestLog.logDate,
        turn: latestLog.turn,
        value: String(ppfd),
        message,
        status: "NEW",
      });
    }
  }

  // Verificar pH (se houver margem definida para a fase)
  if (margins.phMargin !== null && latestLog.ph !== null && idealValues.phMin !== null && idealValues.phMax !== null) {
    const ph = parseFloat(String(latestLog.ph));
    const idealMin = idealValues.phMin - parseFloat(String(margins.phMargin));
    const idealMax = idealValues.phMax + parseFloat(String(margins.phMargin));
    
    if (ph < idealMin) {
      const message = `${tent.name}: pH ${ph.toFixed(1)} abaixo do ideal ${idealValues.phMin.toFixed(1)} (±${margins.phMargin}) para ${strainName}`;
      messages.push(message);
      alertsToInsert.push({
        tentId,
        alertType: "OUT_OF_RANGE",
        metric: "PH",
        logDate: latestLog.logDate,
        turn: latestLog.turn,
        value: String(ph),
        message,
        status: "NEW",
      });
    } else if (ph > idealMax) {
      const message = `${tent.name}: pH ${ph.toFixed(1)} acima do ideal ${idealValues.phMax.toFixed(1)} (±${margins.phMargin}) para ${strainName}`;
      messages.push(message);
      alertsToInsert.push({
        tentId,
        alertType: "OUT_OF_RANGE",
        metric: "PH",
        logDate: latestLog.logDate,
        turn: latestLog.turn,
        value: String(ph),
        message,
        status: "NEW",
      });
    }
  }

  // Inserir alertas no banco e no histórico
  if (alertsToInsert.length > 0) {
    for (const alert of alertsToInsert) {
      // Inserir em alerts (tabela de alertas ativos)
      await db.insert(alerts).values(alert);
      
      // Inserir em alertHistory (histórico permanente)
      await db.insert(alertHistory).values({
        tentId: alert.tentId,
        alertType: alert.alertType,
        metric: alert.metric,
        logDate: alert.logDate,
        turn: alert.turn,
        value: alert.value,
        message: alert.message,
      });
    }
    
    console.log(`[Alerts] ${alertsToInsert.length} alerta(s) registrado(s) para ${tent.name} — visíveis no app`);
  }

  return {
    alertsGenerated: alertsToInsert.length,
    messages,
  };
}
