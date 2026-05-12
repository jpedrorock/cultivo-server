/**
 * db-migrate.mjs — wrapper de compatibilidade.
 *
 * Toda lógica de migrations vive agora em `server/_core/dbMigrations.ts`
 * (fonte única, executada também no startup do servidor).
 *
 * Este arquivo permanece por compatibilidade com scripts antigos que
 * possam invocá-lo diretamente. Ele apenas re-executa o entry CLI da
 * versão TypeScript via `tsx`.
 *
 * Uso preferido: `pnpm db:migrate`
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const _dirname = dirname(fileURLToPath(import.meta.url));
const tsEntry = resolve(_dirname, '_core/dbMigrations.ts');

const child = spawn('npx', ['tsx', tsEntry], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 1));
