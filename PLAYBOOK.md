# Playbook — Modo Background / Headless

## Princípios

1. **Não bloquear esperando João** — se há dúvida, registra em STATUS.md e passa pro próximo.
2. **Segurança primeiro** — nunca tocar zonas de risco (ver CLAUDE.md).
3. **Commits atômicos** — 1 item por commit, mensagem clara com `[routine]`.
4. **PR sempre** — nunca push direto em main.
5. **Sem decisões de produto** — qualquer coisa que muda UX/pricing/modelo vai pra bloqueio.

## Critérios de Skip (PULE sem tentar)

Pule o item se qualquer um se aplica:
- Prioridade P0 (emergência, requer atenção imediata)
- Marcado "Confirmar antes"
- Critério de pronto ambíguo ou ausente
- Em progresso por outro agente (ver BACKLOG.md seção "Em Progresso")
- Toca `drizzle/schema.ts`
- Toca `auth*`, `server/_core/auth.ts`, `server/_core/authRoutes.ts`, `server/_core/appleAuthRoutes.ts`
- Toca `revenuecat.ts`
- Toca `capacitor.config.ts`
- Toca `UI-SHARED-NOTES.md` sem lock explícito
- Toca qualquer `.env*`

## Loop de Trabalho (MAX 5 itens por run)

```
contador_bloqueios = 0

para cada item na seção "Próximos" do BACKLOG (de cima pra baixo):
  se deve_pular(item):
    próximo item
    continue
  
  mover pra "Em progresso" com [claude-orchestrator YYYY-MM-DD background]
  
  implementar(item)
  
  se ambiente_local_disponível:
    rodar: pnpm check && pnpm lint && pnpm test
    se falhou:
      registrar bloqueio em STATUS.md
      mover item de volta pra "Próximos"
      contador_bloqueios++
      se contador_bloqueios >= 3: parar
      continue
  else:
    registrar em STATUS.md: "validação local não disponível — revisão manual do diff"
  
  se item.prioridade == P1:
    checker = subagente validando critério + sem regressão + cobertura de teste
    se checker.rejeitou 2x:
      registrar bloqueio, pular
      contador_bloqueios++
      continue
  
  commit: "<tipo>: <descrição> (backlog: <título do item>) [routine]"
  mover pra "Concluídos recentemente"
```

## Tipos de Commit

| Prefixo | Quando usar |
|---------|-------------|
| `feat:` | Nova funcionalidade |
| `fix:` | Correção de bug |
| `test:` | Testes novos ou melhorados |
| `docs:` | Documentação |
| `refactor:` | Refatoração sem mudança de behavior |
| `chore:` | Manutenção, config, infra |

## Regras de Segurança (não pular)

- **NUNCA** `git push --force`
- **NUNCA** merge automático em main
- **NUNCA** rodar `db:reset` ou `db:push` em produção
- **NUNCA** tocar `.env*`, `drizzle/schema.ts`, `auth*`, `revenuecat.ts`, `capacitor.config.ts`
- **NUNCA** deletar arquivo (exceto `dist/`, `build/`)
- **NUNCA** expor secrets — se descobrir secret exposto: PARAR, registrar em STATUS.md, abrir PR SOMENTE com aviso
- **NUNCA** tomar decisão de produto (preço, feature scope, UX importante)

## Template de PR

**Título**: `routine: <N> itens automatizados <YYYY-MM-DD>`

**Body**:
```
## Itens desta run

- ✅ [P2] título do item — descrição do que foi feito
- ⛔ [P2] título bloqueado — motivo do bloqueio

## Validação
- [ ] pnpm check (TypeScript)
- [ ] pnpm lint
- [ ] pnpm test

## Notas
<observações relevantes>
```

## Registro de Bloqueio em STATUS.md

Formato:
```
### Bloqueio: <título do item> — <YYYY-MM-DD>
**Motivo**: <descrição clara do problema>
**Tentativas**: <N>
**Ação**: item devolvido pra fila / aguarda João
```

## Ambiente de Execução

Esta rotina roda em ambiente remoto (Claude Code na web), sem acesso a terminal local. Portanto:
- Não é possível rodar `pnpm check`, `pnpm lint`, `pnpm test` diretamente
- Validação é feita via análise estática do código + revisão manual do diff
- Registrar esta limitação em STATUS.md quando relevante
- TypeScript errors óbvios devem ser evitados via código cuidadoso
