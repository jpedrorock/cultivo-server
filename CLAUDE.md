# Cultivo Server — Guia do Orchestrator

## Visão Geral

App Cultivo: aplicativo mobile (iOS + Android) + web para monitoramento e controle de cultivo indoor.

**Repositórios**:
- `jpedrorock/cultivo-server` (este repo) — monorepo: backend Node.js/Express + React web client + Capacitor mobile
- `jpedrorock/cultivo-site` — site marketing Astro (cultivo.pro)

## Stack Técnica

### Backend (`server/`)
- Node.js + Express + tRPC
- Drizzle ORM (MySQL em produção, SQLite em testes)
- JWT auth (bcrypt passwords) + Apple Sign-In
- Resend para emails transacionais
- MinIO (S3-compatible) para storage de fotos
- Web Push para notificações
- node-cron para tarefas agendadas

### Frontend (`client/`)
- React 19 + TypeScript + Vite
- TailwindCSS 4 + Radix UI + shadcn/ui
- tRPC client + TanStack Query
- Wouter para roteamento

### Mobile (`android/`, `ios/`)
- Capacitor 8
- RevenueCat para subscriptions
- Sentry para crash reporting

### Testes
- Vitest (`pnpm test`)
- Banco de dados in-memory em testes

## Scripts Principais

```bash
pnpm check      # TypeScript type check
pnpm lint       # ESLint
pnpm test       # Vitest
pnpm dev        # Dev server
pnpm build      # Build produção
```

## Zonas de Risco (NUNCA TOCAR)

- `drizzle/schema.ts` — schema do banco
- `server/_core/auth.ts`, `server/_core/authRoutes.ts`, `server/_core/appleAuthRoutes.ts` — autenticação
- `capacitor.config.ts` — config mobile
- Qualquer arquivo `.env*` — variáveis de ambiente
- `server/db-auth.ts` — funções de DB de autenticação

## Zonas Seguras para Automação Background

- `server/_core/emailService.ts` — emails transacionais
- `server/_core/waitlistRoutes.ts` — waitlist endpoint
- `server/lib/` — utilitários
- `docs/` — documentação
- Arquivos de orquestração raiz (este, BACKLOG.md, etc.)
- Testes novos que não tocam schema

## Arquivos de Orquestração

| Arquivo | Propósito |
|---------|-----------|
| `CLAUDE.md` | Este arquivo — contexto do projeto |
| `BACKLOG.md` | Fila de trabalho priorizada |
| `STATUS.md` | Estado atual e histórico de runs |
| `PLAYBOOK.md` | Regras de operação background |
| `UI-SHARED-NOTES.md` | Notas de coordenação de UI |

## Modelo de Receita

- App pago $9.90/mês (trial 14 dias) via RevenueCat
- Subscriptions no iOS/Android
- Objetivo: 1k usuários pagantes
- Waitlist ativa em cultivo.pro

## Infraestrutura Produção

- Backend: Docker + VPS (Coolify)
- DB: MySQL
- Storage: MinIO
- Email: Resend (noreply@cultivo.pro)
- DNS: Cloudflare

## Coordenação entre Repositórios

- cultivo-site → chama `/api/waitlist` no cultivo-server
- cultivo-site → links para `https://app.cultivo.pro` (cultivo-server)
- cultivo-server → serve o app em `app.cultivo.pro`
- cultivo-site HANDOFF.md é a fonte da verdade para mudanças no site
