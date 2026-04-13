/**
 * Tuya Sensor Poller
 *
 * Roda a cada 15 min e verifica, para cada usuário com integração ativa,
 * se já passou o intervalo configurado (pollIntervalMin) desde a última leitura.
 * Se sim, busca temperatura e umidade de cada dispositivo mapeado.
 *
 * Intervalos pré-definidos (em minutos):
 *   30  → a cada 30 min
 *   60  → a cada hora
 *   180 → a cada 3 horas
 *   480 → 3x ao dia (~8h)
 *   720 → 2x ao dia (~12h)
 */

import cron from "node-cron";
import { readTuyaDeviceStatus, type TuyaRegion } from "../lib/tuya";

async function pollAllUsers() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;

  const mysql = await import("mysql2/promise");
  const conn = await mysql.default.createConnection(connectionString);

  try {
    // Busca todos os configs ativos com seus mapeamentos
    const [rows]: any = await conn.execute(`
      SELECT
        tc.userId,
        tc.accessId,
        tc.accessSecret,
        tc.region,
        tc.pollIntervalMin,
        tsm.tentId,
        tsm.deviceId,
        tsm.deviceName,
        COALESCE(slr.readAt, '2000-01-01') AS lastReadAt
      FROM tuyaConfig tc
      INNER JOIN tuyaSensorMappings tsm ON tsm.userId = tc.userId AND tsm.enabled = 1
      LEFT JOIN sensorLatestReadings slr ON slr.deviceId = tsm.deviceId
      WHERE tc.enabled = 1
    `);

    const now = Date.now();

    for (const row of rows as any[]) {
      const intervalMs = (row.pollIntervalMin ?? 60) * 60 * 1000;
      const lastRead = new Date(row.lastReadAt).getTime();

      if (now - lastRead < intervalMs) continue; // ainda não é hora

      try {
        const reading = await readTuyaDeviceStatus(
          row.deviceId,
          row.accessId,
          row.accessSecret,
          row.region as TuyaRegion
        );

        // Upsert na tabela de leituras
        await conn.execute(
          `INSERT INTO sensorLatestReadings (userId, deviceId, tempC, rhPct, readAt)
           VALUES (?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             tempC  = VALUES(tempC),
             rhPct  = VALUES(rhPct),
             readAt = NOW()`,
          [row.userId, row.deviceId, reading.tempC ?? null, reading.rhPct ?? null]
        );

        console.log(
          `[TuyaPoller] device=${row.deviceId} tent=${row.tentId}`,
          `temp=${reading.tempC}°C rh=${reading.rhPct}%`
        );
      } catch (err: any) {
        console.warn(`[TuyaPoller] Erro no device ${row.deviceId}:`, err?.message);
      }
    }
  } finally {
    await conn.end();
  }
}

export function startTuyaPollerCron() {
  // Verifica a cada 15 minutos se algum dispositivo precisa ser lido
  cron.schedule("*/15 * * * *", async () => {
    try {
      await pollAllUsers();
    } catch (err: any) {
      console.warn("[TuyaPoller] Erro geral:", err?.message);
    }
  });
  console.log("[TuyaPoller] Cron iniciado (verifica a cada 15 min)");
}
