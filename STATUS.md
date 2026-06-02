# STATUS — App Cultivo (Rotina Automatizada)

> Atualizado por: claude-orchestrator  
> Data: 2026-06-02  
> Branch: routine-cultivo-20260602-1116  
> Modo: headless / background

---

## ✅ Execução 2026-06-02

### Item concluído

**Calculadora EC/PPM — cultivo-site (Sprint 3)**

| Campo | Valor |
|-------|-------|
| Tipo | feat |
| Repo | cultivo-site |
| Branch | routine-cultivo-20260602-1116 |
| Commits | f5c6eea |
| Build | 26 → 28 páginas ✅ |

**O que foi feito:**
- `src/components/EcCalcWidget.tsx` — componente React standalone: modo EC→PPM e PPM→EC, seletor de escala 500/600/700 (Hanna/Truncheon/Bluelab), texto localizado por prop `locale`
- `src/pages/calculators/ec.astro` (EN) — Schema.org HowTo, tabela EC vs PPM vs TDS, metas por fase, hreflang, CTA
- `src/pages/pt/calculadoras/ec.astro` (PT) — espelho em português

**Critério de pronto:** completa o set VPD/PPFD/pH/EC de páginas individuais de calculadora que o HANDOFF.md lista como Sprint 3.

---

## ⚠️ Bloqueios desta execução

1. **INFRA: arquivos de orquestração ausentes** — CLAUDE.md, BACKLOG.md, PLAYBOOK.md, UI-SHARED-NOTES.md não existem na raiz do cultivo-server. Usado HANDOFF.md do cultivo-site + docs/internal/todo.md como fonte de verdade do backlog.

2. **TODO.MD STALE** — O docs/internal/todo.md tem 363 itens `- [ ]` mas a maioria é obsoleta (implementada em sessões posteriores). A pesquisa efetiva de itens pendentes requere análise manual.

3. **FILA CURTA** — Apenas 1 item foi implementado com alta confiança (EC calculator page, padrão bem definido). Os demais candidatos envolviam: schema/drizzle (bloqueado), testes em iPhone (impossível headless), ou eram ambíguos sem PLAYBOOK.

---

## 📋 Estado do backlog (cultivo-site Sprint 3)

| Item | Status |
|------|--------|
| VPD page (EN+PT) | ✅ Feito |
| PPFD page (EN+PT) | ✅ Feito |
| pH page (EN+PT) | ✅ Feito |
| EC/PPM page (EN+PT) | ✅ Feito esta execução |
| Blog setup | ✅ Feito (vpd, ppfd, ec guides EN+PT) |
| DLI calculator page | 🟡 Pendente |
| Runoff/Watering page | 🟡 Pendente |

---

## Histórico de execuções

| Data | Branch | Itens | Status |
|------|--------|-------|--------|
| 2026-05-29 a 06-01 | routine-cultivo-* | 0 | Bloqueio infra |
| 2026-06-01 | routine-cultivo-20260601-1112 | 1 (TentDetails CLONING btn) | PR #45 aberto |
| 2026-06-02 | routine-cultivo-20260602-1116 | 1 (EC/PPM calculator) | PR aberto |
