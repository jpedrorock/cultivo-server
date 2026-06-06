# App Cultivo — Contexto para Sessões Claude Code

## Visão Geral
App de gestão de cultivo indoor (mobile iOS + Android via Capacitor) + servidor próprio.
Meta atual: 1k usuários pagantes a $9.90/mês.

## Repositórios
- `jpedrorock/cultivo-server` — App full-stack + mobile shell (este repo)
- `jpedrorock/cultivo-site` — Site de marketing Astro em cultivo.pro

## Stack — cultivo-server
- **Frontend**: React 19 + TanStack Query + tRPC + Wouter + Tailwind CSS 4 + Radix UI
- **Backend**: Express + tRPC + Drizzle ORM
- **DB**: SQLite (dev local) / MySQL (produção)
- **Mobile**: Capacitor 8 (iOS + Android)
- **Auth**: JWT nativo + Google OAuth + Apple Sign-in
- **Email**: Resend (`server/_core/emailService.ts`)
- **Storage**: Disco local (`server/storageLocal.ts`)
- **Pagamentos**: RevenueCat
- **Testes**: Vitest (unit, mocks de DB/Resend)

## Comandos Principais
```bash
pnpm dev          # servidor + frontend em modo dev
pnpm check        # TypeScript type-check (sem emit)
pnpm lint         # ESLint
pnpm test         # Vitest (só unit tests — sem DB real)
pnpm build        # build de produção
pnpm db:push      # aplica schema no DB local (SQLite OK; MySQL em prod, cuidado)
pnpm db:migrate   # roda migrations incrementais
```

## Arquivos Protegidos (NUNCA modificar sem João)
- `drizzle/schema.ts` — definição do schema
- `server/_core/auth.ts`, `server/_core/authRoutes.ts` — JWT e rotas de auth
- `server/_core/appleAuthRoutes.ts` — Sign in with Apple
- `revenuecat.ts` (client) — pagamentos in-app
- `capacitor.config.ts` — configuração mobile (bundle ID, plugins)
- `.env`, `.env.*` — variáveis de ambiente

## Estrutura Principal
```
server/
  _core/           # infra: auth, email, env, trpc, logger, migrations, waitlist
  routers/         # routers tRPC por domínio (se separados do routers.ts)
  routers.ts       # router principal tRPC (85k — agrega tudo)
  db.ts            # lógica de banco principal (34k)
  pushService.ts   # web push notifications
  alertChecker.ts  # checagem automática de alertas de tent
  cron/            # jobs agendados (node-cron)
client/            # React frontend
shared/            # tipos e schemas Zod compartilhados
drizzle/           # schema + migrações geradas pelo drizzle-kit
esp32-display/     # firmware C++ do display físico nas estufas
```

## Gestão do Projeto (arquivos neste repo)
- `BACKLOG.md` — fila de trabalho: Próximos → Em progresso → Concluídos
- `STATUS.md` — log das execuções do orchestrator background
- `PLAYBOOK.md` — regras de operação headless do orchestrator
- `UI-SHARED-NOTES.md` — notas de coordenação para mudanças de UI (criar quando necessário)

## Deploy
- **Produção**: Docker Compose em VPS / Coolify
- **DB prod**: MySQL (ver `DATABASE_URL`)
- **Email**: Resend (configurar `RESEND_API_KEY` no Coolify)
- **Push notifications**: web-push (VAPID keys em env)
- Documentação completa em `DEPLOY.md`

## Modelo de Negócio (contexto para decisões)
- Não é plataforma SaaS centralizada de Tuya — cada user usa suas próprias credenciais Tuya
- Não migrar para OAuth Tuya centralizado (ativaria Flagship $25k/ano)
- Site: EN default `/`, PT em `/pt/`; calculadoras grátis como lead magnet SEO
