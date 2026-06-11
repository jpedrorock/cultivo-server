# PLAYBOOK — claude-orchestrator modo headless

## Propósito

Define as regras de comportamento do `claude-orchestrator` quando rodando em modo **background / headless** (sem João disponível para interação).

---

## Modo headless: regras fundamentais

1. **Nunca pause esperando resposta.** Se bloqueado: registre em STATUS.md e siga pro próximo item.
2. **No máximo 5 itens por execução.** Pare ao completar 5 ou ao atingir 3 bloqueios.
3. **Sem decisões de produto.** Em dúvida: bloqueio, próximo item.
4. **Branch nova a cada execução.** Padrão: `routine-cultivo-YYYYMMDD-HHMM`

---

## Critérios de pulo obrigatório

Pule o item se qualquer condição abaixo for verdadeira:

| Condição | Ação |
|----------|------|
| Prioridade P0 | Pular |
| Marcado "Confirmar antes" | Pular |
| Critério de pronto não está claro | Pular |
| Marcado `[em-progresso]` por outra Claude | Pular |
| Toca arquivo listado em UI-SHARED-NOTES sem autorização explícita | Pular |
| Toca `drizzle/schema.ts`, `auth*`, `revenuecat*`, `capacitor.config.ts` | Pular |

---

## Fluxo de trabalho por item

```
1. Mova item para "Em progresso" no BACKLOG.md:
   [claude-orchestrator YYYY-MM-DD background]

2. Implemente seguindo critério de pronto do item

3. Rode (no contexto do repo):
   pnpm check && pnpm lint && pnpm test
   → Falhou: registre bloqueio, desfaça mudanças, próximo item

4. Para P1: dispare subagente checker validando:
   - Critério de pronto atendido
   - Sem regressão visível
   - Testes cobrem a mudança
   → Checker rejeitar 2x: registre bloqueio, próximo item

5. Sucesso:
   - Mova para "Concluídos recentemente" no BACKLOG.md
   - Commit: "<tipo>: <descrição> (backlog: <título>) [routine]"
   - Próximo item
```

---

## Regras de segurança absolutas (nunca violar)

- **NUNCA** `git push --force`
- **NUNCA** merge automático em main
- **NUNCA** `pnpm db:reset` ou `pnpm db:push` em produção (`db:push` em local OK)
- **NUNCA** toque em `.env*`, `drizzle/schema.ts`, `auth*`, `revenuecat.ts`, `capacitor.config.ts`
- **NUNCA** delete arquivo (exceto build artifacts em `dist/`, `build/`)
- **SE** descobrir secret exposto: PARE TUDO, registre em STATUS.md, abra PR só com aviso
- **SEM** decisões de produto ou priorização

---

## Estrutura do BACKLOG.md

O BACKLOG.md mantém três seções:

### Próximos
Itens disponíveis para execução automática, em ordem de prioridade (P1 antes de P2).  
Formato:
```markdown
### [P1] Título do item
**Critério de pronto**: o que define "feito"
**Arquivos afetados**: lista de arquivos
**Notas**: contexto adicional
```

### Em progresso
Itens em trabalho ativo (máximo 1 por agente ativo).  
Formato: mesmo do Próximos + `[claude-orchestrator YYYY-MM-DD background]` no título.

### Concluídos recentemente
Últimos 10 itens concluídos com link de PR/commit.

---

## STATUS.md: formato esperado

```markdown
# STATUS — claude-orchestrator

## Última execução
**Data**: YYYY-MM-DD  
**Branch**: routine-cultivo-YYYYMMDD-HHMM  
**Itens concluídos**: N  
**Bloqueios**: N  

## Resumo
[descrição do que aconteceu]

## Itens concluídos nesta execução
- Item 1 (commit: abc1234)

## Bloqueios
### BLOQUEIO #1 — Título
[descrição + ação necessária]
```
