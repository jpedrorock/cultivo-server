# Backlog — App Cultivo

> Gerenciado pela routine background (claude-orchestrator).
> Formato de item: título, prioridade, critério de pronto, arquivos afetados.
> Flags: `[Confirmar antes]` = pular em background | `[Em progresso: <data> <agente>]`

---

## Próximos

### P2 — Média prioridade

#### Loading spinner no upload de foto
- **Critério**: botão de câmera em QuickLog, PlantHealthTab, PlantTrichomesTab e EditHealthLogDialog mostra spinner e desabilita o botão de submit enquanto o upload está em andamento; estado `isUploadingPhoto` controla o fluxo
- **Arquivos**: `client/src/components/PlantHealthTab.tsx`, `client/src/components/QuickLog.tsx`, `client/src/components/PlantTrichomesTab.tsx`, `client/src/components/EditHealthLogDialog.tsx`
- **Observação**: não toca schema; UI pura

#### Alertas — marcar individualmente como visto
- **Critério**: remover `markAllAsSeen` automático ao entrar na página de alertas; adicionar clique individual em cada alerta que chama `trpc.alerts.markAsSeen`; badge da navbar atualiza após marcar
- **Arquivos**: `client/src/pages/AlertHistory.tsx`, servidor tRPC de alertas
- **Observação**: verificar se procedure `markAsSeen` já existe no backend antes de criar

#### Substituir confirm() nativos por modais
- **Critério**: todos os `window.confirm()` e `window.prompt()` substituídos por componentes de modal (Dialog/AlertDialog do shadcn); lista: Strains.tsx (exclusão strain), Home.tsx (finalizar ciclo), PlantDetail.tsx (transplantar, colher, descartar), PlantsList.tsx (ações em massa)
- **Arquivos**: `client/src/pages/Strains.tsx`, `client/src/pages/Home.tsx`, `client/src/pages/PlantDetail.tsx`, `client/src/pages/PlantsList.tsx`
- **Observação**: implementar um arquivo de cada vez; não alterar lógica de negócio

### P3 — Baixa prioridade / Manutenção

#### Bug — layout mobile no Help (Guia do Usuário)
- **Critério**: corrigir alinhamento de ícone e título nos cards do Help em mobile; corrigir abas (Tricomas, LST, Observações, Histórico) cortadas/sem espaçamento no mobile
- **Arquivos**: `client/src/pages/Help.tsx`, `client/src/components/PlantDetail.tsx` (tabs)
- **Observação**: testar em viewport 390px (iPhone 15)

---

## Em progresso

*(vazio)*

---

## Concluídos recentemente

- **Épico Cultivo Orgânico** — Fases 1–4: solo vivo, manutenção, biblioteca de tarefas (2026-06-04/05)
- **Pricing 4-tier** — Free/Starter/Cloud/Pro em usePlan.ts + UI (2026-06-03/05)
- **Onboarding redesign** — wizard imersivo 1-pergunta-por-tela (2026-06-03)
- **Testes orgânicos** — 16 testes unitários organicTaskLibrary + isSoilBasedMethod (2026-06-05)
- **Bump deps** — date-fns 4.4, react-hook-form 7.77, Capacitor 8.4, React 19.2.7 (2026-06-05)

---

## Itens descartados / não automatizar

- Qualquer item que requer teste em dispositivo físico (iPhone)
- Itens que tocam drizzle/schema, auth*, revenuecat.ts, capacitor.config.ts
- P0 (produção quebrada) — sempre confirmar com João primeiro
