# STATUS — claude-orchestrator background routine

> Arquivo mantido pelo agente de rotina automática. Última atualização: 2026-05-25.

---

## 🔴 BLOQUEIO CRÍTICO — Infraestrutura de orquestração ausente

**Execução:** routine-cultivo-20260525-0000  
**Data:** 2026-05-25  
**Agente:** claude-orchestrator (modo background)

### Problema

A routine foi disparada mas **os arquivos de orquestração não existem** no repositório:

| Arquivo esperado | Status |
|---|---|
| `CLAUDE.md` | ❌ Não encontrado |
| `BACKLOG.md` | ❌ Não encontrado |
| `PLAYBOOK.md` | ❌ Não encontrado |
| `UI-SHARED-NOTES.md` | ❌ Não encontrado |
| `STATUS.md` (este arquivo) | ⚠️ Criado agora (primeiro run) |

Sem `BACKLOG.md`, não há itens para processar.  
Sem `PLAYBOOK.md`, as regras completas de execução headless não estão disponíveis.  
Sem `CLAUDE.md`, não há contexto do projeto para o agente.

### O que foi encontrado

- `esp32-display/STATUS.md` — status do hardware ESP32 (específico de firmware)
- `docs/internal/todo.md` — arquivo de 207KB com todos os itens (candidato a BACKLOG.md)
- `cultivo-site/HANDOFF.md` — coordenação do site (no repo cultivo-site)
- `CHANGES.md`, `DEPLOY.md`, `GUIA-USUARIO.md` — documentação existente

### Ação necessária (João)

1. **Criar `CLAUDE.md`** na raiz com contexto do projeto para o agente de rotina.
2. **Criar `BACKLOG.md`** com itens no formato esperado pela rotina (seções: Próximos, Em progresso, Concluídos recentemente). Candidato: extrair de `docs/internal/todo.md`.
3. **Criar `PLAYBOOK.md`** com as regras de execução headless (P0/P1, critérios de pulo, etc.).
4. **Criar `UI-SHARED-NOTES.md`** com notas de UI compartilhadas (se aplicável).

### Resultado desta execução

- **Itens processados:** 0
- **Bloqueios:** 1 (infraestrutura ausente)
- **Commits de código:** nenhum

---

## Execuções anteriores

_(nenhuma — primeiro run)_
