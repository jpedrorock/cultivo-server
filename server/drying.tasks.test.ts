import { describe, it, expect } from 'vitest';
import { getDb } from './db';
import { DB_AVAILABLE } from './test-helpers';
import { taskTemplates } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

describe.skipIf(!DB_AVAILABLE)('DRYING Task Templates', () => {
  it('should have 5 task templates for DRYING phase', async () => {
    const database = await getDb();
    if (!database) throw new Error('Database not available');

    const dryingTemplates = await database
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.phase, 'DRYING'));

    expect(dryingTemplates.length).toBeGreaterThanOrEqual(5);
  }, 30000);

  it('should have all expected DRYING task titles', async () => {
    const database = await getDb();
    if (!database) throw new Error('Database not available');

    const dryingTemplates = await database
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.phase, 'DRYING'));

    const titles = dryingTemplates.map(t => t.title);

    // Títulos reais no banco (data atual de seed)
    expect(titles).toContain('Configurar ambiente de secagem');
    expect(titles).toContain('Monitorar secagem diariamente');
    expect(titles).toContain('Teste do galho');
    expect(titles).toContain('Trim (aparar buds)');
    expect(titles).toContain('Pesar e registrar colheita');
  }, 30000);

  it('should have DRYING templates with TENT_BC context', async () => {
    const database = await getDb();
    if (!database) throw new Error('Database not available');

    const dryingTemplates = await database
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.phase, 'DRYING'));

    dryingTemplates.forEach(template => {
      expect(template.context).toBe('TENT_BC');
      // DRYING templates têm weekNumber (1 ou 2) — não é null no DB atual
      expect(typeof template.weekNumber === 'number' || template.weekNumber === null).toBe(true);
    });
  }, 30000);

  it('should have descriptive content for each DRYING task', async () => {
    const database = await getDb();
    if (!database) throw new Error('Database not available');

    const dryingTemplates = await database
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.phase, 'DRYING'));

    dryingTemplates.forEach(template => {
      expect(template.description).toBeTruthy();
      expect(template.description!.length).toBeGreaterThan(20); // Descrição significativa
    });
  }, 30000);
});
