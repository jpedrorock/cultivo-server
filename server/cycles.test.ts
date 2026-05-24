import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { createTestContext } from "./test-helpers";

describe("cycles API", () => {
  it("should create a new cycle", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // First create a tent and strain
    const tent = await caller.tents.create({
      name: "Test Tent C",
      location: "Test Location",
      category: "FLORA",
      width: 120,
      depth: 120,
      height: 200,
    });

    const strain = await caller.strains.create({
      name: `Test Strain ${Date.now()}`,
      vegaWeeks: 4,
      floraWeeks: 8,
    });

    const result = await caller.cycles.create({
      tentId: tent.id,
      strainId: strain.id,
      startDate: new Date(),
    });

    expect(result).toEqual({ success: true });
  });

  it("should list active cycles", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const cycles = await caller.cycles.listActive();

    expect(Array.isArray(cycles)).toBe(true);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it("should get cycle by tent ID", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Create tent, strain, and cycle
    const tent = await caller.tents.create({
      name: "Test Tent B",
      location: "Test Location",
      category: "FLORA",
      width: 120,
      depth: 120,
      height: 200,
    });

    const strain = await caller.strains.create({
      name: `Test Strain B ${Date.now()}`,
      vegaWeeks: 4,
      floraWeeks: 8,
    });

    await caller.cycles.create({
      tentId: tent.id,
      strainId: strain.id,
      startDate: new Date(),
    });

    const cycle = await caller.cycles.getByTent({ tentId: tent.id });

    expect(cycle).toBeDefined();
    if (cycle) {
      expect(cycle.tentId).toBe(tent.id);
      expect(cycle.status).toBe("ACTIVE");
    }
  });

  it("should return null for tent without active cycle", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Create a tent without a cycle
    const tent = await caller.tents.create({
      name: "Test Tent A",
      location: "Test Location",
      category: "VEGA",
      width: 120,
      depth: 120,
      height: 200,
    });

    const cycle = await caller.cycles.getByTent({ tentId: tent.id });

    expect(cycle).toBeUndefined();
  });

  it("should start flora phase", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Create tent, strain, and cycle
    const tent = await caller.tents.create({
      name: "Test Tent Flora",
      location: "Test Location",
      category: "VEGA",
      width: 120,
      depth: 120,
      height: 200,
    });

    const strain = await caller.strains.create({
      name: `Test Strain Flora ${Date.now()}`,
      vegaWeeks: 4,
      floraWeeks: 8,
    });

    await caller.cycles.create({
      tentId: tent.id,
      strainId: strain.id,
      startDate: new Date(),
    });

    // Get cycle
    const cycle = await caller.cycles.getByTent({ tentId: tent.id });
    expect(cycle).toBeDefined();

    // Start flora (renamed: startFlora → transitionToFlora)
    const result = await caller.cycles.transitionToFlora({
      cycleId: cycle!.id,
      floraStartDate: new Date(),
    });

    expect(result).toEqual({ success: true });

    // Verify flora date is set
    const updatedCycle = await caller.cycles.getByTent({ tentId: tent.id });
    expect(updatedCycle?.floraStartDate).toBeDefined();
  });
});
