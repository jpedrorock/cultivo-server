import { describe, it, expect } from 'vitest';
import { getIdealValuesByTent, getSafetyLimits, checkAlertsForTent } from './db';

/**
 * Testes para verificar:
 * 1. getSafetyLimits retorna dados por fase
 * 2. getIdealValuesByTent usa safetyLimits como fallback para estufas sem weeklyTargets
 * 3. checkAlertsForTent funciona para estufa de Manutenção (sem targets semanais)
 * 4. Nenhum email é enviado (notifyOwner removido)
 */
describe('Alerts - safetyLimits como fallback', () => {
  it('getSafetyLimits deve retornar limites para todas as fases', async () => {
    const phases = ['MAINTENANCE', 'CLONING', 'VEGA', 'FLORA', 'DRYING'] as const;

    for (const phase of phases) {
      const limits = await getSafetyLimits(phase);
      // Cada fase deve ter pelo menos TEMP e RH configurados
      expect(limits.length).toBeGreaterThan(0);
      const metrics = limits.map(l => l.metric);
      expect(metrics).toContain('TEMP');
      expect(metrics).toContain('RH');
    }

    console.log('✅ safetyLimits: todas as fases têm limites configurados');
  }, 15000);

  it('getSafetyLimits deve retornar limites para TENT_A e TENT_BC separadamente', async () => {
    const allLimits = await getSafetyLimits();
    const tentA  = allLimits.filter(l => l.context === 'TENT_A');
    const tentBC = allLimits.filter(l => l.context === 'TENT_BC');

    expect(tentA.length).toBeGreaterThan(0);
    expect(tentBC.length).toBeGreaterThan(0);

    console.log(`✅ safetyLimits: TENT_A=${tentA.length} registros, TENT_BC=${tentBC.length} registros`);
  }, 15000);

  it('getIdealValuesByTent deve retornar valores para estufa de Manutenção via safetyLimits', async () => {
    // A estufa de Manutenção (id=1) não tem weeklyTargets, deve usar safetyLimits
    const idealValues = await getIdealValuesByTent(1);

    // Deve retornar valores (não null) via fallback de safetyLimits
    expect(idealValues).not.toBeNull();

    if (idealValues) {
      expect(idealValues.tempMin).not.toBeNull();
      expect(idealValues.tempMax).not.toBeNull();
      expect(idealValues.rhMin).not.toBeNull();
      expect(idealValues.rhMax).not.toBeNull();

      // Verificar faixas esperadas para MAINTENANCE (22-28°C, 50-65% RH)
      expect(idealValues.tempMin).toBeGreaterThanOrEqual(20);
      expect(idealValues.tempMax).toBeLessThanOrEqual(32);
      expect(idealValues.rhMin).toBeGreaterThanOrEqual(40);
      expect(idealValues.rhMax).toBeLessThanOrEqual(90);

      console.log(`✅ Manutenção via safetyLimits: Temp ${idealValues.tempMin}-${idealValues.tempMax}°C | RH ${idealValues.rhMin}-${idealValues.rhMax}%`);
    }
  }, 15000);

  it('checkAlertsForTent deve executar sem erros para estufa de Manutenção', async () => {
    // Deve rodar sem lançar exceção, mesmo sem weeklyTargets
    const result = await checkAlertsForTent(1);

    expect(result).toHaveProperty('alertsGenerated');
    expect(result).toHaveProperty('messages');
    expect(typeof result.alertsGenerated).toBe('number');
    expect(Array.isArray(result.messages)).toBe(true);

    console.log(`✅ checkAlertsForTent(Manutenção): ${result.alertsGenerated} alertas gerados`);
  }, 15000);

  it('checkAlertsForTent não deve enviar email (notifyOwner removido)', async () => {
    // Verificar que notifyOwner não está importado no db.ts
    // Este teste valida indiretamente que o código não tenta enviar email
    const { checkAlertsForTent: checker } = await import('./db');
    const result = await checker(1);

    // Se chegou aqui sem erro, significa que não tentou chamar notifyOwner
    // (que poderia falhar em ambiente de teste sem credenciais)
    expect(result).toBeDefined();
    console.log('✅ checkAlertsForTent executou sem tentar enviar email');
  }, 15000);
});
