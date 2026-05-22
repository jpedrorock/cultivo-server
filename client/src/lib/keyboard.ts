/**
 * keyboard.ts — helpers pra gerenciar o teclado virtual nativo.
 *
 * ⚠️ Plugin ainda NÃO instalado: `@capacitor/keyboard`.
 * Pra ativar:
 *   pnpm add @capacitor/keyboard
 *   npx cap sync
 *
 * Enquanto o plugin não estiver instalado, todas as funções são no-op no web
 * (e o lazy import vai falhar em nativo, capturado no try/catch).
 *
 * Por que isso vale a pena?
 *  - Permite esconder teclado programaticamente após submit
 *  - Configurar resize behavior (push content vs overlay)
 *  - Listener pra ajustar UI quando teclado abre/fecha
 *  - "Done" button no number pad iOS
 */

import { isNative } from "./platform";

/**
 * Esconde o teclado nativo. Útil após submeter formulário, ou em
 * pull-to-dismiss em modal. No-op no web.
 */
export async function hideKeyboard(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    await Keyboard.hide();
  } catch {
    // Plugin não instalado ou indisponível — silencioso
  }
}

/**
 * Configura o comportamento de resize quando teclado abre.
 * - "body": <body> encolhe (recomendado pra apps com header fixo)
 * - "ionic": modo Ionic (usa CSS variables)
 * - "native": comportamento nativo padrão (overlay)
 * - "none": nenhum resize (você gerencia manualmente)
 *
 * Chamar uma vez no boot.
 */
export async function setKeyboardResize(mode: "body" | "ionic" | "native" | "none" = "body"): Promise<void> {
  if (!isNative()) return;
  try {
    const { Keyboard, KeyboardResize } = await import("@capacitor/keyboard");
    const resizeMap = {
      body: KeyboardResize.Body,
      ionic: KeyboardResize.Ionic,
      native: KeyboardResize.Native,
      none: KeyboardResize.None,
    };
    await Keyboard.setResizeMode({ mode: resizeMap[mode] });
  } catch {
    /* plugin não instalado */
  }
}

/**
 * Listener de eventos do teclado. Retorna função de cleanup.
 *
 * ```tsx
 * useEffect(() => {
 *   const off = onKeyboardEvent({
 *     onWillShow: () => setKeyboardOpen(true),
 *     onWillHide: () => setKeyboardOpen(false),
 *   });
 *   return () => { off.then(fn => fn?.()); };
 * }, []);
 * ```
 */
export async function onKeyboardEvent(opts: {
  onWillShow?: () => void;
  onDidShow?: () => void;
  onWillHide?: () => void;
  onDidHide?: () => void;
}): Promise<(() => void) | undefined> {
  if (!isNative()) return undefined;
  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    const handles: any[] = [];
    if (opts.onWillShow) handles.push(await Keyboard.addListener("keyboardWillShow", opts.onWillShow));
    if (opts.onDidShow) handles.push(await Keyboard.addListener("keyboardDidShow", opts.onDidShow));
    if (opts.onWillHide) handles.push(await Keyboard.addListener("keyboardWillHide", opts.onWillHide));
    if (opts.onDidHide) handles.push(await Keyboard.addListener("keyboardDidHide", opts.onDidHide));
    return () => {
      handles.forEach((h) => h?.remove?.().catch(() => {}));
    };
  } catch {
    return undefined;
  }
}
