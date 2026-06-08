# CLAUDE.md — App Cultivo (cultivo-server)

> Contexto de projeto para agentes Claude. Leia antes de qualquer ação.
> Última atualização: 2026-06-08 (bootstrap automático)

---

## Visão Geral

**App Cultivo** é um app de gestão de cultivo indoor (cannabis) para uso pessoal do João.

- **Backend**: Express + tRPC + Drizzle ORM + SQLite (local) / MySQL (produção)
- **Frontend**: React SPA em `client/`
- **Marketing site**: `jpedrorock/cultivo-site` (Astro)
- **Display hardware**: ESP32 com LVGL em `esp32-display/`
- **Deploy**: Coolify (self-hosted), Docker
- **Público-alvo**: João (uso pessoal) + clientes pagantes do app ($9.90/mês)

## Estrutura de Diretórios

```
cultivo-server/
├── server/              ← backend TypeScript (Express + tRPC)
│   ├── db.ts            ← funções de banco de dados
│   ├── routers.ts       ← roteador tRPC principal (85KB!)
│   ├── routers/         ← roteadores separados por módulo
│   ├── _core/           ← autenticação, middleware
│   ├── cron/            ← cron jobs (alertas, etc.)
│   └── *.test.ts        ← testes Vitest
├── client/              ← React SPA
│   ├── src/
│   │   ├── pages/       ← páginas do app
│   │   ├── components/  ← componentes reutilizáveis
│   │   └── lib/         ← utilitários
│   └── public/
├── shared/              ← tipos compartilhados entre client/server
├── drizzle/             ← schema do banco (RESTRITO)
├── migrations/          ← migrations SQL
├── esp32-display/       ← firmware ESP32
│   └── STATUS.md        ← handoff ESP32 (hardware local do João)
└── docs/internal/       ← documentação interna
    └── todo.md          ← log histórico de tarefas (~200KB)
```

## Comandos de Qualidade

```bash
pnpm check   # TypeScript type check
pnpm lint    # ESLint
pnpm test    # Vitest (unit tests)
```

## Arquivos RESTRITOS (nunca tocar sem autorização explícita)

- `.env*` — variáveis de ambiente
- `drizzle/schema.ts` — schema do banco
- `server/db-auth.ts`, `server/_core/auth*` — autenticação
- `server/pushService.ts` — RevenueCat / push
- `capacitor.config.ts` — Capacitor mobile
- `esp32-display/` — firmware hardware (requer João no Mac)

## Arquivos COMPARTILHADOS (ver UI-SHARED-NOTES.md antes de editar)

Ver `UI-SHARED-NOTES.md` para lista atualizada de arquivos com trabalho em andamento.

## Contexto de Negócio

- Foco internacional, EN é default (`cultivo.pro`)
- App cobra software; usuário usa credenciais Tuya próprias
- Modelo: Calculadoras grátis (SEO) + App $9.90/mês + Cultivo Box (hardware, TBD)
- Site em `jpedrorock/cultivo-site` (Astro, Coolify, pnpm@9.15.4 fixado no Dockerfile)

## Referências

- `docs/internal/todo.md` — histórico completo de tarefas concluídas e pendentes
- `cultivo-site/HANDOFF.md` — estado do site de marketing
- `esp32-display/STATUS.md` — estado do firmware ESP32
- `CHANGES.md` — changelog
- `DEPLOY.md` — guia de deploy
