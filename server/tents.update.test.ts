import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { createTestContext } from "./test-helpers";

describe("tents.update", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let testTentId: number;

  beforeEach(async () => {
    caller = appRouter.createCaller(createTestContext());

    // Create a test tent
    const result = await caller.tents.create({
      name: "Test Tent for Update",
      category: "VEGA",
      width: 120,
      depth: 120,
      height: 200,
      powerW: 600,
    });

    testTentId = result.id;
  });

  it("should update tent successfully", async () => {
    const updateResult = await caller.tents.update({
      id: testTentId,
      name: "Updated Tent Name",
      category: "FLORA",
      width: 150,
      depth: 150,
      height: 220,
      powerW: 800,
    });

    expect(updateResult.success).toBe(true);

    // Verify the update
    const updatedTent = await caller.tents.getById({ id: testTentId });
    expect(updatedTent?.name).toBe("Updated Tent Name");
    expect(updatedTent?.category).toBe("FLORA");
    expect(updatedTent?.width).toBe(150);
    expect(updatedTent?.depth).toBe(150);
    expect(updatedTent?.height).toBe(220);
    expect(updatedTent?.powerW).toBe(800);
    
    // Verify volume was recalculated
    const expectedVolume = (150 * 150 * 220) / 1000;
    expect(updatedTent?.volume).toBe(expectedVolume.toFixed(3));
  });

  it("should update tent without powerW", async () => {
    const updateResult = await caller.tents.update({
      id: testTentId,
      name: "Tent Without Power",
      category: "DRYING",
      width: 100,
      depth: 100,
      height: 180,
    });

    expect(updateResult.success).toBe(true);

    const updatedTent = await caller.tents.getById({ id: testTentId });
    expect(updatedTent?.name).toBe("Tent Without Power");
    expect(updatedTent?.powerW).toBeNull();
  });

  it("should fail with invalid tent id", async () => {
    await expect(
      caller.tents.update({
        id: 999999,
        name: "Non-existent Tent",
        category: "VEGA",
        width: 120,
        depth: 120,
        height: 200,
      })
    ).rejects.toThrow();
  });

  it("should fail with invalid dimensions", async () => {
    await expect(
      caller.tents.update({
        id: testTentId,
        name: "Invalid Tent",
        category: "VEGA",
        width: -10,
        depth: 120,
        height: 200,
      })
    ).rejects.toThrow();
  });
});
