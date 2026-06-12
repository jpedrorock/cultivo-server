# STATUS — App Cultivo (claude-orchestrator)

> Gerado automaticamente pela rotina background em 2026-06-12.
> Atualizado a cada execução da rotina.

---

## Última execução

**Data:** 2026-06-12  
**Branch:** `routine-cultivo-20260612-0001`  
**Modo:** background headless  
**Agente:** claude-orchestrator  
**Resultado:** ⛔ BLOQUEIO TOTAL — nenhum item processado

---

## Itens processados nesta execução

Nenhum. Ver bloqueio abaixo.

---

## Bloqueios

### B1 — Arquivos de contexto da rotina ausentes (CRÍTICO)

**Status:** Aberto  
**Registrado em:** 2026-06-12  
**Impacto:** Rotina não pode executar nenhum item de backlog

**Detalhe:**  
A rotina automática requer os seguintes arquivos para operar com segurança:

| Arquivo | Status | Repo verificado |
|---------|--------|----------------|
| `CLAUDE.md` | ❌ Não existe | cultivo-server, cultivo-site |
| `STATUS.md` | ❌ Não existia (criado agora) | cultivo-server |
| `BACKLOG.md` | ❌ Não existe | cultivo-server, cultivo-site |
| `PLAYBOOK.md` | ❌ Não existe | cultivo-server, cultivo-site |
| `UI-SHARED-NOTES.md` | ❌ Não existe | cultivo-server, cultivo-site |

Sem `BACKLOG.md` não há fila de trabalho para a rotina processar.  
Sem `PLAYBOOK.md` não há regras de operação para seguir.  
Sem `CLAUDE.md` não há padrões de projeto definidos para a rotina.

**Ação necessária (João):**  
Criar os arquivos de contexto da rotina. Sugestão de conteúdo mínimo:

- `CLAUDE.md` — padrões do projeto (estrutura de pastas, convenções de código, comandos úteis)
- `BACKLOG.md` — fila de tarefas com seções: `## Próximos`, `## Em progresso`, `## Concluídos recentemente`, `## Bloqueados`
- `PLAYBOOK.md` — regras de operação da rotina (critérios de pulo, como marcar itens, etc.)
- `UI-SHARED-NOTES.md` — notas de coordenação entre agentes pra arquivos de UI compartilhados

---

## Contexto coletado (para referência futura)

### cultivo-server (main @ cf62345)

Projeto fullstack (Hono + React + SQLite/Drizzle + Capacitor).  
Último commit: `feat(esp32): toggle "Girar tela 180°" no Config (sem reflash) — v0.5.5` (2026-06-10)  
Branches ativos: 30+ branches `claude/*` de sessões anteriores  
Arquivos chave: `server/`, `client/`, `shared/`, `esp32-display/`

### cultivo-site (main @ 7ef486e)

Site marketing Astro (`cultivo.pro`).  
HANDOFF.md existe e documenta o estado do site.  
Sprint 2 concluído. Sprint 3 pendente (páginas de calculadora individuais, blog, welcome email).

### esp32-display/STATUS.md

Display JC4832W535 com problemas de render (faixa de ~32px no topo, resto azul).  
Suspeita: pinos QSPI parcialmente errados ou `setRotation(1)` não aplicado via QSPI.  
Fase 2 da refatoração de UI pendente (esperar display funcionar).

---

## Próximas execuções

A rotina irá bloquear novamente até que `BACKLOG.md` seja criado com itens em `## Próximos`.

---

*Arquivo criado por claude-orchestrator (background routine) em 2026-06-12.*
