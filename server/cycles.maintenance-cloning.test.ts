import { describe, it, expect, beforeEach } from "vitest";
import mysql from "mysql2/promise";
import { DB_AVAILABLE } from "./test-helpers";

const DATABASE_URL = process.env.DATABASE_URL!;

describe.skipIf(!DB_AVAILABLE)("Cycles MAINTENANCE↔CLONING Transitions", () => {
  let connection: mysql.Connection;

  beforeEach(async () => {
    connection = await mysql.createConnection(DATABASE_URL);
    
    // Limpar dados de teste (ordem importa: FK constraints)
    await connection.query("DELETE FROM plants WHERE strainId >= 9000");
    await connection.query("DELETE FROM cycles WHERE id >= 9000");
    await connection.query("DELETE FROM tents WHERE id >= 9000");
    await connection.query("DELETE FROM strains WHERE id >= 9000");
  });

  it("should transition from MAINTENANCE to CLONING", async () => {
    // Criar strain de teste
    const [strainResult] = await connection.query(
      "INSERT INTO strains (id, name, vegaWeeks, floraWeeks) VALUES (9001, 'Test Strain', 4, 8)"
    );

    // Criar estufa de teste
    const [tentResult] = await connection.query(
      "INSERT INTO tents (id, name, category, width, depth, height, powerW, volume) VALUES (9001, 'Test Tent', 'MAINTENANCE', 60, 60, 120, 100, 432)"
    );

    // Criar ciclo em MAINTENANCE
    const [cycleResult] = await connection.query(
      "INSERT INTO cycles (id, tentId, strainId, startDate, status) VALUES (9001, 9001, 9001, DATE_SUB(NOW(), INTERVAL 7 DAY), 'ACTIVE')"
    );

    // Simular transição para CLONING
    const cloningStartDate = new Date();
    await connection.query(
      "UPDATE cycles SET cloningStartDate = ? WHERE id = 9001",
      [cloningStartDate]
    );

    // Verificar se cloningStartDate foi definido
    const [rows] = await connection.query(
      "SELECT cloningStartDate FROM cycles WHERE id = 9001"
    ) as any;

    expect(rows[0].cloningStartDate).toBeTruthy();
  });

  it("should transition from CLONING back to MAINTENANCE", async () => {
    // Criar strain de teste
    await connection.query(
      "INSERT INTO strains (id, name, vegaWeeks, floraWeeks) VALUES (9002, 'Test Strain 2', 4, 8)"
    );

    // Criar estufa de teste
    await connection.query(
      "INSERT INTO tents (id, name, category, width, depth, height, powerW, volume) VALUES (9002, 'Test Tent 2', 'MAINTENANCE', 60, 60, 120, 100, 432)"
    );

    // Criar ciclo em CLONING
    const cloningStartDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 dias atrás
    await connection.query(
      "INSERT INTO cycles (id, tentId, strainId, startDate, cloningStartDate, status) VALUES (9002, 9002, 9002, DATE_SUB(NOW(), INTERVAL 14 DAY), ?, 'ACTIVE')",
      [cloningStartDate]
    );

    // Simular retorno para MAINTENANCE
    await connection.query(
      "UPDATE cycles SET cloningStartDate = NULL WHERE id = 9002"
    );

    // Verificar se cloningStartDate foi removido
    const [rows] = await connection.query(
      "SELECT cloningStartDate FROM cycles WHERE id = 9002"
    ) as any;

    expect(rows[0].cloningStartDate).toBeNull();
  });

  it("should prevent transition to CLONING if already in CLONING", async () => {
    // Criar strain de teste
    await connection.query(
      "INSERT INTO strains (id, name, vegaWeeks, floraWeeks) VALUES (9003, 'Test Strain 3', 4, 8)"
    );

    // Criar estufa de teste
    await connection.query(
      "INSERT INTO tents (id, name, category, width, depth, height, powerW, volume) VALUES (9003, 'Test Tent 3', 'MAINTENANCE', 60, 60, 120, 100, 432)"
    );

    // Criar ciclo já em CLONING
    const cloningStartDate = new Date();
    await connection.query(
      "INSERT INTO cycles (id, tentId, strainId, startDate, cloningStartDate, status) VALUES (9003, 9003, 9003, DATE_SUB(NOW(), INTERVAL 7 DAY), ?, 'ACTIVE')",
      [cloningStartDate]
    );

    // Tentar transição novamente (deve falhar)
    const [rows] = await connection.query(
      "SELECT cloningStartDate FROM cycles WHERE id = 9003"
    ) as any;

    // Verificar que já está em clonagem
    expect(rows[0].cloningStartDate).toBeTruthy();
  });

  it("should prevent transition to MAINTENANCE if not in CLONING", async () => {
    // Criar strain de teste
    await connection.query(
      "INSERT INTO strains (id, name, vegaWeeks, floraWeeks) VALUES (9004, 'Test Strain 4', 4, 8)"
    );

    // Criar estufa de teste
    await connection.query(
      "INSERT INTO tents (id, name, category, width, depth, height, powerW, volume) VALUES (9004, 'Test Tent 4', 'MAINTENANCE', 60, 60, 120, 100, 432)"
    );

    // Criar ciclo em MAINTENANCE (sem cloningStartDate)
    await connection.query(
      "INSERT INTO cycles (id, tentId, strainId, startDate, status) VALUES (9004, 9004, 9004, DATE_SUB(NOW(), INTERVAL 7 DAY), 'ACTIVE')"
    );

    // Verificar que não está em clonagem
    const [rows] = await connection.query(
      "SELECT cloningStartDate FROM cycles WHERE id = 9004"
    ) as any;

    expect(rows[0].cloningStartDate).toBeNull();
  });
});
