# Backlog — App Cultivo (claude-orchestrator)

Itens para execução autônoma pelo claude-orchestrator. Fonte: docs/internal/todo.md.
Apenas itens com critério claro, sem mudança de schema/auth/capacitor, sem decisão de produto.

---

## Concluídos recentemente

### Substituir window.confirm() em Plant3DView.tsx por AlertDialog
- **Prioridade**: P2
- **Tipo**: fix
- **Critério de pronto**: `Plant3DView.tsx` não contém mais chamadas a `window.confirm()` ou `confirm()`; a confirmação de reset usa `AlertDialog` do shadcn/ui; `pnpm check && pnpm lint && pnpm test` passam.
- **Arquivos esperados**: `client/src/components/Plant3DView.tsx`
- **Status**: Concluído 2026-05-25 [claude-orchestrator 2026-05-25 background]

### Loading indicator no upload de foto (QuickLog + PlantHealthTab + PlantTrichomesTab)
- **Prioridade**: P2
- **Tipo**: feat
- **Critério de pronto**: botão de câmera exibe spinner durante upload; botão fica desabilitado durante o upload.
- **Arquivos esperados**: `client/src/pages/QuickLog.tsx`, `client/src/components/PlantHealthTab.tsx`, `client/src/components/PlantTrichomesTab.tsx`
- **Status**: Já implementado (verificado 2026-05-26) — PlantHealthForm, PlantHealthTab e PlantTrichomesTab já possuem loading indicator com Loader2 animate-spin.

### Alertas — marcar como visto ao clicar individualmente
- **Prioridade**: P2
- **Tipo**: feat
- **Critério de pronto**: clicar em alerta chama markAsSeen; badge "Novo" → "Visto"; markAllAsSeen automático removido.
- **Arquivos esperados**: `client/src/pages/Alerts.tsx`, `server/routers/alerts.ts`
- **Status**: Já implementado (verificado 2026-05-26) — Alerts.tsx já tem markAsSeen individual por clique, sem auto-mark.

### Bug mobile — layout Guide do Usuário (ícone/título desalinhados)
- **Prioridade**: P3
- **Tipo**: fix
- **Critério de pronto**: cards do guia exibem ícone e título alinhados em 375px.
- **Arquivos esperados**: `client/src/pages/Help.tsx`
- **Status**: Já corrigido (verificado 2026-05-26) — Help.tsx foi completamente refatorado para grid flex-col; alinhamento correto.

### Animação suave de colapso ao marcar tarefa concluída
- **Prioridade**: P3
- **Tipo**: feat
- **Critério de pronto**: ao marcar tarefa concluída, colapsa com CSS transition (max-height + opacity 300ms); sem framer-motion; `pnpm check && pnpm lint` passam.
- **Arquivos esperados**: `client/src/pages/Tarefas.tsx`
- **Status**: Concluído 2026-05-26 [claude-orchestrator 2026-05-26 background]

### Substituir confirm() nativo — remanescentes no client/ (Plant3DView + App)
- **Prioridade**: P3
- **Tipo**: chore
- **Critério de pronto**: zero chamadas a `window.confirm()` ou `confirm(` em `client/src/**/*.tsx`; Plant3DView usa AlertDialog; App usa AlertDialog para saída Android.
- **Arquivos esperados**: `client/src/components/Plant3DView.tsx`, `client/src/App.tsx`
- **Status**: Concluído 2026-05-28 [claude-orchestrator 2026-05-28 background]

---

## Em progresso

_(nenhum)_

---

## Próximos

_(fila vazia — aguardando João adicionar novos itens)_

---

## Bloqueados

### Toast de confirmação ao duplicar estufa
- **Prioridade**: P3
- **Tipo**: feat
- **Critério de pronto**: ao duplicar estufa com sucesso, exibe `toast.success("Estufa duplicada!")` com nome da nova estufa.
- **Status**: BLOQUEADO — funcionalidade "duplicar estufa" não existe no codebase. A mutation `tents.duplicate` não existe nem no backend (routers) nem no frontend. Criar a feature do zero seria decisão de produto — requer João.

---

## Não fazer (requer João)
- Qualquer item que toca drizzle/schema.ts (inclui pnpm db:push)
- Testes em dispositivo físico (iPhone)
- Refatoração de estufas dinâmicas (impacto amplo, decisão de produto)
- Sistema de alertas inteligentes com valores ideais (requer schema changes)
- RevenueCat, Capacitor, auth (fora do escopo do orchestrator)
