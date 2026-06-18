# CLAUDE.md — App Cultivo (cultivo-server)

> Contexto do projeto para Claude Code / claude-orchestrator.  
> Atualizar quando stack ou regras mudarem.

---

## Visão Geral

App Cultivo: aplicativo de gerenciamento de cultivo indoor (grow rooms / estufas).
- Usuários conectam dispositivos Tuya com suas próprias credenciais (modelo BYO)
- Backend no VPS próprio via Docker — sem dependência de plataforma
- Mobile via Capacitor (iOS/Android) + PWA
- Display físico ESP32 nas estufas (firmware separado em `esp32-display/`)

## Stack

| Camada | Tecnologia |
|--------|------------|
| Backend | Express + tRPC + Drizzle ORM + SQLite |
| Frontend | React + Vite + Tailwind + shadcn/ui |
| Mobile | Capacitor (iOS/Android) |
| OTA firmware | PlatformIO + C++ (LVGL) |
| Deploy | Docker + Coolify |

## Estrutura de Diretórios

```
cultivo-server/
├── server/          # Express + tRPC routers
│   ├── _core/       # auth, env, storage, middleware
│   └── routers/     # tRPC procedures por domínio
├── client/          # React SPA (src/pages, src/components)
├── shared/          # tipos compartilhados server+client
├── drizzle/         # schema.ts + migrations
├── esp32-display/   # firmware C++ (PlatformIO)
├── docs/internal/   # todo.md (histórico), specs
└── migrations/      # arquivos SQL de migração
```

## Comandos

```bash
# Da raiz do repo
pnpm check          # TypeScript type-check
pnpm lint           # ESLint
pnpm test           # Vitest (unit tests)
pnpm dev            # dev server (porta 5000)
pnpm build          # build de produção
```

## ⚠️ Arquivos PROIBIDOS — nunca tocar

| Arquivo/Padrão | Motivo |
|----------------|--------|
| `.env*` | Secrets de produção |
| `drizzle/schema.ts` | Schema do banco — requer revisão manual + migração |
| `server/_core/auth*` | Autenticação JWT |
| `server/_core/revenuecat.ts` | Billing / IAP |
| `capacitor.config.ts` | Config do app mobile |

## ⚠️ Operações PROIBIDAS

- `pnpm db:push` em produção (local OK)
- `git push --force` em qualquer branch
- Merge automático em `main`
- Deletar qualquer arquivo (exceto artefatos de build em `dist/`, `build/`)
- Alterações no schema Drizzle sem aprovação explícita

## Regras de Commit

Formato: `<tipo>(<escopo>): <descrição> (<referência>) [routine]`  
Exemplo: `fix(client): corrigir overflow em mobile (backlog: tarefa-xpto) [routine]`

Tipos: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`

## Referências Rápidas

- `docs/internal/todo.md` — histórico completo de tarefas (207KB, legado)
- `BACKLOG.md` — itens aprovados para rotinas automáticas
- `STATUS.md` — status da última execução
- `PLAYBOOK.md` — regras de modo headless
- `UI-SHARED-NOTES.md` — notas de UI entre agentes
- `cultivo-site/HANDOFF.md` — contexto do site marketing
