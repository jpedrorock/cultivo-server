/**
 * Lista plantas e ciclos vinculados a uma estufa. Uso:
 *   tsx server/inspect-tent.ts "Principal"
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { tents, plants, cycles } from "../drizzle/schema";

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error("Uso: tsx server/inspect-tent.ts <nome>");
    process.exit(1);
  }

  const db = await getDb();
  if (!db) { console.error("Banco indisponível"); process.exit(1); }

  const [t] = await db.select().from(tents).where(eq(tents.name, name)).limit(1);
  if (!t) { console.error(`Estufa '${name}' não encontrada`); process.exit(1); }
  console.log(`🏠 Estufa: id=${t.id} name=${t.name} group=${t.groupId}\n`);

  const plantsInTent = await db.select().from(plants).where(eq(plants.currentTentId, t.id));
  console.log(`🌱 Plantas com currentTentId=${t.id}: ${plantsInTent.length}`);
  plantsInTent.forEach(p => console.log(
    `  id=${p.id} name="${p.name}" status=${p.status} stage=${p.plantStage} deletedAt=${p.deletedAt ?? "null"}`
  ));

  const cyclesInTent = await db.select().from(cycles).where(eq(cycles.tentId, t.id));
  console.log(`\n🔁 Ciclos: ${cyclesInTent.length}`);
  cyclesInTent.forEach(c => console.log(
    `  id=${c.id} status=${c.status} start=${c.startDate?.toISOString?.() ?? c.startDate} flora=${c.floraStartDate ?? "—"}`
  ));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
