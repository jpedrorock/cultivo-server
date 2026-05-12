import cron from "node-cron";
import { checkAndSendDailyReminders } from "../pushService";

/**
 * Cron job de lembretes diários — dispara a cada MINUTO.
 *
 * Antes era "0 * * * *" (a cada hora no minuto :00) com checkAndSend
 * comparando contra "HH:MM" — usuários que configuravam lembrete em
 * 09:30, 12:15, etc. nunca recebiam (apenas :00 batia).
 *
 * Custo: 1 query SELECT * FROM pushSubscriptions por minuto. Para
 * volume típico (<1000 subscriptions) é trivial. Caso cresça, mover
 * para tabela `cron_state(name, lastRunAt)` com lock + persist nextRun
 * por subscription.
 */
export function startDailyReminderCron() {
  const task = cron.schedule("* * * * *", async () => {
    try {
      await checkAndSendDailyReminders();
    } catch (error) {
      console.error("[DailyReminder] Erro no cron job:", error);
    }
  });

  console.log("[DailyReminder] Cron iniciado: verificação de lembretes a cada minuto");
  return task;
}
