/**
 * usePlan.ts — stub para build web/PWA
 *
 * A implementação completa (tRPC subscription.me + RevenueCat) vive no
 * branch mobile/Capacitor. Neste build web, todos os usuários são tratados
 * como Pro (sem gatekeeping de plano via SDK nativo).
 */
export interface PlanLimits {
  maxTents: number | null;
  allowedCalculators: string[] | null;
  photosEnabled: boolean;
  alertsEnabled: boolean;
  aiChatEnabled: boolean;
}

interface UsePlanResult {
  isPro: boolean;
  plan: "free" | "pro";
  limits: PlanLimits;
  isLoading: boolean;
}

/** No build web puro, trata todos como Pro (sem SDK nativo de IAP). */
export function usePlan(): UsePlanResult {
  return {
    isPro: true,
    plan: "pro",
    limits: {
      maxTents: null,
      allowedCalculators: null,
      photosEnabled: true,
      alertsEnabled: true,
      aiChatEnabled: true,
    },
    isLoading: false,
  };
}
