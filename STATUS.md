# STATUS — claude-orchestrator

## Última execução

- **Data:** 2026-06-04
- **Modo:** background (headless)
- **Agente:** claude-orchestrator
- **Branch:** routine-cultivo-20260604-0001

## Resumo

A rotina foi disparada mas **não pôde executar nenhum item** por ausência da infraestrutura de orquestração.

## Bloqueio crítico: arquivos de orquestração ausentes

Os seguintes arquivos referenciados no ROTEIRO não existem no repositório:

| Arquivo | Status | Papel |
|---|---|---|
| `CLAUDE.md` | ❌ Ausente | Contexto do projeto, convenções |
| `BACKLOG.md` | ❌ Ausente | Fila de itens a executar |
| `PLAYBOOK.md` | ❌ Ausente | Regras do modo headless |
| `UI-SHARED-NOTES.md` | ❌ Ausente | Notas de UI compartilhadas |
| `STATUS.md` | ❌ Ausente (criado agora) | Registro de execuções |

Foi encontrado `docs/internal/todo.md` (207KB), mas sem a estrutura de `BACKLOG.md` (seções "Próximos", "Em progresso", "Concluídos recentemente"), o roteiro não pode ser seguido com segurança. Executar itens sem critérios claros violaria a regra: *"Em dúvida: bloqueio, próximo item."*

## Ação tomada

- Nenhum arquivo de código foi modificado.
- Nenhuma decisão de produto foi tomada.
- Este arquivo `STATUS.md` foi criado para registrar o bloqueio.
- PR aberto para revisão de João.

## Próximos passos (para João)

Para habilitar a rotina background, criar os seguintes arquivos na raiz do repositório:

1. **`CLAUDE.md`** — contexto do projeto (stack, convenções, ambientes)
2. **`BACKLOG.md`** — itens com seções:
   - `## Próximos` (itens ordenados por prioridade)
   - `## Em progresso`
   - `## Concluídos recentemente`
   - Cada item com: título, prioridade (P0/P1/P2), critério de pronto, flags (`Confirmar antes`, etc.)
3. **`PLAYBOOK.md`** — regras do modo headless, limites de autonomia, decisões de produto proibidas
4. **`UI-SHARED-NOTES.md`** — notas de UI que a rotina deve consultar antes de tocar em componentes

Sem esses arquivos, a rotina continuará registrando bloqueio e não executará nenhuma tarefa.

## Histórico de execuções

| Data | Itens concluídos | Bloqueios | Observações |
|---|---|---|---|
| 2026-06-04 | 0 | 1 (infra ausente) | Primeira execução — arquivos de orquestração não encontrados |
