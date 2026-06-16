# Playbook — Rotinas Autônomas (claude-orchestrator)

Este arquivo define as regras de execução para o modo headless/background.

---

## Modo headless / background

João **não está disponível**. A IA deve:

1. **Nunca pausar esperando resposta** — registrar bloqueio em STATUS.md e seguir pro próximo item.
2. **Nunca tomar decisões de produto** — só implementar o que está explicitamente descrito no BACKLOG.
3. **Sempre atualizar STATUS.md** ao final da sessão.
4. **Sempre abrir PR** ao final (nunca merge direto em main).

---

## Loop de trabalho (por sessão)

1. Ler: `CLAUDE.md`, `STATUS.md`, `BACKLOG.md`, `PLAYBOOK.md`, `UI-SHARED-NOTES.md`.
2. Criar branch: `git checkout -b routine-cultivo-$(date +%Y%m%d-%H%M)`.
3. Pegar próximo item de **Próximos** no BACKLOG (de cima pra baixo).
4. **Pular** se o item for:
   - P0 (crítico — aguarda João)
   - Marcado "Confirmar antes"
   - Critério de pronto ambíguo/ausente
   - Em progresso por outra Claude (`[em-progresso]`)
   - Toca arquivo protegido (ver CLAUDE.md → Regras)
5. Mover item para "Em progresso" com `[claude-orchestrator YYYY-MM-DD background]`.
6. Implementar seguindo o critério de pronto.
7. Rodar: `pnpm check && pnpm lint && pnpm test`.
8. Se P1: disparar subagente checker validando: critério atendido, sem regressão, testes cobrem.
   - Checker rejeitar 2x: registrar bloqueio em STATUS.md, pular item.
9. Sucesso: mover para "Concluídos recentemente", fazer commit:
   ```
   <tipo>: <descrição> (backlog: <título>) [routine]
   ```
10. Repetir — máx 5 itens por sessão. Parar ao bater 3 bloqueios consecutivos.

---

## Ao final da sessão

1. Atualizar `STATUS.md` com:
   - O que foi feito (itens + commits)
   - Bloqueios encontrados
   - Próximos itens sugeridos
2. Push da branch: `git push -u origin <branch>`.
3. Abrir PR com título: `routine: <N> itens automatizados <data>`.
4. Enviar PushNotification se houve trabalho real ou bloqueio crítico.
5. Silencioso se tudo OK e sem mudanças.

---

## Regras de segurança (não pular)

- NUNCA `git push --force`
- NUNCA merge automático em `main`
- NUNCA `db:reset`, `db:push` em produção
- NUNCA tocar em `.env*`, `drizzle/schema.ts`, `auth*`, `revenuecat.ts`, `capacitor.config.ts`
- NUNCA deletar arquivo (exceto `dist/`, `build/`)
- Se descobrir secret exposto: PARAR, registrar em STATUS.md, abrir PR só com aviso.

---

## Classificação de prioridade

| Classe | Significado |
|---|---|
| P0 | Bloqueador de produção — só João decide |
| P1 | Alta prioridade — implementar com checker |
| P2 | Média prioridade — implementar direto |
| P3 | Baixa prioridade / polish |

---

## Tipos de commit

| Tipo | Quando usar |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `refactor` | Refatoração sem mudança de comportamento |
| `test` | Adicionar/corrigir testes |
| `docs` | Documentação |
| `chore` | Tarefas de manutenção (deps, configs) |
| `style` | CSS/UI puro, sem lógica |
