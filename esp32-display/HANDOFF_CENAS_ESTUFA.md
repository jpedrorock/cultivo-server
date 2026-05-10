# Handoff — Cenas + Dispositivos vinculados a Estufa (display ESP32)

Doc pra IA que vai implementar o vínculo de cenas/dispositivos a estufas no app
Cultivo. O display ESP32 já tá pronto pra consumir os endpoints — só falta o
backend (DB + tRPC + REST) e a UI web pra usuário gerenciar.

## Problema

Hoje o display ESP32 mostra **cenas Tuya da conta inteira do user**, sem filtro
por estufa. Isso é ruim porque:

- User com 3 estufas vê cenas das 3 misturadas no display de uma só
- Sem controle de quais cenas/dispositivos aparecem em qual display
- Sem como ter cena compartilhada (ex: "Rega" usada em VEGA e MANUTENÇÃO)

## Solução proposta

User vai poder, no app web (provavelmente na tela da estufa):

1. **Vincular cenas Tuya** a essa estufa (1 cena pode ser vinculada a N estufas)
2. **Vincular dispositivos Tuya** a essa estufa (lâmpada, exaustor, bomba, etc)
3. **Reordenar** os itens (ordem importa pro grid 2x3 do display)

Display ESP32 vai mostrar **só** o que estiver vinculado à estufa dele.

## Schema sugerido

### Tabela `tentScenes` (nova)

```sql
CREATE TABLE tentScenes (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  tentId    INT NOT NULL,
  sceneId   VARCHAR(64) NOT NULL,    -- ID Tuya real (de listTuyaScenesIoTCore)
  name      VARCHAR(100),            -- snapshot do nome (caso user renomeie no Tuya)
  position  INT NOT NULL DEFAULT 0,  -- ordem no grid (0..5)
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tentId) REFERENCES tents(id) ON DELETE CASCADE,
  INDEX idx_tent_position (tentId, position)
);
```

Mesmo `sceneId` pode ter rows pra vários `tentId` → suporta cena compartilhada.

### Tabela `tentDevices` (nova)

```sql
CREATE TABLE tentDevices (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  tentId    INT NOT NULL,
  deviceId  VARCHAR(64) NOT NULL,    -- ID Tuya (de listTuyaDevices)
  name      VARCHAR(100),
  position  INT NOT NULL DEFAULT 0,
  iconHint  VARCHAR(20),             -- "light"|"fan"|"pump"|"heater"|"ac" (ESP escolhe icone)
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tentId) REFERENCES tents(id) ON DELETE CASCADE,
  INDEX idx_tent_position (tentId, position)
);
```

## Endpoints REST do display (modificações)

O ESP autentica via header `X-Device-Token` que mapeia pra `(tentId, groupId)`
em `deviceTokens`.

### `GET /api/device/scenes` — modificar

Hoje retorna `{scenes: [{id, name}]}` da conta inteira.
**Mudar pra**: filtrar por `tentScenes.tentId = device.tentId`, retornar até 6
itens ordenados por `position`.

```jsonc
// Resposta nova:
{
  "items": [
    { "type": "scene",  "id": "abc123",  "name": "Rega VEGA",  "position": 0 },
    { "type": "device", "id": "dev456",  "name": "Lâmpada",    "position": 1, "iconHint": "light", "state": true  },
    { "type": "device", "id": "dev789",  "name": "Exaustor",   "position": 2, "iconHint": "fan",   "state": false },
    // ... max 6
  ]
}
```

Mistura `scene` + `device` em uma lista única ordenada (mais simples pra UI).

### `POST /api/device/scene-by-id/:sceneId/trigger` — manter

Já existe e dispara cena. ESP usa quando user toca um item `type: "scene"`.

### `POST /api/device/device-toggle` — novo

```jsonc
// Request:
POST /api/device/device-toggle
X-Device-Token: ...
{ "deviceId": "dev456", "state": true }   // novo estado desejado

// Response:
{ "success": true, "deviceId": "dev456", "state": true }
```

Internamente: usar `controlTuyaDevice(deviceId, accessId, secret, region, [{code: "switch_1", value: true}])`
ou similar — depende do tipo do device (depende do que `listTuyaDevices` retorna).

### `GET /api/device/scenes` ↔ caching de state

`state` dos devices muda fora do display (user pode ligar a luz pelo SmartLife).
Recomendado: ESP pulla `/api/device/scenes` a cada 10min OU server faz websocket
push (overkill por enquanto, pull resolve).

## tRPC routes pra UI web

User precisa gerenciar via web:

```ts
// tents.scenes.list  → tentScenes WHERE tentId = ?
// tents.scenes.add   → INSERT (tentId, sceneId, name, position)
// tents.scenes.remove → DELETE WHERE id = ?
// tents.scenes.reorder → UPDATE position em batch

// tents.devices.list  → tentDevices WHERE tentId = ?
// tents.devices.add   → INSERT
// tents.devices.remove → DELETE
// tents.devices.reorder → UPDATE position em batch

// Helpers (pra UI mostrar cenas/devices disponíveis pra adicionar):
// tuya.listAllScenes     → lista todas cenas Tuya do grupo (pode reusar listTuyaScenesIoTCore)
// tuya.listAllDevices    → lista todos devices Tuya do grupo (reusar listTuyaDevices)
```

## UI web sugerida (na tela da estufa)

Seção nova "Display ESP32 — Cenas e Controles":
- Grid de 6 slots (max do display)
- Cada slot: dropdown com cenas + devices disponíveis OR vazio
- Drag-reorder
- Toggle "compartilhar com outras estufas" (mostra checkbox de outras estufas)

Quando user salva:
- Faz `tents.scenes.replaceAll({ tentId, items: [...] })` ou similar
- Server invalida o cache (se houver) e na próxima chamada do ESP volta a lista nova

## ESP-side — o que já tá pronto

- `cultivoUI_applyScenes(names[], count)` em `cultivo_ui.h` — chama com nomes
- Grid 2x3, max 6 items, paleta cycling de ícones por slot
- Tap dispara `cultivoUI_setSceneTriggerHandler` callback com idx

## ESP-side — o que precisa mudar (faço eu)

Quando o backend estiver pronto, eu adapto:

1. **Parsear `type: "scene"|"device"`** em `fetchScenes()` (renomeio pra `fetchItems()`)
2. **Storage paralelo** `itemTypes[6]` + `itemStates[6]` além de `sceneIdsLocal[]`
3. **Tap handler**:
   - `type: "scene"` → POST `/scene-by-id/:id/trigger` (atual)
   - `type: "device"` → POST `/device-toggle` com novo state, atualiza `itemStates`
4. **Render visual diferente**:
   - Scene: ícone + nome + flash no tap (atual)
   - Device: ícone + nome + indicador on/off (cor do ícone vivo se on, dim se off)
5. **Ícone por `iconHint`** (light → ic_lightbulb, fan → ic_activity, pump → ic_droplet)

Isso é trabalho meu — me avisa quando o backend tiver:
- `GET /api/device/scenes` retornando o novo formato `{items: [...]}`
- `POST /api/device/device-toggle` funcional

## Teste end-to-end depois

1. User vincula 2 cenas + 2 devices a uma estufa via web
2. Display ESP dessa estufa mostra 4 cards no grid Cenas
3. Tap numa cena → cena dispara na Tuya
4. Tap num device → device liga/desliga, indicador visual muda
5. Próximo poll (10min) ou reset → estado refresh

## Compatibilidade backwards

Endpoints antigos `/scene/:slotIdx/trigger` (env-mapped) podem ser removidos
depois — ninguém mais deve usar quando esse fluxo estiver no ar.
