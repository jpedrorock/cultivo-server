import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { tents, strains, cycles } from "../drizzle/schema";
import { createTestContext, DB_AVAILABLE } from "./test-helpers";

describe.skipIf(!DB_AVAILABLE)("tents.delete", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let testTentId: number;
  let testStrainId: number;
  let testCycleId: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database not available");

    // Criar strain de teste
    const [strainResult] = await db.insert(strains).values({
      name: "Test Strain Delete",
      vegaWeeks: 4,
      floraWeeks: 8,
    });
    testStrainId = strainResult.insertId;

    // Criar estufa de teste — groupId: 4 para coincidir com createTestContext()
    const [tentResult] = await db.insert(tents).values({
      name: "Test Tent Delete",
      category: "VEGA",
      width: 50,
      depth: 50,
      height: 100,
      volume: "250.000",
      groupId: 4,
    });
    testTentId = tentResult.insertId;
  });

  afterAll(async () => {
    if (!db) return;
    
    // Limpar dados de teste
    if (testCycleId) {
      await db.delete(cycles).where({ id: testCycleId });
    }
    if (testTentId) {
      await db.delete(tents).where({ id: testTentId });
    }
    if (testStrainId) {
      await db.delete(strains).where({ id: testStrainId });
    }
  });

  it("deve permitir excluir estufa sem ciclos ativos", async () => {
    const caller = appRouter.createCaller(createTestContext());

    const result = await caller.tents.delete({ id: testTentId });

    expect(result.success).toBe(true);

    // Verificar se foi realmente deletada
    const tentsList = await db.select().from(tents).where({ id: testTentId });
    expect(tentsList.length).toBe(0);
  });

  it("deve bloquear exclusão de estufa com ciclo ativo", async () => {
    if (!db) throw new Error("Database not available");

    // Recriar estufa — groupId: 4 para coincidir com createTestContext()
    const [tentResult] = await db.insert(tents).values({
      name: "Test Tent Delete 2",
      category: "FLORA",
      width: 60,
      depth: 60,
      height: 120,
      volume: "432.000",
      groupId: 4,
    });
    const tentId = tentResult.insertId;

    // Criar ciclo ativo
    const [cycleResult] = await db.insert(cycles).values({
      tentId,
      strainId: testStrainId,
      startDate: new Date(),
      status: "ACTIVE",
    });
    testCycleId = cycleResult.insertId;

    const caller = appRouter.createCaller(createTestContext());

    // Tentar excluir deve falhar
    await expect(
      caller.tents.delete({ id: tentId })
    ).rejects.toThrow("Não é possível excluir uma estufa com ciclos ativos");

    // Verificar que estufa ainda existe
    const tentsList = await db.select().from(tents).where({ id: tentId });
    expect(tentsList.length).toBe(1);

    // Limpar
    await db.delete(cycles).where({ id: testCycleId });
    await db.delete(tents).where({ id: tentId });
  });
});
