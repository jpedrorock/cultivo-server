import { describe, it, expect } from "vitest";
import { decideRevenueCatPlan } from "./_core/webhookRoutes";

// T29 — lógica de decisão do webhook RevenueCat (evento → plano)
describe("decideRevenueCatPlan", () => {
  it("compra/renovação define o plano pelo maior entitlement", () => {
    expect(decideRevenueCatPlan({ type: "INITIAL_PURCHASE", entitlement_ids: ["cloud"] }))
      .toMatchObject({ plan: "cloud" });
    expect(decideRevenueCatPlan({ type: "RENEWAL", entitlement_ids: ["starter", "pro"] }))
      .toMatchObject({ plan: "pro" }); // maior privilégio vence
  });

  it("propaga a expiração quando presente", () => {
    const d = decideRevenueCatPlan({ type: "RENEWAL", entitlement_id: "starter", expiration_at_ms: 1893456000000 });
    expect(d?.plan).toBe("starter");
    expect(d?.planExpiresAt).toBeInstanceOf(Date);
  });

  it("expiração/pausa volta pra free", () => {
    expect(decideRevenueCatPlan({ type: "EXPIRATION", entitlement_ids: ["cloud"] }))
      .toEqual({ plan: "free", planExpiresAt: null });
    expect(decideRevenueCatPlan({ type: "SUBSCRIPTION_PAUSED" }))
      .toEqual({ plan: "free", planExpiresAt: null });
  });

  it("cancelamento (auto-renew off) e eventos neutros não alteram o plano", () => {
    expect(decideRevenueCatPlan({ type: "CANCELLATION", entitlement_ids: ["cloud"] })).toBeNull();
    expect(decideRevenueCatPlan({ type: "TEST" })).toBeNull();
    expect(decideRevenueCatPlan({ type: "TRANSFER" })).toBeNull();
  });

  it("entitlement desconhecido não vira plano", () => {
    expect(decideRevenueCatPlan({ type: "INITIAL_PURCHASE", entitlement_ids: ["lifetime_xyz"] })).toBeNull();
  });
});
