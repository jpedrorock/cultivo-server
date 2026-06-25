import { describe, it, expect } from "vitest";
import { requirePlanFeature } from "./routers/_helpers";

// T28 — diferenciação de planos no backend (bloquear Free dos recursos pagos)
describe("requirePlanFeature", () => {
  it("bloqueia Free de todos os recursos pagos", () => {
    expect(() => requirePlanFeature({ plan: "free" }, "photos")).toThrow();
    expect(() => requirePlanFeature({ plan: "free" }, "aiChat")).toThrow();
    expect(() => requirePlanFeature({ plan: "free" }, "iot")).toThrow();
  });

  it("Starter libera fotos, mas não IA nem IoT", () => {
    expect(() => requirePlanFeature({ plan: "starter" }, "photos")).not.toThrow();
    expect(() => requirePlanFeature({ plan: "starter" }, "aiChat")).toThrow();
    expect(() => requirePlanFeature({ plan: "starter" }, "iot")).toThrow();
  });

  it("Cloud e Pro liberam tudo", () => {
    for (const plan of ["cloud", "pro"] as const) {
      expect(() => requirePlanFeature({ plan }, "photos")).not.toThrow();
      expect(() => requirePlanFeature({ plan }, "aiChat")).not.toThrow();
      expect(() => requirePlanFeature({ plan }, "iot")).not.toThrow();
    }
  });

  it("plano nulo/desconhecido é permissivo (não bloqueia grandfathered)", () => {
    expect(() => requirePlanFeature({ plan: null }, "aiChat")).not.toThrow();
    expect(() => requirePlanFeature({}, "iot")).not.toThrow();
    expect(() => requirePlanFeature(undefined, "photos")).not.toThrow();
    expect(() => requirePlanFeature({ plan: "desconhecido" }, "photos")).not.toThrow();
  });
});
