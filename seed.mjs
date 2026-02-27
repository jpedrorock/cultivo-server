/**
 * Seed Script - App Cultivo
 * Simula 2 semanas de uso real com 3 estufas, 8 strains, plantas e registros diários
 *
 * Estrutura:
 * - Estufa Manutenção (75x45x90): 2 plantas-mãe (Orange Punch + 24K)
 * - Estufa Vega (80x80x160): 3 plantas Orange Punch (semana 2 de vega)
 * - Estufa Flora (120x120x200): 3 plantas 24K (semana 5 de flora)
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

// ─── Helpers ────────────────────────────────────────────────────────────────
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(8, 0, 0, 0);
  return d;
};

const rand = (min, max, dec = 1) => {
  const v = Math.random() * (max - min) + min;
  return parseFloat(v.toFixed(dec));
};

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// ─── 1. LIMPAR BANCO ────────────────────────────────────────────────────────
console.log("🗑️  Limpando banco de dados...");

const tables = [
  "wateringApplications",
  "nutrientApplications",
  "notificationSettings",
  "alertPreferences",
  "plantLSTLogs",
  "plantTrichomeLogs",
  "plantHealthLogs",
  "plantRunoffLogs",
  "plantPhotos",
  "plantObservations",
  "plantTentHistory",
  "plants",
  "taskInstances",
  "taskTemplates",
  "alertHistory",
  "alertSettings",
  "alerts",
  "safetyLimits",
  "phaseAlertMargins",
  "notificationHistory",
  "recipes",
  "recipeTemplates",
  "dailyLogs",
  "weeklyTargets",
  "tentAState",
  "cloningEvents",
  "cycles",
  "fertilizationPresets",
  "wateringPresets",
  "tents",
  "strains",
];

await db.query("SET FOREIGN_KEY_CHECKS = 0");
for (const t of tables) {
  await db.query(`TRUNCATE TABLE \`${t}\``);
  console.log(`  ✓ ${t}`);
}
await db.query("SET FOREIGN_KEY_CHECKS = 1");

// ─── 2. STRAINS ─────────────────────────────────────────────────────────────
console.log("\n🌿 Inserindo strains...");

const strainsData = [
  {
    name: "Orange Punch",
    description:
      "Híbrida indica-dominante com aromas cítricos intensos de laranja e frutas tropicais. Produção acima da média, trichomas abundantes. Excelente para clonagem.",
    vegaWeeks: 4,
    floraWeeks: 9,
  },
  {
    name: "24K",
    description:
      "Linhagem premium com notas de terra, pinho e especiarias. Alta potência e resina. Ciclo de flora longo mas recompensador. Boa estrutura de colas.",
    vegaWeeks: 5,
    floraWeeks: 10,
  },
  {
    name: "Gorilla Glue #4",
    description:
      "Híbrida com produção massiva de resina. Aromas de chocolate, café e diesel. Plantas compactas com colas densas. Ideal para extração.",
    vegaWeeks: 4,
    floraWeeks: 9,
  },
  {
    name: "Blue Dream",
    description:
      "Sativa-dominante clássica. Efeito cerebral e energético. Aromas de mirtilo e baunilha. Crescimento vigoroso, requer LST.",
    vegaWeeks: 5,
    floraWeeks: 9,
  },
  {
    name: "Girl Scout Cookies",
    description:
      "Híbrida equilibrada com sabor de doce e terra. Produção moderada mas qualidade excepcional. Trichomas abundantes.",
    vegaWeeks: 4,
    floraWeeks: 9,
  },
  {
    name: "Wedding Cake",
    description:
      "Indica-dominante com sabor de baunilha e terra. Crescimento compacto, ideal para espaços menores. Alta concentração de resina.",
    vegaWeeks: 4,
    floraWeeks: 8,
  },
  {
    name: "Zkittlez",
    description:
      "Indica com aromas de frutas tropicais e doces. Plantas baixas e compactas. Excelente para iniciantes. Colheita precoce.",
    vegaWeeks: 4,
    floraWeeks: 8,
  },
  {
    name: "Runtz",
    description:
      "Híbrida premium com sabor de balas de frutas. Alta potência. Crescimento moderado com boa resposta ao treinamento LST.",
    vegaWeeks: 4,
    floraWeeks: 9,
  },
];

const strainIds = {};
for (const s of strainsData) {
  const [res] = await db.query(
    "INSERT INTO strains (name, description, vegaWeeks, floraWeeks, isActive) VALUES (?, ?, ?, ?, 1)",
    [s.name, s.description, s.vegaWeeks, s.floraWeeks]
  );
  strainIds[s.name] = res.insertId;
  console.log(`  ✓ ${s.name} (id=${res.insertId})`);
}

// ─── 3. ESTUFAS ─────────────────────────────────────────────────────────────
console.log("\n🏠 Inserindo estufas...");

// Estufa Manutenção: 75x45x90 cm → volume = 0.075 * 0.45 * 0.90 = 0.030375 m³
const volMaint = (75 * 45 * 90) / 1_000_000;
const [tentMaint] = await db.query(
  "INSERT INTO tents (name, category, width, depth, height, volume, powerW) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ["Manutenção", "MAINTENANCE", 75, 45, 90, volMaint.toFixed(3), 100]
);
const tentMaintId = tentMaint.insertId;

// Estufa Vega: 80x80x160 cm
const volVega = (80 * 80 * 160) / 1_000_000;
const [tentVega] = await db.query(
  "INSERT INTO tents (name, category, width, depth, height, volume, powerW) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ["Vega", "VEGA", 80, 80, 160, volVega.toFixed(3), 200]
);
const tentVegaId = tentVega.insertId;

// Estufa Flora: 120x120x200 cm
const volFlora = (120 * 120 * 200) / 1_000_000;
const [tentFlora] = await db.query(
  "INSERT INTO tents (name, category, width, depth, height, volume, powerW) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ["Flora", "FLORA", 120, 120, 200, volFlora.toFixed(3), 480]
);
const tentFloraId = tentFlora.insertId;

console.log(`  ✓ Manutenção (id=${tentMaintId}) - 75x45x90`);
console.log(`  ✓ Vega (id=${tentVegaId}) - 80x80x160`);
console.log(`  ✓ Flora (id=${tentFloraId}) - 120x120x200`);

// ─── 4. TENTASTATE (Manutenção) ─────────────────────────────────────────────
await db.query(
  "INSERT INTO tentAState (tentId, mode) VALUES (?, 'MAINTENANCE')",
  [tentMaintId]
);

// ─── 5. CICLOS ──────────────────────────────────────────────────────────────
console.log("\n🔄 Inserindo ciclos...");

// Ciclo Vega: iniciado há 14 dias (semana 2)
const [cycleVega] = await db.query(
  "INSERT INTO cycles (tentId, strainId, startDate, status) VALUES (?, ?, ?, 'ACTIVE')",
  [tentVegaId, strainIds["Orange Punch"], daysAgo(14)]
);
const cycleVegaId = cycleVega.insertId;

// Ciclo Flora: iniciado há 35 dias (semana 5 de flora, flora começou há 35 dias, vega foi 5 semanas antes)
const floraStart = daysAgo(35);
const [cycleFlora] = await db.query(
  "INSERT INTO cycles (tentId, strainId, startDate, floraStartDate, status) VALUES (?, ?, ?, ?, 'ACTIVE')",
  [tentFloraId, strainIds["24K"], daysAgo(70), floraStart]
);
const cycleFloraId = cycleFlora.insertId;

console.log(`  ✓ Ciclo Vega (id=${cycleVegaId}) - Orange Punch, semana 2`);
console.log(`  ✓ Ciclo Flora (id=${cycleFloraId}) - 24K, semana 5 de flora`);

// ─── 6. PLANTAS ─────────────────────────────────────────────────────────────
console.log("\n🌱 Inserindo plantas...");

// Plantas-mãe na Manutenção
const [pm1] = await db.query(
  `INSERT INTO plants (name, code, strainId, currentTentId, plantStage, status, notes, createdAt)
   VALUES (?, ?, ?, ?, 'PLANT', 'ACTIVE', ?, ?)`,
  [
    "Orange Punch Mãe",
    "OP-MAE-01",
    strainIds["Orange Punch"],
    tentMaintId,
    "Planta-mãe principal. Estrutura excelente, múltiplos pontos de clonagem disponíveis.",
    daysAgo(90),
  ]
);
const plantMae1Id = pm1.insertId;

const [pm2] = await db.query(
  `INSERT INTO plants (name, code, strainId, currentTentId, plantStage, status, notes, createdAt)
   VALUES (?, ?, ?, ?, 'PLANT', 'ACTIVE', ?, ?)`,
  [
    "24K Mãe",
    "24K-MAE-01",
    strainIds["24K"],
    tentMaintId,
    "Planta-mãe robusta. Crescimento vigoroso, ideal para clonagem em massa.",
    daysAgo(85),
  ]
);
const plantMae2Id = pm2.insertId;

// Plantas Vega (Orange Punch) - clones da mãe, semana 2
const vegaPlantIds = [];
const vegaPlantNames = ["Orange Punch #1", "Orange Punch #2", "Orange Punch #3"];
const vegaCodes = ["OP-V-01", "OP-V-02", "OP-V-03"];
const vegaNotes = [
  "Clone vigoroso. Raízes bem desenvolvidas. Crescimento uniforme.",
  "Desenvolvimento ligeiramente mais lento. Monitorar. LST iniciado.",
  "Melhor clone do lote. Crescimento excelente, folhagem densa.",
];

for (let i = 0; i < 3; i++) {
  const [p] = await db.query(
    `INSERT INTO plants (name, code, strainId, currentTentId, plantStage, status, notes, createdAt)
     VALUES (?, ?, ?, ?, 'CLONE', 'ACTIVE', ?, ?)`,
    [vegaPlantNames[i], vegaCodes[i], strainIds["Orange Punch"], tentVegaId, vegaNotes[i], daysAgo(14)]
  );
  vegaPlantIds.push(p.insertId);
}

// Plantas Flora (24K) - semana 5 de flora
const floraPlantIds = [];
const floraPlantNames = ["24K #1", "24K #2", "24K #3"];
const floraCodes = ["24K-F-01", "24K-F-02", "24K-F-03"];
const floraNotes = [
  "Desenvolvimento excelente. Colas bem formadas. Trichomas iniciando.",
  "Boa produção. Algumas folhas amarelando (normal semana 5). Defoliação feita.",
  "Planta mais alta do lote. Suporte adicionado. Colas densas.",
];

for (let i = 0; i < 3; i++) {
  const [p] = await db.query(
    `INSERT INTO plants (name, code, strainId, currentTentId, plantStage, status, notes, createdAt)
     VALUES (?, ?, ?, ?, 'PLANT', 'ACTIVE', ?, ?)`,
    [floraPlantNames[i], floraCodes[i], strainIds["24K"], tentFloraId, floraNotes[i], daysAgo(70)]
  );
  floraPlantIds.push(p.insertId);
}

console.log(`  ✓ Orange Punch Mãe (id=${plantMae1Id})`);
console.log(`  ✓ 24K Mãe (id=${plantMae2Id})`);
console.log(`  ✓ Vega plants: ${vegaPlantIds.join(", ")}`);
console.log(`  ✓ Flora plants: ${floraPlantIds.join(", ")}`);

// ─── 7. HISTÓRICO DE MOVIMENTAÇÃO DAS PLANTAS ───────────────────────────────
console.log("\n📦 Inserindo histórico de movimentação...");

// Plantas vega vieram da manutenção (clones)
for (const pid of vegaPlantIds) {
  await db.query(
    "INSERT INTO plantTentHistory (plantId, fromTentId, toTentId, movedAt, reason) VALUES (?, ?, ?, ?, ?)",
    [pid, tentMaintId, tentVegaId, daysAgo(14), "Clone enraizado transferido para Vega"]
  );
}

// Plantas flora vieram da vega
for (const pid of floraPlantIds) {
  await db.query(
    "INSERT INTO plantTentHistory (plantId, fromTentId, toTentId, movedAt, reason) VALUES (?, ?, ?, ?, ?)",
    [pid, tentVegaId, tentFloraId, daysAgo(35), "Transferência para floração após 5 semanas de vega"]
  );
}

// ─── 8. OBSERVAÇÕES DAS PLANTAS ─────────────────────────────────────────────
console.log("\n📝 Inserindo observações das plantas...");

// Plantas-mãe
const maePlant1Obs = [
  [daysAgo(7), "Podada levemente para estimular brotamento lateral. 4 pontos de clone identificados."],
  [daysAgo(3), "Aspecto saudável, folhagem verde escura. Raízes visíveis no fundo do vaso."],
  [daysAgo(1), "Pronta para nova rodada de clonagem. Estimativa: 6-8 clones viáveis."],
];

for (const [date, content] of maePlant1Obs) {
  await db.query(
    "INSERT INTO plantObservations (plantId, observationDate, content) VALUES (?, ?, ?)",
    [plantMae1Id, date, content]
  );
}

const maePlant2Obs = [
  [daysAgo(10), "Crescimento vigoroso. Adicionado suporte para galhos laterais."],
  [daysAgo(5), "Leve amarelamento nas folhas mais velhas - normal. Ajustado pH da rega."],
  [daysAgo(2), "Recuperada. Cor uniforme, sem sinais de deficiência."],
];

for (const [date, content] of maePlant2Obs) {
  await db.query(
    "INSERT INTO plantObservations (plantId, observationDate, content) VALUES (?, ?, ?)",
    [plantMae2Id, date, content]
  );
}

// Plantas vega
const vegaObs = [
  [
    [daysAgo(12), "Clone enraizado com sucesso. Primeiras folhas verdadeiras aparecendo."],
    [daysAgo(7), "Crescimento acelerado. LST iniciado para abrir o dossel."],
    [daysAgo(2), "Resposta excelente ao LST. 6 pontos de crescimento visíveis."],
  ],
  [
    [daysAgo(12), "Clone enraizou mais devagar. Monitorando de perto."],
    [daysAgo(8), "Crescimento normalizado. Sem sinais de stress."],
    [daysAgo(3), "Desenvolvimento uniforme com as outras. LST aplicado."],
  ],
  [
    [daysAgo(11), "Clone mais vigoroso do lote. Raízes exuberantes."],
    [daysAgo(6), "Crescimento excepcional. Já superou as outras em altura."],
    [daysAgo(1), "Topping realizado para equalizar com as outras plantas."],
  ],
];

for (let i = 0; i < vegaPlantIds.length; i++) {
  for (const [date, content] of vegaObs[i]) {
    await db.query(
      "INSERT INTO plantObservations (plantId, observationDate, content) VALUES (?, ?, ?)",
      [vegaPlantIds[i], date, content]
    );
  }
}

// Plantas flora
const floraObs = [
  [
    [daysAgo(30), "Início da floração. Primeiros pistilos brancos aparecendo."],
    [daysAgo(21), "Semana 2 de flora. Estirão de floração intenso. Suporte adicionado."],
    [daysAgo(14), "Semana 3. Formação de colas visível. Cheiro intenso."],
    [daysAgo(7), "Semana 4. Colas engrossando. Trichomas visíveis a olho nu."],
    [daysAgo(2), "Semana 5. Desenvolvimento excelente. Estimativa de colheita em 5 semanas."],
  ],
  [
    [daysAgo(30), "Início da floração. Estrutura compacta, boa para o espaço."],
    [daysAgo(21), "Semana 2. Defoliação leve para melhorar penetração de luz."],
    [daysAgo(14), "Semana 3. Amarelamento leve nas folhas velhas - normal."],
    [daysAgo(7), "Semana 4. Recuperada. Colas bem formadas."],
    [daysAgo(1), "Semana 5. Trichomas leitosos iniciando. Boa evolução."],
  ],
  [
    [daysAgo(30), "Início da floração. Planta mais alta, precisou de suporte extra."],
    [daysAgo(21), "Semana 2. Estirão intenso, +15cm. Ajustado altura da luminária."],
    [daysAgo(14), "Semana 3. Colas densas e longas. Cheiro de terra e pinho."],
    [daysAgo(7), "Semana 4. Maior cola do lote. Estimativa de 60g+ seca."],
    [daysAgo(2), "Semana 5. Trichomas abundantes. Candidata à melhor planta do ciclo."],
  ],
];

for (let i = 0; i < floraPlantIds.length; i++) {
  for (const [date, content] of floraObs[i]) {
    await db.query(
      "INSERT INTO plantObservations (plantId, observationDate, content) VALUES (?, ?, ?)",
      [floraPlantIds[i], date, content]
    );
  }
}

// ─── 9. REGISTROS DE SAÚDE DAS PLANTAS ─────────────────────────────────────
console.log("\n💊 Inserindo registros de saúde...");

// Plantas-mãe - saudáveis
await db.query(
  "INSERT INTO plantHealthLogs (plantId, logDate, healthStatus, symptoms, treatment, notes) VALUES (?, ?, ?, ?, ?, ?)",
  [plantMae1Id, daysAgo(7), "HEALTHY", null, null, "Aspecto geral excelente. Sem sinais de pragas ou deficiências."]
);
await db.query(
  "INSERT INTO plantHealthLogs (plantId, logDate, healthStatus, symptoms, treatment, notes) VALUES (?, ?, ?, ?, ?, ?)",
  [plantMae2Id, daysAgo(5), "STRESSED", "Leve clorose nas folhas velhas", "Ajuste de pH para 6.0, adição de quelato de ferro", "Monitorar nas próximas regas."]
);
await db.query(
  "INSERT INTO plantHealthLogs (plantId, logDate, healthStatus, symptoms, treatment, notes) VALUES (?, ?, ?, ?, ?, ?)",
  [plantMae2Id, daysAgo(2), "RECOVERING", null, null, "Melhora visível após ajuste de pH. Novas folhas com cor normal."]
);

// Plantas vega
await db.query(
  "INSERT INTO plantHealthLogs (plantId, logDate, healthStatus, symptoms, treatment, notes) VALUES (?, ?, ?, ?, ?, ?)",
  [vegaPlantIds[0], daysAgo(5), "HEALTHY", null, null, "Desenvolvimento normal. Sem problemas."]
);
await db.query(
  "INSERT INTO plantHealthLogs (plantId, logDate, healthStatus, symptoms, treatment, notes) VALUES (?, ?, ?, ?, ?, ?)",
  [vegaPlantIds[1], daysAgo(8), "STRESSED", "Crescimento lento, folhas levemente curvadas para baixo", "Reduzido volume de rega, verificado drenagem", "Possível overwatering. Aguardar secagem do substrato."]
);
await db.query(
  "INSERT INTO plantHealthLogs (plantId, logDate, healthStatus, symptoms, treatment, notes) VALUES (?, ?, ?, ?, ?, ?)",
  [vegaPlantIds[1], daysAgo(3), "RECOVERING", null, null, "Recuperando bem após ajuste de rega."]
);
await db.query(
  "INSERT INTO plantHealthLogs (plantId, logDate, healthStatus, symptoms, treatment, notes) VALUES (?, ?, ?, ?, ?, ?)",
  [vegaPlantIds[2], daysAgo(4), "HEALTHY", null, null, "Planta mais vigorosa do lote. Excelente saúde."]
);

// Plantas flora
await db.query(
  "INSERT INTO plantHealthLogs (plantId, logDate, healthStatus, symptoms, treatment, notes) VALUES (?, ?, ?, ?, ?, ?)",
  [floraPlantIds[0], daysAgo(10), "HEALTHY", null, null, "Floração excelente. Sem problemas."]
);
await db.query(
  "INSERT INTO plantHealthLogs (plantId, logDate, healthStatus, symptoms, treatment, notes) VALUES (?, ?, ?, ?, ?, ?)",
  [floraPlantIds[1], daysAgo(14), "STRESSED", "Clorose internerval nas folhas medianas - deficiência de magnésio", "Aplicado CalMag foliar 2ml/L + ajuste de EC para 1.8", "Comum na semana 3-4 de flora. Monitorar."]
);
await db.query(
  "INSERT INTO plantHealthLogs (plantId, logDate, healthStatus, symptoms, treatment, notes) VALUES (?, ?, ?, ?, ?, ?)",
  [floraPlantIds[1], daysAgo(7), "RECOVERING", null, null, "Melhora após suplementação de CalMag. Novas folhas normais."]
);
await db.query(
  "INSERT INTO plantHealthLogs (plantId, logDate, healthStatus, symptoms, treatment, notes) VALUES (?, ?, ?, ?, ?, ?)",
  [floraPlantIds[2], daysAgo(5), "HEALTHY", null, null, "Melhor planta do ciclo. Desenvolvimento excepcional."]
);

// ─── 10. LOGS DIÁRIOS (14 dias para cada estufa) ────────────────────────────
console.log("\n📊 Inserindo logs diários (14 dias × 3 estufas × 2 turnos)...");

// Parâmetros por estufa/fase
const tentParams = {
  [tentMaintId]: {
    phase: "MAINTENANCE",
    tempAM: [22, 25],
    tempPM: [24, 27],
    rhAM: [55, 65],
    rhPM: [50, 60],
    ppfd: [200, 300],
    ph: [5.8, 6.2],
    ec: [0.8, 1.2],
    wateringVol: 400,
    runoffPct: [15, 25],
  },
  [tentVegaId]: {
    phase: "VEGA",
    tempAM: [23, 26],
    tempPM: [25, 28],
    rhAM: [60, 70],
    rhPM: [55, 65],
    ppfd: [400, 600],
    ph: [5.8, 6.2],
    ec: [1.2, 1.6],
    wateringVol: 600,
    runoffPct: [15, 25],
  },
  [tentFloraId]: {
    phase: "FLORA",
    tempAM: [22, 25],
    tempPM: [24, 27],
    rhAM: [45, 55],
    rhPM: [40, 50],
    ppfd: [700, 900],
    ph: [6.0, 6.5],
    ec: [1.6, 2.0],
    wateringVol: 1200,
    runoffPct: [15, 25],
  },
};

for (const [tentId, params] of Object.entries(tentParams)) {
  let logCount = 0;
  for (let day = 14; day >= 1; day--) {
    const logDate = daysAgo(day);

    for (const turn of ["AM", "PM"]) {
      const isAM = turn === "AM";
      const temp = rand(
        isAM ? params.tempAM[0] : params.tempPM[0],
        isAM ? params.tempAM[1] : params.tempPM[1]
      );
      const rh = rand(
        isAM ? params.rhAM[0] : params.rhPM[0],
        isAM ? params.rhAM[1] : params.rhPM[1]
      );
      const ppfd = randInt(params.ppfd[0], params.ppfd[1]);
      const ph = rand(params.ph[0], params.ph[1]);
      const ec = rand(params.ec[0], params.ec[1], 2);
      const wateringVol = isAM ? params.wateringVol : 0;
      const runoffPct = rand(params.runoffPct[0], params.runoffPct[1]);
      const runoffCollected = isAM ? Math.round(wateringVol * (runoffPct / 100)) : 0;

      // Introduzir um alerta ocasional (10% de chance de valor fora do range)
      const alertChance = Math.random();
      const finalTemp = alertChance < 0.05 ? temp + rand(3, 5) : temp;
      const finalRh = alertChance > 0.95 ? rh - rand(10, 15) : rh;

      try {
        await db.query(
          `INSERT INTO dailyLogs (tentId, logDate, turn, tempC, rhPct, ppfd, ph, ec, wateringVolume, runoffCollected, runoffPercentage, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tentId,
            logDate,
            turn,
            finalTemp,
            finalRh,
            ppfd,
            ph,
            ec,
            isAM ? wateringVol : null,
            isAM ? runoffCollected : null,
            isAM ? runoffPct.toFixed(2) : null,
            null,
          ]
        );
        logCount++;
      } catch (e) {
        // Ignorar duplicatas
      }
    }
  }
  console.log(`  ✓ Estufa ${tentId}: ${logCount} logs inseridos`);
}

// ─── 11. TEMPLATES DE TAREFAS ───────────────────────────────────────────────
console.log("\n✅ Inserindo templates de tarefas...");

const taskTemplatesData = [
  // MAINTENANCE
  { context: "TENT_A", phase: "MAINTENANCE", weekNumber: null, title: "Verificar plantas-mãe", description: "Inspecionar saúde geral, cor das folhas e sinais de pragas ou deficiências." },
  { context: "TENT_A", phase: "MAINTENANCE", weekNumber: null, title: "Rega das plantas-mãe", description: "Regar com solução nutritiva leve (EC 0.8-1.2). Verificar runoff." },
  { context: "TENT_A", phase: "MAINTENANCE", weekNumber: null, title: "Poda de manutenção", description: "Remover folhas velhas e amareladas. Manter estrutura aberta para circulação de ar." },
  { context: "TENT_A", phase: "MAINTENANCE", weekNumber: null, title: "Limpeza da estufa", description: "Limpar piso, paredes e equipamentos. Verificar filtro de carvão." },
  { context: "TENT_A", phase: "MAINTENANCE", weekNumber: null, title: "Verificar temperatura e umidade", description: "Registrar temp e UR. Ajustar ventilação se necessário." },

  // CLONING
  { context: "TENT_A", phase: "CLONING", weekNumber: 1, title: "Preparar clones", description: "Cortar galhos de 10-15cm das plantas-mãe. Aplicar hormônio de enraizamento. Colocar em cubo de lã de rocha." },
  { context: "TENT_A", phase: "CLONING", weekNumber: 1, title: "Verificar umidade da clonadora", description: "Manter UR acima de 80%. Nebulizar se necessário." },
  { context: "TENT_A", phase: "CLONING", weekNumber: 2, title: "Verificar enraizamento", description: "Inspecionar raízes nos cubos. Clones com raízes brancas estão prontos para transplante." },
  { context: "TENT_A", phase: "CLONING", weekNumber: 2, title: "Selecionar clones viáveis", description: "Separar clones enraizados dos que ainda precisam de mais tempo." },

  // VEGA
  { context: "TENT_BC", phase: "VEGA", weekNumber: 1, title: "Transplante e adaptação", description: "Transplantar clones para vasos definitivos. Rega leve de adaptação." },
  { context: "TENT_BC", phase: "VEGA", weekNumber: 1, title: "Configurar fotoperíodo 18/6", description: "Verificar timer. Confirmar 18h luz / 6h escuro." },
  { context: "TENT_BC", phase: "VEGA", weekNumber: 2, title: "Iniciar LST", description: "Aplicar Low Stress Training para abrir o dossel. Dobrar galhos principais com cuidado." },
  { context: "TENT_BC", phase: "VEGA", weekNumber: 2, title: "Rega com nutrientes vega", description: "Aplicar receita de vega semana 2. EC alvo: 1.4-1.6. pH: 5.8-6.2." },
  { context: "TENT_BC", phase: "VEGA", weekNumber: 3, title: "Topping / FIM", description: "Realizar topping ou FIM para multiplicar pontos de crescimento." },
  { context: "TENT_BC", phase: "VEGA", weekNumber: 3, title: "Verificar raízes e drenagem", description: "Checar se raízes estão saindo pelo fundo. Verificar drenagem adequada." },
  { context: "TENT_BC", phase: "VEGA", weekNumber: 4, title: "Defoliação leve", description: "Remover folhas grandes que bloqueiam luz para brotamentos inferiores." },
  { context: "TENT_BC", phase: "VEGA", weekNumber: 4, title: "Avaliar transição para flora", description: "Verificar se plantas atingiram tamanho adequado para floração." },

  // FLORA
  { context: "TENT_BC", phase: "FLORA", weekNumber: 1, title: "Mudar fotoperíodo para 12/12", description: "Ajustar timer para 12h luz / 12h escuro. Verificar ausência de vazamentos de luz." },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 1, title: "Aumentar EC gradualmente", description: "Iniciar transição para receita de flora. EC alvo: 1.4-1.6." },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 2, title: "Defoliação de flora", description: "Defoliação mais agressiva para maximizar penetração de luz nas colas." },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 2, title: "Adicionar suportes para colas", description: "Instalar rede SCROG ou tutores para suportar peso das colas." },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 3, title: "Verificar primeiros trichomas", description: "Usar lupa para verificar desenvolvimento de trichomas." },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 4, title: "Aumentar EC para pico", description: "EC alvo: 1.8-2.0. Monitorar sinais de queima de nutrientes." },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 5, title: "Avaliação de trichomas", description: "Verificar % de trichomas leitosos vs âmbar. Fotografar para comparação." },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 5, title: "Monitorar umidade (prevenção de mofo)", description: "Manter UR abaixo de 50%. Aumentar ventilação se necessário." },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 6, title: "Flush inicial (opcional)", description: "Avaliar necessidade de flush. Verificar cor das folhas." },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 7, title: "Reduzir nutrientes", description: "Iniciar redução gradual de nutrientes para limpeza final." },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 8, title: "Flush final", description: "Regar apenas com água pH ajustado por 7-10 dias antes da colheita." },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 9, title: "Avaliar ponto de colheita", description: "80%+ trichomas leitosos, 10-20% âmbar = ponto ideal. Confirmar com lupa." },
  { context: "TENT_BC", phase: "FLORA", weekNumber: 10, title: "Colheita", description: "Cortar plantas, remover folhas grandes. Pendurar para secagem." },

  // DRYING
  { context: "TENT_BC", phase: "DRYING", weekNumber: 1, title: "Configurar ambiente de secagem", description: "Temp 18-20°C, UR 55-60%, ventilação indireta. Sem luz direta." },
  { context: "TENT_BC", phase: "DRYING", weekNumber: 1, title: "Verificar secagem diária", description: "Verificar firmeza dos galhos. Sem mofo ou odor estranho." },
  { context: "TENT_BC", phase: "DRYING", weekNumber: 2, title: "Teste de secagem", description: "Galhos devem estalar ao dobrar. Flores não devem estar úmidas ao toque." },
  { context: "TENT_BC", phase: "DRYING", weekNumber: 2, title: "Trim e cura", description: "Realizar trim final. Colocar em potes de vidro para cura. Abrir diariamente por 2 semanas." },
];

const taskTemplateIds = {};
for (const t of taskTemplatesData) {
  const [res] = await db.query(
    "INSERT INTO taskTemplates (context, phase, weekNumber, title, description) VALUES (?, ?, ?, ?, ?)",
    [t.context, t.phase, t.weekNumber, t.title, t.description]
  );
  taskTemplateIds[`${t.phase}_${t.title}`] = res.insertId;
}
console.log(`  ✓ ${taskTemplatesData.length} templates inseridos`);

// ─── 12. INSTÂNCIAS DE TAREFAS (últimas 2 semanas) ──────────────────────────
console.log("\n📋 Inserindo instâncias de tarefas...");

let taskCount = 0;

// Tarefas de MANUTENÇÃO (diárias/semanais nos últimos 14 dias)
const maintTasks = taskTemplatesData.filter((t) => t.phase === "MAINTENANCE");
for (let day = 14; day >= 1; day--) {
  const taskDate = daysAgo(day);
  // Rega e verificação são diárias
  for (const t of maintTasks.filter((t) =>
    ["Verificar temperatura e umidade", "Verificar plantas-mãe"].includes(t.title)
  )) {
    const tid = taskTemplateIds[`${t.phase}_${t.title}`];
    const isDone = day > 1; // Hoje ainda não feito
    try {
      await db.query(
        "INSERT INTO taskInstances (tentId, taskTemplateId, occurrenceDate, isDone, completedAt) VALUES (?, ?, ?, ?, ?)",
        [tentMaintId, tid, taskDate, isDone, isDone ? taskDate : null]
      );
      taskCount++;
    } catch (e) {}
  }
  // Rega a cada 2 dias
  if (day % 2 === 0) {
    const t = maintTasks.find((t) => t.title === "Rega das plantas-mãe");
    if (t) {
      const tid = taskTemplateIds[`${t.phase}_${t.title}`];
      const isDone = day > 2;
      try {
        await db.query(
          "INSERT INTO taskInstances (tentId, taskTemplateId, occurrenceDate, isDone, completedAt) VALUES (?, ?, ?, ?, ?)",
          [tentMaintId, tid, taskDate, isDone, isDone ? taskDate : null]
        );
        taskCount++;
      } catch (e) {}
    }
  }
}
// Poda semanal
const podaTask = maintTasks.find((t) => t.title === "Poda de manutenção");
if (podaTask) {
  const tid = taskTemplateIds[`MAINTENANCE_Poda de manutenção`];
  for (const day of [14, 7]) {
    try {
      await db.query(
        "INSERT INTO taskInstances (tentId, taskTemplateId, occurrenceDate, isDone, completedAt) VALUES (?, ?, ?, ?, ?)",
        [tentMaintId, tid, daysAgo(day), true, daysAgo(day)]
      );
      taskCount++;
    } catch (e) {}
  }
}

// Tarefas de VEGA (semanas 1 e 2)
const vegaTasks = taskTemplatesData.filter((t) => t.phase === "VEGA" && t.weekNumber && t.weekNumber <= 2);
for (const t of vegaTasks) {
  const tid = taskTemplateIds[`VEGA_${t.title}`];
  const taskDay = t.weekNumber === 1 ? 14 : 7;
  const isDone = taskDay > 1;
  try {
    await db.query(
      "INSERT INTO taskInstances (tentId, taskTemplateId, occurrenceDate, isDone, completedAt) VALUES (?, ?, ?, ?, ?)",
      [tentVegaId, tid, daysAgo(taskDay), isDone, isDone ? daysAgo(taskDay) : null]
    );
    taskCount++;
  } catch (e) {}
}

// Rega vega a cada 2 dias
const regaVegaTask = taskTemplatesData.find((t) => t.phase === "VEGA" && t.title === "Rega com nutrientes vega");
if (regaVegaTask) {
  const tid = taskTemplateIds[`VEGA_Rega com nutrientes vega`];
  for (let day = 14; day >= 1; day -= 2) {
    const isDone = day > 2;
    try {
      await db.query(
        "INSERT INTO taskInstances (tentId, taskTemplateId, occurrenceDate, isDone, completedAt) VALUES (?, ?, ?, ?, ?)",
        [tentVegaId, tid, daysAgo(day), isDone, isDone ? daysAgo(day) : null]
      );
      taskCount++;
    } catch (e) {}
  }
}

// Tarefas de FLORA (semanas 3, 4 e 5)
const floraTasks = taskTemplatesData.filter(
  (t) => t.phase === "FLORA" && t.weekNumber && t.weekNumber >= 3 && t.weekNumber <= 5
);
for (const t of floraTasks) {
  const tid = taskTemplateIds[`FLORA_${t.title}`];
  const weekOffset = { 3: 14, 4: 7, 5: 2 };
  const taskDay = weekOffset[t.weekNumber] || 7;
  const isDone = taskDay > 2;
  try {
    await db.query(
      "INSERT INTO taskInstances (tentId, taskTemplateId, occurrenceDate, isDone, completedAt) VALUES (?, ?, ?, ?, ?)",
      [tentFloraId, tid, daysAgo(taskDay), isDone, isDone ? daysAgo(taskDay) : null]
    );
    taskCount++;
  } catch (e) {}
}

// Rega flora a cada 2 dias
const regaFloraTask = taskTemplatesData.find((t) => t.phase === "FLORA" && t.weekNumber === 4 && t.title.includes("EC"));
const regaFloraTask2 = taskTemplatesData.find((t) => t.phase === "FLORA" && t.weekNumber === 5 && t.title.includes("trichomas"));
for (let day = 14; day >= 1; day -= 2) {
  const isDone = day > 2;
  // Usar template de verificação como proxy de rega diária
  const t = taskTemplatesData.find((t) => t.phase === "FLORA" && t.weekNumber === 5 && t.title.includes("umidade"));
  if (t) {
    const tid = taskTemplateIds[`FLORA_${t.title}`];
    try {
      await db.query(
        "INSERT INTO taskInstances (tentId, taskTemplateId, occurrenceDate, isDone, completedAt) VALUES (?, ?, ?, ?, ?)",
        [tentFloraId, tid, daysAgo(day), isDone, isDone ? daysAgo(day) : null]
      );
      taskCount++;
    } catch (e) {}
  }
}

console.log(`  ✓ ${taskCount} instâncias de tarefas inseridas`);

// ─── 13. ALERTAS ────────────────────────────────────────────────────────────
console.log("\n🚨 Inserindo alertas...");

const alertsData = [
  {
    tentId: tentVegaId,
    alertType: "OUT_OF_RANGE",
    metric: "TEMP",
    logDate: daysAgo(10),
    turn: "PM",
    value: 30.5,
    message: "Temperatura acima do limite: 30.5°C (máx recomendado: 28°C)",
    status: "SEEN",
  },
  {
    tentId: tentFloraId,
    alertType: "OUT_OF_RANGE",
    metric: "RH",
    logDate: daysAgo(5),
    turn: "AM",
    value: 62.0,
    message: "Umidade relativa acima do limite em flora: 62% (máx recomendado: 55%). Risco de mofo.",
    status: "SEEN",
  },
  {
    tentId: tentFloraId,
    alertType: "OUT_OF_RANGE",
    metric: "TEMP",
    logDate: daysAgo(2),
    turn: "PM",
    value: 29.2,
    message: "Temperatura ligeiramente elevada: 29.2°C. Verificar ventilação.",
    status: "NEW",
  },
  {
    tentId: tentMaintId,
    alertType: "OUT_OF_RANGE",
    metric: "PH",
    logDate: daysAgo(5),
    turn: "AM",
    value: 6.8,
    message: "pH acima do ideal: 6.8 (ideal: 5.8-6.2). Ajustar na próxima rega.",
    status: "SEEN",
    // Note: PH is valid enum value
  },
];

for (const a of alertsData) {
  await db.query(
    `INSERT INTO alerts (tentId, alertType, metric, logDate, turn, value, message, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [a.tentId, a.alertType, a.metric, a.logDate, a.turn, a.value, a.message, a.status]
  );
}
console.log(`  ✓ ${alertsData.length} alertas inseridos`);

// ─── 14. CONFIGURAÇÕES DE ALERTA ────────────────────────────────────────────
for (const tentId of [tentMaintId, tentVegaId, tentFloraId]) {
  await db.query(
    "INSERT INTO alertSettings (tentId, alertsEnabled) VALUES (?, 1)",
    [tentId]
  );
}

// ─── 15. REGISTROS DE RUNOFF POR PLANTA ─────────────────────────────────────
console.log("\n💧 Inserindo registros de runoff...");

const allActivePlants = [
  ...vegaPlantIds.map((id) => ({ id, volIn: 0.6 })),
  ...floraPlantIds.map((id) => ({ id, volIn: 1.2 })),
];

for (const { id, volIn } of allActivePlants) {
  for (let day = 12; day >= 2; day -= 3) {
    const runoffPct = rand(15, 25);
    const volOut = parseFloat((volIn * (runoffPct / 100)).toFixed(2));
    try {
      await db.query(
        "INSERT INTO plantRunoffLogs (plantId, logDate, volumeIn, volumeOut, runoffPercent, notes) VALUES (?, ?, ?, ?, ?, ?)",
        [id, daysAgo(day), volIn, volOut, runoffPct.toFixed(2), null]
      );
    } catch (e) {}
  }
}
console.log(`  ✓ Runoff logs inseridos para ${allActivePlants.length} plantas`);

// ─── 16. WEEKLY TARGETS (Orange Punch e 24K) ────────────────────────────────
console.log("\n🎯 Inserindo weekly targets...");

// Orange Punch - VEGA semanas 1-4
const opVegaTargets = [
  { week: 1, tempMin: 22, tempMax: 28, rhMin: 60, rhMax: 70, ppfdMin: 300, ppfdMax: 500, photo: "18/6", phMin: 5.8, phMax: 6.2, ecMin: 1.0, ecMax: 1.4 },
  { week: 2, tempMin: 22, tempMax: 28, rhMin: 60, rhMax: 70, ppfdMin: 400, ppfdMax: 600, photo: "18/6", phMin: 5.8, phMax: 6.2, ecMin: 1.2, ecMax: 1.6 },
  { week: 3, tempMin: 22, tempMax: 28, rhMin: 55, rhMax: 65, ppfdMin: 500, ppfdMax: 700, photo: "18/6", phMin: 5.8, phMax: 6.2, ecMin: 1.4, ecMax: 1.8 },
  { week: 4, tempMin: 22, tempMax: 28, rhMin: 55, rhMax: 65, ppfdMin: 600, ppfdMax: 800, photo: "18/6", phMin: 5.8, phMax: 6.2, ecMin: 1.4, ecMax: 1.8 },
];

for (const t of opVegaTargets) {
  try {
    await db.query(
      `INSERT INTO weeklyTargets (strainId, phase, weekNumber, tempMin, tempMax, rhMin, rhMax, ppfdMin, ppfdMax, photoperiod, phMin, phMax, ecMin, ecMax)
       VALUES (?, 'VEGA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [strainIds["Orange Punch"], t.week, t.tempMin, t.tempMax, t.rhMin, t.rhMax, t.ppfdMin, t.ppfdMax, t.photo, t.phMin, t.phMax, t.ecMin, t.ecMax]
    );
  } catch (e) {}
}

// Orange Punch - FLORA semanas 1-9
const opFloraTargets = [
  { week: 1, tempMin: 22, tempMax: 26, rhMin: 50, rhMax: 60, ppfdMin: 600, ppfdMax: 800, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 1.4, ecMax: 1.6 },
  { week: 2, tempMin: 22, tempMax: 26, rhMin: 50, rhMax: 60, ppfdMin: 700, ppfdMax: 900, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 1.6, ecMax: 1.8 },
  { week: 3, tempMin: 22, tempMax: 26, rhMin: 45, rhMax: 55, ppfdMin: 700, ppfdMax: 900, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 1.6, ecMax: 2.0 },
  { week: 4, tempMin: 22, tempMax: 26, rhMin: 45, rhMax: 55, ppfdMin: 800, ppfdMax: 1000, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 1.8, ecMax: 2.0 },
  { week: 5, tempMin: 21, tempMax: 25, rhMin: 40, rhMax: 50, ppfdMin: 800, ppfdMax: 1000, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 1.8, ecMax: 2.0 },
  { week: 6, tempMin: 21, tempMax: 25, rhMin: 40, rhMax: 50, ppfdMin: 800, ppfdMax: 1000, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 1.6, ecMax: 1.8 },
  { week: 7, tempMin: 20, tempMax: 24, rhMin: 40, rhMax: 50, ppfdMin: 700, ppfdMax: 900, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 1.2, ecMax: 1.6 },
  { week: 8, tempMin: 20, tempMax: 24, rhMin: 40, rhMax: 50, ppfdMin: 600, ppfdMax: 800, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 0.6, ecMax: 1.0 },
  { week: 9, tempMin: 20, tempMax: 24, rhMin: 40, rhMax: 50, ppfdMin: 600, ppfdMax: 800, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 0.4, ecMax: 0.6 },
];

for (const t of opFloraTargets) {
  try {
    await db.query(
      `INSERT INTO weeklyTargets (strainId, phase, weekNumber, tempMin, tempMax, rhMin, rhMax, ppfdMin, ppfdMax, photoperiod, phMin, phMax, ecMin, ecMax)
       VALUES (?, 'FLORA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [strainIds["Orange Punch"], t.week, t.tempMin, t.tempMax, t.rhMin, t.rhMax, t.ppfdMin, t.ppfdMax, t.photo, t.phMin, t.phMax, t.ecMin, t.ecMax]
    );
  } catch (e) {}
}

// 24K - VEGA semanas 1-5
const k24VegaTargets = [
  { week: 1, tempMin: 22, tempMax: 28, rhMin: 60, rhMax: 70, ppfdMin: 300, ppfdMax: 500, photo: "18/6", phMin: 5.8, phMax: 6.2, ecMin: 1.0, ecMax: 1.4 },
  { week: 2, tempMin: 22, tempMax: 28, rhMin: 60, rhMax: 70, ppfdMin: 400, ppfdMax: 600, photo: "18/6", phMin: 5.8, phMax: 6.2, ecMin: 1.2, ecMax: 1.6 },
  { week: 3, tempMin: 22, tempMax: 28, rhMin: 55, rhMax: 65, ppfdMin: 500, ppfdMax: 700, photo: "18/6", phMin: 5.8, phMax: 6.2, ecMin: 1.4, ecMax: 1.8 },
  { week: 4, tempMin: 22, tempMax: 28, rhMin: 55, rhMax: 65, ppfdMin: 600, ppfdMax: 800, photo: "18/6", phMin: 5.8, phMax: 6.2, ecMin: 1.4, ecMax: 1.8 },
  { week: 5, tempMin: 22, tempMax: 28, rhMin: 50, rhMax: 60, ppfdMin: 600, ppfdMax: 800, photo: "18/6", phMin: 5.8, phMax: 6.2, ecMin: 1.4, ecMax: 1.8 },
];

for (const t of k24VegaTargets) {
  try {
    await db.query(
      `INSERT INTO weeklyTargets (strainId, phase, weekNumber, tempMin, tempMax, rhMin, rhMax, ppfdMin, ppfdMax, photoperiod, phMin, phMax, ecMin, ecMax)
       VALUES (?, 'VEGA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [strainIds["24K"], t.week, t.tempMin, t.tempMax, t.rhMin, t.rhMax, t.ppfdMin, t.ppfdMax, t.photo, t.phMin, t.phMax, t.ecMin, t.ecMax]
    );
  } catch (e) {}
}

// 24K - FLORA semanas 1-10
const k24FloraTargets = [
  { week: 1, tempMin: 22, tempMax: 26, rhMin: 50, rhMax: 60, ppfdMin: 600, ppfdMax: 800, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 1.4, ecMax: 1.6 },
  { week: 2, tempMin: 22, tempMax: 26, rhMin: 50, rhMax: 60, ppfdMin: 700, ppfdMax: 900, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 1.6, ecMax: 1.8 },
  { week: 3, tempMin: 22, tempMax: 26, rhMin: 45, rhMax: 55, ppfdMin: 700, ppfdMax: 900, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 1.6, ecMax: 2.0 },
  { week: 4, tempMin: 22, tempMax: 26, rhMin: 45, rhMax: 55, ppfdMin: 800, ppfdMax: 1000, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 1.8, ecMax: 2.0 },
  { week: 5, tempMin: 21, tempMax: 25, rhMin: 40, rhMax: 50, ppfdMin: 800, ppfdMax: 1000, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 1.8, ecMax: 2.2 },
  { week: 6, tempMin: 21, tempMax: 25, rhMin: 40, rhMax: 50, ppfdMin: 800, ppfdMax: 1000, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 1.8, ecMax: 2.0 },
  { week: 7, tempMin: 20, tempMax: 24, rhMin: 40, rhMax: 50, ppfdMin: 700, ppfdMax: 900, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 1.6, ecMax: 1.8 },
  { week: 8, tempMin: 20, tempMax: 24, rhMin: 40, rhMax: 50, ppfdMin: 700, ppfdMax: 900, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 1.2, ecMax: 1.6 },
  { week: 9, tempMin: 20, tempMax: 24, rhMin: 40, rhMax: 50, ppfdMin: 600, ppfdMax: 800, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 0.6, ecMax: 1.0 },
  { week: 10, tempMin: 20, tempMax: 24, rhMin: 40, rhMax: 50, ppfdMin: 600, ppfdMax: 800, photo: "12/12", phMin: 6.0, phMax: 6.5, ecMin: 0.4, ecMax: 0.6 },
];

for (const t of k24FloraTargets) {
  try {
    await db.query(
      `INSERT INTO weeklyTargets (strainId, phase, weekNumber, tempMin, tempMax, rhMin, rhMax, ppfdMin, ppfdMax, photoperiod, phMin, phMax, ecMin, ecMax)
       VALUES (?, 'FLORA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [strainIds["24K"], t.week, t.tempMin, t.tempMax, t.rhMin, t.rhMax, t.ppfdMin, t.ppfdMax, t.photo, t.phMin, t.phMax, t.ecMin, t.ecMax]
    );
  } catch (e) {}
}

console.log(`  ✓ Weekly targets inseridos para Orange Punch e 24K`);

// ─── RESUMO FINAL ────────────────────────────────────────────────────────────
console.log("\n✅ Seed concluído com sucesso!");
console.log("─────────────────────────────────────────");
console.log(`🌿 Strains: ${strainsData.length}`);
console.log(`🏠 Estufas: 3 (Manutenção, Vega, Flora)`);
console.log(`🌱 Plantas: 8 total`);
console.log(`   - 2 plantas-mãe (Manutenção)`);
console.log(`   - 3 clones Orange Punch (Vega, semana 2)`);
console.log(`   - 3 plantas 24K (Flora, semana 5)`);
console.log(`📊 Logs diários: ~168 (14 dias × 3 estufas × 2 turnos)`);
console.log(`✅ Templates de tarefas: ${taskTemplatesData.length}`);
console.log(`📋 Instâncias de tarefas: ~${taskCount}`);
console.log(`🚨 Alertas: ${alertsData.length}`);
console.log("─────────────────────────────────────────");

await db.end();
