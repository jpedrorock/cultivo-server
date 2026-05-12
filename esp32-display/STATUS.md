# Status — esp32-display deployment (handoff p/ Claude Code local)

**Branch:** `claude/esp32-greenhouse-monitor-yoIDp`
**Hardware:** JC4832W535 (Guition, 3.5" 480x320 landscape, AXS15231B QSPI + touch I2C integrado, ESP32-S3 N16R8)
**Mac local:** PlatformIO 6.1.19 instalado, esptool 5.2.0, porta `/dev/cu.usbmodem112201`
**Repo path no Mac:** `~/Cultivo App ESP32/cultivo-server`

## Onde paramos

### ✅ Funcionando
- Build do firmware (`pio run -e real`) — RAM 42%, Flash 42%
- Upload via USB (auto-download mode funciona, sem precisar segurar BOOT)
- LVGL inicializa, app sobe até `[LVGL] UI pronta`
- Backlight LCD acende (LEDC PWM no GPIO 1, ~80%)
- WiFi/HTTP/NVS preservados — device entra em "modo offline" esperando config
- Backup completo do firmware de fábrica em `~/Desktop/cultivo-stock-fw.bin` (16MB)

### ❌ Quebrado
- **Display não renderiza corretamente.** Sintoma atual: ~32 colunas/linhas no topo são desenhadas, resto da tela fica em azul claro (estado default do AXS15231B sem ser endereçado).
- Suspeita: pinos QSPI errados OU `setRotation(1)` não sendo aplicado via QSPI (display fica em portrait nativo 320x480 e LVGL renderiza em landscape 480x320).

### 🟡 Não testado ainda
- Touch (depende de display funcionar)
- Conexão WiFi + fetch dos dados do backend
- O caminho B do plano (validar UI antiga primeiro) ainda não fechou

## Refatoração de UI (fase 1 done, fase 2 pending)

**Objetivo:** sim (Mac/SDL2) e firmware (ESP32) compartilham `cultivo_ui.cpp`. Foi escolhido caminho **B** ("vamos de B" do user).

### Fase 1 (concluída, pushada)
- `src/cultivo_layout.h` (novo) — `HAL_SCREEN_W/H` + `FONT_*` + cores, sem dep Arduino
- `src/cultivo_ui.h` (novo) — API pública: globals como `extern`, `buildCultivoUI()`, `refreshHomeValues()`, 4 setters de callback (lux/phEc/task/configOpen)
- `src/cultivo_ui.cpp` (novo, copiado de `sim/cultivo_ui.cpp`) — UI completa com flip button, VPD/PPFD, sound wave Histórico, etc. Mock timer guardado por `#ifdef CULTIVO_SIM`. Save callbacks com fallback `printf`.
- `sim/CMakeLists.txt` — aponta pra `../src/cultivo_ui.cpp` + `-DCULTIVO_SIM`
- `sim/cultivo_ui.{cpp,h}` removidos
- `platformio.ini` — adicionado `build_src_filter = +<*> -<cultivo_ui.cpp>` em `env:real` e `env:esp32dev` pra **EXCLUIR** o cultivo_ui.cpp do build do firmware enquanto a fase 2 não termina (firmware ainda usa UI inline antiga em `main_lvgl.cpp`)

### Fase 2 (pendente, NÃO ATAQUE AGORA — esperar display funcionar primeiro)
1. Remover UI inline duplicada de `main_lvgl.cpp`:
   - Funções: `buildHome`, `buildLux`, `buildPhEc`, `buildTarefas`, `buildHistorico`, `buildPlaceholder`, `buildNavbar`, `buildUI`, `refreshHomeValues`, `refreshLuxDisplay`
   - Helpers: `makeCard`, `makeLabel`, `applyBloom`, `startBreathe`, `applyRingPulse`, `cTemp`, `cRH`
   - Globais UI: `lblTemp`, `lblRh`, `lblPh`, `lblEc`, `arcTemp`, `sparkRh/Ph/Ec`, `serRhS/PhS/EcS`, `pulseTimer`, etc.
   - Globais de estado dup: `TENT_NAME`, `FASE`, `tempC`, `rh`, `vpd`, `phv`, `ecv`, `semana`, `totalSem`, `wifiOk`, `currentLux`, `currentPpfd`, `targetPpfd`, `luxMode`, `activeScreen` (todos esses agora vivem em `cultivo_ui.cpp` como extern)
2. Manter em `main_lvgl.cpp`: splash, AP portal, config modal, NVS, WiFi, HTTP (`fetchDisplayData`, `postPpfd`, etc.), `setup()`, `loop()`, `disp_flush`, `ftRead` (já é shim).
3. No `setup()`: substituir `buildUI()` por `buildCultivoUI()`.
4. Registrar callbacks: `cultivoUI_setLuxSaveHandler(postPpfd)`, `cultivoUI_setPhEcSaveHandler(postReading)`, `cultivoUI_setTaskToggleHandler(...)`, `cultivoUI_setConfigOpenHandler(openConfigModal)`.
5. Remover `build_src_filter` do `platformio.ini` pra incluir `cultivo_ui.cpp` no build do firmware.
6. Apagar `git rm`-style as funções deletadas (não comentar com `#if 0`).

Estrutura de funções e globais atual mapeada em detalhe está em commit `4f682da` (mensagem do commit + arquivos novos).

## Problema ATUAL — display

### Diagnóstico do sintoma
- **V1 dos pinos** (CS=45 SCK=47 D0=21 D1=48 D2=40 D3=39): linha vertical 1px à esquerda, multicolorida, estática.
- **V2 dos pinos** (CS=12 SCK=13 D0=11 D1=14 D2=9 D3=8) — atual: faixa de ~32px no topo desenhada, resto azul claro.

A faixa de 32px é consistente com a LVGL renderizando o primeiro chunk (`BUF_LINES=20` lines * 480 wide RGB565) mas o resto dos chunks não chegando ao display. Pode ser:
- Pinos QSPI parcialmente certos (algum dos D0-D3 trocado)
- `setRotation(1)` não aplicado e o display fica em 320x480 portrait, recortando nossas escritas em 480x320
- Init sequence do AXS15231B incompleta via QSPI

### O que já tem no código (commit 612b4c6)
Em `src/hal_platform.h` o `hal_display_init` pra REAL_HARDWARE atualmente faz:
```cpp
ledcSetup(0, 5000, 8); ledcAttachPin(LCD_BL, 0); ledcWrite(0, 200);  // backlight ✅
bus = new Arduino_ESP32QSPI(LCD_CS, LCD_SCK, LCD_D0, LCD_D1, LCD_D2, LCD_D3);
gfx = new Arduino_AXS15231B(bus, LCD_RST, 0, true, 320, 480);
gfx->begin();
gfx->setRotation(1);  // forçado depois do begin
gfx->fillScreen(0xF800); delay(800); // teste vermelho
gfx->fillScreen(0x07E0); delay(400); // verde
gfx->fillScreen(0x001F); delay(400); // azul
gfx->fillScreen(0);
```

O **teste de fillScreen RGB** ainda não foi confirmado pelo user — se a tela inteira piscar 🔴→🟢→🔵, lib+pinos OK e o problema é LVGL/flush. Se pisca parcial, pinos errados.

### Próximas variantes de pinout pra testar (em ordem)
- **V3** (D0-D3 invertidos da V1): CS=45 SCK=47 D0=39 D1=40 D2=48 D3=21
- **V4** (família 9-14): CS=10 SCK=12 D0=11 D1=13 D2=14 D3=9
- **V5** (CS/SCK invertidos): CS=13 SCK=12 (mantém D0-D3 da V2)

Sem datasheet/schematic exato deste lote do JC4832W535, é tentativa-e-erro. Worth tentar buscar `"JC4832W535" arduino_gfx pin` no GitHub — várias publicações com pinout canônico.

### Backup do firmware de fábrica
Em `~/Desktop/cultivo-stock-fw.bin` (16MB). Se brickar, restaura com:
```
esptool --port /dev/cu.usbmodem112201 write-flash 0 ~/Desktop/cultivo-stock-fw.bin
```

Tem também `~/Desktop/ffat.bin` (12MB extraído da partição FAT — vazia, sem assets).

## Comandos úteis (Mac)

```
cd ~/Cultivo\ App\ ESP32/cultivo-server
git status && git log --oneline -3

cd esp32-display
pio run -e real --target clean
pio run -e real -t upload --upload-port /dev/cu.usbmodem112201
pio device monitor -e real --port /dev/cu.usbmodem112201
# IMPORTANTE: fechar monitor (Ctrl+C) antes de re-fazer upload

# Restore stock fw se precisar:
esptool --port /dev/cu.usbmodem112201 write-flash 0 ~/Desktop/cultivo-stock-fw.bin
```

## Decisões já feitas

- **Caminho B** (validar hardware com UI antiga, depois fase 2). Estamos no validar hardware.
- **Performance > efeitos** — flip button da Home usa só hide/show, sem animação 3D.
- **DLI + auto-dim** ficaram em backlog (depois de display funcionar + fase 2).
- **Sem SD card** — backend cloud + flash interna bastam.
- **Touch via AXS15231B integrado** (não FT6336). Protocolo: cmd 11 bytes → read 8 bytes em I2C addr 0x3B. Pinos atuais: SDA=4, SCL=5.

## Histórico curto de commits relevantes

- `612b4c6` debug(hal): teste fillScreen RGB + setRotation explicito
- `15b013b` fix(hal): variante 2 dos pinos QSPI
- `3838d94` fix(hal): ledc API antiga (Arduino-ESP32 2.0.17)
- `ae96836` fix(esp32-display): driver QSPI + pinos corretos pro JC4832W535
- `4f682da` refactor: UI compartilhada entre sim e firmware (fase 1)
- `0b379b2` feat(sim): animacao de onda sonora no Historico
- `d2fc040` feat(sim): Home com 2 faces alternaveis
