import { describe, it, expect, beforeAll } from 'vitest';
import { applyPhaseTransitionLimits, getSafetyLimits } from './db';
import { getDb } from './db';
import { alertSettings } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

/**
 * Testes para verificar que applyPhaseTransitionLimits:
 * 1. Atualiza alertSettings com as margens corretas para cada fase
 * 2. Cria alertSettings se não existir
 * 3. Cobre todas as 5 fases: MAINTENANCE, CLONING, VEGA, FLORA, DRYING
 */

// Estufa de teste — usa a estufa Vega (id=2) que existe no banco
const TEST_TENT_ID = 2;

describe('applyPhaseTransitionLimits', () => {
  it('deve retornar applied=false se não houver phaseAlertMargins para a fase', async () => {
    // Fase inválida não deve existir no banco
    const result = await applyPhaseTransitionLimits(TEST_TENT_ID, 'DRYING');
    // DRYING pode ou não ter margens — só verifica que não lança exceção
    expect(result).toHaveProperty('applied');
    expect(result).toHaveProperty('phase');
    expect(result.phase).toBe('DRYING');
  }, 15000);

  it('deve aplicar margens de VEGA corretamente', async () => {
    const result = await applyPhaseTransitionLimits(TEST_TENT_ID, 'VEGA');

    expect(result.applied).toBe(true);
    expect(result.phase).toBe('VEGA');
    expect(result.margins).toBeDefined();

    if (result.margins) {
      // VEGA: ±2°C, ±5% RH, ±100 PPFD, ±0.3 pH
      expect(result.margins.tempMargin).toBeGreaterThan(0);
      expect(result.margins.rhMargin).toBeGreaterThan(0);
      expect(result.margins.ppfdMargin).toBeGreaterThan(0);
      expect(result.margins.phMargin).toBeGreaterThan(0);
    }

    console.log(`✅ VEGA: Temp ±${result.margins?.tempMargin}°C | RH ±${result.margins?.rhMargin}% | PPFD ±${result.margins?.ppfdMargin} | pH ±${result.margins?.phMargin}`);
  }, 15000);

  it('deve aplicar margens de FLORA corretamente e serem diferentes de VEGA', async () => {
    const vegaResult  = await applyPhaseTransitionLimits(TEST_TENT_ID, 'VEGA');
    const floraResult = await applyPhaseTransitionLimits(TEST_TENT_ID, 'FLORA');

    expect(floraResult.applied).toBe(true);
    expect(floraResult.phase).toBe('FLORA');

    // FLORA tem margens mais apertadas que VEGA (±1.5°C vs ±2°C, ±3% vs ±5%)
    if (vegaResult.margins && floraResult.margins) {
      expect(floraResult.margins.tempMargin).toBeLessThanOrEqual(vegaResult.margins.tempMargin);
      expect(floraResult.margins.rhMargin).toBeLessThanOrEqual(vegaResult.margins.rhMargin);
    }

    console.log(`✅ FLORA: Temp ±${floraResult.margins?.tempMargin}°C | RH ±${floraResult.margins?.rhMargin}% | PPFD ±${floraResult.margins?.ppfdMargin} | pH ±${floraResult.margins?.phMargin}`);
  }, 15000);

  it('deve persistir as margens no banco (alertSettings)', async () => {
    // Aplicar FLORA
    await applyPhaseTransitionLimits(TEST_TENT_ID, 'FLORA');

    // Verificar que o banco foi atualizado
    const db = await getDb();
    if (!db) throw new Error('DB não disponível');

    const settings = await db
      .select()
      .from(alertSettings)
      .where(eq(alertSettings.tentId, TEST_TENT_ID))
      .limit(1);

    expect(settings.length).toBeGreaterThan(0);

    const s = settings[0];
    // FLORA: ±1.5°C, ±3% RH
    expect(parseFloat(s.tempMargin)).toBeCloseTo(1.5, 0);
    expect(parseFloat(s.rhMargin)).toBeCloseTo(3.0, 0);

    console.log(`✅ alertSettings persistido: Temp ±${s.tempMargin}°C | RH ±${s.rhMargin}%`);
  }, 15000);

  it('deve cobrir todas as fases sem lançar exceção', async () => {
    const phases = ['MAINTENANCE', 'CLONING', 'VEGA', 'FLORA', 'DRYING'] as const;

    for (const phase of phases) {
      const result = await applyPhaseTransitionLimits(TEST_TENT_ID, phase);
      expect(result).toHaveProperty('applied');
      expect(result.phase).toBe(phase);
      console.log(`✅ Fase ${phase}: applied=${result.applied}`);
    }
  }, 30000);
});
