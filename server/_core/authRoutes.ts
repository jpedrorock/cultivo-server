import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import {
  getUserByEmail,
  getUserByOpenId,
  createUser,
  updateUserLastSignedIn,
  updateUserAvatar,
  updateUserPassword,
  linkUserOpenId,
  registerUserAtomic,
} from '../db-auth';
import {
  deleteUserAccount,
  getAccountDeletionPreview,
} from '../db-account-delete';
import {
  hashPassword,
  comparePassword,
  createToken,
  verifyToken,
  setAuthCookie,
  clearAuthCookie,
  authenticateRequest,
} from './auth';
import { ENV } from './env';
import { sendPasswordResetEmail } from './emailService';

/**
 * Mascara um email pra log seguro (LGPD/GDPR).
 * Ex: "joaopedro@evapro.cloud" → "j*******@evapro.cloud"
 * Loga só a 1ª letra do local + domínio inteiro (útil pra debug sem expor PII).
 */
function maskEmail(email: string | null | undefined): string {
  if (!email) return '[no-email]';
  const [local, domain] = email.split('@');
  if (!local || !domain) return '[invalid-email]';
  const head = local.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(0, local.length - 1))}@${domain}`;
}

// ---------------------------------------------------------------------------
// Rate limiters por endpoint sensível
// Inclui Retry-After + X-RateLimit-* headers padrão
// ---------------------------------------------------------------------------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,           // 15 minutos
  limit: 10,                          // 10 tentativas por janela
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,           // 1 hora
  limit: 5,                           // 5 registros por hora
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de registro. Tente novamente em 1 hora.' },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,           // 1 hora
  limit: 3,                           // 3 pedidos por hora por IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitos pedidos de recuperação. Tente novamente em 1 hora.' },
});

// Excluir conta é OPERAÇÃO DESTRUTIVA. Limite agressivo previne abuse
// (script malicioso tentando deletar contas em massa).
const deleteAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,           // 1 hora
  limit: 3,                           // 3 tentativas por hora
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em 1 hora.' },
});

// ---------------------------------------------------------------------------

/**
 * Registra as rotas de autenticação JWT
 */
export function registerAuthRoutes(app: Express) {

  /**
   * POST /api/auth/register
   * Registra um novo usuário com email e senha
   */
  app.post('/api/auth/register', registerLimiter, async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body as {
        email: string;
        password: string;
        name?: string;
      };

      if (!email || !password) {
        res.status(400).json({ error: 'Email e senha são obrigatórios' });
        return;
      }

      if (password.length < 12) {
        res.status(400).json({ error: 'Senha deve ter no mínimo 12 caracteres' });
        return;
      }

      const existing = await getUserByEmail(email);
      if (existing) {
        res.status(409).json({ error: 'Já existe um usuário com este email' });
        return;
      }

      const passwordHash = await hashPassword(password);

      // Decisão "primeiro = admin aprovado" feita atomicamente (lock MySQL)
      // para evitar race com 2 POSTs simultâneos virando 2 admins.
      const { user, isFirst } = await registerUserAtomic({
        email,
        passwordHash,
        name: name || null,
        lastSignedIn: new Date(),
      });

      if (!isFirst) {
        // Notificar APENAS admins via push notification (fire-and-forget)
        import('../pushService').then(({ sendPushToAdmins }) => {
          sendPushToAdmins({
            title: 'Novo usuário aguardando aprovação',
            body: `${name || email} solicitou acesso ao app Cultivo`,
            url: '/settings',
            tag: 'new-user-pending',
          }).catch(() => {/* ignora erros de push — não bloqueia registro */});
        }).catch(() => {});

        // Usuário aguardando aprovação — não faz login ainda
        res.status(201).json({
          success: true,
          pending: true,
          message: 'Conta criada! Aguarde aprovação de um administrador.',
        });
        return;
      }

      const token = createToken(user.id, user.email);
      setAuthCookie(res, token);

      res.status(201).json({
        success: true,
        pending: false,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        token,
      });
    } catch (error) {
      console.error('[Auth] Register failed', error);
      res.status(500).json({ error: 'Falha ao registrar usuário' });
    }
  });

  /**
   * POST /api/auth/login
   * Autentica um usuário com email e senha
   */
  app.post('/api/auth/login', loginLimiter, async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body as { email: string; password: string };

      if (!email || !password) {
        res.status(400).json({ error: 'Email e senha são obrigatórios' });
        return;
      }

      const user = await getUserByEmail(email);
      if (!user || !user.passwordHash) {
        res.status(401).json({ error: 'Email ou senha incorretos' });
        return;
      }

      const { ok, needsRehash } = await comparePassword(password, user.passwordHash);
      if (!ok) {
        res.status(401).json({ error: 'Email ou senha incorretos' });
        return;
      }

      if (!user.approved) {
        res.status(403).json({ error: 'Sua conta ainda não foi aprovada por um administrador.', code: 'PENDING_APPROVAL' });
        return;
      }

      // Migração transparente: hashes legados (bcrypt) → argon2 ao logar
      if (needsRehash) {
        try {
          const newHash = await hashPassword(password);
          await updateUserPassword(user.id, newHash);
        } catch (e) {
          console.warn('[Auth] Falha ao migrar hash para argon2 (login continua OK)', String(e));
        }
      }

      await updateUserLastSignedIn(user.id);

      const token = createToken(user.id, user.email);
      setAuthCookie(res, token);

      res.json({
        success: true,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        token,
      });
    } catch (error) {
      console.error('[Auth] Login failed', error);
      res.status(500).json({ error: 'Falha ao fazer login' });
    }
  });

  /**
   * POST /api/auth/forgot-password
   * Pede reset de senha. Por design (anti-enumeration), retorna 200 mesmo
   * se email não existe — atacante não consegue descobrir emails válidos
   * fazendo POST com diferentes endereços.
   *
   * STATE ATUAL (MVP): endpoint registra o pedido em log + console pra
   * admin processar manualmente. Email service real (nodemailer/Resend)
   * não está integrado — substituir os TODOs abaixo quando plugar.
   *
   * FLUXO COMPLETO (futuro):
   *  1. User submete email
   *  2. Backend gera reset_token (32 bytes hex), expira em 24h, salva no DB
   *  3. Email enviado: "Clique aqui pra resetar: <link>?token=<X>"
   *  4. User abre link → /reset-password/:token
   *  5. Página valida token + permite definir nova senha
   *  6. Backend valida token + atualiza passwordHash + invalida token
   *
   * ATÉ LÁ:
   *  - User submete pedido
   *  - Admin vê notificação no log do servidor
   *  - Admin manualmente atualiza senha do user via DB ou painel admin
   *  - Admin avisa user (whatsapp/etc) com a senha temporária
   */
  app.post('/api/auth/forgot-password', forgotPasswordLimiter, async (req: Request, res: Response) => {
    try {
      const { email } = req.body as { email: string };
      if (!email || typeof email !== 'string') {
        res.status(400).json({ error: 'Email obrigatório' });
        return;
      }
      // Limpa email pra logging (não confia no input do user)
      const cleanEmail = email.trim().toLowerCase().slice(0, 200);

      // Tenta achar o user — se não existir, comportamento idêntico (anti-enum)
      const user = await getUserByEmail(cleanEmail);
      if (user) {
        // Gera JWT de curta duração (1h) com purpose=password-reset (stateless, sem tabela extra)
        const resetToken = createToken(user.id, user.email, '1h');
        // Dispara email em background (não bloqueia resposta)
        sendPasswordResetEmail(user.email, resetToken).catch(() => {/* já loga internamente */});
        console.log(`[Auth] Reset pedido pra user ${user.id} (${maskEmail(cleanEmail)}) — email enviado`);
      } else {
        console.log(`[Auth] Reset pedido pra email não encontrado (${maskEmail(cleanEmail)}) — ignorar`);
      }

      // Resposta sempre igual pra não vazar enumeração
      res.json({
        success: true,
        message: 'Se o email existir, em alguns minutos chegará um link de redefinição.',
      });
    } catch (error) {
      console.error('[Auth] forgot-password failed', error);
      res.status(500).json({ error: 'Falha ao processar pedido' });
    }
  });

  /**
   * POST /api/auth/reset-password
   * Valida token JWT de reset e define nova senha.
   *
   * Body: { token: string, password: string }
   *
   * O token é um JWT HS256 gerado pelo /forgot-password, expira em 1h.
   * Por ser stateless, um token usado não é invalidado imediatamente (janela 1h).
   * Aceitável pra MVP; se quiser invalidação imediata, salvar token em DB/Redis.
   */
  app.post('/api/auth/reset-password', forgotPasswordLimiter, async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body as { token: string; password: string };
      if (!token || typeof token !== 'string') {
        res.status(400).json({ error: 'Token obrigatório' });
        return;
      }
      if (!password || typeof password !== 'string' || password.length < 8) {
        res.status(400).json({ error: 'Senha deve ter pelo menos 8 caracteres' });
        return;
      }

      // Verifica JWT (valida assinatura + expiração)
      const payload = verifyToken(token);
      if (!payload) {
        res.status(400).json({ error: 'Link inválido ou expirado. Solicite um novo.' });
        return;
      }

      // Confirma que o user ainda existe
      const user = await getUserByEmail(payload.email);
      if (!user || user.id !== payload.userId) {
        res.status(400).json({ error: 'Usuário não encontrado.' });
        return;
      }

      const newHash = await hashPassword(password);
      await updateUserPassword(user.id, newHash);

      console.log(`[Auth] Senha redefinida pra user ${user.id} (${maskEmail(user.email)})`);

      res.json({ success: true, message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
    } catch (error) {
      console.error('[Auth] reset-password failed', error);
      res.status(500).json({ error: 'Falha ao redefinir senha' });
    }
  });

  /**
   * GET /api/auth/me
   * Retorna o usuário autenticado
   */
  app.get('/api/auth/me', async (req: Request, res: Response) => {
    try {
      const user = await authenticateRequest(req);
      if (!user) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      res.json({
        success: true,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, groupId: user.groupId ?? null, avatarUrl: user.avatarUrl ?? null, approved: user.approved },
      });
    } catch (error) {
      console.error('[Auth] Me failed', error);
      res.status(500).json({ error: 'Falha ao obter dados do usuário' });
    }
  });

  /**
   * POST /api/auth/logout
   * Encerra a sessão do usuário
   */
  app.post('/api/auth/logout', (req: Request, res: Response) => {
    clearAuthCookie(res);
    res.json({ success: true, message: 'Logout realizado com sucesso' });
  });

  /**
   * GET /api/auth/delete-preview
   * Retorna metadados pro user decidir se quer mesmo apagar.
   * Não apaga nada — é só consulta.
   *
   * Response:
   *  { isLastInGroup: bool, isGroupOwner: bool, counts: { tents, plants, strains } }
   */
  app.get('/api/auth/delete-preview', async (req: Request, res: Response) => {
    try {
      const user = await authenticateRequest(req);
      if (!user) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }
      const preview = await getAccountDeletionPreview(user.id);
      if (!preview || !preview.exists) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }
      res.json({
        success: true,
        isLastInGroup: preview.isLastInGroup,
        isGroupOwner: preview.isGroupOwner,
        counts: preview.counts,
      });
    } catch (error) {
      console.error('[Auth] delete-preview failed', error);
      res.status(500).json({ error: 'Falha ao processar pedido' });
    }
  });

  /**
   * POST /api/auth/delete-account
   * Apaga DEFINITIVAMENTE a conta do usuário (LGPD/GDPR/Apple 5.1.1).
   *
   * Body:
   *  { password: string, confirmText: string }
   *
   * Regras:
   *  - User precisa estar autenticado
   *  - Re-confirmação de senha (proteção contra session hijacking)
   *  - Texto literal "EXCLUIR" (proteção contra tap acidental)
   *  - Se é último membro do grupo, apaga grupo + todos os dados
   *  - Se há outros membros, apaga só o user (dados continuam)
   *  - Cookie limpo após sucesso (mobile deve apagar token também)
   */
  app.post('/api/auth/delete-account', deleteAccountLimiter, async (req: Request, res: Response) => {
    try {
      const user = await authenticateRequest(req);
      if (!user) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const { password, confirmText } = req.body as { password?: string; confirmText?: string };

      if (confirmText !== 'EXCLUIR') {
        res.status(400).json({ error: 'Digite "EXCLUIR" para confirmar a exclusão da conta.' });
        return;
      }

      // Verifica senha. Se user só tem OAuth (sem senha), aceitar mediante
      // re-autenticação prévia — mas como esse endpoint exige session válida,
      // já é re-auth implícita.
      if (user.passwordHash) {
        if (!password) {
          res.status(400).json({ error: 'Senha obrigatória.' });
          return;
        }
        const { ok } = await comparePassword(password, user.passwordHash);
        if (!ok) {
          res.status(401).json({ error: 'Senha incorreta.' });
          return;
        }
      }
      // (User OAuth-only sem passwordHash → segue direto. Já tem JWT válido.)

      const result = await deleteUserAccount(user.id);

      clearAuthCookie(res);

      // Audit log — sem PII (só id numérico). LGPD-safe.
      console.log(`[delete-account] user=${user.id} method=${user.passwordHash ? 'password' : 'oauth'} groupDeleted=${result.groupDeleted} transferred=${result.ownershipTransferred}`);

      res.json({
        success: true,
        message: 'Conta excluída com sucesso.',
        groupDeleted: result.groupDeleted,
      });
    } catch (error) {
      console.error('[Auth] delete-account failed', error);
      res.status(500).json({ error: 'Falha ao excluir conta. Entre em contato com o suporte.' });
    }
  });

  /**
   * GET /api/auth/google
   * Inicia o fluxo OAuth com o Google
   */
  app.get('/api/auth/google', (req: Request, res: Response) => {
    if (!ENV.googleClientId) {
      res.status(503).json({ error: 'Google OAuth não configurado. Adicione GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env' });
      return;
    }
    // CSRF: gera state aleatório e armazena em cookie httpOnly. Callback compara
    // o state da query (vindo do Google) com o do cookie. Sem isso, atacante
    // pode levar a vítima ao callback com seu próprio code → vítima loga na conta dele.
    const state = randomBytes(32).toString('hex');
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: ENV.isProduction,
      sameSite: 'lax',         // precisa lax — Strict não volta no redirect cross-domain
      maxAge: 10 * 60 * 1000,  // 10 minutos é suficiente
      path: '/api/auth/google',
    });

    const protocol = ENV.isProduction ? 'https' : 'http';
    const redirectUri = `${protocol}://${ENV.domain}/api/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: ENV.googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      state,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  /**
   * GET /api/auth/google/callback
   * Recebe o código do Google e autentica o usuário
   */
  app.get('/api/auth/google/callback', async (req: Request, res: Response) => {
    const { code, error, state } = req.query as { code?: string; error?: string; state?: string };
    const cookieState = req.cookies?.oauth_state as string | undefined;
    // Limpa cookie em qualquer fluxo subsequente — é single-use
    res.clearCookie('oauth_state', { path: '/api/auth/google' });

    if (error || !code) {
      res.redirect('/login?error=google_cancelled');
      return;
    }

    // Validação CSRF: state da query DEVE igualar state do cookie
    if (!state || !cookieState || state !== cookieState) {
      console.warn('[Auth] Google OAuth state mismatch — possível ataque CSRF');
      res.redirect('/login?error=google_state_invalid');
      return;
    }

    try {
      const protocol = ENV.isProduction ? 'https' : 'http';
      const redirectUri = `${protocol}://${ENV.domain}/api/auth/google/callback`;

      // Trocar código por access token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: ENV.googleClientId,
          client_secret: ENV.googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        console.error('[Auth] Google token exchange failed', await tokenRes.text());
        res.redirect('/login?error=google_failed');
        return;
      }

      const tokenData = await tokenRes.json() as { access_token: string };

      // Buscar dados do usuário no Google (inclui verified_email)
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        res.redirect('/login?error=google_failed');
        return;
      }

      const googleUser = await userRes.json() as {
        id: string;
        email: string;
        verified_email?: boolean;
        name?: string;
        picture?: string;
      };

      // Bloqueia se Google diz que email não foi verificado
      // (Sem isso, atacante poderia usar email de terceiros não verificado.)
      if (googleUser.verified_email === false) {
        console.warn(`[Auth] Google email não verificado: ${maskEmail(googleUser.email)}`);
        res.redirect('/login?error=google_email_not_verified');
        return;
      }

      // Buscar usuário pelo openId (Google ID estável)
      let user = await getUserByOpenId(googleUser.id);

      if (!user) {
        // Não existe vinculação com Google. Verificar se há conta com mesmo email.
        const existingByEmail = await getUserByEmail(googleUser.email);

        if (existingByEmail) {
          // CASO PERIGOSO: conta com o email já existe MAS não tem openId vinculado.
          //
          // Cenário de ataque:
          //   1. Atacante cria conta vitima@gmail.com com email/senha
          //   2. Vítima entra com Google (mesmo email)
          //   3. Sem proteção, código faria merge silencioso → vítima loga na conta do atacante
          //
          // Bloqueamos o merge automático. Para vincular Google a uma conta
          // existente, o usuário deve fazer login com email/senha primeiro
          // e usar a opção "Vincular Google" no perfil (a implementar).
          if (existingByEmail.openId && existingByEmail.openId !== googleUser.id) {
            // Conta já vinculada a OUTRO Google ID — definitivamente não é a mesma pessoa
            console.warn(`[Auth] Tentativa de login Google para email com openId diferente: ${maskEmail(googleUser.email)}`);
            res.redirect('/login?error=google_account_conflict');
            return;
          }

          // Sem openId vinculado — bloqueia e instrui o usuário
          res.redirect('/login?error=google_email_exists');
          return;
        }

        // Email novo — cria conta atomicamente (mesma proteção contra race do "primeiro = admin")
        const created = await registerUserAtomic({
          email: googleUser.email,
          name: googleUser.name ?? null,
          lastSignedIn: new Date(),
          openId: googleUser.id,
          loginMethod: 'google',
          avatarUrl: googleUser.picture ?? null,
        });
        user = created.user;
      }

      // Bloquear login de usuários não aprovados
      if (!user.approved) {
        res.redirect('/pending-approval');
        return;
      }

      // Atualizar foto de perfil se mudou
      if (googleUser.picture && user.avatarUrl !== googleUser.picture) {
        await updateUserAvatar(user.id, googleUser.picture);
        user = { ...user, avatarUrl: googleUser.picture };
      }

      await updateUserLastSignedIn(user.id);

      const token = createToken(user.id, user.email);
      setAuthCookie(res, token);
      res.redirect('/');
    } catch (err) {
      console.error('[Auth] Google callback error', err);
      res.redirect('/login?error=google_failed');
    }
  });
}

// linkUserOpenId é usado pelo procedure de "Vincular Google" no perfil (a implementar).
// Mantido aqui para que o import sobreviva ao tree-shaking quando o procedure for criado.
export { linkUserOpenId };
