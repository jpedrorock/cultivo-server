/**
 * splash.ts — controle do splash screen nativo.
 *
 * Estratégia:
 *  - capacitor.config.ts tem `launchAutoHide: false`
 *  - Esperamos React montar + auth resolver + queries iniciais
 *  - Chamamos `hideSplash()` manualmente
 *  - launchShowDuration=4000ms é fallback se hide() nunca for chamado
 *
 * Sem isso, dá flash branco entre "splash some" e "app aparece".
 * Com isso, transição é suave (fadeOutDuration=300ms).
 */

import { isNative } from "./platform";

let splashHidden = false;

/**
 * Esconde o splash nativo com fade. Pode ser chamado várias vezes — idempotente.
 *
 * Quando chamar:
 *  - Após auth check (useAuth.loading=false)
 *  - Ou após primeiro render do componente principal
 *  - Ou no `useEffect` da AuthenticatedAppInner
 */
export async function hideSplash(): Promise<void> {
  if (splashHidden) return;
  splashHidden = true;

  if (!isNative()) return;

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    // fadeOutDuration aqui (em ms) sobrescreve o config padrão se quiser
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch (err) {
    console.warn("[splash] hide falhou:", err);
  }
}

/**
 * Mostra o splash de volta (raro — útil em re-auth ou logout pra esconder
 * tela transitória).
 */
export async function showSplash(): Promise<void> {
  splashHidden = false;
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.show({ showDuration: 0, autoHide: false });
  } catch {
    /* no-op */
  }
}
