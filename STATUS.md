# STATUS — claude-orchestrator

> Arquivo de estado da routine de automação. Atualizado a cada execução.

---

## Execução: 2026-06-12 21:02 UTC

**Branch**: `routine-cultivo-20260612-2102`
**Agente**: claude-orchestrator (background mode)
**Itens processados**: 0
**Itens com bloqueio**: 1 (crítico — pré-condição)

---

## 🔴 BLOQUEIO CRÍTICO — Arquivos de orquestração ausentes

**Condição**: A routine foi disparada conforme agendado, porém os arquivos de orquestração **não existem** no repositório:

| Arquivo           | Esperado em          | Status       |
|-------------------|----------------------|--------------|
| `CLAUDE.md`       | `/` (raiz do repo)   | ❌ Não existe |
| `STATUS.md`       | `/` (raiz do repo)   | ⚠️ Criado agora (este arquivo) |
| `BACKLOG.md`      | `/` (raiz do repo)   | ❌ Não existe |
| `PLAYBOOK.md`     | `/` (raiz do repo)   | ❌ Não existe |
| `UI-SHARED-NOTES.md` | `/` (raiz do repo) | ❌ Não existe |

**Impacto**: Sem `BACKLOG.md`, não há itens a processar. Sem `PLAYBOOK.md`, as regras de prioridade e segurança não podem ser confirmadas. A routine não pode avançar com segurança.

**Ação tomada**: Registrado bloqueio, criado este STATUS.md, PR aberto para visibilidade.

**Ação necessária (João)**: Criar os arquivos de orquestração faltantes (CLAUDE.md, BACKLOG.md, PLAYBOOK.md, UI-SHARED-NOTES.md) na raiz de `cultivo-server`. Sugestão de conteúdo mínimo:

- `CLAUDE.md` — descrição do projeto, stack, regras de código
- `BACKLOG.md` — lista de itens no formato "Próximos / Em progresso / Concluídos recentemente"
- `PLAYBOOK.md` — regras de operação headless, critérios de pulo, formato de commit
- `UI-SHARED-NOTES.md` — notas de componentes UI compartilhados entre agentes

---

## Histórico de execuções

| Data | Branch | Itens | Resultado |
|------|--------|-------|-----------|
| 2026-06-12 | routine-cultivo-20260612-2102 | 0 | Bloqueio: arquivos de orquestração ausentes |
