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

// Sleep timeout do display em ms — configuravel via cfg modal. Salvo em NVS
// como "sleepSec" (segundos pra storage humano-legivel). 0 = never sleep.
static uint32_t screenSleepMs = 30000;  // default 30s

static void loadConfigFromNVS() {
  prefs.begin("cultivo", true);
  prefs.getString("ssid",   WIFI_SSID,    sizeof(WIFI_SSID));
  prefs.getString("pass",   WIFI_PASS,    sizeof(WIFI_PASS));
  prefs.getString("server", SERVER_URL,   sizeof(SERVER_URL));
  prefs.getString("token",  DEVICE_TOKEN, sizeof(DEVICE_TOKEN));
  TENT_ID = prefs.getInt("tent", TENT_ID);
  // Sleep timeout em segundos. Default 30s (legacy hardcoded). 0 = nunca dorme.
  int sleepSec = prefs.getInt("sleepSec", 30);
  screenSleepMs = (sleepSec <= 0) ? UINT32_MAX : (uint32_t)sleepSec * 1000UL;
  prefs.end();
  Serial.printf("[cfg] ssid=%s url=%s tent=%d sleep=%ds\n", WIFI_SSID, SERVER_URL, TENT_ID, sleepSec);
}

static void saveSleepTimeoutNVS(int sleepSec) {
  prefs.begin("cultivo", false);
  prefs.putInt("sleepSec", sleepSec);
  prefs.end();
  screenSleepMs = (sleepSec <= 0) ? UINT32_MAX : (uint32_t)sleepSec * 1000UL;
  Serial.printf("[cfg] sleep timeout: %ds\n", sleepSec);
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

// Limpa SOMENTE o token (preserva WiFi + URL). Usado pra forçar entrada em
// modo pareamento sem perder credenciais — chamado pelo botão "Limpar token"
// no config modal e em casos de fluxo de teste.
static void clearTokenOnlyNVS() {
  prefs.begin("cultivo", false);
  prefs.remove("token");
  prefs.remove("tent");
  prefs.end();
  DEVICE_TOKEN[0] = '\0';
  TENT_ID = 1;
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

// Cores do tema vem de cultivo_layout.h (incluido via hal_platform.h).
// Removidas as duplicatas que viviam aqui — geravam warnings de
// "macro redefined" em cada build. Tokens DS sao a fonte unica.

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
// User tocou no icone WiFi do header pedindo reconexao manual. netTaskFn
// processa: forca disconnect + begin sem esperar o retry de 30s.
static volatile bool wifiReconnectPending = false;
// User tocou no botao "Verificar atualizacao" do cfg modal. tapTask processa
// (HTTP + Update.writeStream + reboot — operacao pesada que nao roda na UI).
static volatile bool otaCheckPending = false;

// Tap em scene/device — handler LVGL nao pode chamar HTTPClient direto:
// thread UI tem ~8KB stack, nao cobre TLS handshake + JsonDocument; estourava
// e o ESP RESETAVA no toggle. Em vez disso o handler so' enfileira (idx +
// flag) e netTaskFn no core 0 (8KB stack dedicada) faz o request.
//
// Result flow p/ device toggle: sceneTapPending=true → netTask faz POST →
// escreve deviceToggleRes* + deviceTogglePendingUI=true → loop() consome e
// chama cultivoUI_setDeviceState (LVGL safe).
static volatile bool sceneTapPending      = false;
static int           sceneTapIdx          = -1;
static volatile bool deviceTogglePendingUI = false;
static int           deviceToggleResIdx    = -1;
static bool          deviceToggleResState  = false;

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

// ════════════════════════════════════════════════════════════════════════════════
// Screen sleep — apaga backlight apos N segundos sem touch. Wake on touch:
// primeiro toque acorda + e' descartado (nao dispara botao por acidente).
// Economia de energia + privacidade (display escuro quando ninguem ta usando).
//
// Implementacao via PWM no LCD_BL (LEDC channel 0). Sleep = duty 0, wake =
// duty 200 (~80%, mesmo valor do hal_display_init). Backlight off NAO desliga
// LVGL/touch — chip continua respondendo, so' o painel nao emite luz.
// ════════════════════════════════════════════════════════════════════════════════
// Sleep timeout dinamico — vem de NVS (loadConfigFromNVS sets screenSleepMs).
// Default 30s, configuravel no cfg modal. UINT32_MAX = nunca dorme.
static bool screenAsleep = false;
static lv_timer_t *sleepTimer = nullptr;

static void screenWake() {
  if (!screenAsleep) return;
  ledcWrite(0, 200);             // brilho cheio (~80%)
  cultivoUI_hideIdleOverlay();   // remove screensaver
  screenAsleep = false;
  Serial.println("[backlight] wake");
}

static void screenSleep() {
  if (screenAsleep) return;
  // Ambient mode: brilho reduzido (5% = duty ~12/255) + overlay screensaver
  // (clock + TEMP/UMID grandes em preto). Antes: backlight 100% off.
  // Beneficios: continua util a noite, reduz burn-in IPS, alguma informacao
  // sempre visivel sem precisar tocar.
  ledcWrite(0, 12);
  cultivoUI_showIdleOverlay();
  screenAsleep = true;
  Serial.println("[backlight] dim + ambient overlay");
}

static void sleepTimerCb(lv_timer_t *) {
  uint32_t inactive = lv_display_get_inactive_time(NULL);
  if (!screenAsleep && inactive >= screenSleepMs) {
    screenSleep();
  } else if (screenAsleep) {
    // Tick do overlay a cada 1s — atualiza relogio + temp/umid no screensaver
    cultivoUI_tickIdleOverlay();
  }
}

static void touchpad_read(lv_indev_t *indev, lv_indev_data_t *data) {
  int rx, ry, mx, my;
  if (!ftRead(rx, ry)) { data->state = LV_INDEV_STATE_RELEASED; return; }

  // Wake on touch: tela apagada + dedo no display -> acende e descarta o
  // touch. User precisa tocar DE NOVO pra interagir. Evita ativar algo
  // por acidente so' por ter olhado pro display.
  if (screenAsleep) {
    screenWake();
    data->state = LV_INDEV_STATE_RELEASED;
    return;
  }

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

  // Logo container DS — circular com glow primary suave (era 28px width
  // shadow + opa 40, ficava intenso. Reduzido pra 16+30 — mais "premium").
  lv_obj_t *logoCont = lv_obj_create(splashScreen);
  lv_obj_set_size(logoCont, sw(64), sw(64));
  lv_obj_align(logoCont, LV_ALIGN_CENTER, 0, -sh(48));
  lv_obj_set_style_radius(logoCont, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_color(logoCont, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_bg_opa(logoCont, LV_OPA_20, 0);
  lv_obj_set_style_border_color(logoCont, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_border_width(logoCont, 1, 0);  // era 2 — mais clean
  lv_obj_set_style_border_opa(logoCont, LV_OPA_60, 0);
  lv_obj_set_style_shadow_color(logoCont, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_shadow_width(logoCont, 16, 0);  // era 28
  lv_obj_set_style_shadow_opa(logoCont, LV_OPA_30, 0);  // era 40
  lv_obj_set_style_pad_all(logoCont, 0, 0);
  lv_obj_clear_flag(logoCont, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t *logo = lv_img_create(logoCont);
  lv_img_set_src(logo, &ic_sprout);
  lv_obj_center(logo);

  // Nome do app — Geist bold 40 (FONT_VALUE)
  lv_obj_t *lblName = lv_label_create(splashScreen);
  lv_label_set_text(lblName, "cultivo");
  lv_obj_set_style_text_font(lblName, FONT_VALUE, 0);
  lv_obj_set_style_text_color(lblName, lv_color_hex(COL_TEXT), 0);
  lv_obj_align(lblName, LV_ALIGN_CENTER, 0, sh(12));

  // Subtítulo — Geist semibold 18 dim
  lv_obj_t *lblSub = lv_label_create(splashScreen);
  lv_label_set_text(lblSub, "Monitor de Estufa");
  lv_obj_set_style_text_font(lblSub, FONT_BODY, 0);
  lv_obj_set_style_text_color(lblSub, lv_color_hex(COL_DIM), 0);
  lv_obj_align(lblSub, LV_ALIGN_CENTER, 0, sh(40));

  // Barra de progresso DS — radius pill (RADIUS_SM/2 = 4 ja' quase pill p/ 4px)
  splashBar = lv_bar_create(splashScreen);
  lv_obj_set_size(splashBar, SCREEN_W - sw(48), sh(4));
  lv_obj_align(splashBar, LV_ALIGN_BOTTOM_MID, 0, -sh(28));
  lv_obj_set_style_bg_color(splashBar, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_bg_opa(splashBar, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(splashBar, RADIUS_SM, 0);
  lv_obj_set_style_bg_color(splashBar, lv_color_hex(COL_PRIMARY), LV_PART_INDICATOR);
  lv_obj_set_style_radius(splashBar, RADIUS_SM, LV_PART_INDICATOR);
  lv_bar_set_range(splashBar, 0, 100);
  lv_bar_set_value(splashBar, 0, LV_ANIM_OFF);

  // Mensagem de status
  splashMsg = lv_label_create(splashScreen);
  lv_label_set_text(splashMsg, SPLASH_MSGS[0]);
  lv_obj_set_style_text_font(splashMsg, FONT_CAPTION, 0);
  lv_obj_set_style_text_color(splashMsg, lv_color_hex(COL_DIM), 0);
  lv_obj_align(splashMsg, LV_ALIGN_BOTTOM_MID, 0, -sh(10));

  // Versão no canto inferior direito — quase invisivel (border color)
  lv_obj_t *lblVer = lv_label_create(splashScreen);
  lv_label_set_text(lblVer, "v" FW_VERSION);
  lv_obj_set_style_text_font(lblVer, FONT_CAPTION, 0);
  lv_obj_set_style_text_color(lblVer, lv_color_hex(COL_BORDER), 0);
  lv_obj_align(lblVer, LV_ALIGN_BOTTOM_RIGHT, -sw(8), -sh(6));

  // Fade in com motion token
  lv_obj_set_style_opa(splashScreen, LV_OPA_0, 0);
  lv_anim_t fadeIn;
  lv_anim_init(&fadeIn);
  lv_anim_set_var(&fadeIn, splashScreen);
  lv_anim_set_values(&fadeIn, LV_OPA_0, LV_OPA_COVER);
  lv_anim_set_time(&fadeIn, MOTION_MED);
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
  lv_anim_set_time(&a, MOTION_SLOW);
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
// Modal config: token+tentId removidos (vem via pareamento RFC 8628 agora).
// Apenas WiFi + URL — usuario nao toca em token/tent manualmente mais.
static lv_obj_t *taSsid, *taPass, *taUrl;
static lv_obj_t *ddSleep;  // dropdown sleep timeout no cfg modal
static lv_obj_t *kbCfg;
// Opcoes de sleep timeout (label visivel + valor em segundos).
// 0 = nunca dorme (display sempre on com ambient idle apos timeout grande).
static const struct { const char *label; int sec; } SLEEP_OPTS[] = {
  {"15s",    15},
  {"30s",    30},
  {"1 min",  60},
  {"2 min", 120},
  {"5 min", 300},
  {"Nunca",   0},
};
static constexpr int SLEEP_OPTS_N = sizeof(SLEEP_OPTS) / sizeof(SLEEP_OPTS[0]);
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
  if (strlen(ssid) == 0) { Serial.println("[cfg] ssid vazio, abortando"); return; }
  // Token + tent vem do pareamento RFC 8628 — nao sao mais editaveis aqui.
  // Mantem o que ja' tinha em NVS (DEVICE_TOKEN/TENT_ID em RAM); se vazios
  // o setup() vai entrar em modo pareamento apos conectar WiFi.
  saveConfigToNVS(ssid, pass, url, DEVICE_TOKEN, TENT_ID);
  // Salva sleep timeout selecionado no dropdown
  if (ddSleep) {
    uint16_t selIdx = lv_dropdown_get_selected(ddSleep);
    if (selIdx < SLEEP_OPTS_N) {
      saveSleepTimeoutNVS(SLEEP_OPTS[selIdx].sec);
    }
  }
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
  // BG = COL_BG token DS (era 0x060A10 arbitrario)
  lv_obj_set_style_bg_color(configModal, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(configModal, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(configModal, 0, 0);
  lv_obj_set_style_radius(configModal, 0, 0);
  lv_obj_set_style_pad_all(configModal, sw(6), 0);
  lv_obj_clear_flag(configModal, LV_OBJ_FLAG_SCROLLABLE);

  makeLabel(configModal, "CONFIGURACAO", COL_PRIMARY, FONT_TITLE, LV_ALIGN_TOP_MID, 0, sh(2));
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
    lv_obj_set_style_radius(ta, RADIUS_MD, 0);
    lv_obj_set_style_pad_left(ta, sw(6), 0);
    lv_obj_add_event_cb(ta, cfgFocusCb, LV_EVENT_CLICKED, NULL);
    *out = ta;
  };

  // Helper local — botao secundario (border+texto, sem bg) DS style.
  auto secondaryBtn = [&](lv_obj_t *parent, const char *label,
                          lv_event_cb_t cb) -> lv_obj_t* {
    lv_obj_t *btn = lv_btn_create(parent);
    lv_obj_set_width(btn, lv_pct(100));
    lv_obj_set_height(btn, sh(34));
    lv_obj_set_style_bg_opa(btn, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_color(btn, lv_color_hex(COL_BORDER), 0);
    lv_obj_set_style_border_width(btn, 1, 0);
    lv_obj_set_style_radius(btn, RADIUS_LG, 0);
    lv_obj_set_style_shadow_width(btn, 0, 0);
    lv_obj_add_event_cb(btn, cb, LV_EVENT_CLICKED, NULL);
    return btn;
  };

  // Botao "Setup via celular" — secundario DS, sem cor especial (era azul/ciano)
  lv_obj_t *btnAp = secondaryBtn(list, nullptr, [](lv_event_t *e) {
    Serial.println("[cfg] abrindo AP portal a pedido do usuario");
    if (configModal) { lv_obj_del(configModal); configModal = nullptr; }
    startApPortal();
  });
  makeLabel(btnAp, "Setup via celular (AP)", COL_TEXT, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  addField("WiFi SSID",      WIFI_SSID,    &taSsid);

  // Botao SCAN — secundario DS
  lv_obj_t *btnScan = secondaryBtn(list, nullptr, scanStartCb);
  makeLabel(btnScan, "Buscar redes WiFi", COL_TEXT, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  addField("WiFi Senha",     WIFI_PASS,    &taPass,  true);
  addField("Server URL",     SERVER_URL,   &taUrl);
  // Device Token + Tent ID removidos — vem automaticamente via pareamento
  // RFC 8628 quando ESP boot sem token salvo.

  // "Limpar token (re-parear)" — secundario DS, sem cor de destaque (era PRP)
  lv_obj_t *btnReparear = secondaryBtn(list, nullptr, [](lv_event_t *e) {
    Serial.println("[cfg] limpar token -> reboot p/ pareamento");
    clearTokenOnlyNVS();
    delay(300);
    ESP.restart();
  });
  makeLabel(btnReparear, "Limpar token (re-parear)", COL_TEXT, FONT_BODY,
            LV_ALIGN_CENTER, 0, 0);

  // ═══════════════════════════════════════════════════════════════════
  // SECAO: DISPLAY — sleep timeout configuravel
  // ═══════════════════════════════════════════════════════════════════
  makeLabel(list, "DISPLAY", COL_PRIMARY, FONT_CAPTION, LV_ALIGN_TOP_LEFT, 0, sh(6));
  makeLabel(list, "Apagar tela apos:", COL_DIM, FONT_CAPTION, LV_ALIGN_TOP_LEFT, 0, 0);
  ddSleep = lv_dropdown_create(list);
  // Monta string "15s\n30s\n1 min\n..." pro dropdown
  {
    char optsBuf[128] = {0};
    for (int i = 0; i < SLEEP_OPTS_N; i++) {
      strcat(optsBuf, SLEEP_OPTS[i].label);
      if (i < SLEEP_OPTS_N - 1) strcat(optsBuf, "\n");
    }
    lv_dropdown_set_options(ddSleep, optsBuf);
    // Pre-seleciona o valor salvo em NVS (compara via screenSleepMs)
    int curSec = (screenSleepMs == UINT32_MAX) ? 0 : (int)(screenSleepMs / 1000);
    int matchIdx = 1;  // default fallback "30s"
    for (int i = 0; i < SLEEP_OPTS_N; i++) {
      if (SLEEP_OPTS[i].sec == curSec) { matchIdx = i; break; }
    }
    lv_dropdown_set_selected(ddSleep, matchIdx);
  }
  lv_obj_set_width(ddSleep, lv_pct(100));
  lv_obj_set_height(ddSleep, sh(34));
  lv_obj_set_style_text_font(ddSleep, FONT_BODY, 0);
  lv_obj_set_style_bg_color(ddSleep, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_border_color(ddSleep, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_border_width(ddSleep, 1, 0);
  lv_obj_set_style_radius(ddSleep, RADIUS_MD, 0);

  // ═══════════════════════════════════════════════════════════════════
  // SECAO: ATUALIZACOES — check via GitHub releases
  // ═══════════════════════════════════════════════════════════════════
  makeLabel(list, "ATUALIZACOES", COL_PRIMARY, FONT_CAPTION, LV_ALIGN_TOP_LEFT, 0, sh(6));
  lv_obj_t *btnOta = secondaryBtn(list, nullptr, [](lv_event_t *e) {
    Serial.println("[cfg] OTA check requested");
    otaCheckPending = true;
    // Toast informativo — feedback final via log serial (futuro: UI overlay)
    // Mostrar via cultivoUI_showToast nao funciona daqui (statics de outro
    // module). User precisa ver via serial OU aguardar reboot apos sucesso.
  });
  makeLabel(btnOta, "Verificar atualizacao firmware", COL_TEXT, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  // ═══════════════════════════════════════════════════════════════════
  // SECAO: SISTEMA — info read-only (versao, MAC, uptime, heap)
  // ═══════════════════════════════════════════════════════════════════
  makeLabel(list, "SISTEMA", COL_PRIMARY, FONT_CAPTION, LV_ALIGN_TOP_LEFT, 0, sh(6));
  {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    uint32_t uptimeSec = millis() / 1000;
    uint32_t freeHeap  = ESP.getFreeHeap() / 1024;
    uint32_t freePsram = ESP.getFreePsram() / 1024;
    char infoBuf[160];
    snprintf(infoBuf, sizeof(infoBuf),
             "Versao: " FW_VERSION "\n"
             "MAC: %02X:%02X:%02X:%02X:%02X:%02X\n"
             "Uptime: %luh %lum\n"
             "Heap: %luKB / PSRAM: %luKB",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5],
             uptimeSec / 3600, (uptimeSec / 60) % 60,
             (unsigned long)freeHeap, (unsigned long)freePsram);
    lv_obj_t *lblInfo = lv_label_create(list);
    lv_label_set_text(lblInfo, infoBuf);
    lv_obj_set_style_text_color(lblInfo, lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_text_font(lblInfo, FONT_CAPTION, 0);
    lv_obj_set_style_text_line_space(lblInfo, sh(2), 0);
  }

  // Footer buttons DS — Cancel (ghost), Reset (destrutivo), Salvar (primary)
  lv_obj_t *btnCancel = lv_btn_create(configModal);
  lv_obj_set_size(btnCancel, sw(96), sh(36));
  lv_obj_align(btnCancel, LV_ALIGN_BOTTOM_LEFT, sw(6), -sh(6));
  lv_obj_set_style_bg_opa(btnCancel, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_color(btnCancel, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_border_width(btnCancel, 1, 0);
  lv_obj_set_style_radius(btnCancel, RADIUS_LG, 0);
  lv_obj_set_style_shadow_width(btnCancel, 0, 0);
  lv_obj_add_event_cb(btnCancel, cfgCancelCb, LV_EVENT_CLICKED, NULL);
  makeLabel(btnCancel, "Cancelar", COL_TEXT, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  lv_obj_t *btnReset = lv_btn_create(configModal);
  lv_obj_set_size(btnReset, sw(78), sh(36));
  lv_obj_align(btnReset, LV_ALIGN_BOTTOM_MID, 0, -sh(6));
  lv_obj_set_style_bg_opa(btnReset, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_color(btnReset, lv_color_hex(COL_RED), 0);
  lv_obj_set_style_border_width(btnReset, 1, 0);
  lv_obj_set_style_radius(btnReset, RADIUS_LG, 0);
  lv_obj_set_style_shadow_width(btnReset, 0, 0);
  lv_obj_add_event_cb(btnReset, [](lv_event_t *e) {
    Serial.println("[cfg] reset WiFi -> AP portal");
    clearConfigNVS();
    delay(300);
    ESP.restart();
  }, LV_EVENT_CLICKED, NULL);
  makeLabel(btnReset, "Reset", COL_RED, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  // CTA principal Salvar — primary cheio (sem bloom — DS clean)
  lv_obj_t *btnSave = lv_btn_create(configModal);
  lv_obj_set_size(btnSave, sw(110), sh(36));
  lv_obj_align(btnSave, LV_ALIGN_BOTTOM_RIGHT, -sw(6), -sh(6));
  lv_obj_set_style_bg_color(btnSave, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_bg_opa(btnSave, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(btnSave, 0, 0);
  lv_obj_set_style_radius(btnSave, RADIUS_LG, 0);
  lv_obj_set_style_shadow_width(btnSave, 0, 0);
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
  // BG = COL_BG (era 0x060A10 arbitrario, agora token DS)
  lv_obj_set_style_bg_color(apScreen, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(apScreen, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(apScreen, 0, 0);
  lv_obj_set_style_radius(apScreen, 0, 0);
  lv_obj_set_style_pad_all(apScreen, 0, 0);
  lv_obj_clear_flag(apScreen, LV_OBJ_FLAG_SCROLLABLE);
  // nao interceptar cliques no proprio overlay — so os filhos (botao) clicaveis
  lv_obj_clear_flag(apScreen, LV_OBJ_FLAG_CLICKABLE);

  // Header — "MODO SETUP" agora em primary (era amber/warning, mas e' estado
  // de espera nao alerta — primary alinha melhor com brand)
  makeLabel(apScreen, "MODO SETUP", COL_PRIMARY, FONT_TITLE, LV_ALIGN_TOP_MID, 0, sh(14));
  makeLabel(apScreen, "Conecte seu celular na rede:", COL_DIM, FONT_CAPTION,
            LV_ALIGN_TOP_MID, 0, sh(40));

  // SSID — branco bold (info principal); sem bloom (DS clean)
  lv_obj_t *lblSsid = lv_label_create(apScreen);
  lv_label_set_text(lblSsid, ssid);
  lv_obj_set_style_text_font(lblSsid, FONT_BODY, 0);
  lv_obj_set_style_text_color(lblSsid, lv_color_hex(COL_TEXT), 0);
  lv_obj_align(lblSsid, LV_ALIGN_TOP_MID, 0, sh(54));

  makeLabel(apScreen, "Senha:", COL_DIM, FONT_CAPTION,
            LV_ALIGN_TOP_MID, 0, sh(76));
  // Senha: branco bold (mesma hierarquia do SSID)
  lv_obj_t *lblPass = lv_label_create(apScreen);
  lv_label_set_text(lblPass, pass);
  lv_obj_set_style_text_font(lblPass, FONT_BODY, 0);
  lv_obj_set_style_text_color(lblPass, lv_color_hex(COL_TEXT), 0);
  lv_obj_align(lblPass, LV_ALIGN_TOP_MID, 0, sh(90));

  makeLabel(apScreen, "Abra no navegador:", COL_DIM, FONT_CAPTION,
            LV_ALIGN_TOP_MID, 0, sh(110));

  // URL — primary (link feel, era CYN)
  lv_obj_t *lblIp = lv_label_create(apScreen);
  char buf[32];
  snprintf(buf, sizeof(buf), "http://%s", ip);
  lv_label_set_text(lblIp, buf);
  lv_obj_set_style_text_font(lblIp, FONT_BODY, 0);
  lv_obj_set_style_text_color(lblIp, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_align(lblIp, LV_ALIGN_TOP_MID, 0, sh(120));

  // Botao fallback DS — bg primary cheio + texto branco (CTA principal),
  // border sem (radius LG arredondado). Sem bloom.
  lv_obj_t *btnManual = lv_btn_create(apScreen);
  lv_obj_set_size(btnManual, sw(200), sh(36));
  lv_obj_align(btnManual, LV_ALIGN_BOTTOM_MID, 0, -sh(38));
  lv_obj_set_style_bg_color(btnManual, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_bg_opa(btnManual, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(btnManual, 0, 0);
  lv_obj_set_style_radius(btnManual, RADIUS_LG, 0);
  lv_obj_set_style_shadow_width(btnManual, 0, 0);
  lv_obj_set_ext_click_area(btnManual, sw(12));
  lv_obj_add_event_cb(btnManual, [](lv_event_t *e) {
    Serial.println("[ap] abrindo modal manual de config");
    openConfigModal();
    if (configModal) lv_obj_move_foreground(configModal);
  }, LV_EVENT_CLICKED, NULL);
  makeLabel(btnManual, "Configurar no display", COL_TEXT, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

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
  // NTP — configura horario BRT (UTC-3, sem DST). Necessario pro ambient
  // clock idle (screensaver). configTime e' nao-bloqueante; pode levar
  // alguns segundos pro time ser sincronizado em background.
  if (wifiOk) {
    configTime(-3 * 3600, 0, "pool.ntp.org", "br.pool.ntp.org", "time.google.com");
    Serial.println("[ntp] BRT3 configurado");
  }
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
  // Idades dos sensores — usados pelo UI pra badge de freshness (verde/yellow/red).
  // Server retorna sec; -1 ou null aqui significa "sem dado" (sensor offline ou
  // sem mapping). UI trata.
  sensorAgeSec   = doc["sensorAgeSec"].isNull()   ? -1 : doc["sensorAgeSec"].as<int>();
  dailyLogAgeSec = doc["dailyLogAgeSec"].isNull() ? -1 : doc["dailyLogAgeSec"].as<int>();
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
// Task dedicada pra taps (scenes/devices) — sem ela, tap esperava ate'
// 8s+ se netTask tava no meio de fetchDisplay/fetchScenes (fetches sao
// bloqueantes). Agora tap roda em paralelo, latencia ~50ms + tempo
// do POST HTTPS (~500ms-2s).
static TaskHandle_t tapTaskHandle = NULL;

// Logger de tempo decorrido — acima do threshold, loga WARN.
// Substitui WDT customizado: WDT so ajuda se setuparmos timeout > Tuya timeout
// (8s), mas reboot em falso positivo seria pior UX que um log no serial.
// HTTPClient.setTimeout() ja garante que nenhuma chamada trave alem do limite.
static inline void logIfSlow(const char *label, uint32_t t0, uint32_t thresholdMs) {
  uint32_t dt = millis() - t0;
  if (dt > thresholdMs) Serial.printf("[net] WARN %s lento: %ums\n", label, dt);
}

// Histórico — preenche os 4 buffers em cultivo_ui (histTemp/Rh/Ph/Ec, max 24
// pontos cada) a partir de /api/device/history-all. Server retorna ate' 60
// pontos ASC por tempo; usamos os ultimos 24 (mais recentes -> direita do chart).
static volatile bool histNeedsRefresh = false;
static unsigned long lastHistFetch = 0;
static const unsigned long HIST_FETCH_INTERVAL = 5UL * 60UL * 1000UL;  // 5 min

static bool fetchHistoryAll(const char *period = "24h") {
  if (!wifiOk) return false;
  HTTPClient http;
  char url[160];
  snprintf(url, sizeof(url), "%s/api/device/history-all/%d?period=%s",
           SERVER_URL, TENT_ID, period);
  httpBegin(http, url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(8000);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[net] history-all HTTP %d\n", code);
    http.end();
    return false;
  }
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getStream());
  http.end();
  if (err != DeserializationError::Ok) return false;

  // Helper: copia ate' 24 ULTIMOS pontos do array doc[key] pro buffer destino.
  // Retorna a quantidade copiada.
  auto copyTail = [&](const char *key, float *dst) -> int {
    JsonArray arr = doc[key].as<JsonArray>();
    int total = arr.size();
    if (total <= 0) return 0;
    int take = total > HIST_POINTS ? HIST_POINTS : total;
    int skip = total - take;
    int i = 0;
    int j = 0;
    for (JsonVariant v : arr) {
      if (j >= skip) dst[i++] = v.as<float>();
      j++;
    }
    return take;
  };

  int n = copyTail("temp", histTemp);
  copyTail("rh", histRh);
  copyTail("ph", histPh);
  copyTail("ec", histEc);
  histCount = n;  // todos os 4 buffers tem mesmo count (server le mesmas rows)
  Serial.printf("[net] history-all: %d pontos carregados\n", n);
  histNeedsRefresh = true;
  return true;
}

// ════════════════════════════════════════════════════════════════════════════════
// Items Tuya (cenas + dispositivos) — fetch dinamico do server
// (sprint 1 do vinculo cena-estufa). Endpoint /api/device/scenes retorna:
//   - Formato novo {items:[{type, id, name, state?, iconHint?}, ...]} quando
//     a estufa tem vinculos via tabela tentScenes/tentDevices
//   - Formato legacy {scenes:[{id, name}, ...]} quando nao tem vinculos
//     (firmware antigo continua funcionando — fallback transparente)
//
// Storage local pareia 1:1 com items[] em cultivo_ui.cpp. App resolve idx
// -> tipo via itemTypeLocal[] e dispara endpoint correto:
//   - scene  -> POST /api/device/scene-by-id/<id>/trigger
//   - device -> POST /api/device/device-toggle
//
// Threading: fetchScenes roda no netTask (core 0), apenas escreve buffers
// e seta scenesNeedsRefresh=true. loop() (core 1) detecta a flag, chama
// cultivoUI_applyItems que rebuilda o grid LVGL (LVGL nao e thread-safe).
// ════════════════════════════════════════════════════════════════════════════════
#define SCENES_LOCAL_MAX 6
static char    sceneIdsLocal     [SCENES_LOCAL_MAX][48] = {{0}};
static char    sceneNamesLocal   [SCENES_LOCAL_MAX][24] = {{0}};
static char    sceneIconHintLocal[SCENES_LOCAL_MAX][16] = {{0}};  // 16 cabe "dehumidifier"
// 0=scene (trigger one-shot) | 1=device (toggle ON/OFF, state da Tuya) |
// 2=automation (toggle ON/OFF, state local — Tuya nao expoe enabled status
// pelo /devices/.../status, entao gerenciamos o ultimo desejado)
static uint8_t  sceneTypeLocal        [SCENES_LOCAL_MAX] = {0};
static bool     sceneStateLocal       [SCENES_LOCAL_MAX] = {false};
static uint16_t sceneExecutionSecLocal[SCENES_LOCAL_MAX] = {0};  // duracao p/ scenes (0=default 5s)
static int      sceneCountLocal = 0;

static volatile bool scenesNeedsRefresh = false;
static unsigned long lastScenesFetch = 0;
// Cenas raramente mudam, mas STATE de devices pode mudar a qualquer momento
// (user liga luz pelo SmartLife). Pollar 30s pra captar mudancas externas
// num tempo razoavel sem stress no Tuya rate limit (~ 2req/min e' OK).
static const unsigned long SCENES_FETCH_INTERVAL = 30UL * 1000UL;

static inline void copyToBuf(char *dst, size_t cap, const char *src) {
  if (!src) { dst[0] = '\0'; return; }
  strncpy(dst, src, cap - 1);
  dst[cap - 1] = '\0';
}

// Parsea entrada do JSON (item OR scene legacy) pro slot n. Retorna true se
// preencheu (id valido), false se descartou.
static bool parseItemSlot(JsonObject obj, int n, bool isLegacyFormat) {
  const char *id   = obj["id"]   | "";
  const char *name = obj["name"] | "Item";
  if (!id || !*id) return false;
  copyToBuf(sceneIdsLocal[n],   sizeof(sceneIdsLocal[n]),   id);
  copyToBuf(sceneNamesLocal[n], sizeof(sceneNamesLocal[n]), name);
  if (isLegacyFormat) {
    // Legacy {scenes:[...]} sempre type=scene, sem iconHint, sem state
    sceneTypeLocal[n]         = 0;
    sceneStateLocal[n]        = false;
    sceneIconHintLocal[n][0]  = '\0';
    sceneExecutionSecLocal[n] = 0;  // = default 5s no UI side
  } else {
    // Novo {items:[...]}: type "scene"|"device"|"automation"
    const char *typeStr = obj["type"] | "scene";
    if      (!strcmp(typeStr, "device"))     sceneTypeLocal[n] = 1;
    else if (!strcmp(typeStr, "automation")) sceneTypeLocal[n] = 2;
    else                                      sceneTypeLocal[n] = 0;

    // State handling (mesma logica de antes — ver comentario abaixo)
    JsonVariant stateVar = obj["state"];
    if (!stateVar.isNull()) {
      sceneStateLocal[n] = stateVar.as<bool>();
    }

    copyToBuf(sceneIconHintLocal[n], sizeof(sceneIconHintLocal[n]),
              obj["iconHint"] | "");

    // executionSec — duracao da cena em segundos (so' faz sentido pra
    // type=scene; devices/automations recebem 0 = irrelevante). Default 5s
    // no UI quando ausente ou 0.
    sceneExecutionSecLocal[n] = (uint16_t)(obj["executionSec"] | 0);

    Serial.printf("[net]   [%d] type=%s name=%-15s state=%s iconHint=%s execSec=%u id=%s\n",
                  n, typeStr, sceneNamesLocal[n],
                  sceneStateLocal[n] ? "ON" : "OFF",
                  sceneIconHintLocal[n], sceneExecutionSecLocal[n], sceneIdsLocal[n]);
  }
  return true;
}

// ════════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════════
// PLANTAS — aba 5. fetchPlants GET /api/device/plants/<tentId> retorna lista.
// Tap em uma planta dispara fetchPlantPhoto GET /api/device/plant/<id>/photo
// (binario JPEG + headers X-Health-Status, X-Log-Date). UI mostra modal de
// detalhe com a foto decodada via TJPGD.
// ════════════════════════════════════════════════════════════════════════════════
#define PLANTS_LOCAL_MAX 10
struct PlantSlot {
  int     id;
  char    name[64];
  char    code[32];
  uint8_t stage;          // 0=CLONE, 1=SEEDLING, 2=PLANT
  uint8_t healthStatus;   // 0..4
  bool    hasPhoto;
  char    lastPhotoDate[32];
  // Strain info — preenchido pelo /plants. Vazio = strain deletada/missing.
  char    strainName[48];
  uint8_t strainVegaWeeks;     // 0 = sem dado
  uint8_t strainFloraWeeks;
  char    strainOrigin[16];    // "FEMINIZED" / "AUTOFLOWER" / "CLONE"
};
static PlantSlot plantsLocal[PLANTS_LOCAL_MAX];
static int       plantCountLocal = 0;
static volatile bool plantsNeedsRefresh = false;
static unsigned long lastPlantsFetch = 0;
// 10min — lista de plantas muda pouco (user adiciona/remove no app raro)
static const unsigned long PLANTS_FETCH_INTERVAL = 10UL * 60UL * 1000UL;

// Buffer pra foto. Agora recebemos RGB565 raw do server (fmt=rgb565):
// 320x240x2 = 153600 bytes. Buffer 160KB cobre + margem.
#define PLANT_JPEG_MAX_BYTES (160 * 1024)
static uint8_t *plantPhotoBuf       = nullptr;
static size_t   plantPhotoLen       = 0;
static uint8_t  plantPhotoHealth    = 0;
static char     plantPhotoDate[24]  = {0};
static int      plantPhotoPlantId   = 0;
static volatile bool plantPhotoNeedsApply = false;
// Request pendente (tap → tapTask processa)
static volatile bool plantPhotoTapPending = false;
static int           plantPhotoTapId      = 0;

static uint8_t parseHealthStatus(const char *s) {
  if (!s) return 0;
  if (!strcmp(s, "HEALTHY"))    return 1;
  if (!strcmp(s, "STRESSED"))   return 2;
  if (!strcmp(s, "SICK"))       return 3;
  if (!strcmp(s, "RECOVERING")) return 4;
  return 0;
}
static uint8_t parseStage(const char *s) {
  if (!s) return 0;
  if (!strcmp(s, "CLONE"))    return 0;
  if (!strcmp(s, "SEEDLING")) return 1;
  if (!strcmp(s, "PLANT"))    return 2;
  return 0;
}

static bool fetchPlants() {
  if (!wifiOk) return false;
  HTTPClient http;
  char url[128];
  snprintf(url, sizeof(url), "%s/api/device/plants/%d", SERVER_URL, TENT_ID);
  httpBegin(http, url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(8000);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[net] plants HTTP %d\n", code);
    http.end();
    return false;
  }
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getStream());
  http.end();
  if (err != DeserializationError::Ok) {
    Serial.printf("[net] plants JSON err: %s\n", err.c_str());
    return false;
  }
  JsonArray arr = doc["plants"].as<JsonArray>();
  int n = 0;
  for (JsonObject p : arr) {
    if (n >= PLANTS_LOCAL_MAX) break;
    int id = p["id"] | 0;
    if (id <= 0) continue;
    plantsLocal[n].id = id;
    const char *name = p["name"] | "";
    strncpy(plantsLocal[n].name, name, sizeof(plantsLocal[n].name) - 1);
    plantsLocal[n].name[sizeof(plantsLocal[n].name) - 1] = '\0';
    const char *codev = p["code"] | "";
    strncpy(plantsLocal[n].code, codev, sizeof(plantsLocal[n].code) - 1);
    plantsLocal[n].code[sizeof(plantsLocal[n].code) - 1] = '\0';
    plantsLocal[n].stage = parseStage(p["stage"] | "");
    plantsLocal[n].healthStatus = parseHealthStatus(p["healthStatus"] | "");
    plantsLocal[n].hasPhoto = p["hasPhoto"] | false;
    const char *lpd = p["lastPhotoDate"] | "";
    strncpy(plantsLocal[n].lastPhotoDate, lpd,
            sizeof(plantsLocal[n].lastPhotoDate) - 1);
    plantsLocal[n].lastPhotoDate[sizeof(plantsLocal[n].lastPhotoDate) - 1] = '\0';
    // Strain (objeto aninhado — pode ser null se strain deletada).
    JsonObject st = p["strain"];
    if (!st.isNull()) {
      const char *sname = st["name"] | "";
      strncpy(plantsLocal[n].strainName, sname, sizeof(plantsLocal[n].strainName) - 1);
      plantsLocal[n].strainName[sizeof(plantsLocal[n].strainName) - 1] = '\0';
      plantsLocal[n].strainVegaWeeks  = (uint8_t)(st["vegaWeeks"]  | 0);
      plantsLocal[n].strainFloraWeeks = (uint8_t)(st["floraWeeks"] | 0);
      const char *sorigin = st["origin"] | "";
      strncpy(plantsLocal[n].strainOrigin, sorigin, sizeof(plantsLocal[n].strainOrigin) - 1);
      plantsLocal[n].strainOrigin[sizeof(plantsLocal[n].strainOrigin) - 1] = '\0';
    } else {
      plantsLocal[n].strainName[0] = '\0';
      plantsLocal[n].strainVegaWeeks = 0;
      plantsLocal[n].strainFloraWeeks = 0;
      plantsLocal[n].strainOrigin[0] = '\0';
    }
    n++;
  }
  plantCountLocal = n;
  Serial.printf("[net] plants: %d carregadas\n", plantCountLocal);
  plantsNeedsRefresh = true;
  return true;
}

// Formata "2026-05-08T12:30:00Z" -> "08/05 12:30" (curto pra display)
static void formatPhotoDate(const char *iso, char *out, size_t outLen) {
  if (!iso || !*iso || outLen < 12) { if (out && outLen > 0) out[0] = '\0'; return; }
  // Espera YYYY-MM-DDTHH:MM:...
  int y, mo, d, h, mi;
  if (sscanf(iso, "%d-%d-%dT%d:%d", &y, &mo, &d, &h, &mi) == 5) {
    snprintf(out, outLen, "%02d/%02d %02d:%02d", d, mo, h, mi);
  } else {
    strncpy(out, iso, outLen - 1);
    out[outLen - 1] = '\0';
  }
}

// Le JPEG binario do stream HTTP em chunks pro buffer PSRAM. Cap em
// PLANT_JPEG_MAX_BYTES — passou disso, descarta. Retorna bytes lidos
// (0 se erro). Tambem parseia headers X-Health-Status e X-Log-Date.
static size_t fetchPlantPhoto(int plantId, int photoId,
                              uint8_t *outHealth,
                              char *outDateStr, size_t outDateLen) {
  if (!wifiOk) return 0;
  HTTPClient http;
  char url[224];
  // fmt=rgb565: server pre-decoda e envia 320x240x2=153600 bytes raw.
  // photoId=0 = ultima foto (default), >0 = foto especifica (timeline).
  if (photoId > 0) {
    snprintf(url, sizeof(url),
             "%s/api/device/plant/%d/photo?w=320&h=240&fmt=rgb565&photoId=%d",
             SERVER_URL, plantId, photoId);
  } else {
    snprintf(url, sizeof(url),
             "%s/api/device/plant/%d/photo?w=320&h=240&fmt=rgb565",
             SERVER_URL, plantId);
  }
  httpBegin(http, url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  // Solicita headers extras p/ parsing (HTTPClient ESP32 precisa)
  const char *collectHdrs[] = {"X-Health-Status", "X-Log-Date", "X-Pixel-Format", "X-Pixel-Width", "X-Pixel-Height"};
  http.collectHeaders(collectHdrs, 5);
  http.setTimeout(15000);  // foto pode demorar
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[net] plant/%d/photo HTTP %d\n", plantId, code);
    http.end();
    return 0;
  }
  // Parse headers
  if (outHealth) {
    String hs = http.header("X-Health-Status");
    *outHealth = parseHealthStatus(hs.c_str());
  }
  if (outDateStr && outDateLen) {
    String ld = http.header("X-Log-Date");
    formatPhotoDate(ld.c_str(), outDateStr, outDateLen);
  }

  // Aloca buffer (uma vez, reusa)
  if (!plantPhotoBuf) {
    plantPhotoBuf = (uint8_t*)heap_caps_malloc(PLANT_JPEG_MAX_BYTES,
                                                MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!plantPhotoBuf) {
      Serial.println("[net] plant photo PSRAM malloc fail");
      http.end();
      return 0;
    }
  }

  // CHUNKED-AWARE READ: Cloudflare adiciona Transfer-Encoding: chunked
  // mesmo com Content-Length explicito do origin. Stream raw via
  // getStreamPtr() inclui chunk size markers ("<hex>\r\n") entre os
  // pixels — corrompe a imagem (renderiza primeira metade OK, segunda
  // metade fica garbage).
  //
  // Solucao: parser de chunked encoding manual quando Transfer-Encoding:
  // chunked esta presente, senao fallback pra leitura direta. http
  // HTTPClient nao expõe writeToStream em todas versoes do framework.
  WiFiClient *stream = http.getStreamPtr();
  size_t total = 0;
  int contentLen = http.getSize();
  bool isChunked = (contentLen <= 0);  // Sem CL = provavelmente chunked
  Serial.printf("[net] plant photo CL=%d (%s)\n", contentLen,
                isChunked ? "chunked" : "identity");

  size_t target = isChunked ? PLANT_JPEG_MAX_BYTES : (size_t)contentLen;
  if (target > PLANT_JPEG_MAX_BYTES) target = PLANT_JPEG_MAX_BYTES;

  unsigned long start = millis();
  unsigned long lastProgress = millis();

  if (isChunked) {
    // Parser manual: loop ler <size>\r\n<data>\r\n ate' size=0
    while (millis() - start < 30000) {
      // 1) Le linha de tamanho (hex + ext + \r\n). Buffer 32 cobre
      // "FFFFFFFF;name=value\r\n" sem overflow. RFC 7230 permite ext.
      char sizeLine[32] = {0};
      int slIdx = 0;
      bool gotLine = false;
      unsigned long lineStart = millis();
      while (millis() - lineStart < 5000 && slIdx < (int)sizeof(sizeLine) - 1) {
        if (!stream->available()) { delay(2); continue; }
        int c = stream->read();
        if (c < 0) break;
        if (c == '\n' && slIdx > 0 && sizeLine[slIdx-1] == '\r') {
          sizeLine[slIdx-1] = 0;  // termina string antes do \r
          gotLine = true;
          break;
        }
        sizeLine[slIdx++] = (char)c;
      }
      if (!gotLine) { Serial.println("[net] chunked: size line timeout"); break; }
      // 2) Parseia hex (pode ter extensoes ;name=value que ignoramos)
      char *semi = strchr(sizeLine, ';');
      if (semi) *semi = 0;
      char *endp = NULL;
      long chunkSize = strtol(sizeLine, &endp, 16);
      // Valida parsing: endp deve apontar pro fim da string (sem lixo).
      // Reject negativo OU se nada foi parseado (endp == sizeLine).
      if (endp == sizeLine || chunkSize < 0) {
        Serial.printf("[net] chunked: invalid size '%s'\n", sizeLine);
        break;
      }
      if (chunkSize == 0) break;  // last chunk (terminator)
      if ((size_t)chunkSize > PLANT_JPEG_MAX_BYTES - total) {
        Serial.printf("[net] chunked overflow: chunk=%ld total=%u max=%u\n",
                      chunkSize, (unsigned)total, (unsigned)PLANT_JPEG_MAX_BYTES);
        break;
      }
      // 3) Le os bytes do chunk
      size_t want = (size_t)chunkSize;
      while (want > 0 && millis() - start < 30000) {
        int avail = stream->available();
        if (avail <= 0) { delay(2); continue; }
        size_t toRead = (size_t)avail < want ? (size_t)avail : want;
        int r = stream->readBytes(plantPhotoBuf + total, toRead);
        if (r <= 0) break;
        total += r;
        want -= r;
        lastProgress = millis();
      }
      if (want > 0) { Serial.printf("[net] chunked: short read (%u left)\n", (unsigned)want); break; }
      // 4) Consome \r\n apos chunk data
      unsigned long crlfStart = millis();
      int got = 0;
      while (got < 2 && millis() - crlfStart < 2000) {
        if (!stream->available()) { delay(2); continue; }
        stream->read(); got++;
      }
    }
  } else {
    // Path identity (Content-Length conhecido) — leitura direta
    while (total < target && (millis() - start < 30000)) {
      size_t avail = stream->available();
      if (avail == 0) {
        if (millis() - lastProgress > 5000 && !http.connected()) break;
        delay(5);
        continue;
      }
      size_t remaining = target - total;
      size_t toRead = avail > remaining ? remaining : avail;
      int read = stream->readBytes(plantPhotoBuf + total, toRead);
      if (read <= 0) break;
      total += read;
      lastProgress = millis();
    }
  }
  http.end();
  Serial.printf("[net] plant/%d/photo %u bytes (RGB565 raw)\n", plantId, (unsigned)total);

  // RGB565 raw: esperamos 320x240x2 = 153600 bytes. Se vier menor, foi
  // truncado e a imagem fica corrompida. Log + retorna o que veio (UI
  // mostra placeholder de erro).
  const size_t EXPECTED_RGB565_LEN = 320 * 240 * 2;
  if (total != EXPECTED_RGB565_LEN) {
    Serial.printf("[net] WARN RGB565 size mismatch: %u (esperava %u)\n",
                  (unsigned)total, (unsigned)EXPECTED_RGB565_LEN);
  }
  return total;
}

// Photo timeline: lista de IDs das fotos da planta atual + indice corrente.
// Populado por fetchPlantPhotosList; consumido pra navegar com ← →.
#define PHOTO_LIST_MAX 10
static int photoListIds[PHOTO_LIST_MAX] = {0};
static int photoListCount     = 0;
static int photoListIdx       = 0;  // 0 = mais recente
static int photoListPlantId   = 0;  // pra invalidar lista quando trocar planta
static volatile bool photoTimelineNeedsApply = false;

// GET /api/device/plant/:id/photos — lista as ultimas 10 fotos (metadata).
static bool fetchPlantPhotosList(int plantId) {
  if (!wifiOk) return false;
  HTTPClient http;
  char url[160];
  snprintf(url, sizeof(url), "%s/api/device/plant/%d/photos", SERVER_URL, plantId);
  httpBegin(http, url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[net] photos list HTTP %d\n", code);
    http.end();
    return false;
  }
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getStream());
  http.end();
  if (err != DeserializationError::Ok) return false;
  JsonArray arr = doc["photos"].as<JsonArray>();
  int n = 0;
  for (JsonObject p : arr) {
    if (n >= PHOTO_LIST_MAX) break;
    int id = p["id"] | 0;
    if (id <= 0) continue;
    photoListIds[n++] = id;
  }
  photoListCount = n;
  photoListPlantId = plantId;
  photoListIdx = 0;  // sempre comeca na mais recente
  Serial.printf("[net] photos list plant=%d count=%d\n", plantId, photoListCount);
  return true;
}

// Handler enfileira o request — tapTask processa (HTTP/PSRAM/JPEG decode
// nao podem rodar no thread LVGL — estouro de stack).
static void plantPhotoRequestHandler(int plantId) {
  if (plantPhotoTapPending) {
    Serial.println("[plant] outro photo request pending — ignorado");
    return;
  }
  // Reset timeline state pra nova planta
  if (plantId != photoListPlantId) {
    photoListCount = 0;
    photoListIdx = 0;
    photoListPlantId = plantId;
  }
  plantPhotoTapId = plantId;
  plantPhotoTapPending = true;
}

// Navigation: -1 = mais recente (idx menor), +1 = mais antiga (idx maior).
// Adjusta photoListIdx + dispara fetch da nova foto.
static void photoNavHandler(int direction) {
  if (photoListCount <= 1) return;
  int newIdx = photoListIdx + direction;
  if (newIdx < 0 || newIdx >= photoListCount) return;
  photoListIdx = newIdx;
  if (plantPhotoTapPending) return;  // ja tem outro fetch em flight
  plantPhotoTapId = photoListPlantId;
  plantPhotoTapPending = true;
  Serial.printf("[plant] timeline nav -> idx=%d (photoId=%d)\n",
                photoListIdx, photoListIds[photoListIdx]);
}

// User fechou detalhe — libera buffer de DOWNLOAD (128KB PSRAM). Copia
// que LVGL/TJPGD usou (em cultivo_ui.cpp) ja' foi liberada la'. Sem isso,
// ~128KB ficariam pinados entre views — desnecessario.
static void plantDetailClosedHandler() {
  if (plantPhotoBuf) {
    heap_caps_free(plantPhotoBuf);
    plantPhotoBuf = nullptr;
    Serial.println("[plant] photo buf liberado (128KB)");
  }
  // Limpa cache de timeline pra proxima abertura comecar fresh
  photoListCount = 0;
  photoListIdx = 0;
  photoListPlantId = 0;
}

static void processPlantPhotoTap() {
  if (!plantPhotoTapPending) return;
  int id = plantPhotoTapId;
  plantPhotoTapPending = false;
  // Se nao temos lista ainda, fetcha primeiro (1 request extra mas barato)
  if (photoListCount == 0 || photoListPlantId != id) {
    fetchPlantPhotosList(id);
  }
  // Resolve photoId atual da timeline (0 = mais recente / param vazio)
  int photoId = (photoListCount > 0 && photoListIdx < photoListCount)
              ? photoListIds[photoListIdx] : 0;
  uint8_t health = 0;
  char dateBuf[24] = {0};
  size_t got = fetchPlantPhoto(id, photoId, &health, dateBuf, sizeof(dateBuf));
  plantPhotoPlantId = id;
  plantPhotoLen     = got;
  plantPhotoHealth  = health;
  strncpy(plantPhotoDate, dateBuf, sizeof(plantPhotoDate) - 1);
  plantPhotoDate[sizeof(plantPhotoDate) - 1] = '\0';
  plantPhotoNeedsApply = true;
  photoTimelineNeedsApply = true;  // sinaliza UI pra atualizar X/N + arrows
}

// TAREFAS — aba 4 do display. fetchTasks GET /api/device/tasks/<tentId>
// retorna lista de standaloneTasks ({id, texto, feito}). UI mostra
// checkbox + label + scroll. Tap dispara POST /api/device/task-complete.
// ════════════════════════════════════════════════════════════════════════════════
#define TASKS_LOCAL_MAX 25  // bumpado pra calendar mode (current + next week + overdue)
static int      taskIdsLocal     [TASKS_LOCAL_MAX] = {0};
static char     taskTitlesLocal  [TASKS_LOCAL_MAX][64] = {{0}};
static bool     taskDoneLocal    [TASKS_LOCAL_MAX] = {false};
static uint32_t taskDueDateLocal [TASKS_LOCAL_MAX] = {0};
static bool     taskOverdueLocal [TASKS_LOCAL_MAX] = {false};
static int      taskCountLocal = 0;
static volatile bool tasksNeedsRefresh = false;
static unsigned long lastTasksFetch = 0;
static const unsigned long TASKS_FETCH_INTERVAL = 60UL * 1000UL;  // 1 min
// Range atual da fetchTasks. UI toggle Lista/Semana chama com mode 0|1.
static int      tasksRangeIdx = 0;  // 0=current, 1=7d

static bool fetchTasks() {
  if (!wifiOk) return false;
  HTTPClient http;
  char url[160];
  // range=current (default) ou ?range=7d quando user toggle Lista->Semana
  snprintf(url, sizeof(url), "%s/api/device/tasks/%d?range=%s",
           SERVER_URL, TENT_ID, tasksRangeIdx == 1 ? "7d" : "current");
  httpBegin(http, url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[net] tasks HTTP %d\n", code);
    http.end();
    return false;
  }
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getStream());
  http.end();
  if (err != DeserializationError::Ok) {
    Serial.printf("[net] tasks JSON err: %s\n", err.c_str());
    return false;
  }
  // Response: array de {id, texto, feito, dueDate?, overdue?}
  JsonArray arr = doc.as<JsonArray>();
  int n = 0;
  for (JsonObject t : arr) {
    if (n >= TASKS_LOCAL_MAX) break;
    int id = t["id"] | 0;
    const char *texto = t["texto"] | "";
    bool feito = t["feito"] | false;
    if (id == 0 || !*texto) continue;
    taskIdsLocal[n] = id;
    strncpy(taskTitlesLocal[n], texto, sizeof(taskTitlesLocal[n]) - 1);
    taskTitlesLocal[n][sizeof(taskTitlesLocal[n]) - 1] = '\0';
    taskDoneLocal[n]    = feito;
    taskDueDateLocal[n] = (uint32_t)(t["dueDate"] | 0);
    taskOverdueLocal[n] = t["overdue"] | false;
    n++;
  }
  taskCountLocal = n;
  Serial.printf("[net] tasks: %d carregadas (range=%s)\n", taskCountLocal,
                tasksRangeIdx == 1 ? "7d" : "current");
  tasksNeedsRefresh = true;
  return true;
}

// User tocou no toggle Lista/Semana da aba Tarefas. Atualiza range e
// refetcha imediato. Rodando na UI thread porque user esta esperando.
static void tasksRangeHandler(int mode) {
  tasksRangeIdx = mode;
  Serial.printf("[ui] tasks range -> %d\n", mode);
  if (fetchTasks()) {
    lastTasksFetch = millis();
  }
}

// POST /api/device/task-complete — server toggla isDone e retorna novo state.
// Body: {"taskId": <id>}
static bool postTaskComplete(int taskId, bool *outDone) {
  if (!wifiOk) return false;
  HTTPClient http;
  char url[160];
  snprintf(url, sizeof(url), "%s/api/device/task-complete", SERVER_URL);
  if (!httpBegin(http, url)) return false;
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.addHeader("Content-Type", "application/json");
  char body[48];
  snprintf(body, sizeof(body), "{\"taskId\":%d}", taskId);
  http.setTimeout(5000);
  int code = http.POST(body);
  if (code != 200) {
    Serial.printf("[task] toggle id=%d HTTP %d\n", taskId, code);
    http.end();
    return false;
  }
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getStream());
  http.end();
  if (err != DeserializationError::Ok) return true;  // assume OK
  if (outDone) *outDone = doc["feito"] | false;
  Serial.printf("[task] toggle id=%d -> %s OK\n", taskId, *outDone ? "DONE" : "TODO");
  return true;
}

// Pending tap (handler LVGL nao chama HTTP — enfileira pra tapTask processar)
static volatile bool taskTapPending = false;
static int           taskTapId      = 0;
static volatile bool taskUiPending  = false;
static int           taskUiId       = 0;
static bool          taskUiDone     = false;

static void taskToggleHandler(int taskId) {
  if (taskTapPending) {
    Serial.println("[task] outro tap pending — ignorado");
    return;
  }
  taskTapId = taskId;
  taskTapPending = true;
}

static void processTaskTap() {
  if (!taskTapPending) return;
  int id = taskTapId;
  taskTapPending = false;
  bool newDone = false;
  bool ok = postTaskComplete(id, &newDone);
  // Atualiza storage local + sinaliza UI
  for (int i = 0; i < taskCountLocal; i++) {
    if (taskIdsLocal[i] == id) {
      taskDoneLocal[i] = ok ? newDone : !taskDoneLocal[i];  // revert se falhou (UI ja' inverteu)
      taskUiId   = id;
      taskUiDone = taskDoneLocal[i];
      taskUiPending = true;
      break;
    }
  }
}

// fetchScenes: GET /api/device/scenes. Aceita {items:[...]} (formato novo
// ════════════════════════════════════════════════════════════════════════════════
// OTA via GitHub Releases — check + download + flash + reboot
// ════════════════════════════════════════════════════════════════════════════════
// User toca "Verificar atualizacao" no cfg modal -> otaCheckPending = true.
// tapTask consome a flag, faz GET https://api.github.com/.../releases/latest,
// compara tag_name com FW_VERSION. Se newer, baixa o .bin do asset e flasha
// via Update.writeStream. ESP.restart() em sucesso.
//
// Asset name esperado: contem "esp32" ou "firmware" no nome (ex: cultivo-esp32-display-v0.5.0.bin).
// Pra setup: criar release no GitHub e anexar o .bin (build via `pio run`).
//
// Limitacoes:
// - Sem signature check (qualquer commit malicioso no repo poderia flashar firmware)
//   Mitigado pq repo e' do owner. Sem TUF/cosign por simplicidade.
// - HTTPS sem CA pinning (setInsecure no httpBegin). Same trust model do API.
static const char *GITHUB_RELEASES_URL =
    "https://api.github.com/repos/jpedrorock/cultivo-server/releases/latest";

// Compara versao semver simples "X.Y.Z" — retorna >0 se latest > current,
// <0 se latest < current, 0 se igual. "v" prefix removido se presente.
static int compareVersions(const char *latest, const char *current) {
  if (latest[0] == 'v' || latest[0] == 'V') latest++;
  if (current[0] == 'v' || current[0] == 'V') current++;
  int la, lb, lc, ca, cb, cc;
  if (sscanf(latest, "%d.%d.%d", &la, &lb, &lc) != 3) return 0;
  if (sscanf(current, "%d.%d.%d", &ca, &cb, &cc) != 3) return 0;
  if (la != ca) return la - ca;
  if (lb != cb) return lb - cb;
  return lc - cc;
}

// GET GitHub releases API. Preenche outVer + outUrl se houver release valida.
static bool fetchLatestRelease(char *outVer, size_t verSz, char *outUrl, size_t urlSz) {
  if (!wifiOk) return false;
  HTTPClient http;
  httpBegin(http, GITHUB_RELEASES_URL);
  http.addHeader("User-Agent", "Cultivo-ESP32-Display");
  http.addHeader("Accept", "application/vnd.github+json");
  http.setTimeout(8000);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[ota] check HTTP %d\n", code);
    http.end();
    return false;
  }
  // JSON pode ser grande (full release object); usa filter pra reduzir RAM.
  JsonDocument filter;
  filter["tag_name"] = true;
  filter["assets"][0]["name"] = true;
  filter["assets"][0]["browser_download_url"] = true;
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getStream(),
                                             DeserializationOption::Filter(filter));
  http.end();
  if (err != DeserializationError::Ok) {
    Serial.printf("[ota] JSON err: %s\n", err.c_str());
    return false;
  }
  const char *tag = doc["tag_name"] | "";
  if (!*tag) return false;
  strncpy(outVer, tag, verSz - 1);
  outVer[verSz - 1] = '\0';
  // Procura asset com .bin no nome — usualmente "esp32" ou "firmware"
  JsonArray assets = doc["assets"].as<JsonArray>();
  for (JsonObject a : assets) {
    const char *name = a["name"] | "";
    if (strstr(name, ".bin")) {
      const char *url = a["browser_download_url"] | "";
      strncpy(outUrl, url, urlSz - 1);
      outUrl[urlSz - 1] = '\0';
      Serial.printf("[ota] release %s -> %s\n", outVer, name);
      return true;
    }
  }
  Serial.println("[ota] release sem asset .bin");
  return false;
}

// Baixa .bin e flasha via Update.writeStream. Em sucesso, retorna true e
// caller deve chamar ESP.restart() (nao fazemos aqui pra permitir UI feedback).
static bool downloadAndFlash(const char *url) {
  HTTPClient http;
  httpBegin(http, url);
  http.addHeader("User-Agent", "Cultivo-ESP32-Display");
  http.setTimeout(60000);  // 60s — firmware ~1.5MB pode levar tempo
  int code = http.GET();
  // GitHub release redirect 302 pra CDN; HTTPClient segue por default
  if (code != 200) {
    Serial.printf("[ota] download HTTP %d\n", code);
    http.end();
    return false;
  }
  int contentLen = http.getSize();
  if (contentLen <= 0) {
    Serial.printf("[ota] tamanho desconhecido (CL=%d)\n", contentLen);
    http.end();
    return false;
  }
  Serial.printf("[ota] baixando %d bytes...\n", contentLen);
  if (!Update.begin((size_t)contentLen)) {
    Serial.printf("[ota] Update.begin fail: %s\n", Update.errorString());
    http.end();
    return false;
  }
  WiFiClient *stream = http.getStreamPtr();
  size_t written = Update.writeStream(*stream);
  http.end();
  if (written != (size_t)contentLen) {
    Serial.printf("[ota] short write %u/%d\n", (unsigned)written, contentLen);
    Update.abort();
    return false;
  }
  if (!Update.end(true)) {
    Serial.printf("[ota] Update.end fail: %s\n", Update.errorString());
    return false;
  }
  Serial.println("[ota] flash OK, reboot pra ativar");
  return true;
}

// Roda no tapTask (core 0, stack 12KB). Mostra feedback via showToast.
static void processOtaCheck() {
  if (!otaCheckPending) return;
  otaCheckPending = false;
  // Aqui chamariamos showToast diretamente, mas e' da UI thread. Usamos
  // Serial.print e o user ve no display via outras heuristicas (futuro:
  // adicionar um statusOverlay similar ao idleOverlay pra esses casos).
  Serial.println("[ota] check started");
  char ver[32] = {0}, url[256] = {0};
  if (!fetchLatestRelease(ver, sizeof(ver), url, sizeof(url))) {
    Serial.println("[ota] sem release valida ou falha de rede");
    return;
  }
  int cmp = compareVersions(ver, FW_VERSION);
  Serial.printf("[ota] latest=%s current=%s cmp=%d\n", ver, FW_VERSION, cmp);
  if (cmp <= 0) {
    Serial.println("[ota] ja na versao mais recente");
    return;
  }
  Serial.printf("[ota] atualizando %s -> %s\n", FW_VERSION, ver);
  if (downloadAndFlash(url)) {
    Serial.println("[ota] sucesso, rebootando em 2s");
    delay(2000);
    ESP.restart();
  } else {
    Serial.println("[ota] falha no update — firmware nao alterado");
  }
}

// sprint 1) OU {scenes:[...]} (legacy) — server decide qual mandar baseado
// em ter vinculos na tentScenes/tentDevices.
static bool fetchScenes() {
  if (!wifiOk) return false;
  HTTPClient http;
  char url[128];
  snprintf(url, sizeof(url), "%s/api/device/scenes", SERVER_URL);
  httpBegin(http, url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(8000);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[net] scenes HTTP %d\n", code);
    http.end();
    return false;
  }
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getStream());
  http.end();
  if (err != DeserializationError::Ok) {
    Serial.printf("[net] scenes JSON err: %s\n", err.c_str());
    return false;
  }

  // Detecta formato — items tem prioridade (novo)
  JsonArray itemsArr = doc["items"].as<JsonArray>();
  bool isLegacy = itemsArr.isNull();
  JsonArray arr  = isLegacy ? doc["scenes"].as<JsonArray>() : itemsArr;

  int n = 0;
  for (JsonObject obj : arr) {
    if (n >= SCENES_LOCAL_MAX) break;
    if (parseItemSlot(obj, n, isLegacy)) n++;
  }
  sceneCountLocal = n;

  // Conta scenes vs devices p/ log
  int nScenes = 0, nDevices = 0, nAutomations = 0;
  for (int i = 0; i < n; i++) {
    if      (sceneTypeLocal[i] == 0) nScenes++;
    else if (sceneTypeLocal[i] == 1) nDevices++;
    else if (sceneTypeLocal[i] == 2) nAutomations++;
  }
  Serial.printf("[net] items: %d total (%d cenas, %d devices, %d autom) [%s]\n",
                n, nScenes, nDevices, nAutomations, isLegacy ? "legacy" : "novo");
  scenesNeedsRefresh = true;
  return true;
}

// Forward declaration — definido logo abaixo (depois do netTaskFn)
static void processSceneTap();

// Task dedicada de tap — wake quando sceneTapPending=true. Stack 8KB cobre
// TLS handshake + JsonDocument com folga. Roda em paralelo com netTask
// (que pode estar bloqueada em fetchScenes/fetchDisplay) — latencia tipica
// ~50ms (vTaskDelay) + tempo do POST HTTPS (500ms-2s).
static void tapTaskFn(void *param) {
  for (;;) {
    if (sceneTapPending && wifiOk) {
      uint32_t t0 = millis();
      processSceneTap();
      logIfSlow("sceneTap", t0, 9000);
    }
    if (taskTapPending && wifiOk) {
      uint32_t t0 = millis();
      processTaskTap();
      logIfSlow("taskTap", t0, 6000);
    }
    if (plantPhotoTapPending && wifiOk) {
      uint32_t t0 = millis();
      processPlantPhotoTap();
      logIfSlow("plantPhoto", t0, 16000);  // foto pode demorar
    }
    if (otaCheckPending && wifiOk) {
      uint32_t t0 = millis();
      processOtaCheck();
      logIfSlow("otaCheck", t0, 60000);  // download firmware pode levar tempo
    }
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

static void netTaskFn(void *param) {
  // Warm-up: depois do primeiro WiFi OK, dispara tasks+plants imediatamente
  // pra nao esperar 1min/10min do intervalo regular (UX ruim no boot).
  // Depois disso as flags lastFetch tomam conta do schedule normal.
  bool bootWarmed = false;
  unsigned long lastWifiRetry = 0;
  const unsigned long WIFI_RETRY_INTERVAL = 30000;  // 30s entre retries

  for (;;) {
    // Reconnect manual: user tocou no icone WiFi — forca retry imediato
    // sem esperar o ciclo de 30s. Funciona estando online ou offline.
    if (wifiReconnectPending) {
      wifiReconnectPending = false;
      lastWifiRetry = millis() - WIFI_RETRY_INTERVAL;  // dispara no proximo if
      wifiOk = false;  // forca o bloco de retry abaixo
      Serial.println("[net] WiFi reconnect via icon tap");
    }

    // WiFi retry: se nao conectou no boot, tenta a cada 30s pra recuperar
    // sem precisar reboot manual. Cobre o caso de SSID temporariamente
    // fora de range, roteador resetando, etc.
    if (!wifiOk) {
      if (WiFi.status() == WL_CONNECTED) {
        // Estado dessincronizado — flag falsa, mas WiFi conectou. Sincroniza.
        wifiOk = true;
        Serial.println("[net] WiFi reconectou (sync)");
      } else if (millis() - lastWifiRetry >= WIFI_RETRY_INTERVAL && strlen(WIFI_SSID) > 0) {
        lastWifiRetry = millis();
        Serial.printf("[net] WiFi retry: %s\n", WIFI_SSID);
        WiFi.disconnect();
        vTaskDelay(pdMS_TO_TICKS(200));
        WiFi.begin(WIFI_SSID, WIFI_PASS);
        // Espera ate' 10s pela conexao
        for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) {
          vTaskDelay(pdMS_TO_TICKS(500));
        }
        wifiOk = (WiFi.status() == WL_CONNECTED);
        Serial.printf("[net] WiFi retry resultado: %s\n", wifiOk ? "OK" : "FALHOU");
      } else {
        vTaskDelay(pdMS_TO_TICKS(1000));
      }
      continue;
    }

    // Detecta desconexao em runtime (router reset, signal loss)
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[net] WiFi caiu — flag offline");
      wifiOk = false;
      lastWifiRetry = millis() - WIFI_RETRY_INTERVAL;  // tenta reconectar logo
      continue;
    }

    if (!bootWarmed) {
      bootWarmed = true;
      Serial.println("[net] boot warm-up: tasks + plants");
      fetchTasks();
      lastTasksFetch = millis();
      fetchPlants();
      lastPlantsFetch = millis();
    }

    // (taps sao processados pela tapTask em paralelo — nao bloqueia aqui)

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

    // Hist refresh menos frequente — dailyLogs muda no maximo cada hora
    if (millis() - lastHistFetch >= HIST_FETCH_INTERVAL) {
      lastHistFetch = millis();
      uint32_t t0 = millis();
      fetchHistoryAll("24h");
      logIfSlow("history-all", t0, 6000);
    }

    // Cenas Tuya — refresh ocasional (cenas raramente mudam)
    if (millis() - lastScenesFetch >= SCENES_FETCH_INTERVAL) {
      lastScenesFetch = millis();
      uint32_t t0 = millis();
      fetchScenes();
      logIfSlow("scenes", t0, 9000);
    }

    // Tarefas — refresh a cada 1min (mudam quando user marca no app)
    if (millis() - lastTasksFetch >= TASKS_FETCH_INTERVAL) {
      lastTasksFetch = millis();
      uint32_t t0 = millis();
      fetchTasks();
      logIfSlow("tasks", t0, 6000);
    }

    // Plantas — lista raramente muda, refresh 10min
    if (millis() - lastPlantsFetch >= PLANTS_FETCH_INTERVAL) {
      lastPlantsFetch = millis();
      uint32_t t0 = millis();
      fetchPlants();
      logIfSlow("plants", t0, 9000);
    }

    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// SSE TASK — consumer de Server-Sent Events do /api/device/stream/<tentId>
//
// Mantem conexao HTTPS long-lived com o server. Recebe eventos:
//   ": ping <ms>\n\n"            heartbeat (ignora)
//   "event: alert\ndata: {...}\n\n"   alerta novo
//
// Push para alertPending flag + alertBuf. Main loop le e dispara UI overlay.
// Reconnect com backoff 5s se conexao cair. Usa ?since=<lastAlertId> pra
// evitar duplicar em reconexao temporaria.
// ════════════════════════════════════════════════════════════════════════════════
static TaskHandle_t sseTaskHandle = NULL;
static volatile bool alertPending = false;
static int  alertBufId = 0;
static char alertBufType[16]    = {0};
static char alertBufMetric[8]   = {0};
static char alertBufMessage[160]= {0};
static int  lastAlertId = 0;

static void sseTaskFn(void *param) {
  static WiFiClientSecure sseClient;
  sseClient.setInsecure();  // mesma trust model dos outros endpoints

  for (;;) {
    if (!wifiOk || strlen(DEVICE_TOKEN) == 0) {
      vTaskDelay(pdMS_TO_TICKS(2000));
      continue;
    }

    // Extrai host do SERVER_URL (https://app.cultivo.pro -> app.cultivo.pro)
    char host[64] = {0};
    const char *p = strstr(SERVER_URL, "://");
    if (p) {
      strncpy(host, p + 3, sizeof(host) - 1);
      // strip path se houver
      char *slash = strchr(host, '/');
      if (slash) *slash = 0;
    } else {
      strncpy(host, SERVER_URL, sizeof(host) - 1);
    }

    Serial.printf("[sse] conectando %s:443 (since=%d)\n", host, lastAlertId);
    if (!sseClient.connect(host, 443)) {
      Serial.println("[sse] connect fail");
      vTaskDelay(pdMS_TO_TICKS(5000));
      continue;
    }

    // GET request com Accept: text/event-stream
    sseClient.printf("GET /api/device/stream/%d?since=%d HTTP/1.1\r\n", TENT_ID, lastAlertId);
    sseClient.printf("Host: %s\r\n", host);
    sseClient.printf("X-Device-Token: %s\r\n", DEVICE_TOKEN);
    sseClient.print("Accept: text/event-stream\r\n");
    sseClient.print("Cache-Control: no-cache\r\n");
    sseClient.print("Connection: keep-alive\r\n\r\n");

    // Skip response headers ate' linha vazia
    bool headersDone = false;
    unsigned long lastRead = millis();
    while (sseClient.connected() && !headersDone && millis() - lastRead < 10000) {
      if (!sseClient.available()) { vTaskDelay(pdMS_TO_TICKS(20)); continue; }
      String line = sseClient.readStringUntil('\n');
      lastRead = millis();
      line.trim();
      if (line.isEmpty()) headersDone = true;
      // Aceita 200; se outro status, log e desconecta pra retry
      if (line.startsWith("HTTP/")) {
        if (line.indexOf(" 200 ") < 0) {
          Serial.printf("[sse] resp: %s\n", line.c_str());
          sseClient.stop();
          break;
        }
      }
    }
    if (!headersDone) {
      sseClient.stop();
      vTaskDelay(pdMS_TO_TICKS(5000));
      continue;
    }

    Serial.println("[sse] conectado, lendo events");
    // Loop principal de leitura SSE. Eventos sao "key: value\n" terminados
    // por linha vazia. Heartbeat ": ping\n\n" ignora-se.
    String eventName, dataLine;
    lastRead = millis();
    while (sseClient.connected()) {
      if (!sseClient.available()) {
        // Detecta drop: 60s sem dado nenhum (heartbeat e' 25s, dobramos)
        if (millis() - lastRead > 60000) {
          Serial.println("[sse] timeout — reconectando");
          break;
        }
        vTaskDelay(pdMS_TO_TICKS(50));
        continue;
      }
      String line = sseClient.readStringUntil('\n');
      lastRead = millis();
      line.trim();
      if (line.isEmpty()) {
        // Fim de evento — processa se temos data
        if (dataLine.length() > 0 && eventName == "alert") {
          JsonDocument doc;
          if (deserializeJson(doc, dataLine) == DeserializationError::Ok) {
            int aid = doc["id"] | 0;
            const char *atype   = doc["type"]    | "";
            const char *ametric = doc["metric"]  | "";
            const char *amsg    = doc["message"] | "";
            if (aid > lastAlertId) {
              lastAlertId = aid;
              alertBufId  = aid;
              strncpy(alertBufType,    atype,   sizeof(alertBufType)    - 1);
              strncpy(alertBufMetric,  ametric, sizeof(alertBufMetric)  - 1);
              strncpy(alertBufMessage, amsg,    sizeof(alertBufMessage) - 1);
              alertBufType[sizeof(alertBufType)-1]       = 0;
              alertBufMetric[sizeof(alertBufMetric)-1]   = 0;
              alertBufMessage[sizeof(alertBufMessage)-1] = 0;
              alertPending = true;
              Serial.printf("[sse] alert id=%d type=%s metric=%s: %s\n",
                            aid, atype, ametric, amsg);
            }
          }
        }
        eventName = "";
        dataLine = "";
        continue;
      }
      if (line.startsWith(":")) continue;  // comentario / heartbeat
      if (line.startsWith("event:")) {
        eventName = line.substring(6);
        eventName.trim();
      } else if (line.startsWith("data:")) {
        dataLine = line.substring(5);
        dataLine.trim();
      }
    }
    sseClient.stop();
    Serial.println("[sse] desconectado, retry em 5s");
    vTaskDelay(pdMS_TO_TICKS(5000));
  }
}

static void startNetTask() {
  if (netTaskHandle) return;
  // Stack 8KB: cobre TLS handshake (~4KB) + JSON parsing (~2KB) com folga
  xTaskCreatePinnedToCore(netTaskFn, "netTask", 8192, NULL, 1, &netTaskHandle, 0);
  // tapTask: dedicada pra processar taps em paralelo. Stack 12KB (8KB
  // estava apertado — TLS handshake + WiFiClientSecure + JsonDocument
  // estourava em algumas situacoes -> ESP reset).
  xTaskCreatePinnedToCore(tapTaskFn, "tapTask", 12288, NULL, 1, &tapTaskHandle, 0);
  // sseTask: long-lived HTTPS pra alertas push. Stack 12KB (mantem
  // WiFiClientSecure alive + readStringUntil buffers). Core 0 separado
  // do LVGL pra TLS handshake nao travar UI.
  xTaskCreatePinnedToCore(sseTaskFn, "sseTask", 12288, NULL, 1, &sseTaskHandle, 0);
  Serial.println("[net] netTask + tapTask + sseTask iniciadas no core 0");
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
  // Tambem zera os timers de fetch pra cada loop disparar IMEDIATAMENTE:
  // display, history, scenes, tasks, plants. Sem isso o user tocava no
  // refresh mas so' a Tuya recarregava (e nada de tarefas/plantas/cenas).
  // millis()-INTERVAL faz millis()-last>=INTERVAL ser true logo na proxima
  // iteracao do netTaskFn.
  lastFetch       = millis() - FETCH_INTERVAL;
  lastHistFetch   = millis() - HIST_FETCH_INTERVAL;
  lastScenesFetch = millis() - SCENES_FETCH_INTERVAL;
  lastTasksFetch  = millis() - TASKS_FETCH_INTERVAL;
  lastPlantsFetch = millis() - PLANTS_FETCH_INTERVAL;
  Serial.println("[ui] tap-to-refresh: forcando full reload");
}
// Tap no icone WiFi do header: forca reconexao imediata (sem esperar
// retry de 30s). netTaskFn picka a flag e roda WiFi.disconnect+begin.
static void wifiReconnectHandler() {
  wifiReconnectPending = true;
  Serial.println("[ui] WiFi reconnect requested");
}

// Quick log do FAB da aba Plantas — POST /api/device/quick-log.
// type=water:  v1=liters, v2 ignorado
// type=feed:   v1=ph,     v2=ec
// Rodando direto na UI thread porque user esta esperando (~200ms POST).
static void quickLogHandler(const char *type, float v1, float v2) {
  if (!wifiOk || !type) return;
  HTTPClient http;
  char url[128];
  snprintf(url, sizeof(url), "%s/api/device/quick-log", SERVER_URL);
  httpBegin(http, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  char body[128];
  if (!strcmp(type, "water")) {
    snprintf(body, sizeof(body), "{\"type\":\"water\",\"liters\":%.2f}", v1);
  } else if (!strcmp(type, "feed")) {
    snprintf(body, sizeof(body), "{\"type\":\"feed\",\"ph\":%.1f,\"ec\":%.2f}", v1, v2);
  } else {
    http.end();
    return;
  }
  int code = http.POST(body);
  Serial.printf("[net] quick-log %s HTTP %d\n", type, code);
  http.end();
}

// User tocou no alert overlay pra dispensar. Marca como SEEN no server
// via POST /alert-ack. Rodando direto na UI thread porque user esta
// esperando feedback; HTTPClient.POST e' ~200ms.
static void alertAckHandler(int alertId) {
  if (!wifiOk || alertId <= 0) return;
  HTTPClient http;
  char url[128];
  snprintf(url, sizeof(url), "%s/api/device/alert-ack", SERVER_URL);
  httpBegin(http, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  char body[48];
  snprintf(body, sizeof(body), "{\"alertId\":%d}", alertId);
  int code = http.POST(body);
  Serial.printf("[net] alert-ack id=%d HTTP %d\n", alertId, code);
  http.end();
}

// Tap no label de periodo do Historico ("ultimas 24h" -> 7d -> 30d).
// Re-fetcha history-all com periodStr correspondente. Rodando direto na UI
// thread — fetch e' leve (~30 pontos, JSON ~1KB) e user esta esperando.
static void histPeriodHandler(int period) {
  const char *periodStr = (period == 1) ? "7d" : (period == 2) ? "30d" : "24h";
  Serial.printf("[ui] historico period -> %s\n", periodStr);
  if (fetchHistoryAll(periodStr)) {
    cultivoUI_applyHistory();
    lastHistFetch = millis();  // reset timer pra evitar refetch automatico
  }
}

// POST /api/device/device-toggle — manda novo state desejado e parseia state
// REAL retornado (Tuya pode falhar ou tomar caminho diferente). Server
// resposta esperada: {success:true, deviceId:"...", state:true|false}.
// Out param outRealState recebe o estado final (apos Tuya executar).
// Retorna true se HTTP 200 + JSON ok.
static bool postDeviceToggle(const char *deviceId, bool desiredState, bool *outRealState) {
  if (!wifiOk) return false;
  HTTPClient http;
  char url[160];
  snprintf(url, sizeof(url), "%s/api/device/device-toggle", SERVER_URL);
  if (!httpBegin(http, url)) {
    Serial.println("[device] httpBegin falhou");
    return false;
  }
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.addHeader("Content-Type", "application/json");
  char body[128];
  snprintf(body, sizeof(body), "{\"deviceId\":\"%s\",\"state\":%s}",
           deviceId, desiredState ? "true" : "false");
  http.setTimeout(15000);  // server tem re-consulta Tuya 500ms + margem
  Serial.printf("[device] POST %s body=%s\n", url, body);
  int code = http.POST(body);
  if (code != 200) {
    String errBody = http.getString();
    Serial.printf("[device] toggle HTTP %d body=%s\n",
                  code, errBody.substring(0, 200).c_str());
    http.end();
    return false;
  }
  // DEBUG: log body inteiro pra confirmar response do server
  String respBody = http.getString();
  http.end();
  Serial.printf("[device] toggle 200 body=%s\n", respBody.c_str());

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, respBody);
  if (err != DeserializationError::Ok) {
    Serial.printf("[device] toggle JSON err: %s\n", err.c_str());
    if (outRealState) *outRealState = desiredState;
    return true;
  }
  // ANTES: usavamos `realState = doc["state"]` (do response do server). Mas o
  // server faz re-consulta apos 500ms que as vezes retorna state ANTIGO
  // (Tuya nao propagou ainda) → display "voltava" pro estado anterior.
  //
  // AGORA: ignora `realState` do server e assume `desiredState`. UI fica
  // optimistic ate' o proximo poll de /scenes (~30s) que confirma estado
  // REAL da Tuya (ja' propagado a essa altura). Se Tuya nao executou,
  // poll reverte; se executou, fica.
  bool serverState = doc["state"] | desiredState;
  if (outRealState) *outRealState = desiredState;  // optimistic
  Serial.printf("[device] toggle desired=%s server_state=%s (optimistic)\n",
                desiredState ? "ON" : "OFF", serverState ? "ON" : "OFF");
  return true;
}

// POST /api/device/automation-toggle — ativa/desativa cena programada Tuya.
// Tuya nao expoe state atual de automation, entao server confia no enabled
// passado e responde {success, automationId, enabled}.
static bool postAutomationToggle(const char *automationId, bool enabled) {
  if (!wifiOk) return false;
  HTTPClient http;
  char url[160];
  snprintf(url, sizeof(url), "%s/api/device/automation-toggle", SERVER_URL);
  if (!httpBegin(http, url)) return false;
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.addHeader("Content-Type", "application/json");
  char body[160];
  snprintf(body, sizeof(body),
           "{\"automationId\":\"%s\",\"enabled\":%s}",
           automationId, enabled ? "true" : "false");
  http.setTimeout(8000);
  int code = http.POST(body);
  Serial.printf("[automation] toggle %s -> %s HTTP %d\n",
                automationId, enabled ? "ENABLED" : "DISABLED", code);
  http.end();
  return code == 200;
}

// Tap em botao do grid CENAS — diferencia scene vs device:
//   - scene  : POST /api/device/scene-by-id/<id>/trigger (one-shot)
//   - device : optimistic toggle (UI ja' inverteu via sceneClickCb), POST,
//              entao SOBRESCREVE com state REAL retornado pelo server (que
//              vem da Tuya). Isso captura: device offline, Tuya rejeitou,
//              algo mudou entre toggle e response, etc.
//
// IMPORTANTE: o callback da UI (sceneClickCb) JA' inverte items[idx].state
// localmente antes de chamar este handler — feedback imediato. Aqui a gente
// confirma com o real-state do server.
// Handler LVGL — minimal, so' enfileira pro netTask processar.
// IMPORTANTE: nao pode chamar HTTP/TLS aqui (estouro de stack -> reset).
static void sceneTriggerHandler(int idx) {
  if (idx < 0 || idx >= sceneCountLocal) {
    Serial.printf("[tap] idx=%d fora do range (count=%d)\n", idx, sceneCountLocal);
    return;
  }
  if (sceneTapPending) {
    Serial.println("[tap] outro tap pending — ignorado");
    return;
  }
  sceneTapIdx = idx;
  sceneTapPending = true;  // netTask processa
}

// Executa o tap pendente — chamado APENAS de netTaskFn (core 0, stack OK).
// Faz HTTP/TLS, atualiza storage, sinaliza loop() pra atualizar UI se device.
static void processSceneTap() {
  if (!sceneTapPending) return;
  int idx = sceneTapIdx;
  sceneTapPending = false;

  if (idx < 0 || idx >= sceneCountLocal) return;
  const char *id   = sceneIdsLocal[idx];
  const char *name = sceneNamesLocal[idx];
  const char *hint = sceneIconHintLocal[idx];

  // SPECIAL: iconHint=refresh/sensor — nao dispara cena, faz refresh dos
  // sensores Tuya. Roda em paralelo com qualquer fetch periodico (flag).
  // UI ja' iniciou spin (set no callback de tap em cultivo_ui).
  if (!strcmp(hint, "refresh") || !strcmp(hint, "sensor")) {
    Serial.printf("[refresh] tap idx=%d name=%s -> refresh sensores\n", idx, name);
    refreshPending = true;  // netTaskFn vai chamar refreshTuyaNow
    return;
  }

  if (sceneTypeLocal[idx] == 1) {
    // Device — UI ja' inverteu visualmente. Storage main_lvgl ainda tem
    // state ANTIGO. Calcula desired = !old_state, faz POST, sinaliza UI
    // com state real (ou reverte se falhou).
    bool desired = !sceneStateLocal[idx];
    Serial.printf("[device] toggle idx=%d id=%s name=%s -> desired=%s\n",
                  idx, id, name, desired ? "ON" : "OFF");
    bool realState = desired;
    bool ok = wifiOk && postDeviceToggle(id, desired, &realState);
    if (!ok) {
      Serial.println("[device] POST falhou ou offline — reverte UI");
      deviceToggleResIdx    = idx;
      deviceToggleResState  = sceneStateLocal[idx];  // antigo
      deviceTogglePendingUI = true;
      return;
    }
    sceneStateLocal[idx]  = realState;
    deviceToggleResIdx    = idx;
    deviceToggleResState  = realState;
    deviceTogglePendingUI = true;
    return;
  }

  if (sceneTypeLocal[idx] == 2) {
    // Automation — toggle ENABLED/DISABLED da cena programada Tuya.
    // Tuya nao expoe state real; mantemos local. POST OK = adota desired.
    bool desired = !sceneStateLocal[idx];
    Serial.printf("[automation] toggle idx=%d id=%s name=%s -> %s\n",
                  idx, id, name, desired ? "ENABLED" : "DISABLED");
    bool ok = wifiOk && postAutomationToggle(id, desired);
    if (!ok) {
      Serial.println("[automation] POST falhou — reverte UI");
      deviceToggleResIdx    = idx;
      deviceToggleResState  = sceneStateLocal[idx];
      deviceTogglePendingUI = true;
      return;
    }
    sceneStateLocal[idx]  = desired;
    deviceToggleResIdx    = idx;
    deviceToggleResState  = desired;
    deviceTogglePendingUI = true;
    return;
  }

  // Scene — trigger one-shot
  Serial.printf("[scene] trigger idx=%d id=%s name=%s\n", idx, id, name);
  if (!wifiOk) {
    Serial.println("[scene] WiFi offline — request descartado");
    return;
  }
  HTTPClient http;
  char url[224];
  snprintf(url, sizeof(url),
           "%s/api/device/scene-by-id/%s/trigger", SERVER_URL, id);
  if (!httpBegin(http, url)) {
    Serial.println("[scene] httpBegin falhou");
    return;
  }
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(8000);
  int code = http.POST("");
  Serial.printf("[scene] id=%s HTTP %d\n", id, code);
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
  cultivoUI_setTaskToggleHandler(taskToggleHandler);
  cultivoUI_setPlantPhotoRequestHandler(plantPhotoRequestHandler);
  cultivoUI_setPlantDetailClosedHandler(plantDetailClosedHandler);
  cultivoUI_setWifiReconnectHandler(wifiReconnectHandler);
  cultivoUI_setHistPeriodHandler(histPeriodHandler);
  cultivoUI_setAlertAckHandler(alertAckHandler);
  cultivoUI_setQuickLogHandler(quickLogHandler);
  cultivoUI_setTasksRangeHandler(tasksRangeHandler);
  cultivoUI_setPhotoNavHandler(photoNavHandler);
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

  // Glow primary sutil canto superior — gradient horizontal, opacidade
  // baixa pra dar "ambient light" sem competir com o codigo central. Match
  // com as outras telas (mantem o feel "espaco respirando").
  lv_obj_t *glow = lv_obj_create(pairScreen);
  lv_obj_set_size(glow, SCREEN_W * 3 / 5, SCREEN_H * 2 / 3);
  lv_obj_set_pos(glow, 0, 0);
  lv_obj_set_style_bg_color(glow, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_bg_opa(glow, LV_OPA_10, 0);
  lv_obj_set_style_bg_grad_color(glow, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_grad_dir(glow, LV_GRAD_DIR_HOR, 0);
  lv_obj_set_style_border_width(glow, 0, 0);
  lv_obj_set_style_radius(glow, 0, 0);
  lv_obj_remove_flag(glow, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_remove_flag(glow, LV_OBJ_FLAG_SCROLLABLE);

  // Header — "CONECTAR DISPLAY" em primary (Geist bold 24)
  makeLabel(pairScreen, "CONECTAR DISPLAY", COL_PRIMARY, FONT_TITLE,
            LV_ALIGN_TOP_MID, 0, sh(12));
  makeLabel(pairScreen, "Vincule este display \xC3\xA0 sua estufa",
            COL_DIM, FONT_CAPTION, LV_ALIGN_TOP_MID, 0, sh(40));

  // Code central — fonte VALUE (Geist bold 40), letterspacing alto p/ leitura
  // a distancia. Branco fixo (info principal — DS hierarchy)
  lblPairCode = lv_label_create(pairScreen);
  lv_label_set_text(lblPairCode, "------");
  lv_obj_set_style_text_color(lblPairCode, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_text_font(lblPairCode, FONT_VALUE, 0);
  lv_obj_set_style_text_letter_space(lblPairCode, sw(6), 0);
  lv_obj_align(lblPairCode, LV_ALIGN_CENTER, 0, -sh(8));

  // Hint — onde digitar (cor primary, link-feel; era ciano)
  lblPairHint = lv_label_create(pairScreen);
  lv_label_set_text(lblPairHint, "app.cultivo.pro \xE2\x86\x92 Conectar Display");
  lv_obj_set_style_text_color(lblPairHint, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_text_font(lblPairHint, FONT_BODY, 0);
  lv_obj_align(lblPairHint, LV_ALIGN_CENTER, 0, sh(48));

  // Timer countdown abaixo
  lblPairTimer = lv_label_create(pairScreen);
  lv_label_set_text(lblPairTimer, "expira em --:--");
  lv_obj_set_style_text_color(lblPairTimer, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(lblPairTimer, FONT_CAPTION, 0);
  lv_obj_align(lblPairTimer, LV_ALIGN_BOTTOM_MID, 0, -sh(36));

  // Botao "Trocar WiFi" DS — secundario (border + texto, sem bg)
  lv_obj_t *btnReset = lv_btn_create(pairScreen);
  lv_obj_set_size(btnReset, sw(100), sh(28));
  lv_obj_align(btnReset, LV_ALIGN_BOTTOM_MID, 0, -sh(6));
  lv_obj_set_style_bg_color(btnReset, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_bg_opa(btnReset, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_color(btnReset, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_border_width(btnReset, 1, 0);
  lv_obj_set_style_radius(btnReset, RADIUS_XL, 0);  // pill style
  lv_obj_set_style_shadow_width(btnReset, 0, 0);
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

  // NOTA: lv_init() ja' chama lv_tjpgd_init() e lv_fs_memfs_init()
  // automaticamente quando LV_USE_TJPGD=1 e LV_USE_FS_MEMFS=1
  // (ver lv_init.c linhas 358/395). Chamar de novo aqui registra o
  // decoder em duplicidade -> heap corruption + bootloop. NAO refazer.

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
    fetchHistoryAll("24h");  // chart de Hist tem dados ja' no primeiro draw
    cultivoUI_applyHistory();  // aplica imediato (LVGL ja' construido)
    fetchScenes();             // popula scene*Local + scenesNeedsRefresh
    if (scenesNeedsRefresh) {
      scenesNeedsRefresh = false;
      // Monta CultivoItem[] a partir do storage e aplica na UI
      CultivoItem buf[SCENES_LOCAL_MAX] = {};
      for (int i = 0; i < sceneCountLocal; i++) {
        buf[i].id           = sceneIdsLocal[i];
        buf[i].name         = sceneNamesLocal[i];
        buf[i].type         = sceneTypeLocal[i];
        buf[i].state        = sceneStateLocal[i];
        buf[i].iconHint     = sceneIconHintLocal[i];
        buf[i].executionSec = sceneExecutionSecLocal[i];
      }
      cultivoUI_applyItems(buf, sceneCountLocal);
    }
    lastFetch       = millis();
    lastHistFetch   = millis();
    lastScenesFetch = millis();
    refreshHomeValues();
    // OTA disponivel enquanto o device ta online
    startOTA();
  }
  // CRITICO: startNetTask() roda INCONDICIONALMENTE — netTaskFn tem
  // WiFi auto-retry interno + processa wifiReconnectPending (tap no
  // icone). Antes ficava dentro do `if (wifiOk)` e se WiFi falhasse
  // no boot, a task nunca subia, deixando o device em offline-pra-
  // sempre sem auto-recovery nem tap-to-reconnect.
  startNetTask();

  // Timer de sleep — checa lv_display_get_inactive_time a cada 1s.
  // Apaga backlight apos screenSleepMs sem touch (configuravel via cfg modal,
  // em touchpad_read.
  sleepTimer = lv_timer_create(sleepTimerCb, 1000, NULL);

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
  if (histNeedsRefresh) {
    histNeedsRefresh = false;
    cultivoUI_applyHistory();
  }
  if (scenesNeedsRefresh) {
    scenesNeedsRefresh = false;
    // Monta CultivoItem[] a partir do storage (scene + device + iconHint + state + executionSec)
    CultivoItem buf[SCENES_LOCAL_MAX] = {};
    for (int i = 0; i < sceneCountLocal; i++) {
      buf[i].id           = sceneIdsLocal[i];
      buf[i].name         = sceneNamesLocal[i];
      buf[i].type         = sceneTypeLocal[i];
      buf[i].state        = sceneStateLocal[i];
      buf[i].iconHint     = sceneIconHintLocal[i];
      buf[i].executionSec = sceneExecutionSecLocal[i];
    }
    cultivoUI_applyItems(buf, sceneCountLocal);
  }
  // Resultado de device toggle vindo do netTask — atualiza visual on/off
  // do card. Roda no main thread (LVGL nao e' thread-safe).
  if (deviceTogglePendingUI) {
    deviceTogglePendingUI = false;
    cultivoUI_setDeviceState(deviceToggleResIdx, deviceToggleResState);
  }

  // Tarefas — apply lista quando fetch terminou
  if (tasksNeedsRefresh) {
    tasksNeedsRefresh = false;
    CultivoTask buf[TASKS_LOCAL_MAX] = {};
    for (int i = 0; i < taskCountLocal; i++) {
      buf[i].id      = taskIdsLocal[i];
      buf[i].title   = taskTitlesLocal[i];
      buf[i].done    = taskDoneLocal[i];
      buf[i].dueDate = taskDueDateLocal[i];
      buf[i].overdue = taskOverdueLocal[i];
    }
    cultivoUI_applyTasks(buf, taskCountLocal);
  }
  // Resultado de task toggle — sinaliza UI com state final
  if (taskUiPending) {
    taskUiPending = false;
    cultivoUI_setTaskDone(taskUiId, taskUiDone);
  }

  // Plantas — apply lista quando fetch terminou
  if (plantsNeedsRefresh) {
    plantsNeedsRefresh = false;
    CultivoPlant buf[PLANTS_LOCAL_MAX] = {};
    for (int i = 0; i < plantCountLocal; i++) {
      buf[i].id            = plantsLocal[i].id;
      buf[i].name          = plantsLocal[i].name;
      buf[i].code          = plantsLocal[i].code[0] ? plantsLocal[i].code : nullptr;
      buf[i].stage         = plantsLocal[i].stage;
      buf[i].healthStatus  = plantsLocal[i].healthStatus;
      buf[i].hasPhoto      = plantsLocal[i].hasPhoto;
      buf[i].lastPhotoDate = plantsLocal[i].lastPhotoDate[0] ? plantsLocal[i].lastPhotoDate : nullptr;
      buf[i].strainName       = plantsLocal[i].strainName[0]   ? plantsLocal[i].strainName   : nullptr;
      buf[i].strainVegaWeeks  = plantsLocal[i].strainVegaWeeks;
      buf[i].strainFloraWeeks = plantsLocal[i].strainFloraWeeks;
      buf[i].strainOrigin     = plantsLocal[i].strainOrigin[0] ? plantsLocal[i].strainOrigin : nullptr;
    }
    cultivoUI_applyPlants(buf, plantCountLocal);
  }
  // Foto da planta chegou — entrega pra UI (decoda JPEG via TJPGD)
  if (plantPhotoNeedsApply) {
    plantPhotoNeedsApply = false;
    cultivoUI_applyPlantPhoto(plantPhotoPlantId,
                              plantPhotoLen > 0 ? plantPhotoBuf : nullptr,
                              plantPhotoLen,
                              plantPhotoHealth,
                              plantPhotoDate);
  }
  // Alerta SSE chegou — mostra overlay modal cobrindo tela inteira.
  // Tap em qualquer lugar do overlay aciona ack via alertAckHandler.
  if (alertPending) {
    alertPending = false;
    cultivoUI_showAlert(alertBufId, alertBufType, alertBufMetric, alertBufMessage);
  }
  // Timeline info atualizada — UI mostra "X/N" + ativa/desativa arrows
  if (photoTimelineNeedsApply) {
    photoTimelineNeedsApply = false;
    cultivoUI_setPhotoTimelineInfo(photoListIdx, photoListCount);
  }

  // OTA handle: no-op quando nao ha' upload; durante upload bloqueia UI
  // intencionalmente (reboot acontece logo apos, entao eh OK)
  if (wifiOk) ArduinoOTA.handle();

  lv_timer_handler();
  delay(5);
}
