/**
 * statusBar.ts — controle da status bar nativa (iOS/Android).
 *
 * Por que isso importa:
 *  - Por default a status bar fica com texto preto em fundo transparente.
 *    Como o Cultivo é tema escuro, texto preto SUMIR no fundo escuro.
 *  - Cada tela pode ter cor de header diferente (Home verde, Pro roxo) e
 *    a status bar deve combinar.
 *
 * Estratégia:
 *  - No boot, setStyle.Dark → texto branco (correto pra tema dark)
 *  - Hook `useStatusBarColor(color)` permite mudar background da status bar
 *    por tela. Hoje a maioria dos apps mantém transparente, mas se quiser
 *    matchar o gradient de uma tela específica, dá pra fazer.
 *
 * No-op em web — não tem status bar manipulável.
 */

import { isNative, isAndroid } from "./platform";

/**
 * Configuração inicial da status bar — chama uma vez no boot.
 * Define texto branco (light style) e fundo transparente.
 */
export async function initStatusBar(): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Style.Light = texto/ícones BRANCOS (combina com fundo escuro)
    // Style.Dark = texto/ícones PRETOS (combina com fundo claro)
    await StatusBar.setStyle({ style: Style.Light });

    if (isAndroid()) {
      // Android: setBackgroundColor pra que a status bar não cubra conteúdo.
      // iOS já é overlay por default — gerenciado via safe-area-inset-top no CSS.
      await StatusBar.setBackgroundColor({ color: "#0a0e14" });
      await StatusBar.setOverlaysWebView({ overlay: false });
    }
  } catch (e) {
    console.warn("[statusBar] init falhou:", e);
  }
}

/**
 * Muda estilo da status bar (texto claro/escuro).
 *  - "light" → texto BRANCO (use em fundo escuro)
 *  - "dark"  → texto PRETO (use em fundo claro)
 */
export async function setStatusBarStyle(style: "light" | "dark"): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: style === "light" ? Style.Light : Style.Dark });
  } catch {
    /* no-op */
  }
}

/**
 * Muda cor de fundo da status bar (Android only — iOS ignora).
 * Aceita hex (#RRGGBB) ou hex8 (#RRGGBBAA).
 */
export async function setStatusBarColor(color: string): Promise<void> {
  if (!isNative() || !isAndroid()) return;
  try {
    const { StatusBar } = await import("@capacitor/status-bar");
    await StatusBar.setBackgroundColor({ color });
  } catch {
    /* no-op */
  }
}
