/**
 * Remove o índice UNIQUE legacy em strains.name (presente no banco local mas
 * já não existe no schema do código — bloqueia importar backup em múltiplas
 * contas que compartilham strains com mesmo nome).
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

async function main() {
  const db = await getDb();
  if (!db) process.exit(1);

  try {
    await db.execute(sql.raw("ALTER TABLE `strains` DROP INDEX `name`"));
    console.log("✓ Índice UNIQUE 'name' removido de strains");
  } catch (e: any) {
    if (String(e?.message ?? "").includes("check that column/key exists")) {
      console.log("✓ Índice já não existe — nada a fazer");
    } else {
      throw e;
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
