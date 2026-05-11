# Spec — Menu "Plantas" no Display ESP32

> Documento pra IA que mantém o firmware do display ESP32 (JC4832W535).
> Diz exatamente quais endpoints chamar, formato da resposta e UX sugerida.
> **Não é código pronto** — é a contract entre servidor e firmware.

---

## Objetivo

Adicionar um menu **"Plantas"** no display que mostra cada planta ativa da estufa, seu status de saúde mais recente, e — ao tocar — a última foto do registro de saúde com a data + status.

Substitui a ideia anterior de "ver câmera ao vivo no ESP" (que não rola por causa de H.264/HLS). Esse menu reutiliza fotos que o usuário já registra no app web — então o display fica útil sem nenhum hardware extra.

---

## Endpoints do servidor

Base URL: a mesma usada pelos endpoints atuais (`/api/device/...`).
Auth: header `X-Device-Token: <token>` — igual ao resto (já implementado no firmware).

### 1. Listar plantas da estufa

```
GET /api/device/plants/:tentId
```

**Headers:** `X-Device-Token: <token>`

**Resposta 200:**
```json
{
  "plants": [
    {
      "id": 42,
      "name": "Northern Lights #1",
      "code": "NL-001",
      "stage": "PLANT",
      "healthStatus": "HEALTHY",
      "lastPhotoDate": "2026-05-08T12:30:00Z",
      "hasPhoto": true
    },
    {
      "id": 43,
      "name": "Gelato #2",
      "code": null,
      "stage": "SEEDLING",
      "healthStatus": null,
      "lastPhotoDate": null,
      "hasPhoto": false
    }
  ]
}
```

**Campos:**
- `id` — int, usado pra montar URL da foto
- `name` — string até 100 chars
- `code` — string até 50 chars OU `null`
- `stage` — `"CLONE" | "SEEDLING" | "PLANT"`
- `healthStatus` — `"HEALTHY" | "STRESSED" | "SICK" | "RECOVERING"` OU `null` (sem registros de saúde)
- `lastPhotoDate` — ISO 8601 OU `null`
- `hasPhoto` — bool. Se `false`, não chama o endpoint de foto

**Erros:**
- `401` — token inválido
- `403` — token não bate com `tentId` (token é amarrado a 1 estufa)
- `400` — `tentId` malformado

**Quando chamar:**
- Toda vez que o usuário entrar no menu Plantas
- Pull-to-refresh / botão atualizar
- NÃO em polling automático — só on-demand (pra economizar bateria do display e load no servidor)

---

### 2. Foto da planta (JPEG binário)

```
GET /api/device/plant/:plantId/photo?w=320&h=240&q=70
```

**Headers:** `X-Device-Token: <token>`

**Query params (opcionais):**
- `w` — largura alvo (default `320`, min `80`, max `1280`)
- `h` — altura alvo (default `240`, min `60`, max `720`)
- `q` — qualidade JPEG (default `70`, min `20`, max `95`)

> O servidor faz resize com `fit: 'inside'` — mantém proporção. Resultado pode ser menor que `w x h` se a foto original tiver outra proporção.

**Resposta 200:**
- Body: **bytes do JPEG** (não JSON!)
- Headers úteis:
  - `Content-Type: image/jpeg`
  - `Content-Length: <bytes>`
  - `X-Health-Status: HEALTHY` — status registrado junto com a foto (pode diferir do `healthStatus` do `/plants` se houver log mais recente sem foto)
  - `X-Log-Date: 2026-05-08T12:30:00Z` — data da foto

**Erros (JSON):**
- `401` — token inválido
- `403` — planta não pertence ao grupo do token
- `404` — planta sem foto OU arquivo inexistente no disco (mostra placeholder)
- `400` — `plantId` ou `photoKey` malformado

**Quando chamar:**
- Quando user tocar numa planta no menu
- NÃO pré-carregar todas — economiza RAM e banda. Lazy load só a planta selecionada.

**Tamanho típico de resposta** (com defaults 320x240 q=70):
- ~8–25 KB por foto. Cabe na RAM/PSRAM tranquilamente.

---

## UX sugerida no display

### Menu "Plantas" (lista)

Cada linha:
```
┌─────────────────────────────────────────┐
│ 🌱 Northern Lights #1     [HEALTHY]  📷 │
│    NL-001 · PLANT                       │
├─────────────────────────────────────────┤
│ 🌿 Gelato #2              [—]           │
│    SEEDLING · sem foto                  │
└─────────────────────────────────────────┘
```

- Ícone do estágio:
  - `CLONE` → 🌱 / `LV_SYMBOL_TINT` ou ícone próprio
  - `SEEDLING` → 🌿
  - `PLANT` → 🌳
- Badge do healthStatus:
  - `HEALTHY` → verde (ou tom claro)
  - `STRESSED` → amarelo
  - `SICK` → vermelho
  - `RECOVERING` → laranja/azul
  - `null` → cinza "—"
- Ícone 📷 (camera) no canto se `hasPhoto === true`
- Lista vazia → "Nenhuma planta ativa nesta estufa"

### Detalhe (após tocar uma linha)

Layout sugerido (display 480x320):
```
┌─────────────────────────────────────────┐
│ ← Northern Lights #1                    │
│                                         │
│      ┌────────────────────┐             │
│      │                    │             │
│      │     [foto JPEG]    │             │
│      │      320x240       │             │
│      │                    │             │
│      └────────────────────┘             │
│                                         │
│  Status: HEALTHY                        │
│  Foto de: 08/05 12:30                   │
└─────────────────────────────────────────┘
```

- Tap no botão `←` ou área externa → volta pra lista
- Se `hasPhoto === false`: skip o GET de foto e mostra placeholder ("Sem foto ainda — registre uma no app").
- Se GET retornar 404 com foto registrada (`hasPhoto: true` mas arquivo sumiu): mostra "Foto indisponível" sem crashar.

---

## Implementação técnica

### Decode JPEG no LVGL

ESP32-S3 com PSRAM decoda JPEG sem problema. Opções:

1. **`lv_image_decoder` + esp_jpeg** — driver oficial Espressif (`espressif/esp_new_jpeg`).
2. **`tjpgdec`** lib (já vem em alguns SDKs LVGL) — funciona, mais simples mas menor performance.

Recomendação: **esp_new_jpeg** (hardware accelerated no S3).

### Buffer de imagem

- Alocar buffer no **PSRAM** (não na DRAM interna), tipo:
  ```c
  uint8_t *img_buf = heap_caps_malloc(MAX_JPEG_BYTES, MALLOC_CAP_SPIRAM);
  ```
- `MAX_JPEG_BYTES` sugerido: **64 KB** (folga sobre os ~25KB típicos).

### HTTP client

- `esp_http_client` — mesmo padrão que já está sendo usado pros outros endpoints.
- Adicionar header `X-Device-Token` (já implementado).
- **Importante:** ler o body em chunks pra não estourar RAM. O exemplo `esp_http_client_perform` com event handler `HTTP_EVENT_ON_DATA` já cobre isso.

### Refresh policy

- Lista de plantas: cache em RAM por 60s. Se user reabrir a tela em <60s, usa cache.
- Foto: sem cache. Toda vez que abrir o detalhe → GET novamente. Servidor manda `Cache-Control: public, max-age=30` pra HTTP cache, mas a maioria das libs ESP ignora isso — tudo bem.

---

## Como entrar no menu Plantas (navegação)

Sugestões (escolha o que encaixa melhor no menu atual do firmware):

**Opção A** — botão fixo no rodapé do display (próximo aos botões de cenas).
**Opção B** — gesto/tap num indicador "Plantas: 5" mostrado na tela principal.
**Opção C** — adicionar como uma "página" no carrossel se já houver paginação.

A navegação principal hoje (até onde sei) é: tela de sensores → cenas/devices. O menu de plantas seria uma terceira tela acessível via botão ou swipe.

---

## Testes (validação manual com curl)

Substitua `TOKEN` e `TENT_ID` por valores reais do banco:

```bash
# Listar plantas
curl -H "X-Device-Token: TOKEN" \
  https://app.cultivo.cloud/api/device/plants/TENT_ID

# Baixar foto da planta 42 (resize 320x240)
curl -H "X-Device-Token: TOKEN" \
  "https://app.cultivo.cloud/api/device/plant/42/photo" \
  -o photo.jpg

# Baixar maior pra inspecionar (qualidade alta)
curl -H "X-Device-Token: TOKEN" \
  "https://app.cultivo.cloud/api/device/plant/42/photo?w=800&h=600&q=90" \
  -o photo_hd.jpg
```

Se o curl da lista retornar plantas com `hasPhoto: true` e o GET da foto retornar um JPEG decodável (`file photo.jpg` → "JPEG image data"), está tudo pronto pro firmware integrar.

---

## Resumo das mudanças no servidor (FYI)

Já implementadas — não precisa fazer nada no backend:

| Arquivo | Endpoint |
|---|---|
| `server/_core/deviceRoutes.ts` | `GET /api/device/plants/:tentId` |
| `server/_core/deviceRoutes.ts` | `GET /api/device/plant/:plantId/photo` |

Schema do banco não mudou — reutiliza `plantHealthLogs` (já existente).

---

## Perguntas em aberto pra IA do firmware

Coisas que dependem de detalhes do firmware atual:

1. **Onde encaixar o menu?** Opção A/B/C acima ou outra?
2. **`esp_new_jpeg` já está linkado** no projeto, ou precisa adicionar dependência?
3. **Tem uma "tela genérica de lista" reutilizável** no firmware, ou cria componente novo?
4. **Quanto PSRAM livre** tem na configuração atual? (pra dimensionar `MAX_JPEG_BYTES` certo)

Pode responder essas pra eu refinar a spec se precisar.
