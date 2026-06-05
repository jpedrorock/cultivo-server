# UI Shared Notes — App Cultivo

Notas de UX/UI compartilhadas entre agentes Claude. Última atualização sempre no topo.

---

## [2026-05-25] Bootstrap inicial
- Arquivo criado na primeira execução do claude-orchestrator
- Projeto usa shadcn/ui + Tailwind 4; componentes de dialog: `AlertDialog` (confirmações), `Dialog` (modais de edição), `DeleteConfirmDialog` (exclusões com botão destrutivo)
- Nunca usar `window.confirm()` — substituir por `AlertDialog`
- Loading states: usar `Loader2` do lucide-react com `animate-spin`
- Toasts: sonner (`toast.success`, `toast.error`)
- Mobile: testar com DevTools mobile simulation; dispositivo real (iPhone) requer teste manual por João

---
