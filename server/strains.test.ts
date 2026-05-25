import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { createTestContext, DB_AVAILABLE } from "./test-helpers";

describe.skipIf(!DB_AVAILABLE)("strains API", () => {
  it("should list all strains", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const strains = await caller.strains.list();

    expect(Array.isArray(strains)).toBe(true);
    expect(strains.length).toBeGreaterThan(0);
    expect(strains[0]).toHaveProperty("id");
    expect(strains[0]).toHaveProperty("name");
    expect(strains[0]).toHaveProperty("vegaWeeks");
    expect(strains[0]).toHaveProperty("floraWeeks");
  });

  it("should create a new strain", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.strains.create({
      name: `Test Strain ${Date.now()}`,
      description: "Test description",
      vegaWeeks: 4,
      floraWeeks: 8,
    });

    expect(result).toEqual({ success: true });
  });

  it("should get strain by id", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Get first strain from list
    const strains = await caller.strains.list();
    const firstStrain = strains[0];

    if (!firstStrain) {
      throw new Error("No strains found in database");
    }

    const strain = await caller.strains.getById({ id: firstStrain.id });

    expect(strain).toBeDefined();
    expect(strain?.id).toBe(firstStrain.id);
    expect(strain?.name).toBe(firstStrain.name);
  });

  it("should update an existing strain", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Get first strain from list
    const strains = await caller.strains.list();
    const firstStrain = strains[0];

    if (!firstStrain) {
      throw new Error("No strains found in database");
    }

    const result = await caller.strains.update({
      id: firstStrain.id,
      description: "Updated description",
      vegaWeeks: 5,
    });

    expect(result).toEqual({ success: true });

    // Verify the update
    const updated = await caller.strains.getById({ id: firstStrain.id });
    expect(updated?.description).toBe("Updated description");
    expect(updated?.vegaWeeks).toBe(5);
  });

  it("should delete a strain", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Create a strain to delete
    const testName = `Delete Test ${Date.now()}`;
    await caller.strains.create({
      name: testName,
      description: "To be deleted",
      vegaWeeks: 4,
      floraWeeks: 8,
    });

    // Find the created strain
    const strains = await caller.strains.list();
    const toDelete = strains.find((s) => s.name === testName);

    if (!toDelete) {
      throw new Error("Created strain not found");
    }

    // Delete it
    const result = await caller.strains.delete({ id: toDelete.id });
    expect(result).toEqual({ success: true });

    // Verify it's gone
    const afterDelete = await caller.strains.getById({ id: toDelete.id });
    expect(afterDelete).toBeUndefined();
  });
});
