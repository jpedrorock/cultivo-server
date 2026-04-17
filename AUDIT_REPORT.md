# App Cultivo — Relatório de Auditoria Completa
**Data:** 2026-04-13  
**Auditor:** Claude QA Agent  
**Versão analisada:** branch main (commit 31f78c3)

---

## Resumo Executivo

| Severidade | Quantidade |
|---|---|
| 🔴 Crítico | 6 |
| 🟠 Alto | 11 |
| 🟡 Médio | 18 |
| 🟢 Baixo | 14 |
| 💡 Melhoria/Ideia | 31 |

---

## 🏠 Home / Painel Estufas

### Bugs

- **[🟡 Médio]** Ciclo sem `strainId` (ex: MAINTENANCE/DRYING) causa crash silencioso no cálculo de fase
  - **Arquivo:** `server/alertChecker.ts` linha 83
  - **Problema:** `alertChecker` executa `eq(weeklyTargets.strainId, cycle.strainId)` sem verificar se `cycle.strainId` é nulo. Ciclos de manutenção ou secagem podem não ter cepa associada.
  - **Reproduzir:** Configurar alertas em estufa com ciclo MAINTENANCE → registrar log → checagem dispara query com `strainId = null`.
  - **Fix sugerido:** Adicionar guard antes da linha 82: `if (!cycle.strainId) return;`

- **[🟢 Baixo]** Botão "Ciclo Perpétuo" no fluxo de HarvestQueue descreve a sequência de forma confusa
  - **Arquivo:** `client/src/pages/HarvestQueue.tsx` linhas 270–286
  - **Problema:** O texto mostra "Vega vira Secagem" quando o correto seria "Vega vira Flora → Flora vira Secagem". Pode confundir usuários novos.
  - **Reproduzir:** Abrir Harvest Queue com plantas na fila → ver card de fluxo.
  - **Fix sugerido:** Corrigir sequência para: Flora colhida → Aguardando Secagem → Secagem recebe plantas → Vega vira Flora.

### Melhorias

- Adicionar skeleton de carregamento nos cards de estufa — hoje o Home.tsx renderiza uma grade vazia até os dados chegarem.
- Mostrar o número de plantas ativas por estufa diretamente no card do painel, sem precisar entrar na estufa.
- Adicionar indicador visual (ícone colorido) da qualidade do último log (ex: verde se < 24h, amarelo se < 48h, vermelho se > 48h), como já existe no MorningCheck.

### Ideias

- Widget de resumo de alerta no topo da Home quando houver alertas novos.
- Atalho rápido para registrar log a partir do card de estufa (sem precisar entrar na estufa).

---

## 📊 Detalhes da Estufa (`TentDetails.tsx`)

### Bugs

- **[🟠 Alto]** Mudança de fase (Vega → Flora) não invalida queries dependentes imediatamente
  - **Arquivo:** `client/src/pages/TentDetails.tsx` (inferido pelo fluxo de `cycles.listActive`)
  - **Problema:** Após clicar em "Iniciar Floração", a query `cycles.getActiveCyclesWithProgress` é invalidada, mas a query `weeklyTargets.getByStrain` usada pelo AlertChecker ainda pode retornar dados da semana de Vega por até 1 ciclo de polling.
  - **Reproduzir:** Iniciar floração → registrar log imediatamente → alerta pode usar targets de Vega.
  - **Fix sugerido:** Após mudar de fase, invalide também `weeklyTargets.getByStrain` e `alerts.list`.

- **[🟡 Médio]** Campo de busca do filtro de estufas usa `tentName.includes(selectedTent)` comparando string com letra
  - **Arquivo:** `client/src/pages/Tasks.tsx` linha 74
  - **Problema:** O filtro compara `task.tentName.includes(selectedTent)` onde `selectedTent` é a letra `"A"`, `"B"` ou `"C"`. Se um nome de estufa contiver a letra em outra posição (ex: "Quarentena A2"), pode gerar falso positivo.
  - **Reproduzir:** Criar estufa com nome que contenha a letra "A" em posição inesperada → filtrar por Estufa A → tarefa aparece erroneamente.
  - **Fix sugerido:** Comparar o tentId em vez do nome, ou exigir correspondência com `tentName === selectedTent` ou `tentName.startsWith("Estufa " + selectedTent)`.

### Melhorias

- Exibir data de início do ciclo atual na tela de detalhes da estufa.
- Mostrar semana corrente do ciclo (ex: "Semana 3 de Vega") no header da estufa.

### Ideias

- Botão de "Anotar problema" rápido diretamente na tela de detalhes da estufa.

---

## ✏️ Quick Log

### Bugs

- **[🟠 Alto]** Sem validação de intervalo de valores ao salvar log
  - **Arquivo:** `client/src/pages/QuickLog.tsx` (inferido pelo schema)
  - **Problema:** O formulário aceita temperatura de -999 ou pH de 20 sem bloquear. O schema usa `numeric` mas sem constraints de range no client. Um valor errado dispara alertas falsos.
  - **Reproduzir:** Digitar temp=99 → salvar → alerta de temperatura disparado.
  - **Fix sugerido:** Adicionar validação client-side: `temp: 10–50°C`, `rh: 0–100%`, `pH: 0–14`, `EC: 0–10`.

- **[🟢 Baixo]** Ao registrar log via modo `?mode=status`, o campo `turn` (AM/PM) não é pré-preenchido com base no horário atual
  - **Arquivo:** `client/src/pages/QuickLog.tsx`
  - **Problema:** O usuário deve selecionar manualmente AM ou PM, mesmo que o horário do dispositivo indique claramente qual turno é.
  - **Fix sugerido:** Pré-selecionar `turn` com base em `new Date().getHours() < 12 ? "AM" : "PM"`.

### Melhorias

- Mostrar os últimos valores registrados (da query) como placeholder nos campos, para facilitar comparação.
- Após salvar com sucesso, oferecer opção "Registrar outra estufa" sem precisar voltar ao menu.

### Ideias

- Suporte a salvamento offline via IndexedDB quando sem conexão, sincronizando ao reconectar.

---

## 🌱 Lista de Plantas (`PlantsList.tsx`)

### Bugs

- **[🟡 Médio]** Filtro de busca não debounced — dispara re-render a cada tecla
  - **Arquivo:** `client/src/pages/PlantsList.tsx`
  - **Problema:** O input de busca filtra diretamente no estado sem debounce, causando re-renders excessivos em listas grandes.
  - **Fix sugerido:** Usar `useDeferredValue` do React ou `setTimeout` de 200ms antes de aplicar filtro.

- **[🟢 Baixo]** Planta sem strain exibe campo de cepa em branco sem indicação visual
  - **Arquivo:** `client/src/pages/PlantsList.tsx`
  - **Problema:** Se `plant.strain` for null, o campo simplesmente não aparece — não há "Sem cepa" ou placeholder.
  - **Fix sugerido:** Exibir `"—"` ou `"Cepa não definida"` quando `plant.strain` é null/undefined.

### Melhorias

- Adicionar ordenação por nome, fase, idade ou status de saúde.
- Exibir badge de saúde (cor) diretamente na lista de plantas.

### Ideias

- Modo de visualização em grade (foto + nome) alternativo à lista.
- Exportar lista de plantas como CSV.

---

## 🌿 Detalhe da Planta

### Aba Saúde (`PlantHealthTab.tsx`)

#### Bugs

- **[🟠 Alto]** Foto enviada ao S3 mas formulário salvo sem foto se o usuário submeter antes do upload terminar
  - **Arquivo:** `client/src/components/PlantHealthTab.tsx` linhas 212–227
  - **Problema:** O botão "Salvar" (`handleSubmit`) aceita submissão enquanto `uploadStatus === "uploading"`, usando `photoUploadedUrl = null`. O registro é criado sem a foto mesmo que o usuário tenha selecionado uma.
  - **Reproduzir:** Selecionar foto grande → clicar "Salvar" rapidamente antes do upload terminar → log salvo sem foto.
  - **Fix sugerido:** Desabilitar o botão de submit enquanto `uploadStatus === "uploading"` ou `uploadProgress.isUploading === true`.

- **[🟡 Médio]** Estado `healthStatus` inicializado como `"HEALTHY"` e nunca sincronizado com o último log real da planta
  - **Arquivo:** `client/src/components/PlantHealthTab.tsx` linha 76
  - **Problema:** Ao abrir a aba, o seletor de status sempre começa em "Saudável", ignorando o último status registrado.
  - **Fix sugerido:** Ao carregar `healthLogs`, setar `setHealthStatus(healthLogs[0]?.healthStatus ?? "HEALTHY")` no `useEffect`.

#### Melhorias

- Exibir histórico de saúde em linha do tempo visual, não só lista de cards.
- Permitir editar sintomas/tratamento diretamente no card de histórico sem abrir modal.

---

### Aba Fotos (`PlantPhotosTab.tsx`)

#### Bugs

- **[🟡 Médio]** Upload de foto em PlantPhotosTab envia base64 inteiro via tRPC mutation — não usa `/api/upload/image`
  - **Arquivo:** `client/src/components/PlantPhotosTab.tsx` linhas 84–88
  - **Problema:** `PlantPhotosTab` usa `uploadMutation.mutate({ plantId, photoBase64: reader.result })` enviando o arquivo inteiro encodado em base64 pela rota tRPC, sem compressão prévia. Em contraste, `PlantHealthTab` usa `uploadImage()` com compressão via sharp no servidor. Fotos grandes (>5 MB) podem travar a requisição tRPC por timeout.
  - **Reproduzir:** Tirar foto de 8 MB no iOS → tentar subir na aba Fotos → timeout ou erro de payload.
  - **Fix sugerido:** Unificar os dois fluxos usando `uploadImage()` em `PlantPhotosTab`, obtendo a URL e depois chamando a mutation só com a URL.

- **[🟢 Baixo]** Limite de upload é 10 MB na aba Fotos mas 20 MB na aba Saúde — inconsistência
  - **Arquivo:** `PlantPhotosTab.tsx` linha 81 vs `PlantHealthTab.tsx` linha 170
  - **Fix sugerido:** Definir uma constante global `MAX_PHOTO_SIZE_MB = 20` e usar em ambos os lugares.

#### Melhorias

- Permitir múltiplos uploads de uma vez (seleção múltipla).
- Exibir a data e peso original/comprimido da foto ao passar o mouse.

---

### Aba Observações (`PlantObservationsTab.tsx`)

#### Bugs

- **[🟡 Médio]** Não existe opção de editar ou excluir uma observação já registrada
  - **Arquivo:** `client/src/components/PlantObservationsTab.tsx` linhas 56–80
  - **Problema:** O componente renderiza observações somente leitura. Um texto digitado errado fica permanente.
  - **Fix sugerido:** Adicionar botão de editar/excluir por observação, chamando `trpc.plantObservations.update` e `trpc.plantObservations.delete` (verificar se rotas existem no servidor).

#### Melhorias

- Adicionar campo de data editável ao criar observação (hoje usa `observationDate` automático do servidor).

---

### Aba LST / CannaPrune — BUG REPORTADO: clicar em nó não mostra nada

#### Bugs

- **[🔴 Crítico]** Clicar em um nó no mapa de planta (PlantNodeMap / CannaPruneCanvas) não exibe informações do nó
  - **Arquivo:** `client/src/components/PlantNodeMap.tsx` e `client/src/components/CannaPruneCanvas.tsx`
  - **Problema:** O handler de clique em nó (`onNodeClick` / `handleCanvasClick`) seleciona o nó no estado interno mas o painel lateral ou modal de detalhes nunca é exibido. A lógica de `selectedNode` existe em `plantGraph.ts` mas a UI que deveria renderizar o conteúdo do nó selecionado não está conectada ao estado. O bug foi confirmado pelo próprio usuário.
  - **Reproduzir:** Abrir Detalhe da Planta → Aba LST → clicar em qualquer nó do canvas → nada acontece.
  - **Fix sugerido:** Em `PlantLSTTab.tsx` ou `PlantTrainingPage.tsx`, verificar se o estado `selectedNode` retornado pelo canvas está sendo passado para um componente de detalhes. Se o componente `NodeDetailPanel` ou similar existe mas está recebendo `null`, checar o fluxo de `onNodeSelect(node)` → `setSelectedNode(node)` → prop `selectedNode` no painel.

- **[🔴 Crítico]** `CannaPruneCanvas.tsx` usa `canvas.getContext("2d")!` com non-null assertion sem checar suporte
  - **Arquivo:** `client/src/components/CannaPruneCanvas.tsx`
  - **Problema:** Em browsers que não suportam canvas 2D (edge cases com WebGL-only), a aplicação quebraria com erro de runtime não capturado.
  - **Fix sugerido:** `const ctx = canvas.getContext("2d"); if (!ctx) return;`

- **[🟠 Alto]** `plantGraph.ts` calcula posições de nós sem considerar o tamanho real do canvas renderizado
  - **Arquivo:** `client/src/lib/plantGraph.ts`
  - **Problema:** As coordenadas X/Y dos nós são calculadas em um espaço fixo sem consultar o `offsetWidth/offsetHeight` real do elemento canvas, fazendo nós aparecerem fora dos limites em telas pequenas.
  - **Reproduzir:** Abrir mapa em iPhone SE (375px) → nós da borda direita ficam cortados.
  - **Fix sugerido:** Recalcular o layout ao detectar resize via `ResizeObserver` e normalizar coordenadas para `[0, canvasWidth]`.

---

### Aba Tricomas (`PlantTrichomesTab.tsx`)

#### Bugs

- **[🟡 Médio]** A soma de `clearPercent + cloudyPercent + amberPercent` não é validada para totalizar 100%
  - **Arquivo:** `client/src/components/PlantTrichomesTab.tsx` linhas 76–83
  - **Problema:** O usuário pode inserir 50 + 50 + 50 = 150% sem qualquer aviso, gerando dados sem sentido agronômico.
  - **Fix sugerido:** Adicionar aviso quando a soma ultrapassar 100, ou normalizar automaticamente.

#### Melhorias

- Exibir gráfico de pizza com a proporção de tricomas registrada.
- Sugerir janela de colheita baseada no histórico de tricomas (ex: "70% âmbar — recomendamos colher em 3–5 dias").

### Ideias

- Recomendação automática de momento de colheita baseada no histórico de tricomas.

---

### Aba Timeline / Histórico de Estufas

#### Melhorias

- Adicionar paginação ou virtualização — listas longas de histórico causam lentidão.

---

### Aba Ambiente (`PlantEnvironmentTab.tsx`)

#### Bugs

- **[🟡 Médio]** `formatVal` retorna `null` para valor 0 (falsy), escondendo leituras legítimas de EC=0 ou pH=0
  - **Arquivo:** `client/src/components/PlantEnvironmentTab.tsx` linha 22–24
  - **Problema:** `if (val === null || val === undefined) return null;` é correto, mas o resultado é renderizado na célula com `value ? ... : "—"`, que avalia `null` E `"0"` como falsy. EC=0 e pH=0, embora raros, mostrariam "—".
  - **Fix sugerido:** Mudar a condição na `Cell` para `value !== null && value !== undefined` em vez de `value ?`.

#### Melhorias

- Adicionar gráfico de linha de temperatura/umidade da planta com base no histórico da estufa no período de vida.

---

## 🌾 Harvest Queue (`HarvestQueue.tsx`)

### Bugs

- **[🟠 Alto]** Modal "Mover para Secagem" permite confirmar sem selecionar nenhuma planta quando `selectAll=false`
  - **Arquivo:** `client/src/pages/HarvestQueue.tsx` linha 401–404
  - **Problema:** O botão está desabilitado quando `!selectAll && selectedPlantIds.length === 0`, o que está correto. Mas ao desmarcar "Todas", a array `selectedPlantIds` vai para `[]` — se o usuário confirmar rapidamente (race condition por duplo clique), pode chamar `moveToDryingMutation.mutate({ targetTentId, plantIds: [] })`.
  - **Fix sugerido:** No `handleMoveToDrying`, adicionar guard: `if (!selectAll && selectedPlantIds.length === 0) { toast.error(...); return; }`.

- **[🟢 Baixo]** Após descartar planta, a query `harvestQueue.list` usa `refetch()` em vez de `invalidate()`
  - **Arquivo:** `client/src/pages/HarvestQueue.tsx` linhas 84–87
  - **Problema:** `refetch()` e `invalidate()` são misturados: `moveToDryingMutation` usa `refetch` mas `utils.cycles.listActive.refetch()` pode não estar sincronizado com o cache.
  - **Fix sugerido:** Padronizar usando `utils.harvestQueue.list.invalidate()` em todos os callbacks de sucesso.

### Melhorias

- Exibir dias em fila ("Aguardando há X dias") ao lado de cada planta.
- Permitir selecionar plantas individualmente para mover apenas um subconjunto para secagem com checkboxes visuais mais claros.

### Ideias

- Notificação push automática quando uma planta passa mais de 7 dias na fila de secagem sem ser movida.

---

## 📅 Tarefas (`Tasks.tsx`)

### Bugs

- **[🟡 Médio]** Filtro de estufa usa `tentName.includes(letra)` — propensão a falsos positivos
  - **Arquivo:** `client/src/pages/Tasks.tsx` linhas 152–163
  - **Problema:** A lógica extrai a letra "A", "B" ou "C" do nome da estufa (`tentName.includes("A")`). Se a estufa tiver nome "Estufa da Varanda", o filtro por "A" a selecionará indevidamente.
  - **Fix sugerido:** Filtrar por `task.tentId` em vez de nome textual. Ou padronizar nomes de estufas com enum no backend.

- **[🟢 Baixo]** Tarefas com `task.id === 0` (geradas por templates sem instância salva) exibem checkbox mas não podem ser marcadas
  - **Arquivo:** `client/src/pages/Tasks.tsx` linhas 44–48 e 256
  - **Problema:** A condição `taskId > 0` impede marcar, mas o checkbox aparece normalmente e fica apenas `disabled`. Sem tooltip ou indicação visual explicando por quê está inativo.
  - **Fix sugerido:** Exibir badge "Gerada automaticamente" nessas tarefas ou esconder o checkbox substituindo por ícone.

### Melhorias

- Adicionar data de vencimento visível por tarefa.
- Ordenar tarefas por prioridade ou data.
- Permitir criar tarefas avulsas (ad-hoc) além dos templates.

### Ideias

- Integrar tarefas com notificações push (lembrete no dia/hora configurado).
- Permitir arrastar e soltar para reordenar tarefas.

---

## 🧪 Nutrientes (`Nutrients.tsx`)

### Bugs

- **[🟡 Médio]** A fórmula de cálculo de EC estimado em `calculateEC()` ignora a solubilidade real dos sais
  - **Arquivo:** `client/src/pages/Nutrients.tsx` linhas 288–297
  - **Problema:** O cálculo soma `(n+p+k)/100 * gPerLiter * 1000` para cada produto e converte via `/700` para mS/cm. Isso é uma aproximação muito grosseira: sais diferentes têm fator de condutividade diferente (ex: KNO3 ≠ Ca(NO3)2). O EC exibido pode ter erro de 20–40%.
  - **Reproduzir:** Calcular receita de Flora Semana 4 → EC estimado diverge significativamente do EC real medido.
  - **Fix sugerido:** Usar fatores de condutividade específicos por sal (tabelados) ou avisar que é uma estimativa rough.

- **[🟡 Médio]** EC da fase FLORA com `week > 8` não é limitado: `Math.min(week, 8) / 8 * 0.4` funciona, mas semanas 9+ na UI permitem valores acima do previsto sem aviso
  - **Arquivo:** `client/src/pages/Nutrients.tsx` linha 74
  - **Problema:** O multiplicador trava no valor máximo para semana 8+, mas o seletor de semana na UI aceita 1-12, levando o usuário a crer que as doses aumentam sempre.
  - **Fix sugerido:** Adicionar label "(máx. aplicado da sem. 8 em diante)" ou limitar o seletor a `maxWeek = 8` para FLORA.

- **[🟢 Baixo]** `printRecipe()` abre popup sem verificar se o browser bloqueou o popup antes de escrever conteúdo
  - **Arquivo:** `client/src/pages/Nutrients.tsx` linha 374
  - **Problema:** `if (!win)` é verificado corretamente, mas em Safari iOS o `window.open` pode retornar um objeto válido e depois fechar silenciosamente sem acionar `print()`.
  - **Fix sugerido:** Adicionar timeout de verificação se a janela ainda está aberta antes de acionar `window.print()`.

### Melhorias

- Exibir tabela NPK total calculado (N total, P total, K total em ppm) junto com o EC estimado.
- Salvar e comparar receitas entre semanas para visualizar progressão de nutrição.
- Adicionar suporte a outras marcas de nutrientes (não apenas a fórmula mineral fixa).

### Ideias

- Histórico de aplicações com gráfico de EC real vs EC target ao longo do ciclo.
- Alertar quando o EC da receita ultrapassa o target definido nos WeeklyTargets da cepa.

---

## 📈 Histórico Geral (`HistoryTable.tsx`)

### Bugs

- **[🟠 Alto]** Funcionalidade de "desfazer exclusão" é uma ilusão — não cancela realmente a mutação
  - **Arquivo:** `client/src/pages/HistoryTable.tsx` linhas 96–115
  - **Problema:** O toast de "Desfazer" apenas executa `clearTimeout(timeoutId)` que previne a chamada da mutação. Mas se o componente for desmontado antes dos 5 segundos (usuário navegar para outra página), `timeoutId` não é limpo e a mutação executa normalmente de qualquer forma, deletando o registro sem chance de desfazer.
  - **Reproduzir:** Clicar excluir → imediatamente navegar para outra rota → voltar ao histórico → registro foi apagado sem aviso.
  - **Fix sugerido:** Usar `useEffect` com cleanup para limpar o `timeoutId` ao desmontar: `useEffect(() => () => { if (timeoutId.current) clearTimeout(timeoutId.current); }, [])`.

- **[🟡 Médio]** Exportação CSV não inclui cabeçalho de unidades nas colunas de Temp e RH
  - **Arquivo:** `client/src/pages/HistoryTable.tsx` linha 179
  - **Problema:** O header CSV usa `"Temp (\u00b0C)"` corretamente, mas no display da tabela HTML as colunas mostram `Temp<br/>(°C)` somente em desktop — no CSV fica claro, mas internamente o `csvField` processa valores como strings podendo incluir unidade novamente em alguns edge cases.
  - **Fix sugerido:** Normalizar: exportar valores sempre como números puros (sem sufixo), deixar a unidade apenas no header.

- **[🟡 Médio]** Seletor de tab desktop (`<Tabs>`) e o selector dropdown mobile são dois controles separados sem sincronização por URL
  - **Arquivo:** `client/src/pages/HistoryTable.tsx` linhas 305–323 e 326
  - **Problema:** Existe um `<Tabs>` decorativo (desktop) e um `<Select>` (mobile) ambos controlando `selectedTentId`. Se o usuário redimensionar a janela entre breakpoints, o estado permanece, mas a representação visual pode ficar dessincronizada visualmente.
  - **Fix sugerido:** Persistir `selectedTentId` em query param da URL (`?tentId=X`) para manter estado consistente e permitir compartilhar link filtrado.

### Melhorias

- Adicionar coluna VPD calculado na tabela (derivado de Temp + RH).
- Permitir ordenar colunas clicando no cabeçalho.
- Adicionar filtro por turno (AM/PM).

### Ideias

- Exportar para PDF com cabeçalho do app e gráfico embutido.
- Modo de impressão CSS já existe (`print-hide`) — adicionar estilos de impressão para as colunas também.

---

## 🔔 Alertas (`Alerts.tsx` / `AlertHistory.tsx`)

### Bugs

- **[🟠 Alto]** `alertChecker.ts` não faz deduplicação por `metric + tentId + direction` — pode criar múltiplos alertas do mesmo tipo se os dados oscilarem na fronteira
  - **Arquivo:** `server/alertChecker.ts` linhas 189–199
  - **Problema:** A deduplicação usa apenas `metric` nos últimas 4h (`recentMetrics`). Se a temperatura ficar oscilando entre 28°C (ok) e 29°C (acima do max), a cada vez que ultrapassar o limite um novo alerta é criado após as 4h de cooldown. Em uma semana podem acumular-se dezenas de alertas idênticos.
  - **Fix sugerido:** Adicionar `direction` ("HIGH"/"LOW") à deduplicação: `metric + direction` como chave única dentro de 4h.

- **[🟡 Médio]** `Alerts.tsx` filtra `newCount` localmente em `alertList` mas o badge do BottomNav usa `trpc.alerts.getNewCount` (query separada) — podem divergir
  - **Arquivo:** `client/src/pages/Alerts.tsx` linha 66 e `client/src/components/BottomNav.tsx`
  - **Problema:** Ao marcar um alerta como visto, `utils.alerts.getNewCount.invalidate()` é chamado, mas se a listagem paginada ainda tiver o alerta em cache como "NEW", os dois valores podem mostrar números diferentes momentaneamente.
  - **Fix sugerido:** Invalidar ambas as queries juntas sempre que o status de um alerta mudar.

- **[🟢 Baixo]** `AlertHistory.tsx` usa `trpc.notifications.getHistory` que retorna histórico de notificações push, não os alertas ambientais — título da página diz "Histórico de Alertas" mas o conteúdo é diferente de `Alerts.tsx`
  - **Arquivo:** `client/src/pages/AlertHistory.tsx` linha 23
  - **Problema:** Há dois conceitos diferentes: alertas ambientais (em `alertHistory`) e histórico de notificações push (em `notificationSettings`). A página AlertHistory usa o segundo, mas o usuário espera ver o primeiro.
  - **Fix sugerido:** Verificar qual endpoint é o correto e unificar a nomenclatura ou criar abas separadas ("Alertas Ambientais" / "Notificações Enviadas").

### Melhorias

- Adicionar opção "Marcar todos como vistos" em lote.
- Exibir o valor que causou o alerta (ex: "Temp: 31°C — máximo: 28°C") junto com o alerta na listagem.

### Ideias

- Configurar cooldown de alerta por estufa (não apenas 4h fixo no servidor).
- Alertas de "sem registro há X horas" — não só de valores fora de faixa.

---

## ⚙️ Configurações

### Conta (`AccountSettings.tsx`)

#### Bugs

- **[🟠 Alto]** Exclusão de conta usa `window.confirm()` nativo — em iOS PWA o confirm pode ser bloqueado silenciosamente
  - **Arquivo:** `client/src/pages/AccountSettings.tsx` linha 90
  - **Problema:** `window.confirm(...)` não funciona de forma confiável em iOS quando o app está instalado como PWA (Safari suprime dialogs nativos). O usuário pode não ver o diálogo e a exclusão não ocorrer sem feedback.
  - **Fix sugerido:** Substituir `window.confirm` por um `Dialog` do shadcn/ui (já usado em outros lugares do app).

- **[🟢 Baixo]** `error` e `feedback` compartilham o mesmo estado entre edição de nome e senha — um erro de senha limpa o feedback de nome bem-sucedido
  - **Arquivo:** `client/src/pages/AccountSettings.tsx` linhas 65–67
  - **Problema:** Ambas as operações usam `setError` e `setFeedback` do mesmo `ProfileCard`. Se o usuário editar o nome com sucesso e depois tentar mudar a senha com erro, o feedback verde é substituído pelo erro vermelho.
  - **Fix sugerido:** Usar estados de feedback separados por operação ou usar `toast.success/error` (já importado) em vez de estado local.

#### Melhorias

- Adicionar confirmação de senha ao criar nova (campo "confirmar nova senha").
- Validar complexidade de senha no client (mín. 6 chars já existe, mas poderia sugerir mistura de caracteres).

---

### Aparência

#### Melhorias

- Adicionar preview em tempo real do tema ao selecionar cor de acento.

---

### Sensores Tuya (`TuyaSettings.tsx`)

#### Bugs

- **[🟡 Médio]** Credenciais Tuya (Access ID e Access Secret) são exibidas em inputs `type="text"` sem mascaramento por padrão — apenas o Secret tem toggle "Ver/Ocultar"
  - **Arquivo:** `client/src/pages/TuyaSettings.tsx` linhas 201–203
  - **Problema:** O `Access ID` é exibido em texto claro sempre. Em telas compartilhadas ou screenshots, o ID fica exposto.
  - **Fix sugerido:** Aplicar `secret={true}` também ao campo Access ID, ou ao menos truncar visualmente com `•••`.

- **[🟢 Baixo]** Estado `connStatus` não é resetado ao trocar de credenciais — o usuário pode ver "Conectado com sucesso!" de um teste anterior enquanto edita novas credenciais
  - **Arquivo:** `client/src/pages/TuyaSettings.tsx` linhas 32–38
  - **Fix sugerido:** Resetar `setConnStatus(null)` nos `onChange` dos campos de credenciais.

#### Melhorias

- Botão "Sincronizar agora" para forçar polling imediato sem esperar o intervalo configurado.
- Exibir última leitura obtida por sensor (timestamp + valores) na aba Sensores.

---

### Notificações (`NotificationSettings.tsx`)

#### Bugs

- **[🟡 Médio]** `alertsEnabled` é salvo apenas no `localStorage` — não é sincronizado com o servidor; se o usuário trocar de dispositivo, a configuração se perde
  - **Arquivo:** `client/src/pages/NotificationSettings.tsx` linhas 123–127
  - **Problema:** O toggle de "Alertas Automáticos" é local ao navegador/dispositivo. Não há persistência no backend.
  - **Fix sugerido:** Criar endpoint `trpc.alertSettings.setGlobalEnabled` e persistir no banco.

- **[🟢 Baixo]** Ao clicar "Ativar Notificações" no iOS sem ter adicionado à Tela de Início, o browser retorna `permission = "denied"` mas o erro exibido é genérico ("Permissão negada — ative nas configurações do navegador"), sem mencionar a necessidade de adicionar como PWA
  - **Arquivo:** `client/src/pages/NotificationSettings.tsx` linhas 80–82
  - **Fix sugerido:** Detectar iOS com `navigator.userAgent.includes('iPhone')` e exibir instrução específica para adicionar à tela inicial.

---

### Backup (`Backup.tsx`)

#### Bugs

- **[🔴 Crítico]** Importação de backup usa `window.location.reload()` após 1.5s — se a mutação ainda estiver em andamento, pode corromper o estado
  - **Arquivo:** `client/src/pages/Backup.tsx` linhas 22–24
  - **Problema:** `setTimeout(() => window.location.reload(), 1500)` é acionado no `onSuccess`. Se o servidor demorar mais de 1.5s para confirmar, o reload ocorre antes e o usuário vê um estado inconsistente.
  - **Fix sugerido:** O `onSuccess` já indica que o servidor confirmou. O `setTimeout` deve ser apenas para dar tempo do toast aparecer — mas o reload deveria ser `window.location.href = "/"` em vez de `reload()` para forçar busca limpa.

- **[🟠 Alto]** Backup importado não valida chave `data` além de checar `version` e `data` existência — dados corrompidos ou de versão incompatível são inseridos sem aviso
  - **Arquivo:** `client/src/pages/Backup.tsx` linhas 73–79
  - **Problema:** A validação `if (!backupData.version || !backupData.data)` é mínima. Um backup de versão 1 importado em versão 3 pode ter campos inválidos ou ausentes sem que o usuário seja avisado.
  - **Fix sugerido:** Verificar `backupData.version` contra a versão atual do app e exibir aviso de incompatibilidade de schema.

- **[🟡 Médio]** `pendingFile` é tipado como `any` — sem type safety na importação
  - **Arquivo:** `client/src/pages/Backup.tsx` linha 13
  - **Fix sugerido:** Criar interface `BackupFile { version: string; data: Record<string, any[]>; exportedAt?: string }` e tipar adequadamente.

### Melhorias

- Mostrar data/hora do backup sendo importado antes de confirmar.
- Exibir resumo do conteúdo (ex: "X estufas, Y plantas, Z registros") antes da importação.
- Adicionar backup automático agendado (ex: semanal) com download via PWA.

---

### Cepas / Strains (`Strains.tsx`)

#### Bugs

- **[🟢 Baixo]** Exclusão de cepa não verifica se há plantas ativas usando a cepa — deletar gera órfãos no banco
  - **Arquivo:** `client/src/pages/Strains.tsx` linhas 53–61
  - **Problema:** `deleteStrain.mutate({ id })` é chamado sem verificar se `plants.some(p => p.strainId === id)`. O backend pode ter FK constraint, mas o erro retornado é genérico.
  - **Fix sugerido:** Consultar `trpc.plants.list({ strainId })` antes de abrir o diálogo de confirmação e avisar se houver plantas ativas vinculadas.

### Melhorias

- Exibir número de plantas ativas por cepa na lista.
- Adicionar campo de "origem" (feminizada, autoflorescente, clone) ao cadastro da cepa.

---

### Targets por Cepa (`StrainTargets.tsx`)

#### Bugs

- **[🟡 Médio]** `handleSave` usa `createTarget.mutateAsync` sem distinção entre criar e atualizar — se o target já existe, cria um duplicado no banco
  - **Arquivo:** `client/src/pages/StrainTargets.tsx` linhas 66–88
  - **Problema:** A mutation sempre chama `create`. Se `weeklyTargets.getByStrain` já retornou um target para aquela fase/semana, uma segunda chamada com os mesmos dados cria um registro duplicado (dependendo da constraint no banco).
  - **Fix sugerido:** Verificar se o `editingTargets[key].id` já existe e chamar `update` em vez de `create`. Ou usar `upsert` no backend.

#### Melhorias

- Adicionar "Copiar targets de outra cepa" para acelerar cadastro de novas cepas.
- Visualizar targets em tabela comparativa (Vega vs Flora lado a lado).

---

## 💬 Chat IA (`PlantChat.tsx`)

### Bugs

- **[🔴 Crítico]** Chave de API armazenada no banco sem criptografia adicional — uma falha de SQL injection exporia a API key do usuário
  - **Arquivo:** `client/src/pages/AccountSettings.tsx` — `trpc.aiChat.saveSettings` (inferido do backend)
  - **Problema:** A chave de API (Gemini, OpenAI etc.) é enviada via tRPC e possivelmente armazenada em plaintext na tabela de configurações. Um dump do banco exporia todas as chaves.
  - **Fix sugerido:** Criptografar a API key antes de armazenar usando `crypto.subtle` ou uma lib como `bcrypt` (para hash) ou AES-256-GCM (para criptografia reversível).

- **[🟠 Alto]** Sem rate limiting no endpoint de chat — usuário pode disparar dezenas de chamadas simultâneas à API do provedor, gerando custos inesperados
  - **Arquivo:** `server/` (router de `aiChat`)
  - **Problema:** Não há controle de frequência de chamadas por usuário no backend.
  - **Fix sugerido:** Implementar rate limit de no máximo 10 mensagens por minuto por usuário usando `express-rate-limit` ou middleware tRPC.

- **[🟡 Médio]** Em `AccountSettings.tsx` a lista `PROVIDER_MODELS.anthropic.models` inclui `claude-haiku-4-5-20251001` com data futura em relação ao lançamento do modelo
  - **Arquivo:** `client/src/pages/AccountSettings.tsx` linha 285
  - **Problema:** O model ID `claude-haiku-4-5-20251001` parece ter typo de data (2025-10-01 em vez de identificador correto). Dependendo da API da Anthropic, pode retornar erro 404.
  - **Fix sugerido:** Verificar o model ID correto no console da Anthropic e corrigir.

### Melhorias

- Persistir histórico de chat por planta (hoje parece ser sessão apenas).
- Adicionar botão "Copiar resposta" em cada mensagem da IA.
- Exibir custo estimado da chamada (tokens usados) para o usuário controlar gastos.

### Ideias

- Modo de análise de foto: o usuário tira foto da planta e a IA analisa diretamente.
- Histórico de diagnósticos anteriores por planta.

---

## 🧮 Calculadoras (`Calculators.tsx`)

### Bugs

- **[🟡 Médio]** `WateringRunoffCalculator` usa `alert()` nativo ao salvar receita com sucesso
  - **Arquivo:** `client/src/pages/Calculators.tsx` linha 348
  - **Problema:** `alert("Receita salva com sucesso!")` usa o dialog nativo do browser, que é bloqueado em iOS PWA e destoa completamente do sistema de notificações `toast` usado no restante do app.
  - **Reproduzir:** Salvar receita de rega → ver alerta nativo do browser em vez de toast verde.
  - **Fix sugerido:** Substituir `alert(...)` por `toast.success("Receita salva com sucesso!")`.

- **[🟡 Médio]** `FertilizationCalculator.tsx` calcula doses via porcentagem fixa do EC (`targetEC * volume * 0.45` etc.) — fórmula arbitrária sem base agronômica documentada
  - **Arquivo:** `client/src/components/FertilizationCalculator.tsx` linhas 47–51
  - **Problema:** As proporções (45%, 20%, 10%, 20%, 5%) são hardcoded sem origem documentada. Podem não ser corretas para todos os regimes de nutrição.
  - **Fix sugerido:** Documentar a origem das proporções em comentário de código, ou substituir pela mesma tabela de `getProductsByPhaseWeek` usada em `Nutrients.tsx`.

- **[🟢 Baixo]** `IrrigationScheduleCalculator` é carregado via `lazy()` mas não há Suspense boundary específico para erros de chunk — se o bundle falhar ao carregar, a tela fica em branco
  - **Arquivo:** `client/src/pages/Calculators.tsx` linha 141
  - **Problema:** O `<Suspense fallback={<CalculatorSkeleton />}>` captura loading, mas não erros de carregamento de chunk.
  - **Fix sugerido:** Envolver com `<ErrorBoundary>` ao redor do `<Suspense>`.

- **[🟢 Baixo]** `exportFertilizationRecipe` recebe parâmetro `_unused` (3º argumento) que nunca é usado
  - **Arquivo:** `client/src/pages/Calculators.tsx` linha 46
  - **Problema:** A assinatura da função tem um argumento que não é utilizado, sugerindo código incompleto ou refatoração pela metade.
  - **Fix sugerido:** Remover o parâmetro ou usá-lo corretamente (pode ser o tipo de substrato que está faltando no export).

### Melhorias

- Calculadora de VPD: adicionar tabela visual de referência de VPD ideal por fase.
- Calculadora de pH: mostrar volume de pH Up/Down necessário com referência de produto comercial.
- Histórico de cálculos: permitir salvar e recuperar cálculos anteriores por nome.

### Ideias

- Integrar a calculadora de rega com os dados reais de vaso/plantas cadastradas no app.
- Calculadora de DLI (Dose Diária de Luz) a partir de PPFD e horas de fotoperíodo.

---

## 🌐 Bugs Transversais

- **[🔴 Crítico]** Ausência de proteção CSRF nos endpoints de mutação tRPC — o servidor não verifica `Origin` ou usa tokens CSRF
  - **Arquivo:** `server/` (todos os routers tRPC)
  - **Problema:** As rotas de mutação (create, update, delete) são acessíveis por qualquer site se o cookie de sessão for enviado automaticamente. Em um cenário de CSRF, um site malicioso poderia deletar dados do usuário.
  - **Fix sugerido:** Adicionar middleware que verifica o header `Origin` nas mutations, ou usar SameSite=Strict no cookie de sessão.

- **[🟠 Alto]** Uso de `any` excessivo em tipos tRPC — erros de tipo são suprimidos silenciosamente
  - **Arquivo:** `client/src/pages/HistoryTable.tsx` linha 46, `HarvestQueue.tsx` linha 113, `Tasks.tsx` linha 85, entre outros
  - **Problema:** `any` desativa a verificação de tipos, tornando refatorações perigosas e escondendo erros em tempo de compilação.
  - **Fix sugerido:** Usar tipos inferidos do schema Drizzle via `typeof schema.table.$inferSelect`.

- **[🟠 Alto]** Falta de tratamento de erro global para falhas de rede tRPC — quando o servidor cai, o app não exibe mensagem clara
  - **Problema:** Cada componente trata erros individualmente com `toast.error`, mas não há interceptor global para erros de conectividade (ex: 503, timeout).
  - **Fix sugerido:** Configurar `onError` global no `TRPCProvider` para exibir banner de "Sem conexão com o servidor".

- **[🟡 Médio]** `window.location.reload()` usado em múltiplos lugares após operações críticas (backup, harvest) — não respeita o roteamento SPA
  - **Arquivo:** `Backup.tsx` linha 23, `HarvestQueue.tsx` linha 70 (via `refetch`)
  - **Problema:** `reload()` força novo carregamento completo da página, perdendo o estado de navegação e causando flash de tela. Em uma PWA, isso é perceptível ao usuário.
  - **Fix sugerido:** Usar `utils.[query].invalidate()` para refetch seletivo em vez de reload completo.

- **[🟡 Médio]** Sem paginação ou virtualização em listas potencialmente longas (ex: logs de nutrientes, histórico de saúde)
  - **Problema:** Listas com >100 itens são renderizadas inteiramente no DOM, degradando a performance em dispositivos móveis low-end.
  - **Fix sugerido:** Usar `@tanstack/react-virtual` ou implementar paginação similar à do `HistoryTable.tsx`.

- **[🟡 Médio]** Datas exibidas com `new Date(string).toLocaleDateString("pt-BR")` podem ter offset de timezone incorreto
  - **Arquivo:** Vários componentes (Tasks.tsx linha 281, HarvestQueue.tsx linha 238, etc.)
  - **Problema:** Datas armazenadas como UTC no banco, ao ser interpretadas como `new Date(dateString)` e formatadas sem especificar timezone, podem aparecer com 1 dia de diferença para usuários no fuso UTC-3 (Brasil).
  - **Fix sugerido:** Usar `date-fns` com `parseISO` e `format` (já importado em vários componentes) para garantir consistência de timezone.

- **[🟢 Baixo]** Não há indicação de "Carregando..." nos botões de ação secundários (ex: "Copiar código", "Regenerar código" em AccountSettings)
  - **Problema:** Apenas as mutations principais têm `isPending` no botão — ações menores não têm feedback visual de loading.
  - **Fix sugerido:** Adicionar `disabled={mutation.isPending}` e ícone de spinner nos botões relevantes.

- **[🟢 Baixo]** `BottomNav.tsx` oculta a nav com `HIDDEN_NAV_PREFIXES = ["/tent/", "/display"]` mas a lista está hardcoded e não cobre rotas novas automaticamente
  - **Arquivo:** `client/src/components/BottomNav.tsx` linhas 31–33
  - **Problema:** Se uma nova rota de "foco total" for criada, o desenvolvedor precisa lembrar de adicioná-la manualmente.
  - **Fix sugerido:** Adicionar prop `hideNav` ao layout das rotas, ou usar convenção de nome de rota (ex: sufixo `/fullscreen`).

- **[🟢 Baixo]** `Calculators.tsx` define funções utilitárias (`exportIrrigationRecipe`, `downloadTextFile`) antes dos imports — violação de convenção e pode causar problemas com tree-shaking
  - **Arquivo:** `client/src/pages/Calculators.tsx` linhas 14–132 definidos antes do `import { lazy }` na linha 134
  - **Fix sugerido:** Mover todos os imports para o topo do arquivo.

---

## 💡 Ideias Gerais de Produto

- **Dashboard de Análise**: Tela com gráficos de temperatura média, pH médio e EC médio por ciclo — útil para comparar desempenho entre ciclos.
- **Modo Offline First**: Cache de dados críticos (plantas, estufas, tarefas) no ServiceWorker para uso sem internet.
- **Comparativo de Cepas**: Tabela mostrando yield médio, duração de ciclo e ocorrências de doenças por cepa ao longo de todos os ciclos.
- **Tour Guiado**: Onboarding interativo (passo a passo) para novos usuários cadastrarem a primeira estufa, cepa e planta.
- **Modo Display (TV/Tablet)**: Tela `/display` em modo quiosque com atualização automática mostrando métricas em tempo real — já existe a rota, mas pode ser enriquecida.
- **Compartilhamento de Receita de Nutrientes**: QR code gerado a partir da receita atual para impressão ou envio por WhatsApp.
- **Log por Voz**: Integração com Web Speech API para registrar dados de temperatura/umidade verbalmente.
- **Integração com Calendário**: Exportar tarefas semanais como eventos de calendário (iCal).
- **Notificação de Fim de Ciclo**: Lembrar automaticamente quando a semana máxima da cepa (vegaWeeks + floraWeeks) for atingida.
- **Análise de Tricomas por IA**: Enviar foto de tricoma para o chat de IA com pergunta pré-formulada sobre maturação.
- **Multi-idioma**: Internacionalização (i18n) para inglês, espanhol — estrutura de chaves já seria viável com `react-i18next`.
- **Widget PWA**: Adicionar suporte a `manifest.json` com `shortcuts` para ações rápidas no ícone do app (iOS 16.4+).
