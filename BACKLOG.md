# Backlog — App Cultivo

> Atualizado: 2026-06-09 (routine-cultivo-20260609-1600)

---

## 🔴 Próximos (fila de trabalho)

### [P2] cultivo-site: Páginas individuais de calculadora
**Critério de pronto**: URLs `/calculators/vpd`, `/calculators/ppfd`, `/calculators/dli`, `/calculators/ec-conversion` com 500-800 palavras de conteúdo educacional em PT e EN + Schema.org HowTo. Cada página importa o componente da calculadora já existente no site. Rotas PT em `/pt/calculadoras/[slug]`.
**Estimativa**: ~4h
**Repo**: cultivo-site
**Notas**: SEO máximo. Não toca UI-SHARED-NOTES sem auth. Confirmar nomes dos componentes de calculadora antes de implementar.
**Confirmar antes**: Sim — João precisa confirmar quais calculadoras existem e seus componentes.

---

## ✅ Concluídos Recentemente

### [P2] cultivo-server: Sequência de acompanhamento de emails (waitlist D+3, D+14) — 2026-06-09
Implementado por: claude-orchestrator background, routine-cultivo-20260609-1600.
O que foi feito:
- `server/_core/emailService.ts`: funções `sendNurtureEmail1` (D+3) e `sendNurtureEmail2` (D+14) adicionadas
- `server/_core/dbMigrations.ts`: criado com `ensureWaitlistEmailLogTable()` para tabela `waitlist_email_log`
- `server/cron/waitlistNurture.ts`: cron diário às 10:00 UTC processando D+3 e D+14
- `server/_core/emailService.test.ts`: 10 novos testes cobrindo sendNurtureEmail1 e sendNurtureEmail2 (PT, EN, sem key, erro SDK)
- **PENDENTE**: registrar `startWaitlistNurtureCron()` no startup do servidor (arquivo não identificado nesta run)

### [P3] cultivo-server: Documentar endpoint /api/waitlist — 2026-06-09
Implementado por: claude-orchestrator background, routine-cultivo-20260609-1600.
Criado `docs/api-waitlist.md` com: URL, método, payload JSON, resposta de sucesso, rate limit, CORS, exemplos curl e JS, e nota sobre o cron de nurture.

### [P3] cultivo-server: Melhorar cobertura de testes emailService — já estava pronto
Verificado em 2026-06-09: `server/_core/emailService.test.ts` já continha 11 testes cobrindo todos os critérios (sendWelcomeEmail PT/EN/sem-key, sendPasswordResetEmail com URL). Item movido para Concluídos sem trabalho adicional.

### [P2] cultivo-site: Blog setup — já estava pronto
Verificado em 2026-06-09: `src/content/blog/` já continha 12 artigos (PT e EN), `src/content/config.ts` com schema completo, `src/pages/blog/index.astro` e `src/pages/blog/[slug].astro` implementados. Item movido para Concluídos sem trabalho adicional.

### [Bootstrap] Criação da infraestrutura de orquestração — 2026-06-09
Criados: CLAUDE.md, BACKLOG.md, STATUS.md, PLAYBOOK.md, UI-SHARED-NOTES.md.
Run: claude-orchestrator background, primeira execução.

---

## ⛔ Bloqueados

_(nenhum no momento)_

---

## 🏔️ Em Progresso

_(nenhum no momento)_

---

## 📋 Aguardando João

- cultivo-site: Conteúdo real de screenshots (33 pendentes — `docs/internal/help-screenshots-needed.md`)
- cultivo-site: Testemunhos reais (aguarda beta testers)
- cultivo-site: Pricing do Cultivo Box (aguarda definição de hardware)
- cultivo-server: `RESEND_API_KEY` configurado no Coolify (sem isso emails não saem)
- cultivo-site: `PUBLIC_WAITLIST_ENDPOINT` configurado no Coolify (sem isso usa Formspree)
- cultivo-server: Registrar `startWaitlistNurtureCron()` no arquivo de startup do servidor
- cultivo-site: Confirmar componentes de calculadora para páginas individuais ([P2] calculadora pages)
