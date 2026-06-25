# STATUS — Rotina Background Claude Orchestrator

**Última execução:** 2026-06-09  
**Branch:** `routine-cultivo-20260609-0000`  
**Modo:** headless / background  
**Agente:** claude-orchestrator  

---

## Resumo da execução

### Itens concluídos: 0
### Itens bloqueados: 1 (bloqueio crítico — execução abortada)

---

## BLOQUEIO CRÍTICO — arquivos de contexto ausentes

A rotina foi disparada mas **não encontrou os arquivos de contexto obrigatórios** na raiz do repositório `cultivo-server`:

| Arquivo | Status |
|---|---|
| `CLAUDE.md` | ❌ Não existe |
| `STATUS.md` | ❌ Não existia (criado agora com este relatório) |
| `BACKLOG.md` | ❌ Não existe |
| `PLAYBOOK.md` | ❌ Não existe |
| `UI-SHARED-NOTES.md` | ❌ Não existe |

### O que foi encontrado

- `esp32-display/STATUS.md` — status específico do firmware ESP32 (não é o STATUS da rotina)
- `docs/internal/todo.md` — documento de 207KB com todos os TODOs históricos (candidato a BACKLOG, mas sem estrutura "Próximos / Em progresso / Concluídos")
- `cultivo-site/HANDOFF.md` — handoff do site Astro

### Impacto

Sem `BACKLOG.md` não há como saber quais itens executar. Sem `PLAYBOOK.md` não há como verificar as regras de operação. Sem `CLAUDE.md` não há contexto técnico do projeto.

A rotina **não executou nenhum item de trabalho** pois isso seria operar sem contexto e arriscaria fazer mudanças erradas ou conflitantes.

---

## Ação necessária (João)

Para que as próximas rotinas funcionem, crie os seguintes arquivos na raiz do `cultivo-server`:

### 1. `CLAUDE.md` — contexto técnico do projeto
Descreva: stack (Node/Hono/Drizzle/SQLite), estrutura de pastas, comandos de dev/test, convenções de código.

### 2. `BACKLOG.md` — fila de trabalho estruturada
Formato esperado pela rotina:
```markdown
## Próximos
- [ ] [P2] Título do item — Critério de pronto: ...

## Em progresso
(itens sendo trabalhados)

## Concluídos recentemente
(últimas entregas)
```

### 3. `PLAYBOOK.md` — regras de operação para a rotina
Define: como priorizar, o que pular, como lidar com bloqueios, critérios de P0/P1/P2.

### 4. `UI-SHARED-NOTES.md` — notas de UI compartilhadas
Usado para coordenação quando múltiplos agentes tocam em arquivos de UI.

---

## Próximas rotinas

Enquanto os arquivos acima não existirem, a rotina vai sempre bloquear no step 1 e criar um PR de aviso como este.

Sugestão: popule `BACKLOG.md` com itens do `docs/internal/todo.md` e crie um `PLAYBOOK.md` mínimo.

---

## Log técnico desta execução

```
[09:00] Rotina disparada — modo background
[09:00] Tentando ler CLAUDE.md → 404 Not Found
[09:00] Tentando ler STATUS.md → 404 Not Found (apenas esp32-display/STATUS.md existe)
[09:00] Tentando ler BACKLOG.md → 404 Not Found
[09:00] Tentando ler PLAYBOOK.md → 404 Not Found
[09:00] Tentando ler UI-SHARED-NOTES.md → 404 Not Found
[09:01] Bloqueio registrado — criando branch routine-cultivo-20260609-0000
[09:01] STATUS.md criado com relatório de bloqueio
[09:02] PR aberto para alertar João
```
