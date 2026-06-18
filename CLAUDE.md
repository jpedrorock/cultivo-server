# App Cultivo — Guia para Claude

## O que é
App de gerenciamento de estufas indoor com IoT (Tuya, ESP32).
Monorepo: server Express + client Capacitor (React/Vite).

## Stack
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express + tRPC
- **DB**: SQLite (local dev) / MySQL (produção Manus) via Drizzle ORM
- **App**: Capacitor 8.x (iOS + Android)
- **Pagamentos**: RevenueCat (4 tiers: Free / Starter / Cloud / Pro)
- **IoT**: Tuya API + ESP32 (diretório `esp32-display/`)
- **Testes**: Vitest — 161/162 passando (1 skip intencional)

## Comandos
```bash
pnpm check    # tsc + build
pnpm lint     # eslint
pnpm test     # vitest
pnpm dev      # servidor local
pnpm db:seed  # popula banco local (seed.mjs)
```

## Estrutura de pastas
```
client/           ← React app (Capacitor)
  src/
    components/   ← componentes UI
    pages/        ← rotas
    hooks/        ← React hooks
server/           ← Express + tRPC
  _core/          ← auth, middleware, storage
  routes/         ← roteadores tRPC
shared/           ← tipos e schemas compartilhados
drizzle/          ← schema Drizzle + migrations geradas
migrations/       ← SQL migrations
esp32-display/    ← firmware ESP32 (C++)
```

## Arquivos PROTEGIDOS (nunca tocar em background)
- `drizzle/schema.ts` — schema DB (mudanças exigem migration manual)
- `server/_core/auth*` — autenticação
- `server/_core/revenuecat.ts` — pagamentos
- `capacitor.config.ts` — config iOS/Android
- `.env*` — variáveis de ambiente

## Arquivos de coordenação da routine
| Arquivo | Propósito |
|---|---|
| `BACKLOG.md` | Fila de trabalho (Próximos / Em progresso / Concluídos) |
| `STATUS.md` | Estado atual e bloqueios registrados |
| `PLAYBOOK.md` | Regras para sessões background |
| `UI-SHARED-NOTES.md` | Decisões de UI compartilhadas entre sessões |

## Convenções de commit
```
<tipo>: <descrição> (backlog: <título>) [routine]
```
Tipos: `feat`, `fix`, `test`, `chore`, `refactor`, `docs`

## Tiers de plano (usePlan.ts)
- **Free**: 1 estufa, 4 calcs, 7d histórico
- **Starter**: 3 estufas, 7 calcs, 30d histórico + fotos/presets/alertas
- **Cloud**: ∞ estufas, histórico completo + AI Chat + IoT
- **Pro**: Cloud + equipe (3 membros)
