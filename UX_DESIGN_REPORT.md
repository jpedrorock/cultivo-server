# App Cultivo — Auditoria de UX e Design

**Data:** 2026-04-17
**Avaliador:** UX Critic Agent
**Versão analisada:** Codebase atual (React + TypeScript + Vite + shadcn/ui + Tailwind)

---

## Resumo Executivo

O Cultivo é um app tecnicamente competente mas UX-confuso. Há claramente muito trabalho e cuidado por trás — PWA offline, haptic feedback, animações, sensor IoT, IA, splash screen, pull-to-refresh, skeleton loaders. Tudo isso é positivo. O problema é que esse esforço foi distribuído de forma desordenada, sem uma hierarquia de prioridades clara para o usuário. O resultado é um app que tenta fazer 15 coisas ao mesmo tempo e não explica bem nenhuma delas.

O fluxo mais crítico do app — **registrar um log diário** — está enterrado atrás de um FAB que abre um menu de 5 opções, sem label visível no botão principal. A navegação inferior esconde funcionalidades-chave (Alertas, Tarefas, Histórico) em um drawer "Mais" que não tem badge de notificação visível na nav. A página Home tem TentCards com densidade de informação muito alta, incluindo sparklines SVG animadas com efeito ECG que, embora tecnicamente impressionantes, consomem espaço valioso em cards já sobrecarregados. A página de Tasks existe em duplicata (rota `/tasks` E `/tarefas`, componentes `Tasks.tsx` e `Tarefas.tsx`). O QuickLog tem uma UX de wizard com até 10+ steps para um registro simples.

O app tem boas fundações. Precisa de uma cirurgia de simplificação, não de mais features.

---

## Pontuação Geral

| Dimensão | Nota (0–10) | Comentário rápido |
|---|---|---|
| Hierarquia de informação | 5 | Home sobrecarregada; informação crítica misturada com decorativa |
| Consistência visual | 6 | shadcn/ui bem usado, mas mistura de classes inline brutas com componentes formais |
| Mobile UX | 6 | Haptic e safe-area corretos; alvos de toque pequenos em vários lugares (8px, 3.5px icons) |
| Fluxos críticos | 5 | Registro diário tem muitos passos; FAB sem label; Alertas enterrados |
| Carga cognitiva | 4 | TentCard mostra 12+ elementos simultâneos; wizard de log tem 10+ steps |
| Onboarding | 7 | Empty state com passos numerados é bom; mas setup de sensores/strains não está nesse fluxo |
| Feedback e estados | 8 | Loading skeletons, toasts com undo, offline sync — pontos fortes reais |
| Descoberta de features | 4 | IA, Treinamento, Tricomas, Histórico, Nutrientes — todos escondidos |

---

## Problemas Críticos (resolver antes de lançar)

### CRIT-1: FAB principal sem label — a ação mais importante do app é invisível

**Página:** `BottomNav.tsx` (FAB central)

**Descrição:** O botão de ação principal — registrar um log diário — é um FAB com ícone `+` sem nenhum label. Ao tocar, abre um menu flutuante com 5 opções: "Status da Estufa", "Saúde de Planta", "Tricomas", "Treinamento" e "IA Especialista". Um usuário novo não tem como saber que esse `+` é o ponto de entrada para o registro diário. O menu popup aparece ancorado na `left: 3` da viewport (canto inferior esquerdo) com seta apontando para o FAB — visualmente desconexo em telas estreitas.

**Impacto:** Usuário novo não consegue registrar dados. É o fluxo #1 do app.

**Solução:**
- Adicionar label `"Registrar"` abaixo do FAB (como os outros itens da nav têm).
- Renomear "Status da Estufa" para "Log Diário" — mais claro para o contexto.
- Considerar tornar "Log Diário" a ação direta do tap, e o menu de popup para as opções secundárias (saúde, tricomas, treinamento, IA) acessíveis via long-press ou swipe.

---

### CRIT-2: Alertas e Tarefas enterrados no drawer "Mais" — sem visibilidade de badge na nav

**Página:** `BottomNav.tsx` — `moreMenuItems`

**Descrição:** Alertas (potencialmente urgentes) e Tarefas ficam dentro de um Sheet "Mais" acessível pelo `MoreHorizontal`. O badge de alertas (`badgeShaking`, `animate-pulse`) SÓ aparece dentro do drawer — quando o drawer está fechado, não há nenhum indicador visual na nav de que existem alertas novos. Um usuário com luvas ou mão suja precisa: 1) tocar em "Mais", 2) esperar o Sheet abrir, 3) ler a lista, 4) tocar em "Alertas". São 4 interações para ver um alerta urgente.

Existe um banner de alertas na Home (`totalNewAlerts > 0`) — o que é bom — mas o usuário precisa estar na Home para vê-lo.

**Impacto:** Alertas críticos (pH fora da faixa, temperatura elevada) podem não ser vistos a tempo.

**Solução:**
- Mover "Alertas" para um dos slots fixos da bottom nav, substituindo "Calculadoras" (que é uso esporádico). Badge vermelho visível permanentemente.
- Estrutura sugerida: `[Estufas] [+FAB] [Plantas] [Alertas] [Mais]`
- Alternativa: adicionar um indicador de badge no próprio botão "Mais" quando há alertas não vistos.

---

### CRIT-3: QuickLog wizard tem complexidade desproporcional ao uso diário

**Página:** `QuickLog.tsx`

**Descrição:** O registro diário — feito 2x por dia — é um wizard multi-step. Analisando o código: steps 0 (tent), depois steps de temp/rh, watering, runoff, ph/ec, ppfd, confirmação, e depois ainda oferece saúde de planta (step 9), tricomas, etc. A lógica de `currentStep` vai até pelo menos step 9+. O sensor Tuya pula steps automaticamente (`setCurrentStep(3)`) mas só quando `sensorReading !== undefined && sensorReading?.isFresh` — condição race-condition dependente de uma query assíncrona. Se o sensor demorar a responder, o usuário não sabe se vai pular steps ou não.

O `BigStepper` e `RangeSlider` para PPFD são bons para precisão, mas o slider de 0 a ~2000 μmol/m²/s é difícil de controlar com luvas. O campo de luz ainda tem toggle entre Lux e PPFD (`lightUnit`), adicionando decisão desnecessária.

**Impacto:** Registro diário leva 2-3 minutos. Deveria levar 30 segundos. Usuários vão desistir ou pular dados.

**Solução:**
- Redesign para formulário único em scroll, não wizard. Campos agrupados por categoria (Ambiente | Rega | Nutrição).
- Campos opcionais claramente marcados como opcionais.
- PPFD como input numérico direto com sugestão de último valor.
- Saúde de planta e tricomas como fluxo separado, não concatenado no mesmo wizard.
- Remover o toggle Lux/PPFD — escolher um padrão (PPFD) e manter conversão oculta nas configurações.

---

### CRIT-4: Duplicação de rotas e componentes de Tarefas

**Arquivos:** `App.tsx` linhas 77-78, `pages/Tasks.tsx` e `pages/Tarefas.tsx`

**Descrição:** Existem duas rotas para tarefas: `/tasks` (componente `Tarefas`) e `/tarefas` (também `Tarefas`). Além disso, existe um `Tasks.tsx` separado. O `BottomNav` linka para `/tarefas`. O App.tsx importa `Tarefas` lazy mas também importa `Tasks` (não usado no router visível). Esta duplicação indica que houve refatoração incompleta. O usuário pode chegar em estados diferentes dependendo de como navegou.

**Impacto:** Bugs potenciais de estado; manutenção difícil; risco de mostrar telas diferentes para o mesmo usuário.

**Solução:**
- Auditar qual componente é o canônico (`Tasks.tsx` ou `Tarefas.tsx`) e remover o outro.
- Manter apenas uma rota (`/tasks` ou `/tarefas`), remover o alias.
- Verificar se `Tasks.tsx` ainda está sendo importado em algum lugar além de `App.tsx`.

---

## Problemas Altos (resolver em breve)

### HIGH-1: TentCard tem densidade de informação excessiva

**Página:** `Home.tsx` — componente `TentCard`

**Descrição:** Cada TentCard contém simultaneamente: nome da estufa, freshness badge (há Xh), streak badge (Xd), dimensões (cm), botão Monitor, dropdown MoreVertical, chips de contagem de plantas/mudas, bloco de ciclo ativo com fase e semana, grid de 3 KPIs (Temp, RH, PPFD) com sparklines SVG animadas estilo ECG, painel de tarefas expansível. São pelo menos 12 elementos de informação em um único card. Em mobile, isso resulta em cards muito altos que exigem muito scroll para ver a segunda estufa.

As sparklines ECG — 5 camadas SVG animadas com filtros de glow — são visualmente interessantes mas consomem espaço e processamento para dados que o usuário raramente precisa ver no nível do card home.

**Impacto:** Usuário não consegue ter visão panorâmica de todas as estufas. Scroll excessivo. Lentidão em dispositivos modestos com múltiplos cards renderizando animações.

**Solução:**
- Reduzir card a: Nome + fase + semana + última leitura (temp/rh inline, texto simples) + badge de alerta.
- Mover sparklines para a tela de detalhe da estufa (`/tent/:id`).
- Painel de tarefas deve ser acessível via link, não embutido no card.
- KPIs podem ser mostrados como texto puro (ex: `24.5°C · 62%`) sem sparkline animada.

---

### HIGH-2: Botão "Registro Rápido" no header da Home só aparece em desktop

**Página:** `Home.tsx` — header, linha 456

**Descrição:** `<Link href="/quick-log" className="!hidden md:!inline-block">` — o botão de Registro Rápido no header está explicitamente oculto em mobile (`!hidden`) e só aparece em desktop (`md:!inline-block`). Em mobile, o único acesso é via FAB. Isso não é necessariamente errado (o FAB substitui), mas cria inconsistência: no desktop o usuário acessa direto, no mobile precisa saber do FAB.

**Impacto:** Descoberta do fluxo de registro depende 100% do FAB em mobile — que não tem label (CRIT-1).

**Solução:** Ou o FAB tem label, ou algum shortcut explícito na Home mobile leva direto ao log do dia (ex: botão contextual no TentCard: "Registrar agora").

---

### HIGH-3: Página de Histórico é uma tabela desktop em mobile

**Página:** `HistoryTable.tsx`

**Descrição:** A página de histórico usa componente `Table` com múltiplas colunas (data, turno, temp, rh, ppfd, pH, EC, VPD, ações). Em mobile, isso resulta em scroll horizontal — pior padrão de UX mobile possível para dados tabulares. O código usa `Table`, `TableHead`, `TableBody`, `TableRow` sem nenhuma adaptação responsiva. Os filtros (tent, período, data customizada, turno, ordenação) ficam todos em uma Card acima da tabela, ocupando quase metade da tela antes de mostrar um único dado.

**Impacto:** Usuário no celular não consegue ver os dados históricos de forma utilizável.

**Solução:**
- Em mobile: lista de cards por dia (data + turno + valores principais inline).
- Filtros em bottom sheet, não empilhados acima do conteúdo.
- A tabela completa pode ficar disponível em desktop/export.

---

### HIGH-4: Página de Alertas tem loading genérico (spinner full-screen) sem skeleton

**Página:** `Alerts.tsx` — linhas 65-71

**Descrição:** Enquanto `loadingTents` for true, a tela de alertas mostra apenas um `Loader2` centralizado na tela vazia. Não há skeleton, não há indicação do que está carregando, não há contexto. Contrasta negativamente com as outras páginas que já têm skeletons elaborados (`TentCardSkeleton`, `PlantCardSkeleton`, `HistoryTableSkeleton`).

**Impacto:** Percepção de lentidão. Usuário não sabe se o app travou.

**Solução:** Criar `AlertsSkeleton` similar aos outros — 3-4 itens cinzas com largura variada.

---

### HIGH-5: Navegação de volta inconsistente — mistura de botões "← Voltar" e header com ArrowLeft

**Páginas:** `Tasks.tsx` (usa `← Voltar` em texto), `Alerts.tsx` (usa `ArrowLeft` como ícone com `Button asChild`), `Nutrients.tsx` (usa `Breadcrumb` component + `ArrowLeft`)

**Descrição:** Três padrões diferentes de navegação de volta em três páginas diferentes:
1. `<Button variant="ghost" size="sm">← Voltar</Button>` (Tasks)
2. `<Button asChild variant="ghost" size="icon"><Link href="/"><ArrowLeft /></Link></Button>` (Alerts)
3. `<Breadcrumb>` com lógica própria (Nutrients)

Nenhum desses padrões usa a nav browser nativa (`history.back()`), então se o usuário chegar numa dessas páginas por URL direta, o botão de voltar vai para `/` (Home), não para onde ele estava antes.

**Impacto:** Quebra a expectativa de navegação. Usuário pode perder contexto (ex: estava no filtro de histórico, clica em alerta, volta e perde o filtro).

**Solução:** Criar componente `<PageHeader title="..." backHref="..." />` único, usado em todas as páginas secundárias. `backHref` pode usar `history.back()` com fallback para uma rota default.

---

## Melhorias de Médio Impacto

### MED-1: Chat de IA tem acesso via 2 taps mínimo, mas potencial de ser feature principal

**Página:** `PlantChat.tsx`, `BottomNav.tsx`

**Descrição:** O chat de IA exige: tap no FAB → tap em "IA Especialista" → sheet abre → escolher estufa → escolher planta → navega para `/chat/:plantId`. Mínimo 5 interações. O chat tem quick chips (`QUICK_CHIPS`) úteis e suporte a foto — features que justificariam acesso mais rápido.

**Solução:** Considerar atalho de "Perguntar para IA" contextual no TentCard ou PlantDetail, pré-selecionando a planta correta. Ou um ícone fixo na bottom nav se a IA for realmente uma feature principal.

---

### MED-2: Página de Nutrientes é uma calculadora estática — não integra com o ciclo ativo

**Página:** `Nutrients.tsx`

**Descrição:** A página de nutrientes tem seleção manual de fase e semana. O app já sabe qual é a fase e semana atual de cada estufa (calculado em `TentCard` e em `QuickLog`). O usuário precisa re-inserir essa informação manualmente.

**Solução:** Pré-selecionar automaticamente a fase e semana da estufa ativa quando o usuário chega na página. Se houver múltiplas estufas, mostrar seletor pré-carregado com a principal.

---

### MED-3: `resetForm` e `resetForNewTent` são funções idênticas em QuickLog

**Página:** `QuickLog.tsx` — linhas 291-331

**Descrição:** As duas funções fazem exatamente a mesma coisa — resetar todos os campos de estado para valores iniciais. Não há diferença funcional entre elas no código atual. Isso é dead code / duplicação desnecessária.

**Solução:** Extrair para uma função `resetState()` única chamada nos dois contextos.

---

### MED-4: Página de Plantas tem múltiplos dialogs de confirmação em estado local — pode vazar estado

**Página:** `PlantsList.tsx`

**Descrição:** A página gerencia: `movePlantDialog`, `batchMoveDialog`, `deletePlantDialog`, `permanentDeleteDialog`, `bulkDeleteConfirm`, `bulkPromoteConfirm`, `bulkHarvestConfirm`, `bulkDiscardConfirm` — 8 estados de dialog distintos. Com tantos estados booleanos paralelos, é possível que dois dialogs abram simultaneamente ou que estados fiquem "stuck" após erros de rede.

**Solução:** Consolidar em um único estado `{ type: 'delete' | 'move' | 'harvest' | ..., payload: any } | null` com um único switch de render.

---

### MED-5: Página de Calculadoras não está linkada na nav de forma direta — e tem dois componentes

**Arquivos:** `App.tsx` — rotas `/calculators` e `/calculators/:id`, componentes `CalculatorMenu` e `Calculators`

**Descrição:** A nav aponta para `/calculators` que carrega `CalculatorMenu`. O componente `Calculators.tsx` é uma página separada com calculadoras específicas por `:id`. O `Nutrients.tsx` é uma calculadora de nutrição que existe em rota própria (`/nutrients`), desconectada do menu de calculadoras. O usuário não tem visão unificada de "ferramentas de cálculo".

**Solução:** Incluir Nutrientes como uma tab/seção dentro do `CalculatorMenu`. Remover a rota `/nutrients` separada ou redirecionar para `/calculators/nutrients`.

---

### MED-6: Keyboard shortcuts (Ctrl+N, Ctrl+H, Ctrl+C) são feature desktop — mobile nunca os usa

**Página:** `Home.tsx` — `useKeyboardShortcuts`

**Descrição:** O hook `useKeyboardShortcuts` registra atalhos globais com `Ctrl`. Em mobile não há teclado físico. Os toasts de confirmação de atalho ("Atalho acionado: Criar Nova Estufa") vão aparecer apenas para os raros usuários desktop. Não é um bug, mas é código ocioso para 95% do público.

**Solução:** Nenhuma ação urgente. Mas se houver limpeza de código, este hook pode ser movido para um módulo desktop-only ou condicional.

---

### MED-7: Página de Morning Check (Status) está na nav "Mais" mas não tem onboarding claro

**Rota:** `/morning-check`, item "Status" no `moreMenuItems`

**Descrição:** Existe uma página `MorningCheck` que não foi analisada em detalhe mas está acessível via "Mais > Status". O label "Status" é genérico demais — pode ser confundido com status do sistema, status da conexão, etc. O ícone é `Sunrise` — sugere rotina matinal, mas o label não confirma isso.

**Solução:** Renomear para "Checklist Matinal" ou "Ronda de Status" com descrição clara no menu.

---

## Polimento e Refinamento

### POL-1: Label "RH" nos KPIs não é autoexplicativo para todos os usuários

**Página:** `Home.tsx` — TentCard, KPI grid

**Descrição:** O KPI de umidade usa o label `RH` (Relative Humidity), em inglês, com fonte 9px (`text-[9px]`). Cultivadores brasileiros iniciantes podem não entender. Temperatura usa `Temp` (ok), luz usa `PPFD` (aceitável por ser termo técnico universal). Mas `RH` em 9px é quase ilegível e não intuitivo.

**Solução:** Usar `Umidade` ou `UR%` (Umidade Relativa).

---

### POL-2: Badge "A" de sensor automático tem 3.5px de fonte — ilegível

**Página:** `Home.tsx` — TentCard, KPI buttons

**Descrição:** O badge de sensor automático usa `text-[8px]` e `w-3.5 h-3.5` (14px). Em uma tela de alta densidade ou sob luz HPS/LED intensa, esse badge é praticamente invisível. A informação que ele transmite (sensor ativo) é relevante — o usuário precisa saber que a leitura é automática vs manual.

**Solução:** Usar um ícone (ex: `Wifi` ou `Zap`) de 12px no lugar do badge "A" de texto. Ou aumentar o badge para pelo menos 18px com fonte 10px.

---

### POL-3: O toast de confirmação de atalho de teclado em mobile é confuso

**Página:** `Home.tsx` — `useKeyboardShortcuts`

**Descrição:** Se algum usuário mobile acidentalmente acionar `Ctrl+N` (improvável mas possível com teclado bluetooth), o toast `"Atalho acionado: Criar Nova Estufa"` aparece — o que é confuso (por que apareceu isso?).

**Solução:** Remover os toasts de confirmação de atalho. A ação já acontece — o toast é redundante e ruidoso.

---

### POL-4: Frase "← Voltar" como texto literal em botão ghost (Tasks.tsx)

**Página:** `Tasks.tsx` — header

**Descrição:** O botão de voltar usa texto literal com seta unicode `← Voltar`. Todos os outros headers usam `ArrowLeft` do Lucide como ícone. Inconsistência visual e de acessibilidade (screen readers lerão "seta para esquerda Voltar" de formas diferentes dependendo da implementação).

**Solução:** Padronizar para `<ArrowLeft className="w-5 h-5" />` como nas outras páginas.

---

### POL-5: Página de Alertas usa `h1` com font-size `text-2xl` em header mobile — muito grande

**Página:** `Alerts.tsx` — header

**Descrição:** O título "Histórico de Alertas" usa `text-2xl font-bold` com ícone `Bell w-6 h-6`. Em mobile com header sticky, isso ocupa uma altura considerável antes de mostrar qualquer alerta. Compare com o header da Home que usa `text-base sm:text-xl` — muito mais compacto.

**Solução:** Reduzir para `text-xl` ou `text-lg` no header mobile de páginas secundárias.

---

### POL-6: Animação ECG nas sparklines pode ser problema de acessibilidade (motion sensitivity)

**Página:** `Home.tsx` — `MiniSparkline`

**Descrição:** As sparklines têm 5 camadas SVG com `repeatCount="indefinite"` — animação contínua infinita. Usuários com sensibilidade a movimento (vestibular disorders, epilepsia) podem ser afetados. O CSS `prefers-reduced-motion` não é respeitado aqui.

**Solução:** Envolver as animações em `@media (prefers-reduced-motion: no-preference)` ou verificar `window.matchMedia('(prefers-reduced-motion: reduce)')` antes de renderizar as camadas animadas.

---

## Oportunidades de Design (features novas ou redesigns)

### OPP-1: Dashboard unificado em tempo real por estufa — a "tela de operação"

**Conceito:** Em vez de TentCards na Home, criar um modo "Operação" que mostra UMA estufa por vez (swipe horizontal entre estufas), fullscreen, com os KPIs grandes e legíveis, status atual, próxima tarefa, e botão único "Registrar". Ideal para uso com luvas, à distância de um braço, sob luz artificial intensa.

A tela DisplayMode (`/tent/:id/display`) já existe — é um passo nessa direção. Seria transformador trazer essa experiência para a tela principal.

---

### OPP-2: Notificação contextual de "hora do registro" com deep link direto

**Conceito:** O app já tem `startMissingReadingsMonitor` e suporte a push notifications. O próximo passo natural é: quando falta o registro da tarde (depois das 18h), enviar notificação que abre direto no QuickLog com a estufa pré-selecionada. Um tap, campo já focado. Zero fricção.

---

### OPP-3: Widget de resumo diário — "Tudo certo hoje?" na Home

**Conceito:** Um card de resumo no topo da Home (abaixo do header, antes dos TentCards) que mostra: quantas estufas já registraram hoje, quantas tarefas pendentes, quantos alertas novos. Um painel de controle de missão. Em vez de distribuir essas informações em badges espalhados pelos TentCards, centralizar em 3 números grandes.

---

### OPP-4: Modo "Colheita" guiado — jornada end-to-end

**Conceito:** Quando a estufa entra em fase de secagem/colheita, a experiência atual fragmenta: `MoveToHarvestQueueDialog`, `HarvestQueue`, `FinalizeCycleConfirm`, etc. Uma jornada guiada de colheita (wizard de 4 steps: confirmar plantas, registrar peso seco, mover para arquivo, iniciar novo ciclo) transformaria um processo confuso em um ritual celebratório dentro do app.

---

### OPP-5: Integração ativa da IA no fluxo de diagnóstico, não só como chat

**Conceito:** Quando o usuário registra saúde da planta como "Doente" ou "Estressada", ao invés de só salvar o registro, o app poderia imediatamente oferecer "Diagnosticar com IA" — abrindo o chat já com a foto e os parâmetros do último log como contexto. A IA já tem `QUICK_CHIPS` e suporte a imagem. A ponte entre o registro de saúde e o chat é o passo que falta.

---

## Fluxos Prioritários para Redesign

**1. Registro Diário (QuickLog)**
É o coração do app. Merece ser o fluxo mais polido, mais rápido e mais confiável. Atualmente é o mais longo. Redesign para formulário único com scroll, não wizard de 10 steps.

**2. Navegação da Bottom Nav**
A estrutura atual `[Estufas] [FAB+] [Plantas] [Calculadoras] [Mais]` deixa de fora visibilidade permanente de Alertas e Tarefas. Proposta: `[Estufas] [FAB+] [Plantas] [Alertas🔴] [Mais]`, com Calculadoras movendo para o "Mais".

**3. TentCard → Tela de Detalhe da Estufa**
O card tenta ser a tela de detalhe e falha como card. A solução é um card minimalista (nome, fase, semana, última leitura, badge de alerta) que navega para uma tela de detalhe rica — onde sparklines, tarefas, KPIs completos e histórico vivem confortavelmente.

**4. Descoberta de Features (Tricomas, Treinamento, Histórico, IA)**
Essas features existem e são valiosas. Nenhum usuário novo vai encontrá-las. Um onboarding de 2-3 dias após o cadastro ("Você sabia que pode diagnosticar sua planta com IA?") ou um tour guiado na primeira semana ajudariam muito.

---

## Conclusão

### O que manter
- Offline sync com fila de logs pendentes — correto e bem implementado.
- Skeleton loaders na maioria das páginas — experiência de loading profissional.
- Haptic feedback e safe-area — detalhes mobile-first que fazem diferença.
- Empty state de onboarding com passos numerados na Home — claro e acionável.
- Toast com undo em exclusões — padrão excelente que protege o usuário.
- Sensor IoT (Tuya) com preenchimento automático de campos — diferencial real.
- DisplayMode — a ideia de tela de monitoramento fullscreen é correta.

### O que mudar (por prioridade)
1. **Label no FAB** — 1 hora de trabalho, impacto máximo na descoberta do fluxo principal.
2. **Alertas na nav principal** — 2 horas, urgência real para um app de monitoramento.
3. **QuickLog como formulário, não wizard** — 2-3 dias, transforma o uso diário.
4. **TentCard simplificado** — 1 dia, performance e clareza visual.
5. **Padronizar navegação de volta** — 1 dia, consistência e profissionalismo.
6. **Remover duplicata Tasks/Tarefas** — 2 horas, eliminar risco de bugs.

### Próximo passo mais impactante
Colocar label "Registrar" abaixo do FAB e mover "Alertas" para um slot fixo da bottom nav. São mudanças de 3-4 horas que eliminam os dois problemas mais críticos de descoberta e urgência do app. Tudo o mais pode ser planejado em sprints.
