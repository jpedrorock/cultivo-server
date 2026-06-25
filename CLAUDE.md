# App Cultivo — Contexto para Claude

## O que é este projeto

PWA + app mobile (Capacitor) para gerenciar estufas de cultivo indoor. Backend Express+tRPC+MySQL, frontend React 19 + Tailwind 4 + shadcn/ui. Mono-repositório com client/, server/, shared/, drizzle/, android/, ios/.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, Tailwind CSS 4, shadcn/ui, Vite 7, Wouter |
| Backend | Express 4 + tRPC 11 (type-safe end-to-end) |
| Database | MySQL 8.0 via Drizzle ORM |
| Auth | JWT (httpOnly cookie) + argon2id, Google OAuth opcional |
| Storage | Disco local (`/app/uploads`, volume Docker) |
| Mobile | Capacitor 8 (iOS + Android), RevenueCat |
| 3D | Three.js (vanilla) |
| Logger | pino |

## Comandos essenciais

```bash
pnpm install          # instalar dependências
pnpm dev              # dev server em http://localhost:3000
pnpm check            # TypeScript (sem emitir)
pnpm lint             # ESLint
pnpm test             # Vitest (requer MySQL rodando)
pnpm build            # bundle produção
```

## Estrutura

```
client/src/
  pages/              # rotas (Home, PlantDetail, TentDetails, QuickLog, …)
  components/         # UI reutilizável (BottomNav, Sidebar, Cards, Modais, …)
  features/           # lógica de domínio
  lib/                # tRPC client, utils
server/
  _core/              # express, auth, vite middleware, logger
  routers/            # procedures tRPC por domínio
  routers.ts          # aggregador
  db.ts               # conexão drizzle + helpers de consulta
  alertChecker.ts     # lógica de alertas automáticos
  *.test.ts           # testes vitest
drizzle/              # schema.ts + migrations geradas
shared/               # tipos e constantes compartilhados
```

## Arquivos PROIBIDOS para automação

Nunca modificar sem confirmação explícita do João:

- `drizzle/schema.ts` e qualquer `drizzle/migrations/`
- `server/db-auth.ts`, `server/db.ts` (conexão/auth core)
- `capacitor.config.ts`
- `server/revenuecat.ts` (ou qualquer arquivo com RevenueCat)
- `.env*`
- `pnpm-lock.yaml` (a menos que seja resultado de `pnpm install` explícito)

## Convenções de código

- TypeScript estrito, sem `any` explícito
- React functional components, hooks para lógica de estado
- shadcn/ui para componentes base (Dialog, Button, Badge, etc.)
- Tailwind classes inline, sem CSS separado
- tRPC procedures no `server/routers/` por domínio
- Sem comentários óbvios; comentar apenas "por quê" não-óbvio
- Textos da UI em **português brasileiro**
- Mobile-first: testar touch targets e espaçamento

## Convenções de testes

- Vitest, arquivos `*.test.ts` ao lado do arquivo testado
- `server/test-helpers.ts` para utilitários de teste
- Testes sem banco real: usar mocks/stubs
- Cobertura: ao menos happy path + error path

## Notas de produto

- Usuários são cultivadores individuais (não multi-tenant público)
- App é em português brasileiro
- Plantas têm ciclos: MAINTENANCE → CLONING → VEGA → FLORA → DRYING
- Estufas (tents) têm tipos: MAINTENANCE, CLONING, VEGA, FLORA
- Alertas são internos ao app (sem email/push externo por enquanto)
- Upload de foto: browser processa HEIC→JPEG via canvas, servidor recebe JPEG final
