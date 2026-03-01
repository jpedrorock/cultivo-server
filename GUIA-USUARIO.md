# Guia do Usuário — App Cultivo

Manual de uso do App Cultivo para gerenciamento de estufas de cultivo indoor.

---

## Primeiros Passos

Ao abrir o app pela primeira vez, você verá o painel principal com as suas estufas cadastradas. Se ainda não há estufas, clique em **Criar Nova Estufa** para começar.

O app funciona como PWA (Progressive Web App). No iPhone, toque em **Compartilhar → Adicionar à Tela de Início** para instalar o app e ter acesso rápido sem abrir o navegador.

---

## Painel Principal

O painel principal exibe um card para cada estufa cadastrada. Cada card mostra o nome e dimensões da estufa, a fase atual do ciclo (Manutenção, Vegetativa, Floração, Secagem), a semana atual, os parâmetros ambientais registrados na semana (Temperatura, Umidade Relativa, PPFD e Fotoperíodo), o número de plantas ativas e as tarefas pendentes da semana.

O fotoperíodo é exibido automaticamente com base na fase: **18/6** para Manutenção, Vegetativa e Clonagem; **12/12** para Floração.

---

## Estufas

### Criar uma Estufa

No painel principal, clique em **Criar Nova Estufa**. Preencha o nome, as dimensões (largura × comprimento × altura em cm) e o tipo. Após criar, você pode iniciar um ciclo de cultivo.

### Ciclos de Cultivo

Cada estufa tem um ciclo ativo. Para iniciar um ciclo, acesse os detalhes da estufa e clique em **Iniciar Ciclo**. Selecione a strain e a fase inicial. O sistema rastreia a semana atual automaticamente.

As transições de fase disponíveis são:

| De | Para |
|---|---|
| Manutenção | Vegetativa |
| Vegetativa | Floração |
| Floração | Secagem (Colheita) |
| Secagem | Concluído |

### Registrar Parâmetros

Clique em **Registrar** no card da estufa. Preencha Temperatura (°C), Umidade Relativa (%) e PPFD (µmol/m²/s). O sistema compara automaticamente com os targets da strain e gera alertas se houver desvios.

---

## Plantas

### Lista de Plantas

Acesse **Plantas** no menu lateral. As plantas são agrupadas por estufa, com seções colapsáveis. Use a busca para filtrar por nome ou código, e os filtros para exibir apenas plantas Ativas, Colhidas ou Mortas.

### Cadastrar Nova Planta

Clique em **Nova Planta** e preencha nome, código identificador, strain, estufa atual e data de nascimento ou clonagem.

### Perfil da Planta

Clique em qualquer planta para acessar seu perfil completo, organizado em abas:

**Saúde** — Registre o status de saúde (Saudável, Estressada, Doente, Recuperando), sintomas observados, tratamento aplicado e notas. Faça upload de fotos diretamente da câmera ou galeria.

**Tricomas** — Registre a maturação dos tricomas com percentuais de Clear, Cloudy, Amber e Mixed. Adicione foto macro e a semana do ciclo correspondente.

**LST** — Registre técnicas de Low Stress Training aplicadas: LST, Topping, FIM, Super Cropping, Lollipopping, Defoliação, Mainlining ou ScrOG. Registre também a resposta da planta ao treinamento.

**Observações** — Notas gerais sobre a planta sem categorização específica.

**Fotos** — Galeria completa com lightbox (zoom, navegação entre fotos, download). A última foto é exibida no card da lista de plantas.

### Ações na Planta

No header do perfil, o botão **Ações** oferece: mover para outra estufa, transplantar para floração, iniciar clonagem, registrar colheita, descartar planta e excluir permanentemente.

### Arquivo de Plantas

Acesse **Plantas → Arquivo** para visualizar o histórico completo de plantas colhidas, com data de colheita e peso registrado.

---

## Tarefas

Acesse **Tarefas** no menu lateral para gerenciar as tarefas semanais de cada estufa. As tarefas são organizadas por estufa e por semana do ciclo. Marque as tarefas concluídas com o checkbox — o progresso é salvo automaticamente. Tarefas pendentes da semana atual também aparecem no card de cada estufa no painel principal.

---

## Calculadoras

Acesse **Calculadoras** no menu lateral para abrir o menu de calculadoras disponíveis.

**Rega e Runoff** — Calcule o volume ideal de rega por planta com base no tamanho do vaso e fase do ciclo. Registre o volume regado e o runoff coletado (em ml) para calcular o percentual de runoff. O histórico de aplicações é salvo por estufa.

**Fertilização (Nutrientes)** — Calcule a receita de sais minerais (Nitrato de Cálcio, Sulfato de Potássio, MKP, Sulfato de Magnésio, micronutrientes) para a fase e semana atual. O app exibe o NPK resultante, o EC estimado e permite salvar receitas para reutilização.

**Conversor Lux → PPFD** — Converta leituras de luxímetro para PPFD (µmol/m²/s) com um slider visual.

**Conversor PPM ↔ EC** — Converta valores entre PPM e EC (mS/cm) bidirecionalmente.

**Calculadora de VPD** — Calcule o Vapor Pressure Deficit com base na temperatura e umidade relativa.

**Calculadora de pH** — Calcule os ajustes necessários de pH Up ou pH Down para atingir o pH alvo.

---

## Histórico

Acesse **Histórico** no menu lateral para visualizar todos os registros de parâmetros em formato de tabela, agrupados por estufa. Selecione a estufa no menu superior para filtrar o histórico e visualizar os gráficos de evolução temporal de Temperatura, Umidade e PPFD.

---

## Alertas

### Central de Alertas

Acesse **Alertas** no menu lateral para ver todos os alertas ativos. Os alertas são gerados automaticamente quando os parâmetros registrados desviam dos targets semanais da strain selecionada no ciclo. Cada alerta exibe o parâmetro afetado, o valor registrado, o target esperado e a diferença percentual.

### Configurações de Alertas

Acesse **Configurações → Alertas** para definir os limites de tolerância para cada parâmetro antes que um alerta seja gerado. Por padrão, desvios acima de 10% geram alertas de atenção e acima de 20% geram alertas críticos.

---

## Strains

Acesse **Strains** no menu lateral para gerenciar as variedades cadastradas. Cada strain pode ter targets semanais definidos para cada fase do ciclo (Vegetativa e Floração), incluindo Temperatura mínima e máxima, Umidade Relativa mínima e máxima e PPFD alvo. Os targets são usados como referência para geração de alertas e exibição de desvios nos registros.

---

## Registro Rápido

Acesse **Registro Rápido** no menu lateral para registrar parâmetros de múltiplas estufas em uma única tela, sem precisar navegar entre as páginas de cada estufa. Ideal para o registro diário rápido.

---

## Configurações

Acesse **Configurações** no menu lateral para:

**Notificações** — Ative notificações push para receber alertas no navegador quando parâmetros estiverem fora dos targets. Requer permissão do navegador.

**Backup** — Exporte todos os dados do app em formato JSON para backup local. Importe um backup anterior para restaurar os dados.

**Tema** — Alterne entre tema escuro, claro ou alto contraste.

---

## Dicas de Uso no iPhone

O App Cultivo foi otimizado para uso no iPhone. Algumas dicas práticas:

**Instale como PWA** — Toque em Compartilhar → Adicionar à Tela de Início para acesso rápido e experiência de app nativo, sem precisar abrir o navegador.

**Teclado numérico** — Campos de temperatura, umidade e PPFD abrem automaticamente o teclado numérico para agilizar o registro.

**Fotos** — Use a câmera diretamente no app para registrar o estado das plantas. As fotos são comprimidas automaticamente para aspect ratio 3:4 e armazenadas com segurança no S3.

**Feedback tátil** — Os botões de ação têm vibração e animação ao toque para confirmar a interação. Ações destrutivas (excluir, descartar) têm vibração mais forte como aviso.

**Scroll horizontal nas abas** — No perfil da planta, deslize horizontalmente para navegar entre as abas Saúde, Tricomas, LST, Observações e Fotos.
