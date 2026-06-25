import { defineConfig, devices } from "@playwright/test";

/**
 * Config Playwright e2e (T10). Roda contra o servidor local na porta 3000.
 * `reuseExistingServer: true` aproveita um `pnpm dev` já rodando; senão, sobe
 * um. Os testes e2e precisam do app de pé (DB local incluso) — não rodam no CI
 * atual (lint/check/build, sem MySQL). Rode localmente: `pnpm test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    port: 3000,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
