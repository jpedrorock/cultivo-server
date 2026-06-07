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

### P2 (achados de code review — docs/internal/todo.md)

#### feat(ui): ConflictFreeSlider nas Calculadoras e TentLog
- **Origem**: `docs/internal/todo.md` linhas 3095-3097
- **Critério de pronto**:
  - `client/src/pages/Calculators.tsx`: todos os sliders (pH, EC, Lux, PPFD) usam `ConflictFreeSlider`
  - `client/src/pages/TentLog.tsx`: todos os sliders usam `ConflictFreeSlider`
  - Sem erros de TypeScript após mudança
- **Notas**: Componente `ConflictFreeSlider` já existe em `client/src/components/ConflictFreeSlider.tsx`. Evita conflito entre arrastar slider e swipe de navegação mobile (iOS Safari).
- **Risco**: Baixo — substituição de componente UI puro, sem mudança de lógica

#### feat(ui): Ações de Fase Personalizadas no TentDetails
- **Origem**: `docs/internal/todo.md` linha 3594
- **Critério de pronto**:
  - `client/src/pages/TentDetails.tsx` exibe os mesmos botões de ação de fase que `client/src/pages/Home.tsx`
  - Fase VEGA: "Avançar para Floração"; Fase FLORA: "Avançar para Secagem"; Fase MAINTENANCE: "Tirar Clones"; Fase CLONING: "Finalizar Clonagem"
  - `PhaseConfirmDialog` integrado antes de cada ação
  - Sem erros de TypeScript
- **Arquivos**: `client/src/pages/TentDetails.tsx` (133KB — arquivo grande, cuidado)
- **Referência**: `client/src/pages/Home.tsx` — implementação de referência
- **Risco**: Médio — arquivo muito grande

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
- **PR**: #72 (routine-cultivo-20260607-1107)
- **O que foi feito**: PT `calculators/vpd` → `pt/calculadoras`; EN `en/calculators/vpd` → `calculators`; atualizado `emailService.test.ts`

#### test: cobertura unitária de waitlistRoutes POST /api/waitlist
- **Concluído**: 2026-06-07 [claude-orchestrator 2026-06-07 background]
- **PR**: #72 (routine-cultivo-20260607-1107)
- **O que foi feito**: criado `server/_core/waitlistRoutes.test.ts` com 5 testes; 5/5 passed

#### bootstrap: criar arquivos de gestão do orchestrator (CLAUDE.md, STATUS.md, BACKLOG.md, PLAYBOOK.md)
- **Concluído**: 2026-06-06 [claude-orchestrator 2026-06-06 background]
- **PR**: #69 (routine-cultivo-20260606-0000) — open, aguardando merge

---

## Contexto / Decisões de Produto Pendentes (não automatizável)

- **Email sequence follow-up** (day-3, day-14, day-30): definir copy em PT e EN
- **Blog cultivo-site**: quando implementar (depende de conteúdo)
- **Calculator pages individuais (cultivo-site)**: confirmar prioridade antes de Sprint 3
- **Cultivo Box pricing**: definir preço e disponibilidade do hardware
- **Testimoniais reais**: obter depoimentos de beta testers

---

## Nota para João

> Há **13+ PRs de rotina abertos** com trabalho útil acumulado. A causa raiz: nenhuma das PRs de bootstrap foi mergeada em `main`, então cada nova sessão reinicia o ciclo.
>
> **Ação urgente**: Mergear ao menos as PRs de infraestrutura (#69 ou esta) para que o BACKLOG.md e STATUS.md fiquem disponíveis em `main`. Isso encerra o loop de bootstrap.
>
> **PRs com código útil para revisar**:
> - PR #72: fix email URLs + 5 testes waitlistRoutes ✅
> - PR #67: lint cleanup tents/cycles routers ✅
> - PR #71, #73: apenas STATUS.md (bloqueios documentados)
