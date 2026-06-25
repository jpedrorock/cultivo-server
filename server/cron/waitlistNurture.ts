import cron from 'node-cron';
import { getMysqlPool } from '../mysql-pool';
import { sendNurtureEmail1, sendNurtureEmail2 } from '../_core/emailService';
import { ensureWaitlistEmailLogTable } from '../_core/dbMigrations';

async function processNurtureEmails(): Promise<void> {
  const pool = getMysqlPool();

  // D+3: inscritos há 3–4 dias que ainda não receberam nurture1
  const [d3rows] = await pool.execute<any[]>(
    `SELECT w.email, w.locale
     FROM waitlist w
     WHERE w.createdAt >= DATE_SUB(NOW(), INTERVAL 4 DAY)
       AND w.createdAt <  DATE_SUB(NOW(), INTERVAL 3 DAY)
       AND NOT EXISTS (
         SELECT 1 FROM waitlist_email_log l
         WHERE l.email = w.email AND l.email_type = 'nurture1'
       )
     LIMIT 50`,
  );

  for (const row of d3rows) {
    await sendNurtureEmail1(row.email, row.locale ?? 'en');
    await pool.execute(
      `INSERT IGNORE INTO waitlist_email_log (email, email_type) VALUES (?, 'nurture1')`,
      [row.email],
    );
  }

  // D+14: inscritos há 14–15 dias que ainda não receberam nurture2
  const [d14rows] = await pool.execute<any[]>(
    `SELECT w.email, w.locale
     FROM waitlist w
     WHERE w.createdAt >= DATE_SUB(NOW(), INTERVAL 15 DAY)
       AND w.createdAt <  DATE_SUB(NOW(), INTERVAL 14 DAY)
       AND NOT EXISTS (
         SELECT 1 FROM waitlist_email_log l
         WHERE l.email = w.email AND l.email_type = 'nurture2'
       )
     LIMIT 50`,
  );

  for (const row of d14rows) {
    await sendNurtureEmail2(row.email, row.locale ?? 'en');
    await pool.execute(
      `INSERT IGNORE INTO waitlist_email_log (email, email_type) VALUES (?, 'nurture2')`,
      [row.email],
    );
  }

  if (d3rows.length > 0 || d14rows.length > 0) {
    console.log(`[WaitlistNurture] D+3: ${d3rows.length} enviados, D+14: ${d14rows.length} enviados`);
  }
}

/**
 * Inicia o cron de emails de nutrição da waitlist.
 * Roda diariamente às 10:00 UTC.
 * Registrar no startup do servidor (ex: expressApp.ts).
 */
export async function startWaitlistNurtureCron(): Promise<void> {
  await ensureWaitlistEmailLogTable();

  cron.schedule('0 10 * * *', async () => {
    try {
      await processNurtureEmails();
    } catch (error) {
      console.error('[WaitlistNurture] Erro no cron:', error);
    }
  });

  console.log('[WaitlistNurture] Cron iniciado: emails D+3 e D+14 diariamente às 10:00 UTC');
}
