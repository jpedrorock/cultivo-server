# Cultivo UI Simulator (Mac · SDL2 + LVGL)

Simulador desktop da UI do display ESP32, pra iterar visualmente sem precisar
de hardware. Renderiza em 480×320 (tamanho real do display JC4832W535), usa
as mesmas fontes Manrope e ícones do firmware, e mocka os sensores com
variação senoidal pra a tela parecer "ao vivo".

## Setup (Mac)

### 1. Instalar dependências (uma vez só)

```bash
brew install cmake sdl2
```

### 2. Compilar

```bash
cd esp32-display/sim
cmake -B build
cmake --build build -j
```

Na primeira vez, o CMake baixa o LVGL 9.2.2 via `FetchContent` (~30MB, uns 2min).
Compilação incremental depois leva 1–3s.

### 3. Rodar

```bash
./build/cultivo_sim
```

Abre uma janela 480×320 com a UI do Cultivo. **Mouse funciona como touch** (clique
nos ícones da navbar, no arco de TEMP, no card de UMIDADE, nos +/- da tela PPFD).

Pra fechar: Cmd+Q ou fecha a janela.

## Telas portadas

| Tela | Status | Nota |
|------|--------|------|
| Home | completa | arc TEMP + 3 mini-cards com sparklines animados |
| LUX / PPFD | completa | toggle + valor + botões -/+ + SALVAR |
| pH / EC | stub | só placeholder, falta portar |
| Tarefas | stub | só placeholder, falta portar |
| Histórico | stub | só placeholder, falta portar |

Modal de configuração, AP portal, splash screen e keyboard não são portados
(são fluxos de setup, não interessam pra iterar visualmente).

## Fluxo de trabalho

1. Edita `cultivo_ui.cpp` (cor, layout, texto, animação)
2. `cmake --build build -j` (1–3s)
3. `./build/cultivo_sim` — vê o resultado na janela
4. Quando gostar do resultado, copia a função `buildX()` ou `refreshX()`
   modificada para `src/main_lvgl.cpp` (assinatura e estrutura são idênticas)

## Como isto se relaciona com o firmware

- **Compartilha:** `src/cultivo_icons.c`, `src/fonts/*.c`, paleta de cores,
  helpers (`makeCard`, `applyBloom`, `startBreathe`, `sw`/`sh`), estrutura
  de navbar e screens.
- **Não compartilha:** nada de Arduino (Serial, WiFi, HTTPClient, Preferences,
  OTA), FreeRTOS tasks, I2C touch driver. O simulador não precisa dessas
  coisas — o SDL2 da LVGL 9 dá display + mouse direto.
- **Diferenças esperadas:**
  - Sem NVS: não tem modal de config (gear icon é inerte).
  - Sem rede: ícone WiFi é sempre verde ("online" forçado).
  - Sensores variam via `lv_timer` em senoide, não via fetch HTTP.

## Troubleshooting

**`SDL2 not found`**
```bash
brew install sdl2
brew --prefix sdl2   # confirma path, ex: /opt/homebrew/opt/sdl2
```
Se ainda não achar, exporta `CMAKE_PREFIX_PATH`:
```bash
export CMAKE_PREFIX_PATH=$(brew --prefix sdl2)
cmake -B build
```

**`lv_conf.h: No such file`**
O CMake deveria injetar `LV_CONF_PATH` automaticamente. Se falhar, limpe
o cache:
```bash
rm -rf build
cmake -B build
```

**Janela abre preta / travada**
O driver SDL da LVGL 9 espera `LV_USE_SDL=1` em `lv_conf.h` (já configurado).
Confira se `LV_COLOR_DEPTH=16` também está ativo — o mesmo do ESP32.

**Ícones aparecem coloridos errados**
Os ícones são A8 (alpha-only) e recebem cor via `image_recolor`. Se o recolor
não aplicar, verifique se o formato do ícone em `cultivo_icons.c` é
`LV_COLOR_FORMAT_A8`.
