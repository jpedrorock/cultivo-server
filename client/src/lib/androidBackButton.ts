/**
 * androidBackButton.ts — gerencia o botão Voltar físico/gesto do Android.
 *
 * Sem essa lib, o botão Back do Android sai do app direto. Isso é considerado
 * bug grave pelo Play Store (UX inconsistente). Com essa lib:
 *
 *   1. Se houver modal/sheet/dialog aberto → fecha o último aberto
 *   2. Se rota for diferente da raiz → volta uma rota (history.back)
 *   3. Se rota for raiz `/` → mostra confirmação "Sair do app?"
 *
 * iOS não tem botão back físico — esse handler é no-op lá. O gesto de swipe
 * pra trás do iOS é nativo do WKWebView e não passa pelo Capacitor.
 *
 * Arquitetura: stack global de handlers. Cada modal/sheet aberto faz push
 * de um handler; quando fechado, faz pop. Handler do topo é executado primeiro.
 *
 * Uso típico em componentes:
 *
 *   const [open, setOpen] = useState(false);
 *   useBackButton(open, () => setOpen(false), 'meu-modal');
 *
 * Quando `open=true`, esse handler intercepta back. Quando `open=false`,
 * remove do stack automaticamente.
 */

import { useEffect } from "react";
import { isNative, isAndroid } from "./platform";

type BackHandler = {
  id: string;
  /** Retorna `true` se consumiu o evento (não propaga); `false` deixa o próximo handler tentar. */
  handler: () => boolean | void;
};

const stack: BackHandler[] = [];
let listenerAttached = false;

/**
 * Adiciona um handler à stack. Retorna função pra remover.
 *
 * Handler retornar `true` = consumiu evento (não vai pro próximo).
 * Handler retornar `false`/`undefined` = deixa próximo tentar.
 */
export function pushBackHandler(id: string, handler: () => boolean | void): () => void {
  // Remove existente com mesmo id (defensivo contra duplicação)
  removeBackHandler(id);
  stack.push({ id, handler });
  return () => removeBackHandler(id);
}

function removeBackHandler(id: string): void {
  const idx = stack.findIndex((h) => h.id === id);
  if (idx >= 0) stack.splice(idx, 1);
}

/**
 * Dispara a stack. O topo (último pushed) é tentado primeiro.
 * Para no primeiro handler que retornar truthy.
 */
function runStack(): boolean {
  // Iterate de cima pra baixo (LIFO)
  for (let i = stack.length - 1; i >= 0; i--) {
    const result = stack[i].handler();
    if (result === true) return true;
  }
  return false;
}

/**
 * Inicializa o listener global do hardware back. Chamar uma vez no boot.
 * Idempotente — chamar várias vezes não duplica listener.
 */
export async function initAndroidBackButton(): Promise<void> {
  if (listenerAttached) return;
  // iOS não tem back físico — não precisa do listener
  if (!isNative() || !isAndroid()) return;

  try {
    const { App } = await import("@capacitor/app");
    App.addListener("backButton", () => {
      const consumed = runStack();
      // Se nenhum handler consumiu, o default handler do App.tsx vai cuidar
      // (registrado lá com id="root-back"). Ele faz history.back() ou prompt.
      if (!consumed) {
        // Fallback — não deveria acontecer porque root-back sempre tá no stack
        console.warn("[androidBack] Nenhum handler consumiu evento — caindo no native default.");
      }
    });
    listenerAttached = true;
  } catch (err) {
    console.warn("[androidBack] Falha ao registrar listener:", err);
  }
}

/**
 * Hook React pra registrar/desregistrar handler de back button automaticamente.
 *
 * @param active Se true, o handler tá ativo no stack. Se false, é removido.
 * @param handler Função chamada quando back é pressionado. Retorna `true` pra consumir.
 * @param id ID único pro handler (pra evitar duplicação se componente re-renderiza)
 *
 * Padrão típico:
 *
 *   useBackButton(modalOpen, () => { setModalOpen(false); return true; }, 'edit-modal');
 *
 * Importante:
 *  - Handler é re-registrado quando suas deps mudam (id ou handler stabilizam isso)
 *  - Auto-remove no unmount
 *  - No-op se não tá em Android native
 */
export function useBackButton(active: boolean, handler: () => boolean | void, id: string): void {
  useEffect(() => {
    if (!active) return;
    if (!isNative() || !isAndroid()) return;
    const remove = pushBackHandler(id, handler);
    return remove;
  }, [active, handler, id]);
}
