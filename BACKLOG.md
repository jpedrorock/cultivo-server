# Backlog — App Cultivo

Derivado de `docs/internal/todo.md` (itens `[ ]` não concluídos) em 2026-06-11.
Itens que tocam schema/auth/revenuecat/capacitor são marcados como "Confirmar antes".

---

## Em progresso

_Nenhum no momento._

---

## Próximos

### P2 — Melhorias de UX da tabela de Histórico (tabela responsiva, feedback visual, hierarquia)
- **Arquivo**: `client/src/pages/HistoryTable.tsx`
- **Critério de pronto**: Revisar e melhorar hierarquia visual dos cards no mobile (já existente). Adicionar estado vazio mais claro. Sem erros TypeScript.
- **Restrições**: Não tocar schema.

### P2 — Alertas: marcar individualmente ao clicar (já parcialmente implementado?)
- **Arquivo**: `client/src/pages/Alerts.tsx` ou `AlertHistory.tsx`
- **Critério de pronto**: Clicar em alerta individual marca como visto. Badge atualiza. Feedback visual.
- **Restrições**: Verificar se já implementado antes de trabalhar.

### P2 — Loading indicator no upload de foto (QuickLog + EditHealthLogDialog)
- **Arquivo**: `client/src/pages/QuickLog.tsx`, `client/src/components/EditHealthLogDialog.tsx`
- **Critério de pronto**: Botão câmera mostra spinner durante upload. Submit desabilitado durante upload.
- **Restrições**: Verificar se já implementado antes de trabalhar.

### P3 — Melhorias de UX recomendadas: tabela responsiva, feedback visual, hierarquia (History)
- **Arquivo**: `client/src/pages/HistoryTable.tsx`  
- **Critério de pronto**: Cards mobile com hierarquia melhorada, loading states mais claros.

### P3 — Salvar preferências de alertas no backend (tRPC procedure)  
- **Confirmar antes**: toca schema alertPreferences
- **Critério de pronto**: procedure `alerts.savePreferences` + `alerts.getPreferences`; integrado com AlertSettings.tsx

### P3 — Sistema de alertas contextuais com margens por fase (phaseAlertMargins)
- **Confirmar antes**: toca schema (phaseAlertMargins table)

### P3 — Refatoração: estufas dinâmicas (remover tentType enum fixo)
- **Confirmar antes**: toca schema drizzle; alto impacto

### P3 — Tarefas para fase DRYING
- **Confirmar antes**: toca schema/seed/migrations

---

## Concluídos recentemente

### 2026-06-11 — Animação de colapso automático ao marcar tarefa concluída
- `client/src/pages/Tarefas.tsx`: `AnimatePresence` + `motion.div` do framer-motion
- Tarefa colapsa suavemente (250ms) quando marcada como concluída; restaura em caso de erro
- [claude-orchestrator 2026-06-11 background]

### 2026-06-11 — Inicialização de arquivos de controle
- Criados: CLAUDE.md, STATUS.md, BACKLOG.md, PLAYBOOK.md, UI-SHARED-NOTES.md
- [claude-orchestrator 2026-06-11 background]

---

## Bloqueios registrados

### 2026-06-11 — Melhorias de UX da tabela de Histórico (HistoryTable.tsx)
- Critério de pronto vago: "tabela responsiva, feedback visual, hierarquia" sem especificação
- Aguarda: refinamento do critério por João

### 2026-06-11 — AlertSettings UI para margens por fase
- Dependência bloqueada: schema `phaseAlertMargins` não criado (requer `db:push` manual)
- Aguarda: migração de schema + decisão de produto

### 2026-06-11 — Sistema de Receitas de Nutrientes
- Requisitos conflitantes no todo.md (redesenhar vs reverter Nutrients.tsx)
- Aguarda: definição de produto por João
