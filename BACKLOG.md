# BACKLOG — App Cultivo

Backlog gerenciado pela routine autônoma. Atualizado em: 2026-06-16 (sessão 3).

---

## ⚡ Próximos

### [P2] onboarding-e4: OnboardingWizard — i18n EN + testes unitários
**Critério de pronto**: Wizard funciona em EN (locale detectado por `navigator.language`). Testes vitest cobrem: flow completo PT, flow EN, "Pular tutorial", criação de estufa+planta.
**Contexto**: E1-E3 implementados. `LOCALE = "pt"` hardcoded no OnboardingWizard.tsx (linha ~57). tentPresets.ts já tem suporte i18n (`type Locale = "pt" | "en"`). Falta aplicar no wizard e adicionar testes.
**Arquivos**: `client/src/components/onboarding/OnboardingWizard.tsx`, `client/src/components/onboarding/tentPresets.ts`
**Não toca**: schema, auth, revenuecat, capacitor.config

---



### [P3] remover-campo-photoperiod-backend: remover campo `photoperiod` do schema dailyLogs
**Critério de pronto**: Campo `photoperiod` removido de `dailyLogs` no schema e migration aplicada. Frontend já remove o campo do formulário (feito em 22/02).
**Contexto**: todo.md linha 3716-3717: frontend remove o campo do formulário mas backend ainda aceita o campo. Requer `drizzle/schema.ts` — BLOQUEADO (requer confirmação de João).
**Status**: BLOQUEADO — toca drizzle/schema.ts. Aguardar autorização.

---


## 🔄 Em progresso

_Nenhum item em progresso no momento._

---

## ✅ Concluídos recentemente

### [2026-06-16] testes-onboarding-wizard: vitest para mutations do wizard
- `server/onboarding.wizard.test.ts` criado com 4 testes
- Cobre: (1) tent+strain+plant em sequência, (3) strain custom cria no DB, (4) duplicata rejeitada
- Item (2) "Pular tutorial" é client-side — não testável sem React Testing Library (documentado no arquivo)
- Testes skipados sem DATABASE_URL (padrão do projeto)

### [2026-06-16] modal-confirmacao-excluir-strain: Strains.tsx refatorado para DeleteConfirmDialog
- Dialog inline de exclusão removido — substituído por `DeleteConfirmDialog` (componente compartilhado)
- Removido import `AlertTriangle` não mais necessário
- Comportamento preservado: mesmo fluxo com toast + undo de 5s
- `pnpm check` 0 erros | `pnpm lint` 0 erros | `pnpm test` 72 passando

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
