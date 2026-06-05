# STATUS — Routine Orchestrator

## Última execução: 2026-05-31 (background automático)

### Resumo
- **Itens processados:** 0
- **Bloqueios:** 1
- **Status:** PARADO por bloqueio crítico

---

## 🔴 BLOQUEIO CRÍTICO — Arquivos de orquestração ausentes

**Detectado em:** 2026-05-31  
**Executor:** claude-orchestrator (modo background / headless)

### O que aconteceu

A routine foi disparada mas os arquivos pré-requisito de orquestração **não existem** na raiz do repositório:

| Arquivo | Status | Obrigatório |
|---|---|---|
| `CLAUDE.md` | ❌ Ausente | Sim |
| `BACKLOG.md` | ❌ Ausente | Sim — define itens a executar |
| `PLAYBOOK.md` | ❌ Ausente | Sim — regras de segurança e critérios |
| `UI-SHARED-NOTES.md` | ❌ Ausente | Sim — notas de UI compartilhada |
| `STATUS.md` (este arquivo) | ✅ Criado agora | — |

Nota: existe `esp32-display/STATUS.md` (status do projeto ESP32/hardware), mas **não** há STATUS.md de orquestração na raiz.

### Impacto

Sem `BACKLOG.md` não há itens para processar.  
Sem `PLAYBOOK.md` não há critérios de segurança validados.  
Sem `CLAUDE.md` não há contexto do projeto para o executor headless.

### Ação tomada (headless — sem aguardar resposta)

1. Branch criada: `routine-cultivo-20260531-0001`
2. Este `STATUS.md` criado com o registro do bloqueio
3. PR aberto para notificação
4. **Zero alterações de código** — seguro fechar ou ignorar o PR

### Próximos passos (para João)

Para que a routine funcione nas próximas execuções, criar na raiz do repositório:

- **`CLAUDE.md`** — contexto do projeto, stack, convenções
- **`BACKLOG.md`** — lista de itens com prioridade (P0/P1/P2), critério de pronto, flags de segurança
- **`PLAYBOOK.md`** — regras do modo headless, critérios de bloqueio, limites de escopo
- **`UI-SHARED-NOTES.md`** — notas de design/UI compartilhadas entre sessões

---

## Histórico de execuções

| Data | Branch | Itens feitos | Bloqueios | Resultado |
|---|---|---|---|---|
| 2026-05-31 | `routine-cultivo-20260531-0001` | 0 | 1 | Bloqueio: arquivos de orquestração ausentes |
