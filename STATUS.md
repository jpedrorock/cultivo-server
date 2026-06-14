# STATUS — App Cultivo

> Atualizado por: claude-orchestrator (background routine)
> Data: 2026-06-14

---

## 🔴 Última execução: BLOQUEADA (2026-06-14)

### Resumo

Routine agendada disparou em modo headless/background. A execução foi **interrompida no passo 1** (Leitura de contexto) porque os arquivos de planejamento obrigatórios não existem no repositório.

### Bloqueios encontrados (3/3 — parada obrigatória)

| # | Arquivo esperado | Status | Impacto |
|---|---|---|---|
| 1 | `CLAUDE.md` | ❌ Não existe | Sem contexto de arquitetura |
| 2 | `BACKLOG.md` | ❌ Não existe | Sem fila de tarefas para processar |
| 3 | `PLAYBOOK.md` | ❌ Não existe | Sem regras de operação detalhadas |
| 4 | `UI-SHARED-NOTES.md` | ❌ Não existe | Sem notas de UI compartilhadas |

> Atingiu limite de 3 bloqueios — parada conforme regras do PLAYBOOK (embutido no prompt de rotina).

### O que foi investigado

- ✅ Repositório `cultivo-server` (GitHub + local) — sem CLAUDE.md/BACKLOG.md/PLAYBOOK.md
- ✅ Repositório `cultivo-site` (GitHub) — tem HANDOFF.md mas não os arquivos esperados
- ✅ Google Drive — sem documentos de planejamento do Cultivo (BACKLOG/PLAYBOOK)
- ✅ Diretório `.claude/` do repo — contém apenas `launch.json` e `start-dev.sh`

### O que existe

- `cultivo-site/HANDOFF.md` — documento de handoff do site (Sprint 1 e 2 concluídos)
- `esp32-display/STATUS.md` — status do firmware ESP32 (escopo diferente)

---

## 📋 Próxima execução

Para que a rotina funcione, João precisa criar os seguintes arquivos no repositório `cultivo-server`:

### Arquivos necessários

**`CLAUDE.md`** — Guia de arquitetura para a IA:
- Stack tecnológico e convenções
- Estrutura de pastas e módulos principais
- Regras de segurança específicas do projeto

**`BACKLOG.md`** — Fila de trabalho no formato esperado:
```markdown
## Próximos
- [ ] [P2] Título da tarefa — critério claro de pronto

## Em progresso
(vazio)

## Concluídos recentemente
(itens completados)
```

**`PLAYBOOK.md`** — Regras de operação da rotina:
- Critérios de pulo de tarefas
- Definição de arquivos "compartilhados" que requerem autorização
- Formato de commits e PRs

**`UI-SHARED-NOTES.md`** — Notas de UI compartilhadas entre sessões:
- Últimas 5 entradas relevantes para coordenação

---

## 📝 Histórico de execuções

| Data | Branch | Itens processados | Bloqueios | Resultado |
|---|---|---|---|---|
| 2026-06-14 | `routine-cultivo-20260614-1103` | 0 | 3 | Parado — arquivos de planejamento ausentes |
