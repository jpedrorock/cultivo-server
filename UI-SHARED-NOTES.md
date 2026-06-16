# UI-SHARED-NOTES — Notas Compartilhadas de Interface

Última atualização: 2026-06-16

---

## Convenções visuais

### Cores por fase de cultivo
| Fase | Cor principal | Uso |
|---|---|---|
| VEGA (vegetativa) | `green-600` / `#16a34a` | badges, bordas, ícones |
| FLORA (floração) | `purple-700` / `#7e22ce` | badges, bordas, ícones |
| DRYING (secagem) | `amber-600` / `#d97706` | badges, bordas, ícones |
| MAINTENANCE | `blue-600` / `#2563eb` | badges, bordas, ícones |
| CLONING | `cyan-600` / `#0891b2` | badges, bordas, ícones |

Usar `phaseColor()` e `phaseColorAlpha()` de `@/lib/phaseColors` — nunca hardcodar hex.

### Temas disponíveis
- `light` — tema claro padrão
- `dark` — tema escuro
- `highcontrast` — alto contraste claro (grayscale)
- `highcontrast-dark` — alto contraste escuro (grayscale)
- `apple` — tema inspirado em iOS/macOS (bordas arredondadas maiores)
- `forest` (tema floresta) — paleta verde escuro

Sempre testar novas UI em pelo menos light + dark.

### Tipografia
- Títulos de card: `font-bold tracking-tight`
- Labels de KPI/métrica: `text-[10px] uppercase tracking-wider` (dashboard premium)
- Valores de KPI: `text-base font-bold leading-none`
- Subtítulos/sublabels: `text-sm text-muted-foreground`

---

## Componentes de animação disponíveis

| Componente | Arquivo | Uso |
|---|---|---|
| `PressButton` | `@/components/PressButton` | botões com scale+opacity (iOS safe) |
| `PressDropdownMenuItem` | `@/components/PressDropdownMenuItem` | itens de dropdown com animação |
| `AnimatedButton` | `@/components/AnimatedButton` | botões com ripple effect (framer-motion) |
| `StaggerList` | (criado com framer-motion) | listas com entrada escalonada |
| `PageTransition` | (criado com framer-motion) | transição de fade+slide entre páginas |
| `LazyImage` | `@/components/LazyImage` | imagem com blur-up placeholder + lazy load |

### Haptics
```ts
import { haptics } from "@/lib/haptics";
haptics.light()    // toque simples
haptics.medium()   // confirmação
haptics.heavy()    // ação destrutiva
```

---

## Feedback ao usuário

### Toast
Usar `cultivoToast` de `@/lib/cultivoToast` (wrapper de Sonner):
```ts
import { cultivoToast } from "@/lib/cultivoToast";
cultivoToast.success("Salvo!");
cultivoToast.error("Erro ao salvar");
```

### States de loading
- Botões async: mostrar `<Loader2 className="mr-2 h-4 w-4 animate-spin" />` + texto "Salvando..."
- Desabilitar botão durante operação: `disabled={mutation.isPending}`
- Skeleton loading: usar `PlantCardSkeleton`, `TentCardSkeleton`, `HistoryTableSkeleton`, `ListSkeletons`

### Empty states
- Usar componente `<EmptyState>` de `@/components/EmptyState`
- Nunca deixar tela em branco sem feedback

---

## Mobile — regras de UX

- Touch targets mínimos: **44×44px**
- BottomNav tem 4 itens: Registro (verde destaque) | Home | Calculadoras | Mais
- Menu "Mais" (Sheet) contém: Plantas, Tarefas, Histórico, Alertas, Strains, Configurações
- QuickLog é acessível via botão "+" verde no BottomNav
- Pull-to-refresh na Home (invalidar queries tRPC)
- Swipe gestures no lightbox de fotos (50px threshold)
- Abas (Tabs) com `overflow-x-auto` e `inline-flex` para scroll horizontal em iOS

### Safari iOS gotchas
- `WebkitOverflowScrolling: "touch"` em contêineres com scroll
- `width: "max-content"` em abas para Safari
- Evitar CSS que só funciona no Chrome
- `display: block; width: 100%` em botões para compatibilidade
- Testar lightbox com photos da câmera (HEIC → JPEG conversão no browser via canvas)

---

## Arquivos de UI que NÃO devem ser alterados sem autorização

- `client/src/lib/revenuecat.ts` — assinaturas/paywall
- `capacitor.config.ts` — configuração nativa
- `client/src/components/PaywallSheet.tsx` — tela de paywall

---

## Últimas 5 entradas (sessões anteriores)

### [2026-06-16] — Primeira execução do orquestrador (bootstrap)
- Criados arquivos de gerenciamento: CLAUDE.md, BACKLOG.md, STATUS.md, PLAYBOOK.md, UI-SHARED-NOTES.md
- Verificado estado do projeto: TypeScript 0 erros, 72+ testes passando
- Nenhuma alteração de código nesta sessão

### [2026-02-28] — Upload e layout mobile
- Refatoração definitiva do upload de fotos (multipart, sem base64)
- Correções de layout mobile: cards do Guia, menu de ações, abas PlantDetail
- PressButton em todos os modais (25+ arquivos)
- Feedback tátil diferenciado por tipo de ação

### [2026-02-27] — Design system e animações
- Sistema de cores por fase (Vega=verde, Flora=roxo, Drying=âmbar, Maint=azul)
- Animações Recharts nas telas de histórico e gráficos
- ThemeToggle com boxes inteiros clicáveis
- Sistema Ativo: badge funcional que pausa alertas automáticos
- Tour guiado avançado (react-joyride) para features avançadas

### [2026-02-22] — QuickLog e notificações
- QuickLog com 10+ passos, swipe gestures, saúde das plantas integrada
- Múltiplos lembretes diários (AM/PM) no sistema de notificações
- Badge de "Última leitura há X horas" nos cards de estufa
- BottomNav reorganizado: Registro como item principal (verde)

### [2026-02-21] — Ciclos e dashboard
- Widget CyclesDashboard na Home com progresso visual
- Transições de fase (MAINTENANCE↔CLONING, VEGA→FLORA→DRYING)
- Confirmação de colheita com checklist
- Arquivo de plantas (HARVESTED/DISCARDED) com histórico completo
