# Backlog — App Cultivo

> Atualizado: 2026-06-09 (bootstrap inicial pela rotina orchestrator)
> Fonte: HANDOFF.md (cultivo-site) + análise do codebase

---

## 🔴 Próximos (fila de trabalho)

### [P2] cultivo-site: Páginas individuais de calculadora
**Critério de pronto**: URLs `/calculators/vpd`, `/calculators/ppfd`, `/calculators/dli`, `/calculators/ec-conversion` com 500-800 palavras de conteúdo educacional em PT e EN + Schema.org HowTo. Cada página importa o componente da calculadora já existente no site. Rotas PT em `/pt/calculadoras/[slug]`.
**Estimativa**: ~4h
**Repo**: cultivo-site
**Notas**: SEO máximo. Não toca UI-SHARED-NOTES sem auth. Confirmar nomes dos componentes de calculadora antes de implementar.
**Confirmar antes**: Sim — João precisa confirmar quais calculadoras existem e seus componentes.

### [P2] cultivo-site: Blog setup
**Critério de pronto**: Astro Content Collection em `src/content/blog/`, 1 artigo modelo em PT e EN com frontmatter completo (title, description, date, lang), rota `/blog` listando artigos com paginação, rota `/blog/[slug]` renderizando. CSS segue tokens existentes.
**Estimativa**: ~1h
**Repo**: cultivo-site
**Notas**: Sem conteúdo real — só estrutura + 1 artigo exemplo. Deve seguir padrões de i18n existentes.

### [P2] cultivo-server: Sequência de acompanhamento de emails (waitlist D+3, D+14)
**Critério de pronto**: `emailService.ts` com funções `sendNurtureEmail1` (D+3, dicas de cultivo) e `sendNurtureEmail2` (D+14, feature spotlight). Tabela `waitlist_email_log` para tracking de envios (via `dbMigrations.ts`, não tocar `schema.ts`). Cron job diário que verifica e envia pendentes. Testes em `emailService.test.ts` cobrindo ambas funções.
**Estimativa**: ~2h
**Repo**: cultivo-server
**Notas**: Welcome email D+0 JÁ está implementado em `emailService.ts`. Esta task é apenas a sequência de follow-up. Cron pode ser adicionado em `server/cron/`.

### [P3] cultivo-server: Melhorar cobertura de testes emailService
**Critério de pronto**: `server/_core/emailService.test.ts` cobre: sendWelcomeEmail PT, sendWelcomeEmail EN, sendWelcomeEmail sem RESEND_API_KEY (não deve lançar erro), sendPasswordResetEmail (verifica URL formada corretamente).
**Estimativa**: ~30min
**Repo**: cultivo-server

### [P3] cultivo-server: Documentar endpoint /api/waitlist
**Critério de pronto**: `README.md` ou novo `docs/api-waitlist.md` com: URL, método, payload JSON (campos aceitos), resposta de sucesso, rate limit (5/IP/hora), CORS (origens aceitas), exemplos curl.
**Estimativa**: ~15min
**Repo**: cultivo-server

---

## ✅ Concluídos Recentemente

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
