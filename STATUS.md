# STATUS — claude-orchestrator background routine

**Última execução:** 2026-05-29  
**Modo:** headless / background (João ausente)  
**Branch:** `routine-cultivo-20260529-0000`  
**Itens processados:** 0  
**Bloqueios encontrados:** 1 (crítico — interrompeu execução)

---

## 🔴 BLOQUEIO CRÍTICO: Infraestrutura de gestão ausente

A rotina `claude-orchestrator` foi disparada mas os arquivos de controle necessários para operar **não existem** na raiz do repositório:

| Arquivo esperado | Status |
|---|---|
| `CLAUDE.md` | ❌ Ausente |
| `BACKLOG.md` | ❌ Ausente |
| `PLAYBOOK.md` | ❌ Ausente |
| `UI-SHARED-NOTES.md` | ❌ Ausente |
| `STATUS.md` (este arquivo) | ✅ Criado agora |

**Arquivos encontrados relacionados:**
- `esp32-display/STATUS.md` — status do projeto ESP32 (hardware), escopo diferente
- `docs/internal/todo.md` — lista de tarefas interna (207KB), sem estrutura BACKLOG

**Impacto:** Sem `BACKLOG.md` não há itens para processar. Sem `PLAYBOOK.md` não há regras operacionais. Nenhum trabalho foi executado nesta rodada.

**Ação requerida de João:**
1. Criar `BACKLOG.md` na raiz com itens em seção `## Próximos`
2. Criar `PLAYBOOK.md` com regras de operação do orchestrator  
3. Criar `CLAUDE.md` com contexto do projeto para o orchestrator
4. Criar `UI-SHARED-NOTES.md` se houver contexto de UI compartilhado
5. Após setup, re-disparar a rotina

---

## Histórico de execuções

| Data | Branch | Itens | Status |
|---|---|---|---|
| 2026-05-29 | `routine-cultivo-20260529-0000` | 0 | 🔴 Bloqueado — infra ausente |
