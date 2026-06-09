import { getMysqlPool } from '../mysql-pool';

/**
 * Cria tabela waitlist_email_log se não existir.
 * Rastreia emails de sequência de nutrição (D+3, D+14) por inscrito na waitlist.
 * Chamada na inicialização do cron waitlistNurture.
 * Não toca em drizzle/schema.ts — é uma tabela auxiliar de runtime.
 */
export async function ensureWaitlistEmailLogTable(): Promise<void> {
  const pool = getMysqlPool();
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS waitlist_email_log (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      email      VARCHAR(200) NOT NULL,
      email_type VARCHAR(20)  NOT NULL,
      sent_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_email_type (email, email_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}
