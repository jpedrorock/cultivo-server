# STATUS — Rotina Background Cultivo

> Arquivo mantido pelo claude-orchestrator. Última atualização: **2026-06-13**.

---

## Execução atual

**Branch:** `routine-cultivo-20260613-1603`
**Executor:** claude-orchestrator (background, modo headless)
**Resultado:** BLOQUEADO — arquivos de controle ausentes (ver abaixo)

---

## Histórico de execuções

### 2026-06-13 — Primeira execução

| | |
|---|---|
| **Itens processados** | 0 |
| **Itens concluídos** | 0 |
| **Bloqueios** | 1 (fatal) |

**Bloqueio: arquivos de controle não encontrados**

O roteiro da rotina requer os seguintes arquivos na raiz do repo, nenhum dos quais existe:

| Arquivo | Uso |
|---|---|
| `CLAUDE.md` | Regras do projeto, stack, convenções para o agente |
| `BACKLOG.md` | Fila de tarefas ("Próximos", "Em progresso", "Concluídos recentemente") |
| `PLAYBOOK.md` | Playbook da rotina (regras de segurança, critérios de pronto, modo headless) |
| `UI-SHARED-NOTES.md` | Notas de coordenação entre agentes sobre arquivos de UI compartilhados |

Sem esses arquivos a rotina não tem o que executar e não tem regras para seguir com segurança.

**O que foi encontrado:**
- `docs/internal/todo.md` — 363 itens pendentes (não estruturados em prioridade/critério de pronto)
- `esp32-display/STATUS.md` — status do projeto ESP32 (display não renderizando)
- `CHANGES.md`, `DEPLOY.md`, `README.md` — documentação existente

---

## Ação necessária (João)

Para que a próxima execução da rotina funcione, criar os arquivos abaixo:

### 1. `BACKLOG.md` (obrigatório)

Estrutura mínima:
```markdown
# BACKLOG — App Cultivo

## Próximos
- [ ] [P2] Título do item | Critério: o que "pronto" significa | Arquivos: lista
- [ ] ...

## Em progresso
(vazio inicialmente)

## Concluídos recentemente
(vazio inicialmente)

## Bloqueados / Aguardando
(vazio inicialmente)
```

Sugestão de prioridades com base em `docs/internal/todo.md`:
- **Alertas de preferências** (backend tRPC + UI) — seção "Backend de Preferências de Alertas"
- **Tarefas de secagem** (taskTemplates para fase DRYING) — seção "Tarefas de Secagem"
- **Colapso automático de tarefas ao marcar concluída** — seção "Colapso Automático de Tarefas"

### 2. `CLAUDE.md` (obrigatório)

Deve incluir: stack, comandos (`pnpm check`, `pnpm lint`, `pnpm test`), arquivos proibidos, convenções de commit.

### 3. `PLAYBOOK.md` (obrigatório)

Deve incluir: definição de P0/P1/P2, critérios de segurança, regras de modo headless.

### 4. `UI-SHARED-NOTES.md` (obrigatório para itens de UI)

Pode começar vazio, mas precisa existir.

---

## Estado do repo (referência)

- **Último commit em main:** `cf62345` — `feat(esp32): toggle "Girar tela 180°" no Config (sem reflash) — v0.5.5`
- **Branch ativa (esp32):** `claude/esp32-greenhouse-monitor-yoIDp` — display não renderizando (diagnóstico em `esp32-display/STATUS.md`)
- **Pendentes em `docs/internal/todo.md`:** 363 itens

---

## Próxima execução

Quando os arquivos de controle existirem, a rotina vai:
1. Ler CLAUDE.md, BACKLOG.md, PLAYBOOK.md, UI-SHARED-NOTES.md
2. Criar branch `routine-cultivo-YYYYMMDD-HHMM`
3. Processar até 5 itens do topo de "Próximos" no BACKLOG
4. Rodar `pnpm check && pnpm lint && pnpm test` por item
5. Abrir PR com o que foi feito
