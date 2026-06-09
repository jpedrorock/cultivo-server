/**
 * emailService.test.ts — Testes unitários para o serviço de email (Resend)
 *
 * Estratégia de mock:
 *  - SDK Resend (`resend`): mock via vi.mock — constructor retorna objeto com
 *    `emails.send` como spy. Evita chamadas reais à API Resend em CI/test.
 *  - ENV (./env): mock via vi.mock — permite controlar resendApiKey e appUrl
 *    por teste sem variável de ambiente real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── vi.hoisted: variáveis disponíveis ANTES da hoisting dos vi.mock ───────────
// vi.mock factories são hoistadas pro topo do arquivo pelo compilador vitest.
// Qualquer var que os factories referenciem também precisa ser hoistada.
const mockSend = vi.hoisted(() => vi.fn());

const mockENV = vi.hoisted(() => ({
  resendApiKey: 'test-resend-key-abc123' as string | undefined,
  appUrl: 'https://app.cultivo.pro',
}));

// ── Mock do SDK Resend ────────────────────────────────────────────────────────
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

// ── Mock do ENV ───────────────────────────────────────────────────────────────
vi.mock('./env', () => ({ ENV: mockENV }));

// ── Import após mocks (vitest hoista vi.mock, então a ordem no source não importa,
//    mas é boa prática deixar depois para deixar a intenção clara) ────────────
import { sendWelcomeEmail, sendPasswordResetEmail, sendNurtureEmail1, sendNurtureEmail2 } from './emailService';

// =============================================================================
describe('emailService', () => {
  beforeEach(() => {
    // Resetar estado entre testes
    vi.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: 'email-id-123' }, error: null });
    mockENV.resendApiKey = 'test-resend-key-abc123';
    mockENV.appUrl = 'https://app.cultivo.pro';
  });

  // ── sendWelcomeEmail ────────────────────────────────────────────────────────
  describe('sendWelcomeEmail', () => {
    it('não deve chamar o SDK quando RESEND_API_KEY não está configurado', async () => {
      mockENV.resendApiKey = undefined as any;

      await expect(sendWelcomeEmail('user@test.com', 'pt')).resolves.toBeUndefined();

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('deve logar URL quando RESEND_API_KEY não está configurado (não lançar)', async () => {
      mockENV.resendApiKey = '' as any;
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await sendWelcomeEmail('lead@beta.com', 'en');

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('RESEND_API_KEY'),
      );
      expect(mockSend).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('deve enviar email com assunto em PT quando locale=pt', async () => {
      await sendWelcomeEmail('joao@cultivo.pro', 'pt');

      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.to).toEqual(['joao@cultivo.pro']);
      expect(call.subject).toContain('lista');          // assunto PT
      expect(call.html).toContain('cultivo.pro/calculators/vpd'); // link PT
    });

    it('deve enviar email com assunto em EN quando locale=en', async () => {
      await sendWelcomeEmail('john@example.com', 'en');

      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.to).toEqual(['john@example.com']);
      expect(call.subject).toContain("You're on the list"); // assunto EN
      expect(call.html).toContain('en/calculators/vpd');    // link EN
    });

    it('deve usar locale EN como padrão (sem segundo argumento)', async () => {
      await sendWelcomeEmail('anon@test.com');

      const call = mockSend.mock.calls[0][0];
      expect(call.subject).toContain("You're on the list"); // EN por padrão
    });

    it('não deve lançar exceção quando o SDK retorna error no payload', async () => {
      mockSend.mockResolvedValue({ data: null, error: { message: 'Daily limit reached' } });

      await expect(sendWelcomeEmail('user@test.com', 'pt')).resolves.toBeUndefined();
    });

    it('não deve lançar exceção quando o SDK lança um erro (rede, timeout)', async () => {
      mockSend.mockRejectedValue(new Error('Network error'));

      await expect(sendWelcomeEmail('user@test.com')).resolves.toBeUndefined();
    });
  });

  // ── sendPasswordResetEmail ─────────────────────────────────────────────────
  describe('sendPasswordResetEmail', () => {
    it('deve pular quando RESEND_API_KEY não configurado e logar o link de reset', async () => {
      mockENV.resendApiKey = undefined as any;
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await sendPasswordResetEmail('user@test.com', 'tok-abc-123');

      expect(mockSend).not.toHaveBeenCalled();
      // Log deve incluir o token pra facilitar debug em dev
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('tok-abc-123'));
      logSpy.mockRestore();
    });

    it('deve enviar email com link de reset que contém o token', async () => {
      await sendPasswordResetEmail('user@test.com', 'my-secure-token');

      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.to).toEqual(['user@test.com']);
      expect(call.subject).toBe('Redefinição de senha — Cultivo App');
      expect(call.html).toContain('my-secure-token');
      expect(call.html).toContain('https://app.cultivo.pro/reset-password');
    });

    it('deve construir URL de reset usando APP_URL do ENV', async () => {
      mockENV.appUrl = 'https://staging.cultivo.pro';

      await sendPasswordResetEmail('dev@test.com', 'staging-token');

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain('staging.cultivo.pro');
    });

    it('não deve lançar exceção quando o SDK lança um erro', async () => {
      mockSend.mockRejectedValue(new Error('Timeout'));

      await expect(sendPasswordResetEmail('user@test.com', 'token')).resolves.toBeUndefined();
    });
  });

  // ── sendNurtureEmail1 (D+3) ────────────────────────────────────────────────
  describe('sendNurtureEmail1', () => {
    it('não deve chamar o SDK quando RESEND_API_KEY não está configurado', async () => {
      mockENV.resendApiKey = undefined as any;

      await expect(sendNurtureEmail1('user@test.com', 'pt')).resolves.toBeUndefined();

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('deve enviar email com assunto em PT quando locale=pt', async () => {
      await sendNurtureEmail1('joao@cultivo.pro', 'pt');

      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.to).toEqual(['joao@cultivo.pro']);
      expect(call.subject).toContain('práticas');   // assunto PT
      expect(call.html).toContain('cultivo.pro/pt/blog'); // link PT
    });

    it('deve enviar email com assunto em EN quando locale=en', async () => {
      await sendNurtureEmail1('john@example.com', 'en');

      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.to).toEqual(['john@example.com']);
      expect(call.subject).toContain('practices');   // assunto EN
      expect(call.html).toContain('cultivo.pro/blog'); // link EN
    });

    it('deve usar locale EN como padrão (sem segundo argumento)', async () => {
      await sendNurtureEmail1('anon@test.com');

      const call = mockSend.mock.calls[0][0];
      expect(call.subject).toContain('practices'); // EN por padrão
    });

    it('não deve lançar exceção quando o SDK lança um erro', async () => {
      mockSend.mockRejectedValue(new Error('SMTP error'));

      await expect(sendNurtureEmail1('user@test.com', 'en')).resolves.toBeUndefined();
    });
  });

  // ── sendNurtureEmail2 (D+14) ───────────────────────────────────────────────
  describe('sendNurtureEmail2', () => {
    it('não deve chamar o SDK quando RESEND_API_KEY não está configurado', async () => {
      mockENV.resendApiKey = undefined as any;

      await expect(sendNurtureEmail2('user@test.com', 'en')).resolves.toBeUndefined();

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('deve enviar email com assunto em PT quando locale=pt', async () => {
      await sendNurtureEmail2('joao@cultivo.pro', 'pt');

      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.to).toEqual(['joao@cultivo.pro']);
      expect(call.subject).toContain('diagnóstico');    // assunto PT
      expect(call.html).toContain('Cultivo Advisor');   // conteúdo PT
    });

    it('deve enviar email com assunto em EN quando locale=en', async () => {
      await sendNurtureEmail2('john@example.com', 'en');

      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.to).toEqual(['john@example.com']);
      expect(call.subject).toContain('diagnosis');      // assunto EN
      expect(call.html).toContain('Cultivo Advisor');   // conteúdo EN
    });

    it('deve usar locale EN como padrão (sem segundo argumento)', async () => {
      await sendNurtureEmail2('anon@test.com');

      const call = mockSend.mock.calls[0][0];
      expect(call.subject).toContain('diagnosis'); // EN por padrão
    });

    it('não deve lançar exceção quando o SDK lança um erro', async () => {
      mockSend.mockRejectedValue(new Error('Rate limit'));

      await expect(sendNurtureEmail2('user@test.com', 'pt')).resolves.toBeUndefined();
    });
  });
});
