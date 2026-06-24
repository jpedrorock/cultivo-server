# STATUS — App Cultivo (Rotina Automática)

## Última execução

**Data:** 2026-05-27  
**Branch:** `routine-cultivo-20260527-0110`  
**Agente:** claude-orchestrator (background)  
**Modo:** Headless / rotina agendada

---

## 🔴 BLOQUEIO CRÍTICO — Arquivos de Controle Ausentes

A rotina não pôde executar nenhum item de backlog porque os seguintes arquivos
de controle **não existem** no repositório:

| Arquivo | Status |
|---------|--------|
| `CLAUDE.md` | ❌ Ausente |
| `BACKLOG.md` | ❌ Ausente |
| `PLAYBOOK.md` | ❌ Ausente |
| `UI-SHARED-NOTES.md` | ❌ Ausente |
| `STATUS.md` (este arquivo) | ✅ Criado agora |

### Impacto

Sem esses arquivos a rotina não consegue:

- Identificar a fila de itens "Próximos" (BACKLOG)
- Aplicar critérios de skip (P0, "Confirmar antes", critério não claro)
- Saber quais arquivos são "compartilhados" (UI-SHARED-NOTES)
- Seguir convenções do projeto (CLAUDE.md)
- Registrar ou ler o estado atual (STATUS.md — agora criado)

### Ação Tomada

Criada esta branch e este STATUS.md como único artefato da execução.
Nenhum código foi alterado. PR aberto para João revisar e criar os arquivos
de controle necessários.

---

## Itens Concluídos nesta Execução

Nenhum — bloqueio antes do início do loop.

## Bloqueios

1. Arquivos de controle (BACKLOG.md, PLAYBOOK.md, CLAUDE.md, UI-SHARED-NOTES.md) não encontrados
   nos repositórios `cultivo-server` e `cultivo-site`, nem no Google Drive associado.

---

## O que João precisa criar

Para que a próxima execução da rotina funcione, criar na raiz de `cultivo-server`:

### `CLAUDE.md`
Contexto do projeto: stack, convenções de código, arquitetura, restrições.

### `BACKLOG.md`
Estrutura mínima esperada:
```markdown
## Próximos
- [ ] [P2] Título do item — critério de pronto: X
- [ ] [P1] Outro item — critério de pronto: Y

## Em progresso
(itens que estão sendo trabalhados + quem/quando)

## Concluídos recentemente
(itens dos últimos 14 dias)
```

### `PLAYBOOK.md`
Regras operacionais para a rotina: limites de segurança, critérios de skip,
arquivos protegidos, fluxo de aprovação, etc.

### `UI-SHARED-NOTES.md`
Decisões de UI compartilhadas entre sessões: componentes em andamento,
padrões visuais acordados, arquivos que não devem ser tocados sem autorização.

---

*Gerado automaticamente pela rotina claude-orchestrator em 2026-05-27*
