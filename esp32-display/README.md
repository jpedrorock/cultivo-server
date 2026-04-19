# Cultivo ESP32 Display

Firmware para display touch de 3.5" rodando em ESP32, espelhando o `DisplayMode.tsx` do app.

## Setup no VS Code

1. Instale as extensoes:
   - **PlatformIO IDE** (compilador Arduino local)
   - **Wokwi Simulator** (Uri Shaked)

2. Obtenha a licenca do Wokwi (gratis para uso pessoal):
   - https://wokwi.com/dashboard/license
   - No VS Code: `Ctrl+Shift+P` -> `Wokwi: Request a new License`

3. Abra **esta pasta** (`esp32-display/`) no VS Code (nao a raiz do repo).

4. Compilar:
   - `Ctrl+Shift+P` -> `PlatformIO: Build`
   - ou clique no icone de check na barra inferior

5. Simular:
   - `Ctrl+Shift+P` -> `Wokwi: Start Simulator`
   - o `diagram.json` e lido automaticamente

## Estrutura

```
esp32-display/
  platformio.ini   config do board e libs
  wokwi.toml       aponta pro .bin compilado
  diagram.json     fiacao do circuito
  src/main.cpp     firmware principal
```

## Fases

- **Fase A** (concluida): display visual com dados mock
- **Fase B** (concluida): touch + navegacao inferior + tela de rega
- **Fase C** (concluida): telas de pH/EC e tarefas
- **Fase D** (concluida): WiFi + endpoints `/api/device/*` + suporte hardware real

## Configuracao WiFi (Fase D)

Edite as constantes no topo de `src/main.cpp`:

```cpp
#define WIFI_SSID    "sua-rede"
#define WIFI_PASS    "sua-senha"
#define SERVER_URL   "http://192.168.1.100:3000"
#define DEVICE_TOKEN "..."     // gere via tRPC `device.createToken` (admin)
#define TENT_ID      1         // ID da estufa no banco
```

Se `WIFI_SSID` estiver vazio, o firmware roda em modo mock (sem rede).

## Build

- **Wokwi (simulacao)**: `pio run -e esp32dev`
- **Hardware real (JC4832W535)**: `pio run -e real -t upload`

## Hardware real

Board: **ESP32-S3 JC4832W535** (3.5" IPS 480x320, touch capacitivo AXS15231B).
Compilado com `-DREAL_HARDWARE`, usa `Arduino_GFX` com driver `AXS15231B`.
A logica de UI/touch e identica ao Wokwi — so muda o driver de display.

**Pinos definidos em `main.cpp`** (verifique com o esquema da sua placa):
- SPI: CS=10, DC=8, RST=14, SCK=12, MOSI=11, MISO=13
- Touch I2C: SDA=4, SCL=5, addr=0x38 (tente 0x3B se nao detectar)

## Endpoints REST consumidos

- `GET  /api/device/display/:tentId` — dados de temp/RH/VPD/pH/EC + ciclo
- `POST /api/device/readings` — salva medicao manual (pH/EC)
- `POST /api/device/watering` — registra rega (litros)
- `GET  /api/device/tasks/:tentId` — lista tarefas da estufa
- `POST /api/device/task-complete` — alterna estado da tarefa

Todos exigem header `X-Device-Token` correspondente ao `tentId`.
