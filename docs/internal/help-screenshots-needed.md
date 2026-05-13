# Help — Lista de Screenshots Necessários

> Imagens pra substituir os `<ImagePlaceholder />` em `client/src/pages/Help.tsx`.
> Quando você bater os screenshots, salva em `client/public/help/` e substitui
> os placeholders por `<img src="/help/setup-1.png" ... />`.

## Convenções

- **Formato**: PNG (preservar transparência se tiver) ou WebP
- **Densidade**: 2x (Retina) — exporta em dobro do tamanho indicado e o navegador escala
- **Cantos arredondados**: NÃO precisa cortar — o CSS já aplica `rounded-xl`. Captura o screen inteiro do app/dialog
- **Modo escuro**: capturas em **dark mode** (o app é predominantemente dark)
- **Conteúdo**: use a estufa "Estufa C" / "Flora" mesmo, mas tira dados sensíveis se houver (CPF, email visíveis)
- **Localização**: salvar em `client/public/help/<categoria>-<numero>.png` (ex: `setup-1.png`, `plantas-2.png`)

## Como salvar e usar

```bash
# 1. Salva o screenshot em:
client/public/help/setup-1.png

# 2. No Help.tsx, substitui o placeholder:
# ANTES:
imageCaption="Tela 'Nova estufa' com formulário preenchido — dimensões + categoria"

# DEPOIS, no <Step ...>, troca por:
imageSrc="/help/setup-1.png"
imageAlt="Tela 'Nova estufa' com formulário preenchido"
```

> Vou ajustar o componente `<Step>` pra aceitar `imageSrc` quando você mandar a primeira imagem.

## Lista completa (33 screenshots)

### 1. Setup — Primeiros passos (5 imagens)

| # | Arquivo | Tamanho | Conteúdo |
|---|---|---|---|
| 1 | `setup-1.png` | 1200×700 | Modal "Nova estufa" preenchido — campos: Nome="Estufa A", Categoria=Vegetativa, Dimensões=80×80×160 |
| 2 | `setup-2.png` | 1200×700 | Modal de adicionar planta com dropdown de strain aberto |
| 3 | `setup-3.png` | 1200×700 | Modal "Iniciar ciclo" com fase=Vegetativa selecionada |
| 4 | `setup-4.png` | 800×900 | Botão `+` expandido mostrando os 3 modos (Status / Saúde / Tricomas). Captura focada no popover |
| 5 | — | — | (Sem imagem, só texto) |

### 2. Plantas & ciclos (3 imagens)

| # | Arquivo | Tamanho | Conteúdo |
|---|---|---|---|
| 1 | `plantas-1.png` | 1200×700 | Tela de detalhe da estufa mostrando as 4 tabs no topo (Visão geral, Plantas, SmartLife, Histórico) |
| 2 | `plantas-2.png` | 1200×500 | Card de ciclo na visão geral com botão "Avançar para Floração" destacado |
| 3 | `plantas-3.png` | 1200×700 | Tela de detalhe de planta com as 7 abas visíveis (Visão geral, Saúde, Tricomas, LST, Galeria, Ambiente, Runoff) |

### 3. Saúde & fotos (3 imagens)

| # | Arquivo | Tamanho | Conteúdo |
|---|---|---|---|
| 1 | `saude-1.png` | 1200×900 | Modal de "Registro de saúde" com 2 slots de foto preenchidos + dropdowns de status/sintomas |
| 2 | `saude-2.png` | 1200×800 | Aba Galeria de uma planta — grid 3 colunas de fotos com data |
| 3 | `saude-3.png` | 1200×700 | Tela de análise de tricomas com sliders de % (Translúcidos/Opacos/Âmbar) |

### 4. LST — Treinamento (3 imagens)

| # | Arquivo | Tamanho | Conteúdo |
|---|---|---|---|
| 1 | `lst-1.png` | 1200×700 | Aba LST da planta com timeline de técnicas aplicadas (3-4 entries cronológicas) |
| 2 | `lst-2.png` | 1200×500 | Modal de registrar técnica com dropdown de técnicas aberto (lista completa visível) |
| 3 | `lst-3.png` | 1200×700 | Modal de registrar técnica preenchido — data, técnica="Topping", observações |

### 5. SmartLife & sensores (5 imagens)

| # | Arquivo | Tamanho | Conteúdo |
|---|---|---|---|
| 1 | `smartlife-1.png` | 1200×800 | Tela Configurações > SmartLife com credenciais Tuya preenchidas (mascarar accessSecret!) |
| 2 | `smartlife-2.png` | 1200×800 | Aba SmartLife dentro de uma estufa — seção de sensores com checkboxes |
| 3 | `smartlife-3.png` | 1200×700 | Grid 2x3 de cenas/dispositivos vinculados a uma estufa |
| 4 | `smartlife-4.png` | 1000×600 | Modal "Conectar Display" com campo de código e botão "Conectar" |
| 5 | `smartlife-5.png` | 1200×800 | Card FloraCam aberto com player HLS rodando (preview do vídeo, pode ser frame escolhido) |

### 6. Histórico & alertas (3 imagens)

| # | Arquivo | Tamanho | Conteúdo |
|---|---|---|---|
| 1 | `historico-1.png` | 1200×900 | Aba Histórico com 2-3 gráficos empilhados (temp+RH no topo, PPFD/DLI abaixo) |
| 2 | `historico-2.png` | 1200×700 | Tela de configuração de alertas com sliders de limite (temp, RH, etc) |
| 3 | `historico-3.png` | 1200×500 | Tabela de targets semanais da strain (colunas: semana, temp, RH, PPFD, pH, EC) |

### 7. Tarefas semanais (2 imagens)

| # | Arquivo | Tamanho | Conteúdo |
|---|---|---|---|
| 1 | `tarefas-1.png` | 1200×800 | Tela de Tarefas com checkboxes agrupados por estufa, algumas marcadas |
| 2 | `tarefas-2.png` | 1200×700 | Tela de Templates de tarefas em Configurações |

### 8. Ferramentas (3 imagens)

| # | Arquivo | Tamanho | Conteúdo |
|---|---|---|---|
| 1 | `ferramentas-1.png` | 1200×800 | Menu de calculadoras com grid de cards (VPD, DLI, EC/PPM, etc) |
| 2 | `ferramentas-2.png` | 1200×500 | Tela de Backup com botões Export/Import |
| 3 | `ferramentas-3.png` | 800×1400 | Tela do iOS mostrando "Adicionar à Tela de Início" do Safari (orientação vertical de celular) |

## Dicas práticas pra capturar

### No desktop (Chrome/Edge)

1. **F12 → Ctrl+Shift+M** ativa modo "device toolbar"
2. Escolhe um preset (iPhone 14 Pro ou similar) ou define manualmente: 390×844 (mobile) ou 1200×800 (desktop)
3. **Ctrl+Shift+P** → digite "Capture screenshot" → escolhe "Capture node screenshot" pra capturar elemento específico OU "Capture full size screenshot" pra tela inteira
4. PNG cai na pasta de downloads

### Modo dark garantido

Antes de capturar, vai em **Configurações → Aparência → Dark** no app. Confirma que está em dark mode no preview.

### Limpeza de captura

Apaga:
- Notificações push
- Toast messages residuais
- Hover states "presos"
- Modal de cookie banner se aparecer

### Mock data ok

Pode usar plantas reais suas (NL-1, etc) ou cria estufa de teste só pra screenshot. Se for testar com dados fakes:
- Estufa: "Demo VEG" / "Demo FLORA"
- Plantas: "Northern Lights #1", "Gelato #2"
- Strain: pega uma pré-cadastrada

## Quando enviar

Me manda o link de download do batch (Drive/Dropbox/zip) ou cola screenshot por screenshot na nossa conversa. Eu substituo todos os placeholders e ajusto sizing se preciso.

**Não precisa mandar tudo de uma vez.** Pode ser por categoria — vou substituindo conforme chega.

---

## Sobre vídeos (pro futuro)

Quando você quiser gravar os 3 vídeos placeholders do hub:

### Setup técnico

- **Tool grátis**: [Loom](https://loom.com) (Chrome extension, conta grátis 25 vídeos)
- **Alternativa**: [OBS Studio](https://obsproject.com) (mais profissional, sem limite)
- **Mobile**: usa "Screen Record" nativo do iOS/Android

### Duração ideal

- 30s — 2min cada. Mais curto = mais visualização
- Sem música de fundo (distrai)
- Voz opcional — pode ser só legenda

### Onde hospedar

- **YouTube** (unlisted): grátis, fácil de embedar
- **Loom**: link direto, player limpo
- **R2/S3**: se quiser controle total

### Como integrar no app

Quando tiver os vídeos, me passa os links/IDs do YouTube e eu substituo os 3 cards placeholders do hub por embeds reais (player nativo do YouTube com lazy load).

---

## Estado atual do refactor

✅ Hub visual implementado em `/help`
✅ 8 categorias com sub-páginas em `/help/<id>`
✅ Placeholders de imagem com size + caption
⏳ **Aguarda screenshots** pra trocar placeholders por `<img>`
⏳ Vídeos: cards placeholder no hub aguardam URLs do YouTube/Loom
