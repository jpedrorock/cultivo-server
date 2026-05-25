/**
 * Persistência minimalista do estado do OnboardingWizard.
 *
 * Extraído de OnboardingWizard.tsx para que App.tsx possa importar apenas
 * essa utilidade (via localStorage) sem puxar o componente inteiro para o
 * bundle principal. O componente segue sendo lazy-loaded em App.tsx.
 */

const WIZARD_DONE_KEY = "cultivo_onboarding_done";

/** Marca wizard como completo no localStorage. Não mostra de novo. */
export function markWizardDone(): void {
  try {
    localStorage.setItem(WIZARD_DONE_KEY, "1");
  } catch {
    /* localStorage indisponível (modo privado) — wizard pode aparecer de novo, no problem */
  }
}

/** Checa se wizard já foi completado/pulado. */
export function isWizardDone(): boolean {
  try {
    return localStorage.getItem(WIZARD_DONE_KEY) === "1";
  } catch {
    return false;
  }
}
