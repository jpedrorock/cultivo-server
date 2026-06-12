# Playbook — Orchestrator Claude (App Cultivo)

## Modo headless / background

Quando João **não está disponível** (sessão agendada/background):

- **Nunca pause** esperando resposta. Registre bloqueio em STATUS.md e passe ao próximo item.
- Máximo **5 itens por execução**, máximo **3 bloqueios** antes de parar.
- Ao bater o limite, atualizar STATUS.md, push da branch, abrir PR.

## Fluxo por item

1. Pegar próximo item "Próximos" no BACKLOG.md (de cima para baixo).
2. **Pular se** qualquer condição abaixo for verdadeira:
   - Marcado `P0`
   - Marcado `Confirmar antes`
   - Critério de pronto não está claro
   - Em progresso por outra Claude (marcado `[claude-* background]`)
   - Toca arquivo compartilhado em UI-SHARED-NOTES.md sem autorização explícita
   - Toca `drizzle/schema.ts`, `drizzle/migrations/`, `auth*`, `revenuecat.ts`, `capacitor.config.ts`, `.env*`
3. Mover para "Em progresso" com `[claude-orchestrator YYYY-MM-DD background]`.
4. Implementar seguindo o critério de pronto.
5. Rodar: `cd cultivo-server && pnpm check && pnpm lint && pnpm test`
6. Para P1: disparar subagente checker validando critério atendido, sem regressão, testes cobrem.
7. Se checker rejeitar 2x: registrar bloqueio em STATUS.md, pular item.
8. Sucesso: mover para "Concluídos recentemente", commit com mensagem:
   ```
   <tipo>: <descrição> (backlog: <título>) [routine]
   ```

## Regras de segurança (invioláveis)

- **NUNCA** `git push --force`
- **NUNCA** merge automático em main
- **NUNCA** `db:reset` ou `db:push` em produção (`db:push` em local OK)
- **NUNCA** tocar `.env*`, `drizzle/schema.ts`, `auth*`, `revenuecat.ts`, `capacitor.config.ts`
- **NUNCA** deletar arquivo (exceto build artifacts em `dist/`, `build/`)
- Se descobrir secret exposto: **PARAR**, registrar em STATUS.md, abrir PR só com o aviso
- Sem decisões de produto. Em dúvida: bloqueio, próximo item.

## Nomenclatura de branch

```
routine-cultivo-YYYYMMDD-HHMM
```

## Nomenclatura de PR

```
routine: <N> itens automatizados <YYYY-MM-DD>
```

## Prioridades de backlog

| Prioridade | Significado |
|---|---|
| P0 | Bloqueador crítico — nunca automatizar, requer João |
| P1 | Alta prioridade — automatizar com checker |
| P2 | Normal — automatizar diretamente |
| P3 | Baixa — automatizar se tempo sobrar |

## Como atualizar STATUS.md

Ao final de cada execução, registrar:
- Data/hora da execução
- Itens processados (sucesso/bloqueio/pulado)
- Detalhes de qualquer bloqueio
- Branch e PR criados
