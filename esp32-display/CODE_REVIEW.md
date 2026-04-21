# CODE REVIEW — Cultivo ESP32 Display Firmware
**Revisor:** Análise crítica profissional  
**Data:** 2026-04-21  
**Arquivo principal:** `src/main_lvgl.cpp` (2155 linhas)  
**Plataforma:** ESP32-S3 · LVGL 9.2 · Arduino framework · PlatformIO

---

## Sumário Executivo

O firmware entrega uma UI funcional com animações bonitas e fluxo de onboarding completo. No estado atual, porém, é um **protótipo de qualidade**, não código de produção. O problema central é arquitetural: **um único arquivo de 2155 linhas mistura driver de display, lógica de rede, estado de UI, parser JSON, portal HTTP e efeitos visuais**. Isso cria uma bola de neve de acoplamento que torna qualquer correção de bug arriscada e qualquer extensão dolorosa.

Os riscos mais graves são:
- **HTTP bloqueante no loop principal** → UI trava por até ~5s a cada fetch
- **AP portal sem senha** → qualquer pessoa próxima pode reconfigurar o dispositivo
- **TLS sem validação de certificado** → vulnerável a MITM em redes abertas
- **Sem OTA** → toda correção exige cabo USB
- **Sem watchdog customizado** → crash silencioso, reboot sem log

---

## Achados por Severidade

### 🔴 CRÍTICO — Risco de produção imediato

**C1 · HTTP bloqueante no loop principal**  
`fetchDisplayData()`, `fetchHistoryAll()`, `fetchTasks()` são chamadas síncronas de até ~5s cada, executadas no `loop()`. Durante esse tempo `lv_timer_handler()` não roda: animações param, touch não responde, o usuário acha que travou.  
→ Mover para task FreeRTOS ou usar `HTTPClient` em modo assíncrono + flag `fetchPending`.

**C2 · AP Portal aberto sem senha**  
`WiFi.softAP(apSsid)` sem segundo argumento = rede aberta. Qualquer vizinho pode conectar, acessar `192.168.4.1` e sobrescrever token + server URL do dispositivo.  
→ `WiFi.softAP(apSsid, "cultivo1234")` ou gerar senha derivada do MAC e exibi-la no display.

**C3 · TLS `setInsecure()` — sem validação de certificado**  
`httpSecureClient.setInsecure()` desativa verificação de CA. Em redes públicas ou com DNS poisoning, o ESP32 vai aceitar qualquer certificado e enviar o `DEVICE_TOKEN` para um servidor falso.  
→ Bundle do certificado raiz (Let's Encrypt ISRG Root X1) via `setCACert()`. Adiciona ~1.5KB de flash.

**C4 · Sem OTA (Over-The-Air update)**  
Qualquer bug em produção exige deslocar até a estufa com cabo USB. Para um produto real isso é inaceitável.  
→ Implementar `ArduinoOTA` ou `Update` via HTTP com verificação de hash. Mínimo: endpoint `/ota` no AP portal.

---

### 🟠 ALTO — Degradação de UX ou estabilidade

**A1 · `WiFi.scanNetworks()` bloqueante dentro de callback LVGL**  
O scan é disparado no handler do botão "Buscar redes WiFi" (linha 706). `WiFi.scanNetworks()` é bloqueante por 2-4s. O LVGL congela durante o scan — o label "Escaneando..." aparece mas a UI não atualiza frames.  
→ Usar `WiFi.scanNetworks(true)` (assíncrono) + `lv_timer_t` que faz polling de `WiFi.scanComplete()`.

**A2 · Sem watchdog customizado**  
O Arduino-ESP32 tem watchdog de tarefa, mas `delay(5)` no loop reseta o IDLE watchdog apenas. Se `fetchDisplayData()` travar em um socket, o watchdog de tarefa dispara em 5s e reinicia sem log útil.  
→ Usar `esp_task_wdt_reset()` explícito dentro dos loops de fetch, com timeout de 15s.

**A3 · `strdup()` leak confirmado no scan picker**  
Linha 735: `char *ssidHeap = strdup(ssid.c_str())`. O comentário admite o leak ("trivial"). Em cada scan de 12 redes = 12 × ~32 bytes = ~384 bytes perdidos por operação. Heap do ESP32 é limitada (~250KB usável).  
→ Usar buffer estático `char ssidBuf[12][33]` alocado antes do loop, indexado por `i`.

**A4 · `String` da Arduino em handlers de rede**  
18 ocorrências de `String` (heap fragmentada) em funções de fetch e scan. No ESP32, fragmentação de heap causa `malloc` falhar horas/dias após boot contínuo.  
→ Substituir por `char[]` + `snprintf` / `strlcpy` em todos os caminhos de rede.

**A5 · `connectWifi()` bloqueia `setup()` por até 10s**  
Loop `for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) { delay(500); }` = até 10s de tela preta antes da UI aparecer.  
→ Mostrar tela de boot com spinner LVGL, conectar em background task FreeRTOS.

---

### 🟡 MÉDIO — Dívida técnica e manutenibilidade

**M1 · Arquivo monolítico de 2155 linhas**  
Um único `.cpp` contém: driver GFX, driver touch, LVGL display/input, 5 telas de UI, animações, portal AP, WiFi, HTTP, NVS, JSON parsing. Qualquer mudança em uma área afeta todas as outras por variáveis globais `static`.  
→ Separar em módulos: `hal/display.cpp`, `hal/touch.cpp`, `net/wifi_manager.cpp`, `net/http_client.cpp`, `ui/screens/*.cpp`, `ap_portal.cpp`.

**M2 · 125+ variáveis `static` globais**  
Estado espalhado em globais como `tempC`, `rh`, `vpd`, `phv`, `ecv`, `wifiOk`, `lastFetch`, `apPortalActive`, etc. Impossível testar unitariamente, difícil rastrear quem modifica o quê.  
→ Agrupar em structs: `struct AppState { float temp, rh, vpd; bool wifiOk; }` e `struct NetConfig { char ssid[33]; char token[65]; }`.

**M3 · Código morto: partículas, ring wave, scan line**  
`spawnParticle()`, `spawnParticleField()`, `buildScanLine()`, `applyRingWave()` estão definidas mas nunca chamadas no fluxo normal. Ocupam ~200 linhas e flash desnecessário.  
→ Remover ou isolar em `#ifdef DEBUG_FX`.

**M4 · Mistura de idiomas PT e EN no mesmo arquivo**  
Variáveis em inglês (`TENT_ID`, `SERVER_URL`, `wifiOk`), mensagens Serial em PT (`[boot] sem WiFi salvo`), labels UI em PT. Não há padrão definido.  
→ Convenção: variáveis/funções em inglês, strings UI em PT.

**M5 · Sem versão de firmware**  
Nenhuma constante `FIRMWARE_VERSION` ou banner no boot. Impossível saber em campo qual versão está rodando.  
→ `#define FW_VERSION "0.3.0"` — logar no boot e exibir em settings.

**M6 · `#ifdef REAL_HARDWARE` espalhado sem abstração HAL**  
6 ocorrências de `#ifdef REAL_HARDWARE` misturadas no código de lógica. A diferença Wokwi vs hardware real vaza por todo o arquivo.  
→ Criar `hal/platform.h` com funções `hal_display_init()`, `hal_touch_init()` que encapsulam os ifdefs.

**M7 · `LV_CONF_SKIP` em vez de `lv_conf.h`**  
A build usa `-DLV_CONF_SKIP` e configura via `-D` no `platformio.ini`. Com LVGL 9.x, defaults internos mudam entre minor versions silenciosamente.  
→ Criar `src/lv_conf.h` explícito.

---

### 🟢 BAIXO — Polimento e boas práticas

**B1 · `delay(5)` no loop em vez de yield cooperativo**  
14 chamadas a `delay()`. Em FreeRTOS, usar `vTaskDelay(pdMS_TO_TICKS(5))` deixa explícito que é uma yield, e funciona corretamente mesmo se o loop migrar para uma task.

**B2 · Buffer `SERVER_URL[96]` pode truncar**  
URLs com subdomínio longo + path podem exceder 96 chars. Ampliar para `char SERVER_URL[128]`.

**B3 · `apServer` não é deletado antes do reboot**  
`new WebServer(80)` sem `delete` antes de `ESP.restart()`. Não causa crash pois o reboot limpa tudo, mas é hábito ruim.

**B4 · Inconsistência: `lv_obj_del` vs `lv_obj_delete` (LVGL 9)**  
LVGL 9.x renomeou `lv_obj_del` → `lv_obj_delete`. O código usa `lv_obj_del` que ainda existe como alias, mas pode ser removido em versões futuras.

---

## Bugs Concretos Identificados

| # | Local | Descrição | Impacto |
|---|-------|-----------|---------|
| 1 | `loop()` L2148 | `fetchHistoryAll()` chamada a cada 30s mas não tem timeout configurado — se o servidor não responder, bloqueia indefinidamente | UI congela até TCP timeout (~75s) |
| 2 | Scan picker L741 | `lv_obj_del(lv_obj_get_parent(rowBtn))` deleta o `scanModal` durante o evento CLICKED. Em LVGL 9, deletar o pai dentro de um evento do filho pode corromper a fila de eventos se houver outro evento pendente. | Crash intermitente |
| 3 | `openConfigModal()` | `taSsid` é `static lv_obj_t*`. Se o modal for aberto duas vezes sem salvar, o ponteiro aponta para o objeto deletado na 2ª abertura. | Use-after-free potencial |
| 4 | AP portal | `PORTAL_HTML` em PROGMEM usa `WiFi.scanNetworks()` no handler `/scan` sem timeout — se o scan falhar, o endpoint nunca responde. | Browser do celular trava |
| 5 | `saveConfigToNVS()` | Não valida se `TENT_ID` é um número positivo antes de salvar. `atoi("")` retorna 0, que provavelmente quebrará o endpoint da API. | Dados inválidos persistidos |

---

## Roadmap de Refatoração (ordem de prioridade)

### Fase 1 — Segurança (1-2 dias)
1. Adicionar senha ao AP portal (derivada do MAC)
2. Substituir `setInsecure()` por `setCACert()` com cert ISRG Root X1
3. Validar entrada do `TENT_ID` antes de salvar

### Fase 2 — Estabilidade (3-5 dias)
4. Criar task FreeRTOS `netTask` para todos os HTTP calls
5. Scan WiFi assíncrono com `WiFi.scanNetworks(true)`
6. Substituir todos os `String` por `char[]` nos caminhos de rede
7. Adicionar `esp_task_wdt_reset()` com timeout de 15s

### Fase 3 — OTA (2-3 dias)
8. Implementar `ArduinoOTA` com autenticação por senha
9. Adicionar `FW_VERSION` e exibir em settings
10. Endpoint `/update` no AP portal para upload manual

### Fase 4 — Arquitetura (1-2 semanas)
11. Separar em módulos: `hal/`, `net/`, `ui/screens/`
12. Criar `src/lv_conf.h` explícito
13. Agrupar estado em structs (`AppState`, `NetConfig`)
14. Remover código morto (partículas, ring wave, scan line)
15. Criar `hal/platform.h` para encapsular `REAL_HARDWARE` ifdefs

---

## O que está bem feito

- **UI/UX polida:** Animações de bloom, breathing, arco central estilo Ebike, matrix boot screen — visualmente competitivo com produtos comerciais
- **Onboarding completo:** Fluxo AP portal → config no celular → reboot → operação normal está funcional e bem pensado
- **Fallback Wokwi:** O `#ifdef REAL_HARDWARE` para pular AP portal no simulador é uma solução pragmática que resolve um limite real do Wokwi
- **HTTPS implementado:** Mesmo com `setInsecure()`, a camada TLS está presente e pode ser endurecida sem refatoração grande
- **NVS correto:** Uso de `Preferences` com namespace próprio é a forma correta no ESP32 — não usa SPIFFS nem EEPROM fake
- **Buffers duplos de display:** `buf1`/`buf2` com `BUF_LINES = 20` é uma escolha balanceada de performance vs RAM
- **Separação Wokwi/real:** Dois envs no `platformio.ini` com flags corretas é a abordagem profissional para desenvolvimento dual
- **`httpBegin()` helper:** Centralizar a lógica de `http.begin()` para HTTP/HTTPS em uma função é o padrão correto

---

## Apêndice — Métricas

| Métrica | Valor |
|---------|-------|
| Linhas totais (`main_lvgl.cpp`) | 2155 |
| Linhas (`cultivo_icons.c`) | 1016 |
| Variáveis `static` globais | ~125 |
| Ocorrências de `String` Arduino | 18 |
| Chamadas `delay()` | 14 |
| Lambdas LVGL (`[](lv_event_t`) | 10 |
| `#ifdef REAL_HARDWARE` | 6 |
| Chamadas HTTP distintas | 7 |
| Flash estimado (real env) | ~1.3 MB / 3.3 MB (39%) |
| RAM BSS estimada | ~133 KB / 327 KB (40%) |
| Fontes customizadas | 7 (Manrope variants) |
| Screens LVGL | 5 |
