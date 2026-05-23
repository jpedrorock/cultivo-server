# STATUS — Routine Background 2026-05-23

**Executado por:** claude-orchestrator (modo headless/background)
**Branch:** `routine-cultivo-20260523-0000`
**Data:** 2026-05-23

---

## Resultado desta execução

**BLOQUEIO TOTAL — 0 itens processados**

A rotina automática foi disparada mas não pôde executar nenhum item do backlog porque os **arquivos de contexto de orquestração estão ausentes** do repositório.

---

## Arquivos esperados (não encontrados)

| Arquivo | Esperado em | Finalidade |
|---|---|---|
| `CLAUDE.md` | raiz do repo | Contexto do projeto, instruções para Claude |
| `BACKLOG.md` | raiz do repo | Lista de itens de trabalho (Próximos / Em progresso / Concluídos) |
| `PLAYBOOK.md` | raiz do repo | Regras operacionais para o orchestrator |
| `UI-SHARED-NOTES.md` | raiz do repo | Notas compartilhadas de UI entre agentes |
| `STATUS.md` | raiz do repo | Arquivo de status entre execuções (este arquivo é o primeiro) |

O único `STATUS.md` existente no repositório está em `esp32-display/STATUS.md`, que é específico do projeto ESP32 e não contém backlog de trabalho.

---

## O que a rotina fez

1. Tentou ler CLAUDE.md → não encontrado
2. Tentou ler STATUS.md (raiz) → não encontrado
3. Tentou ler BACKLOG.md → não encontrado
4. Tentou ler PLAYBOOK.md → não encontrado
5. Tentou ler UI-SHARED-NOTES.md → não encontrado
6. Inspecionou estrutura do repositório (raiz, `.claude/`, `docs/`, `server/`, branches)
7. Registrou bloqueio → criou esta branch + PR para notificar João

---

## Ação necessária de João

Para que a rotina automática funcione nas próximas execuções, é necessário criar os arquivos de orquestração no repositório:

### `BACKLOG.md` (mínimo necessário)
```markdown
# Backlog

## Próximos
<!-- itens de trabalho aqui -->

## Em progresso
<!-- itens sendo trabalhados -->

## Concluídos recentemente
<!-- itens finalizados -->

## Bloqueados
<!-- itens com bloqueio registrado -->
```

### `CLAUDE.md`
Contexto do projeto: stack, convenções, arquivos protegidos, etc.

### `PLAYBOOK.md`
Regras operacionais para o orchestrator (prioridades, critérios de pulo, etc.).

### `UI-SHARED-NOTES.md`
Notas compartilhadas de UI para coordenação entre agentes.

---

## Estrutura atual do repositório (mapeada)

O repositório `cultivo-server` é um monorepo com:
- `server/` — backend Node.js/tRPC com SQLite/Drizzle
- `client/` — frontend React
- `shared/` — tipos compartilhados
- `esp32-display/` — firmware ESP32 (PlatformIO)
- `migrations/` — migrações do banco
- Stack: TypeScript, tRPC, Drizzle ORM, Vitest, Vite

Branches ativas de Claude: ~30 branches `claude/*` abertas (algumas podem precisar de review/merge/close).
