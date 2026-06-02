# BACKLOG.md — App Cultivo

> Gerenciado pelo orchestrador background. Para adicionar itens: defina claramente o critério de pronto.
> Última atualização: 2026-06-02 (bootstrap — orchestrador primeira execução)

---

## 🔥 P0 — Crítico (não tocar sem João)

_Nenhum item P0 no momento._

---

## 🟠 P1 — Importante

_Nenhum item P1 com critério suficientemente claro no momento._

---

## 🟡 P2 — Melhoria de Qualidade

### Cobertura de testes — waitlistRoutes.ts
**ID**: test-waitlist-routes  
**Tipo**: test  
**Critério de pronto**:
- Arquivo `server/_core/waitlistRoutes.test.ts` criado
- Cobre: happy path (email válido → INSERT + 200), email inválido → 400, origin não autorizado → 403 (com header Origin presente), email ausente no body → 400
- Não precisa de banco real (mock `getMysqlPool`)
- `pnpm check && pnpm lint && pnpm test` passando
- Não toca em arquivos proibidos

**Notas**: Padrão idêntico ao `server/_core/emailService.test.ts`. O handler usa `getMysqlPool` do pool MySQL — mockar via `vi.mock('../mysql-pool', ...)`.

---

### Cobertura de testes — server/routers/tasks.ts
**ID**: test-tasks-router  
**Tipo**: test  
**Critério de pronto**:
- Arquivo `server/routers/tasks.test.ts` criado (ou `server/tasks.templates.test.ts`)
- Cobre ao menos: listagem de task templates, criação, deleção (cenários de erro + sucesso)
- Usa mock de DB (padrão dos outros testes com DB)
- `pnpm check && pnpm lint && pnpm test` passando

**Notas**: Router em `server/routers/tasks.ts`. Único router sem nenhum teste. Marcar como "Confirmar antes" se a lógica de semanas/fases for complexa demais para mock.

---

## 🟢 P3 — Nice-to-have

### Sequência de welcome emails (3 emails / 30 dias)
**ID**: email-welcome-sequence  
**Tipo**: feat  
**Confirmar antes** — requer aprovação de João (copywriting dos emails, timing)  
**Contexto**: HANDOFF.md do cultivo-site menciona sequência de 3 emails para leads da waitlist. O `sendWelcomeEmail` atual envia apenas 1 email.

---

## ✅ Concluídos Recentemente

_Histórico dos últimos itens automatizados pelo orchestrador._

### [2026-06-02] test-waitlist-routes (P2)
- `server/_core/waitlistRoutes.test.ts` criado — 8 testes
- Cobre: happy path, email inválido, email ausente, origin não autorizado, CORS, normalização, sendWelcomeEmail
- `pnpm check && pnpm lint && pnpm test` passando (80 passed / 154 total)
- Branch: `routine-cultivo-20260602-0000` — PR #48

### [2026-06-02] Bootstrap dos arquivos de orquestração
- CLAUDE.md, PLAYBOOK.md, BACKLOG.md, STATUS.md, UI-SHARED-NOTES.md criados
- Razão: primeira execução do orchestrador, arquivos não existiam
- Branch: `routine-cultivo-20260602-0000`

---

## 🚫 Em Progresso

_Itens sendo trabalhados agora (evitar conflito)._

_Nenhum item em progresso._



---

## 📋 Bloqueios Registrados

_Ver STATUS.md para detalhes._
