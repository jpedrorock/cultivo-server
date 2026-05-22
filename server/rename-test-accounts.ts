/**
 * Renomeia as contas de teste e reseta senhas:
 *   pro@dev.local  → pro@cultivo.pro  (senha: lasanha123456)
 *   free@dev.local → free@cultivo.pro (senha: lasanha123456)
 *
 * Uso: tsx server/rename-test-accounts.ts
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { hashPassword } from "./_core/auth";

const RENAMES: Array<{ from: string; to: string }> = [
  { from: "pro@dev.local",  to: "pro@cultivo.pro"  },
  { from: "free@dev.local", to: "free@cultivo.pro" },
];

const NEW_PASSWORD = "lasanha123456";

async function main() {
  const db = await getDb();
  if (!db) process.exit(1);

  const newHash = await hashPassword(NEW_PASSWORD);

  for (const { from, to } of RENAMES) {
    // Procura pela origem; se não existir, tenta destino (idempotente)
    const [existing] = await db.select().from(users).where(eq(users.email, from)).limit(1);
    if (existing) {
      // Verifica se o destino já existe (conflito)
      const [conflict] = await db.select().from(users).where(eq(users.email, to)).limit(1);
      if (conflict && conflict.id !== existing.id) {
        console.warn(`⚠️  '${to}' já existe (id=${conflict.id}); pulando rename de '${from}'`);
        continue;
      }
      await db.update(users)
        .set({ email: to, passwordHash: newHash, approved: true, role: "admin" })
        .where(eq(users.id, existing.id));
      console.log(`✓ Renomeado: '${from}' (id=${existing.id}) → '${to}', senha resetada`);
    } else {
      const [byDest] = await db.select().from(users).where(eq(users.email, to)).limit(1);
      if (byDest) {
        await db.update(users)
          .set({ passwordHash: newHash, approved: true, role: "admin" })
          .where(eq(users.id, byDest.id));
        console.log(`✓ '${to}' (id=${byDest.id}) — senha resetada (já estava com novo email)`);
      } else {
        console.warn(`⚠️  Nem '${from}' nem '${to}' existem. Rode seed-test-accounts.ts primeiro.`);
      }
    }
  }

  console.log("\nCredenciais atuais:");
  console.log(`  pro@cultivo.pro  / ${NEW_PASSWORD} → plano Pro`);
  console.log(`  free@cultivo.pro / ${NEW_PASSWORD} → plano Free`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
