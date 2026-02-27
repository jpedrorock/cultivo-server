/**
 * Seed: Margens de Alerta por Fase e Safety Limits
 * Popula phaseAlertMargins e safetyLimits com valores realistas por fase de cultivo.
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

console.log("🚨 Inserindo margens de alerta por fase...\n");

// ─────────────────────────────────────────────────────────────────────────────
// 1. phaseAlertMargins — margens de tolerância (±) por fase
// ─────────────────────────────────────────────────────────────────────────────
await db.query("DELETE FROM phaseAlertMargins");

const phaseMargins = [
  // MAINTENANCE: plantas-mãe, condições estáveis, tolerância moderada
  { phase: "MAINTENANCE", tempMargin: 2.0, rhMargin: 5.0, ppfdMargin: 75,  phMargin: 0.3 },
  // CLONING: enraizamento delicado, tolerância menor
  { phase: "CLONING",     tempMargin: 1.5, rhMargin: 4.0, ppfdMargin: 50,  phMargin: 0.2 },
  // VEGA: crescimento vegetativo, tolerância moderada
  { phase: "VEGA",        tempMargin: 2.0, rhMargin: 5.0, ppfdMargin: 100, phMargin: 0.3 },
  // FLORA: floração, RH mais crítico (risco de botrytis), tolerância menor
  { phase: "FLORA",       tempMargin: 1.5, rhMargin: 3.0, ppfdMargin: 100, phMargin: 0.2 },
  // DRYING: secagem, controle muito rigoroso, sem pH (não há rega)
  { phase: "DRYING",      tempMargin: 1.0, rhMargin: 2.0, ppfdMargin: 0,   phMargin: null },
];

for (const m of phaseMargins) {
  await db.query(
    `INSERT INTO phaseAlertMargins (phase, tempMargin, rhMargin, ppfdMargin, phMargin)
     VALUES (?, ?, ?, ?, ?)`,
    [m.phase, m.tempMargin, m.rhMargin, m.ppfdMargin, m.phMargin]
  );
  console.log(`  ✓ phaseAlertMargins: ${m.phase} — Temp ±${m.tempMargin}°C | RH ±${m.rhMargin}% | PPFD ±${m.ppfdMargin} | pH ±${m.phMargin ?? "N/A"}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. safetyLimits — faixas absolutas de segurança por contexto e fase
//    TENT_A  = estufa de manutenção/clonagem (menor, 75×45×90)
//    TENT_BC = estufas de vega e flora (maiores)
// ─────────────────────────────────────────────────────────────────────────────
await db.query("DELETE FROM safetyLimits");

const safetyLimits = [
  // ── TENT_A ──────────────────────────────────────────────────────────────
  // MAINTENANCE: plantas-mãe, 18/6, temp amena, RH médio
  { context: "TENT_A", phase: "MAINTENANCE", metric: "TEMP", minValue: 22.0, maxValue: 28.0 },
  { context: "TENT_A", phase: "MAINTENANCE", metric: "RH",   minValue: 50.0, maxValue: 65.0 },
  { context: "TENT_A", phase: "MAINTENANCE", metric: "PPFD", minValue: 200,  maxValue: 400  },
  { context: "TENT_A", phase: "MAINTENANCE", metric: "PH",   minValue: 5.8,  maxValue: 6.5  },

  // CLONING: alta umidade para enraizamento, luz suave
  { context: "TENT_A", phase: "CLONING", metric: "TEMP", minValue: 23.0, maxValue: 26.0 },
  { context: "TENT_A", phase: "CLONING", metric: "RH",   minValue: 70.0, maxValue: 85.0 },
  { context: "TENT_A", phase: "CLONING", metric: "PPFD", minValue: 100,  maxValue: 200  },
  { context: "TENT_A", phase: "CLONING", metric: "PH",   minValue: 5.8,  maxValue: 6.2  },

  // VEGA: crescimento, mais luz, RH moderado
  { context: "TENT_A", phase: "VEGA", metric: "TEMP", minValue: 22.0, maxValue: 28.0 },
  { context: "TENT_A", phase: "VEGA", metric: "RH",   minValue: 50.0, maxValue: 70.0 },
  { context: "TENT_A", phase: "VEGA", metric: "PPFD", minValue: 400,  maxValue: 700  },
  { context: "TENT_A", phase: "VEGA", metric: "PH",   minValue: 5.8,  maxValue: 6.3  },

  // FLORA: floração, RH baixo para evitar botrytis, PPFD alto
  { context: "TENT_A", phase: "FLORA", metric: "TEMP", minValue: 20.0, maxValue: 26.0 },
  { context: "TENT_A", phase: "FLORA", metric: "RH",   minValue: 40.0, maxValue: 55.0 },
  { context: "TENT_A", phase: "FLORA", metric: "PPFD", minValue: 600,  maxValue: 900  },
  { context: "TENT_A", phase: "FLORA", metric: "PH",   minValue: 5.8,  maxValue: 6.2  },

  // DRYING: secagem lenta, sem luz, RH e temp controlados
  { context: "TENT_A", phase: "DRYING", metric: "TEMP", minValue: 18.0, maxValue: 22.0 },
  { context: "TENT_A", phase: "DRYING", metric: "RH",   minValue: 45.0, maxValue: 55.0 },
  { context: "TENT_A", phase: "DRYING", metric: "PPFD", minValue: 0,    maxValue: 0    },

  // ── TENT_BC ─────────────────────────────────────────────────────────────
  // MAINTENANCE
  { context: "TENT_BC", phase: "MAINTENANCE", metric: "TEMP", minValue: 22.0, maxValue: 28.0 },
  { context: "TENT_BC", phase: "MAINTENANCE", metric: "RH",   minValue: 50.0, maxValue: 65.0 },
  { context: "TENT_BC", phase: "MAINTENANCE", metric: "PPFD", minValue: 200,  maxValue: 400  },
  { context: "TENT_BC", phase: "MAINTENANCE", metric: "PH",   minValue: 5.8,  maxValue: 6.5  },

  // CLONING
  { context: "TENT_BC", phase: "CLONING", metric: "TEMP", minValue: 23.0, maxValue: 26.0 },
  { context: "TENT_BC", phase: "CLONING", metric: "RH",   minValue: 70.0, maxValue: 85.0 },
  { context: "TENT_BC", phase: "CLONING", metric: "PPFD", minValue: 100,  maxValue: 200  },
  { context: "TENT_BC", phase: "CLONING", metric: "PH",   minValue: 5.8,  maxValue: 6.2  },

  // VEGA: estufas maiores suportam PPFD mais alto
  { context: "TENT_BC", phase: "VEGA", metric: "TEMP", minValue: 22.0, maxValue: 28.0 },
  { context: "TENT_BC", phase: "VEGA", metric: "RH",   minValue: 50.0, maxValue: 70.0 },
  { context: "TENT_BC", phase: "VEGA", metric: "PPFD", minValue: 400,  maxValue: 800  },
  { context: "TENT_BC", phase: "VEGA", metric: "PH",   minValue: 5.8,  maxValue: 6.3  },

  // FLORA: controle rigoroso, PPFD pode chegar a 1000
  { context: "TENT_BC", phase: "FLORA", metric: "TEMP", minValue: 20.0, maxValue: 26.0 },
  { context: "TENT_BC", phase: "FLORA", metric: "RH",   minValue: 40.0, maxValue: 55.0 },
  { context: "TENT_BC", phase: "FLORA", metric: "PPFD", minValue: 600,  maxValue: 1000 },
  { context: "TENT_BC", phase: "FLORA", metric: "PH",   minValue: 5.8,  maxValue: 6.2  },

  // DRYING
  { context: "TENT_BC", phase: "DRYING", metric: "TEMP", minValue: 18.0, maxValue: 22.0 },
  { context: "TENT_BC", phase: "DRYING", metric: "RH",   minValue: 45.0, maxValue: 55.0 },
  { context: "TENT_BC", phase: "DRYING", metric: "PPFD", minValue: 0,    maxValue: 0    },
];

for (const s of safetyLimits) {
  await db.query(
    'INSERT INTO safetyLimits (context, phase, metric, `minValue`, `maxValue`) VALUES (?, ?, ?, ?, ?)',
    [s.context, s.phase, s.metric, s.minValue, s.maxValue]
  );
}

// Resumo por contexto/fase
const grouped = {};
for (const s of safetyLimits) {
  const key = `${s.context} / ${s.phase}`;
  if (!grouped[key]) grouped[key] = [];
  grouped[key].push(`${s.metric}: ${s.minValue}–${s.maxValue}`);
}
for (const [key, vals] of Object.entries(grouped)) {
  console.log(`  ✓ safetyLimits [${key}]: ${vals.join(" | ")}`);
}

await db.end();

console.log("\n✅ Margens de alerta inseridas com sucesso!");
console.log("─────────────────────────────────────────");
console.log(`📊 phaseAlertMargins: ${phaseMargins.length} fases`);
console.log(`🛡️  safetyLimits: ${safetyLimits.length} registros (${Object.keys(grouped).length} combinações contexto/fase)`);
console.log("─────────────────────────────────────────");
