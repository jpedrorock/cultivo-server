# STATUS — Routine claude-orchestrator

## Última execução
**Data:** 2026-06-05  
**Branch:** `routine-cultivo-20260605-1608`  
**Executor:** claude-orchestrator (background, scheduled)  
**Itens concluídos:** 0  
**Bloqueios:** 1 (crítico)

---

## Bloqueio Crítico — Arquivos operacionais não encontrados

**Descrição:**  
A rotina background foi disparada mas não conseguiu iniciar o loop de trabalho porque os arquivos operacionais obrigatórios não existem em nenhum repositório nem no Google Drive.

**Arquivos buscados (não encontrados):**
- `CLAUDE.md` — contexto do projeto para a Claude
- `STATUS.md` — este arquivo, que foi criado agora do zero
- `BACKLOG.md` — lista de itens para o loop de trabalho
- `PLAYBOOK.md` — regras de execução da rotina
- `UI-SHARED-NOTES.md` — notas compartilhadas de UI

**Locais verificados:**
- GitHub `jpedrorock/cultivo-server` (raiz, `docs/`, `docs/internal/`, `.claude/`)
- GitHub `jpedrorock/cultivo-site` (raiz)
- Google Drive (busca por título e conteúdo)

**Impacto:**  
Sem BACKLOG.md, o loop de trabalho não tem itens para processar. A rotina encerrou com 0 itens executados.

---

## Ação necessária (João)

Para que a rotina automática funcione nas próximas execuções, os seguintes arquivos precisam ser criados na raiz de `cultivo-server`:

### 1. `CLAUDE.md`
Contexto do projeto para a Claude: stack, convenções, o que pode/não pode ser tocado automaticamente.

### 2. `BACKLOG.md`
Formato esperado pelo PLAYBOOK:
```markdown
## Próximos
- [ ] [P2] Título do item — Critério de pronto: ...
- [ ] [P1] Outro item — Critério: ...

## Em progresso
(itens em andamento aparecem aqui durante execução)

## Concluídos recentemente
(itens concluídos com data e commit)
```

### 3. `PLAYBOOK.md`
Regras e instruções para o claude-orchestrator em modo headless. Atualmente o conteúdo está apenas no system prompt desta sessão.

### 4. `UI-SHARED-NOTES.md`
Notas de UI compartilhadas entre sessões (últimas 5 entradas são lidas a cada rotina).

---

## Próximas execuções

Assim que os arquivos forem criados e commitados em `main`, a rotina conseguirá:
1. Ler o contexto do projeto
2. Puxar itens do BACKLOG
3. Implementar, rodar checks, commitar
4. Atualizar STATUS.md com progresso real
