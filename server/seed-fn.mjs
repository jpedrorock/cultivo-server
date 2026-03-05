/**
 * seed-fn.mjs
 * Funcao de seed exportavel — usada tanto por seed.mjs quanto por db-reset.mjs
 */
import mysql from "mysql2/promise";
import { config } from "dotenv";

config();

export async function seed() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("DATABASE_URL nao definida");

  const connection = await mysql.createConnection(DATABASE_URL);

  console.log("🌱 Iniciando seed do banco de dados...");

  // Inserir as 3 estufas
  console.log("Inserindo estufas...");
  await connection.execute(
    "INSERT INTO `tents` (`name`, `category`, `width`, `depth`, `height`, `volume`, `powerW`) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ["Estufa A", "MAINTENANCE", 45, 75, 90, "0.304", null]
  );
  await connection.execute(
    "INSERT INTO `tents` (`name`, `category`, `width`, `depth`, `height`, `volume`, `powerW`) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ["Estufa B", "VEGA", 60, 60, 120, "0.432", null]
  );
  await connection.execute(
    "INSERT INTO `tents` (`name`, `category`, `width`, `depth`, `height`, `volume`, `powerW`) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ["Estufa C", "FLORA", 60, 120, 150, "1.080", null]
  );
  console.log("✅ Estufas inseridas!");

  // Inserir limites de seguranca
  console.log("Inserindo limites de seguranca...");
  const safetyValues = [
    ["TENT_A", "CLONING",     "TEMP", "18.0", "28.0"],
    ["TENT_A", "CLONING",     "RH",   "60.0", "90.0"],
    ["TENT_A", "CLONING",     "PPFD", "100",  "300"],
    ["TENT_A", "MAINTENANCE", "TEMP", "18.0", "26.0"],
    ["TENT_A", "MAINTENANCE", "RH",   "40.0", "70.0"],
    ["TENT_A", "MAINTENANCE", "PPFD", "200",  "400"],
    ["TENT_BC", "CLONING",    "TEMP", "20.0", "26.0"],
    ["TENT_BC", "CLONING",    "RH",   "70.0", "85.0"],
    ["TENT_BC", "CLONING",    "PPFD", "150",  "300"],
    ["TENT_BC", "VEGA",       "TEMP", "20.0", "28.0"],
    ["TENT_BC", "VEGA",       "RH",   "50.0", "70.0"],
    ["TENT_BC", "VEGA",       "PPFD", "300",  "600"],
    ["TENT_BC", "FLORA",      "TEMP", "18.0", "26.0"],
    ["TENT_BC", "FLORA",      "RH",   "40.0", "55.0"],
    ["TENT_BC", "FLORA",      "PPFD", "600",  "1000"],
  ];

  const insertSafety =
    "INSERT INTO `safetyLimits` (`context`, `phase`, `metric`, `minValue`, `maxValue`) VALUES (?, ?, ?, ?, ?)";

  for (const row of safetyValues) {
    await connection.execute(insertSafety, row);
  }
  console.log("✅ Limites de seguranca inseridos!");

  // Inicializar estado da Estufa A
  console.log("Inicializando estado da Estufa A...");
  await connection.execute(
    "INSERT INTO `tentAState` (`tentId`, `mode`, `activeCloningEventId`) VALUES (?, ?, ?)",
    [1, "MAINTENANCE", null]
  );
  console.log("✅ Estado da Estufa A inicializado!");

  await connection.end();
  console.log("🎉 Seed concluido com sucesso!");
}
