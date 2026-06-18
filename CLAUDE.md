# App Cultivo — Contexto para Claude

## Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: tRPC + Hono (API REST) + Drizzle ORM
- **Banco**: SQLite (local) / MySQL (produção)
- **Mobile**: Capacitor (iOS/Android)
- **Animações**: framer-motion
- **Testes**: Vitest
- **Package manager**: pnpm

## Estrutura
```
client/src/pages/       — páginas React
client/src/components/  — componentes compartilhados
server/                 — backend Hono + tRPC routers
server/_core/           — auth, email, waitlist, routers core
drizzle/schema.ts       — schema do banco (NÃO TOCAR em background)
shared/                 — tipos compartilhados client/server
```

## Comandos essenciais (rodar na raiz /home/user/cultivo-server)
```bash
pnpm check    # TypeScript type-check
pnpm lint     # ESLint
pnpm test     # Vitest
```

## Restrições críticas (Claude background NÃO pode tocar)
- `drizzle/schema.ts`, `drizzle.config.ts`
- `server/_core/auth.ts`, `server/_core/authRoutes.ts`
- `revenuecat.ts` ou qualquer arquivo de billing
- `capacitor.config.ts`
- Arquivos `.env*`
- Nunca `db:push` em produção, nunca `db:reset`

## Padrões de código
- Componentes React com TypeScript strict
- Mutations tRPC: `utils.X.invalidate()` após sucesso
- Toast: usar `sonner` (`toast.success`, `toast.error`)
- Ícones: `lucide-react`
- Animações: `framer-motion` (disponível)
- CSS: Tailwind utility classes, shadcn/ui para primitivos
- Sem comments explicando o que o código faz (apenas WHY não óbvio)

## Estado do main (atualizado 2026-06-13)
- Commit HEAD: feat(onboarding): E3 — wizard conversacional 5 perguntas
- Features recentes mergeadas: onboarding wizard, DNA visual histórico, aiChat tests, email tests
- Onboarding wizard E1/E2/E3 implementado (presets i18n, componentes chat, wizard 5 perguntas)
