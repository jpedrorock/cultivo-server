# STATUS — claude-orchestrator

> Arquivo mantido automaticamente pelo `claude-orchestrator` em modo background.
> Última execução: 2026-05-24

---

## Execução mais recente

**Branch:** `routine-cultivo-20260524-0001`  
**Data:** 2026-05-24  
**Resultado:** 🔴 BLOQUEIO CRÍTICO — rotina não pôde executar

### Bloqueio: arquivos de orquestração não encontrados

A rotina tenta ler os seguintes arquivos antes de qualquer trabalho:

| Arquivo | Encontrado? | Observação |
|---|---|---|
| `CLAUDE.md` | ❌ | Contexto do projeto / regras de arquitetura |
| `BACKLOG.md` | ❌ | Fila de trabalho — sem isso não há itens para processar |
| `PLAYBOOK.md` | ❌ | Regras operacionais do modo headless |
| `STATUS.md` | ❌ | Este arquivo foi criado agora como bootstrap |
| `UI-SHARED-NOTES.md` | ❌ | Notas de coordenação de UI |

Sem `BACKLOG.md` não há como saber o que trabalhar.  
Sem `PLAYBOOK.md` não há como seguir as regras do projeto.  
Sem `CLAUDE.md` não há contexto de arquitetura seguro para agir.

**Ação tomada:** nenhuma mudança de código foi feita. Este PR existe apenas para registrar o bloqueio.

---

## O que João precisa fazer

1. Criar `CLAUDE.md` na raiz do repo com:
   - Visão geral da arquitetura
   - Arquivos protegidos (drizzle/schema, auth, revenuecat, capacitor.config)
   - Convenções de código

2. Criar `BACKLOG.md` com estrutura:
   ```
   ## Próximos
   - [ ] (P1/P2) Título — Critério de pronto: ...

   ## Em progresso
   (vazio inicialmente)

   ## Concluídos recentemente
   (vazio inicialmente)
   ```

3. Criar `PLAYBOOK.md` com:
   - Regras do modo headless/background
   - Critérios de pulo (P0, Confirmar antes, arquivos proibidos, etc.)
   - Processo de checker para P1

4. Criar `UI-SHARED-NOTES.md` se houver notas de UI a compartilhar entre sessões.

5. Após criar esses arquivos, a próxima execução da rotina poderá trabalhar normalmente.

---

## Histórico de execuções

| Data | Branch | Itens | Resultado |
|---|---|---|---|
| 2026-05-24 | `routine-cultivo-20260524-0001` | 0 | Bloqueio: arquivos de orquestração ausentes |
