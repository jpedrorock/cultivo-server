# UI-SHARED-NOTES — App Cultivo

> Notas compartilhadas entre agentes Claude trabalhando no frontend.
> Atualizar quando modificar componentes de base, tokens CSS, ou padrões de UI.
> Manter as **últimas 10 entradas** — remover as mais antigas quando necessário.

---

## Últimas 5 entradas

### 2026-06-11 — Bootstrap
Arquivo criado pelo claude-orchestrator. Nenhuma nota de UI registrada ainda.

---

## Tokens CSS globais

Definidos em `client/src/styles/global.css`.  
**Regra**: sempre usar tokens, nunca hex direto.

- `var(--color-primary)` — cor principal
- `var(--color-fg)` — texto foreground
- `var(--color-bg)` — background
- Ver `global.css` para lista completa de tokens

## Padrões de componentes

- Componentes base shadcn/ui em `client/src/components/ui/`
- Não editar `components/ui/*` diretamente — usar `className` para sobrescrever
- BottomNav mobile: `client/src/components/BottomNav.tsx`
- Sidebar desktop: `client/src/components/Sidebar.tsx`
- Layout base: `client/src/App.tsx`

## Arquivos de UI que requerem coordenação antes de editar

- `client/src/App.tsx`
- `client/src/components/Sidebar.tsx`
- `client/src/components/BottomNav.tsx`
- `client/src/styles/global.css`
- `client/src/components/ui/*`

## Como registrar uma nota

Ao modificar um arquivo compartilhado de UI, adicione uma entrada no topo das "Últimas 5 entradas":

```markdown
### YYYY-MM-DD — Título da mudança
Arquivo: `path/do/arquivo.tsx`  
O que mudou: descrição  
Por quê: razão  
Branch/PR: link ou nome
```
