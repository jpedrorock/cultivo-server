import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { createTestContext } from "./test-helpers";

describe("tents.getDeletePreview", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let tentId: number;
  let strainId: number;

  beforeAll(async () => {
    const database = await getDb();
    if (!database) throw new Error("Database not initialized");

    caller = appRouter.createCaller(createTestContext());

    // Create a test strain
    const timestamp = Date.now();
    await caller.strains.create({
      name: `Test Strain Preview ${timestamp}`,
      type: "INDICA",
      thcContent: 20,
      cbdContent: 1,
      floweringTimeDays: 60,
      vegaWeeks: 4,
      floraWeeks: 8,
    });

    // Get the created strain
    const allStrains = await caller.strains.list();
    const testStrain = allStrains.find(s => s.name === `Test Strain Preview ${timestamp}`);
    if (!testStrain) throw new Error("Failed to create test strain");
    strainId = testStrain.id;

    // Create a test tent
    await caller.tents.create({
      name: `Test Tent Preview ${timestamp}`,
      category: "VEGA",
      width: 100,
      depth: 100,
      height: 200,
      powerW: 300,
    });
    
    // Get the created tent
    const allTents = await caller.tents.list();
    const testTent = allTents.find(t => t.name === `Test Tent Preview ${timestamp}`);
    if (!testTent) throw new Error("Failed to create test tent");
    tentId = testTent.id;
  });

  afterAll(async () => {
    // Cleanup
    if (tentId) {
      try {
        await caller.tents.delete({ id: tentId });
      } catch (e) {
        // Tent might already be deleted
      }
    }
    if (strainId) {
      try {
        await caller.strains.delete({ id: strainId });
      } catch (e) {
        // Strain might already be deleted
      }
    }
  });

  it("should return preview for empty tent", async () => {
    const preview = await caller.tents.getDeletePreview({ id: tentId });

    expect(preview).toBeDefined();
    expect(preview.canDelete).toBe(true);
    expect(preview.blockers.activeCycles).toBe(0);
    expect(preview.blockers.plants).toBe(0);
    expect(preview.totalRecords).toBe(0);
    expect(preview.willDelete.cycles).toBe(0);
    expect(preview.willDelete.recipes).toBe(0);
    expect(preview.willDelete.dailyLogs).toBe(0);
    expect(preview.willDelete.alerts).toBe(0);
    expect(preview.willDelete.taskInstances).toBe(0);
    expect(preview.willDelete.plantHistory).toBe(0);
  });

  it("should return correct structure with all required fields", async () => {
    const preview = await caller.tents.getDeletePreview({ id: tentId });

    // Verify structure
    expect(preview).toHaveProperty('canDelete');
    expect(preview).toHaveProperty('blockers');
    expect(preview).toHaveProperty('willDelete');
    expect(preview).toHaveProperty('totalRecords');
    
    // Verify blockers structure
    expect(preview.blockers).toHaveProperty('activeCycles');
    expect(preview.blockers).toHaveProperty('plants');
    
    // Verify willDelete structure
    expect(preview.willDelete).toHaveProperty('cycles');
    expect(preview.willDelete).toHaveProperty('recipes');
    expect(preview.willDelete).toHaveProperty('dailyLogs');
    expect(preview.willDelete).toHaveProperty('alerts');
    expect(preview.willDelete).toHaveProperty('taskInstances');
    expect(preview.willDelete).toHaveProperty('plantHistory');
    
    // Verify types
    expect(typeof preview.canDelete).toBe('boolean');
    expect(typeof preview.totalRecords).toBe('number');
  });
});
