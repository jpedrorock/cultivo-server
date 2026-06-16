# BACKLOG — App Cultivo

Backlog gerenciado pela routine autônoma. Atualizado em: 2026-06-16 (sessão 2).

---

## ⚡ Próximos

### [P2] onboarding-e4: OnboardingWizard — i18n EN + testes unitários
**Critério de pronto**: Wizard funciona em EN (locale detectado por `navigator.language`). Testes vitest cobrem: flow completo PT, flow EN, "Pular tutorial", criação de estufa+planta.
**Contexto**: E1-E3 implementados. `LOCALE = "pt"` hardcoded no OnboardingWizard.tsx (linha ~57). tentPresets.ts já tem suporte i18n (`type Locale = "pt" | "en"`). Falta aplicar no wizard e adicionar testes.
**Arquivos**: `client/src/components/onboarding/OnboardingWizard.tsx`, `client/src/components/onboarding/tentPresets.ts`
**Não toca**: schema, auth, revenuecat, capacitor.config

---

### [P2] modal-confirmacao-excluir-strain: Strains.tsx — substituir confirm() por DeleteConfirmDialog
**Critério de pronto**: `Strains.tsx` não usa `window.confirm()`. Usar `DeleteConfirmDialog` existente em `@/components/DeleteConfirmDialog`.
**Contexto**: todo.md linha 3639 ainda mostra como `[ ]`. Verificar se foi realmente implementado. Se sim, marcar como feito no BACKLOG.
**Arquivos**: `client/src/pages/Strains.tsx`
**Não toca**: schema, auth

---


### [P3] remover-campo-photoperiod-backend: remover campo `photoperiod` do schema dailyLogs
**Critério de pronto**: Campo `photoperiod` removido de `dailyLogs` no schema e migration aplicada. Frontend já remove o campo do formulário (feito em 22/02).
**Contexto**: todo.md linha 3716-3717: frontend remove o campo do formulário mas backend ainda aceita o campo. Requer `drizzle/schema.ts` — BLOQUEADO (requer confirmação de João).
**Status**: BLOQUEADO — toca drizzle/schema.ts. Aguardar autorização.

---

### [P3] testes-onboarding-wizard: vitest para OnboardingWizard mutations
**Critério de pronto**: Testes cobrem: (1) finalizar wizard cria estufa+strain+plantas; (2) "Pular tutorial" vai pra Home sem criar nada; (3) strain custom cria nova strain no DB; (4) strain existente não duplica.
**Arquivos**: criar `server/onboarding.wizard.test.ts` ou `client/__tests__/OnboardingWizard.test.tsx`
**Não toca**: schema, auth

---

## 🔄 Em progresso

_Nenhum item em progresso no momento._

---

## ✅ Concluídos recentemente

### [2026-06-16] organic-research-doc: ORGANIC-CULTIVATION-RESEARCH.md criado
- Criado `docs/internal/ORGANIC-CULTIVATION-RESEARCH.md` referenciado em OnboardingWizard.tsx mas inexistente
- Cobre: diferenças mineral vs orgânico, impacto no app, épico futuro E1-E6

### [2026-06-16] pressbutton-modais-confirmacao: PressButton em modais de edição/confirmação
- `DeleteConfirmDialog.tsx`: Button → PressButton (pressIntensity="strong" no destrutivo)
- `EditTentDialog.tsx`: Button → PressButton no DialogFooter
- `EditCycleModal.tsx`: Button → PressButton no DialogFooter

### [2026-06-16] animation-stagger-lista-plantas: JÁ IMPLEMENTADO (stale entry)
- Verificado: `PlantsList.tsx` já usa `StaggerList` + `ListItemAnimation`

### [2026-06-16] loading-spinner-botao-camera: JÁ IMPLEMENTADO (stale entry)
- Verificado: `PlantHealthForm.tsx` já tem spinner durante upload (`isUploading` state)

### [2026-06-16] bootstrap-arquivos-gerenciamento: Criação da infraestrutura de gerenciamento
- Criados: CLAUDE.md, BACKLOG.md, STATUS.md, PLAYBOOK.md, UI-SHARED-NOTES.md
- Verificado estado do projeto (TypeScript OK, testes OK, lint OK)

---

## 🚫 Bloqueados

### remover-campo-photoperiod-backend
**Motivo**: Toca `drizzle/schema.ts` — proibido sem autorização de João.
**O que fazer**: João deve executar `ALTER TABLE daily_logs DROP COLUMN photoperiod;` manualmente e atualizar `drizzle/schema.ts`.

---

## 📋 Legenda

| Tag | Significado |
|---|---|
| P0 | Bloqueador de produção — só João |
| P1 | Alta prioridade — implementar com checker |
| P2 | Média prioridade — implementar direto |
| P3 | Baixa prioridade / polish |
| `[routine]` | Implementado por routine autônoma |
| `[Confirmar antes]` | Aguardar aprovação de João |
