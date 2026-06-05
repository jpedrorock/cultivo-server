# STATUS — App Cultivo

> Gerado por: claude-orchestrator (modo background / headless)
> Data: 2026-06-02
> Branch: routine-cultivo-20260602-1200

---

## ⚠️ BLOQUEIO CRÍTICO — Rotina não pôde executar

### Problema

A rotina agendada (`claude-orchestrator`) foi disparada mas **todos os arquivos de planejamento estão ausentes** do repositório. Sem esses arquivos, não é possível saber:

- Quais itens estão no backlog (BACKLOG.md)
- Quais são as regras do projeto e setup (CLAUDE.md)
- Como o orchestrator deve se comportar em modo headless (PLAYBOOK.md)
- Quais notas de UI compartilhadas existem (UI-SHARED-NOTES.md)

### Arquivos faltando

| Arquivo | Repositório buscado | Resultado |
|---------|--------------------|-----------| 
| `CLAUDE.md` | `cultivo-server` (raiz) | ❌ Não encontrado |
| `STATUS.md` | `cultivo-server` (raiz) | ❌ Não encontrado (este arquivo é o primeiro) |
| `BACKLOG.md` | `cultivo-server` (raiz) | ❌ Não encontrado |
| `PLAYBOOK.md` | `cultivo-server` (raiz) | ❌ Não encontrado |
| `UI-SHARED-NOTES.md` | `cultivo-server` (raiz) | ❌ Não encontrado |

### Onde também foi buscado

- Google Drive: pasta "Roteiro Claude" (encontrada, mas contém apenas roteiro de documentário — não relacionado ao projeto)
- Google Drive: busca por `title contains 'BACKLOG'`, `PLAYBOOK`, `CLAUDE`, `STATUS`, `UI-SHARED` — nenhum resultado relevante
- `cultivo-server/docs/internal/` — contém `todo.md` (207KB), `business-plan-scenarios.md`, `esp32-plants-menu-spec.md`, `help-screenshots-needed.md`
- `cultivo-site/HANDOFF.md` — encontrado e lido, mas não contém backlog nem playbook

### O que a rotina encontrou

**Contexto do projeto** (pelo HANDOFF.md do cultivo-site e commits recentes):
- App de gestão de cultivo indoor com IoT (Tuya/SmartLife + ESP32)
- Stack: TypeScript, tRPC, Drizzle ORM, React, Capacitor (iOS/Android)
- 145-146 testes passando
- Último commit (2026-06-01): hero module no detalhe da estufa + formatação mono
- Projeto ativo com múltiplos branches `claude/` (30+ branches de features anteriores)

**Branches existentes** (amostra):
- `routine-cultivo-20260602-0000` — branch de rotina anterior (já existe, indica rotinas anteriores)
- `claude/automation-toggle`, `claude/device-pairing-flow`, `claude/split-cycles`, etc.

### Ação tomada

1. ✅ Criada branch `routine-cultivo-20260602-1200`
2. ✅ Criado este arquivo STATUS.md documentando o bloqueio
3. ⏳ PR aberto para notificação (João precisa criar os arquivos de planejamento)

---

## O que João precisa fazer

Para que a rotina funcione nas próximas execuções, criar os seguintes arquivos na raiz do `cultivo-server`:

### 1. `CLAUDE.md` — Setup e regras do projeto
Deve conter:
- Comandos de setup local
- Stack técnica
- Regras de código (o que pode/não pode tocar)
- Como rodar testes/lint/check

### 2. `BACKLOG.md` — Fila de trabalho da rotina
Deve conter seções:
- **Próximos** — itens prontos pra automação (com critério de pronto claro)
- **Em progresso** — itens sendo trabalhados
- **Bloqueados** — itens pausados
- **Concluídos recentemente** — últimos itens finalizados

### 3. `PLAYBOOK.md` — Comportamento do orchestrator
Deve conter:
- Regras de segurança
- Seção "Modo headless / background"
- Definição de P0/P1/P2
- Critérios de skip

### 4. `UI-SHARED-NOTES.md` — Notas compartilhadas de UI
Deve conter:
- Design tokens e padrões visuais
- Componentes que não podem ser modificados sem autorização
- Últimas decisões de UI/UX

---

## Referência: `docs/internal/todo.md`

Existe um `docs/internal/todo.md` (207KB) que pode ser a fonte do conteúdo do BACKLOG.md. João pode usar esse arquivo como base para criar o BACKLOG.md no formato esperado pela rotina.

---

## Próxima execução

Após criar os arquivos acima, a próxima rotina agendada poderá:
1. Ler o contexto completo
2. Escolher itens do backlog automaticamente
3. Implementar, testar e abrir PRs sem bloqueios
