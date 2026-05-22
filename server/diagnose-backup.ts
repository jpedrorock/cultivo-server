/**
 * Diagnóstico: mostra estado relevante pro import de backup.
 * Uso: tsx server/diagnose-backup.ts <email>
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { users, tents, groups } from "../drizzle/schema";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Uso: tsx server/diagnose-backup.ts <email>");
    process.exit(1);
  }

  const db = await getDb();
  if (!db) { console.error("Banco indisponível"); process.exit(1); }

  // 1. User
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) { console.error(`User '${email}' não encontrado`); process.exit(1); }
  console.log(`👤 User id=${u.id} email=${u.email} role=${u.role} groupId=${u.groupId ?? "NULL"} approved=${u.approved}`);

  if (u.groupId == null) {
    console.log(`\n⚠️  User SEM groupId. Backup vai falhar com 'Usuário sem groupId — import bloqueado'`);
    const allGroups = await db.select().from(groups);
    if (allGroups.length === 0) {
      console.log(`Nenhum group no banco. Crie um group antes.`);
    } else {
      console.log(`Groups existentes (${allGroups.length}):`);
      allGroups.forEach(g => console.log(`  id=${g.id} name=${g.name} owner=${g.ownerId}`));
    }
    return;
  }

  // 2. Tents existentes
  const groupTents = await db.select().from(tents).where(eq(tents.groupId, u.groupId));
  console.log(`\n🏠 Tents do groupId=${u.groupId}: ${groupTents.length} encontradas`);
  groupTents.forEach(t => console.log(`  id=${t.id} name=${t.name} groupId=${t.groupId} volume=${t.volume}`));

  // 3. Outras tents (de outros groups) que possam colidir por ID
  const allTents = await db.select({ id: tents.id, name: tents.name, groupId: tents.groupId }).from(tents);
  const collisionIds = [1, 2, 3, 4];
  const colliders = allTents.filter(t => collisionIds.includes(t.id));
  console.log(`\n🔍 Tents com id em [1..4] (potenciais colisões com backup):`);
  if (colliders.length === 0) console.log(`  Nenhuma — seguro.`);
  else colliders.forEach(t => console.log(`  id=${t.id} name=${t.name} groupId=${t.groupId ?? "NULL"}`));

  // 4. Auto-increment atual de tents
  const [autoInc] = await db.execute(sql`
    SELECT AUTO_INCREMENT FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tents'
  `) as any;
  const ai = Array.isArray(autoInc) ? autoInc[0] : autoInc;
  console.log(`\n🔢 AUTO_INCREMENT de tents: ${ai?.AUTO_INCREMENT ?? "?"}`);

  process.exit(0);
}

main().catch(err => {
  console.error("Erro no diagnóstico:", err);
  process.exit(1);
});
