/**
 * Testes do gating de Cultivo Orgânico (Fase 1).
 *
 * 1. shouldEvaluatePhAlert (db.ts) — alerta de pH SUPRIMIDO no ORGANIC,
 *    DISPARA no MINERAL/COCO/HYDRO. Unit puro, sempre roda.
 * 2. tents.create/update — persiste cultivationMethod; default MINERAL quando
 *    omitido. DB-backed (skipIf !DB_AVAILABLE), espelha tents.delete.test.ts.
 */
import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, shouldEvaluatePhAlert } from "./db";
import { tents } from "../drizzle/schema";
import { createTestContext, DB_AVAILABLE } from "./test-helpers";

describe("shouldEvaluatePhAlert (gating de cultivo orgânico)", () => {
  const guards = { phMargin: 0.3, latestPh: 6.5, phMin: 5.8, phMax: 6.2 };

  it("SUPRIME alerta de pH em estufa ORGANIC", () => {
    expect(shouldEvaluatePhAlert({ cultivationMethod: "ORGANIC", ...guards })).toBe(false);
  });

  it("AVALIA (dispara) em MINERAL, COCO e HYDRO", () => {
    for (const method of ["MINERAL", "COCO", "HYDRO"]) {
      expect(shouldEvaluatePhAlert({ cultivationMethod: method, ...guards })).toBe(true);
    }
  });

  it("trata método null/undefined como não-orgânico (avalia)", () => {
    expect(shouldEvaluatePhAlert({ cultivationMethod: null, ...guards })).toBe(true);
    expect(shouldEvaluatePhAlert({ cultivationMethod: undefined, ...guards })).toBe(true);
  });

  it("não avalia quando falta margem, leitura ou faixa ideal (guards null)", () => {
    expect(shouldEvaluatePhAlert({ cultivationMethod: "MINERAL", ...guards, phMargin: null })).toBe(false);
    expect(shouldEvaluatePhAlert({ cultivationMethod: "MINERAL", ...guards, latestPh: null })).toBe(false);
    expect(shouldEvaluatePhAlert({ cultivationMethod: "MINERAL", ...guards, phMin: null })).toBe(false);
    expect(shouldEvaluatePhAlert({ cultivationMethod: "MINERAL", ...guards, phMax: null })).toBe(false);
  });

  it("aceita valores decimais como string (vindos do DB)", () => {
    expect(shouldEvaluatePhAlert({ cultivationMethod: "MINERAL", phMargin: "0.3", latestPh: "6.5", phMin: 5.8, phMax: 6.2 })).toBe(true);
  });
});

describe.skipIf(!DB_AVAILABLE)("tents.create/update — cultivationMethod", () => {
  const createdIds: number[] = [];
  const baseInput = { name: "Test Gating Orgânico", category: "VEGA" as const, width: 50, depth: 50, height: 100 };

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const id of createdIds) await db.delete(tents).where(eq(tents.id, id));
  });

  async function methodOf(id: number): Promise<string | null> {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select({ m: tents.cultivationMethod }).from(tents).where(eq(tents.id, id));
    return row?.m ?? null;
  }

  it("persiste cultivationMethod=ORGANIC no create", async () => {
    const caller = appRouter.createCaller(createTestContext());
    const { id } = await caller.tents.create({ ...baseInput, cultivationMethod: "ORGANIC" });
    createdIds.push(id);
    expect(await methodOf(id)).toBe("ORGANIC");
  });

  it("default MINERAL quando cultivationMethod é omitido no create", async () => {
    const caller = appRouter.createCaller(createTestContext());
    const { id } = await caller.tents.create({ ...baseInput });
    createdIds.push(id);
    expect(await methodOf(id)).toBe("MINERAL");
  });

  it("update altera o cultivationMethod (MINERAL → ORGANIC)", async () => {
    const caller = appRouter.createCaller(createTestContext());
    const { id } = await caller.tents.create({ ...baseInput, cultivationMethod: "MINERAL" });
    createdIds.push(id);
    expect(await methodOf(id)).toBe("MINERAL");

    await caller.tents.update({ id, ...baseInput, cultivationMethod: "ORGANIC" });
    expect(await methodOf(id)).toBe("ORGANIC");
  });
});
