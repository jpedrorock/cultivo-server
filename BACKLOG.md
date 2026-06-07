# BACKLOG — App Cultivo Server

> Fila de trabalho do orchestrator background.
> Mover itens de cima para baixo conforme progresso.
> Última atualização: 2026-06-06

---

## Próximos

### P2

#### fix: links de calculadoras no welcome email apontam para URLs inexistentes
- **Contexto**: `emailService.ts` usa `/calculators/vpd` (PT) e `/en/calculators/vpd` (EN) que não existem. Site usa `/calculators` (EN) e `/pt/calculadoras` (PT).
- **Critério de pronto**: 
  - PT: link aponta para `https://cultivo.pro/pt/calculadoras`
  - EN: link aponta para `https://cultivo.pro/calculators`
  - `emailService.test.ts` atualizado para verificar os URLs corretos (2 assertions: PT e EN)
  - `pnpm check && pnpm lint && pnpm test` verde
- **Arquivo**: `server/_core/emailService.ts` (linhas do template PT e EN)
- **Nota**: pequena fix, sem mudança de schema, sem mudança de auth

#### test: cobertura unitária de waitlistRoutes POST /api/waitlist
- **Contexto**: `server/_core/waitlistRoutes.ts` não tem teste unitário próprio. A lógica de validação de email, CORS, e chamada ao `sendWelcomeEmail` ficam sem cobertura.
- **Critério de pronto**:
  - Arquivo `server/_core/waitlistRoutes.test.ts` criado
  - Testa: email válido → status 200 + mock pool.execute chamado; email inválido → 400; body sem email → 400; origin não autorizado → 403; `sendWelcomeEmail` chamado em background (sem await no expect)
  - Mock de `mysql-pool` e `emailService` via `vi.mock`
  - `pnpm check && pnpm lint && pnpm test` verde
- **Nota**: não toca schema, não toca auth, só adiciona arquivo de teste

### P3

#### chore: email follow-up sequence (waitlist day-3 e day-14)
- **Confirmar antes**: sim — precisa confirmar que `waitlist.created_at` existe no schema e que João quer 2 emails de follow-up (conteúdo a definir)
- **Nota**: marcar como "Confirmar antes" até aprovação

#### chore: bump dependências patch/minor
- **Critério de pronto**: `pnpm outdated` lista as atualizações disponíveis; bumpar patch e minor (sem major); `pnpm check && pnpm lint && pnpm test` verde; commit com lista das dependências bumped
- **Nota**: rodar `pnpm outdated` primeiro para avaliar escopo antes de implementar

---

## Em Progresso

_(vazio)_

---

## Bloqueados

_(vazio)_

---

## Concluídos Recentemente

#### bootstrap: criar arquivos de gestão do orchestrator (CLAUDE.md, STATUS.md, BACKLOG.md, PLAYBOOK.md)
- **Concluído**: 2026-06-06 [claude-orchestrator 2026-06-06 background]
- **PR**: routine-cultivo-20260606-0000
- **Nota**: primeira execução do orchestrator — arquivos de gestão não existiam

---

## Contexto / Decisões de Produto Pendentes (não automatable)

Itens que precisam de João antes de entrar no BACKLOG como implementáveis:

- **Email sequence follow-up** (day-3, day-14, day-30): definir copy em PT e EN
- **Blog cultivo-site**: quando implementar (depende de alguém para escrever conteúdo)
- **Calculator pages individuais (cultivo-site)**: confirmar prioridade antes de Sprint 3
- **Cultivo Box pricing**: definir preço e disponibilidade do hardware
- **Testimoniais reais**: obter depoimentos de beta testers para substituir placeholders
