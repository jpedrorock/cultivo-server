/**
 * Testes da migration `users-plan-4tier` (a parte mais arriscada do 4-tier backend).
 *
 * 1. applyPlanGrandfather — remap pro→cloud, team→pro, free→free. DB-backed
 *    contra uma TABELA TEMPORÁRIA (não toca `users` real). skipIf !DB_AVAILABLE.
 * 2. isPlanMigrationApplied — guard de idempotência (puro): o remap não é seguro
 *    de rodar 2x; a migration só roda se o enum ainda tiver 'team'.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getMysqlPool } from "./mysql-pool";
import { applyPlanGrandfather, isPlanMigrationApplied } from "./_core/dbMigrations";
import { DB_AVAILABLE } from "./test-helpers";

describe("isPlanMigrationApplied (guard de idempotência)", () => {
  it("true quando enum já é 4-tier (cloud sem team) → migration pula", () => {
    expect(isPlanMigrationApplied("enum('free','starter','cloud','pro')")).toBe(true);
  });

  it("false quando enum antigo ainda tem 'team' → migration roda", () => {
    expect(isPlanMigrationApplied("enum('free','pro','team')")).toBe(false);
  });

  it("false no enum transitório (tem cloud E team) → ainda precisa rodar", () => {
    expect(isPlanMigrationApplied("enum('free','pro','team','starter','cloud')")).toBe(false);
  });
});

describe.skipIf(!DB_AVAILABLE)("applyPlanGrandfather (remap 4-tier)", () => {
  const pool = getMysqlPool();
  const TABLE = "_test_plan_grandfather";

  beforeAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS \`${TABLE}\``);
    await pool.query(
      `CREATE TABLE \`${TABLE}\` (
        id INT PRIMARY KEY AUTO_INCREMENT,
        label VARCHAR(20),
        plan ENUM('free','pro','team','starter','cloud') NOT NULL DEFAULT 'free'
      )`
    );
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS \`${TABLE}\``);
  });

  async function seed() {
    await pool.query(`DELETE FROM \`${TABLE}\``);
    await pool.query(`INSERT INTO \`${TABLE}\` (label, plan) VALUES ('p','pro'),('t','team'),('f','free')`);
  }
  async function planOf(label: string): Promise<string | undefined> {
    const [rows] = (await pool.query(`SELECT plan FROM \`${TABLE}\` WHERE label = ?`, [label])) as [
      Array<{ plan: string }>,
      unknown,
    ];
    return rows[0]?.plan;
  }

  it("remapeia pro→cloud, team→pro, free→free", async () => {
    await seed();
    await applyPlanGrandfather(pool, TABLE);
    expect(await planOf("p")).toBe("cloud");
    expect(await planOf("t")).toBe("pro");
    expect(await planOf("f")).toBe("free");
  });

  it("não deixa nenhum plano antigo (team) para trás", async () => {
    await seed();
    await applyPlanGrandfather(pool, TABLE);
    const [rows] = (await pool.query(
      `SELECT COUNT(*) AS n FROM \`${TABLE}\` WHERE plan = 'team'`
    )) as [Array<{ n: number }>, unknown];
    expect(Number(rows[0]?.n)).toBe(0);
  });
});
