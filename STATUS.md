# STATUS — Rotina Background claude-orchestrator

> Arquivo de rastreamento da rotina automatizada.
> Atualizado a cada execução.

---

## Última execução

**Data:** 2026-05-24  
**Branch:** `routine-cultivo-20260524-0000`  
**Agente:** claude-orchestrator (modo background, sem João disponível)  
**Itens completados:** 0  
**Itens pulados:** 0  
**Bloqueios registrados:** 1  

---

## Bloqueio #1 — Arquivos de infraestrutura da rotina ausentes

**Severidade:** Crítico (bloqueia execução completa do roteiro)  
**Status:** Aguardando criação manual por João  

### O que está faltando

O roteiro da rotina background requer os seguintes arquivos no root do repositório, mas **nenhum existe**:

| Arquivo | Propósito | Existe? |
|---|---|---|
| `CLAUDE.md` | Contexto geral do projeto para IAs | ❌ |
| `BACKLOG.md` | Lista de itens Próximos / Em Progresso / Concluídos | ❌ |
| `PLAYBOOK.md` | Regras e procedimentos (incluindo "Modo headless") | ❌ |
| `UI-SHARED-NOTES.md` | Notas compartilhadas de UI entre agentes | ❌ |
| `STATUS.md` | Este arquivo — criado agora nesta PR | ✅ (criado agora) |

Sem `BACKLOG.md`, não há itens para trabalhar. Sem `PLAYBOOK.md`, as regras do modo headless não podem ser verificadas. O roteiro foi interrompido no passo 1.

### O que foi lido com sucesso

- `esp32-display/STATUS.md` — status detalhado do firmware ESP32 (display não renderiza corretamente, fase 2 da UI pendente)
- `cultivo-site/HANDOFF.md` — Sprint 1+2 concluídos; Sprint 3 pendente (páginas individuais de calc, blog, welcome email)
- `docs/internal/todo.md` — 207KB de backlog informal (candidato a virar `BACKLOG.md` formatado)

### Ação recomendada para João

1. **Criar `BACKLOG.md`** com seções:
   ```
   ## P0 — Crítico
   ## P1 — Próximos  
   ## Em Progresso
   ## Concluídos Recentemente
   ```
   Migrar os itens relevantes de `docs/internal/todo.md` para este formato.

2. **Criar `PLAYBOOK.md`** com:
   - Regras do modo headless/background
   - Critérios de pulo de itens
   - Definição de "critério de pronto"

3. **Criar `CLAUDE.md`** com contexto geral do projeto (stack, módulos, convenções).

4. **Criar `UI-SHARED-NOTES.md`** se houver UI compartilhada entre agentes.

5. Após criação dos arquivos, re-disparar a rotina.

---

## Histórico de execuções

| Data | Branch | Completados | Bloqueios | Observação |
|---|---|---|---|---|
| 2026-05-24 | `routine-cultivo-20260524-0000` | 0 | 1 | Primeira execução — infra ausente |
