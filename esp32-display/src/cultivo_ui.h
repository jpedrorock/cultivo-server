// ════════════════════════════════════════════════════════════════════════════════
// cultivo_ui.h — UI compartilhada entre simulador (Mac/SDL2) e firmware ESP32-S3
//
// Owns:
//  - As 5 telas principais (Home, LUX/PPFD, pH/EC, Tarefas, Historico) + navbar
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

// activeScreen: indice da tela ativa (0=Home, 1=Lux, 2=PhEc, 3=Tarefas, 4=Hist)
// Exposto pra firmware decidir se vale fetchar dados da aba atual.
extern int activeScreen;

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
typedef void (*CultivoToggleTaskFn)(int idx, bool done);
typedef void (*CultivoOpenConfigFn)(void);
// Tap em TEMP/UMID na Home pede ao app pra fazer poll fresh do server (que
// por sua vez consulta a Tuya e atualiza os valores). Usado p/ refresh manual.
typedef void (*CultivoRefreshFn)(void);
// Tap em botao de cena na tela CENAS — sceneId enum-like definido pelo app.
// Identifiers atuais: 0=irrigar, 1=luz-off, 2=custom (extensivel).
typedef void (*CultivoSceneTriggerFn)(int sceneId);

void cultivoUI_setLuxSaveHandler(CultivoSaveLuxFn cb);
void cultivoUI_setPhEcSaveHandler(CultivoSavePhEcFn cb);
void cultivoUI_setTaskToggleHandler(CultivoToggleTaskFn cb);
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
