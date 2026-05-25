/**
 * PaywallGate.tsx — stub para build web/PWA
 *
 * A implementação completa (RevenueCat) vive no branch mobile/Capacitor.
 * Neste build web, o paywall é um no-op: todos os recursos ficam liberados.
 */
import type { ReactNode } from "react";

interface PaywallHook {
  /** Abre o modal de upgrade (no-op na web) */
  open: (reason?: string) => void;
  /** Elemento do modal a renderizar (nulo na web) */
  PaywallElement: ReactNode;
}

export function usePaywall(): PaywallHook {
  return {
    open: () => {/* no-op: web build sem RevenueCat */},
    PaywallElement: null,
  };
}

interface PaywallGateProps {
  feature: string;
  children: ReactNode;
}

/** Wrapper que guarda features Pro — na web sempre renderiza children */
export default function PaywallGate({ children }: PaywallGateProps) {
  return <>{children}</>;
}
