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

---

## ⚠️ ADENDO sprint 1 — state real-time da Tuya (descoberto após deploy)

### Problema observado em produção

ESP32 testado em prod com 1 device vinculado (LED 65W), poll a cada 30s.
Logs do firmware mostram `state=OFF` em **todas** as chamadas `/api/device/scenes`,
mesmo quando o user liga a luz pelo SmartLife. Isso quebra a ideia do display
refletir o estado real (ponto principal de ter device toggle).

```
[net] items: 2 total (1 cenas, 1 devices) [novo]
[net]   [1] type=device name=LED 65W state=OFF iconHint=light id=eb35a5...
[net] items: 2 total (1 cenas, 1 devices) [novo]   ← 30s depois, ainda OFF
[net]   [1] type=device name=LED 65W state=OFF iconHint=light id=eb35a5...
```

### Causa provável

O endpoint `GET /api/device/scenes` provavelmente retorna o `state` cacheado
(da última escrita via `/api/device/device-toggle` ou default `false` da
tabela `tentDevices.state`). Não consulta a Tuya em tempo real.

### O que precisa mudar no server

1. **`GET /api/device/scenes`** — pra cada item `type='device'`, fazer
   chamada Tuya `GET /v1.0/devices/{deviceId}/status` (ou `/v2.0/cloud/...`)
   e retornar o `state` real (booleano do datapoint switch_1, switch_led, etc).

   Custo: ~1 chamada Tuya por device por poll. Com 6 devices max e poll
   10min, e' ~36 calls/hora — bem dentro do rate limit Tuya (100k/dia).

   Otimizacao: cache de 10s no server (se duas chamadas /scenes vierem em
   sequencia, usa o mesmo state).

2. **`POST /api/device/device-toggle`** — response deve retornar o `state`
   final REAL (releitura da Tuya apos o toggle), nao o `desiredState`.
   Tuya as vezes ignora ou inverte o comando dependendo do tipo do device.
   ESP ja' parseia `{state: bool}` da resposta — so' precisa o server
   colocar la' (em vez de echar o request).

### Endpoint Tuya pra ler state

```ts
// server/lib/tuya.ts — funcao ja' existe? (readTuyaDeviceStatus retorna
// tempC/rh, mas pra device generico precisa do datapoint correto):

// GET /v1.0/devices/{deviceId}/status
// Resposta: {result: [{code: "switch_1", value: true}, ...]}
// Pra um plug/luz simples, pegar code = "switch_1" ou "switch_led".
```

### O que o ESP firmware ja' tá pronto pra fazer

- ✅ Parsea `state` em `parseItemSlot` (vê na linha do log acima)
- ✅ Pinta visual ON/OFF claramente diferenciado (bg primary cheio + ícone
  branco vs bg neutro + ícone dim, glow primary quando ON)
- ✅ Poll a cada 30s (temporário pra debug — vou voltar pra 10min depois
  que server estiver consultando real-time, daí faz sentido o intervalo
  maior já que cada chamada vai fazer round-trip Tuya)
- ✅ Tap no device parseia `state` retornado pelo POST `/device-toggle`
  (sobrescreve storage local com o real)
- ✅ Reverte UI se POST falhou (offline, timeout, server 500)

### TODO do meu lado quando server estiver pronto

- Reverter `SCENES_FETCH_INTERVAL` de 30s pra 10min (já que cada poll vai
  custar mais round-trip Tuya, vale o intervalo maior)
- Talvez adicionar: ao entrar na aba CENAS, forçar 1 fetch imediato pra UI
  refletir state mais fresco que o último poll automático

### Teste end-to-end depois do fix

1. User liga LED 65W pelo SmartLife
2. Em até 30s o display ESP atualiza pra ON visualmente (bg verde + glow)
3. User toca no card LED no display → desliga
4. Volta no SmartLife — luz tá apagada
5. Outro user liga manual → display volta pra ON em <30s

Sem fechar essa parte, o feature de device toggle fica meio inutil — UI
mente sobre o estado real.

---

## ⚠️ ADENDO 2 — toggle nao executa de fato na Tuya (descoberto em prod)

### Sintoma observado pelo user

Toca no LED 65W no display ESP. Visual:
- Card mostra "carregando" (border primary + opa 70) por ~1s
- VOLTA pro estado anterior (continua mostrando OFF)
- A luz fisica **nao muda** no SmartLife

Lado app web (`/SmartLife` page) usando o MESMO `controlTuyaDevice` (via
tRPC `tuya.sendDeviceCommand`) — **funciona**. Liga/desliga normal.

### Causa provavel

Endpoint `/api/device/device-toggle` faz re-consulta apos 500ms pra
confirmar state real. Se Tuya nao executou o comando (mesmo retornando
success: true do POST), a re-consulta retorna o state ANTIGO. Server
responde `{state: <antigo>}`. ESP pinta antigo → "voltou ao estado".

### Diferenca relevante entre os 2 caminhos

| Aspecto | App web (tRPC) | ESP (REST) |
|---|---|---|
| Auth | JWT user | X-Device-Token |
| Config Tuya | `getTuyaConfig(ctx.user.id)` — user logado | `WHERE u.groupId = ? LIMIT 1` — primeiro user do grupo |
| switchCode | `status.switchCode ?? mapping.switchCode` (vem do mapping salvo) | Descoberto on-the-fly via `getTuyaDeviceSwitchState` |
| Re-consulta | Nao tem (UI faz refetch separado depois) | Sim (500ms apos toggle) |

### Hipoteses pra investigar (server logs precisam)

1. **switchCode errado**: `getTuyaDeviceSwitchState` itera `SWITCH_CODES`
   e pega o PRIMEIRO match. Pra device LED Tuya as vezes tem `switch_1`
   E `switch_led` simultaneos — o codigo certo pra o LED ser `switch_led`
   mas a funcao pega `switch_1` (que tuya aceita silenciosamente sem fazer
   nada). App web salva `mapping.switchCode` no `tuyaSensorMappings` e
   passa direto — sem essa logica de descoberta.

2. **Config Tuya errada**: se o grupo tem multiplos users, cada um com sua
   propria config Tuya, o LIMIT 1 pode pegar a config "errada" (de outro
   projeto Tuya). API call vai com accessId diferente, comando "vazio
   no vacuo".

3. **Race condition na re-consulta**: 500ms pode nao bastar. Tuya as vezes
   demora 2-3s pra propagar pro device fisico. Re-consulta retorna state
   antigo → state retornado pra ESP fica wrong.

### Como debugar (server-side)

Olhar logs prod quando user toca no LED no ESP:

```
[Device] device-toggle device=eb35a... -> true (?: ?)
[Device] device-toggle device=eb35a... desired=true but Tuya reports false (propagation lag?)
```

- Se aparece "OK" no primeiro log mas "Tuya reports false" no segundo →
  hipotese 1 ou 3
- Se aparece "FAIL" no primeiro → controlTuyaDevice retornou erro mas
  endpoint retornou 502 → ESP veria HTTP 502 (nao e' o caso, ESP recebe
  200)

Tambem util: log do JSON de status na re-consulta (`debugDps`) — qual
DPs o device expoe + qual switchCode foi escolhido. Se for `switch_1`
mas device e' uma lampada, switchCode esta errado.

### Possivel fix

**Opcao A** (recomendada): adicionar coluna `switchCode VARCHAR(50)` em
`tentDevices`. Quando user vincula device pela UI web, salva o switchCode
descoberto via debug (igual `tuyaSensorMappings`). Endpoint usa
`tentDevices.switchCode` em vez de descobrir on-the-fly. Alinha com o
pattern do app web e elimina a fonte de switchCode errado.

**Opcao B**: tirar a re-consulta. ESP pollar /scenes a cada 30s ja' captura
a mudanca eventual. Sem re-consulta, server retorna `state: desired`,
ESP pinta optimisticamente, e proximos polls confirmam estado real (ou
revertem se Tuya nao executou).

**Opcao C**: aumentar delay da re-consulta pra 2s + ler `debugDps` pra
confirmar que estamos lendo o switchCode certo.

### O que ESP firmware ja' faz

Fix recente (commit 3a209f2): tirou optimistic toggle. UI agora SO' pinta
quando recebe state real do server. Por isso o "volta ao antigo" e' obvio
agora — antes ficava confuso com optimistic.

Tap → "carregando" → recebe state do server → pinta. Se server retornar
state errado, ESP pinta errado. ESP esta correto, server precisa retornar
state certo.
