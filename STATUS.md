# STATUS — claude-orchestrator background

> Atualizado automaticamente pelo claude-orchestrator em modo headless.
> Última execução: 2026-06-13

---

## Execução atual: routine-cultivo-20260613-0000

**Modo:** background (João indisponível)  
**Resultado:** parado imediatamente — fila vazia (BACKLOG.md ausente)  
**Itens processados:** 0  
**Bloqueios registrados:** 1 (infra — ver abaixo)

---

## Bloqueio #1 — Arquivos de orquestração ausentes

**Severidade:** CRÍTICO — impede qualquer execução autônoma futura  
**Detectado em:** step 1 do roteiro (leitura de contexto)

**Arquivos esperados (não encontrados em `jpedrorock/cultivo-server`):**

| Arquivo | Papel | Status |
|---|---|---|
| `CLAUDE.md` | Contexto do projeto pra IA | ❌ ausente |
| `BACKLOG.md` | Fila de tarefas (`Próximos` / `Em progresso` / `Concluídos`) | ❌ ausente |
| `PLAYBOOK.md` | Regras detalhadas do modo headless | ❌ ausente |
| `STATUS.md` | Registro de execuções (este arquivo) | ✅ criado agora |
| `UI-SHARED-NOTES.md` | Notas de coordenação UI entre IAs | ❌ ausente |

**Consequência:** sem BACKLOG.md, a condição `fila acabou` é ativada imediatamente e nenhum trabalho pode ser feito.

---

## O que foi encontrado nos repositórios

### `jpedrorock/cultivo-server`
- Projeto Node.js/TypeScript com Hono + SQLite (Drizzle ORM)
- Estrutura: `server/` (API), `client/` (frontend), `shared/`, `esp32-display/`
- Testes: Vitest (`server/*.test.ts`) — boa cobertura
- Scripts: `pnpm check`, `pnpm lint`, `pnpm test` disponíveis
- `.claude/launch.json` e `.claude/start-dev.sh` existem (integração Claude Code já configurada)
- **Sem** CLAUDE.md, BACKLOG.md, PLAYBOOK.md, UI-SHARED-NOTES.md

### `jpedrorock/cultivo-site`
- Projeto Astro (site marketing em `cultivo.pro`)
- `HANDOFF.md` existe com itens pendentes documentados (Sprint 3 ideas)
- **Sem** BACKLOG.md — o HANDOFF.md é o substituto atual mas não segue o formato do roteiro

---

## Ação necessária (João)

Para que o modo background funcione nas próximas execuções, criar os seguintes arquivos:

### 1. `BACKLOG.md` (mínimo viável)

```markdown
# BACKLOG — App Cultivo

## Próximos

<!-- Adicionar itens aqui no formato: -->
<!-- ### [P2] Título do item -->
<!-- **Critério de pronto:** ... -->
<!-- **Toca:** arquivo1.ts, arquivo2.ts -->
<!-- **Notas:** ... -->

## Em progresso

## Concluídos recentemente
```

**Sugestão de seed** (baseado em `cultivo-site/HANDOFF.md`):
- Páginas individuais de calculadora com SEO (`/calculators/vpd`, etc.) — `cultivo-site`
- Welcome email via Resend — TODO já marcado em `server/_core/waitlistRoutes.ts`
- Blog setup (Astro Content Collection) — `cultivo-site`

### 2. `CLAUDE.md`

Contexto do projeto: stack, convenções, o que evitar, decisões de arquitetura já tomadas.
Pode ser gerado a partir do `HANDOFF.md` do cultivo-site como base.

### 3. `PLAYBOOK.md`

Regras completas do modo headless, critérios de pulagem, definição de P0/P1/P2,
formato de commit, etc.

### 4. `UI-SHARED-NOTES.md`

Arquivo de coordenação para mudanças de UI — evita conflitos entre sessões paralelas.

---

## Histórico de execuções

| Data | Branch | Itens feitos | Bloqueios | Motivo parada |
|---|---|---|---|---|
| 2026-06-13 | routine-cultivo-20260613-0000 | 0 | 1 (infra) | fila vazia — BACKLOG.md ausente |
