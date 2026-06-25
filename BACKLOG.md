# BACKLOG — App Cultivo

> Itens de trabalho priorizados para execução pelo claude-orchestrator (modo background).
> **João**: adicione itens em "Próximos" com P1 ou P2 e critério de pronto claro.
> P0 = urgente/produção, P1 = importante, P2 = melhoria/cleanup.

---

## Próximos

### [P2] Adicionar testes para waitlistRoutes
**Critério de pronto**: arquivo `server/_core/waitlistRoutes.test.ts` criado com pelo menos 3 casos de teste cobrindo: POST com email válido, POST com email inválido/ausente, e idempotência (mesmo email duas vezes). `pnpm test` passa sem regressões.
**Arquivos afetados**: `server/_core/waitlistRoutes.test.ts` (novo), sem tocar em outros
**Notas**: Usar padrão de `server/_core/emailService.test.ts` para mock do Resend. Não toca schema.

---

## Em progresso

*Nenhum item em progresso.*

---

## Concluídos recentemente

*Nenhum item concluído ainda neste BACKLOG.*

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
