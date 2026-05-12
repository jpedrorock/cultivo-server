# Refactor Plan — Modular Split (Fase 4.11)

Este documento descreve o plano de decomposição do `src/main_lvgl.cpp` (2074 linhas) em módulos coesos, para execução futura sob ambiente de compilação local.

## Estado atual

```
src/
├── main_lvgl.cpp      # 2074 linhas — TUDO
├── hal_platform.h     # 85 linhas — Wokwi vs real (✓ Fase 4.15)
├── cultivo_icons.c/h  # Ícones LVGL (já separado)
└── fonts/             # Fontes Manrope (já separado)
```

## Estado desejado

```
src/
├── main.cpp           # ~200 linhas — setup() + loop()
├── hal_platform.h     # já feito
├── config.cpp/h       # NVS + struct NetConfig — ~90 linhas
├── net/
│   ├── wifi_mgr.cpp/h # connectWifi, AP portal
│   ├── http_client.cpp/h # httpBegin + cert ISRG
│   ├── api.cpp/h      # fetchDisplayData/Tasks, postReading, netTask
│   └── ota.cpp/h      # startOTA, Update endpoint
├── ui/
│   ├── style.cpp/h    # makeCard, makeLabel, applyBloom, cores
│   ├── anim.cpp/h     # startBreathe, applyRingPulse
│   ├── modal_config.cpp/h # openConfigModal + scan
│   ├── matrix_boot.cpp/h  # splash screen
│   └── screens/
│       ├── home.cpp   # buildHome + refreshHomeValues
│       ├── lux.cpp    # buildLux + PPFD/LUX logic
│       ├── phec.cpp   # buildPhEc + teclado numerico
│       ├── tarefas.cpp
│       └── grafic.cpp # buildGrafic + applyHistToChart
└── cultivo_icons.c/h
```

## Ordem de extração (low → high risk)

Cada passo compila e roda antes de prosseguir.

### Passo 1 — `config.{cpp,h}` (baixo risco)
Variáveis: `prefs`, `netCfg`.
Funções: `loadConfigFromNVS`, `saveConfigToNVS`, `clearConfigNVS`.
Dependências externas: Preferences.h apenas.
**Validação:** boot ainda persiste/recupera config.

### Passo 2 — `net/ota.{cpp,h}` (baixo risco)
Inclui: `otaPass`, `startOTA()`, handler de `/update` do AP portal.
Não depende de LVGL.
**Validação:** `pio run -t upload --upload-port cultivo-XXYY.local` funciona.

### Passo 3 — `net/http_client.{cpp,h}` (médio risco)
Inclui: cert ISRG_ROOT_X1, httpPlainClient, httpSecureClient, `httpBegin()`.
Dependência: WiFi.h, HTTPClient.h, WiFiClientSecure.h.
**Validação:** fetchDisplay continua retornando 200.

### Passo 4 — `net/api.{cpp,h}` (médio risco)
Inclui: todas as funções `fetchX()` e `postX()`, `netTask`, `uiNeedsRefresh`, `refreshPending`, `lastFetch`.
Depende de: config.h (netCfg), http_client.h, ArduinoJson.h.
Expõe: `startNetTask()`, `uiNeedsRefresh` (volatile), `refreshPending`.
**Validação:** fetchs em background continuam atualizando a UI.

### Passo 5 — `ui/style.{cpp,h}` + `ui/anim.{cpp,h}` (médio risco)
Constantes `COL_*`, `sw()/sh()`, `makeCard`, `makeLabel`, `applyBloom`, `startBreathe`, `applyRingPulse`, `fx_anim_y_cb`.
Primitivas usadas por TODAS as screens — extrair aqui desbloqueia extrair screens depois.
**Validação:** UI visual idêntica.

### Passo 6 — `net/wifi_mgr.{cpp,h}` (médio risco)
Inclui: AP portal HTML + handlers, `connectWifi`, `startApPortal`, `apPortalActive`, scan assíncrono.
Depende de: config.h (pra saveConfig), style.h (pra buildApScreen).
**Validação:** primeiro boot sem config abre AP portal, celular configura, reboot conecta.

### Passo 7 — `ui/screens/*.{cpp,h}` (alto risco)
Cada tela compartilha globais (tempC, rh, lblTemp, arcTemp, etc). Extrair exige:
- Mover os globais de "sensor state" pra `app_state.h`
- Mover os ponteiros LVGL de cada screen pra seu próprio arquivo
- Expor funções `buildX()` e `refreshX()`

Ordem dentro desse passo: home (tem refreshHomeValues), grafic, phec, lux, tarefas.

### Passo 8 — `ui/matrix_boot.{cpp,h}` + `ui/modal_config.{cpp,h}` (baixo risco)
Matrix boot é autocontido. Modal config depende de wifi_mgr (AP button) e style.

### Passo 9 — `main.cpp`
Sobra só: `setup()`, `loop()`, `#include` de cada módulo, globais irredutíveis (LVGL display buffers).

## Riscos conhecidos

1. **Globais LVGL** (`contentArea`, `screenHome`, etc) são compartilhados entre telas. Colocar em `ui/nav.h` como `extern`.
2. **Event callbacks em lambdas não-capturing** continuam funcionando se os símbolos referenciados forem visíveis via include.
3. **Forward declarations circulares**: `startApPortal` em wifi_mgr chama `buildApScreen` de ui — usar header com apenas declaração.
4. **`static` globals viram não-static**: ao mover pra .cpp dedicado, muitos precisam virar `namespace { ... }` ou ficar `static` ainda (scope de arquivo).
5. **Tempo de build**: múltiplos .cpp = mais unidades de compilação, mas PlatformIO já paraleliza.

## Execução

Requer ciclo `pio run -e esp32dev` entre cada passo para validar zero warnings. Sem compilação, qualquer extração cega arrisca:
- Undefined reference (símbolo não exportado ou header faltando)
- Multiple definition (variável definida em dois .cpp)
- Type mismatch entre declaração no .h e definição no .cpp

**Tempo estimado**: 4-6 horas sob compilação incremental.
