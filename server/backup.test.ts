import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { createTestContext } from "./test-helpers";

describe("Backup System", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createTestContext());
  });

  it("should export backup with all data", async () => {
    const backup = await caller.backup.export();

    // Verificar estrutura do backup
    expect(backup).toHaveProperty("version");
    expect(backup).toHaveProperty("exportDate");
    expect(backup).toHaveProperty("data");
    expect(backup.version).toBe("1.0");

    // Verificar que todas as tabelas estão presentes
    expect(backup.data).toHaveProperty("tents");
    expect(backup.data).toHaveProperty("strains");
    expect(backup.data).toHaveProperty("cycles");
    expect(backup.data).toHaveProperty("plants");
    expect(backup.data).toHaveProperty("dailyLogs");
    expect(backup.data).toHaveProperty("taskTemplates");
    expect(backup.data).toHaveProperty("alertSettings");
    expect(backup.data).toHaveProperty("alerts");
    expect(backup.data).toHaveProperty("plantPhotos");
    expect(backup.data).toHaveProperty("plantHealthLogs");
    expect(backup.data).toHaveProperty("recipeTemplates");
    expect(backup.data).toHaveProperty("nutrientApplications");
    expect(backup.data).toHaveProperty("wateringApplications");

    // Verificar que são arrays
    expect(Array.isArray(backup.data.tents)).toBe(true);
    expect(Array.isArray(backup.data.strains)).toBe(true);
  });

  it("should reject backup with invalid version", async () => {
    const invalidBackup = {
      version: "2.0",
      exportDate: new Date().toISOString(),
      data: {},
    };

    await expect(caller.backup.import(invalidBackup)).rejects.toThrow(
      "Versão de backup não suportada"
    );
  });

  it("should import and restore backup successfully", async () => {
    // Primeiro, exportar backup atual
    const originalBackup = await caller.backup.export();
    const originalTentCount = originalBackup.data.tents.length;

    // Criar dados de teste
    const database = await getDb();
    if (!database) throw new Error("Database not available");

    const uniqueName = `Test Tent ${Date.now()}`;
    const testTent = await caller.tents.create({
      name: uniqueName,
      category: "VEGA",
      width: 100,
      depth: 100,
      height: 200,
    });

    // Exportar novo backup com dados de teste
    const backupWithTest = await caller.backup.export();

    // Verificar que o backup contém a estufa de teste
    expect(backupWithTest.data.tents.length).toBe(originalTentCount + 1);
    const tentInBackup = backupWithTest.data.tents.find(
      (t: any) => t.name === uniqueName
    );
    expect(tentInBackup).toBeDefined();

    // Importar backup original (restaurar estado anterior)
    // JSON.parse(JSON.stringify(...)) converte Date objects em strings ISO,
    // que é o que o schema Zod do backup.import espera (string | number | boolean | null)
    const result = await caller.backup.import(JSON.parse(JSON.stringify(originalBackup)));
    expect(result.success).toBe(true);
    expect(result.message).toBe("Backup restaurado com sucesso");

    // Verificar que voltou ao estado original
    const tentsAfterRestore = await caller.tents.list();
    expect(tentsAfterRestore.length).toBe(originalTentCount);
    const testTentAfterRestore = tentsAfterRestore.find(
      (t) => t.name === uniqueName
    );
    expect(testTentAfterRestore).toBeUndefined();
  });
});
