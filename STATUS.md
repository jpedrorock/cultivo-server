# STATUS — cultivo-server (raiz)

> Arquivo criado automaticamente pelo claude-orchestrator em modo background.

## Última execução de rotina

**Data:** 2026-05-28  
**Branch:** `routine-cultivo-20260528-0000`  
**Agente:** claude-orchestrator (background, sem João disponível)

---

## BLOQUEIO CRÍTICO — Rotina interrompida

### Arquivos de gestão ausentes na raiz do repositório

O roteiro de background exige leitura dos seguintes arquivos antes de qualquer trabalho. Nenhum deles foi encontrado:

| Arquivo | Status |
|---|---|
| `CLAUDE.md` | ❌ Não existe |
| `BACKLOG.md` | ❌ Não existe |
| `PLAYBOOK.md` | ❌ Não existe |
| `UI-SHARED-NOTES.md` | ❌ Não existe |
| `STATUS.md` (raiz) | ❌ Não existia — criado agora |

O único arquivo STATUS.md encontrado no repositório está em `esp32-display/STATUS.md`, que é específico do firmware ESP32 e não contém backlog de tarefas do app.

### Impacto

Sem `BACKLOG.md`, não há itens de trabalho para executar.  
Sem `PLAYBOOK.md`, as regras de modo headless são desconhecidas (apenas as fornecidas no prompt de invocação foram usadas).  
Sem `CLAUDE.md`, o contexto do projeto (stack, convenções, restrições) é desconhecido.

### Ação tomada

- Branch `routine-cultivo-20260528-0000` criada a partir de `main`
- Nenhuma alteração de código realizada (regra: sem backlog = sem trabalho)
- Este arquivo STATUS.md criado para documentar o estado
- PR aberto para notificar João

---

## Itens concluídos nesta execução

_Nenhum — bloqueio imediato._

## Próximas ações sugeridas (para João)

1. Criar `BACKLOG.md` na raiz com seções `## Próximos`, `## Em progresso`, `## Concluídos recentemente`.
2. Criar `PLAYBOOK.md` com regras do modo headless.
3. Criar `CLAUDE.md` com contexto do projeto (stack, comandos, restrições).
4. Opcionalmente criar `UI-SHARED-NOTES.md` se houver notas compartilhadas de UI.
5. Re-disparar a rotina após criação dos arquivos.

---

_Este arquivo deve ser mantido atualizado a cada execução de rotina._
