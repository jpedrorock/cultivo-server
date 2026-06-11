# App Cultivo — Contexto para Claude Code

## O que é este projeto

App móvel (iOS + Android) via Capacitor para gerenciamento de cultivo indoor. Backend Express/tRPC com MySQL. Usuários gerenciam estufas, plantas, ciclos de cultivo, sensores IoT (Tuya, ESP32) e alertas automáticos.

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 19, Vite 7, TailwindCSS 4, shadcn/ui, Wouter |
| Backend | Express 4, tRPC 11, Drizzle ORM, MySQL (não SQLite) |
| Mobile | Capacitor 8, RevenueCat, Sentry |
| IoT | Tuya Cloud API, ESP32 (LVGL, PlatformIO) |
| Email | Resend |
| Push | Web Push (VAPID), `server/pushService.ts` |
| Testes | Vitest 3 (SQLite in-memory) |
| CI | GitHub Actions |

## Scripts principais

```bash
pnpm check           # TypeScript typecheck
pnpm lint            # ESLint
pnpm test            # Vitest run
pnpm dev             # Dev server (tsx watch)
pnpm build           # Build produção
pnpm db:push         # Aplica schema no banco — LOCAL ONLY, nunca em produção
pnpm db:seed         # Seed inicial
```

## Arquivos PROIBIDOS (nunca modificar automaticamente)

- `drizzle/schema.ts` — Schema do banco
- `server/_core/auth.ts` — JWT helpers
- `server/_core/authRoutes.ts` — Rotas de autenticação
- `server/_core/appleAuthRoutes.ts` — Login com Apple
- `server/db-auth.ts` — DB helpers de usuário
- Qualquer arquivo com `revenuecat` no nome ou conteúdo
- `capacitor.config.ts` — Configuração Capacitor
- `.env*` — Variáveis de ambiente

## Arquivos de orquestração (raiz do repo)

| Arquivo | Função |
|---------|--------|
| `CLAUDE.md` | Este contexto |
| `BACKLOG.md` | Itens de trabalho priorizados |
| `PLAYBOOK.md` | Regras do modo headless |
| `STATUS.md` | Estado da última execução de rotina |
| `UI-SHARED-NOTES.md` | Notas compartilhadas de UI |

## Estrutura de pastas

```
server/
  _core/          # Auth, env, index, email, logger, tRPC context
  routers/        # tRPC routers por domínio (split)
  routers.ts      # Router raiz (~85KB — monolith legado)
  *.test.ts       # Testes Vitest (SQLite in-memory via testHelpers.ts)
client/
  src/
    pages/        # Páginas React
    components/   # Componentes reutilizáveis
    hooks/        # Custom hooks
shared/           # Tipos TypeScript compartilhados
drizzle/
  schema.ts       # Schema Drizzle (PROTEGIDO)
esp32-display/    # Firmware PlatformIO (LVGL, C++)
docs/
  internal/       # todo.md (~200KB), specs, etc.
```

## Invariantes importantes

- MySQL: queries booleanas usam `= 1` (não `= true`)
- Todas as procedures tRPC verificam autenticação via `ctx.userId`
- Storage: MinIO/S3-compatible (não AWS direto)
- RevenueCat: subscriptions mobile — nunca alterar lógica de entitlement
- Testes rodam em SQLite in-memory via `server/_core/testHelpers.ts`
- CI/CD: GitHub Actions em `.github/workflows/`

## Repos relacionados

- `jpedrorock/cultivo-site` — Site de marketing (Astro), tem HANDOFF.md próprio
