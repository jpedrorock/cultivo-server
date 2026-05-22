/**
 * localNotifications.ts — agenda notificações locais (sem servidor push).
 *
 * Use cases:
 *  - Lembretes de rega (todo dia 8h, "Lembre de regar suas plantas")
 *  - Lembrete de checagem matinal (todo dia X)
 *  - Lembrete de troca de água do reservatório (toda segunda)
 *  - Alarme custom criado pelo user
 *
 * Diferente de push notifications (FCM/APNs):
 *  - Não precisa de servidor backend
 *  - Funciona 100% offline
 *  - Não precisa de Apple Developer / Google Firebase project
 *  - Agendamento fica no device — sobrevive a reinicialização
 *
 * Permissões:
 *  - iOS: precisa pedir permissão (alertas + sounds + badges)
 *  - Android 13+: precisa pedir permissão
 *  - Android < 13: implícito
 *
 * Limites:
 *  - iOS: máximo 64 notificações pendentes simultâneas
 *  - Recorrência: daily/weekly/monthly suportado nativamente
 */

import { isNative } from "./platform";

export type RepeatInterval = "daily" | "weekly" | "monthly" | "never";

export interface ScheduleNotificationInput {
  /** ID único — usar pra cancelar depois. Recomendado: 1-2147483647 */
  id: number;
  /** Título da notificação */
  title: string;
  /** Corpo (texto principal) */
  body: string;
  /** Quando disparar */
  at: Date;
  /** Repetir? Default "never" (notificação única) */
  repeat?: RepeatInterval;
  /** Dados extras (passados pro listener quando user toca a notificação) */
  extra?: Record<string, unknown>;
}

/**
 * Pede permissão pra mostrar notificações. iOS exige; Android 13+ exige.
 * Retorna true se permitido.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const result = await LocalNotifications.requestPermissions();
    return result.display === "granted";
  } catch {
    return false;
  }
}

/**
 * Verifica permissão sem pedir (não mostra prompt).
 */
export async function checkNotificationPermission(): Promise<"granted" | "denied" | "prompt"> {
  if (!isNative()) return "denied";
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const result = await LocalNotifications.checkPermissions();
    if (result.display === "granted") return "granted";
    if (result.display === "denied") return "denied";
    return "prompt";
  } catch {
    return "denied";
  }
}

/**
 * Agenda uma notificação local.
 *
 * Retorna true se agendada, false se permissão negada ou plataforma não suporta.
 *
 * Importante: usa `id` único. Se chamar com mesmo id, sobrescreve a anterior
 * (útil pra "atualizar lembrete" sem precisar cancelar+criar).
 */
export async function scheduleLocalNotification(input: ScheduleNotificationInput): Promise<boolean> {
  if (!isNative()) return false;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");

    // Garante permissão
    const perm = await checkNotificationPermission();
    if (perm === "prompt") {
      const granted = await requestNotificationPermission();
      if (!granted) return false;
    } else if (perm === "denied") {
      return false;
    }

    // Mapeia recorrência pro formato do plugin
    const schedule: any = { at: input.at };
    if (input.repeat && input.repeat !== "never") {
      schedule.repeats = true;
      schedule.every = input.repeat; // "day" | "week" | "month"... ajustar:
      // Capacitor usa "day"/"week"/"month" como strings
      schedule.every = (
        input.repeat === "daily" ? "day" :
        input.repeat === "weekly" ? "week" :
        input.repeat === "monthly" ? "month" : undefined
      );
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: input.id,
          title: input.title,
          body: input.body,
          schedule,
          extra: input.extra ?? null,
          // Sound default; smallIcon usa o icone do app
          sound: undefined,
        },
      ],
    });

    return true;
  } catch (err) {
    console.warn("[notifications] Falha ao agendar:", err);
    return false;
  }
}

/**
 * Cancela uma ou mais notificações pendentes pelos IDs.
 */
export async function cancelLocalNotifications(ids: number[]): Promise<void> {
  if (!isNative() || ids.length === 0) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({
      notifications: ids.map((id) => ({ id })),
    });
  } catch {
    /* falha silenciosa */
  }
}

/**
 * Lista notificações pendentes agendadas (não dispararam ainda).
 */
export async function listPendingNotifications(): Promise<{
  id: number;
  title?: string;
  body?: string;
}[]> {
  if (!isNative()) return [];
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const result = await LocalNotifications.getPending();
    return result.notifications.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
    }));
  } catch {
    return [];
  }
}

/**
 * Registra listener pra quando user toca uma notificação.
 * Retorna função de cleanup.
 *
 * ```tsx
 * useEffect(() => {
 *   let off: () => void;
 *   onNotificationTap((notification) => {
 *     if (notification.extra?.type === "watering") setLocation("/tarefas");
 *   }).then((cleanup) => { off = cleanup ?? (() => {}); });
 *   return () => off?.();
 * }, []);
 * ```
 */
export async function onNotificationTap(
  handler: (notification: { id: number; title?: string; body?: string; extra?: any }) => void
): Promise<(() => void) | undefined> {
  if (!isNative()) return undefined;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const handle = await LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
      handler({
        id: event.notification.id,
        title: event.notification.title,
        body: event.notification.body,
        extra: event.notification.extra,
      });
    });
    return () => {
      handle.remove().catch(() => {});
    };
  } catch {
    return undefined;
  }
}
