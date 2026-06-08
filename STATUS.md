# STATUS.md — claude-orchestrator

> Atualizado a cada execução da routine. Fonte da verdade sobre o que está em andamento.

---

## Última Execução

**Data:** 2026-06-08  
**Agente:** claude-orchestrator (background routine)  
**Branch criada:** `routine-cultivo-20260608-0000`  
**Resultado:** BLOQUEADO — arquivos de gestão não existiam

### O que aconteceu

1. Tentou ler CLAUDE.md, STATUS.md, BACKLOG.md, PLAYBOOK.md, UI-SHARED-NOTES.md
2. Nenhum desses arquivos existia no repo
3. Explorou estrutura do repo e leu `docs/internal/todo.md` (207KB, 363 itens pendentes)
4. **Ação tomada:** criou os arquivos de gestão bootstrap (este PR)
5. **Nenhum código foi alterado** — apenas arquivos de gestão criados

### Bloqueios Registrados

| # | Bloqueio | Motivo | Resolução |
|---|----------|--------|-----------|
| 1 | BACKLOG.md não existe | Arquivo ausente | Criado bootstrap — João revisa |
| 2 | PLAYBOOK.md não existe | Arquivo ausente | Criado bootstrap — João revisa |
| 3 | UI-SHARED-NOTES.md não existe | Arquivo ausente | Criado bootstrap — João revisa |
| 4 | Loop de trabalho impossível | Sem BACKLOG aprovado | Aguarda próxima execução após João revisar |

### Próximos Passos

- [ ] João revisa `BACKLOG.md` e ajusta prioridades/critérios
- [ ] João revisa `PLAYBOOK.md` e confirma regras
- [ ] João preenche `UI-SHARED-NOTES.md` com arquivos em trabalho ativo
- [ ] Próxima execução da routine terá contexto completo e poderá trabalhar

---

## Histórico de Execuções

| Data | Branch | Itens Concluídos | Bloqueios | Status |
|------|--------|-----------------|-----------|--------|
| 2026-06-08 | routine-cultivo-20260608-0000 | 0 | 4 | Bootstrap — sem código alterado |

---

## Em Progresso Agora

_Nenhum item em andamento._

## Concluídos Recentemente (últimas execuções)

_Nenhum item concluído ainda._
