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
import { getMysqlPool } from "../mysql-pool";

async function pollAllUsers() {
  if (!process.env.DATABASE_URL) return;
  const pool = getMysqlPool();

  try {
    // Busca todos os configs ativos com seus mapeamentos
    const [rows]: any = await pool.execute(`
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
      // Default 480 (3x/dia) — protege contra estouro de quota Tuya Trial (26k/mês).
      // User pode reduzir intervalo manualmente em Settings -> SmartLife se quiser
      // monitoramento mais agressivo.
      const intervalMs = (row.pollIntervalMin ?? 480) * 60 * 1000;
      const lastRead = new Date(row.lastReadAt).getTime();

      if (now - lastRead < intervalMs) continue; // ainda não é hora

      try {
        // accessSecret está cifrado no banco — decifra (e migra v1 se legado)
        const { decryptAndMigrate } = await import("../aiCrypto");
        const accessSecret = await decryptAndMigrate(row.accessSecret, async (newCipher) => {
          await pool.execute(`UPDATE tuyaConfig SET accessSecret = ? WHERE userId = ?`, [newCipher, row.userId]);
        });

        const reading = await readTuyaDeviceStatus(
          row.deviceId,
          row.accessId,
          accessSecret,
          row.region as TuyaRegion
        );

        // Upsert na tabela de leituras
        await pool.execute(
          `INSERT INTO sensorLatestReadings (userId, deviceId, tempC, rhPct, readAt)
           VALUES (?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             tempC  = VALUES(tempC),
             rhPct  = VALUES(rhPct),
             readAt = NOW()`,
          [row.userId, row.deviceId, reading.tempC ?? null, reading.rhPct ?? null]
        );

        // Buscar última leitura manual para carregar pH, EC, ppfd etc.
        const [lastManual]: any = await pool.execute(
          `SELECT ph, ec, ppfd, wateringVolume, runoffCollected, runoffPercentage
           FROM dailyLogs
           WHERE tentId = ? AND (source = 'MANUAL' OR source IS NULL)
           ORDER BY logDate DESC LIMIT 1`,
          [row.tentId]
        );
        const prev = (lastManual as any[])[0] ?? {};

        // Upsert registro automático no dailyLogs — 1 registro por estufa por turno por dia
        // Usa logDate truncado na hora (sem minutos/segundos) para o ON DUPLICATE KEY funcionar
        // e atualiza tempC/rhPct a cada poll sem criar linhas extras
        const nowHour = new Date().getHours();
        const turn = nowHour < 18 ? 'AM' : 'PM';
        await pool.execute(
          `INSERT INTO dailyLogs
             (tentId, logDate, turn, tempC, rhPct, ph, ec, ppfd,
              wateringVolume, runoffCollected, runoffPercentage, source)
           VALUES (?, DATE_FORMAT(NOW(), '%Y-%m-%d %H:00:00'), ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AUTO')
           ON DUPLICATE KEY UPDATE
             tempC  = VALUES(tempC),
             rhPct  = VALUES(rhPct),
             source = 'AUTO'`,
          [row.tentId, turn,
           reading.tempC ?? null, reading.rhPct ?? null,
           prev.ph ?? null, prev.ec ?? null, prev.ppfd ?? null,
           prev.wateringVolume ?? null, prev.runoffCollected ?? null, prev.runoffPercentage ?? null]
        );

        console.log(
          `[TuyaPoller] device=${row.deviceId} tent=${row.tentId}`,
          `temp=${reading.tempC}°C rh=${reading.rhPct}%`
        );
      } catch (err: any) {
        console.warn(`[TuyaPoller] Erro no device ${row.deviceId}:`, err?.message);
      }
    }
  } catch (err: any) {
    console.warn("[TuyaPoller] Erro geral no pool:", err?.message);
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
