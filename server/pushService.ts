/**
 * Web Push Service — App Cultivo
 *
 * Subscriptions são associadas a um `userId` (e `groupId` opcional). Funções de
 * envio filtram pelo destinatário correto — alertas de uma estufa do Grupo A
 * NÃO chegam aos celulares do Grupo B.
 *
 * Persistência: tabela `pushSubscriptions` com FK para `users.id` (CASCADE).
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

// ── Subscription persistence ─────────────────────────────────────────────────

/**
 * Salvar/atualizar subscription do usuário autenticado.
 *
 * @param userId  — ID do usuário dono do dispositivo (obrigatório)
 * @param groupId — Grupo do usuário (cache para queries rápidas; pode ser null)
 */
export async function saveSubscription(
  subscription: webpush.PushSubscription,
  userId: number,
  groupId: number | null,
  options?: {
    reminderEnabled?: boolean;
    reminderTimes?: string[];
    timezone?: string;
  },
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
    const reminderTimesJson = options?.reminderTimes ? JSON.stringify(options.reminderTimes) : null;

    const existing = await database
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, subscription.endpoint))
      .limit(1);

    if (existing.length > 0) {
      // Atualiza — incluindo userId/groupId (caso usuário tenha mudado de grupo,
      // ou subscription seja "transferida" via re-subscribe noutra conta).
      await database
        .update(pushSubscriptions)
        .set({
          userId,
          groupId,
          keysJson,
          reminderEnabled: options?.reminderEnabled ?? existing[0].reminderEnabled,
          reminderTimes: reminderTimesJson ?? existing[0].reminderTimes,
          timezone: options?.timezone ?? existing[0].timezone,
        })
        .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
    } else {
      await database.insert(pushSubscriptions).values({
        userId,
        groupId,
        endpoint: subscription.endpoint,
        keysJson,
        reminderEnabled: options?.reminderEnabled ?? false,
        reminderTimes: reminderTimesJson,
        timezone: options?.timezone ?? null,
      });
    }

    console.log(`[PushService] Subscription saved (user=${userId}): ${subscription.endpoint.slice(-20)}`);
  } catch (error) {
    console.error("[PushService] Error saving subscription:", error);
  }
}

/**
 * Remover subscription pelo endpoint
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

// ── Subscription queries (filtradas) ─────────────────────────────────────────

interface StoredSubscription {
  endpoint: string;
  keysJson: string;
  userId: number;
  groupId: number | null;
  reminderEnabled: boolean;
  reminderTimes: string | null;
  timezone: string | null;
}

async function getSubscriptionsForUser(userId: number): Promise<StoredSubscription[]> {
  try {
    const { getDb } = await import("./db");
    const { pushSubscriptions } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    const database = await getDb();
    if (!database) return [];

    return await database
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId)) as StoredSubscription[];
  } catch (error) {
    console.error("[PushService] Error fetching subscriptions for user:", error);
    return [];
  }
}

async function getSubscriptionsForGroup(groupId: number): Promise<StoredSubscription[]> {
  try {
    const { getDb } = await import("./db");
    const { pushSubscriptions } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    const database = await getDb();
    if (!database) return [];

    return await database
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.groupId, groupId)) as StoredSubscription[];
  } catch (error) {
    console.error("[PushService] Error fetching subscriptions for group:", error);
    return [];
  }
}

/**
 * Apenas para uso interno do cron de lembretes diários — TODAS subscriptions.
 * Não exportada — não use para alertas.
 */
async function getAllSubscriptions(): Promise<StoredSubscription[]> {
  try {
    const { getDb } = await import("./db");
    const { pushSubscriptions } = await import("../drizzle/schema");

    const database = await getDb();
    if (!database) return [];

    return await database.select().from(pushSubscriptions) as StoredSubscription[];
  } catch (error) {
    console.error("[PushService] Error fetching subscriptions:", error);
    return [];
  }
}

// ── Send helpers ─────────────────────────────────────────────────────────────

interface PushPayload { title: string; body: string; url?: string; tag?: string }

/**
 * Envio paralelo com cleanup de subscriptions inválidas.
 * `Promise.allSettled` para que uma falha não bloqueie as outras.
 */
async function sendToSubscriptions(subs: StoredSubscription[], payload: PushPayload): Promise<number> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[PushService] VAPID not configured, skipping push");
    return 0;
  }
  if (subs.length === 0) return 0;

  const payloadStr = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/",
    tag: payload.tag || "cultivo-notification",
  });

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      let keys: any = {};
      try { keys = JSON.parse(sub.keysJson); } catch { /* ignore */ }
      const pushSub: webpush.PushSubscription = { endpoint: sub.endpoint, keys };
      try {
        await webpush.sendNotification(pushSub, payloadStr, { TTL: 86400 });
        return true;
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await removeSubscription(sub.endpoint);
        } else {
          console.error(`[PushService] Push error:`, err?.message);
        }
        throw err;
      }
    }),
  );

  return results.filter(r => r.status === "fulfilled").length;
}

/**
 * Enviar push para um usuário específico (todos os dispositivos dele).
 */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  const subs = await getSubscriptionsForUser(userId);
  const sent = await sendToSubscriptions(subs, payload);
  if (sent > 0) console.log(`[PushService] Sent ${sent} push(es) to user ${userId}`);
}

/**
 * Enviar push para todos os usuários de um grupo.
 * Use isto para alertas de estufa — o grupo dono da estufa recebe.
 */
export async function sendPushToGroup(groupId: number, payload: PushPayload): Promise<void> {
  const subs = await getSubscriptionsForGroup(groupId);
  const sent = await sendToSubscriptions(subs, payload);
  if (sent > 0) console.log(`[PushService] Sent ${sent} push(es) to group ${groupId}`);
}

/**
 * Broadcast a TODAS as subscriptions do sistema.
 *
 * ⚠️ Use APENAS para mensagens administrativas globais (manutenção planejada,
 * mudanças de termos, etc.). NUNCA use para alertas de estufa, plantas ou
 * qualquer dado por-grupo.
 */
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  const subs = await getAllSubscriptions();
  const sent = await sendToSubscriptions(subs, payload);
  if (sent > 0) console.log(`[PushService] Broadcast sent to ${sent} subscription(s)`);
}

/**
 * Enviar push para todos os usuários com role='admin'.
 * Usado para notificações administrativas (novo registro pendente, etc.).
 */
export async function sendPushToAdmins(payload: PushPayload): Promise<void> {
  try {
    const { getDb } = await import("./db");
    const { pushSubscriptions, users } = await import("../drizzle/schema");
    const { eq, inArray } = await import("drizzle-orm");
    const database = await getDb();
    if (!database) return;

    const adminIds = (await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))).map((r: { id: number }) => r.id);
    if (adminIds.length === 0) return;

    const subs = await database
      .select()
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, adminIds)) as StoredSubscription[];

    const sent = await sendToSubscriptions(subs, payload);
    if (sent > 0) console.log(`[PushService] Sent ${sent} push(es) to ${adminIds.length} admin(s)`);
  } catch (err) {
    console.error("[PushService] sendPushToAdmins error:", (err as any)?.message);
  }
}

// ── Helpers públicos ─────────────────────────────────────────────────────────

export function getVapidPublicKey(): string { return VAPID_PUBLIC_KEY; }
export function isPushConfigured(): boolean { return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY); }

// ── Daily reminders ──────────────────────────────────────────────────────────

/**
 * Verificar e enviar lembretes diários para subscriptions com horários
 * configurados. Suporta timezone por subscription (default: America/Sao_Paulo).
 *
 * Idealmente chamado a cada minuto pelo cron.
 */
export async function checkAndSendDailyReminders(): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const allSubs = await getAllSubscriptions();
  let sent = 0;

  for (const sub of allSubs) {
    if (!sub.reminderTimes) continue;

    let times: string[] = [];
    try { times = JSON.parse(sub.reminderTimes); } catch { continue; }
    if (times.length === 0) continue;

    // Hora local da subscription (timezone armazenado, fallback Brasília)
    const tz = sub.timezone || "America/Sao_Paulo";
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const hour = parts.find(p => p.type === "hour")?.value ?? "00";
    const minute = parts.find(p => p.type === "minute")?.value ?? "00";
    const currentTime = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;

    if (!times.includes(currentTime)) continue;

    // Apenas para o dispositivo deste usuário — não vaza
    const pushed = await sendToSubscriptions([sub], {
      title: "📝 Hora de Registrar!",
      body: "Não esqueça de registrar os dados das suas estufas.",
      url: "/quick-log",
      tag: "daily-reminder",
    });
    sent += pushed;
  }

  if (sent > 0) console.log(`[PushService] Sent ${sent} daily reminder(s)`);
}
