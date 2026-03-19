import cron from "node-cron";
import { checkAndSendDailyReminders } from "../pushService";

/**
 * Inicia o cron job de lembretes diários
 * Executa a cada minuto e verifica se algum dispositivo tem lembrete configurado para o horário atual
 */
export function startDailyReminderCron() {
  // Executa a cada hora (no minuto zero)
  const task = cron.schedule("0 * * * *", async () => {
    try {
      await checkAndSendDailyReminders();
    } catch (error) {
      console.error("[DailyReminder] Erro no cron job:", error);
    }
  });

  console.log("[DailyReminder] Cron job iniciado: verificação de lembretes a cada hora");
  return task;
}
