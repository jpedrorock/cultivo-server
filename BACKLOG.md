# Backlog — App Cultivo

> Gerenciado pelo orchestrator Claude. Verificado contra o código em 2026-06-13.

---

## Em progresso

_(nenhum item)_

---

## Próximos

### P2 — Animação de colapso ao marcar tarefa concluída (Tarefas.tsx)
**Arquivo**: `client/src/pages/Tarefas.tsx`
**Critério de pronto**:
- [ ] Ao clicar no checkbox, a linha da tarefa colapsa com animação (250ms easeOut) usando `framer-motion`
- [ ] Em caso de erro na mutation, a tarefa reaparece imediatamente (remoção de `justCompleted`)
- [ ] `pnpm check` passa sem erros
**Não toca**: schema, auth, revenuecat, capacitor.config

### P2 — Bug Design Mobile: Guia do Usuário e abas PlantDetail
**Arquivo**: `client/src/pages/Help.tsx`, `client/src/pages/PlantDetail.tsx`
**Critério de pronto**:
- [ ] Cards do Guia do Usuário (`Help.tsx`): ícone e título alinhados horizontalmente no mobile
- [ ] Abas (Tricomas, LST, Observações, Histórico) em `PlantDetail.tsx` visíveis no mobile sem corte
- [ ] `pnpm check` passa sem erros
**Não toca**: schema, auth, revenuecat, capacitor.config

### P3 — Loading states em botões durante operações assíncronas
**Critério de pronto**:
- [ ] Botões de ação primária em Home, PlantDetail, TentDetails mostram spinner/disabled durante mutations tRPC
- [ ] `pnpm check` passa sem erros
**Não toca**: schema, auth, revenuecat, capacitor.config

---

## Bloqueados

_(nenhum item)_

---

## Concluídos recentemente

### 2026-06-13 — fix: botão salvar QuickLog desabilitado durante upload de foto
- `client/src/pages/QuickLog.tsx` linhas 1307/1310: `uploadPhotoMutation.isPending` → `uploadProgress.isUploading`
- [claude-orchestrator 2026-06-13 background]

### 2026-06-13 — test: 6 testes unitários para waitlistRoutes
- `server/_core/waitlistRoutes.test.ts`: cobre POST válido, sem email, email inválido, idempotência, welcome email, origin negada
- [claude-orchestrator 2026-06-13 background]

### 2026-06-13 — chore: inicialização dos arquivos de orquestração
- CLAUDE.md, PLAYBOOK.md, BACKLOG.md, STATUS.md, UI-SHARED-NOTES.md
- [claude-orchestrator 2026-06-13 background]

---

## P0 — Requer confirmação de João (não automatizar)

- Refatoração de estufas dinâmicas (schema change: remover enum tentType)
- Sistema de alertas com margens automáticas por fase (schema change: tabela phaseAlertMargins)
- Consolidação de Seeds (alto risco)
- Sistema de Receitas de Nutrientes (feature nova grande)
- Backend de preferências de alertas (schema change)
