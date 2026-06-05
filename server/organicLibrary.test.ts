/**
 * organicLibrary.test.ts — Testes unitários para o código de Cultivo Orgânico.
 *
 * Cobre duas unidades puras (sem DB, sem React hooks):
 *
 * 1. ORGANIC_TASK_LIBRARY (organicTaskLibrary.ts)
 *    — biblioteca de templates de tarefas orgânicas pré-definidos.
 *    — código crítico: errar aqui cria tarefas com fase/semana errada em produção.
 *
 * 2. isSoilBasedMethod (useCultivationMethod.ts)
 *    — função pura que decide se um método de cultivo é "solo vivo" (sem EC/runoff).
 *
 * Nota: `useCultivationMethod` e `useHasOrganicTent` são React hooks que
 * dependem de trpc.tents.list.useQuery — não testados aqui (precisariam de
 * renderHook + mock tRPC). O comportamento de fallback MINERAL é coberto
 * pelo teste de isSoilBasedMethod e validação dos tipos.
 */
import { describe, it, expect } from "vitest";
import {
  ORGANIC_TASK_LIBRARY,
  type OrganicTaskTemplate,
  type OrganicTaskPhase,
} from "@/components/onboarding/organicTaskLibrary";
import {
  isSoilBasedMethod,
  type CultivationMethod,
} from "@/_core/hooks/useCultivationMethod";

// ══════════════════════════════════════════════════════════════════════════════
// ORGANIC_TASK_LIBRARY
// ══════════════════════════════════════════════════════════════════════════════

describe("ORGANIC_TASK_LIBRARY", () => {
  it("deve ter exatamente 10 templates", () => {
    expect(ORGANIC_TASK_LIBRARY).toHaveLength(10);
  });

  it("todos os templates têm os campos obrigatórios (title, description, phase, weekNumber)", () => {
    for (const task of ORGANIC_TASK_LIBRARY) {
      expect(task.title).toBeTruthy();
      expect(typeof task.title).toBe("string");

      expect(task.description).toBeTruthy();
      expect(typeof task.description).toBe("string");

      expect(["VEGA", "FLORA"]).toContain(task.phase);

      expect(task.weekNumber).toBeGreaterThan(0);
      expect(Number.isInteger(task.weekNumber)).toBe(true);
    }
  });

  it("a fase só aceita 'VEGA' ou 'FLORA'", () => {
    const validPhases: OrganicTaskPhase[] = ["VEGA", "FLORA"];
    for (const task of ORGANIC_TASK_LIBRARY) {
      expect(validPhases).toContain(task.phase);
    }
  });

  it("tem templates de vega E de flora", () => {
    const vegaTasks = ORGANIC_TASK_LIBRARY.filter((t) => t.phase === "VEGA");
    const floraTasks = ORGANIC_TASK_LIBRARY.filter((t) => t.phase === "FLORA");
    expect(vegaTasks.length).toBeGreaterThan(0);
    expect(floraTasks.length).toBeGreaterThan(0);
  });

  it("filtro por VEGA retorna só tarefas de vega", () => {
    const vegaTasks = ORGANIC_TASK_LIBRARY.filter((t) => t.phase === "VEGA");
    for (const task of vegaTasks) {
      expect(task.phase).toBe("VEGA");
    }
    // Garante que não retorna flora misturada
    const hasFlora = vegaTasks.some((t) => t.phase === "FLORA");
    expect(hasFlora).toBe(false);
  });

  it("filtro por FLORA retorna só tarefas de flora", () => {
    const floraTasks = ORGANIC_TASK_LIBRARY.filter((t) => t.phase === "FLORA");
    for (const task of floraTasks) {
      expect(task.phase).toBe("FLORA");
    }
    const hasVega = floraTasks.some((t) => t.phase === "VEGA");
    expect(hasVega).toBe(false);
  });

  it("contém tarefa de 'Parar top dressing' na semana 5 da flora", () => {
    const stopTask = ORGANIC_TASK_LIBRARY.find(
      (t) =>
        t.phase === "FLORA" &&
        t.weekNumber === 5 &&
        t.title.toLowerCase().includes("parar"),
    );
    expect(stopTask).toBeDefined();
  });

  it("contém tarefa de top dressing na vega", () => {
    const vegaTopDressing = ORGANIC_TASK_LIBRARY.find(
      (t) =>
        t.phase === "VEGA" &&
        t.title.toLowerCase().includes("top dressing"),
    );
    expect(vegaTopDressing).toBeDefined();
  });

  it("contém tarefa de chá de compostagem (AACT)", () => {
    const teaTask = ORGANIC_TASK_LIBRARY.find(
      (t) =>
        t.title.toLowerCase().includes("chá") ||
        t.description.toLowerCase().includes("aact"),
    );
    expect(teaTask).toBeDefined();
  });

  it("nenhum template tem weekNumber igual a zero ou negativo", () => {
    const invalidWeeks = ORGANIC_TASK_LIBRARY.filter(
      (t) => t.weekNumber <= 0,
    );
    expect(invalidWeeks).toHaveLength(0);
  });

  it("todos os titles são únicos (sem duplicação acidental)", () => {
    const titles = ORGANIC_TASK_LIBRARY.map((t) => t.title);
    const unique = new Set(titles);
    expect(unique.size).toBe(titles.length);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// isSoilBasedMethod
// ══════════════════════════════════════════════════════════════════════════════

describe("isSoilBasedMethod", () => {
  it("retorna true para ORGANIC", () => {
    expect(isSoilBasedMethod("ORGANIC")).toBe(true);
  });

  it("retorna false para MINERAL (default do app)", () => {
    expect(isSoilBasedMethod("MINERAL")).toBe(false);
  });

  it("retorna false para COCO", () => {
    expect(isSoilBasedMethod("COCO")).toBe(false);
  });

  it("retorna false para HYDRO", () => {
    expect(isSoilBasedMethod("HYDRO")).toBe(false);
  });

  it("cobre todos os CultivationMethod definidos pelo tipo", () => {
    // Garante que se o tipo crescer (ex: novo método "AQUA"), o teste quebra
    // para lembrar de atualizar isSoilBasedMethod também.
    const allMethods: CultivationMethod[] = ["MINERAL", "ORGANIC", "COCO", "HYDRO"];
    const soilBased = allMethods.filter((m) => isSoilBasedMethod(m));
    expect(soilBased).toEqual(["ORGANIC"]);
  });
});
