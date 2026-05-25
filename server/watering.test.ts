import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import { createTestContext, DB_AVAILABLE } from "./test-helpers";

describe.skipIf(!DB_AVAILABLE)("Watering Procedures", () => {
  let tentId1: number;
  let tentId2: number;

  beforeAll(async () => {
    const caller = appRouter.createCaller(createTestContext());
    const t1 = await caller.tents.create({
      name: `Watering Test Tent A ${Date.now()}`,
      category: "VEGA",
      width: 60,
      depth: 60,
      height: 120,
    });
    tentId1 = t1.id;

    const t2 = await caller.tents.create({
      name: `Watering Test Tent B ${Date.now()}`,
      category: "FLORA",
      width: 60,
      depth: 60,
      height: 120,
    });
    tentId2 = t2.id;
  });

  it("should save watering application with all fields", async () => {
    const caller = appRouter.createCaller(createTestContext());

    const result = await caller.watering.recordApplication({
      tentId: tentId1,
      cycleId: null,
      recipeName: "Teste Rega 19/02",
      potSizeL: 11,
      numberOfPots: 4,
      waterPerPotL: 4.36,
      totalWaterL: 17.42,
      targetRunoffPercent: 20,
      expectedRunoffL: 3.48,
      actualRunoffL: 3.5,
      actualRunoffPercent: 20.1,
      notes: "Teste de salvamento de receita de rega",
    });

    expect(result.success).toBe(true);
    expect(result.id).toBeGreaterThan(0);
  });

  it("should list watering applications", async () => {
    const caller = appRouter.createCaller(createTestContext());

    const applications = await caller.watering.listApplications({
      limit: 10,
    });

    expect(Array.isArray(applications)).toBe(true);
  });

  it("should filter applications by tentId", async () => {
    const caller = appRouter.createCaller(createTestContext());

    // Record an application for tentId1 so we can filter
    await caller.watering.recordApplication({
      tentId: tentId1,
      cycleId: null,
      recipeName: "Rega Filtro Test",
      potSizeL: 5,
      numberOfPots: 2,
      waterPerPotL: 2.0,
      totalWaterL: 4.0,
      targetRunoffPercent: null,
      expectedRunoffL: null,
      actualRunoffL: null,
      actualRunoffPercent: null,
    });

    const applications = await caller.watering.listApplications({
      tentId: tentId1,
      limit: 10,
    });

    expect(Array.isArray(applications)).toBe(true);
    applications.forEach((app: any) => {
      expect(app.tentId).toBe(tentId1);
    });
  });

  it("should save watering application without optional fields", async () => {
    const caller = appRouter.createCaller(createTestContext());

    const result = await caller.watering.recordApplication({
      tentId: tentId2,
      cycleId: null,
      recipeName: "Rega Simples",
      potSizeL: 5,
      numberOfPots: 3,
      waterPerPotL: 1.65,
      totalWaterL: 4.95,
      targetRunoffPercent: null,
      expectedRunoffL: null,
      actualRunoffL: null,
      actualRunoffPercent: null,
      notes: undefined,
    });

    expect(result.success).toBe(true);
    expect(result.id).toBeGreaterThan(0);
  });
});
