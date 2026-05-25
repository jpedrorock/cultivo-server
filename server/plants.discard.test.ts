import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import { createTestContext, DB_AVAILABLE } from "./test-helpers";

describe.skipIf(!DB_AVAILABLE)("Plants - Discard Functionality", () => {
  it("should discard a plant with DISCARDED status", async () => {
    const caller = appRouter.createCaller(createTestContext());

    // Create a tent first
    const tent = await caller.tents.create({
      name: `Test Tent ${Date.now()}`,
      category: "VEGA",
      width: 60,
      depth: 60,
      height: 120,
      powerW: 240,
    });

    // Create a strain
    const strainName = `Test Strain ${Date.now()}`;
    await caller.strains.create({
      name: strainName,
      description: "Test strain for discard",
      vegaWeeks: 4,
      floraWeeks: 8,
    });

    // Fetch the created strain to get its ID
    const allStrains = await caller.strains.list();
    const strain = allStrains.find(s => s.name === strainName);
    if (!strain) throw new Error('Test strain not found');

    // Create a plant
    const plantResult = await caller.plants.create({
      name: "Test Plant to Discard",
      code: "TEST-001",
      strainId: strain.id,
      currentTentId: tent.id!,
    });

    // Fetch plant to get ID
    const plants = await caller.plants.list({ tentId: tent.id });
    const plant = plants.find(p => p.code === "TEST-001");
    if (!plant) throw new Error('Test plant not found');

    // Discard the plant
    const result = await caller.plants.discard({
      plantId: plant.id,
      reason: "Doença grave - mofo",
    });

    expect(result.success).toBe(true);

    // Verify plant status is DISCARDED
    const discardedPlant = await caller.plants.getById({ id: plant.id });
    expect(discardedPlant?.status).toBe("DISCARDED");
    expect(discardedPlant?.notes).toContain("Descartada: Doença grave - mofo");
  });

  it("should discard a plant without reason", async () => {
    const caller = appRouter.createCaller(createTestContext());

    // Create a tent
    const tent = await caller.tents.create({
      name: `Test Tent ${Date.now()}`,
      category: "FLORA",
      width: 60,
      depth: 120,
      height: 150,
      powerW: 320,
    });

    // Create a strain
    const strainName = `Test Strain ${Date.now()}`;
    await caller.strains.create({
      name: strainName,
      description: "Test strain",
      vegaWeeks: 4,
      floraWeeks: 8,
    });

    // Fetch the created strain
    const allStrains = await caller.strains.list();
    const strain = allStrains.find(s => s.name === strainName);
    if (!strain) throw new Error('Test strain not found');

    // Create a plant
    await caller.plants.create({
      name: "Test Plant No Reason",
      strainId: strain.id,
      currentTentId: tent.id!,
    });

    // Fetch plant
    const plants = await caller.plants.list({ tentId: tent.id });
    const plant = plants.find(p => p.name === "Test Plant No Reason");
    if (!plant) throw new Error('Test plant not found');

    // Discard without reason
    const result = await caller.plants.discard({
      plantId: plant.id,
    });

    expect(result.success).toBe(true);

    // Verify plant status
    const discardedPlant = await caller.plants.getById({ id: plant.id });
    expect(discardedPlant?.status).toBe("DISCARDED");
    expect(discardedPlant?.notes).toBe("Descartada");
  });

  it("should filter plants by DISCARDED status", async () => {
    const caller = appRouter.createCaller(createTestContext());

    // Create tent and strain
    const tent = await caller.tents.create({
      name: `Filter Test Tent ${Date.now()}`,
      category: "VEGA",
      width: 60,
      depth: 60,
      height: 120,
      powerW: 240,
    });

    const strainName = `Filter Test Strain ${Date.now()}`;
    await caller.strains.create({
      name: strainName,
      description: "Test",
      vegaWeeks: 4,
      floraWeeks: 8,
    });

    // Fetch strain
    const allStrains = await caller.strains.list();
    const strain = allStrains.find(s => s.name === strainName);
    if (!strain) throw new Error('Test strain not found');

    // Create and discard a plant
    await caller.plants.create({
      name: "Plant to Filter",
      strainId: strain.id,
      currentTentId: tent.id!,
    });

    // Fetch plant
    const plants = await caller.plants.list({ tentId: tent.id });
    const plant = plants.find(p => p.name === "Plant to Filter");
    if (!plant) throw new Error('Test plant not found');

    await caller.plants.discard({
      plantId: plant.id,
      reason: "Test filter",
    });

    // Filter by DISCARDED status
    const discardedPlants = await caller.plants.list({
      status: "DISCARDED",
    });

    const foundPlant = discardedPlants.find((p) => p.id === plant.id);
    expect(foundPlant).toBeDefined();
    expect(foundPlant?.status).toBe("DISCARDED");
  });
});
