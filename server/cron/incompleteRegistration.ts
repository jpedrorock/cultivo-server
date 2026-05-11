import cron from "node-cron";
import { checkIncompleteRegistrationReminders } from "../pushService";

/**
 * Cron de "registro incompleto" — roda 1×/h.
 *
 * Por que 1×/h: dedup interno usa janela de 24h (notificationHistory),
 * então não tem sentido rodar mais frequente. Hourly garante que um user
 * que zerou às 9h vai receber notif em <1h, sem floodar o DB.
 *
 * Por que NÃO unificar com dailyReminder:
 *   - dailyReminder usa horário FIXO configurado pelo user, dispara
 *     em qualquer estufa (sem checagem)
 *   - incompleteRegistration roda hourly em background, só notifica
 *     estufas COM Tuya ativo E sem registro completo há 3 dias
 *   - Lógicas e cadências diferentes — separar mantém cada cron focado.
 */
export function startIncompleteRegistrationCron() {
  // Roda no minuto :07 de cada hora — desencontra do dailyReminder (:00)
  // pra não competir por conexão DB no mesmo segundo
  const task = cron.schedule("7 * * * *", async () => {
    try {
      await checkIncompleteRegistrationReminders();
    } catch (error) {
      console.error("[IncompleteRegistration] Erro no cron:", error);
    }
  });

  console.log("[IncompleteRegistration] Cron iniciado: verificação 1×/hora (estufas com Tuya, janela 3 dias)");
  return task;
}
