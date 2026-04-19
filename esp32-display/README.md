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
- **Fase B** (atual): touch + navegacao inferior + tela de rega
- **Fase C** (proxima): telas de pH/EC e tarefas
- **Fase D**: conexao WiFi + endpoints `/api/device/*`

## Hardware real

Board final: **ESP32-S3 JC4832W535** (3.5" IPS 480x320, touch capacitivo AXS15231B).
Ao migrar do Wokwi para hardware real, trocar `Adafruit_ILI9341` por `Arduino_GFX`
com driver `AXS15231B`. A logica de UI/touch permanece identica.
