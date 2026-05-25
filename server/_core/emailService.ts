/**
 * emailService.ts — Serviço de email via Resend
 *
 * Encapsula todos os emails transacionais do app Cultivo.
 * Se RESEND_API_KEY não estiver configurado, loga em console (dev/test).
 *
 * Uso:
 *   import { sendWelcomeEmail, sendPasswordResetEmail } from './_core/emailService';
 */

import { Resend } from 'resend';
import { ENV } from './env';

const resend = new Resend(ENV.resendApiKey || undefined);

/** Email de remetente. Domínio precisa estar verificado no Resend. */
const FROM = 'Cultivo App <noreply@cultivo.pro>';

/**
 * Envia email de boas-vindas pra quem entrou na waitlist.
 * @param email  Email do inscrito
 * @param locale 'pt' | 'en' — idioma do formulário de inscrição
 */
export async function sendWelcomeEmail(email: string, locale: string = 'en'): Promise<void> {
  if (!ENV.resendApiKey) {
    console.log(`[Email] RESEND_API_KEY não configurado — pulando welcome email pra ${email}`);
    return;
  }

  const isPt = locale.startsWith('pt');

  const subject = isPt
    ? '🌱 Você está na lista — Cultivo App'
    : '🌱 You\'re on the list — Cultivo App';

  const html = isPt
    ? `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <h2 style="color:#22c55e">Você entrou na lista de espera! 🌱</h2>
        <p>Olá!</p>
        <p>Recebemos seu cadastro no <strong>Cultivo App</strong>. Avisaremos assim que seu acesso estiver disponível.</p>
        <p>Enquanto isso, dá uma olhada nas nossas calculadoras gratuitas:</p>
        <p style="margin:24px 0">
          <a href="https://cultivo.pro/calculators/vpd"
             style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
            Calculadoras de Cultivo
          </a>
        </p>
        <p style="color:#666;font-size:13px">
          Tem alguma dúvida? Responda este email — lemos todos.
        </p>
        <p>🌿 Equipe Cultivo</p>
      </div>
    `
    : `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <h2 style="color:#22c55e">You're on the waitlist! 🌱</h2>
        <p>Hi there!</p>
        <p>We've received your sign-up for <strong>Cultivo App</strong>. We'll let you know as soon as your access is ready.</p>
        <p>In the meantime, check out our free calculators:</p>
        <p style="margin:24px 0">
          <a href="https://cultivo.pro/en/calculators/vpd"
             style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
            Growing Calculators
          </a>
        </p>
        <p style="color:#666;font-size:13px">
          Have a question? Reply to this email — we read every one.
        </p>
        <p>🌿 Cultivo Team</p>
      </div>
    `;

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: [email],
      subject,
      html,
    });
    if (error) {
      console.error('[Email] Falha ao enviar welcome email:', error);
    } else {
      console.log(`[Email] Welcome email enviado pra ${email}`);
    }
  } catch (err) {
    // Não deixar falha de email derrubar o endpoint de waitlist
    console.error('[Email] Exceção ao enviar welcome email:', err);
  }
}

/**
 * Envia link de redefinição de senha.
 * @param email      Email do usuário
 * @param resetToken JWT de curta duração (1h) gerado pelo authRoutes
 */
export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
  if (!ENV.resendApiKey) {
    console.log(`[Email] RESEND_API_KEY não configurado — link de reset (dev): ${ENV.appUrl}/reset-password?token=${resetToken}`);
    return;
  }

  const resetUrl = `${ENV.appUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
      <h2 style="color:#22c55e">Redefinição de senha</h2>
      <p>Olá!</p>
      <p>Recebemos um pedido pra redefinir a senha da sua conta no <strong>Cultivo App</strong>.</p>
      <p>Clique no botão abaixo pra criar uma nova senha. O link expira em <strong>1 hora</strong>.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}"
           style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
          Redefinir senha
        </a>
      </p>
      <p style="color:#666;font-size:13px">
        Se você não pediu a redefinição, ignore este email. Sua senha continua a mesma.
      </p>
      <p style="color:#666;font-size:13px;word-break:break-all">
        Ou copie e cole este link no navegador:<br>${resetUrl}
      </p>
      <p>🌿 Equipe Cultivo</p>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: [email],
      subject: 'Redefinição de senha — Cultivo App',
      html,
    });
    if (error) {
      console.error('[Email] Falha ao enviar reset email:', error);
    } else {
      console.log(`[Email] Reset email enviado pra ${email}`);
    }
  } catch (err) {
    console.error('[Email] Exceção ao enviar reset email:', err);
  }
}
