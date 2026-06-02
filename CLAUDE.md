# CLAUDE.md — App Cultivo (cultivo-server)

## Visão Geral

App Cultivo é um aplicativo de gerenciamento de estufas indoor. Backend + frontend web em monorepo, builds para iOS/Android via Capacitor.

- **Site de marketing**: `cultivo-site/` (Astro, separado)
- **App**: `cultivo-server/` (este repo)

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js 20+ |
| Framework web | Express + tRPC |
| Frontend | React 19, Vite, Tailwind CSS v4 |
| ORM | Drizzle (MySQL/libsql) |
| Testes | Vitest |
| TypeScript | `pnpm check` para typecheck |
| Lint | ESLint v9 |
| Mobile | Capacitor (iOS + Android) |

## Comandos Essenciais

```bash
pnpm check        # typecheck TypeScript
pnpm lint         # eslint
pnpm test         # vitest run
pnpm dev          # servidor dev
pnpm build        # build prod
```

## Estrutura do Projeto

```
server/           — backend Node.js/tRPC
  _core/          — auth, email, push, env, trpc, index
  routers/        — sub-routers tRPC (alerts, cycles, plants, tents, tasks...)
  *.test.ts       — testes unitários
client/src/       — frontend React
  pages/          — páginas da app
  components/     — componentes reutilizáveis
  lib/            — utils, trpc client, uploadImage
drizzle/          — schema ORM (não tocar em schema.ts sem João)
esp32-display/    — firmware ESP32 (projeto separado)
docs/internal/    — documentação interna (todo.md desatualizado)
```

## Arquivos Proibidos para Agentes Background

- `.env*` — nunca modificar
- `drizzle/schema.ts` — mudanças de schema precisam de aprovação + migração
- `server/_core/auth.ts`, `authRoutes.ts`, `appleAuthRoutes.ts` — sem tocar
- `server/_core/revenuecat.ts` (se existir)
- `capacitor.config.ts` — configuração mobile

## Padrão de Testes

Os testes em `server/` são unitários (Vitest). Testes que precisam de DB são marcados com `skipIf(!process.env.DATABASE_URL)` e rodam só com DB disponível. Testes puro-lógicos (nutrients, watering, email, storage mock) rodam sempre.

Mock pattern do emailService.test.ts:
```ts
const mockFn = vi.hoisted(() => vi.fn());
vi.mock('módulo', () => ({ fn: mockFn }));
```

## Orchestrador Background

Ver PLAYBOOK.md para regras de operação autônoma.
