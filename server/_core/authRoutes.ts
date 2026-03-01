import type { Express, Request, Response } from 'express';
import * as db from '../db';
import {
  hashPassword,
  comparePassword,
  createToken,
  setAuthCookie,
  clearAuthCookie,
  authenticateRequest,
} from './auth';

interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Registra as rotas de autenticação
 */
export function registerAuthRoutes(app: Express) {
  /**
   * POST /api/auth/register
   * Registra um novo usuário
   */
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body as RegisterRequest;

      // Validação básica
      if (!email || !password) {
        res.status(400).json({ error: 'Email e senha são obrigatórios' });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
        return;
      }

      // Verificar se usuário já existe
      const existingUser = await db.getUserByEmail(email);
      if (existingUser) {
        res.status(409).json({ error: 'Usuário com este email já existe' });
        return;
      }

      // Hash da senha
      const passwordHash = await hashPassword(password);

      // Criar usuário
      const user = await db.createUser({
        email,
        passwordHash,
        name: name || null,
        role: 'user',
        lastSignedIn: new Date(),
      });

      // Criar token
      const token = createToken(user.id, user.email);

      // Definir cookie
      setAuthCookie(res, token);

      res.status(201).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      });
    } catch (error) {
      console.error('[Auth] Register failed', error);
      res.status(500).json({ error: 'Falha ao registrar usuário' });
    }
  });

  /**
   * POST /api/auth/login
   * Faz login de um usuário
   */
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body as LoginRequest;

      // Validação básica
      if (!email || !password) {
        res.status(400).json({ error: 'Email e senha são obrigatórios' });
        return;
      }

      // Buscar usuário
      const user = await db.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        res.status(401).json({ error: 'Email ou senha incorretos' });
        return;
      }

      // Verificar senha
      const isPasswordValid = await comparePassword(password, user.passwordHash);
      if (!isPasswordValid) {
        res.status(401).json({ error: 'Email ou senha incorretos' });
        return;
      }

      // Atualizar lastSignedIn
      await db.updateUserLastSignedIn(user.id);

      // Criar token
      const token = createToken(user.id, user.email);

      // Definir cookie
      setAuthCookie(res, token);

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      });
    } catch (error) {
      console.error('[Auth] Login failed', error);
      res.status(500).json({ error: 'Falha ao fazer login' });
    }
  });

  /**
   * GET /api/auth/me
   * Retorna informações do usuário logado
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
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    } catch (error) {
      console.error('[Auth] Me failed', error);
      res.status(500).json({ error: 'Falha ao obter informações do usuário' });
    }
  });

  /**
   * POST /api/auth/logout
   * Faz logout do usuário
   */
  app.post('/api/auth/logout', (req: Request, res: Response) => {
    try {
      clearAuthCookie(res);
      res.json({ success: true, message: 'Logout realizado com sucesso' });
    } catch (error) {
      console.error('[Auth] Logout failed', error);
      res.status(500).json({ error: 'Falha ao fazer logout' });
    }
  });
}
