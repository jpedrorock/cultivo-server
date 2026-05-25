import { describe, it, expect, beforeAll } from 'vitest';
import { appRouter } from './routers';
import { createTestContext, DB_AVAILABLE } from './test-helpers';

describe.skipIf(!DB_AVAILABLE)('Plant Health - Update and Delete', () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let testPlantId: number;
  let testHealthLogId: number;

  beforeAll(async () => {
    const ctx = createTestContext();
    caller = appRouter.createCaller(ctx);
    
    // First create tent and strain
    const tent = await caller.tents.create({
      name: "Test Tent Health",
      location: "Test Location",
      category: "VEGA",
      width: 120,
      depth: 120,
      height: 200,
    });

    const strainName = `Test Strain Health ${Date.now()}`;
    await caller.strains.create({
      name: strainName,
      vegaWeeks: 4,
      floraWeeks: 8,
    });

    // Fetch the created strain to get its ID
    const allStrains = await caller.strains.list();
    const strain = allStrains.find(s => s.name === strainName);
    if (!strain) throw new Error('Test strain not found');
    
    // Criar planta de teste
    await caller.plants.create({
      name: 'Test Plant Health',
      code: 'TPH-001',
      strainId: strain.id,
      currentTentId: tent.id,
      notes: 'Test plant for health operations'
    });
    
    // Buscar a planta criada para pegar o ID
    const plants = await caller.plants.list({ tentId: tent.id });
    const testPlant = plants.find(p => p.code === 'TPH-001');
    if (!testPlant) throw new Error('Test plant not found');
    testPlantId = testPlant.id;

    // Criar registro de saúde inicial
    await caller.plantHealth.create({
      plantId: testPlantId,
      healthStatus: 'HEALTHY',
      symptoms: 'Initial symptoms',
      treatment: 'Initial treatment',
      notes: 'Initial notes'
    });

    // Buscar o ID do registro criado
    const logs = await caller.plantHealth.list({ plantId: testPlantId });
    testHealthLogId = logs[0].id;
  });

  it('should update health log successfully', async () => {
    const result = await caller.plantHealth.update({
      id: testHealthLogId,
      healthStatus: 'STRESSED',
      symptoms: 'Updated symptoms',
      treatment: 'Updated treatment',
      notes: 'Updated notes'
    });

    expect(result.success).toBe(true);

    // Verificar se foi atualizado
    const logs = await caller.plantHealth.list({ plantId: testPlantId });
    const updatedLog = logs.find(l => l.id === testHealthLogId);
    
    expect(updatedLog).toBeDefined();
    expect(updatedLog?.healthStatus).toBe('STRESSED');
    expect(updatedLog?.symptoms).toBe('Updated symptoms');
    expect(updatedLog?.treatment).toBe('Updated treatment');
    expect(updatedLog?.notes).toBe('Updated notes');
  });

  it('should update only specified fields', async () => {
    // Atualizar apenas o status
    await caller.plantHealth.update({
      id: testHealthLogId,
      healthStatus: 'RECOVERING'
    });

    const logs = await caller.plantHealth.list({ plantId: testPlantId });
    const updatedLog = logs.find(l => l.id === testHealthLogId);
    
    expect(updatedLog?.healthStatus).toBe('RECOVERING');
    // Outros campos devem permanecer iguais
    expect(updatedLog?.symptoms).toBe('Updated symptoms');
  });

  it('should delete health log successfully', async () => {
    const result = await caller.plantHealth.delete({ id: testHealthLogId });
    expect(result.success).toBe(true);

    // Verificar se foi deletado
    const logs = await caller.plantHealth.list({ plantId: testPlantId });
    const deletedLog = logs.find(l => l.id === testHealthLogId);
    
    expect(deletedLog).toBeUndefined();
  });

  it('should handle multiple health logs per plant', async () => {
    // Criar múltiplos registros
    await caller.plantHealth.create({
      plantId: testPlantId,
      healthStatus: 'HEALTHY',
      symptoms: 'Log 1'
    });

    await caller.plantHealth.create({
      plantId: testPlantId,
      healthStatus: 'STRESSED',
      symptoms: 'Log 2'
    });

    await caller.plantHealth.create({
      plantId: testPlantId,
      healthStatus: 'SICK',
      symptoms: 'Log 3'
    });

    const logs = await caller.plantHealth.list({ plantId: testPlantId });
    expect(logs.length).toBeGreaterThanOrEqual(3);

    // Logs devem estar ordenados por data (mais recente primeiro)
    const dates = logs.map(l => new Date(l.logDate).getTime());
    const sortedDates = [...dates].sort((a, b) => b - a);
    expect(dates).toEqual(sortedDates);
  });
});
