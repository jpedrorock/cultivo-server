# STATUS — Orquestração Claude

## Última execução: 2026-05-30 16:09 (routine background)

### Resumo
**BLOQUEIO CRÍTICO** — execução encerrada sem itens processados.

### Bloqueio #1 — Arquivos de orquestração ausentes

**Tipo:** Pré-condição não satisfeita  
**Impacto:** Nenhum item do backlog pôde ser processado  
**Status:** Aguardando ação do João

**Arquivos esperados, não encontrados em nenhum dos repositórios:**
- `CLAUDE.md` — guia do projeto (estrutura, stacks, convenções)
- `BACKLOG.md` — fila de tarefas "Próximos" que a rotina deve executar
- `PLAYBOOK.md` — protocolo completo de operação headless
- `UI-SHARED-NOTES.md` — notas compartilhadas de UI entre sessões
- `STATUS.md` — este arquivo (criado agora pela primeira vez)

**O que foi verificado:**
- Raiz de `cultivo-server` e `cultivo-site` (main branch)
- Diretório `.claude/` em cultivo-server
- Pasta `docs/internal/` e `docs/archive/`

**Ação necessária (João):**  
Criar os arquivos acima na raiz de `cultivo-server` (ou no path configurado na rotina agendada) antes da próxima execução. Sugestão de estrutura mínima para BACKLOG.md abaixo.

---

## Histórico de execuções

| Data | Branch | Itens | Bloqueios | Status |
|------|--------|-------|-----------|--------|
| 2026-05-30 | routine-cultivo-20260530-1609 | 0 | 1 (crítico) | Encerrado sem trabalho |
