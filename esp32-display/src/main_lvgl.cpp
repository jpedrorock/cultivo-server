// ════════════════════════════════════════════════════════════════════════════════
//  Cultivo ESP32 Display — versão LVGL (Fase F)
//  Dashboard polido com lv_tabview + widgets nativos + dark theme.
//  Compilado em [env:esp32dev] (Wokwi) e [env:real] (JC4832W535).
// ════════════════════════════════════════════════════════════════════════════════

#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <Update.h>
#include <Preferences.h>
#include <math.h>
#include <lvgl.h>
#include "cultivo_icons.h"
#include "fonts/cultivo_fonts.h"
#include "hal_platform.h"
#include "cultivo_ui.h"     // UI compartilhada com sim — fase 2 da refatoracao

// FONT_* macros e extern declarations vêm de hal_platform.h

// ════════════════════════════════════════════════════════════════════════════════
// CONFIGURACAO — editavel via gear icon no header (persiste em NVS)
// Defaults aplicados quando NVS esta vazio (primeira boot).
// ════════════════════════════════════════════════════════════════════════════════
#define FW_VERSION "0.4.0"

// Configuração de rede — agrupada em struct para facilitar passagem
// por referência em futuras refatorações e documentar o que é "config"
// (persistido em NVS) vs "estado" (volatil, recarregado no boot).
struct NetConfig {
  char ssid[33];
  char pass[65];
  char url[96];
  char token[65];
  int  tentId;
};

static Preferences prefs;
static NetConfig netCfg = {
  "", "", "https://cultivo.x.andy.plus", "", 1,
};

// Aliases retroativos — mantidos para minimizar diff em 35+ call sites.
// Podem ser removidos incrementalmente quando cada usuário migrar pra netCfg.X
#define WIFI_SSID     netCfg.ssid
#define WIFI_PASS     netCfg.pass
#define SERVER_URL    netCfg.url
#define DEVICE_TOKEN  netCfg.token
#define TENT_ID       netCfg.tentId

static void loadConfigFromNVS() {
  prefs.begin("cultivo", true);
  prefs.getString("ssid",   WIFI_SSID,    sizeof(WIFI_SSID));
  prefs.getString("pass",   WIFI_PASS,    sizeof(WIFI_PASS));
  prefs.getString("server", SERVER_URL,   sizeof(SERVER_URL));
  prefs.getString("token",  DEVICE_TOKEN, sizeof(DEVICE_TOKEN));
  TENT_ID = prefs.getInt("tent", TENT_ID);
  prefs.end();
  Serial.printf("[cfg] ssid=%s url=%s tent=%d\n", WIFI_SSID, SERVER_URL, TENT_ID);
}

static void saveConfigToNVS(const char* ssid, const char* pass, const char* url,
                             const char* token, int tent) {
  prefs.begin("cultivo", false);
  prefs.putString("ssid",   ssid);
  prefs.putString("pass",   pass);
  prefs.putString("server", url);
  prefs.putString("token",  token);
  prefs.putInt   ("tent",   tent);
  prefs.end();
}

static void clearConfigNVS() {
  prefs.begin("cultivo", false);
  prefs.clear();
  prefs.end();
}

// Salva apenas token+tentId apos pareamento RFC 8628 — preserva ssid/pass/url.
static void saveDeviceTokenToNVS(const char *token, int tent) {
  prefs.begin("cultivo", false);
  prefs.putString("token", token);
  prefs.putInt   ("tent",  tent);
  prefs.end();
  // Tambem atualiza globais em RAM
  strncpy(DEVICE_TOKEN, token, sizeof(DEVICE_TOKEN) - 1);
  DEVICE_TOKEN[sizeof(DEVICE_TOKEN) - 1] = '\0';
  TENT_ID = tent;
}
// ════════════════════════════════════════════════════════════════════════════════

// ── Driver de display ───────────────────────────────────────────────────────────
// Pinos S3 unificados (Wokwi e hardware real ambos rodam em esp32-s3-devkitc-1)
#define TFT_CS    10
#define TFT_DC     8
#define TFT_RST   14
#define TFT_SCK   12
#define TFT_MOSI  11
#define TFT_MISO  13
#define TOUCH_SDA  4
#define TOUCH_SCL  5
#define FT_ADDR   0x38

// Definições dos objetos declarados como extern em hal_platform.h
#ifdef REAL_HARDWARE
  Arduino_DataBus *bus    = nullptr;
  Arduino_GFX     *gfx    = nullptr;
  Arduino_Canvas  *canvas = nullptr;
#else
  Adafruit_ILI9341 tft(TFT_CS, TFT_DC, TFT_RST);
#endif
static const int SCREEN_W = HAL_SCREEN_W;
static const int SCREEN_H = HAL_SCREEN_H;

// Helpers de escala — base 320x240 (Wokwi). No real (480x320) multiplica por 1.5 / 1.33
// Use pra todas dimensões de layout (posições, paddings, tamanhos de container).
// NÃO use pra fontes — as fontes já são por hardware via FONT_* macros.
static inline int sw(int v) { return (v * SCREEN_W) / 320; }
static inline int sh(int v) { return (v * SCREEN_H) / 240; }

// Altura da navbar custom + altura util de cada screen
static const int TABBAR_H = (SCREEN_H >= 320) ? 64 : 48;   // nav maior no hardware real
static const int TAB_H    = SCREEN_H - TABBAR_H;

// ── Cores do tema (usadas por splash/config modal/AP portal — UI builders
//   movidos pra cultivo_ui.cpp tem suas proprias copias destes valores) ───────
#define COL_BG      0x0B0F14
#define COL_CARD    0x111827
#define COL_BORDER  0x1F2937
#define COL_TEXT    0xFFFFFF
#define COL_DIM     0x6B7280
#define COL_GRN     0x4ADE80
#define COL_YEL     0xFBBF24
#define COL_RED     0xF87171
#define COL_CYN     0x2DD4BF
#define COL_PRP     0xA78BFA
#define COL_BLU     0x60A5FA

// ── LVGL v9 draw buffers ────────────────────────────────────────────────────────
// FULL render mode com buffer 480x320 landscape em PSRAM. Cache blocking
// 32x32 + QSPI 60MHz dao ~20 fps efetivos.
//
// Tentativa de double buffering com push task em core 1 foi piorando perf
// percebido (transicoes mais lentas) — PSRAM bandwidth disputada entre
// rotate em core 0 (read fullBuf, write dblBuf) e DMA QSPI em core 1
// (read dblBuf p/ push). Sequencial single-buffer evita o conflict.
#ifdef REAL_HARDWARE
  static uint8_t *fullBuf = nullptr;
#else
  static const uint32_t BUF_LINES = 20;
  static uint32_t buf1[320 * BUF_LINES / 2];
#endif

// ── Helpers usados por splash/config modal/AP portal ───────────────────────────
// makeLabel e applyBloom foram duplicados aqui (versoes simples) porque o
// cultivo_ui.cpp os tem como static internas — esta UI offline-state ainda
// usa esses estilos basicos.
static lv_obj_t* makeLabel(lv_obj_t *parent, const char *text, uint32_t color,
                           const lv_font_t *font, lv_align_t align, int x, int y) {
  lv_obj_t *l = lv_label_create(parent);
  lv_label_set_text(l, text);
  lv_obj_set_style_text_color(l, lv_color_hex(color), 0);
  if (font) lv_obj_set_style_text_font(l, font, 0);
  lv_obj_align(l, align, x, y);
  return l;
}

static void applyBloom(lv_obj_t *obj, uint32_t color) {
  lv_obj_set_style_shadow_color(obj, lv_color_hex(color), 0);
  lv_obj_set_style_shadow_width(obj, 28, 0);
  lv_obj_set_style_shadow_opa(obj, LV_OPA_70, 0);
  lv_obj_set_style_shadow_spread(obj, 2, 0);
}

// ── State infra ────────────────────────────────────────────────────────────────
// Flag setada por handlers de tap (UI -> infra) — loop() processa fora do click.
// Manter local em main_lvgl: cultivo_ui.cpp seta diretamente quando precisar
// (o jeito atual e' callbacks via cultivoUI_set*Handler — refreshPending serve
// p/ casos de "preciso re-fetch agora", se necessario no futuro).
static volatile bool refreshPending = false;

// Tarefas: removido na limpeza pos-fase-2. UI nova substituiu Tarefas por
// Cenas (atalhos Tuya) — registro de rega/tasks fica no app web, nao no ESP.

// ── Estado dos dados (UI + sensores) ────────────────────────────────────────────
// Globals de estado vivem em cultivo_ui.cpp e sao importados via cultivo_ui.h:
// TENT_NAME, FASE, tempC, rh, vpd, phv, ecv, semana, totalSem, wifiOk,
// currentLux, currentPpfd, targetPpfd, luxMode, activeScreen.
static unsigned long lastFetch = 0;
static const unsigned long FETCH_INTERVAL = 30000;

// netTask → loop: seta quando ha' dados novos. loop() chama refreshHomeValues()
// no thread principal (LVGL nao e thread-safe). atomic volatile basta, flag simples.
static volatile bool uiNeedsRefresh = false;

// ════════════════════════════════════════════════════════════════════════════════
// Display + touch callbacks (LVGL v9 API)
// ════════════════════════════════════════════════════════════════════════════════
// Rotacao 270deg do framebuffer LVGL (480x320 landscape) p/ canvas portrait
// (320x480). lv_draw_sw_rotate() da LVGL (otimizada upstream — usado pelos
// drivers SDL, Linux fbdev, Renesas). Substitui o loop manual com cache
// blocking. Mesmas mecanicas mas mantida pela equipe LVGL.
static void disp_flush(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map) {
  uint32_t w = area->x2 - area->x1 + 1;
  uint32_t h = area->y2 - area->y1 + 1;
#ifdef REAL_HARDWARE
  static uint32_t frameN = 0, sumRotUs = 0, sumPushUs = 0;
  uint32_t t0 = micros();
  // src: LVGL render buf (LW=480 LH=320 landscape, RGB565 = 2 bytes/px)
  // dst: canvas framebuffer (PW=320 PH=480 portrait)
  // LVGL ROTATION_270 e' direcao oposta da nossa rotacao manual antiga;
  // ROTATION_90 reproduz o mesmo mapping pixel-a-pixel:
  //   src (lx, ly) -> dst (ly, LW-1-lx)  (matches manual rotate_270_to_canvas)
  // Touch mapping em hal_map_touch foi calibrado p/ esse layout, manter aqui.
  lv_draw_sw_rotate(px_map, canvas->getFramebuffer(),
                    (int32_t)w, (int32_t)h,
                    (int32_t)(w * 2),    // src_stride
                    320 * 2,              // dest_stride (canvas width * bpp)
                    LV_DISPLAY_ROTATION_90,
                    LV_COLOR_FORMAT_RGB565);
  uint32_t t1 = micros();
  canvas->flush();
  uint32_t t2 = micros();
  sumRotUs += (t1 - t0); sumPushUs += (t2 - t1);
  if (++frameN >= 60) {
    Serial.printf("[perf] rot=%lu push=%lu total=%lu ~%lu fps\n",
                  (unsigned long)(sumRotUs/60), (unsigned long)(sumPushUs/60),
                  (unsigned long)((sumRotUs+sumPushUs)/60),
                  (unsigned long)(60000000ull/(sumRotUs+sumPushUs)));
    frameN = 0; sumRotUs = 0; sumPushUs = 0;
  }
#else
  hal_push_pixels(area->x1, area->y1, w, h, (uint16_t*)px_map);
#endif
  lv_display_flush_ready(disp);
}

static bool ftRead(int &rx, int &ry) {
  // Implementacao real (AXS15231B no JC4832W535) ou FT6336 (Wokwi) vive em
  // hal_platform.h — chip de touch difere por alvo, protocolo idem.
  return hal_touch_read(&rx, &ry);
}

static void touchpad_read(lv_indev_t *indev, lv_indev_data_t *data) {
  int rx, ry, mx, my;
  if (!ftRead(rx, ry)) { data->state = LV_INDEV_STATE_RELEASED; return; }
  hal_map_touch(rx, ry, &mx, &my);
  data->point.x = mx;
  data->point.y = my;
  data->state = LV_INDEV_STATE_PRESSED;
  static uint32_t lastPrint = 0;
  if (millis() - lastPrint > 200) {
    lastPrint = millis();
    Serial.printf("[touch] raw=%d,%d -> mapped=%d,%d\n", rx, ry, mx, my);
  }
}

// UI helpers (makeCard, makeLabel, applyBloom, startBreathe, applyRingPulse,
// animation callbacks) foram movidos pra cultivo_ui.cpp na fase 2 da refatoracao.

// ════════════════════════════════════════════════════════════════════════════════
// App splash — logo + barra de progresso (estilo app mobile)
// Overlay sobre o UI já montado, fade-in no início e fade-out ao final.
// ════════════════════════════════════════════════════════════════════════════════
static lv_obj_t  *splashScreen = nullptr;
static lv_obj_t  *splashBar    = nullptr;
static lv_obj_t  *splashMsg    = nullptr;
static lv_timer_t *splashTimer = nullptr;
static int        splashStep   = 0;

static const char *SPLASH_MSGS[] = {
  "Iniciando sistema...",
  "Carregando interface...",
  "Verificando sensores...",
  "Conectando ao servidor...",
  "Pronto!",
};
#define SPLASH_STEPS (int)(sizeof(SPLASH_MSGS) / sizeof(SPLASH_MSGS[0]))

static void splashFinish();

static void splashTick(lv_timer_t *) {
  splashStep++;
  if (splashStep < SPLASH_STEPS) {
    if (splashMsg) lv_label_set_text(splashMsg, SPLASH_MSGS[splashStep]);
    if (splashBar)  lv_bar_set_value(splashBar, (splashStep * 100) / (SPLASH_STEPS - 1), LV_ANIM_ON);
  } else {
    splashFinish();
  }
}

static void buildSplash() {
  splashStep = 0;

  splashScreen = lv_obj_create(lv_scr_act());
  lv_obj_set_size(splashScreen, SCREEN_W, SCREEN_H);
  lv_obj_set_pos(splashScreen, 0, 0);
  lv_obj_set_style_bg_color(splashScreen, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(splashScreen, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(splashScreen, 0, 0);
  lv_obj_set_style_radius(splashScreen, 0, 0);
  lv_obj_set_style_pad_all(splashScreen, 0, 0);
  lv_obj_clear_flag(splashScreen, LV_OBJ_FLAG_SCROLLABLE);

  // Anel circular com glow verde — funciona como ícone de app
  lv_obj_t *logoCont = lv_obj_create(splashScreen);
  lv_obj_set_size(logoCont, sw(64), sw(64));
  lv_obj_align(logoCont, LV_ALIGN_CENTER, 0, -sh(48));
  lv_obj_set_style_radius(logoCont, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_color(logoCont, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_bg_opa(logoCont, LV_OPA_20, 0);
  lv_obj_set_style_border_color(logoCont, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_border_width(logoCont, 2, 0);
  lv_obj_set_style_border_opa(logoCont, LV_OPA_60, 0);
  lv_obj_set_style_shadow_color(logoCont, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_shadow_width(logoCont, 28, 0);
  lv_obj_set_style_shadow_opa(logoCont, LV_OPA_40, 0);
  lv_obj_set_style_pad_all(logoCont, 0, 0);
  lv_obj_clear_flag(logoCont, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t *logo = lv_img_create(logoCont);
  lv_img_set_src(logo, &ic_sprout);
  lv_obj_center(logo);

  // Nome do app
  lv_obj_t *lblName = lv_label_create(splashScreen);
  lv_label_set_text(lblName, "cultivo");
  lv_obj_set_style_text_font(lblName, FONT_VALUE, 0);
  lv_obj_set_style_text_color(lblName, lv_color_hex(COL_TEXT), 0);
  lv_obj_align(lblName, LV_ALIGN_CENTER, 0, sh(12));

  // Subtítulo
  lv_obj_t *lblSub = lv_label_create(splashScreen);
  lv_label_set_text(lblSub, "Monitor de Estufa");
  lv_obj_set_style_text_font(lblSub, FONT_BODY, 0);
  lv_obj_set_style_text_color(lblSub, lv_color_hex(COL_DIM), 0);
  lv_obj_align(lblSub, LV_ALIGN_CENTER, 0, sh(40));

  // Barra de progresso — fina, verde, preenche da esquerda pra direita
  splashBar = lv_bar_create(splashScreen);
  lv_obj_set_size(splashBar, SCREEN_W - sw(48), sh(4));
  lv_obj_align(splashBar, LV_ALIGN_BOTTOM_MID, 0, -sh(28));
  lv_obj_set_style_bg_color(splashBar, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_bg_opa(splashBar, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(splashBar, 2, 0);
  lv_obj_set_style_bg_color(splashBar, lv_color_hex(COL_GRN), LV_PART_INDICATOR);
  lv_obj_set_style_radius(splashBar, 2, LV_PART_INDICATOR);
  lv_bar_set_range(splashBar, 0, 100);
  lv_bar_set_value(splashBar, 0, LV_ANIM_OFF);

  // Mensagem de status
  splashMsg = lv_label_create(splashScreen);
  lv_label_set_text(splashMsg, SPLASH_MSGS[0]);
  lv_obj_set_style_text_font(splashMsg, FONT_CAPTION, 0);
  lv_obj_set_style_text_color(splashMsg, lv_color_hex(COL_DIM), 0);
  lv_obj_align(splashMsg, LV_ALIGN_BOTTOM_MID, 0, -sh(10));

  // Versão no canto inferior direito
  lv_obj_t *lblVer = lv_label_create(splashScreen);
  lv_label_set_text(lblVer, "v" FW_VERSION);
  lv_obj_set_style_text_font(lblVer, FONT_CAPTION, 0);
  lv_obj_set_style_text_color(lblVer, lv_color_hex(COL_BORDER), 0);
  lv_obj_align(lblVer, LV_ALIGN_BOTTOM_RIGHT, -sw(8), -sh(6));

  // Fade in
  lv_obj_set_style_opa(splashScreen, LV_OPA_0, 0);
  lv_anim_t fadeIn;
  lv_anim_init(&fadeIn);
  lv_anim_set_var(&fadeIn, splashScreen);
  lv_anim_set_values(&fadeIn, LV_OPA_0, LV_OPA_COVER);
  lv_anim_set_time(&fadeIn, 300);
  lv_anim_set_exec_cb(&fadeIn, [](void *obj, int32_t v) {
    lv_obj_set_style_opa((lv_obj_t*)obj, v, 0);
  });
  lv_anim_start(&fadeIn);

  splashTimer = lv_timer_create(splashTick, 600, NULL);
}

static void splashFinish() {
  if (!splashScreen) return;
  if (splashTimer) { lv_timer_del(splashTimer); splashTimer = nullptr; }

  lv_anim_t a;
  lv_anim_init(&a);
  lv_anim_set_var(&a, splashScreen);
  lv_anim_set_values(&a, LV_OPA_COVER, LV_OPA_0);
  lv_anim_set_time(&a, 450);
  lv_anim_set_exec_cb(&a, [](void *obj, int32_t v) {
    lv_obj_set_style_opa((lv_obj_t*)obj, v, 0);
  });
  lv_anim_set_completed_cb(&a, [](lv_anim_t *) {
    if (splashScreen) {
      lv_obj_del(splashScreen);
      splashScreen = nullptr;
      splashBar    = nullptr;
      splashMsg    = nullptr;
    }
  });
  lv_anim_start(&a);
}

// ════════════════════════════════════════════════════════════════════════════════
// Modal de configuracao (WiFi, Server, Token, TentId) — abre via gear icon
// Salva em NVS e reboota. Usado tambem como tela de setup inicial se NVS vazio.
// ════════════════════════════════════════════════════════════════════════════════
static lv_obj_t *configModal = nullptr;
static lv_obj_t *taSsid, *taPass, *taUrl, *taToken, *taTent;
static lv_obj_t *kbCfg;
static void startApPortal();  // fwd: botao "Setup celular" do modal chama

static void cfgFocusCb(lv_event_t *e) {
  lv_obj_t *ta = (lv_obj_t*)lv_event_get_target(e);
  lv_keyboard_set_textarea(kbCfg, ta);
  lv_obj_remove_flag(kbCfg, LV_OBJ_FLAG_HIDDEN);
}

// ════════════════════════════════════════════════════════════════════════════════
// WiFi scan assíncrono — nao trava LVGL durante a busca
// WiFi.scanNetworks(true) retorna imediatamente; poll via lv_timer.
// Buffer estatico elimina o strdup() leak do callback sincrono antigo.
// ════════════════════════════════════════════════════════════════════════════════
static char         scanSsidBuf[12][33];
static lv_obj_t    *scanModalRef = nullptr;
static lv_timer_t  *scanPollTimer = nullptr;

static void scanClose(lv_event_t *ev) {
  if (scanModalRef) { lv_obj_del(scanModalRef); scanModalRef = nullptr; }
  if (scanPollTimer) { lv_timer_del(scanPollTimer); scanPollTimer = nullptr; }
  WiFi.scanDelete();
}

static void scanPickRow(lv_event_t *ev) {
  const char *picked = (const char*)lv_event_get_user_data(ev);
  lv_textarea_set_text(taSsid, picked);
  Serial.printf("[cfg] scan pick: %s\n", picked);
  scanClose(ev);
}

static void scanFinalize(int n) {
  if (!scanModalRef) return;
  lv_obj_clean(scanModalRef);
  lv_obj_set_flex_flow(scanModalRef, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(scanModalRef, sh(3), 0);

  makeLabel(scanModalRef, n > 0 ? "Toque na rede desejada:" : "Nenhuma rede encontrada",
            n > 0 ? COL_GRN : COL_RED, FONT_BODY, LV_ALIGN_TOP_MID, 0, 0);

  int shown = 0;
  for (int i = 0; i < n && shown < 12; i++) {
    strncpy(scanSsidBuf[shown], WiFi.SSID(i).c_str(), 32);
    scanSsidBuf[shown][32] = '\0';
    int rssi = WiFi.RSSI(i);

    lv_obj_t *row = lv_btn_create(scanModalRef);
    lv_obj_set_width(row, lv_pct(100));
    lv_obj_set_height(row, sh(20));
    lv_obj_set_style_bg_color(row, lv_color_hex(COL_CARD), 0);
    char label[64];
    snprintf(label, sizeof(label), "%s (%d dBm)", scanSsidBuf[shown], rssi);
    lv_obj_add_event_cb(row, scanPickRow, LV_EVENT_CLICKED, scanSsidBuf[shown]);
    makeLabel(row, label, COL_TEXT, FONT_CAPTION, LV_ALIGN_LEFT_MID, sw(4), 0);
    shown++;
  }

  lv_obj_t *btnClose = lv_btn_create(scanModalRef);
  lv_obj_set_size(btnClose, sw(60), sh(20));
  lv_obj_set_style_bg_color(btnClose, lv_color_hex(COL_BORDER), 0);
  lv_obj_add_event_cb(btnClose, scanClose, LV_EVENT_CLICKED, NULL);
  makeLabel(btnClose, "Fechar", COL_TEXT, FONT_CAPTION, LV_ALIGN_CENTER, 0, 0);
}

static void scanPollCb(lv_timer_t *t) {
  int status = WiFi.scanComplete();
  if (status == WIFI_SCAN_RUNNING) return;
  scanFinalize(status < 0 ? 0 : status);
  lv_timer_del(t);
  scanPollTimer = nullptr;
}

static void scanStartCb(lv_event_t *e) {
  if (scanModalRef) return;  // scan ja em andamento

  scanModalRef = lv_obj_create(lv_scr_act());
  lv_obj_set_size(scanModalRef, SCREEN_W - sw(20), sh(180));
  lv_obj_center(scanModalRef);
  lv_obj_set_style_bg_color(scanModalRef, lv_color_hex(0x0F172A), 0);
  lv_obj_set_style_border_color(scanModalRef, lv_color_hex(COL_CYN), 0);
  lv_obj_set_style_border_width(scanModalRef, 2, 0);
  lv_obj_set_style_radius(scanModalRef, sw(8), 0);
  lv_obj_set_style_pad_all(scanModalRef, sw(6), 0);
  lv_obj_move_foreground(scanModalRef);
  makeLabel(scanModalRef, "Escaneando redes...", COL_CYN, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  WiFi.mode(WIFI_STA);
  int r = WiFi.scanNetworks(true);  // assincrono — retorna imediato
  Serial.printf("[cfg] scan async start -> %d\n", r);

  if (scanPollTimer) lv_timer_del(scanPollTimer);
  scanPollTimer = lv_timer_create(scanPollCb, 200, NULL);
}

static void cfgSaveCb(lv_event_t *e) {
  const char *ssid  = lv_textarea_get_text(taSsid);
  const char *pass  = lv_textarea_get_text(taPass);
  const char *url   = lv_textarea_get_text(taUrl);
  const char *token = lv_textarea_get_text(taToken);
  int tent          = atoi(lv_textarea_get_text(taTent));
  if (tent <= 0) tent = 1;  // nunca salvar tent=0 — quebraria os endpoints da API
  if (strlen(ssid) == 0) { Serial.println("[cfg] ssid vazio, abortando"); return; }
  if (strlen(token) == 0) { Serial.println("[cfg] token vazio, abortando"); return; }
  saveConfigToNVS(ssid, pass, url, token, tent);
  Serial.println("[cfg] salvo, reiniciando...");
  delay(500);
  ESP.restart();
}

static void cfgCancelCb(lv_event_t *e) {
  if (configModal) { lv_obj_del(configModal); configModal = nullptr; }
}

static void openConfigModal() {
  if (configModal) return;  // ja aberto
  configModal = lv_obj_create(lv_scr_act());
  lv_obj_set_size(configModal, SCREEN_W, SCREEN_H);
  lv_obj_set_pos(configModal, 0, 0);
  lv_obj_set_style_bg_color(configModal, lv_color_hex(0x060A10), 0);
  lv_obj_set_style_bg_opa(configModal, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(configModal, 0, 0);
  lv_obj_set_style_radius(configModal, 0, 0);
  lv_obj_set_style_pad_all(configModal, sw(6), 0);
  lv_obj_clear_flag(configModal, LV_OBJ_FLAG_SCROLLABLE);

  makeLabel(configModal, "CONFIGURACAO", COL_GRN, FONT_TITLE, LV_ALIGN_TOP_MID, 0, sh(2));
  makeLabel(configModal, "fw " FW_VERSION, COL_DIM, FONT_CAPTION, LV_ALIGN_TOP_RIGHT, -sw(6), sh(4));

  // Area scrollavel com os 5 campos. Aumentada (sh(180)) p/ caber inputs maiores
  // (sh(34) cada, ~45px no hardware real) com tap targets confortaveis.
  lv_obj_t *list = lv_obj_create(configModal);
  lv_obj_set_size(list, SCREEN_W - sw(12), sh(180));
  lv_obj_align(list, LV_ALIGN_TOP_MID, 0, sh(22));
  lv_obj_set_style_bg_opa(list, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(list, 0, 0);
  lv_obj_set_style_pad_all(list, sw(3), 0);
  lv_obj_set_flex_flow(list, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(list, sh(4), 0);

  auto addField = [&](const char *label, const char *initVal, lv_obj_t **out,
                       bool pwd = false, bool numeric = false) {
    makeLabel(list, label, COL_DIM, FONT_CAPTION, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_t *ta = lv_textarea_create(list);
    lv_obj_set_width(ta, lv_pct(100));
    lv_obj_set_height(ta, sh(34));      // ~45px tap target (era ~29px)
    lv_textarea_set_one_line(ta, true);
    lv_textarea_set_text(ta, initVal ? initVal : "");
    if (pwd)     lv_textarea_set_password_mode(ta, true);
    if (numeric) lv_textarea_set_accepted_chars(ta, "0123456789");
    lv_obj_set_style_text_font(ta, FONT_BODY, 0);
    lv_obj_set_style_bg_color(ta, lv_color_hex(COL_CARD), 0);
    lv_obj_set_style_border_color(ta, lv_color_hex(COL_BORDER), 0);
    lv_obj_set_style_border_width(ta, 1, 0);
    lv_obj_set_style_pad_left(ta, sw(6), 0);
    lv_obj_add_event_cb(ta, cfgFocusCb, LV_EVENT_CLICKED, NULL);
    *out = ta;
  };

  // Botao "Setup via celular" — sobe AP portal para o usuario configurar
  // via browser do celular em 192.168.4.1. Alternativa ao preenchimento manual.
  lv_obj_t *btnAp = lv_btn_create(list);
  lv_obj_set_width(btnAp, lv_pct(100));
  lv_obj_set_height(btnAp, sh(34));
  lv_obj_set_style_bg_color(btnAp, lv_color_hex(0x1E3A8A), 0);
  lv_obj_set_style_border_color(btnAp, lv_color_hex(COL_CYN), 0);
  lv_obj_set_style_border_width(btnAp, 1, 0);
  lv_obj_add_event_cb(btnAp, [](lv_event_t *e) {
    Serial.println("[cfg] abrindo AP portal a pedido do usuario");
    if (configModal) { lv_obj_del(configModal); configModal = nullptr; }
    startApPortal();
  }, LV_EVENT_CLICKED, NULL);
  makeLabel(btnAp, "Setup via celular (AP)", COL_CYN, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  addField("WiFi SSID",      WIFI_SSID,    &taSsid);

  // Botao SCAN — dispara busca assincrona, nao trava LVGL
  lv_obj_t *btnScan = lv_btn_create(list);
  lv_obj_set_width(btnScan, lv_pct(100));
  lv_obj_set_height(btnScan, sh(34));
  lv_obj_set_style_bg_color(btnScan, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_border_color(btnScan, lv_color_hex(COL_CYN), 0);
  lv_obj_set_style_border_width(btnScan, 1, 0);
  lv_obj_add_event_cb(btnScan, scanStartCb, LV_EVENT_CLICKED, NULL);
  makeLabel(btnScan, "Buscar redes WiFi", COL_CYN, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  addField("WiFi Senha",     WIFI_PASS,    &taPass,  true);
  addField("Server URL",     SERVER_URL,   &taUrl);
  addField("Device Token",   DEVICE_TOKEN, &taToken);
  char tentStr[12]; snprintf(tentStr, sizeof(tentStr), "%d", TENT_ID);
  addField("Tent ID",        tentStr,      &taTent,  false, true);

  // Botoes no rodape
  lv_obj_t *btnCancel = lv_btn_create(configModal);
  lv_obj_set_size(btnCancel, sw(96), sh(36));
  lv_obj_align(btnCancel, LV_ALIGN_BOTTOM_LEFT, sw(6), -sh(6));
  lv_obj_set_style_bg_color(btnCancel, lv_color_hex(COL_CARD), 0);
  lv_obj_add_event_cb(btnCancel, cfgCancelCb, LV_EVENT_CLICKED, NULL);
  makeLabel(btnCancel, "Cancelar", COL_TEXT, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  lv_obj_t *btnReset = lv_btn_create(configModal);
  lv_obj_set_size(btnReset, sw(78), sh(36));
  lv_obj_align(btnReset, LV_ALIGN_BOTTOM_MID, 0, -sh(6));
  lv_obj_set_style_bg_color(btnReset, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_border_color(btnReset, lv_color_hex(COL_RED), 0);
  lv_obj_set_style_border_width(btnReset, 1, 0);
  lv_obj_add_event_cb(btnReset, [](lv_event_t *e) {
    Serial.println("[cfg] reset WiFi -> AP portal");
    clearConfigNVS();
    delay(300);
    ESP.restart();
  }, LV_EVENT_CLICKED, NULL);
  makeLabel(btnReset, "Reset", COL_RED, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  lv_obj_t *btnSave = lv_btn_create(configModal);
  lv_obj_set_size(btnSave, sw(110), sh(36));
  lv_obj_align(btnSave, LV_ALIGN_BOTTOM_RIGHT, -sw(6), -sh(6));
  lv_obj_set_style_bg_color(btnSave, lv_color_hex(COL_GRN), 0);
  applyBloom(btnSave, COL_GRN);
  lv_obj_add_event_cb(btnSave, cfgSaveCb, LV_EVENT_CLICKED, NULL);
  makeLabel(btnSave, "Salvar", COL_TEXT, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  // Keyboard compartilhado — esconde ao pressionar OK ou Cancelar
  kbCfg = lv_keyboard_create(configModal);
  lv_obj_set_size(kbCfg, SCREEN_W, sh(110));
  lv_obj_align(kbCfg, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_add_flag(kbCfg, LV_OBJ_FLAG_HIDDEN);
  // Monserrat 14 tem os glyphs FontAwesome (SHIFT/BKSP/OK/etc).
  // Manrope (FONT_BODY) nao tem esses glyphs -> botoes apareceriam vazios.
  lv_obj_set_style_text_font(kbCfg, &lv_font_montserrat_14, 0);
  lv_obj_add_event_cb(kbCfg, [](lv_event_t *e) {
    lv_obj_add_flag(kbCfg, LV_OBJ_FLAG_HIDDEN);
  }, LV_EVENT_READY, NULL);
  lv_obj_add_event_cb(kbCfg, [](lv_event_t *e) {
    lv_obj_add_flag(kbCfg, LV_OBJ_FLAG_HIDDEN);
  }, LV_EVENT_CANCEL, NULL);
}

// ════════════════════════════════════════════════════════════════════════════════
// AP PORTAL — modo onboarding quando nao tem WiFi salvo.
// Sobe rede "Cultivo-Setup-XXXX" + webserver em 192.168.4.1 servindo form
// dark-theme pra preencher WiFi/Server/Token. Salva em NVS e reboota.
// ════════════════════════════════════════════════════════════════════════════════
static WebServer *apServer = nullptr;
static bool apPortalActive = false;
static char apSsid[24] = "";
static char apPass[13]  = "";  // "cultivoXXYY" — derivada dos 2 últimos bytes do MAC
static char otaPass[20] = "";  // senha de OTA derivada do MAC (idem AP mas com 3 bytes)
static lv_obj_t *apScreen = nullptr;

static const char PORTAL_HTML[] PROGMEM = R"HTML(<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cultivo Setup</title><style>
:root{
  --bg:#0B0F14;--card:#111827;--border:#1F2937;
  --fg:#F8FAFC;--fg-dim:#94A3B8;--fg-mute:#64748B;
  --green:#10B981;--green-soft:#34D399;--green-glow:rgba(16,185,129,.35);
  --r-md:10px;--r-lg:12px;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--fg);min-height:100vh;
  font-family:'Geist','Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
  font-feature-settings:"ss01","cv11";letter-spacing:-0.01em;
  max-width:460px;margin:0 auto;padding:24px 20px 40px}
header{text-align:center;padding:20px 0 10px}
.logo{display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;
  border-radius:50%;background:linear-gradient(135deg,#10B98122,#10B98108);
  box-shadow:0 0 24px var(--green-glow),inset 0 0 0 1px #10B98140;
  font-size:30px;line-height:56px}
h1{color:var(--fg);font-weight:700;font-size:22px;letter-spacing:-0.02em;
  margin:14px 0 4px;line-height:1.2}
.subtitle{color:var(--fg-dim);font-size:13px;margin:0 0 18px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--r-lg);
  padding:18px 16px;margin-top:12px}
label{display:block;margin-top:14px;color:var(--fg-dim);font-size:11px;font-weight:600;
  text-transform:uppercase;letter-spacing:0.06em}
label:first-child{margin-top:0}
input,select{width:100%;padding:13px 14px;background:#0B1220;border:1px solid var(--border);
  color:var(--fg);border-radius:var(--r-md);font-size:15px;margin-top:6px;outline:none;
  font-family:inherit;letter-spacing:inherit;
  transition:border-color .15s ease,box-shadow .15s ease}
input::placeholder{color:#475569}
input:hover,select:hover{border-color:#334155}
input:focus,select:focus{border-color:var(--green);box-shadow:0 0 0 3px var(--green-glow)}
button{width:100%;padding:14px;background:var(--green);color:#031712;border:none;
  border-radius:var(--r-md);font-size:14px;font-weight:700;margin-top:18px;cursor:pointer;
  letter-spacing:0.04em;text-transform:uppercase;font-family:inherit;
  box-shadow:0 0 22px var(--green-glow),inset 0 1px 0 rgba(255,255,255,.18);
  transition:transform .1s ease,box-shadow .15s ease}
button:hover{box-shadow:0 0 30px var(--green-glow),inset 0 1px 0 rgba(255,255,255,.18)}
button:active{transform:translateY(1px);box-shadow:0 0 14px var(--green-glow)}
.status{margin-top:12px;color:var(--fg-mute);font-size:12px;text-align:center;
  display:flex;align-items:center;justify-content:center;gap:6px}
.status.ok{color:var(--green-soft)}
.dot{width:6px;height:6px;border-radius:50%;background:var(--fg-mute);
  animation:pulse 1.4s ease-in-out infinite}
.status.ok .dot{background:var(--green-soft);animation:none}
@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
.footer{margin-top:24px;text-align:center;color:#475569;font-size:11px}
.footer a{color:#64748B;text-decoration:none;border-bottom:1px dashed #334155;padding-bottom:1px}
.footer a:hover{color:var(--green-soft);border-color:var(--green)}
</style></head><body>
<header>
<div class="logo">&#127793;</div>
<h1>Cultivo Setup</h1>
<p class="subtitle">Conectar dispositivo a sua rede</p>
</header>
<form action="/save" method="POST" class="card">
<label for="ssid">Rede WiFi</label>
<select name="ssid" id="ssid"><option>Escaneando...</option></select>
<label for="pass">Senha WiFi</label>
<input id="pass" type="password" name="pass" autocomplete="off" placeholder="* * * * * * * *">
<label for="url">Server URL</label>
<input id="url" type="url" name="url" value="https://cultivo.x.andy.plus">
<label for="token">Device Token</label>
<input id="token" type="text" name="token" autocomplete="off" placeholder="cole o token gerado no app">
<label for="tent">Tent ID</label>
<input id="tent" type="number" name="tent" value="1" min="1">
<button type="submit">Salvar e Reiniciar</button>
<div class="status" id="status"><span class="dot"></span><span>Escaneando redes WiFi</span></div>
</form>
<div class="footer"><a href="/update">recovery &middot; atualizar firmware</a></div>
<script>
fetch('/scan').then(r=>r.json()).then(d=>{
  const s=document.getElementById('ssid');const st=document.getElementById('status');
  s.innerHTML='';const list=d.networks||[];
  if(!list.length){st.querySelector('span:last-child').textContent='Nenhuma rede encontrada';return}
  list.forEach(n=>{const o=document.createElement('option');o.textContent=n;s.appendChild(o)});
  st.classList.add('ok');st.querySelector('span:last-child').textContent=list.length+' redes encontradas';
}).catch(()=>{document.getElementById('status').querySelector('span:last-child').textContent='Erro ao escanear'});
</script></body></html>)HTML";

static const char PORTAL_DONE_HTML[] PROGMEM = R"HTML(<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="3">
<title>Cultivo &mdash; Configurado</title><style>
:root{
  --bg:#0B0F14;--card:#111827;--border:#1F2937;
  --fg:#F8FAFC;--fg-dim:#94A3B8;--fg-mute:#64748B;
  --green:#10B981;--green-soft:#34D399;--green-glow:rgba(16,185,129,.35);
}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--fg);min-height:100vh;display:flex;
  align-items:center;justify-content:center;padding:32px 20px;
  font-family:'Geist','Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
  letter-spacing:-0.01em}
.wrap{max-width:380px;width:100%;text-align:center;animation:rise .5s ease-out both}
.icon{display:flex;align-items:center;justify-content:center;width:72px;height:72px;
  margin:0 auto 18px;border-radius:50%;
  background:linear-gradient(135deg,#10B98122,#10B98108);
  box-shadow:0 0 32px var(--green-glow),inset 0 0 0 1px #10B98140;
  animation:pop .55s cubic-bezier(.2,1.6,.4,1) both .1s}
.icon svg{stroke:var(--green-soft);stroke-width:2.5;stroke-linecap:round;
  stroke-linejoin:round;fill:none;width:34px;height:34px;
  stroke-dasharray:60;stroke-dashoffset:60;animation:draw .45s ease-out forwards .35s}
h1{color:var(--fg);font-weight:700;font-size:24px;letter-spacing:-0.02em;
  margin:0 0 8px;line-height:1.2}
.lead{color:var(--fg-dim);font-size:14px;line-height:1.5;margin:0 0 22px}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;
  padding:14px 16px;display:flex;align-items:center;justify-content:center;gap:10px;
  color:var(--fg-dim);font-size:13px}
.spinner{width:14px;height:14px;border-radius:50%;
  border:2px solid #1F2937;border-top-color:var(--green-soft);
  animation:spin .8s linear infinite}
.hint{margin-top:18px;color:var(--fg-mute);font-size:12px;line-height:1.5}
.hint b{color:var(--fg-dim);font-weight:600}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes pop{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
<div class="wrap">
<div class="icon"><svg viewBox="0 0 24 24"><polyline points="4 12.5 10 18.5 20 6.5"/></svg></div>
<h1>Tudo certo</h1>
<p class="lead">Configura&ccedil;&atilde;o salva. O dispositivo vai reiniciar e tentar conectar &agrave; rede.</p>
<div class="card"><div class="spinner"></div><span>Reiniciando...</span></div>
<p class="hint">Pode fechar esta p&aacute;gina. Se o display ficar em modo offline ap&oacute;s o boot, abra <b>Setup</b> no menu.</p>
</div>
</body></html>)HTML";

static void handlePortalRoot() {
  apServer->send_P(200, "text/html", PORTAL_HTML);
}

static void handlePortalScan() {
  int n = WiFi.scanNetworks();
  String j = "{\"networks\":[";
  for (int i = 0; i < n; i++) {
    if (i > 0) j += ",";
    String s = WiFi.SSID(i);
    s.replace("\"", "\\\"");
    j += "\"" + s + "\"";
  }
  j += "]}";
  apServer->send(200, "application/json", j);
}

static void handlePortalSave() {
  String ssid  = apServer->arg("ssid");
  String pass  = apServer->arg("pass");
  String url   = apServer->arg("url");
  String token = apServer->arg("token");
  int    tent  = apServer->arg("tent").toInt();
  if (tent <= 0) tent = 1;

  Serial.printf("[ap] save ssid=%s tent=%d\n", ssid.c_str(), tent);
  saveConfigToNVS(ssid.c_str(), pass.c_str(), url.c_str(), token.c_str(), tent);

  apServer->send_P(200, "text/html", PORTAL_DONE_HTML);
  delay(800);
  ESP.restart();
}

// Recovery de firmware via AP portal — util quando OTA comum nao e' viavel
// (nao ha' internet, mDNS bloqueado, etc). Upload de .bin direto pro flash.
static const char PORTAL_UPDATE_HTML[] PROGMEM = R"HTML(<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cultivo &mdash; Recovery</title><style>
:root{
  --bg:#0B0F14;--card:#111827;--border:#1F2937;
  --fg:#F8FAFC;--fg-dim:#94A3B8;--fg-mute:#64748B;
  --green:#10B981;--green-soft:#34D399;--green-glow:rgba(16,185,129,.35);
  --amber:#FBBF24;--amber-soft:#FCD34D;--amber-bg:rgba(251,191,36,.06);
  --r-md:10px;--r-lg:12px;
}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--fg);min-height:100vh;
  font-family:'Geist','Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
  letter-spacing:-0.01em;max-width:460px;margin:0 auto;padding:24px 20px 40px}
header{text-align:center;padding:14px 0 10px}
.icon{display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;
  border-radius:50%;background:linear-gradient(135deg,#10B98122,#10B98108);
  box-shadow:0 0 24px var(--green-glow),inset 0 0 0 1px #10B98140}
.icon svg{stroke:var(--green-soft);stroke-width:2;stroke-linecap:round;
  stroke-linejoin:round;fill:none;width:26px;height:26px}
h1{color:var(--fg);font-weight:700;font-size:22px;letter-spacing:-0.02em;
  margin:14px 0 4px;line-height:1.2}
.subtitle{color:var(--fg-dim);font-size:13px;margin:0 0 18px;line-height:1.5}
.warn{background:var(--amber-bg);border:1px solid #92400E55;border-left:3px solid var(--amber);
  padding:12px 14px;border-radius:var(--r-md);margin:0 0 16px;
  color:var(--amber-soft);font-size:12.5px;line-height:1.5;text-align:left}
.warn b{color:var(--amber)}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--r-lg);
  padding:18px 16px}
label{display:block;color:var(--fg-dim);font-size:11px;font-weight:600;
  text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px}
.filebox{position:relative;display:block;border:1.5px dashed var(--border);
  border-radius:var(--r-md);padding:24px 16px;text-align:center;
  background:#0B1220;cursor:pointer;
  transition:border-color .15s ease,background .15s ease}
.filebox:hover{border-color:#334155}
.filebox.active{border-color:var(--green);border-style:solid;
  background:#0F2D24;box-shadow:0 0 0 3px var(--green-glow)}
.filebox input[type=file]{position:absolute;inset:0;width:100%;height:100%;
  opacity:0;cursor:pointer}
.fname{color:var(--fg);font-size:14px;font-weight:600;word-break:break-all;
  margin-bottom:4px}
.fhint{color:var(--fg-mute);font-size:12px;line-height:1.5}
.fhint code{background:#1F2937;padding:2px 6px;border-radius:4px;
  font-family:ui-monospace,SF Mono,Menlo,monospace;font-size:11.5px}
button{width:100%;padding:14px;background:var(--green);color:#031712;border:none;
  border-radius:var(--r-md);font-size:14px;font-weight:700;margin-top:16px;cursor:pointer;
  letter-spacing:0.04em;text-transform:uppercase;font-family:inherit;
  box-shadow:0 0 22px var(--green-glow),inset 0 1px 0 rgba(255,255,255,.18);
  transition:transform .1s ease,box-shadow .15s ease,opacity .15s ease}
button:active{transform:translateY(1px)}
button:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}
.footer{margin-top:20px;text-align:center}
.footer a{color:var(--fg-mute);font-size:13px;text-decoration:none;
  border-bottom:1px dashed #334155;padding-bottom:1px}
.footer a:hover{color:var(--green-soft);border-color:var(--green)}
</style></head><body>
<header>
<div class="icon"><svg viewBox="0 0 24 24"><path d="M12 16V4"/><polyline points="6 10 12 4 18 10"/><path d="M4 20h16"/></svg></div>
<h1>Recovery</h1>
<p class="subtitle">Atualizar firmware do dispositivo</p>
</header>
<div class="warn"><b>Aten&ccedil;&atilde;o:</b> envie apenas o arquivo <code>firmware.bin</code> gerado pelo PlatformIO. Um arquivo errado pode brickar o dispositivo. Em caso de falha, restaure pelo backup com esptool.</div>
<form method="POST" enctype="multipart/form-data" action="/update" class="card" id="form">
<label for="fw">Arquivo de firmware</label>
<label class="filebox" id="filebox">
<input type="file" id="fw" name="fw" accept=".bin" required>
<div class="fname" id="fname">Toque aqui para selecionar</div>
<div class="fhint">arquivo <code>.bin</code> &middot; tipicamente em <code>.pio/build/real/firmware.bin</code></div>
</label>
<button type="submit" id="btn" disabled>Enviar firmware</button>
</form>
<div class="footer"><a href="/">&larr; Voltar para o setup</a></div>
<script>
const fw=document.getElementById('fw'),fname=document.getElementById('fname'),
  box=document.getElementById('filebox'),btn=document.getElementById('btn'),
  form=document.getElementById('form');
fw.addEventListener('change',()=>{
  if(fw.files.length){
    const f=fw.files[0],kb=(f.size/1024).toFixed(0);
    fname.textContent=f.name+' &middot; '+kb+' KB';
    box.classList.add('active');btn.disabled=false;
  }else{
    fname.textContent='Toque aqui para selecionar';
    box.classList.remove('active');btn.disabled=true;
  }
});
form.addEventListener('submit',()=>{btn.disabled=true;btn.textContent='Enviando...';});
</script></body></html>)HTML";

static void handlePortalUpdateGet() {
  apServer->send_P(200, "text/html", PORTAL_UPDATE_HTML);
}

// Pagina de resultado do upload — OK reboota em 3s; FAIL oferece tentar
// de novo. PROGMEM p/ economizar RAM. Mesmos tokens das outras paginas
// do portal (consistencia visual).
static const char PORTAL_UPDATE_OK_HTML[] PROGMEM = R"HTML(<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="3">
<title>Cultivo &mdash; Update OK</title><style>
:root{--bg:#0B0F14;--card:#111827;--border:#1F2937;
  --fg:#F8FAFC;--fg-dim:#94A3B8;--fg-mute:#64748B;
  --green:#10B981;--green-soft:#34D399;--green-glow:rgba(16,185,129,.35);}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--fg);min-height:100vh;display:flex;
  align-items:center;justify-content:center;padding:32px 20px;
  font-family:'Geist','Inter',-apple-system,system-ui,sans-serif;letter-spacing:-0.01em}
.wrap{max-width:380px;width:100%;text-align:center;animation:rise .5s ease-out both}
.icon{display:flex;align-items:center;justify-content:center;width:72px;height:72px;
  margin:0 auto 18px;border-radius:50%;
  background:linear-gradient(135deg,#10B98122,#10B98108);
  box-shadow:0 0 32px var(--green-glow),inset 0 0 0 1px #10B98140;
  animation:pop .55s cubic-bezier(.2,1.6,.4,1) both .1s}
.icon svg{stroke:var(--green-soft);stroke-width:2.5;stroke-linecap:round;
  stroke-linejoin:round;fill:none;width:34px;height:34px;
  stroke-dasharray:60;stroke-dashoffset:60;animation:draw .45s ease-out forwards .35s}
h1{color:var(--fg);font-weight:700;font-size:24px;letter-spacing:-0.02em;margin:0 0 8px}
.lead{color:var(--fg-dim);font-size:14px;line-height:1.5;margin:0 0 22px}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;
  padding:14px 16px;display:flex;align-items:center;justify-content:center;gap:10px;
  color:var(--fg-dim);font-size:13px}
.spinner{width:14px;height:14px;border-radius:50%;
  border:2px solid #1F2937;border-top-color:var(--green-soft);
  animation:spin .8s linear infinite}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes pop{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
<div class="wrap">
<div class="icon"><svg viewBox="0 0 24 24"><polyline points="4 12.5 10 18.5 20 6.5"/></svg></div>
<h1>Update conclu&iacute;do</h1>
<p class="lead">Firmware gravado com sucesso. O dispositivo vai reiniciar agora.</p>
<div class="card"><div class="spinner"></div><span>Reiniciando...</span></div>
</div>
</body></html>)HTML";

static const char PORTAL_UPDATE_FAIL_HTML[] PROGMEM = R"HTML(<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cultivo &mdash; Update FALHOU</title><style>
:root{--bg:#0B0F14;--card:#111827;--border:#1F2937;
  --fg:#F8FAFC;--fg-dim:#94A3B8;--fg-mute:#64748B;
  --red:#EF4444;--red-soft:#F87171;--red-glow:rgba(239,68,68,.35);
  --r-md:10px;--r-lg:12px;}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--fg);min-height:100vh;display:flex;
  align-items:center;justify-content:center;padding:32px 20px;
  font-family:'Geist','Inter',-apple-system,system-ui,sans-serif;letter-spacing:-0.01em}
.wrap{max-width:380px;width:100%;text-align:center;animation:rise .5s ease-out both}
.icon{display:flex;align-items:center;justify-content:center;width:72px;height:72px;
  margin:0 auto 18px;border-radius:50%;
  background:linear-gradient(135deg,#EF444422,#EF444408);
  box-shadow:0 0 32px var(--red-glow),inset 0 0 0 1px #EF444440;
  animation:shake .5s ease both .1s}
.icon svg{stroke:var(--red-soft);stroke-width:2.5;stroke-linecap:round;fill:none;
  width:30px;height:30px}
h1{color:var(--fg);font-weight:700;font-size:24px;letter-spacing:-0.02em;margin:0 0 8px}
.lead{color:var(--fg-dim);font-size:14px;line-height:1.5;margin:0 0 18px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--r-lg);
  padding:14px 16px;color:var(--fg-dim);font-size:12.5px;line-height:1.6;text-align:left}
.card b{color:var(--fg)}
.btn{display:inline-block;margin-top:18px;padding:12px 22px;border-radius:var(--r-md);
  background:#1F2937;color:var(--fg);text-decoration:none;font-weight:600;font-size:14px;
  border:1px solid #334155}
.btn:hover{background:#1F2937CC}
.btn.primary{background:var(--red-soft);color:#1A0B0B;border:0;
  box-shadow:0 0 18px var(--red-glow);margin-left:6px}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}
  50%{transform:translateX(4px)}75%{transform:translateX(-3px)}}
</style></head><body>
<div class="wrap">
<div class="icon"><svg viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg></div>
<h1>Update falhou</h1>
<p class="lead">N&atilde;o foi poss&iacute;vel gravar o firmware. O dispositivo continua com a vers&atilde;o anterior.</p>
<div class="card"><b>Poss&iacute;veis causas:</b><br>
&middot; Arquivo n&atilde;o &eacute; <code>firmware.bin</code> v&aacute;lido<br>
&middot; Conex&atilde;o WiFi instavel durante o upload<br>
&middot; Espa&ccedil;o insuficiente na flash</div>
<div><a href="/update" class="btn primary">Tentar de novo</a><a href="/" class="btn">Voltar</a></div>
</div>
</body></html>)HTML";

static void handlePortalUpdateDone() {
  bool ok = !Update.hasError();
  apServer->send_P(200, "text/html",
    ok ? PORTAL_UPDATE_OK_HTML : PORTAL_UPDATE_FAIL_HTML);
  delay(800);
  if (ok) ESP.restart();
}

static void handlePortalUpdateUpload() {
  HTTPUpload &up = apServer->upload();
  if (up.status == UPLOAD_FILE_START) {
    Serial.printf("[ap] update upload: %s\n", up.filename.c_str());
    if (!Update.begin(UPDATE_SIZE_UNKNOWN)) Update.printError(Serial);
  } else if (up.status == UPLOAD_FILE_WRITE) {
    if (Update.write(up.buf, up.currentSize) != up.currentSize) Update.printError(Serial);
  } else if (up.status == UPLOAD_FILE_END) {
    if (Update.end(true)) Serial.printf("[ap] update %u bytes ok\n", up.totalSize);
    else Update.printError(Serial);
  }
}

static void buildApScreen(const char *ssid, const char *pass, const char *ip) {
  if (apScreen) { lv_obj_del(apScreen); apScreen = nullptr; }
  apScreen = lv_obj_create(lv_scr_act());
  lv_obj_set_size(apScreen, SCREEN_W, SCREEN_H);
  lv_obj_set_pos(apScreen, 0, 0);
  lv_obj_set_style_bg_color(apScreen, lv_color_hex(0x060A10), 0);
  lv_obj_set_style_bg_opa(apScreen, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(apScreen, 0, 0);
  lv_obj_set_style_radius(apScreen, 0, 0);
  lv_obj_set_style_pad_all(apScreen, 0, 0);
  lv_obj_clear_flag(apScreen, LV_OBJ_FLAG_SCROLLABLE);
  // nao interceptar cliques no proprio overlay — so os filhos (botao) clicaveis
  lv_obj_clear_flag(apScreen, LV_OBJ_FLAG_CLICKABLE);

  makeLabel(apScreen, "MODO SETUP", COL_YEL, FONT_TITLE, LV_ALIGN_TOP_MID, 0, sh(14));
  makeLabel(apScreen, "Conecte seu celular na rede:", COL_DIM, FONT_CAPTION,
            LV_ALIGN_TOP_MID, 0, sh(40));

  lv_obj_t *lblSsid = lv_label_create(apScreen);
  lv_label_set_text(lblSsid, ssid);
  lv_obj_set_style_text_font(lblSsid, FONT_BODY, 0);
  lv_obj_set_style_text_color(lblSsid, lv_color_hex(COL_GRN), 0);
  lv_obj_align(lblSsid, LV_ALIGN_TOP_MID, 0, sh(54));
  applyBloom(lblSsid, COL_GRN);

  makeLabel(apScreen, "Senha:", COL_DIM, FONT_CAPTION,
            LV_ALIGN_TOP_MID, 0, sh(76));
  lv_obj_t *lblPass = lv_label_create(apScreen);
  lv_label_set_text(lblPass, pass);
  lv_obj_set_style_text_font(lblPass, FONT_BODY, 0);
  lv_obj_set_style_text_color(lblPass, lv_color_hex(COL_YEL), 0);
  lv_obj_align(lblPass, LV_ALIGN_TOP_MID, 0, sh(90));

  makeLabel(apScreen, "Abra no navegador:", COL_DIM, FONT_CAPTION,
            LV_ALIGN_TOP_MID, 0, sh(110));

  lv_obj_t *lblIp = lv_label_create(apScreen);
  char buf[32];
  snprintf(buf, sizeof(buf), "http://%s", ip);
  lv_label_set_text(lblIp, buf);
  lv_obj_set_style_text_font(lblIp, FONT_BODY, 0);
  lv_obj_set_style_text_color(lblIp, lv_color_hex(COL_CYN), 0);
  lv_obj_align(lblIp, LV_ALIGN_TOP_MID, 0, sh(120));

  // Botao fallback — abre o modal de config direto no display (teclado LVGL).
  // Util quando nao da' pra usar o portal via WiFi (ex: Wokwi sem simulacao de AP).
  lv_obj_t *btnManual = lv_btn_create(apScreen);
  lv_obj_set_size(btnManual, sw(200), sh(36));
  lv_obj_align(btnManual, LV_ALIGN_BOTTOM_MID, 0, -sh(38));
  lv_obj_set_style_bg_color(btnManual, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_border_color(btnManual, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_border_width(btnManual, 2, 0);
  lv_obj_set_ext_click_area(btnManual, sw(12));
  applyBloom(btnManual, COL_GRN);
  lv_obj_add_event_cb(btnManual, [](lv_event_t *e) {
    Serial.println("[ap] abrindo modal manual de config");
    openConfigModal();
    if (configModal) lv_obj_move_foreground(configModal);
  }, LV_EVENT_CLICKED, NULL);
  makeLabel(btnManual, "Configurar no display", COL_GRN, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  makeLabel(apScreen, "Aguardando configuracao...", COL_DIM, FONT_CAPTION,
            LV_ALIGN_BOTTOM_MID, 0, -sh(22));
  makeLabel(apScreen, "fw " FW_VERSION, COL_DIM, FONT_CAPTION,
            LV_ALIGN_BOTTOM_RIGHT, -sw(6), -sh(4));
}

static void startApPortal() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  snprintf(apSsid, sizeof(apSsid), "Cultivo-%02X%02X", mac[4], mac[5]);
  snprintf(apPass, sizeof(apPass), "cultivo%02x%02x", mac[4], mac[5]);

  WiFi.mode(WIFI_AP);
  WiFi.softAP(apSsid, apPass);
  delay(300);
  IPAddress ip = WiFi.softAPIP();

  apServer = new WebServer(80);
  apServer->on("/",       HTTP_GET,  handlePortalRoot);
  apServer->on("/scan",   HTTP_GET,  handlePortalScan);
  apServer->on("/save",   HTTP_POST, handlePortalSave);
  apServer->on("/update", HTTP_GET,  handlePortalUpdateGet);
  apServer->on("/update", HTTP_POST, handlePortalUpdateDone, handlePortalUpdateUpload);
  apServer->onNotFound([]() { apServer->send_P(200, "text/html", PORTAL_HTML); });
  apServer->begin();

  apPortalActive = true;
  buildApScreen(apSsid, apPass, ip.toString().c_str());
  Serial.printf("[ap] portal ativo: %s pass=%s @ %s\n", apSsid, apPass, ip.toString().c_str());
}
// ════════════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════════════
// UI inline (HOME, LUX, pH/EC, TAREFAS, HISTORICO, navbar, refresh*) movida
// pra cultivo_ui.cpp na fase 2 da refatoracao. App registra handlers em
// setup() via cultivoUI_set*Handler() pra os POSTs HTTP.
// ════════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════════
// WiFi + HTTP
// ════════════════════════════════════════════════════════════════════════════════
static void connectWifi() {
  if (strlen(WIFI_SSID) == 0) { Serial.println("WiFi nao configurado"); return; }
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi");
  for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) { delay(500); Serial.print('.'); }
  wifiOk = (WiFi.status() == WL_CONNECTED);
  Serial.println(wifiOk ? " OK" : " FALHOU");
}

// Certificados raiz ISRG (Let's Encrypt) — bundle X1 (RSA, cobre R3/R10/R11)
// e X2 (ECDSA, cobre E5/E6/E7/E8). cultivo.pro usa intermediate E8 -> X2;
// outros endpoints podem usar X1. WiFiClientSecure aceita multiplos PEMs
// concatenados em uma string (chain bundle), validando contra qualquer um.
static const char LE_ROOTS[] PROGMEM = R"EOF(-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoBggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIICGzCCAaGgAwIBAgIQQdKd0XLq7qeAwSxs6S+HUjAKBggqhkjOPQQDAzBPMQsw
CQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJuZXQgU2VjdXJpdHkgUmVzZWFyY2gg
R3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBYMjAeFw0yMDA5MDQwMDAwMDBaFw00
MDA5MTcxNjAwMDBaME8xCzAJBgNVBAYTAlVTMSkwJwYDVQQKEyBJbnRlcm5ldCBT
ZWN1cml0eSBSZXNlYXJjaCBHcm91cDEVMBMGA1UEAxMMSVNSRyBSb290IFgyMHYw
EAYHKoZIzj0CAQYFK4EEACIDYgAEzZvVn4CDCuwJSvMWSj5cz3es3mcFDR0HttwW
+1qLFNvicWDEukWVEYmO6gbf9yoWHKS5xcUy4APgHoIYOIvXRdgKam7mAHf7AlF9
ItgKbppbd9/w+kHsOdx1ymgHDB/qo0IwQDAOBgNVHQ8BAf8EBAMCAQYwDwYDVR0T
AQH/BAUwAwEB/zAdBgNVHQ4EFgQUfEKWrt5LSDv6kviejM9ti6lyN5UwCgYIKoZI
zj0EAwMDaAAwZQIwe3lORlCEwkSHRhtFcP9Ymd70/aTSVaYgLXTWNLxBo1BfASdW
tL4ndQavEi51mI38AjEAi/V3bNTIZargCyzuFJ0nN6T5U6VR5CmD1/iQMVtCnwr1
/q4AaOeMSQ+2b1tbFfLn
-----END CERTIFICATE-----
)EOF";

// Helper que escolhe WiFiClient (http) ou WiFiClientSecure (https) automaticamente.
// Usa ISRG Root X1 para validar certs Let's Encrypt (cultivo.x.andy.plus).
// Para servidores self-hosted com outra CA, ajuste ISRG_ROOT_X1 acima.
static WiFiClient       httpPlainClient;
static WiFiClientSecure httpSecureClient;
static bool httpClientsInited = false;

static bool httpBegin(HTTPClient &http, const char *url) {
  if (!httpClientsInited) {
    // setInsecure: pula validacao do cert servidor. Necessario pq Cloudflare
    // (que serve app.cultivo.pro) so envia o leaf cert sem o intermediate
    // Let's Encrypt E8, e o mbedTLS do ESP nao fetch AIA. Bundle de roots
    // (X1+X2) nao basta — precisaria do intermediate tambem.
    // TODO: adicionar E8 PEM ao LE_ROOTS bundle p/ ativar setCACert seguro.
    httpSecureClient.setInsecure();
    httpClientsInited = true;
  }
  if (strncmp(url, "https://", 8) == 0) {
    return http.begin(httpSecureClient, url);
  }
  return http.begin(httpPlainClient, url);
}

// ════════════════════════════════════════════════════════════════════════════════
// Device pairing flow (RFC 8628 Device Authorization Grant)
// User boot sem token? Chama pair-init -> mostra code -> polla pair-status
// cada 5s ate' user digitar o code no app web. Quando o app pareia, retorna
// { token, tentId } — salvamos em NVS e seguimos pro fluxo normal.
// ════════════════════════════════════════════════════════════════════════════════
struct PairInitResult {
  bool   ok;
  char   code[16];
  int    expiresIn;
  int    pollIntervalSec;
  int    httpCode;
};

struct PairStatusResult {
  // status: 0=pending, 1=paired, 2=expired, 3=not_found, -1=erro/timeout
  int    status;
  char   token[65];
  int    tentId;
};

static bool postPairInit(PairInitResult *out) {
  if (!wifiOk || !out) return false;
  HTTPClient http;
  char url[128];
  snprintf(url, sizeof(url), "%s/api/device/pair-init", SERVER_URL);
  httpBegin(http, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000);
  // Body opcional — manda nome amigavel pro user identificar no app
  int code = http.POST("{\"deviceName\":\"ESP32-display\"}");
  out->httpCode = code;
  if (code != 200) {
    Serial.printf("[pair] pair-init HTTP %d\n", code);
    if (code > 0) Serial.printf("[pair] body: %s\n", http.getString().substring(0, 200).c_str());
    http.end();
    out->ok = false;
    return false;
  }
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getStream());
  http.end();
  if (err != DeserializationError::Ok) {
    Serial.printf("[pair] pair-init JSON parse err: %s\n", err.c_str());
    out->ok = false;
    return false;
  }
  const char *codeStr = doc["code"];
  if (!codeStr) { out->ok = false; return false; }
  strncpy(out->code, codeStr, sizeof(out->code) - 1);
  out->code[sizeof(out->code) - 1] = '\0';
  out->expiresIn       = doc["expiresIn"]       | 600;
  out->pollIntervalSec = doc["pollIntervalSec"] | 5;
  out->ok = true;
  Serial.printf("[pair] code=%s expira em %ds (poll %ds)\n",
                out->code, out->expiresIn, out->pollIntervalSec);
  return true;
}

static void getPairStatus(const char *code, PairStatusResult *out) {
  out->status = -1; out->token[0] = '\0'; out->tentId = 0;
  if (!wifiOk || !code) return;
  HTTPClient http;
  char url[160];
  snprintf(url, sizeof(url), "%s/api/device/pair-status?code=%s", SERVER_URL, code);
  httpBegin(http, url);
  http.setTimeout(5000);
  int httpCode = http.GET();
  if (httpCode == 410) { out->status = 2; http.end(); return; }  // expired
  if (httpCode == 404) { out->status = 3; http.end(); return; }  // not_found
  if (httpCode != 200) {
    Serial.printf("[pair] pair-status HTTP %d\n", httpCode);
    http.end();
    return;
  }
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getStream());
  http.end();
  if (err != DeserializationError::Ok) return;
  const char *st = doc["status"];
  if (!st) return;
  if (strcmp(st, "paired") == 0) {
    out->status = 1;
    const char *tk = doc["token"];
    if (tk) {
      strncpy(out->token, tk, sizeof(out->token) - 1);
      out->token[sizeof(out->token) - 1] = '\0';
    }
    out->tentId = doc["tentId"] | 1;
  } else if (strcmp(st, "expired") == 0) {
    out->status = 2;
  } else if (strcmp(st, "not_found") == 0) {
    out->status = 3;
  } else {
    out->status = 0;  // pending (or unknown — trata como pending)
  }
}

// POST /api/device/refresh-tuya/:tentId — forca poll imediato no servidor
// Retorna tempC/rh/vpd frescos (pH/EC nao vem do Tuya).
// Flag refreshPending declarada no topo do arquivo; setada via tap handlers.
static bool refreshTuyaNow() {
  if (!wifiOk) return false;
  HTTPClient http;
  char url[128];
  snprintf(url, sizeof(url), "%s/api/device/refresh-tuya/%d", SERVER_URL, TENT_ID);
  httpBegin(http, url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000);  // Tuya cloud as vezes e lento
  int code = http.POST("{}");
  if (code != 200) { http.end(); return false; }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getStream());
  http.end();
  if (err != DeserializationError::Ok) return false;
  if (!doc["tempC"].isNull()) tempC = doc["tempC"].as<float>();
  if (!doc["rh"].isNull())    rh    = doc["rh"].as<float>();
  if (!doc["vpd"].isNull())   vpd   = doc["vpd"].as<float>();
  return true;
}

static bool fetchDisplayData() {
  if (!wifiOk) return false;
  HTTPClient http;
  char url[128];
  snprintf(url, sizeof(url), "%s/api/device/display/%d", SERVER_URL, TENT_ID);
  httpBegin(http, url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  int code = http.GET();
  Serial.printf("[net] fetchDisplay HTTP %d (%s)\n", code, url);
  if (code != 200) {
    if (code > 0) Serial.printf("[net] body: %s\n", http.getString().substring(0, 200).c_str());
    http.end();
    return false;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getStream());
  http.end();
  if (err != DeserializationError::Ok) return false;
  if (!doc["tempC"].isNull())    tempC    = doc["tempC"].as<float>();
  if (!doc["rh"].isNull())       rh       = doc["rh"].as<float>();
  if (!doc["vpd"].isNull())      vpd      = doc["vpd"].as<float>();
  if (!doc["ph"].isNull())       phv      = doc["ph"].as<float>();
  if (!doc["ec"].isNull())       ecv      = doc["ec"].as<float>();
  if (!doc["semana"].isNull())   semana   = doc["semana"].as<int>();
  if (!doc["totalSem"].isNull()) totalSem = doc["totalSem"].as<int>();
  Serial.printf("[net] dados: T=%.1f RH=%.0f VPD=%.2f pH=%.1f EC=%.2f sem=%d/%d\n",
                tempC, rh, vpd, phv, ecv, semana, totalSem);
  if (!doc["lux"].isNull())      currentLux  = doc["lux"].as<int>();
  if (!doc["ppfd"].isNull()) {
    currentPpfd = doc["ppfd"].as<int>();
    // Sincroniza targetPpfd com o ultimo valor salvo (pra o usuario ver "como deixou")
    if (currentPpfd > 0) targetPpfd = currentPpfd;
  }
  const char* f = doc["fase"];     if (f) { strncpy(FASE, f, sizeof(FASE)-1); FASE[sizeof(FASE)-1]='\0'; }
  const char* t = doc["tentName"]; if (t) { strncpy(TENT_NAME, t, sizeof(TENT_NAME)-1); TENT_NAME[sizeof(TENT_NAME)-1]='\0'; }
  return true;
}

// fetchHistory/fetchTasks/postTaskComplete: removidos na limpeza pos-fase-2.
// UI nova nao consome historico chart nem tarefas (Cenas substituiu Tarefas;
// historico tab ainda existe em cultivo_ui mas usa dados internos mockados).

static void postReading(float newPh, float newEc) {
  if (!wifiOk) return;
  HTTPClient http;
  char url[128];
  snprintf(url, sizeof(url), "%s/api/device/readings", SERVER_URL);
  httpBegin(http, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  char body[96];
  snprintf(body, sizeof(body), "{\"tentId\":%d,\"ph\":%.1f,\"ec\":%.2f}",
           TENT_ID, newPh, newEc);
  int code = http.POST(body);
  http.end();
  Serial.printf("postReading: %d\n", code);
}

static bool postPpfd(int ppfd) {
  if (!wifiOk) return false;
  HTTPClient http;
  char url[128];
  snprintf(url, sizeof(url), "%s/api/device/readings", SERVER_URL);
  httpBegin(http, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  char body[64];
  snprintf(body, sizeof(body), "{\"tentId\":%d,\"ppfd\":%d}", TENT_ID, ppfd);
  int code = http.POST(body);
  http.end();
  Serial.printf("postPpfd(%d): %d\n", ppfd, code);
  return code == 200;
}

// postWatering removido — rega agora e automatica (bomba do hardware real)

// ════════════════════════════════════════════════════════════════════════════════
// Task FreeRTOS de rede — isola HTTP do loop principal
// Roda no core 0 (Arduino loop fica no core 1). Sem essa task, fetchDisplayData()
// bloqueava o loop por ate 5s, travando animacoes LVGL e touch.
// As funcoes de fetch so escrevem globais (tempC, rh, phv, etc) — nao tocam LVGL.
// Apos fetch OK, seta uiNeedsRefresh → loop() chama refreshHomeValues() no thread
// principal (LVGL nao e thread-safe).
// ════════════════════════════════════════════════════════════════════════════════
static TaskHandle_t netTaskHandle = NULL;

// Logger de tempo decorrido — acima do threshold, loga WARN.
// Substitui WDT customizado: WDT so ajuda se setuparmos timeout > Tuya timeout
// (8s), mas reboot em falso positivo seria pior UX que um log no serial.
// HTTPClient.setTimeout() ja garante que nenhuma chamada trave alem do limite.
static inline void logIfSlow(const char *label, uint32_t t0, uint32_t thresholdMs) {
  uint32_t dt = millis() - t0;
  if (dt > thresholdMs) Serial.printf("[net] WARN %s lento: %ums\n", label, dt);
}

static void netTaskFn(void *param) {
  for (;;) {
    if (!wifiOk) { vTaskDelay(pdMS_TO_TICKS(1000)); continue; }

    if (refreshPending) {
      refreshPending = false;
      Serial.println("[net] refreshTuya");
      uint32_t t0 = millis();
      if (refreshTuyaNow()) uiNeedsRefresh = true;
      logIfSlow("refreshTuya", t0, 9000);
    }

    if (millis() - lastFetch >= FETCH_INTERVAL) {
      lastFetch = millis();
      uint32_t t0 = millis();
      if (fetchDisplayData()) uiNeedsRefresh = true;
      logIfSlow("fetchDisplay", t0, 6000);
    }

    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

static void startNetTask() {
  if (netTaskHandle) return;
  // Stack 8KB: cobre TLS handshake (~4KB) + JSON parsing (~2KB) com folga
  xTaskCreatePinnedToCore(netTaskFn, "netTask", 8192, NULL, 1, &netTaskHandle, 0);
  Serial.println("[net] task iniciada no core 0");
}

// ════════════════════════════════════════════════════════════════════════════════
// ArduinoOTA — update por WiFi via PlatformIO/espota.py
// Hostname derivado do MAC (cultivo-XXYY.local via mDNS).
// Senha derivada do MAC (cultivoOTAaabbcc) — impede upload nao autorizado.
// A senha e' logada no serial no boot pra o desenvolvedor saber.
// ════════════════════════════════════════════════════════════════════════════════
static void startOTA() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char hostname[32];
  snprintf(hostname, sizeof(hostname), "cultivo-%02X%02X", mac[4], mac[5]);
  snprintf(otaPass, sizeof(otaPass), "cultivoOTA%02x%02x%02x", mac[3], mac[4], mac[5]);

  ArduinoOTA.setHostname(hostname);
  ArduinoOTA.setPassword(otaPass);
  ArduinoOTA.onStart([]() { Serial.println("[ota] iniciando update"); });
  ArduinoOTA.onEnd([]()   { Serial.println("[ota] concluido, rebootando"); });
  ArduinoOTA.onError([](ota_error_t err) { Serial.printf("[ota] erro %u\n", err); });
  ArduinoOTA.begin();
  Serial.printf("[ota] host=%s.local pass=%s\n", hostname, otaPass);
}

// ════════════════════════════════════════════════════════════════════════════════
// UI builder — delega pra cultivo_ui.cpp (compartilhado com sim SDL2)
// + wrappers pra adaptar assinaturas dos POSTs HTTP locais aos handlers UI
// ════════════════════════════════════════════════════════════════════════════════

// CultivoSaveLuxFn = void(int) — postPpfd retorna bool, descartamos.
static void luxSaveHandler(int ppfd) { postPpfd(ppfd); }
// Tap em TEMP/UMID na Home: sinaliza refresh ao netTask, que chama
// refreshTuyaNow() (server forca poll Tuya) + fetchDisplayData() (re-puxa
// valores). Loop entao chama refreshHomeValues() pra atualizar a UI.
static void refreshHandler() {
  refreshPending = true;
  Serial.println("[ui] tap-to-refresh requested");
}
// Tap em botao de cena na tela CENAS. Faz POST p/ endpoint do server que
// dispara cena Tuya. Endpoint server-side: /api/device/scene/:sceneId/trigger
// (a' integrar no proximo PR do cultivo-server — branch
// claude/smartlife-scenes-opt-in ja' tem a infra triggerTuyaScene + tabela
// tuyaManualScenes; falta so' expor o endpoint Express de device-side).
// Sem WiFi este request descarta logo no inicio (silent fail OK).
static const char *SCENE_NAMES[] = { "irrigar", "luz-off", "custom" };
static void sceneTriggerHandler(int sceneId) {
  const char *name = (sceneId >= 0 && sceneId < 3) ? SCENE_NAMES[sceneId] : "?";
  Serial.printf("[scene] trigger sceneId=%d (%s)\n", sceneId, name);
  if (!wifiOk) {
    Serial.println("[scene] WiFi offline — request descartado");
    return;
  }
  HTTPClient http;
  char url[256];
  snprintf(url, sizeof(url),
           "%s/api/device/scene/%d/trigger?token=%s&tentId=%d",
           SERVER_URL, sceneId, DEVICE_TOKEN, TENT_ID);
  if (!httpBegin(http, url)) {
    Serial.println("[scene] httpBegin falhou");
    return;
  }
  int code = http.POST("");
  Serial.printf("[scene] sceneId=%d HTTP %d\n", sceneId, code);
  http.end();
}

static void buildUI() {
  // Registrar handlers antes do build — UI precisa deles disponiveis quando
  // user clicar nos saves/toggles. postReading + openConfigModal tem
  // assinaturas que ja batem com os typedef de cultivo_ui.h.
  cultivoUI_setLuxSaveHandler(luxSaveHandler);
  cultivoUI_setPhEcSaveHandler(postReading);
  cultivoUI_setConfigOpenHandler(openConfigModal);
  cultivoUI_setRefreshHandler(refreshHandler);
  cultivoUI_setSceneTriggerHandler(sceneTriggerHandler);
  buildCultivoUI();
}

// ════════════════════════════════════════════════════════════════════════════════
// Arduino entry points
// ════════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════════
// Tela de pareamento (RFC 8628) — fullscreen overlay igual splash/AP screen.
// Mostrado quando o device tem WiFi mas nao tem token. Faz pair-init pra
// obter o code, polla pair-status ate' o user digitar o code no app web.
// ════════════════════════════════════════════════════════════════════════════════
static lv_obj_t *pairScreen   = nullptr;
static lv_obj_t *lblPairCode  = nullptr;
static lv_obj_t *lblPairTimer = nullptr;
static lv_obj_t *lblPairHint  = nullptr;

static void buildPairScreen() {
  pairScreen = lv_obj_create(lv_scr_act());
  lv_obj_set_size(pairScreen, SCREEN_W, SCREEN_H);
  lv_obj_set_pos(pairScreen, 0, 0);
  lv_obj_set_style_bg_color(pairScreen, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(pairScreen, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(pairScreen, 0, 0);
  lv_obj_set_style_radius(pairScreen, 0, 0);
  lv_obj_set_style_pad_all(pairScreen, 0, 0);
  lv_obj_clear_flag(pairScreen, LV_OBJ_FLAG_SCROLLABLE);

  // Glow verde sutil canto superior — match estetica das outras telas
  lv_obj_t *glow = lv_obj_create(pairScreen);
  lv_obj_set_size(glow, SCREEN_W * 3 / 5, SCREEN_H * 2 / 3);
  lv_obj_set_pos(glow, 0, 0);
  lv_obj_set_style_bg_color(glow, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_bg_opa(glow, LV_OPA_10, 0);
  lv_obj_set_style_bg_grad_color(glow, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_grad_dir(glow, LV_GRAD_DIR_HOR, 0);
  lv_obj_set_style_border_width(glow, 0, 0);
  lv_obj_set_style_radius(glow, 0, 0);
  lv_obj_remove_flag(glow, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_remove_flag(glow, LV_OBJ_FLAG_SCROLLABLE);

  // Header — "CONECTAR DISPLAY"
  makeLabel(pairScreen, "CONECTAR DISPLAY", COL_GRN, FONT_TITLE,
            LV_ALIGN_TOP_MID, 0, sh(12));
  makeLabel(pairScreen, "Vincule este display \xC3\xA0 sua estufa",
            COL_DIM, FONT_CAPTION, LV_ALIGN_TOP_MID, 0, sh(40));

  // Code central — fonte VALUE (geist_bold_40), com ext_click_area p/ user
  // saber que da' pra interagir. Letterspacing alto p/ legibilidade a distancia.
  lblPairCode = lv_label_create(pairScreen);
  lv_label_set_text(lblPairCode, "------");
  lv_obj_set_style_text_color(lblPairCode, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_text_font(lblPairCode, FONT_VALUE, 0);
  lv_obj_set_style_text_letter_space(lblPairCode, sw(6), 0);
  lv_obj_align(lblPairCode, LV_ALIGN_CENTER, 0, -sh(8));

  // Hint — onde digitar
  lblPairHint = lv_label_create(pairScreen);
  lv_label_set_text(lblPairHint, "app.cultivo.pro \xE2\x86\x92 Conectar Display");
  lv_obj_set_style_text_color(lblPairHint, lv_color_hex(COL_CYN), 0);
  lv_obj_set_style_text_font(lblPairHint, FONT_BODY, 0);
  lv_obj_align(lblPairHint, LV_ALIGN_CENTER, 0, sh(48));

  // Timer countdown abaixo
  lblPairTimer = lv_label_create(pairScreen);
  lv_label_set_text(lblPairTimer, "expira em --:--");
  lv_obj_set_style_text_color(lblPairTimer, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(lblPairTimer, FONT_CAPTION, 0);
  lv_obj_align(lblPairTimer, LV_ALIGN_BOTTOM_MID, 0, -sh(36));

  // Botao "Trocar WiFi" — limpa NVS e reboota -> AP portal
  lv_obj_t *btnReset = lv_btn_create(pairScreen);
  lv_obj_set_size(btnReset, sw(100), sh(28));
  lv_obj_align(btnReset, LV_ALIGN_BOTTOM_MID, 0, -sh(6));
  lv_obj_set_style_bg_color(btnReset, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_border_color(btnReset, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_border_width(btnReset, 1, 0);
  lv_obj_add_event_cb(btnReset, [](lv_event_t *e) {
    Serial.println("[pair] user cancelou — clearConfigNVS + reboot p/ AP portal");
    clearConfigNVS();
    delay(300);
    ESP.restart();
  }, LV_EVENT_CLICKED, NULL);
  makeLabel(btnReset, "Trocar WiFi", COL_DIM, FONT_CAPTION, LV_ALIGN_CENTER, 0, 0);
}

static void updatePairCode(const char *code) {
  if (lblPairCode) lv_label_set_text(lblPairCode, code);
}

static void updatePairTimer(int secondsLeft) {
  if (!lblPairTimer) return;
  if (secondsLeft < 0) secondsLeft = 0;
  char buf[32];
  snprintf(buf, sizeof(buf), "expira em %d:%02d", secondsLeft / 60, secondsLeft % 60);
  lv_label_set_text(lblPairTimer, buf);
}

static void dismissPairScreen() {
  if (pairScreen) {
    lv_obj_del(pairScreen);
    pairScreen = nullptr;
    lblPairCode = lblPairTimer = lblPairHint = nullptr;
  }
}

// Bloqueia o setup() rodando lv_timer_handler + polling pair-status ate'
// o user parear via app web. Salva token em NVS e retorna quando paired.
// Retry de pair-init em caso de falha de rede com backoff de 30s.
static bool runPairingFlow() {
  buildPairScreen();
  lv_timer_handler();
  delay(20);

  PairInitResult pi = {};
  unsigned long lastPoll  = 0;
  unsigned long expireAt  = 0;
  unsigned long pollMs    = 5000;
  bool haveCode = false;

  // Get first code
  while (!haveCode) {
    if (postPairInit(&pi) && pi.ok) {
      updatePairCode(pi.code);
      haveCode = true;
      pollMs   = pi.pollIntervalSec * 1000;
      expireAt = millis() + (unsigned long)pi.expiresIn * 1000;
    } else {
      Serial.println("[pair] pair-init falhou, retry em 30s");
      updatePairCode("ERRO");
      // Aguarda 30s renderizando UI
      unsigned long w = millis();
      while (millis() - w < 30000) { lv_timer_handler(); delay(20); }
    }
  }

  // Loop polling
  for (;;) {
    lv_timer_handler();
    delay(20);

    long secLeft = ((long)expireAt - (long)millis()) / 1000;
    updatePairTimer((int)secLeft);

    // Code expirou? Pede outro automaticamente.
    if (secLeft <= 0) {
      Serial.println("[pair] code expirou, gerando novo");
      if (postPairInit(&pi) && pi.ok) {
        updatePairCode(pi.code);
        pollMs   = pi.pollIntervalSec * 1000;
        expireAt = millis() + (unsigned long)pi.expiresIn * 1000;
        lastPoll = 0;
      } else {
        // Backoff 30s renderizando
        unsigned long w = millis();
        while (millis() - w < 30000) { lv_timer_handler(); delay(20); }
      }
      continue;
    }

    // Polling pair-status
    if (millis() - lastPoll >= pollMs) {
      lastPoll = millis();
      PairStatusResult ps;
      getPairStatus(pi.code, &ps);
      if (ps.status == 1) {  // paired!
        Serial.printf("[pair] paired! tentId=%d\n", ps.tentId);
        saveDeviceTokenToNVS(ps.token, ps.tentId);
        dismissPairScreen();
        return true;
      } else if (ps.status == 2 || ps.status == 3) {
        // expired ou not_found — gera novo code na proxima iteracao
        expireAt = millis();  // forca renovacao
      }
      // ps.status 0 (pending) ou -1 (erro tx) — continua pollando
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial.printf("\n[boot] Cultivo ESP32 Display fw=%s\n", FW_VERSION);
  loadConfigFromNVS();

  Serial.println("[boot] display init"); Serial.flush();
  hal_display_init(TFT_SCK, TFT_MISO, TFT_MOSI, TFT_CS, TFT_DC, TFT_RST);

  // Esperar AXS15231B estabilizar apos QSPI init — algumas variantes precisam
  // de tempo p/ a parte touch I2C ficar ativa.
  delay(500);

  Serial.println("[boot] touch I2C init (IDF i2c_master peripheral 1)"); Serial.flush();
#ifdef REAL_HARDWARE
  if (!hal_touch_init()) Serial.println("[boot] hal_touch_init FAILED");
#else
  Wire.begin(TOUCH_SDA, TOUCH_SCL);
#endif
  Serial.println("[boot] lv_init"); Serial.flush();
  lv_init();

  // LVGL v9: tick a partir de millis() (nao precisa de timer manual)
  lv_tick_set_cb([]() -> uint32_t { return millis(); });

  // LVGL v9: criar display + setar flush callback + buffers
  // (ordem importa: flush_cb antes de set_buffers; color format fica no default
  // que e' RGB565 quando LV_COLOR_DEPTH=16)
  Serial.println("[boot] lv_display_create"); Serial.flush();
  lv_display_t *disp = lv_display_create(SCREEN_W, SCREEN_H);  // 480x320 landscape
  Serial.println("[boot] display_set_flush_cb"); Serial.flush();
  lv_display_set_flush_cb(disp, disp_flush);
  Serial.println("[boot] display_set_buffers"); Serial.flush();
#ifdef REAL_HARDWARE
  size_t fullBufBytes = 480 * 320 * 2;
  fullBuf = (uint8_t*)heap_caps_malloc(fullBufBytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  if (!fullBuf) { Serial.println("[boot] PSRAM fail"); while(1) delay(1000); }
  Serial.printf("[boot] PSRAM fullBuf=%p size=%u\n", fullBuf, (unsigned)fullBufBytes);
  lv_display_set_buffers(disp, fullBuf, NULL, fullBufBytes, LV_DISPLAY_RENDER_MODE_FULL);
#else
  lv_display_set_buffers(disp, buf1, NULL, sizeof(buf1), LV_DISPLAY_RENDER_MODE_PARTIAL);
#endif
  Serial.println("[boot] display_set_buffers ok"); Serial.flush();

  // LVGL v9: criar input device (touch)
  Serial.println("[boot] indev_create"); Serial.flush();
  lv_indev_t *indev = lv_indev_create();
  lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER);
  lv_indev_set_read_cb(indev, touchpad_read);

  Serial.println("[boot] buildUI"); Serial.flush();
  buildUI();
  Serial.println("[boot] buildUI ok"); Serial.flush();

  // App splash — logo + barra de progresso
  Serial.println("[boot] splash"); Serial.flush();
  buildSplash();
  unsigned long splashStart = millis();
  while (splashScreen && millis() - splashStart < 3500) {
    lv_timer_handler();
    delay(5);
  }
  splashFinish();
  // Deixa o fade completar
  unsigned long fadeStart = millis();
  while (splashScreen && millis() - fadeStart < 600) {
    lv_timer_handler();
    delay(5);
  }

  // Sem WiFi salvo: UI sobe em modo offline (ic_wifi_off), usuario toca gear
  // pra abrir config e setar WiFi+token. Botao "Setup via celular" dentro do
  // modal abre o AP portal pra quem preferir esse fluxo.
  if (strlen(WIFI_SSID) > 0) {
    connectWifi();
  } else {
    Serial.println("[boot] sem WiFi salvo — UI offline, toque no gear pra configurar");
    wifiOk = false;
  }

  // Pareamento RFC 8628: WiFi OK mas sem device token? Mostra code e polla
  // o server ate' o user vincular o display via app web. Bloqueia setup ate'
  // parear (ou user cancelar -> reset NVS -> reboot pra AP portal).
  if (wifiOk && strlen(DEVICE_TOKEN) == 0) {
    Serial.println("[boot] sem device token — entrando em modo pareamento");
    runPairingFlow();  // bloqueia ate' paired (ou reboot via cancel)
    Serial.println("[boot] paired OK, retomando fluxo normal");
  }

  if (wifiOk) {
    // Fetch inicial no thread principal — garante dados prontos antes de mostrar UI
    fetchDisplayData();
    lastFetch = millis();
    refreshHomeValues();
    // Dai em diante HTTP roda em background, loop() fica livre pra UI
    startNetTask();
    // OTA disponivel enquanto o device ta online
    startOTA();
  }
  Serial.println("[LVGL] UI pronta");
}

void loop() {
  // Modo AP portal: so' processa requests HTTP + UI (overlay "MODO SETUP")
  if (apPortalActive) {
    if (apServer) apServer->handleClient();
    lv_timer_handler();
    delay(5);
    return;
  }

  // Rede roda em background no netTask. Loop so' aplica os dados na UI.
  if (uiNeedsRefresh) {
    uiNeedsRefresh = false;
    refreshHomeValues();
  }

  // OTA handle: no-op quando nao ha' upload; durante upload bloqueia UI
  // intencionalmente (reboot acontece logo apos, entao eh OK)
  if (wifiOk) ArduinoOTA.handle();

  lv_timer_handler();
  delay(5);
}
