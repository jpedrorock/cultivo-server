import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

async function main() {
  const db = await getDb();
  if (!db) process.exit(1);
  const r: any = await db.execute(sql.raw("SHOW INDEX FROM strains"));
  const rows = Array.isArray(r) ? (Array.isArray(r[0]) ? r[0] : r) : [];
  console.log(`Indexes on strains: ${rows.length}`);
  rows.forEach((row: any) => console.log(`  Key=${row.Key_name} Column=${row.Column_name} Unique=${row.Non_unique === 0}`));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
