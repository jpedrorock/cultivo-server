# BACKLOG — App Cultivo

> Gerenciado pelo claude-orchestrator. Seções: **Próximos**, **Em progresso**, **Concluídos recentemente**.
>
> **Regras para itens:**
> - `[Confirmar antes]` = não executar em modo background sem aprovação de João
> - `P0` = não tocar automaticamente
> - Seguro em background = não toca schema/auth/revenuecat/capacitor.config/drizzle
>
> **Proibido sempre:** schema.ts, auth*, revenuecat.ts, capacitor.config.ts, .env*, db:push em produção

---

## ⏭️ Próximos

### [P2] chore: Sincronizar checkboxes do todo.md com estado real do código
**Arquivo:** `docs/internal/todo.md`
**Critério de pronto:** Ao menos os 10 itens verificados nesta rotina como "já implementados" estão marcados com `[x]`. Sem mudanças de código.
**Seguro em background:** Sim
**Detalhes:**
- L3754-3757: Marcar alertas ao clicar → feito em L3762-3766
- L3784-3786: Bug design mobile → feito em L3812-3814
- L3817-3821: Loading indicator upload → implementado em todos os 4 componentes
- L1140-1143: Mensagem erro estufa → supersedido por modal preview (L1156-1163)
- L1176-1179: PlantArchivePage → `PlantArchivePage.tsx` e `PlantArchiveTab.tsx` existem
- L1186-1187: MoveTentModal com cards → `MoveTentModal.tsx` existe em components/

### [P2] docs: Criar CLAUDE.md com contexto do projeto
**Arquivo:** `CLAUDE.md` (criar na raiz)
**Critério de pronto:** CLAUDE.md com stack, comandos úteis, arquitetura, convenções e regras de segurança.
**Seguro em background:** Sim
**Contexto a incluir:**
- Stack: React + Vite (client/), tRPC + Drizzle + SQLite/MySQL (server/), Capacitor (mobile)
- Comandos: `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm dev`
- Arquitetura: monorepo com client/, server/, shared/, esp32-display/
- Proibições: nunca alterar schema.ts, auth*, revenuecat.ts, capacitor.config.ts, .env*

### [P2] ux: Verificar e implementar salvamento de histórico de fertilização
**Arquivo:** `client/src/pages/Nutrients.tsx`, `server/` (sem schema)
**Critério de pronto:** Ao calcular uma receita, ela é salva com timestamp + fase + semana. Histórico consultável.
**Seguro em background:** Parcialmente — verificar se procedure existe e se tabela já existe antes de codificar. Se precisar de nova tabela → [Confirmar antes].
**Referência todo.md:** L1199
**Observação:** Verificar Nutrients.tsx e server/routers/ antes de implementar. Pode já estar parcialmente implementado.

---

## 🔄 Em progresso

_(vazio)_

---

## ✅ Concluídos recentemente

### 2026-06-05 — Inicialização da infraestrutura de orquestração [claude-orchestrator 2026-06-05 background]
Criados STATUS.md e BACKLOG.md. Investigação completa do todo.md (207KB, ~3895 linhas). Verificados 10 itens marcados como abertos mas já implementados no código. 3 bloqueios registrados (infraestrutura faltando, todo.md desatualizado, itens restantes requerem confirmação).

---

## 🚧 Bloqueios registrados

| Data | Item | Motivo | Ação |
|---|---|---|---|
| 2026-06-05 | BACKLOG/PLAYBOOK/CLAUDE/UI-SHARED-NOTES inexistentes | Infraestrutura não inicializada | Criando STATUS.md e BACKLOG.md neste PR |
| 2026-06-05 | todo.md desatualizado | Itens `[ ]` já implementados | Item de chore adicionado aos Próximos |
| 2026-06-05 | Itens genuinamente pendentes | Requerem schema, device, ou decisão de produto | Marcados `[Confirmar antes]` ou aguardando PLAYBOOK |
