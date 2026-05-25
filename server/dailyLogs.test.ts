import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { createTestContext, DB_AVAILABLE } from "./test-helpers";

describe.skipIf(!DB_AVAILABLE)("dailyLogs API", () => {
  it("should create a daily log with valid data", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // First create a tent
    const tent = await caller.tents.create({
      name: "Test Tent",
      location: "Test Location",
      category: "VEGA",
      width: 120,
      depth: 120,
      height: 200,
    });

    const result = await caller.dailyLogs.create({
      tentId: tent.id,
      logDate: new Date(),
      turn: "AM",
      tempC: "23.5",
      rhPct: "62.0",
      ppfd: 380,
      notes: "Test log entry",
    });

    expect(result).toEqual({ success: true });
  });

  it("should list daily logs for a tent", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // First create a tent
    const tent = await caller.tents.create({
      name: "Test Tent",
      location: "Test Location",
      category: "VEGA",
      width: 120,
      depth: 120,
      height: 200,
    });

    const result = await caller.dailyLogs.list({
      tentId: tent.id,
    });

    expect(Array.isArray(result)).toBe(true);
  });

  it("should filter daily logs by date range", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // First create a tent
    const tent = await caller.tents.create({
      name: "Test Tent",
      location: "Test Location",
      category: "VEGA",
      width: 120,
      depth: 120,
      height: 200,
    });

    const startDate = new Date("2026-02-01");
    const endDate = new Date("2026-02-10");

    const result = await caller.dailyLogs.list({
      tentId: tent.id,
      startDate,
      endDate,
    });

    expect(Array.isArray(result)).toBe(true);
  });
});
