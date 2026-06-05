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

---

## Em progresso

_(nenhum)_

---

## Próximos

### Loading indicator no upload de foto (QuickLog + PlantHealthTab + PlantTrichomesTab)
- **Prioridade**: P2
- **Tipo**: feat
- **Critério de pronto**: botão de câmera em QuickLog, PlantHealthTab e PlantTrichomesTab exibe spinner (Loader2 animate-spin) durante upload (estado `isUploadingPhoto`); botão fica desabilitado durante o upload; `pnpm check && pnpm lint` passam.
- **Arquivos esperados**: `client/src/pages/QuickLog.tsx`, `client/src/components/PlantHealthTab.tsx`, `client/src/components/PlantTrichomesTab.tsx`
- **Status**: Próximos

### Alertas — marcar como visto ao clicar individualmente
- **Prioridade**: P2
- **Tipo**: feat
- **Critério de pronto**: na página de Alertas, clicar em um alerta individual chama `trpc.alerts.markAsSeen` para aquele alerta; badge muda de "Novo" para "Visto" com transição visual; o markAllAsSeen automático ao entrar na página é removido; `pnpm check && pnpm lint && pnpm test` passam.
- **Arquivos esperados**: `client/src/pages/Alerts.tsx` (ou similar), `server/routers/alerts.ts`
- **Nota**: verificar se procedure `markAsSeen` já existe no router antes de criar
- **Status**: Próximos

### Bug mobile — layout Guide do Usuário (ícone/título desalinhados)
- **Prioridade**: P3
- **Tipo**: fix
- **Critério de pronto**: no Help.tsx, cards do guia do usuário exibem ícone e título alinhados em telas mobile (375px); `pnpm check && pnpm lint` passam.
- **Arquivos esperados**: `client/src/pages/Help.tsx`
- **Status**: Próximos

### Animação suave de colapso ao marcar tarefa concluída
- **Prioridade**: P3
- **Tipo**: feat
- **Critério de pronto**: ao marcar tarefa como concluída em qualquer estufa, a tarefa colapsa com CSS transition (max-height ou opacity); não requer framer-motion (usar CSS nativo); `pnpm check && pnpm lint` passam.
- **Arquivos esperados**: componente de tarefas (procurar por `task` ou `tarefa` em components/)
- **Status**: Próximos

### Substituir confirm() nativo em Plant3DView — remover branch lateral se existir
- **Prioridade**: P3
- **Tipo**: chore
- **Critério de pronto**: verificar que não há outros `window.confirm()` ou `confirm(` remanescentes no codebase client/; `pnpm check && pnpm lint` passam.
- **Arquivos esperados**: qualquer arquivo client/src/**/*.tsx
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
