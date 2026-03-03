/**
 * Push Notification Service — App Cultivo
 * Suporta Web Push (VAPID) para notificações em background no iPhone e Android
 */

import { playNotificationSound } from './notificationSounds';

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default';
export type NotificationType = 'daily_reminder' | 'environment_alert' | 'task_reminder';

// ─── Suporte ────────────────────────────────────────────────────────────────

/**
 * Verifica se notificações são suportadas neste navegador/dispositivo
 */
export function isNotificationSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

/**
 * Retorna o status atual da permissão de notificações
 */
export function getNotificationPermission(): NotificationPermissionStatus {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

// ─── Permissão ───────────────────────────────────────────────────────────────

/**
 * Solicita permissão de notificações ao usuário
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!isNotificationSupported()) {
    console.warn('[Notifications] Não suportado neste navegador');
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    console.error('[Notifications] Erro ao solicitar permissão:', error);
    return 'denied';
  }
}

// ─── Web Push (VAPID) ────────────────────────────────────────────────────────

/**
 * Converte base64url para Uint8Array (necessário para VAPID)
 */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

/**
 * Registra a subscription Web Push no servidor
 * @param vapidPublicKey - Chave pública VAPID obtida do servidor
 * @param onSubscribe - Callback para enviar a subscription ao servidor
 */
export async function registerPushSubscription(
  vapidPublicKey: string,
  onSubscribe: (sub: PushSubscriptionJSON) => Promise<void>
): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[WebPush] PushManager não suportado');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // Verificar se já existe subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Criar nova subscription
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    // Enviar subscription para o servidor via callback
    await onSubscribe(subscription.toJSON());
    console.log('[WebPush] Subscription registrada com sucesso');
    return true;
  } catch (error) {
    console.error('[WebPush] Erro ao registrar subscription:', error);
    return false;
  }
}

// ─── Exibição de Notificações ────────────────────────────────────────────────

/**
 * Exibe uma notificação local via Service Worker
 * Para notificações em background, use Web Push (sendPushNotification)
 */
export async function showNotification(
  title: string,
  options?: NotificationOptions,
  soundType?: NotificationType
): Promise<void> {
  if (getNotificationPermission() !== 'granted') {
    console.warn('[Notifications] Permissão não concedida');
    return;
  }

  try {
    // Tocar som se especificado
    if (soundType) {
      playNotificationSound(soundType);
    }

    // Usar Service Worker para exibir a notificação (funciona no iOS PWA)
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        icon: '/icon-192.png',
        badge: '/icon-96.png',
        ...options,
      });
    } else {
      // Fallback para notificação básica
      new Notification(title, {
        icon: '/icon-192.png',
        ...options,
      });
    }
  } catch (error) {
    console.error('[Notifications] Erro ao exibir notificação:', error);
  }
}

// ─── Lembretes Diários ───────────────────────────────────────────────────────

export async function showDailyReminder(): Promise<void> {
  await showNotification('📝 Hora de Registrar!', {
    body: 'Não esqueça de registrar os dados das suas estufas hoje.',
    tag: 'daily-reminder',
    requireInteraction: false,
    data: { url: '/' },
  }, 'daily_reminder');
}

/**
 * Agenda lembretes diários usando setTimeout (funciona apenas com app aberto)
 * Para lembretes em background, o Service Worker com Web Push é necessário
 */
export function scheduleDailyReminder(hour: number, minute: number): () => void {
  const now = new Date();
  const scheduledTime = new Date();
  scheduledTime.setHours(hour, minute, 0, 0);

  if (scheduledTime <= now) {
    scheduledTime.setDate(scheduledTime.getDate() + 1);
  }

  const msUntilReminder = scheduledTime.getTime() - now.getTime();

  const timeoutId = setTimeout(() => {
    showDailyReminder();
    scheduleDailyReminder(hour, minute);
  }, msUntilReminder);

  return () => clearTimeout(timeoutId);
}

export function scheduleMultipleDailyReminders(times: string[]): () => void {
  const cleanupFunctions: Array<() => void> = [];

  times.forEach((time) => {
    const [hour, minute] = time.split(':').map(Number);
    if (isNaN(hour) || isNaN(minute)) {
      console.warn(`[Notifications] Formato de horário inválido: ${time}`);
      return;
    }
    cleanupFunctions.push(scheduleDailyReminder(hour, minute));
  });

  return () => cleanupFunctions.forEach((fn) => fn());
}

// ─── Alertas de Ambiente ─────────────────────────────────────────────────────

export async function showAlertNotification(
  tentName: string,
  metric: string,
  value: number,
  target: string
): Promise<void> {
  const metricNames: Record<string, string> = {
    temp: 'Temperatura',
    rh: 'Umidade',
    ppfd: 'PPFD',
  };

  await showNotification(`⚠️ Alerta: ${tentName}`, {
    body: `${metricNames[metric] || metric}: ${value} está fora da faixa ideal (${target})`,
    tag: `alert-${tentName}-${metric}`,
    requireInteraction: true,
    data: { url: '/alerts' },
  }, 'environment_alert');
}

// ─── Monitor de Registros Ausentes ───────────────────────────────────────────

export async function showMissingReadingAlert(
  tentName: string,
  hoursSinceLastReading: number
): Promise<void> {
  await showNotification(`⚠️ ${tentName} — Sem Registro!`, {
    body: `Sem registro há ${hoursSinceLastReading}h. Clique para registrar agora.`,
    tag: `missing-reading-${tentName}`,
    requireInteraction: true,
    data: { url: '/quick-log', tentName },
  }, 'environment_alert');
}

export async function checkAndNotifyMissingReadings(
  tents: Array<{ id: number; name: string; lastReadingAt: number | null }>
): Promise<void> {
  const now = Date.now();
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const notifiedKey = 'notifiedMissingReadings';
  const notified = JSON.parse(localStorage.getItem(notifiedKey) || '{}');

  for (const tent of tents) {
    if (!tent.lastReadingAt) continue;
    const timeSinceReading = now - tent.lastReadingAt;
    const hoursSince = Math.floor(timeSinceReading / (60 * 60 * 1000));

    if (timeSinceReading > TWENTY_FOUR_HOURS_MS && !notified[tent.id]) {
      await showMissingReadingAlert(tent.name, hoursSince);
      notified[tent.id] = now;
    }

    if (timeSinceReading <= TWENTY_FOUR_HOURS_MS && notified[tent.id]) {
      delete notified[tent.id];
    }
  }

  localStorage.setItem(notifiedKey, JSON.stringify(notified));
}

export function startMissingReadingsMonitor(
  getTents: () => Promise<Array<{ id: number; name: string; lastReadingAt: number | null }>>
): () => void {
  const CHECK_INTERVAL_MS = 60 * 60 * 1000;

  const check = async () => {
    try {
      const tents = await getTents();
      await checkAndNotifyMissingReadings(tents);
    } catch (error) {
      console.error('[Notifications] Erro ao verificar registros ausentes:', error);
    }
  };

  check();
  const intervalId = setInterval(check, CHECK_INTERVAL_MS);
  return () => clearInterval(intervalId);
}

// ─── Migração ────────────────────────────────────────────────────────────────

export function migrateReminderConfig(config: any): any {
  if (config.reminderTime && !config.reminderTimes) {
    return {
      ...config,
      reminderTimes: [config.reminderTime],
      reminderTime: undefined,
    };
  }
  return config;
}
