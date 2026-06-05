# UI-SHARED-NOTES.md — Notas Compartilhadas de UI

> Arquivo de coordenação para agentes trabalhando em componentes visuais.
> Agentes background devem ler as **últimas 5 entradas** antes de tocar em qualquer arquivo de UI.
> Adicionar entrada ao MODIFICAR ou CRIAR componentes visuais compartilhados.

---

## Entradas (mais recentes primeiro)

### [2026-06-02] Bootstrap
**Agente**: claude-orchestrator (primeira execução)  
**Ação**: Criação do arquivo — sem modificações de UI nesta execução  
**Componentes tocados**: nenhum  
**Notas**: Arquivo criado como parte do bootstrap da infraestrutura de orquestração.

---

## Componentes Compartilhados Ativos

Lista de componentes que múltiplos agentes podem querer modificar — coordenar antes:

| Componente | Caminho | Última modificação |
|-----------|---------|-------------------|
| `LivePill` | `client/src/components/LivePill.tsx` | 2026-06-01 (DNA visual) |
| `BottomNav` | `client/src/components/BottomNav.tsx` | 2026-06-01 (hover fix) |
| `PhaseColors` | `client/src/lib/phaseColors.ts` | 2026-05-30 |
| `index.css` | `client/src/index.css` | 2026-06-01 |
| `TentDetails` | `client/src/pages/TentDetails.tsx` | 2026-06-01 (hero module) |
| `HistoryTable` | `client/src/pages/HistoryTable.tsx` | 2026-06-01 (DNA visual) |

## Convenções Visuais em Vigor

- **Tipografia mono**: `font-mono` para KPIs numéricos (Temp, RH, VPD, pH, EC, PPFD)
- **Cores por fase**: usar `phaseColors.ts` — não hardcodar hex
- **LivePill**: pílula `"NN · LABEL"` com dot pulsante colorido por fase
- **Cards**: `rounded-[1.25rem]` (20px), glass `dark:backdrop-blur-xl` em bottom-sheets
- **Glass**: `bg-card/85 dark:backdrop-blur-xl` nos cards do Forest theme
- **CSS tokens**: sempre usar `var(--color-*)` — nunca hex direto
- **prefers-reduced-motion**: respeitar em todas as animações
