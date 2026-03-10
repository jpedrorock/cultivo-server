/**
 * Web Push Service — App Cultivo
 * Gerencia subscriptions e envio de notificações push via VAPID
 * Subscriptions são persistidas no banco para sobreviver a restarts do servidor
 */
import webpush from "web-push";

// Configurar VAPID keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:admin@cultivo.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn("[PushService] VAPID keys not configured — Web Push disabled");
}

/**
 * Salvar ou atualizar subscription no banco de dados
 */
export async function saveSubscription(
  subscription: webpush.PushSubscription,
  reminderEnabled?: boolean,
  reminderTimes?: string[]
): Promise<void> {
  try {
    const { getDb } = await import("./db");
    const { pushSubscriptions } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    const database = await getDb();
    if (!database) {
      console.warn("[PushService] Database not available, subscription not persisted");
      return;
    }

    const keysJson = JSON.stringify((subscription as any).keys || {});
    const reminderTimesJson = reminderTimes ? JSON.stringify(reminderTimes) : null;

    // Verificar se já existe
    const existing = await database
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, subscription.endpoint))
      .limit(1);

    if (existing.length > 0) {
      // Atualizar
      await database
        .update(pushSubscriptions)
        .set({
          keysJson,
          reminderEnabled: reminderEnabled ?? existing[0].reminderEnabled,
          reminderTimes: reminderTimesJson ?? existing[0].reminderTimes,
        })
        .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
    } else {
      // Inserir novo
      await database.insert(pushSubscriptions).values({
        endpoint: subscription.endpoint,
        keysJson,
        reminderEnabled: reminderEnabled ?? false,
        reminderTimes: reminderTimesJson,
      });
    }

    console.log(`[PushService] Subscription saved to DB: ${subscription.endpoint.slice(-20)}`);
  } catch (error) {
    console.error("[PushService] Error saving subscription:", error);
  }
}

/**
 * Remover subscription do banco
 */
export async function removeSubscription(endpoint: string): Promise<void> {
  try {
    const { getDb } = await import("./db");
    const { pushSubscriptions } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    const database = await getDb();
    if (!database) return;

    await database
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));

    console.log(`[PushService] Subscription removed: ${endpoint.slice(-20)}`);
  } catch (error) {
    console.error("[PushService] Error removing subscription:", error);
  }
}

/**
 * Buscar todas as subscriptions do banco
 */
async function getAllSubscriptions(): Promise<Array<{
  endpoint: string;
  keysJson: string;
  reminderEnabled: boolean;
  reminderTimes: string | null;
}>> {
  try {
    const { getDb } = await import("./db");
    const { pushSubscriptions } = await import("../drizzle/schema");

    const database = await getDb();
    if (!database) return [];

    return await database.select().from(pushSubscriptions);
  } catch (error) {
    console.error("[PushService] Error fetching subscriptions:", error);
    return [];
  }
}

/**
 * Enviar notificação push para todos os dispositivos registrados
 */
export async function sendPushToAll(
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[PushService] VAPID not configured, skipping push");
    return;
  }

  const allSubs = await getAllSubscriptions();
  if (allSubs.length === 0) {
    console.log("[PushService] No subscriptions found");
    return;
  }

  const payloadStr = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/",
    tag: payload.tag || "cultivo-notification",
  });

  for (const sub of allSubs) {
    try {
      let keys: any = {};
      try { keys = JSON.parse(sub.keysJson); } catch {}

      const pushSub: webpush.PushSubscription = {
        endpoint: sub.endpoint,
        keys,
      };

      await webpush.sendNotification(pushSub, payloadStr, { TTL: 86400 });
    } catch (err: any) {
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        // Subscription expirada — remover do banco
        await removeSubscription(sub.endpoint);
        console.log(`[PushService] Removed expired subscription: ${sub.endpoint.slice(-20)}`);
      } else {
        console.error(`[PushService] Push error:`, err?.message);
      }
    }
  }
}

/**
 * Enviar notificação push para um endpoint específico (legado — mantido para compatibilidade)
 */
export async function sendPushToUser(
  _userId: number,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<void> {
  // Redireciona para sendPushToAll pois não temos userId por dispositivo
  await sendPushToAll(payload);
}

/**
 * Retornar a chave pública VAPID para o frontend
 */
export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

/**
 * Verificar se o Web Push está configurado
 */
export function isPushConfigured(): boolean {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

/**
 * Verificar e enviar lembretes diários para dispositivos com horários configurados
 * Chamado a cada minuto pelo cron job
 */
export async function checkAndSendDailyReminders(): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  // Usar horário de Brasília (UTC-3) independente do fuso do servidor
  const now = new Date();
  const brasiliaOffset = -3 * 60; // UTC-3 em minutos
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const brasiliaMinutes = ((utcMinutes + brasiliaOffset) % (24 * 60) + 24 * 60) % (24 * 60);
  const currentHour = Math.floor(brasiliaMinutes / 60).toString().padStart(2, "0");
  const currentMinute = (brasiliaMinutes % 60).toString().padStart(2, "0");
  const currentTime = `${currentHour}:${currentMinute}`;

  console.log(`[DailyReminder] Verificando horário Brasília: ${currentTime} (UTC: ${now.getUTCHours().toString().padStart(2,'0')}:${now.getUTCMinutes().toString().padStart(2,'0')})`);

  const allSubs = await getAllSubscriptions();
  let sent = 0;

  for (const sub of allSubs) {
    // Enviar se tiver horários configurados (reminderEnabled é opcional — a presença de horários é suficiente)
    if (!sub.reminderTimes) continue;

    let times: string[] = [];
    try { times = JSON.parse(sub.reminderTimes); } catch { continue; }

    if (!times.includes(currentTime)) continue;

    try {
      let keys: any = {};
      try { keys = JSON.parse(sub.keysJson); } catch {}

      const pushSub: webpush.PushSubscription = {
        endpoint: sub.endpoint,
        keys,
      };

      const payload = JSON.stringify({
        title: "📝 Hora de Registrar!",
        body: "Não esqueça de registrar os dados das suas estufas.",
        url: "/quick-log",
        tag: "daily-reminder",
      });

      await webpush.sendNotification(pushSub, payload, { TTL: 3600 });
      sent++;
    } catch (err: any) {
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await removeSubscription(sub.endpoint);
      } else {
        console.error(`[PushService] Reminder push error:`, err?.message);
      }
    }
  }

  if (sent > 0) {
    console.log(`[PushService] Sent ${sent} daily reminder(s) at ${currentTime}`);
  }
}
