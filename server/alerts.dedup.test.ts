import { describe, it, expect, afterAll } from 'vitest';
import { and, eq, gte } from 'drizzle-orm';
import { checkAlertsForTent, getDb } from './db';
import { alerts, alertHistory, dailyLogs } from '../drizzle/schema';
import { DB_AVAILABLE } from './test-helpers';

/**
 * Anti-inundação de alertas — `checkAlertsForTent` (db.ts).
 *
 * Com uma condição persistente fora de faixa (ex: umidade alta), só pode existir
 * 1 alerta ATIVO (status NEW) por estufa+métrica. Sem o dedup primário (que checa
 * `alerts.status='NEW'`), a tabela `alerts` enchia (gerava ~1/seg) e o SSE afogava
 * o display ESP → reboot-loop. (backlog: dedup de alertas vazando)
 */
describe.skipIf(!DB_AVAILABLE)('Alerts — dedup anti-inundação (1 alerta ativo por condição)', () => {
  const TENT = 1; // estufa de Manutenção (seed) — tem idealValues via safetyLimits
  const createdLogIds: number[] = [];

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const id of createdLogIds) {
      await db.delete(dailyLogs).where(eq(dailyLogs.id, id));
    }
    await db.delete(alerts).where(
      and(eq(alerts.tentId, TENT), eq(alerts.metric, 'RH'), eq(alerts.status, 'NEW')),
    );
  });

  it('rodar a verificação 2x pra a mesma condição cria EXATAMENTE 1 alerta ativo', async () => {
    const db = await getDb();
    if (!db) return;

    // Estado conhecido: zera alertas NEW de RH + o cooldown recente (alertHistory <2h)
    await db.delete(alerts).where(
      and(eq(alerts.tentId, TENT), eq(alerts.metric, 'RH'), eq(alerts.status, 'NEW')),
    );
    await db.delete(alertHistory).where(
      and(
        eq(alertHistory.tentId, TENT),
        eq(alertHistory.metric, 'RH'),
        gte(alertHistory.createdAt, new Date(Date.now() - 2 * 60 * 60 * 1000)),
      ),
    );

    // Condição persistente: log RECENTE com RH extremo (99% > qualquer faixa)
    const res = await db.insert(dailyLogs).values({
      tentId: TENT,
      logDate: new Date(),
      turn: 'PM',
      rhPct: '99.0',
      source: 'TEST',
    });
    const insertId = (res as unknown as Array<{ insertId?: number }>)[0]?.insertId;
    if (insertId) createdLogIds.push(Number(insertId));

    // Verifica DUAS vezes a MESMA condição (a 2ª deve ser deduplicada)
    await checkAlertsForTent(TENT);
    await checkAlertsForTent(TENT);

    // Dedup: só pode existir 1 alerta NEW de RH (sem o fix a 2ª criaria outro → 2)
    const news = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(and(eq(alerts.tentId, TENT), eq(alerts.metric, 'RH'), eq(alerts.status, 'NEW')));

    expect(news.length).toBe(1);
  }, 20000);
});
