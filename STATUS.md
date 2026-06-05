# STATUS — Routine claude-orchestrator

**Branch:** `routine-cultivo-20260601-0000`  
**Data:** 2026-06-01  
**Modo:** headless / background (João ausente)  
**Agente:** claude-orchestrator

---

## 🔴 BLOQUEIO CRÍTICO — Context files ausentes

O ROTEIRO instrui leitura de 5 arquivos de contexto antes de qualquer trabalho:

| Arquivo | Encontrado? | Impacto |
|---------|-------------|----------|
| `CLAUDE.md` | ❌ Não existe | Regras do projeto desconhecidas |
| `STATUS.md` | ❌ Não existe na raiz (existe em `esp32-display/STATUS.md`) | Este arquivo é a primeira instância |
| `BACKLOG.md` | ❌ Não existe | **Fila de tarefas vazia — sem itens para processar** |
| `PLAYBOOK.md` | ❌ Não existe | Regras de headless mode desconhecidas |
| `UI-SHARED-NOTES.md` | ❌ Não existe | Notas de UI compartilhadas indisponíveis |

**Resultado:** 0 itens processados. Routine encerrou com 1 bloqueio (limite de contexto).

---

## 📋 O que foi feito nesta execução

1. ✅ Branch criada: `routine-cultivo-20260601-0000`
2. ✅ Exploração do repositório realizada
3. ✅ Arquivos de contexto buscados — todos ausentes
4. ✅ `docs/internal/todo.md` lido parcialmente (207KB, maioria concluída `[x]`)
5. ✅ `cultivo-site/HANDOFF.md` lido — tarefas Sprint 3 identificadas
6. ✅ Commits recentes analisados (UX/UI melhorias, iOS fixes)
7. ❌ Nenhum item de backlog implementado (sem BACKLOG.md)
8. ✅ STATUS.md criado (este arquivo)
9. ✅ PR aberto com relatório

---

## 🔍 Contexto do repositório (descoberto na exploração)

### cultivo-server (principal)
- Stack: Node/Express/tRPC + React + Drizzle (MySQL/SQLite)
- Testes: vitest (`pnpm test`)
- 30+ branches `claude/*` ativas (muitas provavelmente aguardando merge)
- Commits recentes (2026-05-30/31): polimento UX — BottomNav, iOS splash, phase palette, motion, glass cards
- Arquivo `docs/internal/todo.md` (207KB) — histórico extenso, maioria `[x]`

### cultivo-site
- Stack: Astro + pnpm 9.15.4 (pin obrigatório — não mudar pra latest)
- `HANDOFF.md` existe e está atualizado (2026-05-15)
- Sprint 3 pendente: páginas de calculadora individuais, blog, welcome email

### esp32-display
- `STATUS.md` existe em `esp32-display/STATUS.md`
- Branch ativa: `claude/esp32-greenhouse-monitor-yoIDp`
- Bloqueio: display JC4832W535 não renderiza corretamente (pinos QSPI V2 parcialmente corretos)

---

## 📌 Para João — O que criar antes da próxima routine

Para que o claude-orchestrator funcione em modo background, crie:

### 1. `CLAUDE.md` (raiz do repo)
Convenções do projeto, stack, regras de código, o que nunca tocar.

### 2. `BACKLOG.md` (raiz do repo)
Fila de tarefas no formato:
```markdown
## Próximos
- [ ] **[P2]** Título da tarefa  
  Critério de pronto: descrição clara  
  Arquivos: list dos arquivos tocados

## Em progresso
<!-- agente move pra cá -->

## Concluídos recentemente
<!-- agente move pra cá após PR -->
```

### 3. `PLAYBOOK.md` (raiz do repo)
Regras de operação: o que fazer em headless mode, como lidar com conflitos, limites de autonomia.

### 4. `UI-SHARED-NOTES.md` (raiz do repo)
Notas sobre componentes UI compartilhados, convenções de design.

---

## 🌿 Branches `claude/*` sem PR aberto (verificar)

Há 30 branches `claude/*` ativas. Algumas podem ter trabalho concluído aguardando review:
- `claude/automation-toggle`
- `claude/backup-import-validation`
- `claude/bundle-split`
- `claude/camera-polish`
- `claude/device-pairing-flow`
- `claude/incomplete-registration-reminder`
- *(e outras 24)*

Sugiro revisar e fazer merge ou deletar as que estão stale.

---

## Próxima execução

Depois de criar BACKLOG.md + PLAYBOOK.md + CLAUDE.md, a routine poderá processar até 5 itens por execução automaticamente.
