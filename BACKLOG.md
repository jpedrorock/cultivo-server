# BACKLOG.md — App Cultivo

> Itens aprovados para automação pelo claude-orchestrator.
> **João: revise e ajuste prioridades antes da próxima execução.**
> Todos os itens sem prioridade explícita são tratados como P2 pelo agente.

---

## Como funciona

- **P0**: Crítico, João executa pessoalmente. Orchestrator pula.
- **P1**: Importante, orchestrator implementa + dispara checker subagente pra validar.
- **P2**: Melhoria, orchestrator implementa sem checker.
- **"Confirmar antes"**: Orchestrator registra bloqueio e aguarda.

Etiquetas de estado: `[Próximos]`, `[Em progresso]`, `[Concluído]`, `[Bloqueado]`

---

## Próximos

<!-- 
  João: adicione itens aqui. Exemplos de itens seguros para automação:
  - UX/UI sem schema changes
  - Testes novos para código existente
  - Documentação
  - Refatorações pequenas (renomear, reorganizar, clareza)
  
  Candidatos do docs/internal/todo.md (DRAFT — precisa validação de João):
-->

### [P2] Loading indicator no upload de foto
**Critério de pronto:** botão de câmera mostra spinner enquanto upload está em andamento; botão de submit fica desabilitado durante upload; sem regressão nos fluxos de upload existentes.
**Arquivos:** `client/src/components/QuickLog.tsx`, `client/src/components/PlantHealthTab.tsx`, `client/src/components/PlantTrichomesTab.tsx`, `client/src/components/EditHealthLogDialog.tsx`
**Observação:** Puramente UI, sem mudança de schema ou backend. Verificar UI-SHARED-NOTES antes.
**Status:** `[Próximos]`

---

### [P2] Ações de fase no TentDetail (consistência com Home)
**Critério de pronto:** TentDetails.tsx exibe botões de ação contextual por fase (Tirar Clones, Avançar para Floração, etc.) com PhaseConfirmDialog, igual ao implementado em Home.tsx.
**Arquivos:** `client/src/components/TentDetails.tsx` (ou caminho equivalente)
**Observação:** Apenas UI. Ver UI-SHARED-NOTES antes de editar.
**Status:** `[Próximos]`

---

<!-- 
Candidatos de mais baixo risco (adicionar aqui quando João validar):

- Revisão de código não utilizado (identificar páginas/rotas sem acesso, procedures tRPC sem uso)
- Melhorias de responsividade mobile sem layout breaks
- Adicionar testes Vitest para código existente sem testes

NÃO adicionar:
- Qualquer item com "db:push", "migration", "schema"
- Itens tocando auth*, drizzle/schema.ts, revenuecat.ts, capacitor.config.ts
- Itens de ESP32 (requer hardware físico local)
- Itens marcados com "Testar em dispositivo real (iPhone)" como objetivo principal
-->

---

## Em Progresso

_Nenhum item em andamento._

---

## Bloqueados

_Ver STATUS.md para lista de bloqueios._

---

## Concluídos Recentemente

_Nenhum item concluído ainda. Histórico completo em `docs/internal/todo.md`._
