# STATUS — App Cultivo

> Arquivo mantido pelo claude-orchestrator em modo background.
> Atualizado a cada execução de rotina agendada.

---

## Última execução

- **Data:** 2026-06-01
- **Branch:** `routine-cultivo-20260601-0001`
- **Modo:** background / headless
- **Itens processados:** 0
- **Itens concluídos:** 0
- **Bloqueios:** 1

---

## Bloqueios ativos

### BLOQUEIO-001 — Arquivos de gestão ausentes (CRÍTICO)

**Data:** 2026-06-01
**Reportado por:** claude-orchestrator (background)

**Descrição:**
A rotina agendada foi disparada, mas os arquivos de gestão obrigatórios **não existem** no repositório:

| Arquivo | Esperado em | Status |
|---|---|---|
| `CLAUDE.md` | raiz do repo | ❌ ausente |
| `BACKLOG.md` | raiz do repo | ❌ ausente |
| `PLAYBOOK.md` | raiz do repo | ❌ ausente |
| `STATUS.md` | raiz do repo | ❌ ausente (criado agora) |
| `UI-SHARED-NOTES.md` | raiz do repo | ❌ ausente |

Sem `BACKLOG.md` não há itens para trabalhar.
Sem `PLAYBOOK.md` não há regras operacionais para seguir com segurança.
Sem `CLAUDE.md` não há contexto do projeto para a Claude.

**O único arquivo relevante encontrado foi `docs/internal/todo.md`** (207 KB), que possivelmente contém o backlog em formato não estruturado.

**Impacto:** Rotina encerrada com 0 itens processados. Nenhuma alteração de código foi feita.

**Ação necessária (João):**
1. Criar `BACKLOG.md` na raiz com itens estruturados seguindo o formato esperado (seções: `## Próximos`, `## Em progresso`, `## Concluídos recentemente`).
2. Criar `PLAYBOOK.md` na raiz com regras operacionais e modo headless.
3. Criar `CLAUDE.md` na raiz com contexto do projeto.
4. Criar `UI-SHARED-NOTES.md` na raiz (pode começar vazio ou com as últimas notas de UI).
5. Opcionalmente: migrar/estruturar `docs/internal/todo.md` → `BACKLOG.md`.

---

## Histórico de execuções

| Data | Branch | Itens | Bloqueios | Resultado |
|---|---|---|---|---|
| 2026-06-01 | routine-cultivo-20260601-0001 | 0 | 1 | ⛔ bloqueado — arquivos de gestão ausentes |

---

## Referência de formato esperado para BACKLOG.md

```markdown
# BACKLOG — App Cultivo

## Próximos

- [ ] **[P2] Título do item** — Critério de pronto: ...

## Em progresso

- [ ] **[P1] Título** [claude-orchestrator 2026-06-01 background] — ...

## Concluídos recentemente

- [x] **Título** — concluído em 2026-05-XX
```
