# STATUS — Routine cultivo-orchestrator

**Última atualização:** 2026-06-08  
**Executor:** claude-orchestrator (claude-sonnet-4-6) — modo BACKGROUND  
**Branch desta execução:** `routine-cultivo-20260608-0001`

---

## Resumo da execução 2026-06-08

| Métrica | Valor |
|---|---|
| Itens concluídos | 0 |
| Itens pulados | 0 |
| Bloqueios registrados | 1 (crítico) |
| Status | PARADO — infraestrutura de orquestração ausente |

---

## 🔴 BLOQUEIO CRÍTICO — Arquivos de orquestração não encontrados

A rotina foi disparada mas os arquivos que definem o fluxo de trabalho **não existem no repositório**:

| Arquivo esperado | Status |
|---|---|
| `CLAUDE.md` | ❌ Não encontrado |
| `BACKLOG.md` | ❌ Não encontrado |
| `PLAYBOOK.md` | ❌ Não encontrado |
| `UI-SHARED-NOTES.md` | ❌ Não encontrado |
| `STATUS.md` (raiz) | ✅ Criado agora (este arquivo) |

**Impacto:**
- Sem `BACKLOG.md`: impossível selecionar o próximo item de trabalho da fila
- Sem `PLAYBOOK.md`: regras do modo headless desconhecidas (critérios de pulo, definição de P0/P1/P2/P3)
- Sem `CLAUDE.md`: contexto do projeto e restrições de arquivos desconhecidos
- Sem `UI-SHARED-NOTES.md`: não é possível verificar se um item toca arquivo compartilhado

**O que foi inspecionado antes de parar:**
- `docs/internal/todo.md` — existe (207KB), muito grande para ler nesta sessão; provável fonte do backlog
- `esp32-display/STATUS.md` — existe, documenta estado do firmware ESP32
- `cultivo-site/HANDOFF.md` — existe no repo cultivo-site, documenta estado do site
- Commits recentes do `main` — lidos (últimos 25), revelam o estado atual

---

## Estado do projeto observado (commits `main`, semana 2026-06-01 a 2026-06-07)

### Entregue recentemente
- **Tuya on-demand** (2026-06-07): polling eliminado — API Tuya só chamada quando user está na tela de Cenas ou ao abrir detalhe. Cache 90s no backend. Corrige estouro de cota.
- **4-tier pricing** (2026-06-06): Free / Starter / Cloud / Pro no schema + UI + migration de grandfather (pro→cloud, team→pro).
- **Cultivo Orgânico** (2026-06-03 a 06-05): Fases 1-4 completas — toggle por estufa, calculadoras (living soil + organic maintenance), biblioteca de 10 tarefas.
- **Onboarding Wizard** (2026-06-03): E1-E5 completos — presets, componentes de chat, wizard 5 perguntas, demo de registro, encadeamento.
- **Testes** (2026-06-01 a 06-05): aiChat.ts (9 testes), emailService.ts (11 testes), organicTaskLibrary.ts (16 testes). Total: 161/162 passando.
- **Dep bumps** (2026-06-05): Capacitor 8.4, React 19.2.7, date-fns 4.4, react-hook-form 7.77.

### Suite de testes atual
- **161/162 passando** (1 skip intencional, confirmado em múltiplos commits)
- `pnpm check` e `pnpm lint` passando em todos os commits recentes

---

## Ação necessária

Para que execuções futuras desta rotina funcionem, os seguintes arquivos precisam ser criados no repositório:

1. **`CLAUDE.md`** — contexto do projeto, arquivos proibidos, convenções de commit
2. **`BACKLOG.md`** — fila de trabalho com prioridades P0/P1/P2/P3 e seções "Próximos / Em progresso / Concluídos recentemente"
3. **`PLAYBOOK.md`** — regras de operação do modo headless (critérios de pulo, limite de bloqueios, formato de PR)
4. **`UI-SHARED-NOTES.md`** — registro de decisões de UI compartilhadas entre sessões

**Sugestão:** O conteúdo do `docs/internal/todo.md` (207KB) pode servir de base para o `BACKLOG.md` — filtrar os itens "Próximos" com prioridade e mover pra um formato mais enxuto.

---

## Próxima execução

Quando os arquivos acima existirem, a rotina poderá:
1. Ler o BACKLOG.md e selecionar itens da seção "Próximos"
2. Seguir as regras do PLAYBOOK.md (pulos, bloqueios, P0 intocável)
3. Verificar UI-SHARED-NOTES.md antes de tocar em componentes compartilhados
4. Atualizar este STATUS.md com o resultado de cada execução
