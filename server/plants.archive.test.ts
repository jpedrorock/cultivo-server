import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import mysql from "mysql2/promise";
import { createTestContext } from "./test-helpers";

describe("Plant Archive System", () => {
  let testStrainId: number;
  let testTentId: number;
  let testPlantId: number;
  let connection: mysql.Connection;

  beforeAll(async () => {
    // Create direct MySQL connection for test setup
    connection = await mysql.createConnection(process.env.DATABASE_URL!);

    // Create test strain
    const [strainResult] = await connection.execute(
      `INSERT INTO strains (name, vegaWeeks, floraWeeks) VALUES (?, ?, ?)`,
      [`Test Strain Archive ${Date.now()}`, 4, 8]
    );
    testStrainId = (strainResult as any).insertId;

    // Create test tent — groupId: 4 para coincidir com createTestContext()
    const [tentResult] = await connection.execute(
      `INSERT INTO tents (name, category, width, depth, height, volume, groupId) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`Test Tent Archive ${Date.now()}`, "VEGA", 100, 100, 200, "2.000", 4]
    );
    testTentId = (tentResult as any).insertId;

    // Create test plant — groupId: 4 para coincidir com createTestContext()
    const [plantResult] = await connection.execute(
      `INSERT INTO plants (name, strainId, currentTentId, status, groupId) VALUES (?, ?, ?, ?, ?)`,
      [`Test Plant Archive ${Date.now()}`, testStrainId, testTentId, "ACTIVE", 4]
    );
    testPlantId = (plantResult as any).insertId;
  });

  it("should archive plant as HARVESTED", async () => {
    const caller = appRouter.createCaller(createTestContext());

    // Archive plant
    const result = await caller.plants.archive({
      plantId: testPlantId,
      status: "HARVESTED",
      finishReason: "Colheita de teste - 150g",
    });

    expect(result.success).toBe(true);

    // Verify plant is archived
    const archivedPlant = await caller.plants.getById({ id: testPlantId });
    expect(archivedPlant.status).toBe("HARVESTED");
    expect(archivedPlant.finishedAt).toBeTruthy();
    expect(archivedPlant.finishReason).toBe("Colheita de teste - 150g");
    expect(archivedPlant.currentTentId).toBeNull();
  });

  it("should list archived plants", async () => {
    const caller = appRouter.createCaller(createTestContext());

    // List all archived plants
    const archived = await caller.plants.listArchived({});
    
    expect(archived.length).toBeGreaterThan(0);
    const testPlant = archived.find((p) => p.id === testPlantId);
    expect(testPlant).toBeDefined();
    expect(testPlant?.status).toBe("HARVESTED");
    expect(testPlant?.strainName).toBeTruthy();
  });

  it("should filter archived plants by status", async () => {
    const caller = appRouter.createCaller(createTestContext());

    // Create another plant and archive as DISCARDED — groupId: 4 para coincidir com createTestContext()
    const [plantResult] = await connection.execute(
      `INSERT INTO plants (name, strainId, currentTentId, status, groupId) VALUES (?, ?, ?, ?, ?)`,
      [`Test Plant Discard ${Date.now()}`, testStrainId, testTentId, "ACTIVE", 4]
    );
    const discardPlantId = (plantResult as any).insertId;

    await caller.plants.archive({
      plantId: discardPlantId,
      status: "DISCARDED",
      finishReason: "Hermafrodita",
    });

    // Filter by HARVESTED
    const harvested = await caller.plants.listArchived({ status: "HARVESTED" });
    expect(harvested.every((p) => p.status === "HARVESTED")).toBe(true);

    // Filter by DISCARDED
    const discarded = await caller.plants.listArchived({ status: "DISCARDED" });
    expect(discarded.every((p) => p.status === "DISCARDED")).toBe(true);
    expect(discarded.find((p) => p.id === discardPlantId)).toBeDefined();
  });

  it("should unarchive plant and restore to tent", async () => {
    const caller = appRouter.createCaller(createTestContext());

    // Unarchive plant
    const result = await caller.plants.unarchive({
      plantId: testPlantId,
      targetTentId: testTentId,
    });

    expect(result.success).toBe(true);

    // Verify plant is active again
    const restoredPlant = await caller.plants.getById({ id: testPlantId });
    expect(restoredPlant.status).toBe("ACTIVE");
    expect(restoredPlant.finishedAt).toBeNull();
    expect(restoredPlant.finishReason).toBeNull();
    expect(restoredPlant.currentTentId).toBe(testTentId);
  });

  it("should not list archived plants in regular list", async () => {
    const caller = appRouter.createCaller(createTestContext());

    // Archive plant again
    await caller.plants.archive({
      plantId: testPlantId,
      status: "HARVESTED",
    });

    // Regular list should not include archived plants
    const activePlants = await caller.plants.list({});
    const archivedInList = activePlants.find((p) => p.id === testPlantId);
    expect(archivedInList).toBeUndefined();
  });

  it("should prevent archiving non-active plants", async () => {
    const caller = appRouter.createCaller(createTestContext());

    // Try to archive already archived plant
    await expect(
      caller.plants.archive({
        plantId: testPlantId,
        status: "DISCARDED",
      })
    ).rejects.toThrow("Apenas plantas ativas podem ser arquivadas");
  });

  it("should prevent unarchiving active plants", async () => {
    const caller = appRouter.createCaller(createTestContext());

    // Unarchive first
    await caller.plants.unarchive({
      plantId: testPlantId,
      targetTentId: testTentId,
    });

    // Try to unarchive active plant
    await expect(
      caller.plants.unarchive({
        plantId: testPlantId,
        targetTentId: testTentId,
      })
    ).rejects.toThrow("Planta já está ativa");
  });

  it("should delete plant permanently", async () => {
    const caller = appRouter.createCaller(createTestContext());

    // Create plant to delete — groupId: 4 para coincidir com createTestContext()
    const [plantResult] = await connection.execute(
      `INSERT INTO plants (name, strainId, currentTentId, status, groupId) VALUES (?, ?, ?, ?, ?)`,
      [`Test Plant Delete ${Date.now()}`, testStrainId, testTentId, "ACTIVE", 4]
    );
    const deletePlantId = (plantResult as any).insertId;

    // Delete permanently
    const result = await caller.plants.deletePermanently({
      plantId: deletePlantId,
    });

    expect(result.success).toBe(true);

    // Verify plant is gone — getById throws "Planta não encontrada" when permanently deleted
    await expect(caller.plants.getById({ id: deletePlantId })).rejects.toThrow();
  });
});
