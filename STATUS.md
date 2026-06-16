# STATUS — App Cultivo

> Arquivo de estado da rotina background do claude-orchestrator.
> Atualizado automaticamente a cada execução.

---

## Última execução: 2026-06-04

**Agente**: claude-orchestrator  
**Modo**: background / headless  
**Branch**: `routine-cultivo-20260604-init`  
**Resultado**: BLOQUEADO — infraestrutura de orquestração ausente

---

## Bloqueios desta execução

### BLOQUEIO 1 — Arquivos de orquestração não encontrados

| Arquivo | Status |
|---------|--------|
| `CLAUDE.md` | ❌ Não existe no repositório |
| `STATUS.md` | ❌ Criado agora (este arquivo) |
| `BACKLOG.md` | ❌ Não existe no repositório |
| `PLAYBOOK.md` | ❌ Não existe no repositório |
| `UI-SHARED-NOTES.md` | ❌ Não existe no repositório |

**Impacto**: Sem BACKLOG.md não há itens para processar. Sem PLAYBOOK.md as regras de segurança e modo headless não podem ser verificadas. A rotina foi abortada preventivamente.

**O que foi encontrado no repo**:
- `docs/internal/todo.md` — arquivo grande (207 KB) com possível backlog informal
- `CHANGES.md` — changelog existente
- `docs/internal/` — diretório com specs técnicas
- `cultivo-site/HANDOFF.md` — documento de coordenação do site (EN/PT, sprint 1-2 concluídos)

**Ação recomendada para João**:

Para ativar a rotina automática, crie os seguintes arquivos na raiz do repositório:

1. **`CLAUDE.md`** — Regras gerais do projeto (stack, convenções, contexto)
2. **`BACKLOG.md`** — Lista de itens com seções "Próximos", "Em progresso", "Concluídos recentemente"
3. **`PLAYBOOK.md`** — Regras do modo headless: o que pular, como registrar bloqueios, formato de commit
4. **`UI-SHARED-NOTES.md`** — Notas de UI compartilhadas entre agentes

Formato sugerido para itens no BACKLOG.md:

```markdown
## Próximos

### [P2] Título do item
- **Critério de pronto**: descrição clara e verificável
- **Arquivos tocados**: lista dos arquivos relevantes
- **Obs**: contexto adicional se necessário
```

---

## Execuções anteriores

_Nenhuma — esta é a primeira execução._

---

## Branches de rotina abertas

| Branch | Data | Status | PR |
|--------|------|--------|----|
| `routine-cultivo-20260604-init` | 2026-06-04 | Bloqueio: infra ausente | (este PR) |
