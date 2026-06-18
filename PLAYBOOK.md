# Playbook — Sessões Background (claude-orchestrator)

## Modo headless / background

- João NÃO está disponível. Nunca pausar esperando resposta.
- Se bloqueado: registrar em `STATUS.md` e ir pro próximo item.
- MAX 5 itens por execução da routine.
- Parar ao bater 3 bloqueios consecutivos.

## Loop de trabalho

1. Ler BACKLOG.md → pegar próximo item de "Próximos" de cima pra baixo
2. PULAR se qualquer condição abaixo:
   - Prioridade P0
   - Marcado `[Confirmar antes]`
   - Critério de pronto não está claro
   - Em progresso por outra sessão Claude
   - Toca arquivo UI compartilhado sem autorização explícita
   - Toca: `drizzle/schema.ts`, `auth*`, `revenuecat.ts`, `capacitor.config.ts`, `.env*`
3. Mover pra "Em progresso" com `[claude-orchestrator YYYY-MM-DD background]`
4. Implementar seguindo critério de pronto
5. Rodar: `pnpm check && pnpm lint && pnpm test`
6. P1: disparar subagente checker validando critério atendido + sem regressão + testes
   - Checker rejeitar 2×: registrar bloqueio, pular item
7. Sucesso: mover pra "Concluídos recentemente", commit com msg padrão
8. Próximo item

## Regras de segurança (invioláveis)

- **NUNCA** `git push --force`
- **NUNCA** merge automático em `main`
- **NUNCA** rodar `db:reset` ou `db:push` em produção (local OK)
- **NUNCA** tocar em `.env*`, `drizzle/schema.ts`, `auth*`, `revenuecat.ts`, `capacitor.config.ts`
- **NUNCA** deletar arquivo (exceto build artifacts em `dist/`, `build/`)
- Se encontrar secret exposto: PARAR, registrar, abrir PR só com o aviso
- Sem decisões de produto. Em dúvida → bloqueio, próximo item

## Formato de commit
```
<tipo>: <descrição curta> (backlog: <título do item>) [routine]
```

## Formato STATUS.md

```markdown
## Execução YYYY-MM-DD HH:MM [routine]

**Branch**: routine-cultivo-YYYYMMDD-HHMM
**Resultado**: N itens concluídos, M bloqueios

### Concluídos
- item A
- item B

### Bloqueios
- item C: motivo
```

## Prioridades
- **P0**: crítico / produção quebrada — NUNCA automatizar
- **P1**: alta — automatizar com subagente checker
- **P2**: média — automatizar direto
- **P3**: baixa / manutenção — automatizar direto
