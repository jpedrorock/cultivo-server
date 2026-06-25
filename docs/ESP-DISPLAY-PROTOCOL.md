# Protocolo ESP-DISPLAY-API

Documentação do protocolo HTTP/SSE entre o **display ESP32** (firmware em `esp32-display/`) e o servidor (`server/_core/deviceRoutes.ts`).

> Gerado como parte da auditoria (T27). Fonte da verdade é `server/_core/deviceRoutes.ts` — se divergir, o código vence.

## Autenticação

Todas as rotas (exceto a geração de token) exigem o header:

```
X-Device-Token: <token>
```

O token é validado contra a tabela `deviceTokens` (`SELECT tentId, groupId, ownerUserId FROM deviceTokens WHERE token = ?`). Cada token está vinculado a **uma estufa** (`tentId`). Tokens antigos podem ter `ownerUserId = NULL` (criados antes da migration `add-deviceTokens-ownerUserId`).

Geração de token (rota autenticada por **usuário web**, não por device):
- `POST /api/device/generate-token` — o usuário logado gera um novo `deviceToken` para uma estufa.

## Endpoints

| Método | Rota | Propósito |
|--------|------|-----------|
| `GET`  | `/api/device/display/:tentId` | Dados consolidados pra renderizar a tela do display (ambiente, fase, semana, etc.) |
| `POST` | `/api/device/readings` | Grava uma leitura de pH/EC/PPFD enviada pelo ESP |
| `POST` | `/api/device/quick-log` | Log rápido do ESP (FAB da aba Plantas) |
| `POST` | `/api/device/watering` | Registra uma rega manual |
| `GET`  | `/api/device/tasks/:tentId` | Tarefas pendentes da estufa |
| `POST` | `/api/device/task-complete` | Marca/desmarca uma tarefa como feita |
| `GET`  | `/api/device/scenes` | Itens vinculados à estufa (cenas + devices), na ordem do display |
| `POST` | `/api/device/scene/:slotIdx/trigger` | Dispara cena Tuya por slot (0–9 → env `TUYA_SCENE_X`) |
| `POST` | `/api/device/scene-by-id/:sceneId/trigger` | Dispara cena Tuya pelo `sceneId` real |
| `POST` | `/api/device/device-toggle` | Liga/desliga um device Tuya vinculado |
| `POST` | `/api/device/refresh-tuya/:tentId` | Força um poll Tuya (cria `dailyLog`) |
| `POST` | `/api/device/alert-ack` | Marca alerta como visto (`NEW` → `SEEN`) |
| `GET`  | `/api/device/history/:tentId` | Histórico 24h/7d/30d pra gráfico |
| `GET`  | `/api/device/history-all/:tentId` | 4 métricas numa chamada só (sparklines) |
| `GET`  | `/api/device/stream/:tentId` | **SSE** — alertas em tempo real (ver abaixo) |

## SSE — `/api/device/stream/:tentId`

Substitui o polling de alertas pelo ESP. O servidor mantém a conexão aberta e empurra eventos de alerta conforme chegam.

- O cliente pode passar `?since=<lastSeenId>` pra não receber alertas já vistos antes da reconexão.
- **Limitação conhecida (T26):** não há buffer/replay persistente — alertas gerados *durante* uma desconexão podem ser perdidos se não estiverem marcados como `NEW` no banco no momento da reconexão. Melhoria futura: ring-buffer em memória dos últimos N eventos.

## Cache

`GET /api/device/scenes` tem cache em memória (TTL ~90s — `SCENES_CACHE_TTL_MS`) pra não consultar o banco a cada chamada do display.

## Notas de versão do firmware

- O firmware (`esp32-display/src/main_lvgl.cpp`) faz OTA via GitHub Releases comparando `FW_VERSION` com a `tag_name` do release mais recente.
- A confirmação de cena (modal "Iniciar X?") e o countdown de rega são UI do firmware, não do protocolo.
