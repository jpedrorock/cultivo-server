# PLAYBOOK.md — Regras do Orchestrador Background

## Modo Headless / Background

João NÃO está disponível. Comportamento esperado:
- **Nunca pause** esperando resposta humana
- Registre bloqueios em STATUS.md e siga para o próximo item
- Máximo 3 bloqueios por execução antes de parar
- Máximo 5 itens por execução

## Fluxo de Trabalho

1. Leia: CLAUDE.md, STATUS.md, BACKLOG.md, PLAYBOOK.md, UI-SHARED-NOTES.md
2. Crie branch: `git checkout -b routine-cultivo-$(date +%Y%m%d-%H%M)`
3. Pegue próximo item "Próximos" do BACKLOG, de cima para baixo
4. Mova para "Em progresso" com `[claude-orchestrator YYYY-MM-DD background]`
5. Implemente seguindo critério de pronto
6. Rode: `pnpm check && pnpm lint && pnpm test`
7. Para P1: dispare subagente checker validando critério + sem regressão + testes cobrem
8. Se checker rejeitar 2x: registra bloqueio em STATUS, pula item
9. Sucesso: mova para "Concluídos recentemente", commit `<tipo>: <desc> (backlog: <título>) [routine]`
10. Próximo item OR pare ao bater 3 bloqueios

## Critério de PULO (não tocar)

Skip automático quando o item:
- É P0
- Está marcado "Confirmar antes"
- Tem critério não claro ou ambíguo
- Está "em-progresso" marcado por outra Claude
- Toca arquivo compartilhado (UI-SHARED-NOTES) sem autorização explícita
- Toca: `drizzle/schema.ts`, `auth*`, `revenuecat*`, `capacitor.config.*`, `.env*`

## Regras de Segurança (NUNCA violar)

- NUNCA `git push --force`
- NUNCA merge automático em main
- NUNCA rode `db:reset`, `db:push` em produção
- NUNCA toque em `.env*`, `drizzle/schema.ts`, `auth*`, `revenuecat.ts`, `capacitor.config.ts`
- NUNCA delete arquivo (exceto build artifacts em dist/, build/)
- Se descobrir secret exposto: PARE, registre no STATUS.md, abra PR só com o aviso

## Sem Decisões de Produto

Em dúvida sobre o que fazer: registra bloqueio em STATUS.md, passa para o próximo item.

## Ao Terminar a Execução

1. Atualizar STATUS.md com resumo detalhado
2. Push da branch: `git push -u origin <branch>`
3. Abrir PR com título: `routine: <N> itens automatizados <data>`

## Prioridades

- **P0**: Bug crítico em produção — requer aprovação de João
- **P1**: Bug importante ou feature com critério claro
- **P2**: Melhoria de qualidade (testes, docs, refactor sem behavior change)
- **P3**: Nice-to-have

Background routine: P2 e P3 com critério claro. P1 só com critério muito bem definido.
