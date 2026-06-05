# STATUS — claude-orchestrator

## Última execução

- **Data:** 2026-05-24 21:07 UTC
- **Branch:** routine-cultivo-20260524-2107
- **Modo:** background / headless
- **Agente:** claude-orchestrator

## Resumo

Rotina agendada disparada. Nenhum item do backlog foi processado.

## Bloqueios

### BLOQUEIO-001: Arquivos de orquestração ausentes no repositório

Os seguintes arquivos são pré-requisitos para execução da rotina e não existem no repo `jpedrorock/cultivo-server` (branch `main`):

| Arquivo          | Propósito                                      | Status    |
|------------------|------------------------------------------------|-----------|
| `CLAUDE.md`      | Contexto e regras do projeto                   | ❌ Ausente |
| `BACKLOG.md`     | Fila de itens a implementar                    | ❌ Ausente |
| `PLAYBOOK.md`    | Regras completas de operação headless          | ❌ Ausente |
| `UI-SHARED-NOTES.md` | Notas de UI compartilhadas entre agentes  | ❌ Ausente |
| `STATUS.md`      | Estado persistente entre execuções             | ❌ Ausente (criado agora) |

Sem `BACKLOG.md`, a fila de itens está vazia → condição de parada "fila acabou" atingida imediatamente.

## Itens processados nesta execução

- Nenhum.

## Próxima execução

Para que a rotina funcione, João deve criar os arquivos ausentes no repositório antes do próximo disparo:

1. **`CLAUDE.md`** — contexto do projeto (arquitetura, stacks, decisões)
2. **`BACKLOG.md`** — lista de itens com seções: `Próximos`, `Em progresso`, `Concluídos recentemente`, e campos: título, prioridade (P0/P1/P2), critério de pronto, flags (`Confirmar antes`, etc.)
3. **`PLAYBOOK.md`** — regras de operação do claude-orchestrator
4. **`UI-SHARED-NOTES.md`** — notas de UI para coordenação entre agentes
