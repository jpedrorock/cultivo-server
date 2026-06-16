# STATUS — App Cultivo

Mantido pela routine autônoma. Atualizado em: 2026-06-16 (sessão 3).

---

## Última execução

**Branch**: `routine-cultivo-20260616-1604`
**Data**: 2026-06-16
**Agente**: claude-orchestrator (background, headless)
**Nota**: Branch criada de `main`. Arquivos de gestão copiados do PR #100 (branch `routine-cultivo-20260616-0000`, não mergeado).

### Itens concluídos

1. **modal-confirmacao-excluir-strain** (P2)
   - `client/src/pages/Strains.tsx`: Dialog inline de exclusão substituído por `DeleteConfirmDialog`
   - Removido import `AlertTriangle` desnecessário
   - Comportamento preservado: toast + undo de 5s
   - `pnpm check` 0 erros | `pnpm lint` 0 erros | `pnpm test` 72 passando

2. **testes-onboarding-wizard** (P3)
   - Criado `server/onboarding.wizard.test.ts` com 4 testes
   - Cobre: (1) tent+strain+plant em sequência, (3) strain custom cria no DB, (4) duplicata rejeitada
   - Item (2) "Pular tutorial" é client-side puro — não testável sem React Testing Library (documentado)
   - 78 testes skipados no total (sem DATABASE_URL — padrão do projeto)

### Itens pulados

- **onboarding-e4** (P2): requer decisão de produto sobre i18n EN — João deve confirmar
- **remover-campo-photoperiod-backend** (P3): BLOQUEADO — toca `drizzle/schema.ts`

### Verificações finais

- `pnpm check`: 0 erros ✅
- `pnpm lint`: 154 warnings, 0 erros ✅
- `pnpm test`: 72 passando, 78 skipped ✅

---

## Histórico de sessões

### [2026-06-16] Sessão 2 — branch routine-cultivo-20260616-0000 (PR #100)
- Bootstrap: CLAUDE.md, BACKLOG.md, STATUS.md, PLAYBOOK.md, UI-SHARED-NOTES.md
- organic-research-doc: docs/internal/ORGANIC-CULTIVATION-RESEARCH.md criado
- pressbutton-modais: DeleteConfirmDialog.tsx, EditTentDialog.tsx, EditCycleModal.tsx → PressButton

### [2026-06-14] Sessões 1–4 — bloqueios de infra
- BACKLOG.md ausente — rotina não pôde executar
- PRs #95–#98 com 0 itens registrando o bloqueio

---

## Estado geral do projeto

- v2.0.0 em produção
- Onboarding wizard E1–E3 funcional
- TypeScript OK | ESLint OK | Testes OK

---

## Próxima execução sugerida

1. `onboarding-e4` — **somente após confirmação de João** sobre i18n EN no wizard
2. `remover-campo-photoperiod-backend` — **somente após autorização** de João para tocar schema.ts
3. Adicionar novos itens ao BACKLOG se João identificar trabalho pendente
