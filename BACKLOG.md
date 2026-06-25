# Backlog — App Cultivo

> Gerenciado pelo orchestrator Claude. Fonte original: `docs/internal/todo.md`.
> Última sincronização: 2026-06-12 (extraído de entradas até 28/02/2026).

---

## Em progresso

_(nenhum item em progresso)_

---

## ⚠️ Nota de sincronização (2026-06-12)

O backlog foi extraído de `docs/internal/todo.md` (última entrada: 28/02/2026). Na primeira execução do orchestrator (2026-06-12), verificou-se que os primeiros 4 itens já estavam implementados. **João deve adicionar novos itens ao backlog manualmente ou sincronizar com o estado atual do código.**

---

## Próximos

### P2 — Loading Indicator no Upload de Foto
**Origem:** docs/internal/todo.md — "Loading Indicator no Upload de Foto (28/02/2026)"
**Critério de pronto:**
- [ ] Estado `isUploadingPhoto` adicionado em `QuickLog.tsx` — spinner no botão de câmera enquanto upload ocorre
- [ ] Estado `isUploadingPhoto` adicionado em `PlantHealthTab.tsx` — spinner no botão de câmera
- [ ] Estado `isUploadingPhoto` adicionado em `PlantTrichomesTab.tsx` — spinner no botão de câmera
- [ ] Estado `isUploadingPhoto` adicionado em `EditHealthLogDialog.tsx` — spinner no botão de câmera
- [ ] Botão de submit desabilitado enquanto upload está em andamento em todos os componentes acima
- [ ] `pnpm check` passa sem erros
**Arquivos prováveis:** `client/src/pages/QuickLog.tsx`, `client/src/components/PlantHealthTab.tsx`, `client/src/components/PlantTrichomesTab.tsx`, `client/src/components/EditHealthLogDialog.tsx`
**Não toca:** schema, auth, revenuecat, capacitor.config

---

### P2 — Alertas: Marcar como Visto ao Clicar (individual)
**Origem:** docs/internal/todo.md — "Alertas - Marcar como Visto ao Clicar"
**Critério de pronto:**
- [ ] `markAllAsSeen` automático ao entrar na página de alertas removido (ou já estava removido conforme commits recentes — verificar)
- [ ] Clique individual em cada alerta chama `trpc.alerts.markAsSeen` pelo ID
- [ ] Feedback visual: badge muda de "Novo" para "Visto" com animação
- [ ] Badge da navbar atualiza após marcar alerta individual
- [ ] `pnpm check` passa sem erros
**Arquivos prováveis:** `client/src/pages/Alerts.tsx`
**Não toca:** schema, auth, revenuecat, capacitor.config

---

### P2 — Bug Design Mobile: Guia do Usuário e abas PlantDetail
**Origem:** docs/internal/todo.md — "Bug - Design Mobile (28/02/2026)"
**Critério de pronto:**
- [ ] Cards do Guia do Usuário (`Help.tsx`): ícone e título alinhados horizontalmente no mobile
- [ ] Menu de ações da planta não sobrepõe conteúdo no mobile
- [ ] Abas (Tricomas, LST, Observações, Histórico) em `PlantDetail.tsx` não cortadas/sem espaçamento no mobile
- [ ] `pnpm check` passa sem erros
**Arquivos prováveis:** `client/src/pages/Help.tsx`, `client/src/pages/PlantDetail.tsx`
**Não toca:** schema, auth, revenuecat, capacitor.config

---

### P2 — Substituição de prompt()/confirm() nativos em PlantDetail e PlantsList
**Origem:** docs/internal/todo.md — entradas de substituição de dialogs nativos
**Critério de pronto:**
- [ ] `PlantDetail.tsx`: prompt() de descarte substituído por modal com campo de texto
- [ ] `PlantsList.tsx`: confirm() de ações em massa (promover, colher, descartar) substituído por modais
- [ ] `pnpm check` passa sem erros
**Arquivos prováveis:** `client/src/pages/PlantDetail.tsx`, `client/src/pages/PlantsList.tsx`
**Confirmar antes:** NÃO — critério claro
**Não toca:** schema, auth, revenuecat, capacitor.config

---

### P3 — Implementar loading states em botões durante operações assíncronas
**Origem:** docs/internal/todo.md — "Melhorias Prioritárias da Auditoria (20/02/2026)"
**Critério de pronto:**
- [ ] Botões de ação primária nas principais páginas mostram spinner/disabled durante mutations tRPC
- [ ] `pnpm check` passa sem erros
**Nota:** Escopo amplo — limitar a 3-4 páginas de maior uso (Home, PlantDetail, TentDetails)
**Não toca:** schema, auth, revenuecat, capacitor.config

---

### P3 — Traduzir "Maintenance" e outros termos em inglês na UI
**Origem:** docs/internal/todo.md — "Traduzir 'Maintenance' e verificar possíveis erros de tradução"
**Critério de pronto:**
- [ ] Busca por strings em inglês visíveis ao usuário (`Maintenance`, `Cloning`, `Flora`, `Vega`, etc.) no `client/`
- [ ] Substituição por equivalentes em português (`Manutenção`, `Clonagem`, `Flora`, `Veg`, etc.)
- [ ] `pnpm check` passa sem erros

---

### P3 — Adicionar cor roxa nos tricomas
**Origem:** docs/internal/todo.md — "Adicionar cor roxa faltando em tricomas"
**Critério de pronto:**
- [ ] Opção de cor roxa adicionada ao seletor de status de tricomas
- [ ] `pnpm check` passa sem erros
**Arquivos prováveis:** `client/src/components/PlantTrichomesTab.tsx`

---

## Bloqueados

_(nenhum item bloqueado)_

---

## Concluídos recentemente

_(nenhum item concluído por este orchestrator ainda)_

---

## P0 — Requer confirmação de João (não automatizar)

- Refatoração de estufas dinâmicas (schema change: remover enum tentType)
- Sistema de alertas com margens automáticas por fase (schema change: tabela phaseAlertMargins)
- Consolidação de Seeds (alto risco: DROP/TRUNCATE de dados reais)
- Sistema de Receitas de Nutrientes (feature nova grande)
- Backend de preferências de alertas (schema change)
- Histórico de rega (funcionalidade incompleta — precisa mais contexto)
