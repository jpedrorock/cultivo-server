/**
 * Vitest global setup — carregado antes de cada test worker via setupFiles.
 *
 * Garante que process.env seja populado a partir do .env antes de qualquer
 * import que leia DATABASE_URL (mysql2, drizzle, etc.). Sem isso, Vitest
 * isola workers e DATABASE_URL fica undefined → "Cannot read properties of
 * undefined (reading 'isServer')" no mysql2.
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(import.meta.dirname, "../../.env") });
