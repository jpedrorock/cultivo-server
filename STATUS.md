# STATUS — App Cultivo Orchestrator

> Log de execuções do orchestrator background.
> Última atualização: 2026-06-07

---

## Execução Atual / Mais Recente

**Data**: 2026-06-07  
**Branch**: `routine-cultivo-20260607-1107`  
**Tipo**: Produtiva — 2 itens P2 implementados  
**Status**: Concluído

### O que aconteceu

Execução iniciou sem encontrar CLAUDE.md/BACKLOG.md no branch main (situação recorrente).
Localizado o último BACKLOG válido no branch `routine-cultivo-20260606-0000` (PR #69).
Confirmada a existência dos 2 bugs P2 no código atual (branch main).
Ambos implementados com sucesso.

**Itens implementados**:

#### 1. fix: links de calculadoras no welcome email
- `server/_core/emailService.ts` — PT: `/calculators/vpd` → `/pt/calculadoras`; EN: `/en/calculators/vpd` → `/calculators`
- `server/_core/emailService.test.ts` — 2 assertions atualizadas (linhas PT e EN)
- Validação: `pnpm check` ✅ | `pnpm lint` ✅ (0 erros/warnings nos arquivos modificados) | `pnpm test` ✅

#### 2. test: cobertura unitária de waitlistRoutes POST /api/waitlist
- `server/_core/waitlistRoutes.test.ts` criado (novo arquivo, 5 testes)
- Testa: email válido → 200 + pool.execute chamado; email inválido → 400; body sem email → 400; origin não autorizado → 403; sendWelcomeEmail chamado em background
- Mock: `express-rate-limit` (passthrough), `mysql-pool` (execute mockado), `emailService` (sendWelcomeEmail mockado)
- Validação: `pnpm check` ✅ | `pnpm lint` ✅ | `pnpm test` ✅ (5/5 passed)

**Suite completa após esta execução**:
- **93 testes passando** (↑5 vs estado anterior — novos testes waitlist)
- 74 skipped (requerem DB real — comportamento esperado)
- 0 failed

**Bloqueios nesta execução**: 0

---

## Histórico de Execuções

| Data | Branch | Itens | Bloqueios | PR |
|------|--------|-------|-----------|-----|
| 2026-06-07 | routine-cultivo-20260607-1107 | 2 (fix email URLs + test waitlist) | 0 | pendente |
| 2026-06-06 | routine-cultivo-20260606-0000 | 0 (bootstrap docs) | 0 | #69 (open) |
| 2026-06-05 | routine-cultivo-20260605-2111 | 1 (lint cleanup) | 0 | #67 (open) |
| 2026-06-05 e anterior | vários | 0 (bloqueio: arquivos ausentes) | 1 cada | #39–#66 (open) |

---

## Estado do Projeto (snapshot 2026-06-07)

### cultivo-server
- **Último commit main**: `3cd8ead` — fix cache /api/device/scenes (corta ~95% chamadas Tuya)
- **Testes**: 93 passing (88 antes de hoje + 5 novos waitlist), 74 skipped
- **Lint**: 156 warnings (todos pré-existentes; 0 erros)
- **Email service**: welcome email com URLs corretas (PT: `/pt/calculadoras`, EN: `/calculators`)
- **Waitlist route**: coberta por testes unitários agora

### Situação recorrente: PRs não mergeados
As sessões de background têm criado PRs desde 2026-05-30. Nenhum foi mergeado.
Os arquivos CLAUDE.md/BACKLOG.md chegam ao main apenas quando João fizer merge.
Até lá, cada sessão localiza o último BACKLOG nos branches das PRs abertas.
