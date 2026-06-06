# UI Shared Notes — App Cultivo

> Decisões de UI compartilhadas entre sessões de Claude.
> Cada entrada: data, contexto, decisão. Manter as últimas 20 entradas.
> A routine lê as últimas 5 entradas antes de tocar em componentes compartilhados.

---

## 2026-06-06 — Arquivo criado pela routine

Arquivo criado com conteúdo mínimo. Preencher com decisões de UI à medida que forem tomadas.

**Convenção de entrada**:
```
## YYYY-MM-DD — <título da decisão>

**Contexto**: <por que a decisão foi necessária>
**Decisão**: <o que foi decidido>
**Arquivos afetados**: <lista>
**Não reverter**: <por que não deve ser desfeito>
```

---

## Decisões já registradas (histórico do HANDOFF.md / commits)

### Onboarding — wizard imersivo (2026-06-03)
- **Decisão**: wizard de 5 perguntas com fundo gradiente + cards de vidro (glass), transição slide, 1 pergunta por tela cheia
- **Não reverter**: João aprovou explicitamente o visual. `OnboardingDemoLog.tsx` marcado DEPRECADO (não deletar).

### Pricing — 4 tiers (2026-06-03)
- **Decisão**: Free / Starter / Cloud (⭐ mais popular) / Pro. Preços em R$. Cloud = highlight. Web default = "cloud".
- **Não reverter**: definido em STORE-LISTING §9.

### Header/Sidebar (28/02/2026)
- **Decisão**: sidebar desktop mostra apenas ícone Sprout (sem texto "App Cultivo"). Header mobile da Home mostra "Gerenciamento de Estufas" como h1.
- **Não reverter**: remoção intencional de redundância.

### Navigation — BottomNav mobile (estrutura)
- **Decisão**: BottomNav com 4 itens (Home, Plantas, Calculadoras, Alertas). Calculadoras abre popup com lista de calcs disponíveis incluindo as orgânicas.
- **Não reverter**: estrutura de navegação aprovada.
