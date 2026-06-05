# STATUS — App Cultivo Orchestrator

> Gerado automaticamente pela routine `claude-orchestrator` em modo background.
> Última execução: **2026-06-05T01:11 UTC**

---

## Execução: routine-cultivo-20260605-0111

**Status:** INTERROMPIDA — 3 bloqueios críticos atingidos  
**Branch:** `routine-cultivo-20260605-0111`  
**Itens concluídos:** 0  
**Itens pulados:** 0  
**Bloqueios:** 3

---

## Bloqueios Registrados

### BLOQUEIO 1 — CLAUDE.md não encontrado
**Arquivo:** `CLAUDE.md` (raiz do repositório)  
**Impacto:** Sem contexto do projeto (arquitetura, convenções, regras de segurança específicas). A routine não pode operar com segurança sem saber quais módulos são sensíveis, quais padrões seguir, e quais áreas estão fora de escopo.  
**Ação necessária:** Criar `CLAUDE.md` na raiz do `cultivo-server` com contexto do projeto para agentes.

### BLOQUEIO 2 — BACKLOG.md não encontrado
**Arquivo:** `BACKLOG.md` (raiz do repositório)  
**Impacto:** Sem fila de trabalho estruturada. Existe `docs/internal/todo.md` (207KB) com histórico e TODOs, mas não está no formato esperado (seções "Próximos", "Em progresso", "Concluídos recentemente" com prioridades P0/P1/P2 e critérios de pronto).  
**Ação necessária:** Criar `BACKLOG.md` partindo do `docs/internal/todo.md`, estruturado para execução autônoma.

### BLOQUEIO 3 — PLAYBOOK.md e UI-SHARED-NOTES.md não encontrados
**Arquivos:** `PLAYBOOK.md`, `UI-SHARED-NOTES.md` (raiz do repositório)  
**Impacto:** Sem regras operacionais formalizadas no repo (modo headless, critérios de pulo, contrato de arquivos compartilhados). Também sem notas de UI que a routine usa para coordenar mudanças de interface entre agentes.  
**Ação necessária:** Criar `PLAYBOOK.md` com as regras de operação e `UI-SHARED-NOTES.md` para coordenação de UI.

---

## O que foi investigado

| Local | Resultado |
|---|---|
| `cultivo-server/` raiz | Sem CLAUDE.md, BACKLOG.md, PLAYBOOK.md, STATUS.md, UI-SHARED-NOTES.md |
| `cultivo-server/docs/internal/` | Tem `todo.md` (207KB, não estruturado para routine) |
| `cultivo-site/` raiz | Tem `HANDOFF.md` (bem mantido, referência para o site) |
| `cultivo-server/.claude/` | Tem apenas `launch.json` e `start-dev.sh` |
| Google Drive | Sem arquivos de planejamento do cultivo |

**Referência útil existente:** `docs/internal/todo.md` — lista extensa de funcionalidades concluídas e em andamento. Serve como base para criar o `BACKLOG.md`.

**Último commit no main:** `be55e6a feat(onboarding): E3 — wizard conversacional 5 perguntas`

---

## Recomendação para João

Para habilitar execuções futuras da routine, criar os seguintes arquivos:

```
cultivo-server/
├── CLAUDE.md            # contexto do projeto para agentes (stack, áreas sensíveis, convenções)
├── BACKLOG.md           # fila estruturada: Próximos / Em progresso / Concluídos recentemente
├── PLAYBOOK.md          # regras operacionais da routine (modo headless, critérios de pulo)
└── UI-SHARED-NOTES.md   # notas de coordenação de UI entre agentes
```

Estrutura mínima do `BACKLOG.md`:

```markdown
## Próximos

- [ ] [P2] Título do item | Critério: o que torna esse item "pronto" | Arquivos: lista de arquivos tocados

## Em progresso

(vazio)

## Concluídos recentemente

(vazio)
```

A routine consegue operar de forma autônoma assim que esses arquivos existirem.

---

## Histórico de execuções

| Data | Branch | Itens | Bloqueios | Resultado |
|---|---|---|---|---|
| 2026-06-05 | routine-cultivo-20260605-0111 | 0 | 3 | Arquivos de planejamento ausentes |
