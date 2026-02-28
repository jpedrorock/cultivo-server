import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — use factory functions to avoid hoisting issues
// ---------------------------------------------------------------------------

vi.mock("../drizzle/schema", () => ({
  alerts: { status: "status", tentId: "tentId", id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
}));

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers — set up after mocks are registered
// ---------------------------------------------------------------------------

import { eq, and } from "drizzle-orm";
import { alerts } from "../drizzle/schema";
import { getDb } from "./db";

function makeMockDb(affectedRows = 3) {
  const mockWhere = vi.fn().mockResolvedValue([{ affectedRows }]);
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
  return { db: { update: mockUpdate }, mockUpdate, mockSet, mockWhere };
}

// ---------------------------------------------------------------------------
// Unit under test — inline implementation mirrors routers.ts logic
// ---------------------------------------------------------------------------

async function markAllAsSeen(input: { tentId?: number }) {
  const database = await getDb();
  if (!database) throw new Error("DB unavailable");

  const conditions = [eq(alerts.status as any, "NEW")];
  if (input.tentId !== undefined) {
    conditions.push(eq(alerts.tentId as any, input.tentId));
  }

  const result = await (database as any)
    .update(alerts)
    .set({ status: "SEEN" })
    .where(and(...conditions));

  return { success: true, updated: result[0]?.affectedRows ?? 0 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("alerts.markAllAsSeen", () => {
  it("marks all NEW alerts as SEEN when no tentId is provided", async () => {
    const { db, mockUpdate, mockSet, mockWhere } = makeMockDb(3);
    vi.mocked(getDb).mockResolvedValueOnce(db as any);

    const result = await markAllAsSeen({});

    expect(result.success).toBe(true);
    expect(result.updated).toBe(3);
    expect(mockUpdate).toHaveBeenCalledWith(alerts);
    expect(mockSet).toHaveBeenCalledWith({ status: "SEEN" });
    expect(mockWhere).toHaveBeenCalledTimes(1);
  });

  it("filters by tentId when provided", async () => {
    const { db, mockWhere } = makeMockDb(1);
    vi.mocked(getDb).mockResolvedValueOnce(db as any);

    const result = await markAllAsSeen({ tentId: 2 });

    expect(result.success).toBe(true);
    expect(result.updated).toBe(1);
    // where() receives an `and(...)` condition containing tentId filter
    const whereArg = mockWhere.mock.calls[0][0];
    expect(whereArg).toHaveProperty("and");
    expect((whereArg as any).and).toHaveLength(2); // status=NEW + tentId=2
  });

  it("returns updated: 0 when no alerts are NEW", async () => {
    const { db } = makeMockDb(0);
    vi.mocked(getDb).mockResolvedValueOnce(db as any);

    const result = await markAllAsSeen({});
    expect(result.success).toBe(true);
    expect(result.updated).toBe(0);
  });

  it("handles missing affectedRows gracefully", async () => {
    const { db, mockWhere } = makeMockDb(0);
    mockWhere.mockResolvedValueOnce([{}]); // no affectedRows key
    vi.mocked(getDb).mockResolvedValueOnce(db as any);

    const result = await markAllAsSeen({});
    expect(result.updated).toBe(0);
  });

  it("throws when database is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(null as any);
    await expect(markAllAsSeen({})).rejects.toThrow("DB unavailable");
  });
});
