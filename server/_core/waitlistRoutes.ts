/**
 * waitlistRoutes — captura de email do site público (cultivo.pro).
 *
 * Substitui Formspree por endpoint próprio. Vantagens:
 * - Dados ficam no nosso DB (queryable via admin panel futuro)
 * - Welcome email automático via Resend (quando RESEND_API_KEY configurado)
 * - Tracking de UTM (de onde vem cada signup)
 * - Anti-enumeração: sempre retorna 200 (não vaza emails já cadastrados)
 *
 * CORS: permitido só de cultivo.pro + dev (vite default :4321).
 *
 * Rate limit: 5 submits/IP/hora (anti-spam).
 *
 * TODO: integrar Resend pra welcome email automático.
 *       Hoje: só registra no DB. Sequência de email manual via admin panel.
 */
import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { getMysqlPool } from '../mysql-pool';
import { sendWelcomeEmail } from './emailService';

const waitlistLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1h
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many submissions. Try again in 1 hour.' },
});

// CORS: permite chamadas do site público + dev local.
// Não usa cors() global pra não vazar pra outros endpoints da API.
function setCorsHeaders(req: Request, res: Response): boolean {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://cultivo.pro',
    'https://www.cultivo.pro',
    'http://localhost:4321',  // Astro dev default
    'http://localhost:3000',  // backup
  ];
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    return true;
  }
  return false;
}

/** Hash do IP pra deduplicar/track sem armazenar IP cru (LGPD/GDPR-friendly). */
function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip + (process.env.JWT_SECRET ?? '')).digest('hex').slice(0, 16);
}

export function registerWaitlistRoutes(app: Express): void {
  const pool = getMysqlPool();

  // OPTIONS preflight pra CORS
  app.options('/api/waitlist', (req: Request, res: Response) => {
    setCorsHeaders(req, res);
    res.sendStatus(204);
  });

  app.post('/api/waitlist', waitlistLimiter, async (req: Request, res: Response) => {
    try {
      // CORS: rejeita se origin não autorizado
      if (!setCorsHeaders(req, res)) {
        // Permite chamada sem origin (curl, etc) — útil pra debug
        if (req.headers.origin) {
          return res.status(403).json({ error: 'Origin not allowed' });
        }
      }

      const { email, locale, utmSource, utmMedium, utmCampaign, source } = req.body as {
        email?: string;
        locale?: string;
        utmSource?: string;
        utmMedium?: string;
        utmCampaign?: string;
        source?: string;
      };

      // Validação básica
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email required' });
      }
      const cleanEmail = email.trim().toLowerCase().slice(0, 200);
      // Email regex simples (não strict — só rejeita lixo óbvio)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // INSERT IGNORE: se email já existe, não duplica nem erra
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '';
      const ipHash = ip ? hashIp(ip) : null;
      const userAgent = (req.headers['user-agent'] ?? '').slice(0, 255);

      await pool.execute(
        `INSERT IGNORE INTO waitlist
         (email, source, locale, utmSource, utmMedium, utmCampaign, ipHash, userAgent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cleanEmail,
          (source ?? 'site').slice(0, 50),
          (locale ?? 'en').slice(0, 8),
          (utmSource ?? '').slice(0, 64) || null,
          (utmMedium ?? '').slice(0, 64) || null,
          (utmCampaign ?? '').slice(0, 64) || null,
          ipHash,
          userAgent,
        ],
      );

      console.log(`[Waitlist] +1 ${cleanEmail} (utm=${utmSource ?? '-'}/${utmMedium ?? '-'}/${utmCampaign ?? '-'})`);

      // Welcome email via Resend (dispara em background, não bloqueia resposta)
      sendWelcomeEmail(cleanEmail, locale ?? 'en').catch(() => {/* já loga internamente */});

      // Resposta sempre igual (anti-enumeração)
      res.json({
        success: true,
        message: 'Got it. We\'ll be in touch when slots open up.',
      });
    } catch (error) {
      console.error('[Waitlist] failed', error);
      res.status(500).json({ error: 'Internal error. Try again or email us directly.' });
    }
  });
}
