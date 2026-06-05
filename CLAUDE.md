# App Cultivo — Contexto para Claude

## Projeto
PWA para gerenciar estufas de cultivo indoor. Stack: React 19 + Tailwind 4 + shadcn/ui (frontend), Express 4 + tRPC 11 (backend), MySQL 8 via Drizzle ORM, JWT auth, Three.js 3D editor.

## Estrutura
```
client/src/
  pages/        → Páginas React (rotas)
  components/   → Componentes compartilhados
  features/     → Features isoladas (cannaprune, training)
  hooks/        → Custom hooks
  lib/          → trpc.ts, utils.ts
server/
  routers/      → tRPC routers por domínio
  db/           → db.ts (conexão Drizzle)
shared/         → Tipos e schemas Zod compartilhados
drizzle/        → schema.ts (NUNCA editar diretamente)
```

## Comandos
```bash
cd /home/user/cultivo-server
pnpm check    # tsc --noEmit
pnpm lint     # eslint
pnpm test     # vitest
pnpm build    # vite build
```

## Arquivos proibidos (nunca tocar)
- `.env*`
- `drizzle/schema.ts`
- `server/auth*`
- `revenuecat.ts`
- `capacitor.config.ts`

## Convenções
- Dialogs de confirmação: usar `AlertDialog` ou `DeleteConfirmDialog` — nunca `window.confirm()`
- Toasts: `sonner` (toast.success / toast.error)
- Ícones: lucide-react
- Estilos: Tailwind 4 + classes shadcn/ui

## Backlog e Status
- `BACKLOG.md` — itens a trabalhar (fonte de verdade para claude-orchestrator)
- `STATUS.md` — log de execuções do orchestrator
- `UI-SHARED-NOTES.md` — notas de UX/UI compartilhadas entre agentes
