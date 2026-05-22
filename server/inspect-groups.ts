import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users, groups } from "../drizzle/schema";

async function main() {
  const db = await getDb();
  if (!db) process.exit(1);

  const allGroups = await db.select().from(groups);
  console.log("Groups:");
  allGroups.forEach(g => console.log(`  id=${g.id} name=${g.name} owner=${g.ownerId}`));

  const allUsers = await db.select({ id: users.id, email: users.email, groupId: users.groupId }).from(users);
  console.log("\nUsers:");
  allUsers.forEach(u => console.log(`  id=${u.id} email=${u.email} groupId=${u.groupId ?? "NULL"}`));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
