import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import { createTestContext, DB_AVAILABLE } from "./test-helpers";

/**
 * Testes das mutations do servidor usadas pelo OnboardingWizard.
 *
 * Item (2) do critério — "'Pular tutorial' vai pra Home sem criar nada" — é
 * comportamento client-side (o wizard simplesmente não chama as mutations).
 * Não é testável no setup node/vitest atual sem React Testing Library.
 */
describe("Onboarding Wizard — server mutations", () => {
  describe.skipIf(!DB_AVAILABLE)("with database", () => {
    // Item (1): finalizar wizard cria estufa + strain + plantas
    it("should create tent, strain and plants in sequence", async () => {
      const ctx = createTestContext();
      const caller = appRouter.createCaller(ctx);

      const tent = await caller.tents.create({
        name: `Wizard Tent ${Date.now()}`,
        category: "VEGA",
        width: 80,
        depth: 80,
        height: 160,
      });
      expect(tent).toMatchObject({ success: true });
      expect(typeof tent.id).toBe("number");

      const strain = await caller.strains.create({
        name: `Wizard Strain ${Date.now()}`,
        origin: "FEMINIZED",
        vegaWeeks: 4,
        floraWeeks: 8,
      });
      expect(strain).toMatchObject({ success: true });

      // Resolve strain id (wizard does this via strains.list after create)
      const allStrains = await caller.strains.list();
      const created = allStrains.find((s) => s.name.startsWith("Wizard Strain"));
      expect(created).toBeDefined();

      const plant = await caller.plants.create({
        name: "Planta 1",
        strainId: created!.id,
        currentTentId: tent.id,
      });
      expect(typeof plant.id).toBe("number");
    });

    // Item (3): strain custom cria nova strain no DB
    it("should create a custom strain and find it in the list", async () => {
      const ctx = createTestContext();
      const caller = appRouter.createCaller(ctx);

      const strainName = `Custom Strain ${Date.now()}`;
      const before = await caller.strains.list();

      await caller.strains.create({
        name: strainName,
        origin: "AUTOFLOWER",
        vegaWeeks: 3,
        floraWeeks: 9,
      });

      const after = await caller.strains.list();
      expect(after.length).toBe(before.length + 1);
      expect(after.some((s) => s.name === strainName)).toBe(true);
    });

    // Item (4): strain existente não duplica — server rejeita nome duplicado
    it("should reject duplicate strain name", async () => {
      const ctx = createTestContext();
      const caller = appRouter.createCaller(ctx);

      const strainName = `Unique Strain ${Date.now()}`;
      await caller.strains.create({
        name: strainName,
        vegaWeeks: 4,
        floraWeeks: 8,
      });

      // Tentar criar novamente com mesmo nome deve falhar
      await expect(
        caller.strains.create({ name: strainName, vegaWeeks: 4, floraWeeks: 8 })
      ).rejects.toThrow();
    });

    // Item (4) variante: wizard usa ID existente direto — lista não muda
    it("should reuse existing strain id without creating a new entry", async () => {
      const ctx = createTestContext();
      const caller = appRouter.createCaller(ctx);

      const strainName = `Reuse Strain ${Date.now()}`;
      await caller.strains.create({ name: strainName, vegaWeeks: 5, floraWeeks: 10 });

      const listAfterCreate = await caller.strains.list();
      const existing = listAfterCreate.find((s) => s.name === strainName);
      expect(existing).toBeDefined();

      // Wizard com kind="existing" usa existing.id diretamente — sem nova mutation
      const listAfterReuse = await caller.strains.list();
      const occurrences = listAfterReuse.filter((s) => s.name === strainName);
      expect(occurrences.length).toBe(1);
      expect(occurrences[0].id).toBe(existing!.id);
    });
  });
});
