# STATUS — App Cultivo

> Atualizado automaticamente pelo claude-orchestrator em modo background.

---

## Última Execução de Rotina

**Data:** 2026-05-27  
**Branch:** `routine-cultivo-20260527-0000`  
**Executor:** claude-orchestrator (background, scheduled)  
**Itens processados:** 0  
**Bloqueios:** 1 (crítico — infraestrutura ausente)

### Resultado

**BLOQUEIO CRÍTICO — Infraestrutura da rotina não bootstrapada.**

Os arquivos de controle da rotina não existem no repositório:

| Arquivo | Status |
|---|---|
| `CLAUDE.md` | ❌ Ausente — **criado neste PR** com info básica |
| `STATUS.md` | ❌ Ausente — **criado neste PR** |
| `BACKLOG.md` | ❌ Ausente — **requer criação manual por João** |
| `PLAYBOOK.md` | ❌ Ausente — **requer criação manual por João** |
| `UI-SHARED-NOTES.md` | ❌ Ausente — **requer criação manual por João** |

O que existe no repositório que pode servir de base:
- `docs/internal/todo.md` — 363 itens pendentes (sem estrutura P0/P1/P2 nem seção "Próximos")
- `esp32-display/STATUS.md` — status do projeto ESP32 (separado, não é o STATUS da rotina principal)

Sem `BACKLOG.md` com seção "Próximos" e prioridades (P0/P1/P2), a fila da rotina está **vazia**. Loop encerrado conforme regra: fila acabou.

### O que precisa ser feito (João)

1. **Criar `BACKLOG.md`** — selecionar itens do `docs/internal/todo.md` e organizar em:
   - `## P0 — Crítico` (bugs em prod, bloqueio de usuários)
   - `## P1 — Alta prioridade` (features prontas pra implementar)
   - `## P2 — Nice to have`
   - `## Próximos` (5-10 itens que a rotina pode pegar)
   - `## Concluídos recentemente`

2. **Criar `PLAYBOOK.md`** — regras operacionais para o orchestrator:
   - Quais arquivos são "compartilhados" (UI-SHARED-NOTES)
   - Critério de pronto por tipo de item
   - Regras específicas do projeto além das genéricas

3. **Criar `UI-SHARED-NOTES.md`** — notas de UI compartilhadas entre sessões Claude:
   - Componentes em progresso
   - Decisões de design recentes
   - Conflitos conhecidos

4. **Fazer merge deste PR** — traz `CLAUDE.md` e este `STATUS.md` para main.

---

## Histórico de Execuções

| Data | Branch | Itens OK | Bloqueios | Notas |
|---|---|---|---|---|
| 2026-05-27 | `routine-cultivo-20260527-0000` | 0 | 1 | Bootstrap — infraestrutura ausente |
