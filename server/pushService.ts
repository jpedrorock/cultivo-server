/**
 * Web Push Service — App Cultivo
 * Gerencia subscriptions e envio de notificações push via VAPID
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

// Armazenamento em memória das subscriptions (por userId)
// Em produção, persistir no banco de dados
const subscriptions = new Map<number, webpush.PushSubscription[]>();

/**
 * Registrar ou atualizar subscription de um usuário
 */
export function saveSubscription(userId: number, subscription: webpush.PushSubscription): void {
  const existing = subscriptions.get(userId) || [];
  // Evitar duplicatas pelo endpoint
  const filtered = existing.filter((s) => s.endpoint !== subscription.endpoint);
  subscriptions.set(userId, [...filtered, subscription]);
  console.log(`[PushService] Subscription saved for user ${userId}`);
}

/**
 * Remover subscription de um usuário
 */
export function removeSubscription(userId: number, endpoint: string): void {
  const existing = subscriptions.get(userId) || [];
  subscriptions.set(
    userId,
    existing.filter((s) => s.endpoint !== endpoint)
  );
}

/**
 * Enviar notificação push para um usuário
 */
export async function sendPushToUser(
  userId: number,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[PushService] VAPID not configured, skipping push");
    return;
  }

  const userSubs = subscriptions.get(userId);
  if (!userSubs || userSubs.length === 0) {
    console.log(`[PushService] No subscriptions for user ${userId}`);
    return;
  }

  const payloadStr = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/",
    tag: payload.tag || "cultivo-notification",
  });

  const results = await Promise.allSettled(
    userSubs.map((sub) =>
      webpush.sendNotification(sub, payloadStr, {
        TTL: 86400, // 24 horas
      })
    )
  );

  // Remover subscriptions inválidas (expiradas ou canceladas)
  const valid: webpush.PushSubscription[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      valid.push(userSubs[index]);
    } else {
      const err = result.reason as any;
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        console.log(`[PushService] Removing expired subscription for user ${userId}`);
      } else {
        // Manter subscription se o erro for temporário
        valid.push(userSubs[index]);
        console.error(`[PushService] Push error for user ${userId}:`, err?.message);
      }
    }
  });
  subscriptions.set(userId, valid);
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
