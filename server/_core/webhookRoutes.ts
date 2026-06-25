/**
 * webhookRoutes — webhooks de serviços externos.
 *
 * RevenueCat (T29): mantém `users.plan` / `users.planExpiresAt` sincronizado
 * com as assinaturas. O app configura `appUserID = String(userId)` no
 * RevenueCat e os entitlements são "starter" | "cloud" | "pro" (ver
 * client/src/_core/hooks/usePlan.ts). Logo o `app_user_id` do payload É o
 * id numérico do usuário.
 *
 * Config (feita por você, uma vez):
 *   1. RevenueCat → Integrations → Webhooks → URL: https://<domínio>/api/webhooks/revenuecat
 *   2. Copie o "Authorization header value" e ponha no .env: REVENUECAT_WEBHOOK_TOKEN=<valor>
 * Sem REVENUECAT_WEBHOOK_TOKEN, o endpoint responde 503 (inerte).
 */
import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";

type PlanTier = "free" | "starter" | "cloud" | "pro";
const TIER_RANK: Record<PlanTier, number> = { free: 0, starter: 1, cloud: 2, pro: 3 };

// Eventos que CONCEDEM acesso → definem o plano pelo entitlement
const GRANT_EVENTS = new Set([
  "INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE",
  "UNCANCELLATION", "NON_RENEWING_PURCHASE", "SUBSCRIPTION_EXTENDED",
]);
// Eventos que ENCERRAM o acesso → voltam pra free
const REVOKE_EVENTS = new Set(["EXPIRATION", "SUBSCRIPTION_PAUSED"]);
// CANCELLATION só desliga o auto-renew; o acesso segue até EXPIRATION — não mexe.

function tierFromEntitlements(ids: string[]): PlanTier | null {
  let best: PlanTier | null = null;
  for (const id of ids) {
    const t = id as PlanTier;
    if (t in TIER_RANK && (best === null || TIER_RANK[t] > TIER_RANK[best])) best = t;
  }
  return best;
}

/**
 * Decide a atualização de plano a partir de um evento RevenueCat.
 * Pura (testável): retorna { plan, planExpiresAt } ou null (sem alteração).
 */
export function decideRevenueCatPlan(
  event: { type?: string; entitlement_ids?: string[]; entitlement_id?: string; expiration_at_ms?: number | string }
): { plan: PlanTier; planExpiresAt: Date | null } | null {
  const type = String(event?.type ?? "");
  if (GRANT_EVENTS.has(type)) {
    const ids = event.entitlement_ids ?? (event.entitlement_id ? [event.entitlement_id] : []);
    const plan = tierFromEntitlements(ids);
    if (!plan) return null;
    return { plan, planExpiresAt: event.expiration_at_ms ? new Date(Number(event.expiration_at_ms)) : null };
  }
  if (REVOKE_EVENTS.has(type)) {
    return { plan: "free", planExpiresAt: null };
  }
  return null; // CANCELLATION, TEST, TRANSFER, etc. — não altera
}

export function registerWebhookRoutes(app: Express) {
  app.post("/api/webhooks/revenuecat", async (req: Request, res: Response) => {
    const expected = process.env.REVENUECAT_WEBHOOK_TOKEN;
    if (!expected) {
      return res.status(503).json({ error: "Webhook RevenueCat não configurado (REVENUECAT_WEBHOOK_TOKEN ausente)" });
    }
    if (req.headers.authorization !== expected) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    const event = req.body?.event;
    if (!event?.type || event.app_user_id == null) {
      return res.status(400).json({ error: "Payload inválido" });
    }

    // app_user_id = String(userId) no app. IDs anônimos ($RCAnonymousID:...) são ignorados.
    const userId = Number(event.app_user_id);
    if (!Number.isFinite(userId)) {
      return res.json({ ok: true, ignored: "app_user_id não-numérico" });
    }

    const database = await getDb();
    if (!database) return res.status(500).json({ error: "DB indisponível" });

    const decision = decideRevenueCatPlan(event);
    if (!decision) return res.json({ ok: true, ignored: event.type });

    await database.update(users)
      .set({ plan: decision.plan, planExpiresAt: decision.planExpiresAt })
      .where(eq(users.id, userId));
    console.log(`[RevenueCat] user ${userId} → plano ${decision.plan} (evento ${event.type})`);
    return res.json({ ok: true, userId, plan: decision.plan });
  });
}
