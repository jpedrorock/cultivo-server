# App Cultivo — Contexto para IAs

## O que é isso

PWA + app nativo (iOS/Android via Capacitor) para gerenciar estufas de cultivo indoor.  
Stack: React 19 / Tailwind 4 / shadcn-ui / tRPC / Drizzle / MySQL 8.

O repositório é monorepo: `client/` (React), `server/` (Express+tRPC), `drizzle/` (schema+migrations).

---

## Comandos rápidos

```bash
pnpm check        # TypeScript sem erros
pnpm lint         # ESLint (154 warnings OK, 0 errors = OK)
pnpm test         # vitest (72+ testes, sem DB)
pnpm dev          # dev server em :3000
pnpm db:seed      # popula banco (local)
```

---

## Estrutura de pastas importantes

```
client/src/
  pages/          rotas do app (Home, PlantDetail, TentDetails, QuickLog…)
  components/     UI reutilizável (PlantHealthTab, BottomNav, onboarding/…)
  lib/            trpc client, utils, haptics, uploadImage, platform…
  hooks/          custom hooks
  contexts/       ThemeContext, SidebarContext

server/
  _core/          express, auth JWT, vite middleware
  routers.ts      todas as procedures tRPC (central)
  db.ts           drizzle + funções de negócio
  drizzle/        schema.ts + migrations

esp32-display/    firmware ESP32 (não tocar sem autorização explícita)
```

---

## Regras para trabalho autônomo (background)

### NUNCA tocar:
- `.env*` (quaisquer arquivos de variáveis de ambiente)
- `drizzle/schema.ts` (schema do banco — requer migration manual)
- `server/_core/auth*` (auth JWT / OAuth)
- `client/src/lib/revenuecat.ts` (assinaturas)
- `capacitor.config.ts` (config nativa)
- `esp32-display/` sem autorização

### NUNCA fazer:
- `git push --force`
- Merge automático em `main`
- `db:reset` ou `db:push` em produção
- Deletar arquivos (exceto `dist/`, `build/` — build artifacts)
- Decisões de produto sem confirmação

### Fluxo seguro:
1. Criar branch `routine-cultivo-YYYYMMDD-HHMM`
2. Trabalhar nos itens do BACKLOG.md
3. Rodar `pnpm check && pnpm lint && pnpm test`
4. Fazer commit com mensagem `<tipo>: <descrição> (backlog: <título>) [routine]`
5. Push + PR

---

## Convenções de código

- **TypeScript**: 0 erros é obrigatório. Warnings de lint são aceitáveis.
- **Componentes UI**: usar shadcn/ui (`@/components/ui/`). Nunca instalar nova lib de UI sem autorização.
- **Toast**: usar `cultivoToast` de `@/lib/cultivoToast` (wrapper de Sonner).
- **Haptics**: `haptics.light() / medium() / heavy()` de `@/lib/haptics`.
- **Fetch/mutations**: tRPC via `trpc.<router>.<procedure>.useMutation()`.
- **Estilos**: Tailwind 4 com tokens CSS (`var(--color-primary)` etc.). Sem hex direto.
- **Internacionalização**: app é PT-BR. Strings em português. Enums de DB em inglês.
- **Animações**: framer-motion já instalado. PressButton, AnimatedButton disponíveis.
- **Upload de fotos**: usar `uploadImage()` de `@/lib/uploadImage` (multipart, não base64).

---

## Subsistemas chave

| Subsistema | Arquivos principais |
|---|---|
| Onboarding wizard | `client/src/components/onboarding/OnboardingWizard.tsx` |
| Autenticação | `server/_core/auth*.ts`, `useAuth` hook |
| Alertas inteligentes | `server/alertChecker.ts`, `server/db.ts:checkAlertsForTent` |
| Upload de fotos | `server/uploadRouter.ts`, `client/src/lib/uploadImage.ts` |
| Nutrientes | `server/nutrients.ts`, `client/src/pages/Nutrients.tsx` |
| Ciclos/fases | `server/routers.ts` (cycles.*), `PhaseConfirmDialog`, `PhaseTransitionDialog` |
| Plantas | `server/routers.ts` (plants.*), `PlantDetail`, `PlantsList` |
| Notificações push | `server/pushService.ts`, `client/src/lib/pushNotifications.ts` |
| Paywall | `client/src/lib/revenuecat.ts`, `PaywallSheet` |
| ESP32 display | `esp32-display/` — firmware independente |

---

## Estado atual (2026-06-16)

- v2.0.0 em produção
- Onboarding wizard (E1–E3) implementado e funcional
- 72+ testes passando (testes de DB skipped sem DATABASE_URL)
- TypeScript: 0 erros | ESLint: 154 warnings, 0 errors
- Branch `main` atualizada com commits recentes de onboarding e fixes de nav
