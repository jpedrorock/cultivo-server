# STATUS — claude-orchestrator background routine

## Última execução

- **Data:** 2026-05-29
- **Branch:** routine-cultivo-20260529-2110
- **Modo:** background / headless (João indisponível)
- **Resultado:** ⛔ BLOQUEADO — infraestrutura da rotina não configurada

---

## Bloqueios

### 🔴 BLOQUEIO #1 — Arquivos de infraestrutura ausentes (FATAL)

Os arquivos necessários para a rotina automática **não existem** no repositório e nunca existiram no histórico git:

| Arquivo | Status |
|---------|--------|
| `CLAUDE.md` | ❌ Não encontrado |
| `STATUS.md` | ❌ Criado agora (primeiro run) |
| `BACKLOG.md` | ❌ Não encontrado |
| `PLAYBOOK.md` | ❌ Não encontrado |
| `UI-SHARED-NOTES.md` | ❌ Não encontrado |

**Impacto:** Sem BACKLOG.md, não há itens a trabalhar. Sem PLAYBOOK.md, não há regras de segurança para seguir. Sem CLAUDE.md, não há contexto do projeto para a sessão de IA.

**Ação tomada:** Nenhum código modificado. Este STATUS.md foi criado para registrar o bloqueio.

---

## Itens processados

Nenhum. A rotina abortou no passo 1 (leitura dos arquivos de contexto).

---

## O que João precisa fazer para ativar a rotina

Para que a rotina automática funcione nas próximas execuções, crie os seguintes arquivos no repositório:

### 1. `CLAUDE.md`
Contexto do projeto para a IA: stack, convenções, arquitetura, como rodar testes.

### 2. `BACKLOG.md`
Lista de itens no formato esperado pelo PLAYBOOK, com seções:
- `## Próximos` — itens a fazer (em ordem de prioridade)
- `## Em progresso` — itens sendo trabalhados (com `[claude-orchestrator YYYY-MM-DD]`)
- `## Concluídos recentemente` — últimos itens finalizados
- `## Bloqueados` — itens com impedimento

Cada item deve ter: título, prioridade (P0/P1/P2), critério de pronto, e flags opcionais como `[Confirmar antes]`.

### 3. `PLAYBOOK.md`
Regras do projeto para a IA: o que pode e não pode tocar, como resolver conflitos, modo headless.

### 4. `UI-SHARED-NOTES.md`
Notas de coordenação de UI entre sessões de IA (para evitar conflitos em componentes compartilhados).

---

## Próxima execução

Com os arquivos acima no repo, a próxima rotina seguirá o fluxo completo: ler contexto → criar branch → loop de trabalho → commit → PR.

---

_Gerado por claude-orchestrator em 2026-05-29_
