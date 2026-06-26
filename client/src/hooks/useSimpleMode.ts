import { useSyncExternalStore, useCallback } from "react";

/**
 * Modo Simples / Avançado (proposta "Modo Simples" #1).
 *
 * Preferência de UI client-side (localStorage) — esconde jargão técnico
 * (VPD/PPFD/EC), reduz a sidebar e mostra só as calculadoras essenciais pra
 * iniciantes. Não precisa de backend: é preferência por dispositivo.
 *
 * Reativo via useSyncExternalStore — qualquer componente que use o hook
 * re-renderiza quando o modo muda (mesma aba ou outra, via storage event).
 */
const KEY = "cultivo-simple-mode";
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false; // SSR/pré-hidratação: assume Avançado (comportamento atual)
}

export function useSimpleMode(): [boolean, (value: boolean) => void] {
  const simple = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setSimple = useCallback((value: boolean) => {
    try {
      localStorage.setItem(KEY, value ? "1" : "0");
    } catch {
      /* localStorage indisponível — ignora */
    }
    emit();
  }, []);
  return [simple, setSimple];
}
