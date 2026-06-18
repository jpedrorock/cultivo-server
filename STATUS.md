# STATUS — Claude Orchestrator

> Gerado automaticamente pela routine background. Última atualização: 2026-06-14.

---

## Última execução

**Data:** 2026-06-14  
**Branch:** `routine-cultivo-20260614-0001`  
**Modo:** headless / background  
**Resultado:** ⛔ BLOQUEADO — arquivos de orquestração ausentes

---

## Bloqueios registrados

### [BLOQUEIO-001] Arquivos de orquestração não encontrados

**Severidade:** Crítico — impede toda a execução  
**Detectado em:** 2026-06-14 (routine background)

**Arquivos esperados (não encontrados na raiz do repo):**
- `CLAUDE.md` — contexto e regras do projeto
- `BACKLOG.md` — fila de itens para trabalhar
- `PLAYBOOK.md` — playbook de modos e regras de segurança
- `UI-SHARED-NOTES.md` — notas compartilhadas de UI (últimas 5 entradas)

**Impacto:** Sem BACKLOG.md não há itens para processar. Sem PLAYBOOK.md não é possível seguir as regras de segurança corretamente. Sem CLAUDE.md não há contexto do projeto.

**O que foi encontrado:**
- `esp32-display/STATUS.md` — status do firmware ESP32 (display não renderizando)
- `cultivo-site/HANDOFF.md` — documento de coordenação do site marketing

**Ação sugerida:** Criar os arquivos de orquestração antes da próxima execução:
1. `CLAUDE.md` com contexto do projeto (stack, regras, arquitetura)
2. `BACKLOG.md` com seções: `## Em Progresso`, `## Próximos`, `## Concluídos recentemente`
3. `PLAYBOOK.md` com regras de segurança e modos de operação
4. `UI-SHARED-NOTES.md` com notas de coordenação de UI

**Itens processados nesta execução:** 0 de 5

---

## Contexto do projeto (levantado desta execução)

Estrutura identificada:
- **cultivo-server** — monorepo principal (backend Node/Hono + client React + ESP32 firmware)
- **cultivo-site** — site marketing Astro (cultivo.pro)
- Backend usa Drizzle ORM + SQLite local, auth própria
- Client usa React + Vite + Capacitor (mobile)
- ESP32 display (JC4832W535) com LVGL — em debug de pinout QSPI

Sprints identificadas via HANDOFF.md (cultivo-site):
- Sprint 3 pendente: páginas individuais de calculadora (SEO), blog, welcome email
- ESP32 Fase 2: integrar UI compartilhada em firmware (bloqueado até display funcionar)

---

## Histórico de execuções

| Data | Branch | Itens | Resultado |
|------|--------|-------|-----------|
| 2026-06-14 | routine-cultivo-20260614-0001 | 0 | ⛔ Bloqueado (arquivos ausentes) |
