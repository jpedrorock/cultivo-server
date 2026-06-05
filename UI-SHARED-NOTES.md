# UI Shared Notes — App Cultivo

Notas de UX/UI compartilhadas entre agentes Claude. Última atualização sempre no topo.

---

## [2026-05-26] Animação de colapso em listas de tarefas
- Padrão de animação de colapso sem framer-motion: `overflow: hidden` + `max-height` + `opacity` via inline styles
- Usar `flushSync` do `react-dom` para forçar render síncrono do estado inicial (height expandida) antes de iniciar a transição
- Usar `requestAnimationFrame` para agendar a mudança para `max-height: 0` após o primeiro render, garantindo que a transição CSS seja acionada
- Manter dois `Set<number>`: `collapsingIds` (ativa o wrapper) e `collapsedIds` (ativa o colapso). Remover ambos após a transição + invalidação do cache
- Em `onError`, reverter imediatamente `collapsedIds` e remover `collapsingIds` após ~10ms para não deixar item travado
- Exemplo aplicado: `client/src/pages/Tarefas.tsx`

---

## [2026-05-25] Bootstrap inicial
- Arquivo criado na primeira execução do claude-orchestrator
- Projeto usa shadcn/ui + Tailwind 4; componentes de dialog: `AlertDialog` (confirmações), `Dialog` (modais de edição), `DeleteConfirmDialog` (exclusões com botão destrutivo)
- Nunca usar `window.confirm()` — substituir por `AlertDialog`
- Loading states: usar `Loader2` do lucide-react com `animate-spin`
- Toasts: sonner (`toast.success`, `toast.error`)
- Mobile: testar com DevTools mobile simulation; dispositivo real (iPhone) requer teste manual por João

---
