# BACKLOG — App Cultivo

> Itens de trabalho priorizados para execução pelo claude-orchestrator (modo background).
> **João**: adicione itens em "Próximos" com P1 ou P2 e critério de pronto claro.
> P0 = urgente/produção, P1 = importante, P2 = melhoria/cleanup.

---

## Próximos

*Fila vazia. Adicione itens aqui para a próxima execução da rotina.*

---

## Em progresso

*Nenhum item em progresso.*

---

## Concluídos recentemente

### ✅ [P2] Adicionar testes para waitlistRoutes
**Concluído em**: 2026-06-11  
**Branch/PR**: `routine-cultivo-20260611-1340`  
**Commit**: `test: testes unitários para waitlistRoutes (backlog: Adicionar testes para waitlistRoutes) [routine]`  
**Resultado**: 6 testes cobrindo email válido, email ausente, email inválido, idempotência, welcome email, e origin bloqueada.

---

## Como adicionar itens

Copie este template e adicione na seção "Próximos":

```markdown
### [P1|P2] Título do item
**Critério de pronto**: o que define "feito" de forma verificável
**Arquivos afetados**: lista dos arquivos que serão modificados
**Notas**: contexto, dependências, cuidados
```

**Regras para itens automatizáveis:**
- Sem mudanças em `drizzle/schema.ts` (não requer `db:push`)
- Sem tocar em `auth*`, `revenuecat*`, `capacitor.config.ts`, `.env*`
- Critério de pronto verificável por `pnpm check && pnpm lint && pnpm test`
- Não marcar como P0 (P0 requer atenção manual)
- Adicionar "Confirmar antes" se precisar de decisão de produto
