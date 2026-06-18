# Playbook — Claude Orchestrator

## Modo headless / background

Quando `João NÃO está disponível`, seguir estritamente:

1. **Nunca pausar** esperando resposta. Registrar bloqueio em STATUS.md e pular pro próximo.
2. **Critério de pronto**: descrito no BACKLOG; se ambíguo → bloqueio.
3. **Máx 5 itens por execução**, parar ao bater 3 bloqueios.

## Filtros de segurança (PULAR item se qualquer condição):
- Prioridade P0
- Marcado "Confirmar antes"
- Critério de pronto não claro
- Item "em-progresso" por outra instância
- Toca arquivo compartilhado (UI-SHARED-NOTES) sem autorização explícita
- Toca drizzle/schema, auth, revenuecat, capacitor.config

## Fluxo por item
```
1. Mover pra "Em progresso" com [claude-orchestrator YYYY-MM-DD background]
2. Implementar
3. cd /home/user/cultivo-server && pnpm check && pnpm lint && pnpm test
4. P1: Checker subagente — critério atendido? sem regressão? testes cobrem?
5. Checker rejeita 2x: bloqueio em STATUS.md, pular
6. Sucesso: mover pra "Concluídos recentemente", commit
```

## Formato de commit
```
<tipo>: <descrição> (backlog: <título>) [routine]
```

## Regras de segurança absolutas
- NUNCA git push --force
- NUNCA merge automático em main
- NUNCA rode db:reset, db:push em produção
- NUNCA toque em .env*, drizzle/schema.ts, auth*, revenuecat.ts, capacitor.config.ts
- NUNCA delete arquivo (exceto build artifacts em dist/, build/)
- Secret exposto: PARE, registre, abra PR só com aviso
- Sem decisões de produto — bloqueio se em dúvida
