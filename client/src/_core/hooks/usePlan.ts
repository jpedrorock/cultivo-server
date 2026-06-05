import { useEffect, useState, useCallback } from "react";
import { isNative } from "@/lib/platform";
import { useAuth } from "@/_core/hooks/useAuth";

const DEV_PLAN_KEY = "dev_force_plan";

/**
 * Tiers de plano — 4-tier (Free / Starter / Cloud / Pro).
 *
 * Free    → uso básico (1 estufa, 4 calculadoras, sem AI/IoT)
 * Starter → hobbyista sério (3 estufas, 7 calcs, fotos, presets, alertas customizados)
 * Cloud ⭐ → cultivador avançado (ilimitado + AI Chat + IoT Tuya/ESP32) — tier destaque
 * Pro     → Cloud + equipe (até 3 membros com convites)
 */
export type PlanTier = "free" | "starter" | "cloud" | "pro";

/**
 * Contas de teste com plano forçado por email — facilita alternar entre
 * os 4 tiers durante desenvolvimento sem precisar de RevenueCat.
 * Criadas via `tsx server/seed-test-accounts.ts`.
 */
const TEST_ACCOUNTS_BY_EMAIL: Record<string, PlanTier> = {
  "starter@cultivo.pro": "starter",
  "cloud@cultivo.pro":   "cloud",
  "pro@cultivo.pro":     "pro",
  "free@cultivo.pro":    "free",
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

// ── Free ────────────────────────────────────────────────────────────────────
// 1 estufa, 4 calculadoras básicas, histórico 7 dias, sem fotos/AI/IoT.
const FREE_LIMITS: PlanLimits = {
  maxTents: 1,
  maxMembers: 1,
  allowInvites: false,
  // 4 calculadoras "básicas" — lux-ppfd, watering-runoff, vpd, ph-adjust
  allowedCalculators: ["lux-ppfd", "watering-runoff", "vpd", "ph-adjust"],
  photosEnabled: false,
  alertsEnabled: true,
  aiChatEnabled: false,
  customAlertsEnabled: false,
  iotIntegrationsEnabled: false,
  presetsEnabled: false,
  historyDays: 7,
};

// ── Starter ─────────────────────────────────────────────────────────────────
// 3 estufas, todas as calculadoras, histórico 30 dias, fotos + presets.
// Sem AI Chat e sem IoT (custo de servidor).
const STARTER_LIMITS: PlanLimits = {
  maxTents: 3,
  maxMembers: 1,
  allowInvites: false,
  // 7 calculadoras — todas incluídas (watering-auto, fertilization, ppm-ec a mais)
  allowedCalculators: [
    "lux-ppfd", "watering-runoff", "watering-auto",
    "vpd", "fertilization", "ppm-ec", "ph-adjust",
  ],
  photosEnabled: true,
  alertsEnabled: true,
  aiChatEnabled: false,
  customAlertsEnabled: true,
  iotIntegrationsEnabled: false,
  presetsEnabled: true,
  historyDays: 30,
};

// ── Cloud ────────────────────────────────────────────────────────────────────
// Tudo ilimitado + AI Chat + IoT (Tuya/SmartLife/ESP32). Tier destaque.
const CLOUD_LIMITS: PlanLimits = {
  maxTents: null,
  maxMembers: 1,
  allowInvites: false,
  allowedCalculators: [
    "lux-ppfd", "watering-runoff", "watering-auto",
    "vpd", "fertilization", "ppm-ec", "ph-adjust",
  ],
  photosEnabled: true,
  alertsEnabled: true,
  aiChatEnabled: true,
  customAlertsEnabled: true,
  iotIntegrationsEnabled: true,
  presetsEnabled: true,
  historyDays: null,
};

// ── Pro ──────────────────────────────────────────────────────────────────────
// Cloud + equipe: até 3 membros com convites. Ideal para casais/família.
const PRO_LIMITS: PlanLimits = {
  ...CLOUD_LIMITS,
  maxMembers: 3,
  allowInvites: true,
};

const LIMITS_BY_TIER: Record<PlanTier, PlanLimits> = {
  free:    FREE_LIMITS,
  starter: STARTER_LIMITS,
  cloud:   CLOUD_LIMITS,
  pro:     PRO_LIMITS,
};

function isValidTier(v: string | null | undefined): v is PlanTier {
  return v === "free" || v === "starter" || v === "cloud" || v === "pro";
}

/**
 * Hook do plano atual.
 *
 * - Web: contas normais viram Cloud (uso pessoal/teste). Contas de teste seguem o email.
 * - Mobile (Capacitor): lê entitlement do RevenueCat.
 *   Entitlements RevenueCat esperados: "starter", "cloud", "pro".
 *   Sem RC configurado: default = free.
 *
 * Refetch automático ao voltar do background (Capacitor).
 */
export function usePlan() {
  const { user } = useAuth();
  const [tier, setTier] = useState<PlanTier>(isNative() ? "free" : "cloud");
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
    // 2. Web (não Capacitor) e conta normal: tratar como Cloud.
    //    Preserva acesso completo pra usuários web (uso pessoal/teste de prod).
    if (!isNative()) {
      setTier("cloud");
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
      // Verificar entitlements na ordem de maior para menor privilégio.
      // Nomes dos produtos RC: "pro", "cloud", "starter" (definidos em STORE-LISTING §9).
      if ("pro" in active)      setTier("pro");
      else if ("cloud" in active)   setTier("cloud");
      else if ("starter" in active) setTier("starter");
      else                          setTier("free");
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
    /** Derived: true quando tier não é "free" (qualquer plano pago) */
    isPro: tier !== "free",
    /** Derived: true só pro tier "cloud" ou "pro" (tem AI Chat + IoT) */
    isCloud: tier === "cloud" || tier === "pro",
    /** Derived: true só pro tier "pro" (multi-member + convites) */
    isTeam: tier === "pro",
    limits: LIMITS_BY_TIER[tier],
    isLoading,
    refetch: refresh,
  };
}
