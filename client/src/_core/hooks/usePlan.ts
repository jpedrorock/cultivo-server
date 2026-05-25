import { useEffect, useState, useCallback } from "react";
import { isNative } from "@/lib/platform";
import { useAuth } from "@/_core/hooks/useAuth";

const DEV_PLAN_KEY = "dev_force_plan";

export type PlanTier = "free" | "pro" | "team";

/**
 * Contas de teste com plano forçado por email — facilita alternar entre
 * Free, Pro e Team durante desenvolvimento sem precisar de RevenueCat.
 * Criadas via `tsx server/seed-test-accounts.ts`.
 */
const TEST_ACCOUNTS_BY_EMAIL: Record<string, PlanTier> = {
  "pro@cultivo.pro":  "pro",
  "team@cultivo.pro": "team",
  "free@cultivo.pro": "free",
};

export type PlanLimits = {
  maxTents: number | null;
  /** Quantos membros podem fazer parte do mesmo grupo (incluindo o owner) */
  maxMembers: number;
  /** Permite convidar membros (mostrar UI de convite) */
  allowInvites: boolean;
  allowedCalculators: string[];
  photosEnabled: boolean;
  alertsEnabled: boolean;
  aiChatEnabled: boolean;
  customAlertsEnabled: boolean;
  iotIntegrationsEnabled: boolean;
  presetsEnabled: boolean;
  historyDays: number | null;
};

const FREE_LIMITS: PlanLimits = {
  maxTents: 1,
  maxMembers: 1,
  allowInvites: false,
  allowedCalculators: ["lux-ppfd", "watering-runoff", "vpd", "ph"],
  photosEnabled: false,
  alertsEnabled: true,
  aiChatEnabled: false,
  customAlertsEnabled: false,
  iotIntegrationsEnabled: false,
  presetsEnabled: false,
  historyDays: 7,
};

const PRO_LIMITS: PlanLimits = {
  maxTents: null,
  maxMembers: 1,
  allowInvites: false,
  allowedCalculators: ["lux-ppfd", "watering-runoff", "watering-auto", "vpd", "fertilization", "ppm-ec", "ph"],
  photosEnabled: true,
  alertsEnabled: true,
  aiChatEnabled: true,
  customAlertsEnabled: true,
  iotIntegrationsEnabled: true,
  presetsEnabled: true,
  historyDays: null,
};

const TEAM_LIMITS: PlanLimits = {
  ...PRO_LIMITS,
  maxMembers: 3,
  allowInvites: true,
};

const LIMITS_BY_TIER: Record<PlanTier, PlanLimits> = {
  free: FREE_LIMITS,
  pro:  PRO_LIMITS,
  team: TEAM_LIMITS,
};

function isValidTier(v: string | null | undefined): v is PlanTier {
  return v === "free" || v === "pro" || v === "team";
}

/**
 * Hook do plano atual.
 *
 * - Web: contas normais viram Pro (uso pessoal/teste). Contas de teste seguem o email.
 * - Mobile (Capacitor): lê entitlement do RevenueCat (`pro` ou `team`).
 *   Sem RC configurado: default = free.
 *
 * Refetch automático ao voltar do background (Capacitor).
 */
export function usePlan() {
  const { user } = useAuth();
  const [tier, setTier] = useState<PlanTier>(isNative() ? "free" : "pro");
  const [isLoading, setIsLoading] = useState<boolean>(isNative());

  const refresh = useCallback(async () => {
    // 1. Override automático por email — APENAS quando VITE_ENABLE_TEST_ACCOUNTS=true.
    //    Setar no .env local pra desenvolvimento. NÃO setar no build de App Store /
    //    Play Store — sem isso, alguém em prod registrava "pro@cultivo.pro" e virava
    //    Pro de graça. Vite faz tree-shake se a env var não vier "true".
    const testAccountsEnabled = import.meta.env.VITE_ENABLE_TEST_ACCOUNTS === "true";
    if (testAccountsEnabled && user?.email && TEST_ACCOUNTS_BY_EMAIL[user.email]) {
      setTier(TEST_ACCOUNTS_BY_EMAIL[user.email]);
      setIsLoading(false);
      return;
    }
    // 2. Web (não Capacitor) e conta normal: tratar como Pro.
    if (!isNative()) {
      setTier("pro");
      setIsLoading(false);
      return;
    }
    // 3 + 4. Native-only: dynamic imports keep @capacitor/* and @revenuecat/* out of the web bundle
    const [{ Preferences }, { isInitialized }] = await Promise.all([
      import("@capacitor/preferences"),
      import("@/lib/revenuecat"),
    ]);
    const override = testAccountsEnabled ? await Preferences.get({ key: DEV_PLAN_KEY }) : { value: null };
    if (isValidTier(override.value)) {
      setTier(override.value);
      setIsLoading(false);
      return;
    }
    if (!(await isInitialized())) {
      setTier("free");
      setIsLoading(false);
      return;
    }
    try {
      const { Purchases } = await import("@revenuecat/purchases-capacitor");
      const { customerInfo } = await Purchases.getCustomerInfo();
      const active = customerInfo?.entitlements?.active ?? {};
      if ("team" in active) setTier("team");
      else if ("pro" in active) setTier("pro");
      else setTier("free");
    } catch {
      setTier("free");
    } finally {
      setIsLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isNative()) return;
    let removed = false;
    let handle: { remove: () => void } | null = null;

    import("@capacitor/app").then(({ App: CapacitorApp }) => {
      if (removed) return;
      CapacitorApp.addListener("appStateChange", (state) => {
        if (state.isActive && !removed) refresh();
      }).then((h) => {
        if (removed) h.remove();
        else handle = h;
      });
    });

    return () => {
      removed = true;
      handle?.remove();
    };
  }, [refresh]);

  return {
    tier,
    /** Derived: true quando tier é "pro" OU "team" (acesso completo, não-Free) */
    isPro: tier === "pro" || tier === "team",
    /** Derived: true só pro tier "team" (multi-member features) */
    isTeam: tier === "team",
    limits: LIMITS_BY_TIER[tier],
    isLoading,
    refetch: refresh,
  };
}
