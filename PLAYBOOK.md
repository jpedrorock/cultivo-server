# PLAYBOOK — App Cultivo Orchestrator

## Modo Headless / Background

João não está disponível. Nunca pause esperando resposta.
- Se houver dúvida ou bloqueio: registre em STATUS.md e passe para o próximo item.
- Máximo 3 bloqueios ou 5 itens por execução.
- Ao final: sempre atualizar STATUS.md + push + abrir PR.

## Fluxo de uma Execução

1. Ler: `CLAUDE.md`, `STATUS.md`, `BACKLOG.md`, `PLAYBOOK.md`, `UI-SHARED-NOTES.md` (últimas 5 entradas se existir)
2. Criar branch: `git checkout -b routine-cultivo-$(date +%Y%m%d-%H%M)`
3. Loop (máx 5 itens):
   - Pegar próximo item de "Próximos" no BACKLOG, de cima para baixo
   - Aplicar regras de SKIP (ver abaixo)
   - Mover para "Em progresso" com `[claude-orchestrator YYYY-MM-DD background]`
   - Implementar seguindo critério de pronto
   - Rodar: `pnpm check && pnpm lint && pnpm test`
   - Para P1: disparar subagente checker validando (critério atendido + sem regressão + testes cobrem)
   - Checker rejeitar 2x: registrar bloqueio em STATUS.md, pular
   - Sucesso: mover para "Concluídos recentemente", commit com formato abaixo
4. Quando parar: atualizar STATUS.md, push, abrir PR

## Formato de Commit
```
<tipo>: <descrição> (backlog: <título>) [routine]
```
Tipos: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`

## Regras de SKIP (pular sem implementar)

Pule o item se qualquer condição abaixo for verdadeira:
- Prioridade P0 (requer atenção imediata de João)
- Marcado como "Confirmar antes" ou "Decisão de produto"
- Critério de pronto ambíguo ou não claro
- Em progresso por outra instância Claude (marcado com `[claude-orchestrator ... background]`)
- Toca arquivo de UI listado em UI-SHARED-NOTES sem autorização explícita
- Toca qualquer arquivo protegido:
  - `drizzle/schema.ts`
  - `server/_core/auth*.ts`
  - `server/_core/appleAuthRoutes.ts`
  - `revenuecat.ts`
  - `capacitor.config.ts`
  - `.env*`
- Requer decisão de produto (preço, copy, estratégia)
- Critério depende de conteúdo externo (screenshots, depoimentos reais, etc.)

## Regras de Segurança (absolutas)

- **NUNCA** `git push --force`
- **NUNCA** merge automático em main
- **NUNCA** rodar `db:reset` ou `db:push` em ambiente de produção
- **NUNCA** tocar nos arquivos protegidos listados acima
- **NUNCA** deletar arquivos (exceto build artifacts em `dist/`, `build/`)
- Se descobrir secret exposto no código: PARAR tudo, abrir PR só com o aviso
- Sem decisões de produto autônomas

## Prioridades no BACKLOG

- **P0** — Emergência / segurança / bug crítico em produção → não automatable, alertar João
- **P1** — Feature importante com critério claro → implementar com checker
- **P2** — Melhoria significativa → implementar diretamente
- **P3** — Polimento / manutenção → implementar se sem risco

## Status de Item no BACKLOG

- `Próximos` — na fila, pronto para pegar
- `Em progresso [claude-orchestrator YYYY-MM-DD background]` — sendo trabalhado
- `Concluídos recentemente` — feito, com link do commit/PR
- `Bloqueados` — impedimento registrado, aguarda João

## Contexto Importante

- Comando de validação: `pnpm check && pnpm lint && pnpm test` (a partir da raiz do repo)
- Testes não sobem DB real — usam mocks (ver `server/_core/testSetup.ts`)
- Schema de DB é sagrado: qualquer alteração em `drizzle/schema.ts` requer João
- cultivo-site é repo separado — mudanças lá requerem sessão dedicada, não este orchestrator
