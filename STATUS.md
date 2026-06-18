# STATUS — App Cultivo

Mantido pela routine autônoma. Atualizado em: 2026-06-16.

---

## Última execução

**Branch**: `routine-cultivo-20260616-0000`
**Data**: 2026-06-16
**Agente**: claude-orchestrator (background, headless)

### Itens concluídos

1. **bootstrap-arquivos-gerenciamento** (P0-bootstrap)
   - Criados: `CLAUDE.md`, `STATUS.md`, `BACKLOG.md`, `PLAYBOOK.md`, `UI-SHARED-NOTES.md`
   - Contexto: primeira execução da routine — arquivos não existiam

2. **organic-research-doc** (P3)
   - Criado: `docs/internal/ORGANIC-CULTIVATION-RESEARCH.md`
   - Referenciado em `OnboardingWizard.tsx` mas não existia

3. **modal-confirmacao-pressbutton** (P3 — interpretado de `modal-confirmacao-excluir-strain`)
   - `DeleteConfirmDialog.tsx`: `Button` → `PressButton` (variant destructive + pressIntensity strong)
   - `EditTentDialog.tsx`: `Button` → `PressButton` em DialogFooter
   - `EditCycleModal.tsx`: `Button` → `PressButton` em DialogFooter
   - Critério de pronto: modais usam componente com animação press (iOS-safe)

### Itens pulados / bloqueados

- **onboarding-e4** (P2): requer decisão de produto sobre i18n — João deve confirmar
- **modal-confirmacao-excluir-strain** (P2): verificado — `Strains.tsx` ainda usa `window.confirm()`, mas item é P2 e verificação de todo.md mostrou que não foi implementado ainda. Deixado no backlog para próxima execução.
- **remover-campo-photoperiod-backend**: BLOQUEADO (toca drizzle/schema.ts)

### Stale entries descobertas

- `animation-stagger-lista-plantas`: **já implementado** — `PlantsList.tsx` usa `StaggerList`
- `loading-spinner-botao-camera`: **já implementado** — `PlantHealthForm.tsx` tem spinner durante upload

### Verificações

- `pnpm check`: 0 erros ✅
- `pnpm lint`: 154 warnings, 0 erros ✅  
- `pnpm test`: 72 testes passando, 74 skipped (DB) ✅

---

## Estado geral do projeto

- v2.0.0 em produção
- Onboarding wizard E1–E3 funcional
- TypeScript OK | ESLint OK | Testes OK
- Infraestrutura de gerenciamento criada nesta sessão

---

## Próxima execução sugerida

1. `modal-confirmacao-excluir-strain` — substituir `window.confirm()` em `Strains.tsx` (P2, seguro)
2. `onboarding-e4` — somente após confirmação de João sobre i18n
3. `testes-onboarding-wizard` — criar testes vitest para o wizard (P3)
