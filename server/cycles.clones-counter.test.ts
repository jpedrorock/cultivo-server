import { describe, it, expect, beforeEach } from "vitest";
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL!;

describe("Clones Counter System", () => {
  let connection: mysql.Connection;

  beforeEach(async () => {
    connection = await mysql.createConnection(DATABASE_URL);
    
    // Limpar dados de teste (ordem importa: FK constraints)
    await connection.query("DELETE FROM plants WHERE strainId >= 9100");
    await connection.query("DELETE FROM cycles WHERE id >= 9100");
    await connection.query("DELETE FROM tents WHERE id >= 9100");
    await connection.query("DELETE FROM strains WHERE id >= 9100");
  });

  it("should save clonesProduced when transitioning from CLONING to MAINTENANCE", async () => {
    // Criar strain de teste
    await connection.query(
      "INSERT INTO strains (id, name, vegaWeeks, floraWeeks) VALUES (9101, 'Test Strain', 4, 8)"
    );

    // Criar estufa de teste
    await connection.query(
      "INSERT INTO tents (id, name, category, width, depth, height, powerW, volume) VALUES (9101, 'Test Tent', 'MAINTENANCE', 60, 60, 120, 100, 432)"
    );

    // Criar ciclo em CLONING
    const cloningStartDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // 14 dias atrás
    await connection.query(
      "INSERT INTO cycles (id, tentId, strainId, startDate, cloningStartDate, status) VALUES (9101, 9101, 9101, DATE_SUB(NOW(), INTERVAL 21 DAY), ?, 'ACTIVE')",
      [cloningStartDate]
    );

    // Simular retorno para MAINTENANCE com 25 clones produzidos
    await connection.query(
      "UPDATE cycles SET cloningStartDate = NULL, clonesProduced = 25 WHERE id = 9101"
    );

    // Verificar se clonesProduced foi salvo
    const [rows] = await connection.query(
      "SELECT cloningStartDate, clonesProduced FROM cycles WHERE id = 9101"
    ) as any;

    expect(rows[0].cloningStartDate).toBeNull();
    expect(rows[0].clonesProduced).toBe(25);
  });

  it("should allow null clonesProduced when not specified", async () => {
    // Criar strain de teste
    await connection.query(
      "INSERT INTO strains (id, name, vegaWeeks, floraWeeks) VALUES (9102, 'Test Strain 2', 4, 8)"
    );

    // Criar estufa de teste
    await connection.query(
      "INSERT INTO tents (id, name, category, width, depth, height, powerW, volume) VALUES (9102, 'Test Tent 2', 'MAINTENANCE', 60, 60, 120, 100, 432)"
    );

    // Criar ciclo em CLONING
    const cloningStartDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await connection.query(
      "INSERT INTO cycles (id, tentId, strainId, startDate, cloningStartDate, status) VALUES (9102, 9102, 9102, DATE_SUB(NOW(), INTERVAL 14 DAY), ?, 'ACTIVE')",
      [cloningStartDate]
    );

    // Simular retorno para MAINTENANCE sem especificar clonesProduced
    await connection.query(
      "UPDATE cycles SET cloningStartDate = NULL WHERE id = 9102"
    );

    // Verificar que clonesProduced é null
    const [rows] = await connection.query(
      "SELECT clonesProduced FROM cycles WHERE id = 9102"
    ) as any;

    expect(rows[0].clonesProduced).toBeNull();
  });

  it("should preserve clonesProduced from previous cloning cycle", async () => {
    // Criar strain de teste
    await connection.query(
      "INSERT INTO strains (id, name, vegaWeeks, floraWeeks) VALUES (9103, 'Test Strain 3', 4, 8)"
    );

    // Criar estufa de teste
    await connection.query(
      "INSERT INTO tents (id, name, category, width, depth, height, powerW, volume) VALUES (9103, 'Test Tent 3', 'MAINTENANCE', 60, 60, 120, 100, 432)"
    );

    // Criar ciclo em MAINTENANCE com clonesProduced anterior
    await connection.query(
      "INSERT INTO cycles (id, tentId, strainId, startDate, clonesProduced, status) VALUES (9103, 9103, 9103, DATE_SUB(NOW(), INTERVAL 30 DAY), 18, 'ACTIVE')"
    );

    // Iniciar nova clonagem
    const cloningStartDate = new Date();
    await connection.query(
      "UPDATE cycles SET cloningStartDate = ? WHERE id = 9103",
      [cloningStartDate]
    );

    // Verificar que clonesProduced anterior foi preservado
    const [beforeRows] = await connection.query(
      "SELECT clonesProduced FROM cycles WHERE id = 9103"
    ) as any;

    expect(beforeRows[0].clonesProduced).toBe(18);

    // Retornar para MAINTENANCE com novo valor
    await connection.query(
      "UPDATE cycles SET cloningStartDate = NULL, clonesProduced = 22 WHERE id = 9103"
    );

    // Verificar que foi atualizado
    const [afterRows] = await connection.query(
      "SELECT clonesProduced FROM cycles WHERE id = 9103"
    ) as any;

    expect(afterRows[0].clonesProduced).toBe(22);
  });

  it("should accept zero clones produced", async () => {
    // Criar strain de teste
    await connection.query(
      "INSERT INTO strains (id, name, vegaWeeks, floraWeeks) VALUES (9104, 'Test Strain Clone Zero', 4, 8)"
    );

    // Criar estufa de teste
    await connection.query(
      "INSERT INTO tents (id, name, category, width, depth, height, powerW, volume) VALUES (9104, 'Test Tent 4', 'MAINTENANCE', 60, 60, 120, 100, 432)"
    );

    // Criar ciclo em CLONING
    const cloningStartDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await connection.query(
      "INSERT INTO cycles (id, tentId, strainId, startDate, cloningStartDate, status) VALUES (9104, 9104, 9104, DATE_SUB(NOW(), INTERVAL 14 DAY), ?, 'ACTIVE')",
      [cloningStartDate]
    );

    // Simular retorno para MAINTENANCE com 0 clones (falha na clonagem)
    await connection.query(
      "UPDATE cycles SET cloningStartDate = NULL, clonesProduced = 0 WHERE id = 9104"
    );

    // Verificar que aceita 0
    const [rows] = await connection.query(
      "SELECT clonesProduced FROM cycles WHERE id = 9104"
    ) as any;

    expect(rows[0].clonesProduced).toBe(0);
  });
});
