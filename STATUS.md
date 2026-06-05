# STATUS — claude-orchestrator

## Última execução
- **Data:** 2026-05-25
- **Branch:** routine-cultivo-20260525-0109
- **Modo:** background / headless
- **Itens concluídos:** 0
- **Itens bloqueados:** 1 (bloqueio crítico — routine não pôde executar)

---

## Bloqueio Crítico — Arquivos de contexto ausentes

**Registrado por:** claude-orchestrator 2026-05-25 (background)

Os arquivos de contexto que a routine depende **não existem** em nenhum dos repositórios (`jpedrorock/cultivo-server`, `jpedrorock/cultivo-site`) nem no ambiente local de execução:

| Arquivo | Status |
|---|---|
| `CLAUDE.md` | ❌ não encontrado |
| `BACKLOG.md` | ❌ não encontrado |
| `PLAYBOOK.md` | ❌ não encontrado |
| `UI-SHARED-NOTES.md` | ❌ não encontrado |
| `STATUS.md` | criado agora (este arquivo) |

**Impacto:** Sem `BACKLOG.md`, não há itens a processar. Sem `PLAYBOOK.md`, as regras de segurança e critérios de pronto não podem ser verificados. A routine foi **encerrada sem executar nenhuma mudança de código** para preservar segurança.

**Ação necessária:**
1. Criar `BACKLOG.md` com seções: `## Próximos`, `## Em progresso`, `## Concluídos recentemente`
2. Criar `CLAUDE.md` com contexto do projeto (stack, convenções, arquivos sensíveis)
3. Criar `PLAYBOOK.md` com regras da routine (ou confirmar que as regras são as do prompt de disparo)
4. Criar `UI-SHARED-NOTES.md` com notas de UI compartilhadas entre agentes
5. Commitar esses arquivos no branch `main` de `cultivo-server` ou `cultivo-site`

---

## Histórico de execuções anteriores

_(nenhuma — primeira execução registrada)_
