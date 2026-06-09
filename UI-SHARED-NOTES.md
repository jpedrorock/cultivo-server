# UI Shared Notes — Coordenação de Interface

> Arquivo de coordenação entre agentes trabalhando em UI.
> Agentes NUNCA devem modificar componentes compartilhados sem registrar aqui primeiro.
> Formato: entradas mais recentes no topo.

---

## Lock de Componentes Ativos

| Componente | Agente | Data | Status |
|-----------|--------|------|--------|
| _(nenhum)_ | — | — | — |

---

## Entradas Recentes

### 2026-06-09 — claude-orchestrator (routine-cultivo-20260609-1600)
Run de implementação. Nenhuma mudança de UI realizada.
Itens implementados foram todos server-side (emailService, dbMigrations, cron, docs).
Blog já estava implementado no cultivo-site — nenhuma modificação necessitária.

### 2026-06-09 — claude-orchestrator (bootstrap)
Bootstrap do sistema de orquestração. Nenhuma mudança de UI realizada.
Componentes de cultivo-site inventariados: Header, Pricing, FAQ, Testimonials, Tour, Contact, Analytics.
Componentes de cultivo-server/client: shadcn/ui em `client/src/components/ui/`, features em `client/src/components/`.

---

## Componentes Compartilhados — cultivo-site

| Componente | Arquivo | Notas |
|-----------|---------|-------|
| Header | `src/components/Header.astro` | Nav fixa, lang toggle, CTA. NÃO duplicar inline em Base.astro |
| Pricing | `src/components/Pricing.astro` | 3 cards: Calculators/Pro/Box |
| FAQ | `src/components/FAQ.astro` | Schema.org FAQPage |
| Testimonials | `src/components/Testimonials.astro` | 3 cards (2 placeholder) |
| Tour | `src/components/Tour.astro` | Carrossel com screenshots |
| Contact | `src/components/Contact.astro` | Waitlist form |
| Analytics | `src/components/Analytics.astro` | Env-driven |
| Base layout | `src/layouts/Base.astro` | head + Schema.org + Analytics |
| i18n | `src/lib/i18n.ts` | Copy PT + EN — SEMPRE atualizar os 2 idiomas juntos |

## Padrões de UI — cultivo-site

- CSS tokens: SEMPRE `var(--color-primary)` etc., NUNCA hex direto
- i18n: SEMPRE adicionar texto em PT e EN ao mesmo tempo
- Estrutura: NÃO recriar `src/pages/en/` — EN é root (`/`), PT em `/pt/`
- Header: NÃO adicionar header inline em `Base.astro`
- pnpm: Dockerfile usa pnpm 9.15.4 — NÃO mudar pra latest

## Padrões de UI — cultivo-server/client

- shadcn/ui components — usar componente existente, não copiar código
- TailwindCSS 4 com tokens CSS
- React 19 — hooks modernos
- NÃO tocar client sem entender impacto no Capacitor (mobile)
