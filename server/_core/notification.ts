/**
 * Sistema de Notificações — Versão Servidor Independente
 *
 * Substitui o serviço proprietário do Manus por log local.
 * Para notificações reais, integre com:
 * - Email: nodemailer + SMTP
 * - Push: web-push (VAPID)
 * - Webhook: Discord, Slack, Telegram
 */
import { TRPCError } from "@trpc/server";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Título da notificação é obrigatório.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Conteúdo da notificação é obrigatório.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Título deve ter no máximo ${TITLE_MAX_LENGTH} caracteres.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Conteúdo deve ter no máximo ${CONTENT_MAX_LENGTH} caracteres.`,
    });
  }

  return { title, content };
};

/**
 * Registra uma notificação no log do servidor.
 * Em produção, integre com email/push/webhook conforme necessário.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  // Log local da notificação
  console.log(`[Notification] ${new Date().toISOString()} | ${title}: ${content}`);

  // Retorna true indicando que a notificação foi "enviada" (logada)
  return true;
}
