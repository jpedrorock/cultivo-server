import { test, expect } from "@playwright/test";

/**
 * Smoke test e2e (T10): garante que o app sobe e a tela de login renderiza.
 * Pega regressões grosseiras de boot/render (bundle quebrado, erro fatal no
 * mount, rota raiz não redirecionando pro login).
 */
test("a tela de login renderiza quando não autenticado", async ({ page }) => {
  await page.goto("/");

  // App redireciona pra login quando sem sessão
  await expect(page.getByRole("heading", { name: "Cultivo" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
});
