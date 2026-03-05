/**
 * seed.mjs
 * Ponto de entrada para o seed do banco de dados.
 * Uso: pnpm db:seed
 */
import { config } from "dotenv";
import { seed } from "./seed-fn.mjs";

config();

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Erro ao executar seed:", error);
    process.exit(1);
  });
