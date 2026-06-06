# STATUS — Orquestrador Cultivo

**Última execução:** 2026-06-06 16:05 UTC  
**Branch:** `routine-cultivo-20260606-1605`  
**Agente:** `claude-orchestrator` (modo background / headless)  
**Resultado:** ⛔ BLOQUEIO CRÍTICO — execução encerrada sem itens processados

---

## Resumo da Execução

### O que aconteceu

O orquestrador foi disparado conforme o ROTEIRO, mas encontrou um **bloqueio de pré-requisito** na etapa 1 (leitura dos arquivos de contexto):

| Arquivo | Status |
|---------|--------|
| `CLAUDE.md` | ❌ Não encontrado em nenhum repo |
| `STATUS.md` | ❌ Não encontrado (este arquivo está sendo criado agora) |
| `BACKLOG.md` | ❌ Não encontrado — **sem itens para executar** |
| `PLAYBOOK.md` | ❌ Não encontrado — **sem regras de headless mode** |
| `UI-SHARED-NOTES.md` | ❌ Não encontrado |

### Locais verificados

- `cultivo-server/` (raiz e todas as subpastas visíveis)
- `cultivo-site/` (raiz)
- `.claude/` dentro de `cultivo-server`
- `docs/internal/` dentro de `cultivo-server`
- `esp32-display/STATUS.md` (encontrado mas é de outro contexto — display firmware)
- Google Drive: pasta "Roteiro Claude" (contém roteiros cinematográficos, não arquivos de orquestração)
- Todas as branches `claude/*` listadas via API (arquivos não aparecem em nenhuma)

### Itens processados

**0 de 5 permitidos.** Sem BACKLOG.md, não há itens para selecionar. A fila está vazia.

### Bloqueios registrados

1. **BLOQUEIO #1** — `BACKLOG.md` ausente: sem itens para trabalhar
2. **BLOQUEIO #2** — `PLAYBOOK.md` ausente: sem regras de headless mode confirmadas
3. **BLOQUEIO #3** — `CLAUDE.md` ausente: sem contexto do projeto para Claude

Total de bloqueios: **3/3** → execução encerrada conforme ROTEIRO.

---

## Ação requerida de João

Para que o orquestrador funcione nas próximas execuções, os seguintes arquivos precisam ser criados **na raiz de `cultivo-server`**:

### 1. `BACKLOG.md`
Lista de itens de trabalho com prioridade (P0/P1/P2/P3), seção "Próximos", "Em progresso", "Concluídos recentemente", flags como "Confirmar antes", critério de pronto.

### 2. `PLAYBOOK.md`
Regras de operação do orquestrador, especialmente seção "Modo headless / background".

### 3. `CLAUDE.md`
Instruções de projeto para Claude: stack, convenções, arquivos protegidos, workflow.

### 4. `UI-SHARED-NOTES.md`
Notas compartilhadas sobre UI entre instâncias Claude (coordenação de arquivos compartilhados).

---

## Contexto histórico observado

O histórico de commits em `main` mostra padrão `(backlog: <título>)`, sugerindo que o sistema de backlog funcionou anteriormente. Exemplos recentes:
- `chore: bump date-fns 4.3→4.4 + react-hook-form 7.76→7.77 (backlog: bump minor P3)`
- `chore: bump @capacitor 8.4 + react 19.2.7 + patches (backlog: Capacitor 8.4 P3)`
- `feat(onboarding): E5 — integração first-run wizard→demo→estufa (backlog: Onboarding E5)`

Os arquivos de orquestração parecem ter sido mantidos **fora do git** (localmente ou externamente) e precisam ser recriados ou adicionados ao repo.

---

## Próximos passos sugeridos

1. Criar `BACKLOG.md` com itens pendentes do projeto
2. Criar `PLAYBOOK.md` com regras do orquestrador
3. Criar `CLAUDE.md` com instruções do projeto
4. Criar `UI-SHARED-NOTES.md` para coordenação de UI
5. Commitar todos na raiz de `cultivo-server`
6. Re-disparar a routine — o orquestrador executará normalmente

---

*Arquivo criado automaticamente pelo orquestrador em modo headless. Não edite manualmente — será sobrescrito na próxima execução bem-sucedida.*
