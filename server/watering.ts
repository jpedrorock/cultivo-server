import { getDb } from "./db";
import { wateringApplications, type InsertWateringApplication } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * Salvar uma aplicação de rega
 */
export async function saveWateringApplication(data: InsertWateringApplication) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(wateringApplications).values(data);
  return (result as { insertId: number }).insertId;
}

/**
 * Listar aplicações de rega com filtros opcionais
 */
export async function listWateringApplications(params: {
  tentId?: number;
  cycleId?: number;
  limit?: number;
}) {
  const { tentId, cycleId, limit = 50 } = params;
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (tentId) conditions.push(eq(wateringApplications.tentId, tentId));
  if (cycleId) conditions.push(eq(wateringApplications.cycleId, cycleId));

  const base = db.select().from(wateringApplications);
  const filtered = conditions.length > 0 ? base.where(and(...conditions)) : base;

  return filtered
    .orderBy(desc(wateringApplications.applicationDate))
    .limit(limit);
}
