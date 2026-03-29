/**
 * seed-extra.mjs — bulk insert de logs históricos
 */
import mysql from "mysql2/promise";
import { config } from "dotenv";

config();

function rand(min, max, dec = 1) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(dec));
}

const tents = [
  { id: 1, temp: [22, 26], rh: [55, 70], ppfd: [200, 400], ph: [6.0, 6.5], ec: [1.2, 1.8], skipChance: 0.4 },
  { id: 2, temp: [23, 27], rh: [55, 68], ppfd: [350, 580], ph: [6.0, 6.4], ec: [1.4, 1.9], skipChance: 0.05 },
  { id: 3, temp: [21, 25], rh: [42, 55], ppfd: [650, 950], ph: [6.1, 6.6], ec: [1.8, 2.4], skipChance: 0.05 },
];

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  console.log("🌱 Seed histórico iniciado...");

  // Remove logs antigos, mantém os 3 recentes de hoje
  await conn.execute("DELETE FROM dailyLogs WHERE logDate < '2026-03-27'");
  console.log("🧹 Logs antigos limpos");

  const now = new Date("2026-03-29");
  const rows = [];

  for (let daysAgo = 55; daysAgo >= 2; daysAgo--) {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    const dateStr = d.toISOString().slice(0, 10);

    for (const tent of tents) {
      for (const turn of ["AM", "PM"]) {
        if (Math.random() < tent.skipChance) continue;

        const tempC   = rand(tent.temp[0], tent.temp[1]);
        const rhPct   = rand(tent.rh[0], tent.rh[1]);
        const ppfd    = Math.round(rand(tent.ppfd[0], tent.ppfd[1], 0) / 25) * 25;
        const ph      = rand(tent.ph[0], tent.ph[1]);
        const ec      = rand(tent.ec[0], tent.ec[1]);
        const wVol    = Math.random() < 0.25 ? rand(0.3, 0.8) : null;
        const runoff  = wVol ? rand(10, 25, 0) : null;
        const obs     = (tent.id === 3 && Math.random() < 0.08) ? "Boa formação de buds" : null;
        const time    = turn === "AM" ? "08:00:00" : "18:00:00";

        rows.push([tent.id, `${dateStr} ${time}`, turn, tempC, rhPct, ppfd, ph, ec, wVol, null, runoff, obs]);
      }
    }
  }

  // Bulk insert em lotes de 100
  const cols = "(tentId,logDate,turn,tempC,rhPct,ppfd,ph,ec,wateringVolume,runoffCollected,runoffPct,notes)";
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const placeholders = batch.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
    const values = batch.flat();
    await conn.execute(`INSERT INTO dailyLogs ${cols} VALUES ${placeholders}`, values);
  }

  const [[{ total }]] = await conn.query("SELECT COUNT(*) as total FROM dailyLogs");
  console.log(`✅ ${rows.length} registros inseridos — total no banco: ${total}`);
  await conn.end();
}

main().catch(console.error);
