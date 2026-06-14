# STATUS — App Cultivo (claude-orchestrator)

> Mantido automaticamente pelo claude-orchestrator (background routine).
> Última atualização: 2026-06-14 21:02 UTC

---

## Execução atual

**Branch:** `routine-cultivo-20260614-2102`
**Modo:** background / headless
**Trigger:** Routine agendada
**Resultado:** BLOQUEADO — não foi possível executar o loop de trabalho

---

## Bloqueio crítico — arquivos de contexto ausentes

A rotina não pode operar sem os seguintes arquivos de coordenação que **não existem** no repositório:

| Arquivo | Status | Impacto |
|---|---|---|
| `CLAUDE.md` | ❌ Ausente | Sem contexto do projeto (arquitetura, regras, etc.) |
| `BACKLOG.md` | ❌ Ausente | Sem fila de itens para trabalhar |
| `PLAYBOOK.md` | ❌ Ausente | Sem regras operacionais completas |
| `UI-SHARED-NOTES.md` | ❌ Ausente | Sem notas de UI compartilhadas |
| `STATUS.md` (este arquivo) | ✅ Criado agora | — |

**Consequência**: A rotina não realizou nenhuma mudança de código. Não há itens processados, não há commits de feature.

---

## O que existe no repositório

### cultivo-server (main)
- Estrutura monorepo: `client/` (React/Capacitor), `server/` (Express/Node.js), `esp32-display/` (firmware)
- Arquivos de config: `package.json`, `drizzle.config.ts`, `vite.config.ts`, `vitest.config.ts`
- Docs disponíveis: `CHANGES.md`, `DEPLOY.md`, `README.md`, `GUIA-USUARIO.md`
- `esp32-display/STATUS.md` — existe mas é específico do firmware ESP32

### cultivo-site (site marketing)
- `HANDOFF.md` — documento de coordenação do site (sprint 1 e 2 concluídos)
- Pendente: páginas individuais de calculadora, blog, welcome email

### Branches claude/* abertas (não mergeadas)
Existem ~30 branches `claude/...` abertas que precisam de triagem:
- `claude/automation-toggle`, `claude/backup-import-validation`, `claude/bundle-split`,
- `claude/camera-polish`, `claude/camera-stream-hls`, `claude/cenas-dinamicas-deploy`,
- `claude/ci-dependabot-vitest`, `claude/device-pairing-flow`, `claude/devops-hardening`,
- `claude/esp-automation-support`, `claude/esp-control-via-trpc-path`, etc.

---

## Ação requerida de João

Para que a rotina funcione nas próximas execuções, criar (ou confirmar localização de):

1. **`CLAUDE.md`** — contexto do projeto: stack, arquitetura, regras de domínio
2. **`BACKLOG.md`** — fila priorizada de itens (P0/P1/P2) com critério de pronto claro
3. **`PLAYBOOK.md`** — regras operacionais do orchestrator (o que pode/não pode, como validar)
4. **`UI-SHARED-NOTES.md`** — notas de UI compartilhadas entre agentes

Template sugerido para BACKLOG.md:
```markdown
# BACKLOG

## Próximos
- [ ] [P1] Título do item — Critério: <o que valida como feito>

## Em progresso
(vazio)

## Concluídos recentemente
(vazio)
```

---

## Histórico de execuções

| Data | Branch | Itens processados | Resultado |
|---|---|---|---|
| 2026-06-14 | `routine-cultivo-20260614-2102` | 0 | BLOQUEADO (arquivos de contexto ausentes) |
