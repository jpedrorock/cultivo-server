import type { Express, Request, Response } from 'express';
import {
  getUserByEmail,
  createUser,
  updateUserLastSignedIn,
} from '../db-auth';
import {
  hashPassword,
  comparePassword,
  createToken,
  setAuthCookie,
  clearAuthCookie,
  authenticateRequest,
} from './auth';

/**
 * Registra as rotas de autenticação JWT
 */
export function registerAuthRoutes(app: Express) {

  /**
   * POST /api/auth/register
   * Registra um novo usuário com email e senha
   */
  app.post('/api/auth/register', async (req: Request, res: Response) => {
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

      if (password.length < 6) {
        res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
        return;
      }

      const existing = await getUserByEmail(email);
      if (existing) {
        res.status(409).json({ error: 'Já existe um usuário com este email' });
        return;
      }

      const passwordHash = await hashPassword(password);

      const user = await createUser({
        email,
        passwordHash,
        name: name || null,
        role: 'user',
        lastSignedIn: new Date(),
      });

      const token = createToken(user.id, user.email);
      setAuthCookie(res, token);

      res.status(201).json({
        success: true,
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
  app.post('/api/auth/login', async (req: Request, res: Response) => {
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

      const valid = await comparePassword(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Email ou senha incorretos' });
        return;
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
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
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
}
