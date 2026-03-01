/**
 * seed.mjs — App Cultivo
 * Seed de demonstração completo e definitivo.
 *
 * Estrutura simulada:
 *   Estufa A (Manutenção 75×45×90cm, 65W): 2 plantas-mãe (Orange Punch + 24K Gold)
 *   Estufa B (Vega 80×80×160cm, 240W):     3 clones Orange Punch — semana 3 de vega
 *   Estufa C (Flora 120×120×200cm, 320W):  3 plantas 24K Gold   — semana 5 de flora
 *
 * Dados gerados:
 *   - 6 strains com weekly targets (vega + flora)
 *   - 3 estufas + ciclos ativos para B e C
 *   - 8 plantas com histórico de movimentação
 *   - 14 dias de logs diários (manhã + noite) para cada estufa
 *   - Registros de saúde, tricomas, LST e observações por planta
 *   - Alertas de desvio de parâmetros
 *   - Configurações de alerta por estufa
 *   - Presets de fertilização e rega
 *   - Receitas de fertilização (últimos 5 dias)
 *   - Templates de receitas
 *   - Templates e instâncias de tarefas (semanas atuais)
 *   - Runoff por planta (7 dias)
 *
 * Uso:
 *   node seed.mjs
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const daysAgo = (n, hour = 8) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
};

const mysqlDate = (d) => d.toISOString().slice(0, 19).replace("T", " ");

const rand = (min, max, dec = 1) =>
  parseFloat((Math.random() * (max - min) + min).toFixed(dec));

const randInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

// ─── 1. LIMPAR BANCO ─────────────────────────────────────────────────────────

console.log("🗑️  Limpando banco de dados...");
const tables = [
  "wateringApplications","nutrientApplications","notificationSettings",
  "alertPreferences","plantLSTLogs","plantTrichomeLogs","plantHealthLogs",
  "plantRunoffLogs","plantPhotos","plantObservations","plantTentHistory",
  "plants","taskInstances","taskTemplates","alertHistory","alertSettings",
  "alerts","safetyLimits","phaseAlertMargins","notificationHistory",
  "recipes","recipeTemplates","dailyLogs","weeklyTargets","tentAState",
  "cloningEvents","cycles","fertilizationPresets","wateringPresets",
  "tents","strains",
];
await conn.execute("SET FOREIGN_KEY_CHECKS = 0");
for (const t of tables) {
  await conn.execute(`TRUNCATE TABLE \`${t}\``);
  process.stdout.write(`  ✓ ${t}\n`);
}
await conn.execute("SET FOREIGN_KEY_CHECKS = 1");

// ─── 2. STRAINS ──────────────────────────────────────────────────────────────

console.log("\n🌿 Inserindo strains...");
const strainsData = [
  { name: "Orange Punch",    description: "Híbrida indica-dominante com aromas cítricos intensos. Produção acima da média, trichomas abundantes. Excelente para clonagem.",                    vegaWeeks: 4, floraWeeks: 9  },
  { name: "24K Gold",        description: "Linhagem premium com notas de terra, pinho e especiarias. Alta potência e resina. Ciclo de flora longo mas recompensador.",                         vegaWeeks: 5, floraWeeks: 10 },
  { name: "Gorilla Glue #4", description: "Híbrida com produção massiva de resina. Aromas de chocolate, café e diesel. Plantas compactas com colas densas. Ideal para extração.",             vegaWeeks: 4, floraWeeks: 9  },
  { name: "White Widow",     description: "Híbrida lendária. Cobertura densa de tricomas brancos. Aroma terroso e amadeirado. Efeito potente e duradouro. Boa para extrações.",               vegaWeeks: 4, floraWeeks: 8  },
  { name: "Northern Lights", description: "Indica pura clássica. Crescimento compacto e resistente. Aromas de pinho e terra. Ciclo curto de flora. Ideal para espaços pequenos.",             vegaWeeks: 3, floraWeeks: 7  },
  { name: "Amnesia Haze",    description: "Sativa dominante de alto rendimento. Aromas cítricos e terrosos. Efeito cerebral intenso. Ciclo de flora longo. Requer espaço vertical.",          vegaWeeks: 6, floraWeeks: 11 },
];

const strainMap = {};
for (const s of strainsData) {
  const [r] = await conn.execute(
    "INSERT INTO strains (name, description, vegaWeeks, floraWeeks) VALUES (?, ?, ?, ?)",
    [s.name, s.description, s.vegaWeeks, s.floraWeeks]
  );
  strainMap[s.name] = r.insertId;
}
console.log(`  ✓ ${strainsData.length} strains: ${Object.keys(strainMap).join(", ")}`);

// ─── 3. ESTUFAS ──────────────────────────────────────────────────────────────
// Schema: name, category (MAINTENANCE|VEGA|FLORA|DRYING), width, depth, height, volume, powerW

console.log("\n🏠 Inserindo estufas...");
const volA = parseFloat(((75 * 45 * 90) / 1e6).toFixed(3));
const volB = parseFloat(((80 * 80 * 160) / 1e6).toFixed(3));
const volC = parseFloat(((120 * 120 * 200) / 1e6).toFixed(3));

const [rA] = await conn.execute(
  "INSERT INTO tents (name, category, width, depth, height, volume, powerW) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ["Estufa A", "MAINTENANCE", 75, 45, 90, volA, 65]
);
const tentAId = rA.insertId;

const [rB] = await conn.execute(
  "INSERT INTO tents (name, category, width, depth, height, volume, powerW) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ["Estufa B", "VEGA", 80, 80, 160, volB, 240]
);
const tentBId = rB.insertId;

const [rC] = await conn.execute(
  "INSERT INTO tents (name, category, width, depth, height, volume, powerW) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ["Estufa C", "FLORA", 120, 120, 200, volC, 320]
);
const tentCId = rC.insertId;

console.log(`  ✓ Estufa A (id=${tentAId}) — 75×45×90, 65W, Manutenção`);
console.log(`  ✓ Estufa B (id=${tentBId}) — 80×80×160, 240W, Vega`);
console.log(`  ✓ Estufa C (id=${tentCId}) — 120×120×200, 320W, Flora`);

// ─── 4. TENTASTATE ───────────────────────────────────────────────────────────
// Schema: tentId, mode (MAINTENANCE|CLONING), activeCloningEventId

await conn.execute(
  "INSERT INTO tentAState (tentId, mode) VALUES (?, ?)",
  [tentAId, "MAINTENANCE"]
);

// ─── 5. CICLOS ───────────────────────────────────────────────────────────────
// Schema: tentId, strainId, startDate, cloningStartDate, floraStartDate, motherPlantId,
//         clonesProduced, harvestWeight, harvestNotes, status

console.log("\n🔄 Inserindo ciclos...");
const [rCycleB] = await conn.execute(
  "INSERT INTO cycles (tentId, strainId, startDate, status) VALUES (?, ?, ?, ?)",
  [tentBId, strainMap["Orange Punch"], mysqlDate(daysAgo(14)), "ACTIVE"]
);
const cycleBId = rCycleB.insertId;

const [rCycleC] = await conn.execute(
  "INSERT INTO cycles (tentId, strainId, startDate, floraStartDate, status) VALUES (?, ?, ?, ?, ?)",
  [tentCId, strainMap["24K Gold"], mysqlDate(daysAgo(35)), mysqlDate(daysAgo(28)), "ACTIVE"]
);
const cycleCId = rCycleC.insertId;

console.log(`  ✓ Ciclo B (id=${cycleBId}) — Orange Punch, Vega semana 3`);
console.log(`  ✓ Ciclo C (id=${cycleCId}) — 24K Gold, Flora semana 5`);

// ─── 6. PLANTAS ──────────────────────────────────────────────────────────────
// Schema: name, code, strainId, currentTentId, plantStage (CLONE|SEEDLING|PLANT),
//         status (ACTIVE|HARVESTED|DEAD|DISCARDED), finishedAt, finishReason, notes

console.log("\n🌱 Inserindo plantas...");

const [rMae1] = await conn.execute(
  "INSERT INTO plants (name, code, strainId, currentTentId, plantStage, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ["Orange Punch Mãe", "A-OP-01", strainMap["Orange Punch"], tentAId, "PLANT", "ACTIVE", "Planta-mãe principal. Excelente para clonagem."]
);
const plantMae1Id = rMae1.insertId;

const [rMae2] = await conn.execute(
  "INSERT INTO plants (name, code, strainId, currentTentId, plantStage, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ["24K Gold Mãe", "A-24K-01", strainMap["24K Gold"], tentAId, "PLANT", "ACTIVE", "Planta-mãe secundária. Estrutura robusta."]
);
const plantMae2Id = rMae2.insertId;

const vegaPlantDefs = [
  { name: "Orange Punch #1", code: "B-OP-01", notes: "Clone da mãe A-OP-01. Crescimento vigoroso." },
  { name: "Orange Punch #2", code: "B-OP-02", notes: "Clone da mãe A-OP-01. Estrutura compacta." },
  { name: "Orange Punch #3", code: "B-OP-03", notes: "Clone da mãe A-OP-01. Crescimento mais lento." },
];
const vegaPlantIds = [];
for (const p of vegaPlantDefs) {
  const [r] = await conn.execute(
    "INSERT INTO plants (name, code, strainId, currentTentId, plantStage, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [p.name, p.code, strainMap["Orange Punch"], tentBId, "PLANT", "ACTIVE", p.notes]
  );
  vegaPlantIds.push(r.insertId);
}

const floraPlantDefs = [
  { name: "24K Gold #1", code: "C-24K-01", notes: "Semana 5 de flora. Buds densos se formando." },
  { name: "24K Gold #2", code: "C-24K-02", notes: "Semana 5 de flora. Maior produção esperada." },
  { name: "24K Gold #3", code: "C-24K-03", notes: "Semana 5 de flora. Tricomas começando a amadurecer." },
];
const floraPlantIds = [];
for (const p of floraPlantDefs) {
  const [r] = await conn.execute(
    "INSERT INTO plants (name, code, strainId, currentTentId, plantStage, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [p.name, p.code, strainMap["24K Gold"], tentCId, "PLANT", "ACTIVE", p.notes]
  );
  floraPlantIds.push(r.insertId);
}

const allActivePlants = [...vegaPlantIds, ...floraPlantIds];
console.log(`  ✓ Plantas-mãe: ${plantMae1Id}, ${plantMae2Id}`);
console.log(`  ✓ Vega (B): ${vegaPlantIds.join(", ")}`);
console.log(`  ✓ Flora (C): ${floraPlantIds.join(", ")}`);

// ─── 7. HISTÓRICO DE MOVIMENTAÇÃO ────────────────────────────────────────────
// Schema: plantId, fromTentId, toTentId, movedAt, reason

console.log("\n📦 Inserindo histórico de movimentação...");
for (const id of vegaPlantIds) {
  await conn.execute(
    "INSERT INTO plantTentHistory (plantId, fromTentId, toTentId, movedAt, reason) VALUES (?, ?, ?, ?, ?)",
    [id, tentAId, tentBId, mysqlDate(daysAgo(14)), "Transferido para estufa de vegetação"]
  );
}
for (const id of floraPlantIds) {
  await conn.execute(
    "INSERT INTO plantTentHistory (plantId, fromTentId, toTentId, movedAt, reason) VALUES (?, ?, ?, ?, ?)",
    [id, tentBId, tentCId, mysqlDate(daysAgo(28)), "Transplantado para floração"]
  );
}
console.log("  ✓ Histórico de movimentação inserido");

// ─── 8. OBSERVAÇÕES ──────────────────────────────────────────────────────────
// Schema: plantId, observedAt, content

console.log("\n📝 Inserindo observações...");
const observations = [
  { plantId: plantMae1Id,      day: 10, content: "Planta-mãe em excelente estado. Folhas largas e verde-escuro. Pronta para nova rodada de clones." },
  { plantId: plantMae2Id,      day: 8,  content: "Crescimento estável. Podada levemente para estimular brotação lateral." },
  { plantId: vegaPlantIds[0],  day: 12, content: "Clone enraizou bem. Crescimento vegetativo acelerado nas últimas 48h." },
  { plantId: vegaPlantIds[1],  day: 10, content: "Estrutura compacta. Aplicado LST para abrir copa." },
  { plantId: vegaPlantIds[2],  day: 9,  content: "Crescimento mais lento que as irmãs. Monitorando de perto." },
  { plantId: floraPlantIds[0], day: 5,  content: "Semana 5 de flora. Buds densos e cobertos de resina. Cheiro cítrico intenso." },
  { plantId: floraPlantIds[1], day: 3,  content: "Maior produção esperada do ciclo. Colas principais com 15cm+." },
  { plantId: floraPlantIds[2], day: 2,  content: "Tricomas começando a ficar leitosos. Estimativa de mais 3 semanas." },
];
let obsCount = 0;
for (const o of observations) {
  await conn.execute(
    "INSERT INTO plantObservations (plantId, observationDate, content) VALUES (?, ?, ?)",
    [o.plantId, mysqlDate(daysAgo(o.day)), o.content]
  );
  obsCount++;
}
console.log(`  ✓ ${obsCount} observações inseridas`);

// ─── 9. REGISTROS DE SAÚDE ───────────────────────────────────────────────────
// Schema: plantId, logDate, healthStatus (HEALTHY|STRESSED|SICK|RECOVERING),
//         symptoms, treatment, notes, photoUrl, photoKey

console.log("\n💊 Inserindo registros de saúde...");
const healthData = [
  { plantId: plantMae1Id,      day: 12, status: "HEALTHY",    symptoms: null,                                                    treatment: null,                             notes: "Folhas verdes e brilhantes. Sem sinais de deficiência." },
  { plantId: plantMae1Id,      day: 5,  status: "HEALTHY",    symptoms: null,                                                    treatment: null,                             notes: "Crescimento estável. Raízes saudáveis." },
  { plantId: plantMae2Id,      day: 10, status: "STRESSED",   symptoms: "Pontas das folhas amarelando levemente",                 treatment: "Reduzido EC de 1.4 para 1.2",    notes: "Possível excesso de nutrientes." },
  { plantId: plantMae2Id,      day: 4,  status: "RECOVERING", symptoms: null,                                                    treatment: "Flush com água pura",            notes: "Recuperando após ajuste de EC." },
  { plantId: vegaPlantIds[0],  day: 11, status: "HEALTHY",    symptoms: null,                                                    treatment: null,                             notes: "Clone enraizou perfeitamente. Crescimento vigoroso." },
  { plantId: vegaPlantIds[0],  day: 4,  status: "HEALTHY",    symptoms: null,                                                    treatment: null,                             notes: "Resposta excelente ao LST." },
  { plantId: vegaPlantIds[1],  day: 10, status: "HEALTHY",    symptoms: null,                                                    treatment: null,                             notes: "Copa aberta após LST. Boa distribuição de luz." },
  { plantId: vegaPlantIds[2],  day: 9,  status: "STRESSED",   symptoms: "Crescimento lento, folhas levemente curvadas para baixo", treatment: "pH ajustado de 6.8 para 6.0",  notes: "pH alto causando lockout de nutrientes." },
  { plantId: vegaPlantIds[2],  day: 3,  status: "RECOVERING", symptoms: null,                                                    treatment: null,                             notes: "Recuperando após ajuste de pH. Crescimento retomado." },
  { plantId: floraPlantIds[0], day: 8,  status: "HEALTHY",    symptoms: null,                                                    treatment: null,                             notes: "Semana 5 de flora. Buds compactos e resinosos." },
  { plantId: floraPlantIds[0], day: 2,  status: "HEALTHY",    symptoms: null,                                                    treatment: null,                             notes: "Desenvolvimento excelente. Sem pragas." },
  { plantId: floraPlantIds[1], day: 7,  status: "HEALTHY",    symptoms: null,                                                    treatment: null,                             notes: "Maior planta do ciclo. Colas principais com 15cm." },
  { plantId: floraPlantIds[2], day: 6,  status: "STRESSED",   symptoms: "Folhas inferiores amarelando (senescência normal)",      treatment: "Removidas folhas amarelas",      notes: "Normal para semana 5 de flora." },
  { plantId: floraPlantIds[2], day: 1,  status: "HEALTHY",    symptoms: null,                                                    treatment: null,                             notes: "Tricomas 60% leitosos. Colheita estimada em 3 semanas." },
];
let healthCount = 0;
for (const h of healthData) {
  await conn.execute(
    "INSERT INTO plantHealthLogs (plantId, logDate, healthStatus, symptoms, treatment, notes) VALUES (?, ?, ?, ?, ?, ?)",
    [h.plantId, mysqlDate(daysAgo(h.day)), h.status, h.symptoms, h.treatment, h.notes]
  );
  healthCount++;
}
console.log(`  ✓ ${healthCount} registros de saúde inseridos`);

// ─── 10. TRICOMAS ────────────────────────────────────────────────────────────
// Schema: plantId, logDate, trichomeStatus (CLEAR|CLOUDY|AMBER|MIXED),
//         clearPercent, cloudyPercent, amberPercent, photoUrl, photoKey, notes

console.log("\n🔬 Inserindo registros de tricomas...");
const trichomeData = [
  { plantId: floraPlantIds[0], day: 14, clearPct: 40, cloudyPct: 55, amberPct: 5,  status: "CLOUDY", notes: "Início da floração. Tricomas principalmente clear." },
  { plantId: floraPlantIds[0], day: 7,  clearPct: 15, cloudyPct: 70, amberPct: 10, status: "CLOUDY", notes: "Semana 5. Maioria leitosos. Ainda não no ponto." },
  { plantId: floraPlantIds[1], day: 12, clearPct: 45, cloudyPct: 50, amberPct: 5,  status: "CLOUDY", notes: "Desenvolvimento normal para semana 3." },
  { plantId: floraPlantIds[1], day: 5,  clearPct: 10, cloudyPct: 75, amberPct: 12, status: "CLOUDY", notes: "Quase no ponto. Aguardar mais 20% de amber." },
  { plantId: floraPlantIds[2], day: 10, clearPct: 50, cloudyPct: 45, amberPct: 5,  status: "CLEAR",  notes: "Desenvolvimento um pouco mais lento." },
  { plantId: floraPlantIds[2], day: 3,  clearPct: 20, cloudyPct: 65, amberPct: 12, status: "CLOUDY", notes: "Tricomas amadurecendo. Monitorar diariamente." },
];
let trichomeCount = 0;
for (const t of trichomeData) {
  await conn.execute(
    "INSERT INTO plantTrichomeLogs (plantId, logDate, trichomeStatus, clearPercent, cloudyPercent, amberPercent, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [t.plantId, mysqlDate(daysAgo(t.day)), t.status, t.clearPct, t.cloudyPct, t.amberPct, t.notes]
  );
  trichomeCount++;
}
console.log(`  ✓ ${trichomeCount} registros de tricomas inseridos`);

// ─── 11. LST ─────────────────────────────────────────────────────────────────
// Schema: plantId, logDate, technique, beforePhotoUrl, beforePhotoKey,
//         afterPhotoUrl, afterPhotoKey, response, notes

console.log("\n🌀 Inserindo registros de LST...");
const lstData = [
  { plantId: vegaPlantIds[0], day: 13, technique: "LST",         notes: "Primeira amarração para abrir copa.",           response: "Planta respondeu bem. Brotações laterais ativadas." },
  { plantId: vegaPlantIds[0], day: 8,  technique: "Defoliation",  notes: "Remoção de folhas grandes que bloqueavam luz.",  response: "Boa penetração de luz nas brotações inferiores." },
  { plantId: vegaPlantIds[1], day: 12, technique: "LST",          notes: "Amarração lateral para distribuir copa.",        response: "Crescimento lateral acelerado após 48h." },
  { plantId: vegaPlantIds[1], day: 7,  technique: "Topping",      notes: "Topping no nó 5 para criar 2 colas principais.", response: "Recuperação em 3 dias. Duas colas principais formadas." },
  { plantId: vegaPlantIds[2], day: 10, technique: "LST",          notes: "LST leve para estimular crescimento.",           response: "Crescimento retomado após ajuste de pH." },
];
let lstCount = 0;
for (const l of lstData) {
  await conn.execute(
    "INSERT INTO plantLSTLogs (plantId, logDate, technique, response, notes) VALUES (?, ?, ?, ?, ?)",
    [l.plantId, mysqlDate(daysAgo(l.day)), l.technique, l.response, l.notes]
  );
  lstCount++;
}
console.log(`  ✓ ${lstCount} registros de LST inseridos`);

// ─── 12. LOGS DIÁRIOS ────────────────────────────────────────────────────────
// Schema: tentId, logDate, turn (AM|PM), tempC, rhPct, ppfd, ph, ec,
//         wateringVolume, runoffCollected, runoffPercentage, notes

console.log("\n📊 Inserindo logs diários (14 dias × 3 estufas × 2 turnos)...");
const phaseTargets = {
  MAINTENANCE: { temp: [24, 26], rh: [55, 65], ppfd: [200, 300], ph: [5.9, 6.1], ec: [1.0, 1.2] },
  VEGA:        { temp: [24, 26], rh: [55, 65], ppfd: [400, 600], ph: [5.8, 6.0], ec: [1.2, 1.4] },
  FLORA:       { temp: [22, 24], rh: [45, 55], ppfd: [600, 800], ph: [6.0, 6.2], ec: [1.6, 1.8] },
};
const tentConfigs = [
  { tentId: tentAId, phase: "MAINTENANCE" },
  { tentId: tentBId, phase: "VEGA" },
  { tentId: tentCId, phase: "FLORA" },
];
let logCount = 0;
for (const tc of tentConfigs) {
  const t = phaseTargets[tc.phase];
  for (let day = 13; day >= 0; day--) {
    for (const turn of ["AM", "PM"]) {
      const hour = turn === "AM" ? 8 : 20;
      const tempOffset = day % 5 === 0 ? rand(1.5, 3.0) : 0;
      const rhOffset   = day % 7 === 0 ? rand(5, 12) : 0;
      const wateringVol = turn === "AM" ? randInt(400, 600) : null;
      const runoffVol   = wateringVol ? randInt(70, 130) : null;
      const runoffPct   = wateringVol ? parseFloat(((runoffVol / wateringVol) * 100).toFixed(2)) : null;
      await conn.execute(
        "INSERT INTO dailyLogs (tentId, logDate, turn, tempC, rhPct, ppfd, ph, ec, wateringVolume, runoffCollected, runoffPercentage, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          tc.tentId,
          mysqlDate(daysAgo(day, hour)),
          turn,
          rand(t.temp[0] - 0.5 + tempOffset, t.temp[1] + 0.5 + tempOffset),
          rand(t.rh[0]   - 2   + rhOffset,   t.rh[1]   + 2   + rhOffset),
          randInt(t.ppfd[0], t.ppfd[1]),
          rand(t.ph[0], t.ph[1], 1),
          rand(t.ec[0], t.ec[1], 2),
          wateringVol,
          runoffVol,
          runoffPct,
          null
        ]
      );
      logCount++;
    }
  }
}
console.log(`  ✓ ${logCount} logs diários inseridos`);

// ─── 13. RUNOFF POR PLANTA ───────────────────────────────────────────────────
// Schema: plantId, logDate, volumeIn (L), volumeOut (L), runoffPercent, notes

console.log("\n💧 Inserindo registros de runoff por planta...");
let runoffCount = 0;
for (const plantId of allActivePlants) {
  for (let day = 6; day >= 0; day--) {
    const volumeIn  = parseFloat(rand(0.4, 0.6, 2).toFixed(2));
    const volumeOut = parseFloat(rand(0.07, 0.13, 2).toFixed(2));
    const runoffPct = parseFloat(((volumeOut / volumeIn) * 100).toFixed(2));
    await conn.execute(
      "INSERT INTO plantRunoffLogs (plantId, logDate, volumeIn, volumeOut, runoffPercent) VALUES (?, ?, ?, ?, ?)",
      [plantId, mysqlDate(daysAgo(day)), volumeIn, volumeOut, runoffPct]
    );
    runoffCount++;
  }
}
console.log(`  ✓ ${runoffCount} registros de runoff inseridos`);

// ─── 14. WEEKLY TARGETS ──────────────────────────────────────────────────────
// Schema: strainId, phase, weekNumber, tempMin, tempMax, rhMin, rhMax,
//         ppfdMin, ppfdMax, photoperiod, phMin, phMax, ecMin, ecMax, notes

console.log("\n🎯 Inserindo weekly targets...");
const weeklyTargetsData = [];

// Orange Punch — Vega (4 semanas)
for (const [w, ppfdMin, ppfdMax] of [[1,300,400],[2,350,450],[3,400,500],[4,450,550]])
  weeklyTargetsData.push({ strainId: strainMap["Orange Punch"], phase: "VEGA", weekNumber: w,
    tempMin: 22, tempMax: 26, rhMin: w<=2?60:55, rhMax: w<=2?70:65,
    ppfdMin, ppfdMax, photoperiod: "18/6", phMin: 5.8, phMax: 6.0, ecMin: w<=2?1.0:1.2, ecMax: w<=2?1.2:1.4 });

// Orange Punch — Flora (9 semanas)
for (const [w, ppfdMin, ppfdMax, rhMin, rhMax, tMax, ecMin, ecMax] of [
  [1,550,650,50,60,25,1.3,1.5],[2,600,700,50,60,25,1.4,1.6],[3,650,750,45,55,25,1.5,1.7],
  [4,700,800,45,55,24,1.6,1.8],[5,750,850,40,50,24,1.7,1.9],[6,750,850,40,50,24,1.7,1.9],
  [7,700,800,40,50,23,1.5,1.7],[8,650,750,40,50,23,0.8,1.2],[9,550,650,40,50,23,0.3,0.5]
])
  weeklyTargetsData.push({ strainId: strainMap["Orange Punch"], phase: "FLORA", weekNumber: w,
    tempMin: 20, tempMax: tMax, rhMin, rhMax, ppfdMin, ppfdMax,
    photoperiod: "12/12", phMin: 6.0, phMax: 6.2, ecMin, ecMax });

// 24K Gold — Vega (5 semanas)
for (const [w, ppfdMin, ppfdMax] of [[1,300,400],[2,350,450],[3,400,500],[4,450,550],[5,500,600]])
  weeklyTargetsData.push({ strainId: strainMap["24K Gold"], phase: "VEGA", weekNumber: w,
    tempMin: 22, tempMax: 26, rhMin: w<=2?60:55, rhMax: w<=2?70:65,
    ppfdMin, ppfdMax, photoperiod: "18/6", phMin: 5.8, phMax: 6.0, ecMin: w<=2?1.0:1.2, ecMax: w<=2?1.2:1.4 });

// 24K Gold — Flora (10 semanas)
for (const [w, ppfdMin, ppfdMax, rhMin, rhMax, tMax, ecMin, ecMax] of [
  [1,550,650,50,60,25,1.3,1.5],[2,600,700,50,60,25,1.4,1.6],[3,650,750,45,55,25,1.5,1.7],
  [4,700,800,45,55,24,1.6,1.8],[5,750,850,40,50,24,1.7,1.9],[6,750,850,40,50,24,1.7,1.9],
  [7,700,800,40,50,23,1.5,1.7],[8,650,750,40,50,23,0.8,1.2],[9,600,700,40,50,23,0.5,0.8],
  [10,550,650,40,50,23,0.3,0.5]
])
  weeklyTargetsData.push({ strainId: strainMap["24K Gold"], phase: "FLORA", weekNumber: w,
    tempMin: 20, tempMax: tMax, rhMin, rhMax, ppfdMin, ppfdMax,
    photoperiod: "12/12", phMin: 6.0, phMax: 6.2, ecMin, ecMax });

let targetCount = 0;
for (const t of weeklyTargetsData) {
  await conn.execute(
    "INSERT INTO weeklyTargets (strainId, phase, weekNumber, tempMin, tempMax, rhMin, rhMax, ppfdMin, ppfdMax, photoperiod, phMin, phMax, ecMin, ecMax) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [t.strainId, t.phase, t.weekNumber, t.tempMin, t.tempMax, t.rhMin, t.rhMax,
     t.ppfdMin, t.ppfdMax, t.photoperiod, t.phMin, t.phMax, t.ecMin, t.ecMax]
  );
  targetCount++;
}
console.log(`  ✓ ${targetCount} weekly targets inseridos`);

// ─── 15. ALERTAS ─────────────────────────────────────────────────────────────
// Schema: tentId, alertType (OUT_OF_RANGE|SAFETY_LIMIT|TREND),
//         metric (TEMP|RH|PPFD|PH), logDate, turn, value, message,
//         status (NEW|SEEN)

console.log("\n🚨 Inserindo alertas...");
const alertsData = [
  { tentId: tentBId, type: "OUT_OF_RANGE", metric: "TEMP", day: 9,  turn: "AM", value: 27.8, message: "Temperatura acima do ideal (27.8°C). Target: 22-26°C",       status: "SEEN" },
  { tentId: tentCId, type: "OUT_OF_RANGE", metric: "RH",   day: 6,  turn: "PM", value: 36.2, message: "Umidade abaixo do ideal (36.2%). Target: 40-50%",             status: "SEEN" },
  { tentId: tentCId, type: "SAFETY_LIMIT", metric: "TEMP", day: 2,  turn: "AM", value: 29.1, message: "Temperatura crítica (29.1°C). Limite de segurança: 28°C",     status: "NEW"  },
  { tentId: tentBId, type: "OUT_OF_RANGE", metric: "PPFD", day: 1,  turn: "AM", value: 380,  message: "PPFD abaixo do target (380 µmol/m²/s). Target: 400-500",      status: "NEW"  },
  { tentId: tentAId, type: "OUT_OF_RANGE", metric: "RH",   day: 3,  turn: "PM", value: 72.5, message: "Umidade alta na manutenção (72.5%). Target: 55-65%",          status: "SEEN" },
];
for (const a of alertsData) {
  await conn.execute(
    "INSERT INTO alerts (tentId, alertType, metric, logDate, turn, value, message, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [a.tentId, a.type, a.metric, mysqlDate(daysAgo(a.day, 8)), a.turn, a.value, a.message, a.status]
  );
}
console.log(`  ✓ ${alertsData.length} alertas inseridos`);

// ─── 16. CONFIGURAÇÕES DE ALERTA ─────────────────────────────────────────────
// Schema: tentId, alertsEnabled, tempEnabled, rhEnabled, ppfdEnabled, phEnabled,
//         tempMargin, rhMargin, ppfdMargin, phMargin

console.log("\n⚙️  Inserindo configurações de alerta...");
for (const tentId of [tentAId, tentBId, tentCId]) {
  await conn.execute(
    "INSERT INTO alertSettings (tentId, alertsEnabled, tempEnabled, rhEnabled, ppfdEnabled, phEnabled, tempMargin, rhMargin, ppfdMargin, phMargin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [tentId, 1, 1, 1, 1, 1, "2.0", "5.0", 50, "0.2"]
  );
}
console.log("  ✓ Configurações de alerta inseridas para 3 estufas");

// ─── 17. PRESETS DE FERTILIZAÇÃO ─────────────────────────────────────────────
// Schema: name, waterVolume, targetEC, phase (VEGA|FLORA), weekNumber,
//         irrigationsPerWeek, calculationMode (per-irrigation|per-week)

console.log("\n🧪 Inserindo presets de fertilização...");
const fertPresets = [
  { name: "Vega Semana 2-3 (5L)",    waterVolume: 5.0, targetEC: 1.2, phase: "VEGA",  weekNumber: 3, irrigationsPerWeek: 3, calculationMode: "per-irrigation" },
  { name: "Flora Semana 3-4 (5L)",   waterVolume: 5.0, targetEC: 1.5, phase: "FLORA", weekNumber: 4, irrigationsPerWeek: 4, calculationMode: "per-irrigation" },
  { name: "Flora Semana 5-6 (5L)",   waterVolume: 5.0, targetEC: 1.7, phase: "FLORA", weekNumber: 5, irrigationsPerWeek: 4, calculationMode: "per-irrigation" },
  { name: "Flora Semana 7-8 (5L)",   waterVolume: 5.0, targetEC: 1.8, phase: "FLORA", weekNumber: 7, irrigationsPerWeek: 5, calculationMode: "per-irrigation" },
  { name: "Flush Pré-Colheita (5L)", waterVolume: 5.0, targetEC: 0.3, phase: "FLORA", weekNumber: 8, irrigationsPerWeek: 5, calculationMode: "per-irrigation" },
];
for (const fp of fertPresets) {
  await conn.execute(
    "INSERT INTO fertilizationPresets (name, waterVolume, targetEC, phase, weekNumber, irrigationsPerWeek, calculationMode) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [fp.name, fp.waterVolume, fp.targetEC, fp.phase, fp.weekNumber, fp.irrigationsPerWeek, fp.calculationMode]
  );
}
console.log(`  ✓ ${fertPresets.length} presets de fertilização inseridos`);

// ─── 18. PRESETS DE REGA ─────────────────────────────────────────────────────
// Schema: name, plantCount, potSize, targetRunoff, phase, weekNumber

console.log("\n💧 Inserindo presets de rega...");
const waterPresets = [
  { name: "Vega 3 plantas (5L)",  plantCount: 3, potSize: 5.0, targetRunoff: 20, phase: "VEGA",  weekNumber: 3 },
  { name: "Flora 3 plantas (5L)", plantCount: 3, potSize: 5.0, targetRunoff: 20, phase: "FLORA", weekNumber: 5 },
  { name: "Flush 3 plantas (5L)", plantCount: 3, potSize: 5.0, targetRunoff: 30, phase: "FLORA", weekNumber: 8 },
];
for (const wp of waterPresets) {
  await conn.execute(
    "INSERT INTO wateringPresets (name, plantCount, potSize, targetRunoff, phase, weekNumber) VALUES (?, ?, ?, ?, ?, ?)",
    [wp.name, wp.plantCount, wp.potSize, wp.targetRunoff, wp.phase, wp.weekNumber]
  );
}
console.log(`  ✓ ${waterPresets.length} presets de rega inseridos`);

// ─── 19. RECEITAS ────────────────────────────────────────────────────────────
// Schema: tentId, logDate, turn, volumeTotalL, ecTarget, phTarget, productsJson, notes

console.log("\n📋 Inserindo receitas de fertilização...");
let recipeCount = 0;
for (let day = 5; day >= 0; day--) {
  const logDate = daysAgo(day);
  const vegaProducts = JSON.stringify([
    { name: "Flora Micro", mlPerL: 1.5, totalMl: 7.5 },
    { name: "Flora Grow",  mlPerL: 2.5, totalMl: 12.5 },
    { name: "Flora Bloom", mlPerL: 0.5, totalMl: 2.5 },
    { name: "CalMag",      mlPerL: 1.0, totalMl: 5.0 },
  ]);
  await conn.execute(
    "INSERT INTO recipes (tentId, logDate, turn, volumeTotalL, ecTarget, phTarget, productsJson, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [tentBId, mysqlDate(logDate), "AM", 5.0, 1.2, 5.9, vegaProducts, day === 5 ? "Receita padrão vega semana 3" : null]
  );
  recipeCount++;

  const floraProducts = JSON.stringify([
    { name: "Flora Micro", mlPerL: 1.5, totalMl: 7.5 },
    { name: "Flora Grow",  mlPerL: 1.0, totalMl: 5.0 },
    { name: "Flora Bloom", mlPerL: 3.0, totalMl: 15.0 },
    { name: "CalMag",      mlPerL: 1.5, totalMl: 7.5 },
    { name: "PK 13/14",    mlPerL: 1.0, totalMl: 5.0 },
  ]);
  await conn.execute(
    "INSERT INTO recipes (tentId, logDate, turn, volumeTotalL, ecTarget, phTarget, productsJson, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [tentCId, mysqlDate(logDate), "AM", 5.0, 1.7, 6.0, floraProducts, day === 5 ? "Receita padrão flora semana 5" : null]
  );
  recipeCount++;
}
console.log(`  ✓ ${recipeCount} receitas inseridas`);

// ─── 20. TEMPLATES DE RECEITAS ───────────────────────────────────────────────
// Schema: name, phase, weekNumber, volumeTotalL, ecTarget, phTarget, productsJson, notes

console.log("\n📚 Inserindo templates de receitas...");
const recipeTemplatesData = [
  {
    name: "Vega Base (GHE)", phase: "VEGA", weekNumber: 3, ecTarget: 1.2, phTarget: 5.9,
    productsJson: JSON.stringify([
      { name: "Flora Micro", mlPerL: 1.5 }, { name: "Flora Grow", mlPerL: 2.5 },
      { name: "Flora Bloom", mlPerL: 0.5 }, { name: "CalMag",     mlPerL: 1.0 },
    ]),
    notes: "Receita base para vegetação semana 2-4",
  },
  {
    name: "Flora Pico (GHE)", phase: "FLORA", weekNumber: 5, ecTarget: 1.7, phTarget: 6.0,
    productsJson: JSON.stringify([
      { name: "Flora Micro", mlPerL: 1.5 }, { name: "Flora Grow",  mlPerL: 1.0 },
      { name: "Flora Bloom", mlPerL: 3.0 }, { name: "CalMag",      mlPerL: 1.5 },
      { name: "PK 13/14",   mlPerL: 1.0 },
    ]),
    notes: "Receita de pico de floração semana 4-6",
  },
  {
    name: "Flush Final", phase: "FLORA", weekNumber: 8, ecTarget: 0.3, phTarget: 6.2,
    productsJson: JSON.stringify([{ name: "Água pura", mlPerL: 0 }]),
    notes: "Flush com água pura para limpar sais antes da colheita",
  },
];
let templateCount = 0;
for (const rt of recipeTemplatesData) {
  await conn.execute(
    "INSERT INTO recipeTemplates (name, phase, weekNumber, ecTarget, phTarget, productsJson, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [rt.name, rt.phase, rt.weekNumber, rt.ecTarget, rt.phTarget, rt.productsJson, rt.notes]
  );
  templateCount++;
}
console.log(`  ✓ ${templateCount} templates de receitas inseridos`);

// ─── 21. TEMPLATES DE TAREFAS ────────────────────────────────────────────────
// Schema: context (TENT_A|TENT_BC), phase, weekNumber, title, description

console.log("\n✅ Inserindo templates de tarefas...");
const taskTemplatesData = [
  // MANUTENÇÃO
  { context: "TENT_A", phase: "MAINTENANCE", weekNumber: null, title: "Regar plantas-mãe",          description: "Regar com EC 1.0-1.2 para manter crescimento vegetativo" },
  { context: "TENT_A", phase: "MAINTENANCE", weekNumber: null, title: "Fazer clones",               description: "Cortar e enraizar clones das plantas-mãe" },
  { context: "TENT_A", phase: "MAINTENANCE", weekNumber: null, title: "Podar plantas-mãe",          description: "Remover crescimento excessivo e manter tamanho controlado" },
  { context: "TENT_A", phase: "MAINTENANCE", weekNumber: null, title: "Verificar pH e EC",          description: "pH: 5.8-6.2, EC: 1.0-1.2" },
  // VEGA
  { context: "TENT_BC", phase: "VEGA", weekNumber: 1, title: "Verificar enraizamento",    description: "Confirmar que clones enraizaram bem" },
  { context: "TENT_BC", phase: "VEGA", weekNumber: 1, title: "Primeira rega nutritiva",   description: "EC 0.8-1.0, pH 5.8-6.0" },
  { context: "TENT_BC", phase: "VEGA", weekNumber: 2, title: "Verificar pH e EC",         description: "pH: 5.8-6.2, EC: 1.0-1.2" },
  { context: "TENT_BC", phase: "VEGA", weekNumber: 2, title: "Regar plantas",             description: "Regar com 15-20% de runoff" },
  { context: "TENT_BC", phase: "VEGA", weekNumber: 3, title: "Verificar pH e EC",         description: "pH: 5.8-6.2, EC: 1.2-1.4" },
  { context: "TENT_BC", phase: "VEGA", weekNumber: 3, title: "Regar plantas",             description: "Regar com 20% de runoff" },
  { context: "TENT_BC", phase: "VEGA", weekNumber: 3, title: "Aplicar LST se necessário", description: "Abrir copa para melhor penetração de luz" },
  { context: "TENT_BC", phase: "VEGA", weekNumber: 4, title: "Verificar pH e EC",         description: "pH: 5.8-6.2, EC: 1.2-1.4" },
  { context: "TENT_BC", phase: "VEGA", weekNumber: 4, title: "Regar plantas",             description: "Regar com 20% de runoff" },
  { context: "TENT_BC", phase: "VEGA", weekNumber: 4, title: "Avaliar transição para flora", description: "Verificar se plantas estão prontas para floração" },
  // FLORA
  { context: "TENT_BC", phase: "FLORA", weekNumber: 1,  title: "Confirmar fotoperíodo 12/12",     description: "Verificar timer e ausência de vazamento de luz" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 1,  title: "Ajustar nutrição",                description: "Aumentar Flora Bloom, reduzir Flora Grow. EC: 1.3-1.5" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 2,  title: "Verificar pH e EC",               description: "pH: 6.0-6.2, EC: 1.4-1.6" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 2,  title: "Regar plantas",                   description: "Regar com 20% de runoff" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 2,  title: "Remover folhas baixas",           description: "Desfoliação leve para melhorar circulação de ar" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 3,  title: "Verificar pH e EC",               description: "pH: 6.0-6.2, EC: 1.6-1.8" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 3,  title: "Regar plantas",                   description: "Regar com 20% de runoff" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 4,  title: "Verificar pH e EC",               description: "pH: 6.0-6.2, EC: 1.8-2.0" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 4,  title: "Regar plantas",                   description: "Regar com 20% de runoff" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 4,  title: "Verificar tricomas",              description: "Inspecionar tricomas com lupa (60×) para monitorar maturação" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 5,  title: "Verificar pH e EC",               description: "pH: 6.0-6.2, EC: 1.8-2.0" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 5,  title: "Regar plantas",                   description: "Regar com 20% de runoff" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 5,  title: "Verificar tricomas",              description: "Monitorar maturação dos tricomas" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 5,  title: "Verificar pragas e mofo",         description: "Inspecionar buds para detectar mofo ou pragas" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 6,  title: "Verificar pH e EC",               description: "pH: 6.0-6.2, EC: 1.8-2.0" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 6,  title: "Regar plantas",                   description: "Regar com 20% de runoff" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 6,  title: "Verificar tricomas diariamente",  description: "Monitorar tricomas para decidir ponto de colheita" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 7,  title: "Verificar pH e EC",               description: "pH: 6.0-6.2, EC: 1.6-1.8 (reduzir nutrientes)" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 7,  title: "Regar plantas",                   description: "Regar com 20% de runoff" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 7,  title: "Verificar tricomas",              description: "Decidir ponto de colheita (70-90% leitosos)" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 8,  title: "Iniciar flush",                   description: "Regar apenas com água pH ajustado (sem nutrientes)" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 8,  title: "Regar com água pura",             description: "Flush com 30% de runoff para limpar sais" },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 8,  title: "Preparar para colheita",          description: "Organizar ferramentas e espaço de secagem" },
];
let taskTemplateCount = 0;
for (const tt of taskTemplatesData) {
  await conn.execute(
    "INSERT INTO taskTemplates (context, phase, weekNumber, title, description) VALUES (?, ?, ?, ?, ?)",
    [tt.context, tt.phase, tt.weekNumber, tt.title, tt.description]
  );
  taskTemplateCount++;
}
console.log(`  ✓ ${taskTemplateCount} templates de tarefas inseridos`);

// ─── 22. INSTÂNCIAS DE TAREFAS ───────────────────────────────────────────────
// Schema: tentId, taskTemplateId, occurrenceDate, isDone, completedAt, notes

console.log("\n📋 Inserindo instâncias de tarefas...");
const [vegaTemplates]  = await conn.execute("SELECT id FROM taskTemplates WHERE context = 'TENT_BC' AND phase = 'VEGA'  AND weekNumber = 3");
const [floraTemplates] = await conn.execute("SELECT id FROM taskTemplates WHERE context = 'TENT_BC' AND phase = 'FLORA' AND weekNumber = 5");
const [maintTemplates] = await conn.execute("SELECT id FROM taskTemplates WHERE context = 'TENT_A'  AND phase = 'MAINTENANCE'");

let taskCount = 0;
const weekEnd = mysqlDate(daysAgo(0));

for (const tmpl of vegaTemplates) {
  const isDone = Math.random() > 0.4 ? 1 : 0;
  await conn.execute(
    "INSERT INTO taskInstances (tentId, taskTemplateId, occurrenceDate, isDone, completedAt) VALUES (?, ?, ?, ?, ?)",
    [tentBId, tmpl.id, weekEnd, isDone, isDone ? mysqlDate(daysAgo(randInt(0, 3))) : null]
  );
  taskCount++;
}
for (const tmpl of floraTemplates) {
  const isDone = Math.random() > 0.3 ? 1 : 0;
  await conn.execute(
    "INSERT INTO taskInstances (tentId, taskTemplateId, occurrenceDate, isDone, completedAt) VALUES (?, ?, ?, ?, ?)",
    [tentCId, tmpl.id, weekEnd, isDone, isDone ? mysqlDate(daysAgo(randInt(0, 3))) : null]
  );
  taskCount++;
}
for (const tmpl of maintTemplates) {
  const isDone = Math.random() > 0.5 ? 1 : 0;
  await conn.execute(
    "INSERT INTO taskInstances (tentId, taskTemplateId, occurrenceDate, isDone, completedAt) VALUES (?, ?, ?, ?, ?)",
    [tentAId, tmpl.id, weekEnd, isDone, isDone ? mysqlDate(daysAgo(randInt(0, 3))) : null]
  );
  taskCount++;
}
console.log(`  ✓ ${taskCount} instâncias de tarefas inseridas`);

// ─── RESUMO ───────────────────────────────────────────────────────────────────

await conn.end();
console.log("\n═══════════════════════════════════════════");
console.log("✅ SEED COMPLETO!");
console.log("═══════════════════════════════════════════");
console.log(`  🌿 ${strainsData.length} strains`);
console.log(`  🏠 3 estufas (A Manutenção, B Vega, C Flora)`);
console.log(`  🔄 2 ciclos ativos`);
console.log(`  🌱 8 plantas (2 mãe + 3 vega + 3 flora)`);
console.log(`  📊 ${logCount} logs diários`);
console.log(`  💊 ${healthCount} registros de saúde`);
console.log(`  🔬 ${trichomeCount} registros de tricomas`);
console.log(`  🌀 ${lstCount} registros de LST`);
console.log(`  📝 ${obsCount} observações`);
console.log(`  💧 ${runoffCount} registros de runoff por planta`);
console.log(`  🎯 ${targetCount} weekly targets`);
console.log(`  🚨 ${alertsData.length} alertas`);
console.log(`  🧪 ${fertPresets.length} presets de fertilização`);
console.log(`  💧 ${waterPresets.length} presets de rega`);
console.log(`  📋 ${recipeCount} receitas`);
console.log(`  📚 ${templateCount} templates de receitas`);
console.log(`  ✅ ${taskTemplateCount} templates de tarefas`);
console.log(`  📋 ${taskCount} instâncias de tarefas`);
console.log("═══════════════════════════════════════════");
