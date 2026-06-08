# STATUS — App Cultivo

## Última execução de rotina
**Data:** 2026-06-08  
**Branch:** routine-cultivo-20260608-1105  
**Executor:** claude-orchestrator (modo background)

---

## Resumo da execução

### BLOQUEIO CRÍTICO — Scaffolding de orquestração ausente

A rotina agendada foi disparada mas não pôde executar nenhum item porque os
arquivos de controle obrigatórios **não existem** em nenhum dos repositórios
(`cultivo-server` e `cultivo-site`):

| Arquivo          | Status         |
|------------------|----------------|
| `CLAUDE.md`      | ❌ Não encontrado |
| `STATUS.md`      | ❌ Criado agora (este arquivo) |
| `BACKLOG.md`     | ❌ Não encontrado |
| `PLAYBOOK.md`    | ❌ Não encontrado |
| `UI-SHARED-NOTES.md` | ❌ Não encontrado |

Sem esses arquivos, o orquestrador não consegue:
- Saber quais itens estão na fila de trabalho (BACKLOG)
- Seguir as regras de segurança e operação (PLAYBOOK)
- Respeitar restrições de UI compartilhada (UI-SHARED-NOTES)
- Registrar progresso com contexto de projeto (CLAUDE.md)

### Itens processados nesta execução
- 0 itens concluídos
- 1 bloqueio registrado (scaffolding ausente)
- 0 commits de feature

---

## Ação necessária de João

Para ativar o sistema de orquestração automática, crie os seguintes arquivos
na raiz do repositório `cultivo-server`:

1. **CLAUDE.md** — Contexto do projeto (stack, convenções, restrições técnicas)
2. **BACKLOG.md** — Fila de trabalho com seções "Próximos", "Em progresso", "Concluídos recentemente"
3. **PLAYBOOK.md** — Regras operacionais, critérios de pulo, modo headless
4. **UI-SHARED-NOTES.md** — Notas de coordenação de UI entre agentes

Enquanto esses arquivos não existirem, a rotina iniciará mas encerrará sem
realizar nenhum trabalho de código.

---

## Histórico de execuções

| Data | Branch | Itens feitos | Bloqueios | Observação |
|------|--------|-------------|-----------|------------|
| 2026-06-08 | routine-cultivo-20260608-1105 | 0 | 1 | Scaffolding de orquestração ausente |
