# Playbook — claude-orchestrator (App Cultivo)

## Modo headless / background
O orchestrator roda automaticamente sem João disponível. Regras:
- **Nunca** pause esperando resposta
- Bloqueio → registre em STATUS.md → próximo item
- Máximo 5 itens por execução
- Máximo 3 bloqueios consecutivos → pare, abra PR

## Loop de trabalho
1. Leia BACKLOG.md, pegue próximo item de "Próximos" (de cima pra baixo)
2. Filtre conforme regras de skip abaixo
3. Mova para "Em progresso" com `[claude-orchestrator YYYY-MM-DD background]`
4. Implemente seguindo critério de pronto do item
5. Rode: `cd cultivo-server && pnpm check && pnpm lint && pnpm test`
6. Para P1: dispare subagente checker validando critério + sem regressão + testes
7. Checker rejeitar 2x → bloqueio em STATUS.md, próximo item
8. Sucesso → mova para "Concluídos recentemente", commit: `<tipo>: <descrição> (backlog: <título>) [routine]`

## Regras de skip (PULE o item se)
- Prioridade P0
- Marcado "Confirmar antes"
- Critério de pronto não claro ou ausente
- Em progresso por outra instância de Claude
- Toca arquivo compartilhado (UI-SHARED-NOTES) sem autorização explícita
- Toca: drizzle/schema.ts, auth*, revenuecat.ts, capacitor.config.ts, .env*

## Regras de segurança (absolutas)
- NUNCA `git push --force`
- NUNCA merge automático em main
- NUNCA `db:reset` ou `db:push` em produção (local OK)
- NUNCA delete de arquivo (exceto dist/, build/)
- NUNCA toque em .env*, drizzle/schema.ts, auth*, revenuecat.ts, capacitor.config.ts
- Secret exposto → PARE, registre bloqueio crítico em STATUS.md, abra PR só com o aviso
- Sem decisões de produto — em dúvida: bloqueio

## Estrutura de branches
- Branches do orchestrator: `routine-cultivo-YYYYMMDD-HHMM`
- PRs: título `routine: <N> itens automatizados <data>`
- Descrição do PR: lista cada item trabalhado (título + resultado)

## Formato dos itens em BACKLOG.md
```
### Título do item
- **Prioridade**: P1 / P2 / P3
- **Tipo**: fix / feat / chore / refactor
- **Critério de pronto**: descrição clara e verificável
- **Arquivos esperados**: lista de arquivos que serão tocados
- **Status**: Próximos | Em progresso [claude-orchestrator YYYY-MM-DD] | Concluído YYYY-MM-DD
```
