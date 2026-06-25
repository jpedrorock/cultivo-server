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

/**
 * Envia email de nutrição D+3 (dicas de cultivo para inscrito na waitlist).
 * Disparado pelo cron waitlistNurture 3 dias após inscrição.
 * @param email  Email do inscrito
 * @param locale 'pt' | 'en'
 */
export async function sendNurtureEmail1(email: string, locale: string = 'en'): Promise<void> {
  if (!ENV.resendApiKey) {
    console.log(`[Email] RESEND_API_KEY não configurado — pulando nurture D+3 pra ${email}`);
    return;
  }

  const isPt = locale.startsWith('pt');

  const subject = isPt
    ? '🌿 3 práticas que mudam o próximo cultivo — Cultivo App'
    : '🌿 3 practices that change your next grow — Cultivo App';

  const html = isPt
    ? `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <h2 style="color:#22c55e">Dicas para elevar seu cultivo 🌿</h2>
        <p>Olá!</p>
        <p>Enquanto você aguarda acesso ao <strong>Cultivo App</strong>, separamos 3 práticas que fazem diferença real:</p>
        <ol style="line-height:2.2">
          <li><strong>Monitore VPD, não só temperatura.</strong> Um VPD de 1,0–1,4 kPa na fase vegetativa mantém os estômatos abertos e a absorção de nutrientes no máximo.</li>
          <li><strong>Registre semanalmente.</strong> Padrões só aparecem quando você compara. Sem histórico, cada problema parece único — com histórico, você vê tendências.</li>
          <li><strong>Calibre o medidor de pH antes de cada uso.</strong> Uma deriva de 0,3 pH muda a disponibilidade de nutrientes mais do que qualquer ajuste de fertilizante.</li>
        </ol>
        <p style="margin:24px 0">
          <a href="https://cultivo.pro/pt/blog"
             style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
            Ler mais no blog
          </a>
        </p>
        <p style="color:#666;font-size:13px">
          Respondendo este email você fala direto comigo — leio todos.
        </p>
        <p>🌿 João Pedro, Cultivo</p>
      </div>
    `
    : `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <h2 style="color:#22c55e">Tips to elevate your grow 🌿</h2>
        <p>Hi there!</p>
        <p>While you wait for access to <strong>Cultivo App</strong>, here are 3 practices that make a real difference:</p>
        <ol style="line-height:2.2">
          <li><strong>Monitor VPD, not just temperature.</strong> A VPD of 1.0–1.4 kPa in veg keeps stomata open and nutrient uptake maxed out.</li>
          <li><strong>Log weekly without fail.</strong> Patterns only emerge when you compare. Without a record, every problem looks unique — with one, you see trends.</li>
          <li><strong>Calibrate your pH meter before every use.</strong> A 0.3 pH drift changes nutrient availability more than any fertilizer adjustment.</li>
        </ol>
        <p style="margin:24px 0">
          <a href="https://cultivo.pro/blog"
             style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
            Read more on the blog
          </a>
        </p>
        <p style="color:#666;font-size:13px">
          Reply to this email and you'll reach me directly — I read every one.
        </p>
        <p>🌿 João Pedro, Cultivo</p>
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
      console.error('[Email] Falha ao enviar nurture D+3:', error);
    } else {
      console.log(`[Email] Nurture D+3 enviado pra ${email}`);
    }
  } catch (err) {
    console.error('[Email] Exceção ao enviar nurture D+3:', err);
  }
}

/**
 * Envia email de nutrição D+14 (feature spotlight para inscrito na waitlist).
 * Disparado pelo cron waitlistNurture 14 dias após inscrição.
 * @param email  Email do inscrito
 * @param locale 'pt' | 'en'
 */
export async function sendNurtureEmail2(email: string, locale: string = 'en'): Promise<void> {
  if (!ENV.resendApiKey) {
    console.log(`[Email] RESEND_API_KEY não configurado — pulando nurture D+14 pra ${email}`);
    return;
  }

  const isPt = locale.startsWith('pt');

  const subject = isPt
    ? '🔬 Como o Cultivo App usa seus dados para diagnóstico — Cultivo App'
    : '🔬 How Cultivo App turns your data into diagnosis — Cultivo App';

  const html = isPt
    ? `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <h2 style="color:#22c55e">Diagnóstico baseado nos seus dados 🔬</h2>
        <p>Olá!</p>
        <p>No Cultivo App, o <strong>Cultivo Advisor</strong> não é um chatbot genérico — ele lê o histórico completo da sua estufa antes de responder:</p>
        <ul style="line-height:2.2">
          <li>Strain, fase, semana, temperatura, umidade e PPFD dos últimos 30 dias</li>
          <li>Histórico de saúde da planta (alertas, observações, fotos)</li>
          <li>Receitas de fertilizante já usadas no ciclo atual</li>
        </ul>
        <p>Resultado: uma leitura técnica do que está acontecendo na <em>sua</em> estufa — não conselhos genéricos para a média dos cultivadores.</p>
        <p style="margin:24px 0">
          <a href="https://cultivo.pro"
             style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
            Saiba mais sobre o app
          </a>
        </p>
        <p style="color:#666;font-size:13px">
          Tem alguma dúvida? Responda este email.
        </p>
        <p>🌿 Equipe Cultivo</p>
      </div>
    `
    : `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <h2 style="color:#22c55e">Data-driven diagnosis 🔬</h2>
        <p>Hi there!</p>
        <p>In Cultivo App, the <strong>Cultivo Advisor</strong> isn't a generic chatbot — it reads your full grow history before replying:</p>
        <ul style="line-height:2.2">
          <li>Strain, phase, week, temp, humidity, and PPFD for the past 30 days</li>
          <li>Plant health history (alerts, observations, photos)</li>
          <li>Nutrient recipes already used in the current cycle</li>
        </ul>
        <p>The result: a technical read on what's happening in <em>your</em> tent — not generic advice averaged across all growers.</p>
        <p style="margin:24px 0">
          <a href="https://cultivo.pro"
             style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
            Learn more about the app
          </a>
        </p>
        <p style="color:#666;font-size:13px">
          Have a question? Reply to this email — we're here.
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
      console.error('[Email] Falha ao enviar nurture D+14:', error);
    } else {
      console.log(`[Email] Nurture D+14 enviado pra ${email}`);
    }
  } catch (err) {
    console.error('[Email] Exceção ao enviar nurture D+14:', err);
  }
}
