# STATUS — claude-orchestrator

**Última execução:** 2026-06-01 21:10 UTC  
**Agente:** claude-orchestrator (modo background / routine agendada)  
**Branch:** `routine-cultivo-20260601-2110`

---

## Resumo da Execução

### Resultado: BLOQUEIO CRÍTICO — Infraestrutura de orquestração ausente

A rotina foi disparada, mas os arquivos de configuração necessários para execução autônoma **não existem** em nenhum dos repositórios (`cultivo-server`, `cultivo-site`) nem no filesystem local.

### Arquivos faltantes

| Arquivo | Necessário para |
|---|---|
| `CLAUDE.md` | Contexto do projeto, convenções, regras de código |
| `BACKLOG.md` | Fila de itens a executar |
| `PLAYBOOK.md` | Regras do modo headless, definição de P0/P1, critérios de pulo |
| `UI-SHARED-NOTES.md` | Notas de interface compartilhada entre agentes |

`STATUS.md` também não existia — este arquivo é a primeira criação.

### O que foi verificado

- Raiz de `cultivo-server` (GitHub + local): apenas `CHANGES.md`, `DEPLOY.md`, `README.md`, `GUIA-USUARIO.md`
- Raiz de `cultivo-site` (GitHub + local): apenas `HANDOFF.md`
- Diretório `.claude/`: contém `launch.json` e `start-dev.sh` (config de dev, sem backlog)
- `esp32-display/STATUS.md`: existe, mas é específico do subprojeto ESP32 (hardware)

### Ação tomada

Sem BACKLOG.md, é impossível saber quais itens executar. Sem PLAYBOOK.md, é impossível aplicar as regras de pulo/priorização. Criar esses arquivos seria uma decisão de produto — portanto **bloqueado conforme playbook** ("Sem decisões de produto. Em dúvida: bloqueio").

Nenhum código foi modificado. Nenhuma migração executada. Esta branch contém apenas este arquivo STATUS.md.

### Próximos passos para João

Para que o claude-orchestrator funcione em execuções futuras, é necessário criar:

1. **`CLAUDE.md`** — contexto do projeto (stack, convenções, arquivos sensíveis)
2. **`BACKLOG.md`** — lista de itens no formato esperado pelo orquestrador, com seções "Próximos", "Em progresso", "Concluídos recentemente"
3. **`PLAYBOOK.md`** — regras do modo headless (definição de P0/P1/P2, critérios de pulo, formato de commit, etc.)
4. **`UI-SHARED-NOTES.md`** — notas de interface compartilhada (pode começar vazio)

---

## Itens processados nesta execução

| # | Item | Status | Motivo |
|---|---|---|---|
| — | — | BLOQUEADO | BACKLOG.md não existe |

**Total:** 0 itens concluídos / 1 bloqueio crítico / execução encerrada.
