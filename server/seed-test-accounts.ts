/**
 * Cria 2 contas locais pra testar plano Free vs Pro:
 *   pro@cultivo.pro  → senha 'lasanha123456' → plano Pro
 *   free@cultivo.pro → senha 'lasanha123456' → plano Free
 *
 * O reconhecimento de plano por email está em client/src/_core/hooks/usePlan.ts
 * (TEST_ACCOUNTS_BY_EMAIL). Esses emails só fazem efeito em dev/Capacitor.
 *
 * Uso:
 *   tsx server/seed-test-accounts.ts
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users, groups } from "../drizzle/schema";
import { hashPassword } from "./_core/auth";

async function ensureGroup(db: any, name: string): Promise<number> {
  const [existing] = await db.select().from(groups).where(eq(groups.name, name)).limit(1);
  if (existing) return existing.id;

  const inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();
  const [result] = await db.insert(groups).values({ name, inviteCode, ownerId: 0 });
  const newId = (result as any).insertId;
  console.log(`  Group '${name}' criado (id=${newId}, invite=${inviteCode})`);
  return newId;
}

async function ensureUser(db: any, email: string, plainPassword: string, groupId: number) {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const passwordHash = await hashPassword(plainPassword);

  if (existing) {
    await db.update(users).set({
      passwordHash,
      approved: true,
      role: "admin",
      groupId,
    }).where(eq(users.id, existing.id));
    console.log(`✓ User '${email}' atualizado (id=${existing.id}, group=${groupId})`);
    return existing.id;
  }

  const [result] = await db.insert(users).values({
    email,
    passwordHash,
    name: email.split("@")[0],
    role: "admin",
    approved: true,
    groupId,
    lastSignedIn: new Date(),
  });
  const newId = (result as any).insertId;
  console.log(`✓ User '${email}' criado (id=${newId}, group=${groupId})`);
  return newId;
}

async function main() {
  const db = await getDb();
  if (!db) process.exit(1);

  const groupProId  = await ensureGroup(db, "Test Pro");
  const groupTeamId = await ensureGroup(db, "Test Team");
  const groupFreeId = await ensureGroup(db, "Test Free");

  await ensureUser(db, "pro@cultivo.pro",  "lasanha123456", groupProId);
  await ensureUser(db, "team@cultivo.pro", "lasanha123456", groupTeamId);
  await ensureUser(db, "free@cultivo.pro", "lasanha123456", groupFreeId);

  console.log("\nContas prontas. Em todas a senha é 'lasanha123456'. O cliente força o tier:");
  console.log("  pro@cultivo.pro  → Pro Individual (calculadoras destravadas, estufas ilimitadas, 1 membro)");
  console.log("  team@cultivo.pro → Pro Grupo (Pro + até 3 membros, convidar habilitado)");
  console.log("  free@cultivo.pro → Free (cadeado nas Pro, limite 1 estufa, sem convite, paywall)");

  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
