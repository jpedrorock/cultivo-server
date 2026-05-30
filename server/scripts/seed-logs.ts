/**
 * seed-logs.ts — Seed de dados de registro para dev local
 *
 * Insere 45 dias de dailyLogs (AM + PM) com valores realistas por fase,
 * mais os ciclos necessários, nas estufas do usuário pro@cultivo.pro (groupId=4).
 *
 * Executar: pnpm tsx server/scripts/seed-logs.ts
 *
 * Seguro para rodar múltiplas vezes — usa INSERT IGNORE nas datas existentes.
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config();

const DB_URL = process.env.DATABASE_URL ?? "mysql://cultivo:cultivo123@127.0.0.1:3306/cultivo";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Ruído pseudo-aleatório determinístico dado uma semente (evita Math.random puro) */
function noise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x); // 0..1
}

/** Valor com variação natural: base + onda diária + ruído */
function wave(day: number, base: number, amp: number, noiseAmp: number, seed = 1): number {
  const daily = Math.sin((day / 7) * Math.PI * 2) * amp;
  const n = (noise(day * seed + seed * 3.14) - 0.5) * 2 * noiseAmp;
  return base + daily + n;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function fmt1(v: number) { return parseFloat(v.toFixed(1)); }
function fmt2(v: number) { return parseFloat(v.toFixed(2)); }
function fmtInt(v: number) { return Math.round(v); }

// ── Perfis por fase ────────────────────────────────────────────────────────

interface PhaseProfile {
  tempBase: number; tempAmp: number; tempNoise: number; tempAmOffset: number;
  rhBase: number; rhAmp: number; rhNoise: number;
  ppfdBase: number; ppfdAmp: number; ppfdNoise: number;
  phBase: number; phAmp: number; phNoise: number;
  ecBase: number; ecAmp: number; ecNoise: number;
  waterBase: number; waterNoise: number;
}

const PROFILES: Record<string, PhaseProfile> = {
  VEGA: {
    tempBase: 24.5, tempAmp: 0.8, tempNoise: 0.6, tempAmOffset: -1.2,
    rhBase: 65, rhAmp: 3, rhNoise: 2.5,
    ppfdBase: 510, ppfdAmp: 40, ppfdNoise: 25,
    phBase: 6.3, phAmp: 0.08, phNoise: 0.06,
    ecBase: 1.4, ecAmp: 0.12, ecNoise: 0.08,
    waterBase: 1700, waterNoise: 200,
  },
  FLORA: {
    tempBase: 22.5, tempAmp: 0.6, tempNoise: 0.5, tempAmOffset: -1.0,
    rhBase: 52, rhAmp: 2.5, rhNoise: 2,
    ppfdBase: 790, ppfdAmp: 50, ppfdNoise: 30,
    phBase: 6.15, phAmp: 0.07, phNoise: 0.05,
    ecBase: 2.0, ecAmp: 0.15, ecNoise: 0.10,
    waterBase: 2100, waterNoise: 300,
  },
  MAINTENANCE: {
    tempBase: 23.5, tempAmp: 0.7, tempNoise: 0.5, tempAmOffset: -0.8,
    rhBase: 62, rhAmp: 2.5, rhNoise: 2,
    ppfdBase: 380, ppfdAmp: 30, ppfdNoise: 20,
    phBase: 6.2, phAmp: 0.07, phNoise: 0.05,
    ecBase: 1.2, ecAmp: 0.10, ecNoise: 0.07,
    waterBase: 1400, waterNoise: 150,
  },
};

function buildLog(
  tentId: number,
  d: number, // day index (0 = today-44, 44 = today)
  turn: "AM" | "PM",
  profile: PhaseProfile,
  date: Date,
) {
  const seed = tentId * 1000 + d;
  const isAM = turn === "AM";
  const tempOffset = isAM ? profile.tempAmOffset : 0;

  const tempC  = fmt1(clamp(wave(d, profile.tempBase + tempOffset, profile.tempAmp, profile.tempNoise, seed + 1), 18, 31));
  const rhPct  = fmt1(clamp(wave(d, profile.rhBase,   profile.rhAmp,   profile.rhNoise,   seed + 2), 35, 80));
  const ppfd   = fmtInt(clamp(wave(d, profile.ppfdBase, profile.ppfdAmp, profile.ppfdNoise, seed + 3), 200, 1100));
  const ph     = fmt2(clamp(wave(d, profile.phBase,   profile.phAmp,   profile.phNoise,   seed + 4), 5.5, 7.0));
  const ec     = fmt2(clamp(wave(d, profile.ecBase,   profile.ecAmp,   profile.ecNoise,   seed + 5), 0.5, 3.5));

  // Rega só no turno AM (mais realista)
  const watering = isAM ? fmtInt(clamp(
    profile.waterBase + (noise(seed + 6) - 0.5) * 2 * profile.waterNoise,
    500, 4000,
  )) : null;
  const runoffCollected = isAM && watering ? fmtInt(watering * clamp(0.10 + noise(seed + 7) * 0.20, 0.05, 0.35)) : null;
  const runoffPct = (isAM && watering && runoffCollected) ? fmt2((runoffCollected / watering) * 100) : null;

  return {
    tentId,
    logDate: date.toISOString().slice(0, 19).replace("T", " "),
    turn,
    tempC,
    rhPct,
    ppfd,
    ph,
    ec,
    wateringVolume: watering,
    runoffCollected,
    runoffPercentage: runoffPct,
    source: "MANUAL",
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const pool = await mysql.createPool(DB_URL);

  console.log("🌱 Seed de logs iniciado...\n");

  // 1. Encontrar TODAS as estufas que têm ciclo ativo (qualquer usuário)
  const [tentsRows] = await pool.query<any[]>(
    `SELECT DISTINCT t.id, t.name, t.category, t.groupId
     FROM tents t
     INNER JOIN cycles c ON c.tentId = t.id AND c.status = 'ACTIVE'
     WHERE t.groupId IS NOT NULL
     ORDER BY t.groupId, t.id`
  );

  if ((tentsRows as any[]).length === 0) {
    console.error("❌ Nenhuma estufa com ciclo ACTIVE encontrada.");
    process.exit(1);
  }

  console.log(`📋 Estufas encontradas (${(tentsRows as any[]).length}):`);
  for (const t of tentsRows as any[]) {
    console.log(`   #${t.id} ${t.name} [${t.category}] grupo=${t.groupId}`);
  }
  console.log();

  const DAYS = 60;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const tent of tentsRows as any[]) {
    const { id: tentId, name, category } = tent;
    const profile = PROFILES[category as string] ?? PROFILES.VEGA;

    // 2. Ciclo já garantido pelo JOIN acima — apenas log

    // 3. Inserir logs dos últimos DAYS dias
    let inserted = 0;
    let skipped = 0;

    for (let d = 0; d < DAYS; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - (DAYS - 1 - d));

      for (const turn of ["AM", "PM"] as const) {
        const logHour = turn === "AM" ? 8 : 20;
        const logDate = new Date(date);
        logDate.setHours(logHour, 0, 0, 0);

        const log = buildLog(tentId, d, turn, profile, logDate);

        try {
          await pool.query(
            `INSERT IGNORE INTO dailyLogs
               (tentId, logDate, turn, tempC, rhPct, ppfd, ph, ec,
                wateringVolume, runoffCollected, runoffPercentage, source, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              log.tentId, log.logDate, log.turn,
              log.tempC, log.rhPct, log.ppfd, log.ph, log.ec,
              log.wateringVolume, log.runoffCollected, log.runoffPercentage,
              log.source,
            ]
          );
          inserted++;
        } catch {
          // Unique constraint — já existe
          skipped++;
        }
      }
    }

    console.log(`📊 ${name} [${category}]: ${inserted} logs inseridos, ${skipped} ignorados (já existiam)`);
  }

  await pool.end();
  console.log("\n✅ Seed concluído. Abra o app e veja os gráficos!");
}

main().catch((err) => {
  console.error("❌ Erro:", err.message);
  process.exit(1);
});
