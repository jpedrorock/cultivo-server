# CLAUDE.md — App Cultivo

> Contexto do projeto para agentes Claude. Atualizar sempre que houver mudanças arquiteturais.
> **ATENÇÃO:** Este arquivo deve ser preenchido por João com o contexto real do projeto.

---

## Visão geral

**App Cultivo** — aplicativo para gestão de cultivos (plantas, estufas, jardins).

- **Repositório principal:** `jpedrorock/cultivo-server` (monorepo: client + server + shared)
- **Site:** `jpedrorock/cultivo-site` (landing page Astro)
- **Hardware:** ESP32 com display LVGL (`esp32-display/`)

## Tech stack

### Backend (server/)
- Runtime: Node.js + TypeScript
- Framework: Hono (tRPC over Hono)
- ORM: Drizzle + SQLite (better-sqlite3)
- Auth: (a preencher por João)
- Infra: Docker, self-hosted

### Frontend (client/)
- Framework: React + Vite
- UI: Ionic + shadcn/ui components
- Mobile: Capacitor (iOS + Android)
- Pagamentos: RevenueCat

### Shared (shared/)
- Tipos TypeScript compartilhados entre client e server

### Site (cultivo-site/)
- Framework: Astro
- Deploy: Docker

## Comandos de desenvolvimento

```bash
# Na raiz do repo (cultivo-server)
pnpm dev          # inicia client + server em paralelo
pnpm check        # TypeScript check
pnpm lint         # ESLint
pnpm test         # Vitest

# Banco de dados local
pnpm db:push      # aplica schema (só local, NUNCA produção)
pnpm db:studio    # Drizzle Studio
```

## Estrutura de diretórios

```
cultivo-server/
├── client/          # React + Ionic (mobile/web app)
│   └── src/
│       ├── components/
│       ├── pages/
│       └── lib/
├── server/          # Hono + tRPC API
│   └── src/
│       ├── routes/
│       └── db/
├── shared/          # tipos compartilhados
├── drizzle/         # schema e migrations (PROTEGIDO)
├── esp32-display/   # firmware ESP32
└── docs/            # documentação
```

## Convenções

- Commits: `<tipo>: <descrição> (backlog: <título>) [routine]` para automações
- Branches de Claude: `claude/<feature>` ou `routine-cultivo-<timestamp>`
- Nunca tocar em arquivos protegidos (ver PLAYBOOK.md)
- Testes com Vitest — cobertura obrigatória para P1

## Estado atual do projeto

> ⚠️ **A preencher por João** — descrever funcionalidades implementadas, em desenvolvimento e pendentes.

*Última atualização: bootstrap em 2026-06-03 pelo claude-orchestrator.*
