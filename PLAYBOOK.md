# PLAYBOOK.md — Regras de Modo Headless

> Regras operacionais para o claude-orchestrator em modo background.  
> João não está disponível — nunca pause esperando resposta.

---

## Fluxo da Rotina

1. **Leia** CLAUDE.md → STATUS.md → BACKLOG.md → PLAYBOOK.md → UI-SHARED-NOTES.md (últimas 5 entradas)
2. **Crie branch**: `git checkout -b routine-cultivo-$(date +%Y%m%d-%H%M)`
3. **Loop de trabalho** (MAX 5 itens por execução):
   - Pegue próximo item de "P1" ou "P2" no BACKLOG, de cima pra baixo
   - Aplique regras de SKIP (ver abaixo)
   - Mova pra "Em progresso" com `[claude-orchestrator YYYY-MM-DD background]`
   - Implemente seguindo critério de pronto
   - Rode: `pnpm check && pnpm lint && pnpm test`
   - P1: dispare subagente checker validando critério + sem regressão + testes
   - Checker rejeitar 2x: registra bloqueio em STATUS.md, pula item
   - Sucesso: mova pra "Concluídos recentemente", commit com mensagem `[routine]`
4. **Pare** ao bater 5 itens / 3 bloqueios / fila vazia
5. **Atualize** STATUS.md com resumo
6. **Push** da branch
7. **Abra PR** com título `routine: <N> itens automatizados <data>`
8. **Notifique** João via PushNotification

---

## Regras de SKIP (pular item sem registrar bloqueio)

- **P0**: nunca automatizar
- **[Confirmar antes]**: pular, registrar como "aguardando aprovação"
- Critério de pronto ausente ou ambíguo
- Item "em-progresso" por outra Claude (checar STATUS.md)
- Toca arquivo proibido (ver CLAUDE.md)
- Toca `drizzle/schema.ts` ou qualquer schema
- Toca `auth*`, `revenuecat*`, `capacitor.config*`, `.env*`
- Decisão de produto necessária → bloqueio

---

## Regras de Segurança (NUNCA pular)

- ❌ `git push --force` — proibido em qualquer branch
- ❌ Merge automático em `main`
- ❌ `db:reset` ou `db:push` em produção
- ❌ Tocar em `.env*`, `drizzle/schema.ts`, `auth*`, `revenuecat.ts`, `capacitor.config.ts`
- ❌ Deletar arquivos (exceto `dist/`, `build/`)
- ❌ Decisões de produto sem aprovação
- 🚨 Secret exposto: PARE tudo, registre, abra PR só com aviso

---

## Comunicação

- **João offline**: nunca pausar — registrar bloqueio em STATUS.md e seguir
- **3 bloqueios seguidos**: parar execução, notificar João
- **Fila vazia**: silêncio (sem notificação)
- **Trabalho concluído**: notificar João via PushNotification com resumo
- **Bloqueio crítico** (ex.: arquivos faltando): notificar imediatamente

---

## Formato do STATUS.md

```markdown
# STATUS — claude-orchestrator

## Última execução
**Data**: YYYY-MM-DD  
**Branch**: routine-cultivo-YYYYMMDD-HHMM  
**Modo**: background / headless  
**Agente**: claude-orchestrator

## Itens desta execução
| Item | Status | Notas |
|------|--------|-------|
| [P1] Título | ✅ Concluído | commit abc123 |
| [P2] Outro | ❌ Bloqueio | motivo |

## Bloqueios
[lista de bloqueios com contexto]

## Próximo passo sugerido
[ação necessária de João]
```
