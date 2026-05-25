import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import { createTestContext, DB_AVAILABLE } from "./test-helpers";

describe.skipIf(!DB_AVAILABLE)("plants.moveAllPlants", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(() => {
    caller = appRouter.createCaller(createTestContext());
  });

  it("should move all plants from one tent to another", async () => {
    // Create two tents
    const tent1 = await caller.tents.create({
      name: "Test Tent 1",
      category: "VEGA",
      width: 100,
      depth: 100,
      height: 200,
    });

    const tent2 = await caller.tents.create({
      name: "Test Tent 2",
      category: "FLORA",
      width: 100,
      depth: 100,
      height: 200,
    });

    // Create a strain with unique name
    const strainName = `Test Strain Move All ${Date.now()}`;
    await caller.strains.create({
      name: strainName,
      vegaWeeks: 4,
      floraWeeks: 8,
    });

    // Get the created strain
    const strains = await caller.strains.list();
    const strain = strains.find(s => s.name === strainName)!;

    // Create 3 plants in tent1
    await caller.plants.create({
      name: "Plant 1",
      code: "P1",
      strainId: strain.id,
      currentTentId: tent1.id,
    });

    await caller.plants.create({
      name: "Plant 2",
      code: "P2",
      strainId: strain.id,
      currentTentId: tent1.id,
    });

    await caller.plants.create({
      name: "Plant 3",
      code: "P3",
      strainId: strain.id,
      currentTentId: tent1.id,
    });

    // Get created plants
    const plantsBeforeMove = await caller.plants.list({
      tentId: tent1.id,
    });
    const plantIds = plantsBeforeMove.map(p => p.id);

    // Move all plants from tent1 to tent2
    const result = await caller.plants.moveAllPlants({
      fromTentId: tent1.id,
      toTentId: tent2.id,
      reason: "Test move all",
    });

    // Verify result
    expect(result.success).toBe(true);
    expect(result.movedCount).toBe(3);

    // Verify plants are now in tent2
    const plantsInTent2 = await caller.plants.list({
      tentId: tent2.id,
    });

    expect(plantsInTent2.length).toBe(3);
    expect(plantsInTent2.map(p => p.id).sort()).toEqual(plantIds.sort());

    // Verify tent1 has no plants
    const plantsInTent1 = await caller.plants.list({
      tentId: tent1.id,
    });

    expect(plantsInTent1.length).toBe(0);

    // Cleanup — permanentDelete remove o registro do banco (delete é soft-delete)
    for (const id of plantIds) {
      await caller.plants.permanentDelete({ plantId: id });
    }
    await caller.strains.delete({ id: strain.id });
    await caller.tents.delete({ id: tent1.id });
    await caller.tents.delete({ id: tent2.id });
  });

  it("should return 0 moved count when tent has no plants", async () => {
    // Create two tents
    const tent1 = await caller.tents.create({
      name: "Empty Tent",
      category: "VEGA",
      width: 100,
      depth: 100,
      height: 200,
    });

    const tent2 = await caller.tents.create({
      name: "Target Tent",
      category: "FLORA",
      width: 100,
      depth: 100,
      height: 200,
    });

    // Move all plants (none exist)
    const result = await caller.plants.moveAllPlants({
      fromTentId: tent1.id,
      toTentId: tent2.id,
    });

    // Verify result
    expect(result.success).toBe(true);
    expect(result.movedCount).toBe(0);

    // Cleanup
    await caller.tents.delete({ id: tent1.id });
    await caller.tents.delete({ id: tent2.id });
  });
});
