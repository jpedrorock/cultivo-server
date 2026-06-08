# PLAYBOOK.md — Regras do claude-orchestrator

> Documento de regras para execução autônoma da routine.
> Última atualização: 2026-06-08 (bootstrap)

---

## Modo headless / background

João não está disponível durante execuções automáticas. O orchestrator deve:

1. **Nunca pausar** esperando resposta humana
2. **Registrar bloqueios** em STATUS.md e passar pro próximo item
3. **Parar com elegância** após 5 itens, 3 bloqueios, ou fila vazia
4. **Abrir PR** com resumo do que foi feito (nunca merge automático em main)

---

## Roteiro de Execução

1. **Leia:** CLAUDE.md, STATUS.md, BACKLOG.md, PLAYBOOK.md, UI-SHARED-NOTES.md (últimas 5 entradas)
2. **Crie branch:** `git checkout -b routine-cultivo-$(date +%Y%m%d-%H%M)`
3. **Loop de trabalho** (MAX 5 itens por execução):
   - Pegue próximo item de `[Próximos]` no BACKLOG, de cima pra baixo
   - **PULE** se: P0, marcado "Confirmar antes", critério não claro, em-progresso por outra Claude, toca arquivo em UI-SHARED-NOTES sem autorização, toca drizzle/schema/auth/revenuecat/capacitor.config
   - Mova pra `[Em progresso]` com `[claude-orchestrator YYYY-MM-DD background]`
   - Implemente seguindo critério de pronto
   - Rode: `pnpm check && pnpm lint && pnpm test`
   - Para P1: dispara subagente checker validando critério atendido + sem regressão + testes cobrem
   - Checker rejeitar 2x → registra bloqueio em STATUS, pula item
   - Sucesso → mova pra `[Concluído]`, commit `"<tipo>: <desc> (backlog: <título>) [routine]"`
   - Próximo item OU pare ao bater 3 bloqueios
4. **Ao parar:** atualiza STATUS.md, push da branch, abre PR

---

## Regras de Segurança (não pular)

- **NUNCA** git push --force
- **NUNCA** merge automático em main
- **NUNCA** rode db:reset, db:push em produção (db:push em local OK)
- **NUNCA** toque em `.env*`, `drizzle/schema.ts`, `server/_core/auth*`, `server/pushService.ts`, `capacitor.config.ts`
- **NUNCA** delete arquivo (exceto build artifacts em `dist/`, `build/`)
- **SE** descobrir secret exposto: PARE, registre em STATUS.md, abra PR APENAS com o aviso
- **SEM** decisões de produto. Em dúvida → bloqueio, próximo item

---

## Critérios de Skip (qualquer um → pula)

| Condição | Ação |
|----------|------|
| Prioridade P0 | Skip silencioso |
| Marcado "Confirmar antes" | Registra bloqueio em STATUS |
| Critério de pronto ambíguo | Registra bloqueio em STATUS |
| Em progresso por outra Claude | Skip silencioso |
| Toca arquivo em UI-SHARED-NOTES (sem autorização) | Registra bloqueio em STATUS |
| Toca drizzle/schema/auth/revenuecat/capacitor.config | Skip silencioso |
| Requer dispositivo físico (iPhone, ESP32) | Skip silencioso |
| Requer `db:push` / migration | Skip silencioso |

---

## Checker Subagente (P1 apenas)

Para itens P1, após implementar:
1. Dispara subagente com: "Valide se critério `<X>` foi atendido, se há regressão nos testes, se os testes cobrem o caso novo."
2. Se checker rejeitar → tenta corrigir uma vez
3. Se rejeitar de novo → registra bloqueio em STATUS, pula

---

## Mensagem de Commit

Formato: `<tipo>: <descrição curta> (backlog: <título do item>) [routine]`

Tipos: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`

Exemplos:
- `feat: loading spinner no upload de foto (backlog: Loading indicator no upload de foto) [routine]`
- `fix: ações de fase no TentDetail (backlog: Ações de fase no TentDetail) [routine]`

---

## PR Template

Título: `routine: <N> itens automatizados <YYYY-MM-DD>`

Descrição:
```
## Resumo
- Item 1: <título> — <resultado>
- Item 2: <título> — <resultado>

## Bloqueios
- Item X: <motivo do bloqueio>

## Próximas execuções
- [ ] João revisa BACKLOG.md e adiciona/ajusta itens
```

---

## Arquivos Restritos (referência rápida)

```
.env*
drizzle/schema.ts
server/_core/auth*
server/db-auth.ts  
server/pushService.ts
capacitor.config.ts
esp32-display/**
```
