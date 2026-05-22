/**
 * Sign in with Apple — backend handler
 *
 * Fluxo NATIVO (iOS Capacitor):
 *  1. Plugin @capacitor-community/apple-sign-in mostra prompt nativo Apple
 *  2. Apple devolve { identityToken, authorizationCode, fullName?, email? }
 *  3. App POSTa esse payload em /api/auth/apple
 *  4. Backend valida o identityToken via JWKS pública da Apple
 *  5. Cria/loga o usuário (mesmo padrão do Google OAuth)
 *
 * Por que NÃO usar Apple Sign In JS Web (sign-in form da Apple)?
 *  - No fluxo nativo, o iOS já tem UI/UX padrão da Apple integrada
 *  - Web flow exige Service ID + Return URL configurado no Apple Dev
 *  - Mantemos só nativo por enquanto. Adiciona web quando precisar.
 *
 * Segurança crítica:
 *  - SEMPRE validar audience contra APPLE_CLIENT_ID (senão atacante manda token
 *    de outro app Apple e a gente aceita)
 *  - SEMPRE validar issuer = https://appleid.apple.com
 *  - SEMPRE validar exp/iat (jsonwebtoken faz isso por padrão)
 *  - Email pode vir vazio se usuário escolheu "Hide My Email" → privaterelay
 *  - Email só vem no PRIMEIRO login. Não dá pra re-pedir, então é critico salvar
 *
 * Apple Guidelines:
 *  - 4.8: se temos Google OAuth, OBRIGATÓRIO ter Apple Sign In também
 *  - 5.1.1(v): se conta criada via Apple, oferecer "Delete Account" no app
 */

import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { createPublicKey } from 'node:crypto';
import {
  getUserByEmail,
  getUserByOpenId,
  registerUserAtomic,
  updateUserLastSignedIn,
} from '../db-auth';
import { createToken, setAuthCookie } from './auth';
import { ENV } from './env';

// ---------------------------------------------------------------------------
// JWKS cache — Apple recomenda cachear 10 min. JWKS muda raramente (key rotation
// quando há comprometimento). Se cache estiver vencido, recarrega.
// ---------------------------------------------------------------------------
type AppleJWK = {
  kty: 'RSA';
  kid: string;
  use: 'sig';
  alg: 'RS256';
  n: string;
  e: string;
};

let jwksCache: { keys: AppleJWK[]; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL = 10 * 60 * 1000; // 10 minutos
const JWKS_URL = 'https://appleid.apple.com/auth/keys';

async function fetchAppleJWKS(): Promise<AppleJWK[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL) {
    return jwksCache.keys;
  }
  const res = await fetch(JWKS_URL);
  if (!res.ok) {
    throw new Error(`Apple JWKS fetch failed: HTTP ${res.status}`);
  }
  const data = await res.json() as { keys: AppleJWK[] };
  if (!data.keys || !Array.isArray(data.keys) || data.keys.length === 0) {
    throw new Error('Apple JWKS: resposta inválida (sem keys)');
  }
  jwksCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

// ---------------------------------------------------------------------------
// Verificação do identityToken
// ---------------------------------------------------------------------------
type AppleIdTokenPayload = {
  iss: string;            // sempre "https://appleid.apple.com"
  aud: string;            // bundle ID ou Service ID (= APPLE_CLIENT_ID)
  sub: string;            // ID estável e único do usuário Apple
  iat: number;
  exp: number;
  email?: string;         // só vem no primeiro login
  email_verified?: boolean | string; // Apple devolve às vezes string "true"
  is_private_email?: boolean | string;
  nonce?: string;
};

async function verifyAppleIdentityToken(identityToken: string): Promise<AppleIdTokenPayload> {
  // Decodifica sem verificar pra extrair o kid do header
  const decoded = jwt.decode(identityToken, { complete: true });
  if (!decoded || typeof decoded === 'string' || !decoded.header) {
    throw new Error('Token Apple inválido (decode falhou)');
  }

  const kid = decoded.header.kid;
  if (!kid) throw new Error('Token Apple sem kid no header');

  // Acha a key correspondente no JWKS
  const keys = await fetchAppleJWKS();
  let key = keys.find(k => k.kid === kid);
  if (!key) {
    // JWKS pode ter mudado — invalida cache e tenta uma vez mais
    jwksCache = null;
    const fresh = await fetchAppleJWKS();
    key = fresh.find(k => k.kid === kid);
    if (!key) throw new Error(`Apple JWK não encontrado pra kid=${kid}`);
  }

  // Converte JWK pra PublicKey usando crypto nativo do Node
  const publicKey = createPublicKey({ key, format: 'jwk' });

  // Verifica assinatura + claims
  const payload = jwt.verify(identityToken, publicKey, {
    algorithms: ['RS256'],
    issuer: 'https://appleid.apple.com',
    audience: ENV.appleClientId,
  }) as AppleIdTokenPayload;

  return payload;
}

// ---------------------------------------------------------------------------
// Rate limit — mesma janela do Google OAuth
// ---------------------------------------------------------------------------
const appleAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
});

function maskEmail(email: string | null | undefined): string {
  if (!email) return '[no-email]';
  const [local, domain] = email.split('@');
  if (!local || !domain) return '[invalid-email]';
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(0, local.length - 1))}@${domain}`;
}

// ---------------------------------------------------------------------------
// Rota POST /api/auth/apple
// ---------------------------------------------------------------------------
export function registerAppleAuthRoutes(app: Express) {

  app.post('/api/auth/apple', appleAuthLimiter, async (req: Request, res: Response) => {
    // Curto-circuita se Apple Sign In não foi configurado ainda (dev local)
    if (!ENV.appleClientId) {
      res.status(503).json({
        error: 'Sign in with Apple não configurado. Configure APPLE_CLIENT_ID no .env',
      });
      return;
    }

    try {
      const { identityToken, fullName, email: emailFromClient } = req.body as {
        identityToken?: string;
        authorizationCode?: string;
        fullName?: { givenName?: string | null; familyName?: string | null } | null;
        email?: string | null;
      };

      if (!identityToken || typeof identityToken !== 'string') {
        res.status(400).json({ error: 'identityToken é obrigatório' });
        return;
      }

      // 1. Valida o token contra a JWKS pública da Apple
      let payload: AppleIdTokenPayload;
      try {
        payload = await verifyAppleIdentityToken(identityToken);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'verificação falhou';
        console.warn('[Apple] Token inválido:', msg);
        res.status(401).json({ error: 'Token Apple inválido ou expirado' });
        return;
      }

      const appleUserId = payload.sub;

      // Apple às vezes serializa booleans como string "true"/"false" — normaliza
      const emailFromToken = payload.email;
      const emailVerified = String(payload.email_verified ?? '') === 'true' || payload.email_verified === true;

      // 2. Resolve o email final
      //   - Prioriza email do token (mais confiável)
      //   - Fallback: email do client (Apple só manda no PRIMEIRO login)
      //   - Pode ser xxx@privaterelay.appleid.com se user escolheu "Hide My Email"
      const finalEmail = emailFromToken ?? emailFromClient ?? null;

      // 3. Busca user existente pelo openId (Apple sub é estável)
      let user = await getUserByOpenId(appleUserId);

      // 4. Se não existe, cria — ou bloqueia se email conflita
      if (!user) {
        if (!finalEmail) {
          // Sem email + sem user vinculado = impossível criar conta nova.
          // Cenário raro: usuário desinstalou app, reinstalou, Apple só manda
          // email no primeiro login. Deve aparecer ainda assim porque o openId
          // já estaria vinculado. Mas defensivo aqui.
          console.warn('[Apple] Tentativa de criar conta sem email pra sub:', appleUserId);
          res.status(400).json({ error: 'Não foi possível obter email da conta Apple. Tente "Settings > Apple ID > Apps Using Apple ID > Cultivo > Stop Using" e entre de novo.' });
          return;
        }

        // Verifica se já existe conta com esse email
        const existingByEmail = await getUserByEmail(finalEmail);
        if (existingByEmail) {
          // Mesmo padrão de proteção do Google OAuth: bloqueia merge silencioso
          if (existingByEmail.openId && existingByEmail.openId !== appleUserId) {
            console.warn(`[Apple] Email já vinculado a outro openId: ${maskEmail(finalEmail)}`);
            res.status(409).json({ error: 'Esta conta Apple não pode ser usada — entre em contato com o suporte.' });
            return;
          }
          // Tem conta com mesmo email MAS sem openId vinculado → bloqueia
          res.status(409).json({
            error: 'Já existe uma conta com este email. Entre com email/senha e vincule a Apple nas configurações.',
            code: 'EMAIL_EXISTS_NEEDS_LINKING',
          });
          return;
        }

        // Email novo — cria conta atomicamente
        const displayName = [fullName?.givenName, fullName?.familyName]
          .filter(Boolean)
          .join(' ')
          .trim() || null;

        const created = await registerUserAtomic({
          email: finalEmail,
          name: displayName,
          lastSignedIn: new Date(),
          openId: appleUserId,
          loginMethod: 'apple',
          avatarUrl: null, // Apple não fornece foto
        });
        user = created.user;

        console.log(`[Apple] Nova conta criada: ${maskEmail(finalEmail)} (verified=${emailVerified}, isFirst=${created.isFirst})`);

        // Se primeira conta, é admin auto-aprovada e segue. Caso contrário,
        // aguarda aprovação como qualquer outro registro.
        if (!created.isFirst) {
          import('../pushService').then(({ sendPushToAdmins }) => {
            sendPushToAdmins({
              title: 'Novo usuário aguardando aprovação',
              body: `${displayName || finalEmail} (via Apple) solicitou acesso`,
              url: '/settings',
              tag: 'new-user-pending',
            }).catch(() => {});
          }).catch(() => {});

          res.status(201).json({
            success: true,
            pending: true,
            message: 'Conta criada! Aguarde aprovação de um administrador.',
          });
          return;
        }
      }

      // 5. Bloqueia user não aprovado
      if (!user.approved) {
        res.status(403).json({
          error: 'Sua conta ainda não foi aprovada por um administrador.',
          code: 'PENDING_APPROVAL',
        });
        return;
      }

      // 6. Sucesso — atualiza lastSignedIn e cria token
      await updateUserLastSignedIn(user.id);
      const token = createToken(user.id, user.email);

      // Cookie pro caso de chamarem essa rota da web (não esperado mas defensivo)
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
    } catch (err) {
      console.error('[Apple] Erro no callback:', err);
      res.status(500).json({ error: 'Falha ao autenticar com Apple' });
    }
  });
}
