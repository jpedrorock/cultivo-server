# BACKLOG — App Cultivo Server

> Fila de trabalho do orchestrator background.
> Mover itens de cima para baixo conforme progresso.
> Última atualização: 2026-06-07

---

## Próximos

### P3

#### chore: email follow-up sequence (waitlist day-3 e day-14)
- **Confirmar antes**: sim — precisa confirmar que `waitlist.created_at` existe no schema e que João quer 2 emails de follow-up (conteúdo a definir)
- **Nota**: marcar como "Confirmar antes" até aprovação

#### chore: bump dependências patch/minor
- **Critério de pronto**: `pnpm outdated` lista as atualizações disponíveis; bumpar patch e minor (sem major); `pnpm check && pnpm lint && pnpm test` verde; commit com lista das dependências bumped
- **Nota**: rodar `pnpm outdated` primeiro para avaliar escopo antes de implementar

#### chore: lint cleanup em routers (warnings existentes)
- **Contexto**: ~156 warnings de lint no projeto (imports não usados, variáveis não usadas). Não afeta funcionamento — polimento apenas.
- **Candidatos prioritários**:
  - `server/cleanup-orphan-groups.ts` — 17 imports de schema não utilizados
  - `client/src/pages/TentDetails.tsx` — `useRef`, `useEffect` não utilizados
  - `server/alerts.markAllAsSeen.test.ts` — `beforeEach` não utilizado
  - `server/cycles.maintenance-cloning.test.ts` — 3 variáveis não utilizadas
  - `server/routers/tents.ts` — imports e variáveis não utilizados restantes (pós-PR #67)
- **Critério de pronto**: cada arquivo tocado tem 0 warnings de lint; `pnpm check && pnpm lint && pnpm test` verde
- **Nota**: não tocar em `drizzle/schema.ts`, `auth*.ts`, `revenuecat.ts`, `capacitor.config.ts`

---

## Em Progresso

_(vazio)_

---

## Bloqueados

_(vazio)_

---

## Concluídos Recentemente

#### fix: links de calculadoras no welcome email apontam para URLs inexistentes
- **Concluído**: 2026-06-07 [claude-orchestrator 2026-06-07 background]
- **PR**: routine-cultivo-20260607-1107
- **O que foi feito**: PT `calculators/vpd` → `pt/calculadoras`; EN `en/calculators/vpd` → `calculators`; atualizado `emailService.test.ts` (assertions das linhas PT e EN)

#### test: cobertura unitária de waitlistRoutes POST /api/waitlist
- **Concluído**: 2026-06-07 [claude-orchestrator 2026-06-07 background]
- **PR**: routine-cultivo-20260607-1107
- **O que foi feito**: criado `server/_core/waitlistRoutes.test.ts` com 5 testes (email válido, email inválido, body sem email, origin não autorizado, sendWelcomeEmail em background); usa mock de `express-rate-limit`, `mysql-pool` e `emailService`; 5/5 passed

#### bootstrap: criar arquivos de gestão do orchestrator (CLAUDE.md, STATUS.md, BACKLOG.md, PLAYBOOK.md)
- **Concluído**: 2026-06-06 [claude-orchestrator 2026-06-06 background]
- **PR**: routine-cultivo-20260606-0000 (open, não mergeado — bloqueante para futuras sessões)

---

## Contexto / Decisões de Produto Pendentes (não automatable)

Itens que precisam de João antes de entrar no BACKLOG como implementáveis:

- **Email sequence follow-up** (day-3, day-14, day-30): definir copy em PT e EN
- **Blog cultivo-site**: quando implementar (depende de alguém para escrever conteúdo)
- **Calculator pages individuais (cultivo-site)**: confirmar prioridade antes de Sprint 3
- **Cultivo Box pricing**: definir preço e disponibilidade do hardware
- **Testimoniais reais**: obter depoimentos de beta testers para substituir placeholders

---

## Nota para João

> Há ~13 PRs de rotina abertos com trabalho útil. Os mais relevantes:
> - PR #67: lint cleanup tents/cycles (1 item concluído)
> - PR #57: fix email URLs (foi antecipado parcialmente)
> - PR #54: cultivo-site EC/PPM
>
> As sessões têm falhado repetidamente por não encontrar CLAUDE.md/BACKLOG.md no branch main.
> Mesclar este PR resolve o ciclo de bootstrap infinito.
