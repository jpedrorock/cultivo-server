import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getUserByEmail,
  getUserByOpenId,
  createUser,
  updateUserLastSignedIn,
  updateUserAvatar,
  updateUserPassword,
  countUsers,
} from '../db-auth';
import {
  hashPassword,
  comparePassword,
  createToken,
  setAuthCookie,
  clearAuthCookie,
  authenticateRequest,
} from './auth';
import { ENV } from './env';

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

      // Primeiro usuário → admin aprovado automaticamente; demais aguardam aprovação
      const total = await countUsers();
      const isFirst = total === 0;

      const user = await createUser({
        email,
        passwordHash,
        name: name || null,
        role: isFirst ? 'admin' : 'user',
        approved: isFirst,
        lastSignedIn: new Date(),
      });

      if (!isFirst) {
        // Notificar admins via push notification (fire-and-forget)
        import('../pushService').then(({ sendPushToAll }) => {
          sendPushToAll({
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
   * GET /api/auth/google
   * Inicia o fluxo OAuth com o Google
   */
  app.get('/api/auth/google', (req: Request, res: Response) => {
    if (!ENV.googleClientId) {
      res.status(503).json({ error: 'Google OAuth não configurado. Adicione GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env' });
      return;
    }
    const protocol = ENV.isProduction ? 'https' : 'http';
    const redirectUri = `${protocol}://${ENV.domain}/api/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: ENV.googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  /**
   * GET /api/auth/google/callback
   * Recebe o código do Google e autentica o usuário
   */
  app.get('/api/auth/google/callback', async (req: Request, res: Response) => {
    const { code, error } = req.query as { code?: string; error?: string };

    if (error || !code) {
      res.redirect('/login?error=google_cancelled');
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

      // Buscar dados do usuário no Google
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
        name?: string;
        picture?: string;
      };

      // Buscar ou criar usuário
      let user = await getUserByOpenId(googleUser.id);

      if (!user) {
        // Verificar se já existe conta com o mesmo email
        user = await getUserByEmail(googleUser.email);
        if (!user) {
          // Primeiro usuário → admin aprovado; demais aguardam aprovação
          const total = await countUsers();
          const isFirst = total === 0;
          user = await createUser({
            email: googleUser.email,
            name: googleUser.name ?? null,
            role: isFirst ? 'admin' : 'user',
            approved: isFirst,
            lastSignedIn: new Date(),
            openId: googleUser.id,
            loginMethod: 'google',
            avatarUrl: googleUser.picture ?? null,
          });
        }
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
