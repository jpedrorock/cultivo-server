/**
 * seed-fn.mjs
 * Função de seed exportável — usada tanto por seed.mjs quanto por db-reset.mjs
 */
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

config();

const __dirname = dirname(fileURLToPath(import.meta.url));

// Importar o schema via require para evitar problemas com .js vs .ts
const require = createRequire(import.meta.url);

export async function seed() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("DATABASE_URL não definida");

  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection);

  // Importar schema dinamicamente
  const schemaPath = join(__dirname, "../drizzle/schema.ts");
  
  // Como estamos em ESM sem transpilação, usar mysql2 diretamente
  console.log("🌱 Iniciando seed do banco de dados...");

  // Inserir as 3 estufas
  console.log("Inserindo estufas...");
  await connection.execute(`
    INSERT INTO \`tents\` (name, category, width, depth, height, volume, powerW)
    VALUES
      ('Estufa A', 'MAINTENANCE', 45, 75, 90, 0.304, NULL),
      ('Estufa B', 'VEGA', 60, 60, 120, 0.432, NULL),
      ('Estufa C', 'FLORA', 60, 120, 150, 1.080, NULL)
  `);
  console.log("✅ Estufas inseridas!");

  // Inserir limites de segurança
  console.log("Inserindo limites de segurança...");
  const safetyValues = [
    // TENT_A - CLONING
    ["TENT_A", "CLONING", "TEMP", 18.0, 28.0],
    ["TENT_A", "CLONING", "RH", 60.0, 90.0],
    ["TENT_A", "CLONING", "PPFD", 100, 300],
    // TENT_A - MAINTENANCE
    ["TENT_A", "MAINTENANCE", "TEMP", 18.0, 26.0],
    ["TENT_A", "MAINTENANCE", "RH", 40.0, 70.0],
    ["TENT_A", "MAINTENANCE", "PPFD", 200, 400],
    // TENT_BC - CLONING
    ["TENT_BC", "CLONING", "TEMP", 20.0, 26.0],
    ["TENT_BC", "CLONING", "RH", 70.0, 85.0],
    ["TENT_BC", "CLONING", "PPFD", 150, 300],
    // TENT_BC - VEGA
    ["TENT_BC", "VEGA", "TEMP", 20.0, 28.0],
    ["TENT_BC", "VEGA", "RH", 50.0, 70.0],
    ["TENT_BC", "VEGA", "PPFD", 300, 600],
    // TENT_BC - FLORA
    ["TENT_BC", "FLORA", "TEMP", 18.0, 26.0],
    ["TENT_BC", "FLORA", "RH", 40.0, 55.0],
    ["TENT_BC", "FLORA", "PPFD", 600, 1000],
  ];

  for (const [context, phase, metric, minValue, maxValue] of safetyValues) {
    await connection.execute(
      `INSERT INTO \`safetyLimits\` (context, phase, metric, minValue, maxValue) VALUES (?, ?, ?, ?, ?)`,
      [context, phase, metric, minValue, maxValue]
    );
  }
  console.log("✅ Limites de segurança inseridos!");

  // Inicializar estado da Estufa A
  console.log("Inicializando estado da Estufa A...");
  await connection.execute(
    `INSERT INTO \`tentAState\` (tentId, mode, activeCloningEventId) VALUES (1, 'MAINTENANCE', NULL)`
  );
  console.log("✅ Estado da Estufa A inicializado!");

  await connection.end();
  console.log("🎉 Seed concluído com sucesso!");
}
