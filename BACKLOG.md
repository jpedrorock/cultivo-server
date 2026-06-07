# Backlog — App Cultivo

> Mantido pela rotina background do claude-orchestrator.
> Fonte de verdade: este arquivo. todo.md em docs/internal/ é histórico de implementação.

## Próximos

### [P2] ConflictFreeSlider nas Calculadoras e TentLog
**Origem**: `docs/internal/todo.md` linhas 3095-3097  
**Critério de pronto**:
- `client/src/pages/Calculators.tsx`: todos os sliders (pH, EC, Lux, PPFD) usam `ConflictFreeSlider` em vez do slider padrão
- `client/src/pages/TentLog.tsx`: todos os sliders usam `ConflictFreeSlider`
- Sem erros de TypeScript após mudança

**Notas**: Componente `ConflictFreeSlider` já existe em `client/src/components/ConflictFreeSlider.tsx`. Objetivo: evitar conflito entre arrastar slider e swipe de navegação mobile (iOS Safari).

**Não tocar em**: schema, auth, revenuecat, capacitor.config  
**Risco**: Baixo — substituição de componente UI puro, sem mudança de lógica

---

### [P2] Ações de Fase Personalizadas no TentDetails
**Origem**: `docs/internal/todo.md` linha 3594  
**Critério de pronto**:
- `client/src/pages/TentDetails.tsx` exibe os mesmos botões de ação de fase que `client/src/pages/Home.tsx`:
  - Fase VEGA: botão "Avançar para Floração" (verde)
  - Fase FLORA: botão "Avançar para Secagem" (laranja)  
  - Fase MAINTENANCE: botão "Tirar Clones" (azul)
  - Fase CLONING: botão "Finalizar Clonagem" (azul)
- `PhaseConfirmDialog` integrado antes de cada ação (já existe o componente)
- Sem erros de TypeScript

**Arquivos envolvidos**: `client/src/pages/TentDetails.tsx` (133KB — arquivo grande, cuidado)  
**Referência**: `client/src/pages/Home.tsx` — botões já implementados lá  
**Componentes reutilizáveis**: `PhaseConfirmDialog`, `StartFloraModal`, `StartDryingModal`, `StartCloningModal`, `FinishCloningDialog`

**Não tocar em**: schema, auth, revenuecat, capacitor.config  
**Risco**: Médio — TentDetails.tsx é um arquivo grande, verificar TypeScript cuidadosamente

---

### [P3] Revisar e Atualizar docs/internal/todo.md
**Critério de pronto**: Itens já implementados no código marcados como `[x]` no todo.md  
**Confirmar antes**: Sim — João deve aprovar a lista de itens a marcar

Itens candidatos para marcar como feitos (verificados no código):
- Loading Indicator - QuickLog (já implementado)
- Loading Indicator - PlantHealthTab (já implementado)
- Loading Indicator - PlantTrichomesTab (já implementado)
- Loading Indicator - EditHealthLogDialog (já implementado)

---

## Em Progresso

_(nenhum item em andamento no momento)_

---

## Concluídos Recentemente

_(nenhum item concluído nesta execução — execução de bootstrap)_

---

## Bloqueados

| Item | Motivo | Data |
|---|---|---|
| Execução de bootstrap | PLAYBOOK.md, CLAUDE.md, UI-SHARED-NOTES.md não existem | 2026-06-07 |
| Marcação de todo.md | Arquivo 207KB — risco de corrupção via API | 2026-06-07 |
