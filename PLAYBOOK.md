# PLAYBOOK — claude-orchestrator

> Regras de operação para execuções headless (background / agendadas).
> Editar com João antes de ativar o orchestrator em produção.

---

## Modo headless / background

- **Nunca pause** esperando resposta de João.
- Se bloqueado: registre em STATUS.md e siga pro próximo item.
- Ao bater 3 bloqueios consecutivos: pare, registre, abra PR de status.
- Máximo de 5 itens por execução.
- Nunca merge automático em `main`.

## Critérios de pulo (não tocar)

Pule o item se qualquer condição for verdadeira:

- Prioridade P0
- Marcado `[Confirmar antes]`
- Critério de pronto não claro
- Marcado `[Em progresso por: outra Claude]`
- Toca arquivo compartilhado (UI-SHARED-NOTES) sem autorização explícita
- Toca qualquer um destes arquivos: `drizzle/schema.ts`, `auth*`, `revenuecat.ts`, `capacitor.config.ts`

## Regras de segurança

- NUNCA `git push --force`
- NUNCA merge automático em `main`
- NUNCA `db:reset` ou `db:push` em produção
- NUNCA toque em `.env*`, `drizzle/schema.ts`, `auth*`, `revenuecat.ts`, `capacitor.config.ts`
- NUNCA delete arquivos (exceto build artifacts em `dist/`, `build/`)
- Se descobrir secret exposto: PARE, registre em STATUS.md, abra PR só com o aviso
- Sem decisões de produto. Em dúvida: bloqueio, próximo item.

## Pipeline por item

1. Pegue próximo de "Próximos" no BACKLOG (de cima pra baixo)
2. Mova pra "Em progresso" com `[claude-orchestrator YYYY-MM-DD background]`
3. Implemente seguindo critério de pronto
4. Rode: `cd cultivo-server && pnpm check && pnpm lint && pnpm test`
5. Para P1: dispare subagente checker validando: critério atendido, sem regressão, testes cobrem
6. Checker rejeitar 2x: registra bloqueio em STATUS, pula item
7. Sucesso: mova pra "Concluídos recentemente"
8. Commit: `<tipo>: <descrição> (backlog: <título>) [routine]`

## Tipos de commit

- `feat`: nova funcionalidade
- `fix`: correção de bug
- `refactor`: refatoração sem mudança de comportamento
- `test`: adição/correção de testes
- `chore`: manutenção, deps, config
- `docs`: documentação

## Formato do PR

Título: `routine: <N> itens automatizados <YYYY-MM-DD>`

Descrição:
```
## Itens processados
- [ ou ✅] Item 1 — critério: ...
- [ ou ✅] Item 2 — critério: ...

## Bloqueios
- Item X: motivo

## Checklist
- [ ] pnpm check passou
- [ ] pnpm lint passou  
- [ ] pnpm test passou
```

---

## Arquivos protegidos (nunca tocar em background)

```
.env*
drizzle/schema.ts
server/auth*.ts
shared/auth*.ts
client/src/lib/revenuecat.ts
capacitor.config.ts
```

## Arquivos compartilhados (requer autorização)

```
UI-SHARED-NOTES.md
client/src/components/ui/*  (shadcn — só via João)
shared/types.ts             (schema types — coordenar)
```
