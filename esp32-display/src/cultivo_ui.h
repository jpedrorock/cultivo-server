// ════════════════════════════════════════════════════════════════════════════════
// cultivo_ui.h — UI compartilhada entre simulador (Mac/SDL2) e firmware ESP32-S3
//
// Owns:
//  - As 5 telas principais (Home, LUX/PPFD, pH/EC, Historico, Cenas) + navbar
//  - Estado dos sensores como globals (escritos pelo app, lidos pelo refresh)
//  - Animacoes: ring-pulse, sparklines, onda do Historico
//
// Nao owns (firmware-only, ficam no main_lvgl.cpp):
//  - Splash de boot, AP portal, modal de config WiFi/token
//  - Inicializacao de display/touch (hal_display_init)
//  - WiFi/HTTP/NVS
//
// Integracao:
//  1. App chama buildCultivoUI() depois do splash terminar
//  2. App escreve sensor state nos globals (tempC, rh, etc.) e chama
//     refreshHomeValues() pra forcar redraw
//  3. App registra handlers (cultivoUI_setLuxSaveHandler, ...) pra fazer
//     POST no backend quando o usuario salva no display
// ════════════════════════════════════════════════════════════════════════════════
#pragma once
#include "lvgl.h"

#ifdef __cplusplus
extern "C" {
#endif

// ── Sensor state (extern: definido em cultivo_ui.cpp) ──────────────────────────
// App escreve nesses globals (no firmware via fetchDisplayData; no sim via
// mockTimer). UI le no refreshHomeValues().
extern char  TENT_NAME[50];
extern char  FASE[20];
extern float tempC, rh, vpd, phv, ecv;
extern int   semana, totalSem;
extern bool  wifiOk;

// LUX/PPFD: targetPpfd e o valor ajustado pelo usuario (que vai pro POST);
// currentPpfd/currentLux sao a leitura mais recente do sensor (vem do GET).
// luxMode = 0 PPFD | 1 LUX (toggle de visualizacao no display).
extern int   currentLux, currentPpfd, targetPpfd, luxMode;

// activeScreen: indice da tela ativa (0=Home, 1=Lux, 2=PhEc, 3=Hist, 4=Cenas)
// Exposto pra firmware decidir se vale fetchar dados da aba atual.
extern int activeScreen;

// ── Histórico — buffers preenchidos pelo app via fetchHistoryAll ──────────────
// 24 amostras de 4 metricas (24h por default). App escreve ASCending por tempo
// (mais antigo no idx 0, mais novo no idx 23). histCount = quantos pontos
// validos (ate' 24); restantes sao ignorados pela UI.
#define HIST_POINTS 24
extern float histTemp[HIST_POINTS];
extern float histRh  [HIST_POINTS];
extern float histPh  [HIST_POINTS];
extern float histEc  [HIST_POINTS];
extern int   histCount;  // quantos pontos validos (>=1, max HIST_POINTS)
// Trigger refresh do chart quando o app preencher os arrays.
void cultivoUI_applyHistory(void);

// ── Itens dinamicos do display: cenas + dispositivos ─────────────────────────
// Backend agora retorna {items:[{type, id, name, state?, iconHint?}, ...]}
// (sprint 1 do vinculo cena-estufa). type=0 (scene) tap dispara cena Tuya;
// type=1 (device) tap toggla on/off. state e' relevante so' p/ device — UI
// mostra ON/OFF visualmente. iconHint resolve qual icone mostrar.
//
// onSceneTrigger(idx) ainda e' chamado pra TUDO (scene OU device). App
// resolve idx -> tipo via storage proprio e chama:
//   - scene  -> POST /api/device/scene-by-id/<id>/trigger
//   - device -> POST /api/device/device-toggle (com state oposto)
#define SCENES_MAX 6

typedef struct {
  const char *id;          // sceneId ou deviceId Tuya
  const char *name;        // label exibido
  uint8_t     type;        // 0=scene, 1=device, 2=automation
  bool        state;       // device/automation on/off (ignorado p/ scene)
  const char *iconHint;    // "light"|"fan"|"pump"|"heater"|"ac"|"" (default)
  uint16_t    executionSec; // duracao da cena em segundos (scene only); 0 = default 5s
} CultivoItem;

void cultivoUI_applyItems(const CultivoItem *items, int count);

// API legacy mantida — chama applyItems internamente (todos type=scene).
void cultivoUI_applyScenes(const char *names[], int count);

// App chama quando confirmar (ou rejeitar) o toggle de um device — UI
// atualiza visual on/off. Util quando POST /device-toggle responde.
void cultivoUI_setDeviceState(int idx, bool state);

// Spin do icone de um item no grid Cenas (feedback visual de refresh em
// andamento — card com iconHint=refresh/sensor). startItemSpin gira o
// icone continuamente; stopItemSpin reseta angulo. Timeout interno 10s.
void cultivoUI_startItemSpin(int idx);
void cultivoUI_stopItemSpin(int idx);

// ── Tarefas (aba 4) ───────────────────────────────────────────────────────────
// App preenche lista de tarefas via cultivoUI_applyTasks(items, count). Cada
// item tem id (pra POST task-complete), titulo curto e flag done. Max 10
// (display caberia mais, mas server limita LIMIT 10 hoje). UI: lista vertical
// scrollable com checkbox + label; tap toggla done via onTaskToggle(taskId).
#define TASKS_MAX 10
typedef struct {
  int         id;       // id da row em standaloneTasks
  const char *title;    // texto exibido
  bool        done;     // status atual
} CultivoTask;
void cultivoUI_applyTasks(const CultivoTask *items, int count);

// App registra callback chamado quando user tap em uma tarefa — taskId
// e' o id da row no DB. App faz POST /api/device/task-complete.
typedef void (*CultivoTaskToggleFn)(int taskId);
void cultivoUI_setTaskToggleHandler(CultivoTaskToggleFn cb);

// Confirma flip do done (chamado pelo app apos POST OK ou reverter se falhou)
void cultivoUI_setTaskDone(int taskId, bool done);

// ── Build entry point ─────────────────────────────────────────────────────────
void buildCultivoUI(void);

// ── Refresh ───────────────────────────────────────────────────────────────────
// Re-renderiza valores na tela ativa a partir dos globals. Idempotente, barato
// (so' atualiza textos/cores). Chame depois de receber novos dados.
void refreshHomeValues(void);

// ── Hooks de save (UI -> app) ─────────────────────────────────────────────────
// O app registra essas callbacks no boot. Sim usa os defaults (printf).
typedef void (*CultivoSaveLuxFn)(int targetPpfd);
typedef void (*CultivoSavePhEcFn)(float ph, float ec);
typedef void (*CultivoOpenConfigFn)(void);
// Tap em TEMP/UMID na Home pede ao app pra fazer poll fresh do server (que
// por sua vez consulta a Tuya e atualiza os valores). Usado p/ refresh manual.
typedef void (*CultivoRefreshFn)(void);
// Tap em botao de cena na tela CENAS — sceneId enum-like definido pelo app.
// Identifiers atuais: 0=irrigar, 1=luz-off, 2=custom (extensivel).
typedef void (*CultivoSceneTriggerFn)(int sceneId);

void cultivoUI_setLuxSaveHandler(CultivoSaveLuxFn cb);
void cultivoUI_setPhEcSaveHandler(CultivoSavePhEcFn cb);
void cultivoUI_setConfigOpenHandler(CultivoOpenConfigFn cb);
void cultivoUI_setRefreshHandler(CultivoRefreshFn cb);
void cultivoUI_setSceneTriggerHandler(CultivoSceneTriggerFn cb);

// ── Indicacao de refresh em andamento ─────────────────────────────────────────
// App chama cultivoUI_setRefreshing(true) ao iniciar refresh, false ao terminar.
// UI mostra spinner/pulse no card de TEMP+UMID enquanto rodando.
void cultivoUI_setRefreshing(bool active);

#ifdef __cplusplus
}
#endif
