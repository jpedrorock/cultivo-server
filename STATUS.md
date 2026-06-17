# STATUS — App Cultivo Automation

> Atualizado por: claude-orchestrator (background routine)
> Última execução: 2026-05-28 21:10

---

## Última Execução

**Branch**: `routine-cultivo-20260528-2110`
**Data**: 2026-05-28
**Itens processados**: 0
**Itens com bloqueio**: 1 (bloqueio crítico)
**Itens concluídos**: 0

---

## 🚨 Bloqueio Crítico — Arquivos de Gestão Ausentes

**Status**: BLOQUEADO — fila vazia, rotina encerrada sem processar itens.

Os arquivos necessários para a operação do loop automático **não existem** no repositório:

| Arquivo | Status | Impacto |
|---------|--------|---------|
| `CLAUDE.md` | ❌ Ausente | Sem contexto de arquitetura do projeto |
| `BACKLOG.md` | ❌ Ausente | Sem fila de itens estruturada (P0/P1/P2) |
| `PLAYBOOK.md` | ❌ Ausente | Sem regras operacionais confirmadas |
| `UI-SHARED-NOTES.md` | ❌ Ausente | Sem lista de arquivos UI compartilhados protegidos |
| `STATUS.md` | ✅ Criado agora | Este arquivo |

### O que foi encontrado

- `docs/internal/todo.md` existe (207 KB) com **363 itens não concluídos**
- Porém: esse arquivo não tem estrutura de prioridade (P0/P1/P2), não tem marcadores "Confirmar antes", e muitos itens exigem `pnpm db:push` (schema changes — proibido pelas safety rules)
- Sem o `BACKLOG.md` estruturado, não é possível identificar quais itens são seguros para automação

### Próxima ação necessária (João)

Para que a rotina automática funcione, crie os seguintes arquivos:

1. **`BACKLOG.md`** — com seções `## Próximos`, `## Em progresso`, `## Concluídos recentemente`; cada item com prioridade (P1/P2/P3), critério de pronto claro, e marcador `[Confirmar antes]` quando necessário.
2. **`CLAUDE.md`** — contexto de arquitetura (estrutura do projeto, convenções, o que não tocar).
3. **`PLAYBOOK.md`** — regras operacionais do modo headless.
4. **`UI-SHARED-NOTES.md`** — lista de componentes/arquivos UI compartilhados que requerem coordenação.

---

## Histórico de Execuções

| Data | Branch | Itens concluídos | Notas |
|------|--------|-----------------|-------|
| 2026-05-28 | routine-cultivo-20260528-2110 | 0 | Primeira execução — arquivos de gestão ausentes |
