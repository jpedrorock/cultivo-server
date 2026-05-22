import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { comparePassword } from "./_core/auth";

async function main() {
  const email = process.argv[2];
  const trySenha = process.argv[3];
  if (!email) { console.error("Uso: tsx server/check-user.ts <email> [senhaParaTestar]"); process.exit(1); }

  const db = await getDb();
  if (!db) process.exit(1);

  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) { console.error(`User '${email}' NÃO existe`); process.exit(1); }

  console.log(`✓ User existe: id=${u.id}`);
  console.log(`  email: ${u.email}`);
  console.log(`  role: ${u.role}`);
  console.log(`  approved: ${u.approved}`);
  console.log(`  groupId: ${u.groupId}`);
  console.log(`  passwordHash: ${u.passwordHash ? u.passwordHash.slice(0, 30) + "..." : "VAZIO"}`);

  if (trySenha) {
    console.log(`\nTestando senha '${trySenha}':`);
    const { ok, needsRehash } = await comparePassword(trySenha, u.passwordHash);
    console.log(`  resultado: ${ok ? "✓ SENHA CORRETA" : "✗ senha incorreta"}`);
    if (needsRehash) console.log(`  (precisa rehash)`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
