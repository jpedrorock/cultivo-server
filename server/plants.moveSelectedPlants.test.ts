import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import { createTestContext, DB_AVAILABLE } from "./test-helpers";

describe.skipIf(!DB_AVAILABLE)("plants.moveSelectedPlants", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(() => {
    caller = appRouter.createCaller(createTestContext());
  });

  it("should move selected plants to another tent", async () => {
    // Create two tents
    const tent1 = await caller.tents.create({
      name: "Test Tent Selected 1",
      category: "VEGA",
      width: 100,
      depth: 100,
      height: 200,
    });

    const tent2 = await caller.tents.create({
      name: "Test Tent Selected 2",
      category: "FLORA",
      width: 100,
      depth: 100,
      height: 200,
    });

    // Create a strain
    const strainName = `Test Strain Selected ${Date.now()}`;
    await caller.strains.create({
      name: strainName,
      vegaWeeks: 4,
      floraWeeks: 8,
    });

    const strains = await caller.strains.list();
    const strain = strains.find(s => s.name === strainName)!;

    // Create 5 plants in tent1
    for (let i = 1; i <= 5; i++) {
      await caller.plants.create({
        name: `Plant Selected ${i}`,
        code: `PS${i}`,
        strainId: strain.id,
        currentTentId: tent1.id,
      });
    }

    // Get created plants
    const plantsInTent1 = await caller.plants.list({
      tentId: tent1.id,
    });

    // Select only 3 plants to move
    const selectedPlantIds = plantsInTent1.slice(0, 3).map(p => p.id);

    // Move selected plants
    const result = await caller.plants.moveSelectedPlants({
      plantIds: selectedPlantIds,
      toTentId: tent2.id,
      reason: "Test batch move",
    });

    // Verify result
    expect(result.success).toBe(true);
    expect(result.movedCount).toBe(3);

    // Verify 3 plants are now in tent2
    const plantsInTent2 = await caller.plants.list({
      tentId: tent2.id,
    });
    expect(plantsInTent2.length).toBe(3);

    // Verify 2 plants remain in tent1
    const remainingInTent1 = await caller.plants.list({
      tentId: tent1.id,
    });
    expect(remainingInTent1.length).toBe(2);

    // Cleanup — permanentDelete remove o registro do banco (delete é soft-delete)
    const allPlants = await caller.plants.list({});
    const testPlants = allPlants.filter(p => p.name.startsWith("Plant Selected"));
    for (const plant of testPlants) {
      await caller.plants.permanentDelete({ plantId: plant.id });
    }
    // Strain cleanup: permanentDelete garante que não há referências antes de deletar a strain
    await caller.strains.delete({ id: strain.id });
    await caller.tents.delete({ id: tent1.id });
    await caller.tents.delete({ id: tent2.id });
  });

  it("should return 0 moved count when no plants selected", async () => {
    const tent1 = await caller.tents.create({
      name: "Empty Move Test",
      category: "VEGA",
      width: 100,
      depth: 100,
      height: 200,
    });

    const tent2 = await caller.tents.create({
      name: "Target Empty Test",
      category: "FLORA",
      width: 100,
      depth: 100,
      height: 200,
    });

    // Move empty array
    const result = await caller.plants.moveSelectedPlants({
      plantIds: [],
      toTentId: tent2.id,
    });

    expect(result.success).toBe(true);
    expect(result.movedCount).toBe(0);

    // Cleanup
    await caller.tents.delete({ id: tent1.id });
    await caller.tents.delete({ id: tent2.id });
  });
});
