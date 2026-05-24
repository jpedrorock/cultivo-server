import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import mysql from "mysql2/promise";
import { createTestContext } from "./test-helpers";

describe("Plant Edit Functionality", () => {
  let testStrainId: number;
  let testTentId: number;
  let testPlantId: number;
  let connection: mysql.Connection;

  beforeAll(async () => {
    connection = await mysql.createConnection(process.env.DATABASE_URL!);

    // Create test strain
    const [strainResult] = await connection.execute(
      `INSERT INTO strains (name, vegaWeeks, floraWeeks) VALUES (?, ?, ?)`,
      [`Test Strain Edit ${Date.now()}`, 4, 8]
    );
    testStrainId = (strainResult as any).insertId;

    // Create test tent — groupId: 4 para coincidir com createTestContext()
    const [tentResult] = await connection.execute(
      `INSERT INTO tents (name, category, width, depth, height, volume, groupId) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`Test Tent Edit ${Date.now()}`, "VEGA", 100, 100, 200, "2.000", 4]
    );
    testTentId = (tentResult as any).insertId;

    // Create test plant — groupId: 4 para coincidir com createTestContext()
    const [plantResult] = await connection.execute(
      `INSERT INTO plants (name, code, notes, strainId, currentTentId, status, groupId) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`Test Plant Edit ${Date.now()}`, "TEST-001", "Original notes", testStrainId, testTentId, "ACTIVE", 4]
    );
    testPlantId = (plantResult as any).insertId;
  });

  it("should update plant name", async () => {
    const caller = appRouter.createCaller(createTestContext());

    const result = await caller.plants.update({
      id: testPlantId,
      name: "Updated Plant Name",
    });

    expect(result.success).toBe(true);

    const updatedPlant = await caller.plants.getById({ id: testPlantId });
    expect(updatedPlant.name).toBe("Updated Plant Name");
    expect(updatedPlant.code).toBe("TEST-001"); // Should remain unchanged
    expect(updatedPlant.notes).toBe("Original notes"); // Should remain unchanged
  });

  it("should update plant code", async () => {
    const caller = appRouter.createCaller(createTestContext());

    const result = await caller.plants.update({
      id: testPlantId,
      code: "TEST-002",
    });

    expect(result.success).toBe(true);

    const updatedPlant = await caller.plants.getById({ id: testPlantId });
    expect(updatedPlant.code).toBe("TEST-002");
  });

  it("should update plant notes", async () => {
    const caller = appRouter.createCaller(createTestContext());

    const result = await caller.plants.update({
      id: testPlantId,
      notes: "Updated notes with new information",
    });

    expect(result.success).toBe(true);

    const updatedPlant = await caller.plants.getById({ id: testPlantId });
    expect(updatedPlant.notes).toBe("Updated notes with new information");
  });

  it("should update multiple fields at once", async () => {
    const caller = appRouter.createCaller(createTestContext());

    const result = await caller.plants.update({
      id: testPlantId,
      name: "Final Plant Name",
      code: "FINAL-001",
      notes: "Final notes",
    });

    expect(result.success).toBe(true);

    const updatedPlant = await caller.plants.getById({ id: testPlantId });
    expect(updatedPlant.name).toBe("Final Plant Name");
    expect(updatedPlant.code).toBe("FINAL-001");
    expect(updatedPlant.notes).toBe("Final notes");
  });

  it("should clear optional fields with empty string", async () => {
    const caller = appRouter.createCaller(createTestContext());

    // First set values
    await caller.plants.update({
      id: testPlantId,
      code: "CLEAR-TEST",
      notes: "Will be cleared",
    });

    // Then clear them with empty strings
    const result = await caller.plants.update({
      id: testPlantId,
      code: "",
      notes: "",
    });

    expect(result.success).toBe(true);

    const updatedPlant = await caller.plants.getById({ id: testPlantId });
    expect(updatedPlant.code).toBe("");
    expect(updatedPlant.notes).toBe("");
  });

  it("should reject update with empty name", async () => {
    const caller = appRouter.createCaller(createTestContext());

    await expect(
      caller.plants.update({
        id: testPlantId,
        name: "",
      })
    ).rejects.toThrow();
  });

  it("should reject update for non-existent plant", async () => {
    const caller = appRouter.createCaller(createTestContext());

    await expect(
      caller.plants.update({
        id: 999999,
        name: "Should fail",
      })
    ).rejects.toThrow();
  });
});
