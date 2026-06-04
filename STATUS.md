# STATUS — claude-orchestrator

> Atualizado automaticamente pela rotina background. Não editar manualmente durante execução.

---

## Última execução

**Data:** 2026-06-04
**Branch:** `routine-cultivo-20260604-0000`
**Modo:** background (headless)
**Resultado:** BLOQUEADO — arquivos de controle ausentes

---

## Bloqueios ativos

### BLOQ-001 — Arquivos de controle do orchestrator não existem (CRÍTICO)

**Detectado em:** 2026-06-04 — execução routine-cultivo-20260604-0000

Os arquivos obrigatórios para operação do orchestrator não foram encontrados em nenhum dos repositórios (`cultivo-server`, `cultivo-site`):

| Arquivo | Status | Localização esperada |
|---------|--------|---------------------|
| `CLAUDE.md` | ❌ AUSENTE | raiz de `cultivo-server` |
| `STATUS.md` | ❌ AUSENTE (este arquivo é o primeiro) | raiz de `cultivo-server` |
| `BACKLOG.md` | ❌ AUSENTE | raiz de `cultivo-server` |
| `PLAYBOOK.md` | ❌ AUSENTE | raiz de `cultivo-server` |
| `UI-SHARED-NOTES.md` | ❌ AUSENTE | raiz de `cultivo-server` |

O único `STATUS.md` existente está em `esp32-display/STATUS.md` (handoff do firmware ESP32 — não é o arquivo de controle do orchestrator).

**Impacto:** Sem `BACKLOG.md`, não há itens para processar. Sem `PLAYBOOK.md`, não há regras de operação confirmadas. Sem `CLAUDE.md`, o contexto do projeto não está definido.

**Ação necessária (João):** Criar os arquivos acima antes da próxima execução agendada. Sugestão de conteúdo mínimo:

- **CLAUDE.md** — contexto do projeto: stack, arquitetura, convenções, o que é proibido tocar
- **BACKLOG.md** — lista de itens com prioridade (P0/P1/P2), critério de pronto, seções "Próximos", "Em progresso", "Concluídos recentemente"
- **PLAYBOOK.md** — regras de operação headless: o que pular, o que confirmar, como lidar com P0
- **UI-SHARED-NOTES.md** — notas sobre componentes de UI compartilhados (evitar conflitos entre agentes)

---

## Histórico de execuções

| Data | Branch | Itens processados | Bloqueios | Resultado |
|------|--------|-------------------|-----------|-----------|
| 2026-06-04 | `routine-cultivo-20260604-0000` | 0 | 1 (BLOQ-001) | Abortado — setup necessário |

---

## Próximos passos

1. João cria os arquivos listados em BLOQ-001
2. Próxima execução agendada detecta BACKLOG.md e opera normalmente
3. Este STATUS.md será atualizado a cada execução com o histórico acumulado
