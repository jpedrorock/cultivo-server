/**
 * Script rápido para aprovar + promover a admin um usuário do banco local
 * por email, opcionalmente resetando a senha.
 * Uso:
 *   tsx server/admin-approve.ts <email> [novaSenha]
 * Exemplo:
 *   tsx server/admin-approve.ts joaopedro@evapro.cloud lasanha123456
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { hashPassword } from "./_core/auth";

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];
  if (!email) {
    console.error("Uso: tsx server/admin-approve.ts <email> [novaSenha]");
    process.exit(1);
  }

  const db = await getDb();
  if (!db) {
    console.error("Banco não disponível");
    process.exit(1);
  }

  const [u] = await db
    .select({ id: users.id, email: users.email, role: users.role, approved: users.approved })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!u) {
    console.error(`Usuário '${email}' não encontrado`);
    process.exit(1);
  }

  const updates: { approved: boolean; role: "admin"; passwordHash?: string } = {
    approved: true,
    role: "admin",
  };
  if (newPassword) {
    updates.passwordHash = await hashPassword(newPassword);
  }

  await db.update(users).set(updates).where(eq(users.id, u.id));

  console.log(`✓ ${email} (id ${u.id}) aprovado + admin${newPassword ? " + senha resetada" : ""}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
