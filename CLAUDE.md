# CLAUDE.md — App Cultivo

Contexto para Claude Code ao trabalhar neste repositório.

---

## O Projeto

PWA para gerenciar estufas de cultivo indoor. Stack principal:
- **Frontend:** React 19, Tailwind CSS 4, shadcn/ui, Vite 7 (`client/`)
- **Backend:** Express 4 + tRPC 11 (`server/`)
- **DB:** MySQL 8 via Drizzle ORM (`drizzle/`)
- **Auth:** JWT httpOnly cookie + argon2id, Google OAuth opcional
- **Deploy:** Docker Compose

---

## Comandos

```bash
pnpm install        # instalar deps
pnpm dev            # dev server em localhost:3000
pnpm check          # type-check (tsc)
pnpm lint           # eslint
pnpm build          # bundle produção
pnpm test           # vitest
```

**Rode sempre antes de commitar:** `pnpm check && pnpm lint && pnpm test`

---

## Estrutura

```
client/src/
  pages/            # rotas React (TentDetails, PlantDetail, QuickLog, …)
  components/       # UI (PlantNodeMap, Plant3DView, BottomNav, …)
  features/         # lógica de domínio
  lib/              # tRPC client, utils
server/
  _core/            # express, auth, vite middleware, logger
  routers.ts        # procedures tRPC
  db.ts             # conexão drizzle
drizzle/            # schema + migrations (NÃO EDITAR schema.ts sem João)
shared/             # tipos compartilhados client/server
esp32-display/      # firmware ESP32 (projeto separado, PlatformIO)
```

---

## Regras de Segurança (NUNCA violar)

- **NUNCA** editar `drizzle/schema.ts` sem confirmação explícita de João
- **NUNCA** editar `**/auth*`, `**/revenuecat.ts`, `capacitor.config.ts`
- **NUNCA** rodar `db:reset` ou `db:push` em produção
- **NUNCA** `git push --force` ou merge automático em main
- **NUNCA** deletar arquivos (exceto `dist/`, `build/`)
- **NUNCA** commitar `.env*` ou secrets
- Se descobrir secret exposto: PARE, abra PR só com o aviso

---

## Infraestrutura da Rotina Automática

O orchestrator background usa estes arquivos (na raiz):

| Arquivo | Função |
|---|---|
| `BACKLOG.md` | Fila de trabalho com prioridades P0/P1/P2 |
| `PLAYBOOK.md` | Regras operacionais do orchestrator |
| `STATUS.md` | Log de execuções e bloqueios |
| `UI-SHARED-NOTES.md` | Notas de UI compartilhadas entre sessões |

Se algum destes arquivos não existir, o orchestrator registra bloqueio e para.

---

## Itens para Confirmar Antes de Implementar

- Qualquer mudança de schema (drizzle)
- Mudanças em autenticação ou permissões
- Mudanças em flows de pagamento (RevenueCat)
- Refatorações grandes de UI compartilhada
- Decisões de produto (o que mostrar, como organizar)

---

## Links Úteis

- `docs/internal/todo.md` — backlog completo (363+ itens)
- `esp32-display/STATUS.md` — status do projeto firmware ESP32
- `CHANGES.md` — changelog
- `DEPLOY.md` — instruções de deploy
