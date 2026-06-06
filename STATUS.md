# STATUS — App Cultivo

> Mantido pela claude-orchestrator. Atualizado a cada execução de rotina.

---

## Última execução de rotina

**Data:** 2026-06-06  
**Executor:** claude-orchestrator (modo headless / background)  
**Branch criada:** `routine-cultivo-20260606-0000`  
**Resultado:** BLOQUEADO — nenhum item implementado

---

## Bloqueios registrados

### BLOQUEIO-001 — Arquivos de gestão ausentes

**Data:** 2026-06-06  
**Severidade:** Crítico — impede qualquer trabalho automatizado  
**Descrição:**  
A rotina (`claude-orchestrator`) foi disparada mas os arquivos obrigatórios de gestão não existem no repositório:

| Arquivo | Status |
|---|---|
| `CLAUDE.md` | ❌ Ausente |
| `BACKLOG.md` | ❌ Ausente |
| `PLAYBOOK.md` | ❌ Ausente |
| `STATUS.md` | ❌ Ausente (criando agora) |
| `UI-SHARED-NOTES.md` | ❌ Ausente |

**Impacto:**  
- Sem `BACKLOG.md`: sem itens de trabalho a executar  
- Sem `PLAYBOOK.md`: sem regras de segurança para seguir em modo headless  
- Sem `CLAUDE.md`: sem contexto do projeto para tomada de decisão  

**Ação tomada:**  
Rotina interrompida após leitura de contexto. Nenhum código foi modificado.  
Este PR foi aberto apenas para registrar o status e solicitar criação dos arquivos.

**Próximos passos (João):**  
1. Criar `CLAUDE.md` com contexto do projeto (arquitetura, convenções, ambiente)  
2. Criar `BACKLOG.md` com seções: `## Próximos`, `## Em progresso`, `## Concluídos recentemente`  
3. Criar `PLAYBOOK.md` com regras do modo headless (P0/P1/P2, critérios de pular, etc.)  
4. Criar `UI-SHARED-NOTES.md` para coordenação de arquivos de UI compartilhados  
5. Fechar este PR e re-disparar a rotina  

---

## Contexto encontrado

### cultivo-server
- Projeto monorepo: backend Node/Express + cliente React + shared
- Usa Drizzle ORM, SQLite local, Capacitor (iOS/Android), ESP32 display
- Scripts: `pnpm check`, `pnpm lint`, `pnpm test`
- Branch padrão: `main`

### cultivo-site
- Site Astro em `cultivo.pro` (EN default, PT em `/pt/`)
- Documento `HANDOFF.md` presente — serve como referência de contexto
- Pin pnpm@9.15.4 (não mudar — lockfile v9)
- Pendente: waitlist endpoint, analytics, pages de calculadora por URL

---

## Histórico de execuções

| Data | Branch | Itens feitos | Bloqueios |
|---|---|---|---|
| 2026-06-06 | routine-cultivo-20260606-0000 | 0 | 1 (arquivos de gestão ausentes) |
