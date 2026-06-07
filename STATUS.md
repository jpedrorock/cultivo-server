# Status — Rotina Background Claude

## 2026-06-07 (claude-orchestrator background — primeira execução bootstrap)

### Situação dos Arquivos de Controle
| Arquivo | Status |
|---|---|
| CLAUDE.md | ❌ Não existe (João deve criar) |
| STATUS.md | ✅ Criado agora (bootstrap) |
| BACKLOG.md | ✅ Criado agora (bootstrap) |
| PLAYBOOK.md | ❌ Não existe (João deve criar) |
| UI-SHARED-NOTES.md | ❌ Não existe (João deve criar) |

---

### Análise do Repositório
- **Backlog real**: `docs/internal/todo.md` (207KB, 3895 linhas)
- **Itens não concluídos (- [ ])**: 363 itens, mas muitos são planejamentos duplicados já implementados
- **Padrão detectado**: todo.md tem seções de planejamento (itens não marcados) seguidas de seções de execução (itens marcados como feitos), criando falsos positivos de pendências

---

### Itens Verificados como JÁ FEITOS (confirmados no código, pendentes no todo.md)

| Item | Arquivo | Evidência no código |
|---|---|---|
| Loading Indicator - QuickLog | `client/src/pages/QuickLog.tsx` | `uploadProgress` state + `<PhotoUploadProgress>` overlay |
| Loading Indicator - PlantHealthTab | `client/src/components/PlantHealthTab.tsx` | `uploadProgress` state + `<PhotoUploadProgress>` overlay |
| Loading Indicator - PlantTrichomesTab | `client/src/components/PlantTrichomesTab.tsx` | `isUploadingPhoto` state + `<Loader2>` spinner |
| Loading Indicator - EditHealthLogDialog | `client/src/components/EditHealthLogDialog.tsx` | `isUploading` state + `<Loader2>` spinner |

> ℹ️ Todos os 4 componentes já desabilitam o botão de submit enquanto o upload está em andamento.

---

### Ações desta Execução
- [x] Criado STATUS.md (este arquivo)
- [x] Criado BACKLOG.md com candidatos identificados
- [ ] docs/internal/todo.md: marcação de itens concluídos pendente (arquivo muito grande para edição segura via API)

### Bloqueios Registrados
1. **PLAYBOOK.md ausente**: regras do inline prompt usadas como fallback
2. **CLAUDE.md ausente**: contexto derivado do README.md
3. **UI-SHARED-NOTES.md ausente**: itens de UI não validados contra notas compartilhadas
4. **pnpm check/lint/test não executados**: ambiente remoto sem acesso local ao repositório
5. **todo.md 207KB**: arquivo muito grande para edição segura via GitHub API (risco de corrupção)

### Itens Processados nesta Execução
- Nenhum item de código implementado (execução bootstrap de infraestrutura)

---

### Ações Necessárias de João
1. Criar `PLAYBOOK.md` com regras de prioridade, critérios de pulo e convenções
2. Criar `CLAUDE.md` com contexto do projeto para o orquestrador
3. Criar `UI-SHARED-NOTES.md` para coordenação de UI entre sessões
4. Revisar `BACKLOG.md` criado aqui e adicionar/remover itens conforme necessário
5. Atualizar `docs/internal/todo.md` marcando os 4 itens de Loading Indicator como `[x]`
