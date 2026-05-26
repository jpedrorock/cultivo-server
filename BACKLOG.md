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

---

## Em progresso

_(nenhum)_

---

## Próximos

### Substituir confirm() nativo — verificar remanescentes no client/
- **Prioridade**: P3
- **Tipo**: chore
- **Critério de pronto**: verificar que não há outros `window.confirm()` ou `confirm(` remanescentes no codebase `client/`; se houver, substituir por `AlertDialog`; `pnpm check && pnpm lint` passam.
- **Arquivos esperados**: qualquer arquivo `client/src/**/*.tsx`
- **Status**: Próximos

### Toast de confirmação ao duplicar estufa
- **Prioridade**: P3
- **Tipo**: feat
- **Critério de pronto**: ao duplicar estufa com sucesso, exibe `toast.success("Estufa duplicada!")` com nome da nova estufa; sem regressão em outros toasts de estufa; `pnpm check && pnpm lint` passam.
- **Arquivos esperados**: procurar por `duplicate` ou `duplicar` em `client/src/`
- **Status**: Próximos

---

## Bloqueados

_(nenhum)_

---

## Não fazer (requer João)
- Qualquer item que toca drizzle/schema.ts (inclui pnpm db:push)
- Testes em dispositivo físico (iPhone)
- Refatoração de estufas dinâmicas (impacto amplo, decisão de produto)
- Sistema de alertas inteligentes com valores ideais (requer schema changes)
- Sistema Ativo / ThemeToggle (requer schema changes)
