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

// Fontes responsivas — escalam automaticamente conforme hardware alvo
#ifdef REAL_HARDWARE
  #define FONT_VALUE   (&manrope_bold_40)    // 480x320: valores GIGANTES
  #define FONT_TITLE   (&manrope_bold_24)
  #define FONT_BODY    (&manrope_sb_18)
  #define FONT_CAPTION (&manrope_sb_14)
#else
  #define FONT_VALUE   (&manrope_bold_28)    // 320x240: valores compactos
  #define FONT_TITLE   (&manrope_bold_18)
  #define FONT_BODY    (&manrope_sb_14)
  #define FONT_CAPTION (&manrope_sb_12)
#endif

// ════════════════════════════════════════════════════════════════════════════════
// CONFIGURACAO — editavel via gear icon no header (persiste em NVS)
// Defaults aplicados quando NVS esta vazio (primeira boot).
// ════════════════════════════════════════════════════════════════════════════════
#define FW_VERSION "0.4.0"

static Preferences prefs;
static char    WIFI_SSID[33]    = "";
static char    WIFI_PASS[65]    = "";
static char    SERVER_URL[96]   = "https://cultivo.x.andy.plus";
static char    DEVICE_TOKEN[65] = "";
static int     TENT_ID          = 1;

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

#ifdef REAL_HARDWARE
  #include <Arduino_GFX_Library.h>
  static Arduino_DataBus *bus = nullptr;
  static Arduino_GFX     *gfx = nullptr;
  static const int SCREEN_W = 480;
  static const int SCREEN_H = 320;
#else
  #include <Adafruit_GFX.h>
  #include <Adafruit_ILI9341.h>
  static Adafruit_ILI9341 tft(TFT_CS, TFT_DC, TFT_RST);
  static const int SCREEN_W = 320;
  static const int SCREEN_H = 240;
#endif

// Helpers de escala — base 320x240 (Wokwi). No real (480x320) multiplica por 1.5 / 1.33
// Use pra todas dimensões de layout (posições, paddings, tamanhos de container).
// NÃO use pra fontes — as fontes já são por hardware via FONT_* macros.
static inline int sw(int v) { return (v * SCREEN_W) / 320; }
static inline int sh(int v) { return (v * SCREEN_H) / 240; }

// Altura da navbar custom + altura util de cada screen
static const int TABBAR_H = (SCREEN_H >= 320) ? 64 : 48;   // nav maior no hardware real
static const int TAB_H    = SCREEN_H - TABBAR_H;

// ── Cores do tema (espelham DisplayMode.tsx) ───────────────────────────────────
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
// Usar uint32_t garante 4-byte alignment (LV_DRAW_BUF_ALIGN default).
// Tamanho: 480*20 pixels de RGB565 = 19200 bytes = 4800 uint32_t.
// Cobre tanto Wokwi (320x240) quanto hardware real (480x320).
static const uint32_t BUF_LINES = 20;
static uint32_t buf1[480 * BUF_LINES / 2];
static uint32_t buf2[480 * BUF_LINES / 2];

// ── Estado dos dados ────────────────────────────────────────────────────────────
static char TENT_NAME[50] = "ESTUFA 1";
static char FASE[20]      = "FLORACAO";
static float tempC = 24.5f, rh = 62.0f, vpd = 1.1f, phv = 6.2f, ecv = 1.8f;
// (currentLux e currentPpfd ficam na secao LUX/PPFD)
static int semana = 4, totalSem = 16;

static bool wifiOk = false;
static unsigned long lastFetch = 0;
static const unsigned long FETCH_INTERVAL = 30000;

// Flag setada por handlers de tap (TEMP/UMIDADE) — loop() processa fora do click
static volatile bool refreshPending = false;

// netTask → loop: seta quando ha' dados novos. loop() chama refreshHomeValues()
// no thread principal (LVGL nao e thread-safe). atomic volatile basta, flag simples.
static volatile bool uiNeedsRefresh = false;

// ── Widgets HOME ────────────────────────────────────────────────────────────────
static lv_obj_t *contentArea;
static lv_obj_t *screenHome, *screenLux, *screenPhEc, *screenTarefa, *screenGrafic;
static lv_obj_t *navbar;
static lv_obj_t *navIcons[5];
static int activeScreen = 0;
static const uint32_t NAV_COLORS[5] = { COL_GRN, COL_YEL, COL_PRP, 0xFBBF24, COL_CYN };
static const lv_img_dsc_t *NAV_ICONS_IMG[5] = { &ic_home, &ic_lightbulb, &ic_flask, &ic_tasks, &ic_activity };

static lv_obj_t *lblTitle, *lblSub, *lblWifi;
static lv_obj_t *lblTemp, *lblRh, *lblPh, *lblEc;
static lv_obj_t *arcTemp;                   // arc central estilo Ebike
static lv_obj_t *sparkRh, *sparkPh, *sparkEc;  // mini-charts pulsantes
static lv_chart_series_t *serRhS, *serPhS, *serEcS;
static lv_timer_t *pulseTimer = nullptr;

// ── Widgets REGAR ───────────────────────────────────────────────────────────────
// ── Widgets LUX/PPFD ────────────────────────────────────────────────────────────
// targetPpfd = valor ajustado pelo usuario (persistido via POST /readings)
// currentPpfd/currentLux = ultima leitura do sensor (GET /display)
// luxMode = 0 PPFD | 1 LUX (toggle de visualizacao)
// Conversao: 1 PPFD ~= 54 LUX (cultivo LEDs)
static lv_obj_t *lblLuxValue, *lblLuxUnit, *luxBar;
static lv_obj_t *btnModePpfd, *btnModeLux;
static int currentLux = 0, currentPpfd = 0;
static int targetPpfd = 450;
static int luxMode = 0;  // 0=PPFD, 1=LUX
static const int LUX_PER_PPFD = 54;
static const int STEP_PPFD    = 25;

// ── Widgets pH/EC ───────────────────────────────────────────────────────────────
static lv_obj_t *taPh, *taEc, *kbNumero;
static int activePhEcField = 0;  // 0=pH, 1=EC

// ── Widgets TAREFAS ─────────────────────────────────────────────────────────────
static lv_obj_t *tarefasList;
struct Tarefa { char texto[80]; bool feito; int serverId; };
static Tarefa tarefas[10];
static int numTarefas = 0;

// ── Widgets HISTORICO ───────────────────────────────────────────────────────────
static lv_obj_t *chartHist, *mtxMetric, *mtxPeriod;
static lv_chart_series_t *serHist;
static int histMetric = 0;    // 0=temp, 1=rh, 2=ph, 3=ec
static int histPeriod = 0;    // 0=24h, 1=7d, 2=30d
static const char* METRIC_KEYS[4]   = { "temp", "rh", "ph", "ec" };
static const char* PERIOD_KEYS[3]   = { "24h", "7d", "30d" };

// ════════════════════════════════════════════════════════════════════════════════
// Display + touch callbacks (LVGL v9 API)
// ════════════════════════════════════════════════════════════════════════════════
static void disp_flush(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map) {
  uint32_t w = area->x2 - area->x1 + 1;
  uint32_t h = area->y2 - area->y1 + 1;
#ifdef REAL_HARDWARE
  gfx->draw16bitRGBBitmap(area->x1, area->y1, (uint16_t*)px_map, w, h);
#else
  tft.startWrite();
  tft.setAddrWindow(area->x1, area->y1, w, h);
  tft.writePixels((uint16_t*)px_map, w * h);
  tft.endWrite();
#endif
  lv_display_flush_ready(disp);
}

static bool ftRead(int &rx, int &ry) {
  Wire.beginTransmission(FT_ADDR);
  Wire.write(0x02);
  if (Wire.endTransmission(false) != 0) return false;
  Wire.requestFrom((int)FT_ADDR, 5);
  if (Wire.available() < 5) return false;
  uint8_t n = Wire.read();
  uint8_t xh = Wire.read(), xl = Wire.read();
  uint8_t yh = Wire.read(), yl = Wire.read();
  if (n == 0 || n > 2) return false;
  rx = ((xh & 0x0F) << 8) | xl;
  ry = ((yh & 0x0F) << 8) | yl;
  return true;
}

static void touchpad_read(lv_indev_t *indev, lv_indev_data_t *data) {
  int rx, ry;
  if (!ftRead(rx, ry)) { data->state = LV_INDEV_STATE_RELEASED; return; }
#ifdef REAL_HARDWARE
  data->point.x = rx; data->point.y = ry;
#else
  data->point.x = map(ry, 0, 320, 0, SCREEN_W);
  data->point.y = map(rx, 0, 240, SCREEN_H, 0);
#endif
  data->state = LV_INDEV_STATE_PRESSED;
  static uint32_t lastPrint = 0;
  if (millis() - lastPrint > 200) {
    lastPrint = millis();
    Serial.printf("[touch] raw=%d,%d -> mapped=%d,%d\n", rx, ry, data->point.x, data->point.y);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// Helper: card estilizado com gradient glassmorphism de 3 stops
// ════════════════════════════════════════════════════════════════════════════════
static lv_obj_t* makeCard(lv_obj_t *parent, int x, int y, int w, int h) {
  lv_obj_t *c = lv_obj_create(parent);
  lv_obj_set_size(c, w, h);
  lv_obj_set_pos(c, x, y);
  // Gradient 3-stop (highlight top + body + shadow base) — efeito glassmorphism
  lv_obj_set_style_bg_color(c, lv_color_hex(0x243142), 0);       // topo (claro)
  lv_obj_set_style_bg_grad_color(c, lv_color_hex(0x050811), 0);  // base (bem escuro)
  lv_obj_set_style_bg_grad_dir(c, LV_GRAD_DIR_VER, 0);
  lv_obj_set_style_bg_main_stop(c, 0, 0);       // topo comeca 0%
  lv_obj_set_style_bg_grad_stop(c, 230, 0);     // escurece apos 90% (reforca base escura)
  lv_obj_set_style_bg_opa(c, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(c, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_border_width(c, 1, 0);
  lv_obj_set_style_radius(c, 10, 0);
  lv_obj_set_style_pad_all(c, 6, 0);
  // Sombra externa (projecao embaixo do card — profundidade)
  lv_obj_set_style_shadow_color(c, lv_color_hex(0x000000), 0);
  lv_obj_set_style_shadow_width(c, 12, 0);
  lv_obj_set_style_shadow_opa(c, LV_OPA_50, 0);
  lv_obj_set_style_shadow_spread(c, 0, 0);
  lv_obj_set_style_shadow_ofs_x(c, 0, 0);
  lv_obj_set_style_shadow_ofs_y(c, 4, 0);
  lv_obj_clear_flag(c, LV_OBJ_FLAG_SCROLLABLE);
  return c;
}

// Helper: animação de "respiração" no shadow opa (pulsa o halo)
// Usado em conjunto com applyBloom pra dar vibe "vivo" estilo dashboard aviação
static void anim_shadow_opa_cb(void *obj, int32_t v) {
  lv_obj_set_style_shadow_opa((lv_obj_t*)obj, v, 0);
}

static void startBreathe(lv_obj_t *obj, uint32_t minOpa, uint32_t maxOpa, uint32_t periodMs) {
  lv_anim_t a;
  lv_anim_init(&a);
  lv_anim_set_var(&a, obj);
  lv_anim_set_values(&a, minOpa, maxOpa);
  lv_anim_set_time(&a, periodMs);
  lv_anim_set_playback_time(&a, periodMs);
  lv_anim_set_repeat_count(&a, LV_ANIM_REPEAT_INFINITE);
  lv_anim_set_exec_cb(&a, anim_shadow_opa_cb);
  lv_anim_start(&a);
}

// Helper: aplica bloom (glow mais intenso + outline animado) — estilo Tesla/HUD
static void applyBloom(lv_obj_t *obj, uint32_t color) {
  // Camada 1: shadow grande (o "glow radiante")
  lv_obj_set_style_shadow_color(obj, lv_color_hex(color), 0);
  lv_obj_set_style_shadow_width(obj, 28, 0);
  lv_obj_set_style_shadow_opa(obj, LV_OPA_70, 0);
  lv_obj_set_style_shadow_spread(obj, 2, 0);
  lv_obj_set_style_shadow_ofs_x(obj, 0, 0);
  lv_obj_set_style_shadow_ofs_y(obj, 0, 0);
  // Respiração sutil — pulsa entre 40% e 80% em 2.2s
  startBreathe(obj, LV_OPA_40, LV_OPA_80, 2200);
}

// Helper: outline pulsante nos cards (ring glow animado ao redor da borda)
static void anim_outline_opa_cb(void *obj, int32_t v) {
  lv_obj_set_style_outline_opa((lv_obj_t*)obj, v, 0);
}

static void applyRingPulse(lv_obj_t *card, uint32_t color, uint32_t periodMs = 2800) {
  lv_obj_set_style_outline_color(card, lv_color_hex(color), 0);
  lv_obj_set_style_outline_width(card, 2, 0);
  lv_obj_set_style_outline_pad(card, 0, 0);
  lv_obj_set_style_outline_opa(card, LV_OPA_0, 0);
  lv_anim_t a;
  lv_anim_init(&a);
  lv_anim_set_var(&a, card);
  lv_anim_set_values(&a, LV_OPA_0, LV_OPA_60);
  lv_anim_set_time(&a, periodMs);
  lv_anim_set_playback_time(&a, periodMs);
  lv_anim_set_repeat_count(&a, LV_ANIM_REPEAT_INFINITE);
  lv_anim_set_exec_cb(&a, anim_outline_opa_cb);
  lv_anim_start(&a);
}

static lv_obj_t* makeLabel(lv_obj_t *parent, const char *text, uint32_t color,
                            const lv_font_t *font, lv_align_t align, int x, int y) {
  lv_obj_t *l = lv_label_create(parent);
  lv_label_set_text(l, text);
  lv_obj_set_style_text_color(l, lv_color_hex(color), 0);
  if (font) lv_obj_set_style_text_font(l, font, 0);
  lv_obj_align(l, align, x, y);
  return l;
}

// ════════════════════════════════════════════════════════════════════════════════
// FASE C — Efeitos ambientes (particles, scan line, ring wave / radar ping)
// ════════════════════════════════════════════════════════════════════════════════
static void fx_anim_y_cb(void *obj, int32_t v) {
  lv_obj_set_y((lv_obj_t*)obj, v);
}
static void fx_anim_bg_opa_cb(void *obj, int32_t v) {
  lv_obj_set_style_bg_opa((lv_obj_t*)obj, v, 0);
}
static void fx_anim_border_opa_cb(void *obj, int32_t v) {
  lv_obj_set_style_border_opa((lv_obj_t*)obj, v, 0);
}
static void fx_anim_ring_size_cb(void *obj, int32_t v) {
  lv_obj_set_size((lv_obj_t*)obj, v, v);
  lv_obj_align((lv_obj_t*)obj, LV_ALIGN_CENTER, 0, 0);
}

// Particles — pontinhos flutuando no fundo (vibe HUD / estrelas)
static void spawnParticle(lv_obj_t *parent, int xPos, int yStart, uint32_t color,
                          uint32_t duration, uint32_t delay) {
  lv_obj_t *p = lv_obj_create(parent);
  int size = 2 + (rand() % 2);
  lv_obj_set_size(p, size, size);
  lv_obj_set_pos(p, xPos, yStart);
  lv_obj_set_style_bg_color(p, lv_color_hex(color), 0);
  lv_obj_set_style_bg_opa(p, LV_OPA_0, 0);
  lv_obj_set_style_border_width(p, 0, 0);
  lv_obj_set_style_radius(p, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_pad_all(p, 0, 0);
  lv_obj_remove_flag(p, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_remove_flag(p, LV_OBJ_FLAG_SCROLLABLE);

  // Drift vertical ascendente (sobe devagar, volta pro inicio)
  lv_anim_t ay;
  lv_anim_init(&ay);
  lv_anim_set_var(&ay, p);
  lv_anim_set_values(&ay, yStart, -8);
  lv_anim_set_time(&ay, duration);
  lv_anim_set_delay(&ay, delay);
  lv_anim_set_repeat_count(&ay, LV_ANIM_REPEAT_INFINITE);
  lv_anim_set_exec_cb(&ay, fx_anim_y_cb);
  lv_anim_start(&ay);

  // Opacidade pulsa (aparece, desaparece) — sincronizada com o drift
  lv_anim_t ao;
  lv_anim_init(&ao);
  lv_anim_set_var(&ao, p);
  lv_anim_set_values(&ao, LV_OPA_0, LV_OPA_40);
  lv_anim_set_time(&ao, duration / 2);
  lv_anim_set_playback_time(&ao, duration / 2);
  lv_anim_set_delay(&ao, delay);
  lv_anim_set_repeat_count(&ao, LV_ANIM_REPEAT_INFINITE);
  lv_anim_set_exec_cb(&ao, fx_anim_bg_opa_cb);
  lv_anim_start(&ao);
}

static void spawnParticleField(lv_obj_t *parent) {
  // 10 particulas com posicoes/delays/cores variados
  static const uint32_t colors[] = { COL_GRN, COL_CYN, COL_PRP, COL_GRN, COL_CYN };
  for (int i = 0; i < 10; i++) {
    int x = rand() % SCREEN_W;
    int yStart = SCREEN_H + (rand() % sh(40));
    uint32_t dur = 6000 + (rand() % 6000);
    uint32_t delay = rand() % 4000;
    uint32_t col = colors[i % 5];
    spawnParticle(parent, x, yStart, col, dur, delay);
  }
}

// Scan line — linha horizontal varrendo top->bottom (CRT / Tesla HUD)
static void buildScanLine(lv_obj_t *parent) {
  lv_obj_t *line = lv_obj_create(parent);
  lv_obj_set_size(line, SCREEN_W, 2);
  lv_obj_set_pos(line, 0, 0);
  lv_obj_set_style_bg_color(line, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_bg_opa(line, LV_OPA_20, 0);
  lv_obj_set_style_border_width(line, 0, 0);
  lv_obj_set_style_radius(line, 0, 0);
  lv_obj_set_style_pad_all(line, 0, 0);
  lv_obj_remove_flag(line, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_remove_flag(line, LV_OBJ_FLAG_SCROLLABLE);

  lv_anim_t a;
  lv_anim_init(&a);
  lv_anim_set_var(&a, line);
  lv_anim_set_values(&a, -4, SCREEN_H + 4);
  lv_anim_set_time(&a, 5000);
  lv_anim_set_repeat_count(&a, LV_ANIM_REPEAT_INFINITE);
  lv_anim_set_exec_cb(&a, fx_anim_y_cb);
  lv_anim_start(&a);
}

// Ring wave — anel expandindo a partir do arco (radar / ping)
// O "ring" e' child de um wrapper invisivel centrado em (cx, cy) com tamanho maxSize.
// Conforme o ring cresce, fx_anim_ring_size_cb realinha no centro do wrapper.
static void applyRingWave(lv_obj_t *parent, int cx, int cy, int maxSize, uint32_t color) {
  for (int i = 0; i < 2; i++) {
    lv_obj_t *wrap = lv_obj_create(parent);
    lv_obj_set_size(wrap, maxSize, maxSize);
    lv_obj_set_pos(wrap, cx - maxSize / 2, cy - maxSize / 2);
    lv_obj_set_style_bg_opa(wrap, LV_OPA_0, 0);
    lv_obj_set_style_border_width(wrap, 0, 0);
    lv_obj_set_style_pad_all(wrap, 0, 0);
    lv_obj_remove_flag(wrap, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(wrap, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *ring = lv_obj_create(wrap);
    lv_obj_set_size(ring, 12, 12);
    lv_obj_center(ring);
    lv_obj_set_style_radius(ring, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_opa(ring, LV_OPA_0, 0);
    lv_obj_set_style_border_color(ring, lv_color_hex(color), 0);
    lv_obj_set_style_border_width(ring, 2, 0);
    lv_obj_set_style_border_opa(ring, LV_OPA_60, 0);
    lv_obj_set_style_pad_all(ring, 0, 0);
    lv_obj_remove_flag(ring, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(ring, LV_OBJ_FLAG_SCROLLABLE);

    lv_anim_t as;
    lv_anim_init(&as);
    lv_anim_set_var(&as, ring);
    lv_anim_set_values(&as, 12, maxSize);
    lv_anim_set_time(&as, 2600);
    lv_anim_set_delay(&as, i * 1300);
    lv_anim_set_repeat_count(&as, LV_ANIM_REPEAT_INFINITE);
    lv_anim_set_exec_cb(&as, fx_anim_ring_size_cb);
    lv_anim_start(&as);

    lv_anim_t ao;
    lv_anim_init(&ao);
    lv_anim_set_var(&ao, ring);
    lv_anim_set_values(&ao, LV_OPA_60, LV_OPA_0);
    lv_anim_set_time(&ao, 2600);
    lv_anim_set_delay(&ao, i * 1300);
    lv_anim_set_repeat_count(&ao, LV_ANIM_REPEAT_INFINITE);
    lv_anim_set_exec_cb(&ao, fx_anim_border_opa_cb);
    lv_anim_start(&ao);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// Matrix boot splash — chuva de chars verdes + mensagens de boot (estilo terminal)
// Criado em cima do UI principal, fade out ao final ou no tap.
// ════════════════════════════════════════════════════════════════════════════════
#define MATRIX_COLS 8
static lv_obj_t *matrixScreen = nullptr;
static lv_obj_t *matrixColumns[MATRIX_COLS];
static lv_obj_t *matrixMsg = nullptr;
static lv_timer_t *matrixTimer = nullptr;
static int matrixStep = 0;

static const char* BOOT_MSGS[] = {
  "INITIALIZING...",
  "LVGL: READY",
  "TOUCH: OK",
  "CHLOROPHYLL: 98.2%",
  "> ACESSO CONCEDIDO"
};
#define MATRIX_STEPS (int)(sizeof(BOOT_MSGS) / sizeof(BOOT_MSGS[0]))

static void matrixFillColumn(lv_obj_t *col) {
  char buf[96];
  int k = 0;
  for (int j = 0; j < 10; j++) {
    // Chars imprimiveis, enviesado pra digitos e letras (mais vibe "terminal")
    char c;
    int r = rand() % 100;
    if      (r < 40) c = '0' + (rand() % 10);
    else if (r < 75) c = 'A' + (rand() % 26);
    else             c = "!@#$%&*+/\\<>:;"[rand() % 14];
    buf[k++] = c;
    buf[k++] = '\n';
  }
  buf[k] = '\0';
  lv_label_set_text(col, buf);
}

static void matrixFinish();

static void matrixTick(lv_timer_t *t) {
  // Reembaralha chars de todas as colunas
  for (int i = 0; i < MATRIX_COLS; i++) {
    if (matrixColumns[i]) matrixFillColumn(matrixColumns[i]);
  }
  // Avanca mensagem central
  matrixStep++;
  if (matrixStep < MATRIX_STEPS) {
    if (matrixMsg) lv_label_set_text(matrixMsg, BOOT_MSGS[matrixStep]);
  } else if (matrixStep >= MATRIX_STEPS + 1) {
    matrixFinish();
  }
}

static void buildMatrixSplash() {
  matrixStep = 0;
  matrixScreen = lv_obj_create(lv_scr_act());
  lv_obj_set_size(matrixScreen, SCREEN_W, SCREEN_H);
  lv_obj_set_pos(matrixScreen, 0, 0);
  lv_obj_set_style_bg_color(matrixScreen, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_opa(matrixScreen, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(matrixScreen, 0, 0);
  lv_obj_set_style_radius(matrixScreen, 0, 0);
  lv_obj_set_style_pad_all(matrixScreen, 0, 0);
  lv_obj_clear_flag(matrixScreen, LV_OBJ_FLAG_SCROLLABLE);

  // Colunas de chars caindo
  int colW = SCREEN_W / MATRIX_COLS;
  for (int i = 0; i < MATRIX_COLS; i++) {
    lv_obj_t *col = lv_label_create(matrixScreen);
    matrixColumns[i] = col;
    matrixFillColumn(col);
    lv_obj_set_style_text_font(col, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(col, lv_color_hex(0x4ADE80), 0);
    lv_obj_set_style_text_opa(col, LV_OPA_80, 0);
    lv_obj_set_style_text_line_space(col, 2, 0);
    int startY = -(SCREEN_H / 2) - (rand() % (SCREEN_H / 2));
    lv_obj_set_pos(col, i * colW + 2, startY);

    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, col);
    lv_anim_set_values(&a, startY, SCREEN_H + 40);
    lv_anim_set_time(&a, 1800 + (rand() % 1800));
    lv_anim_set_repeat_count(&a, LV_ANIM_REPEAT_INFINITE);
    lv_anim_set_exec_cb(&a, fx_anim_y_cb);
    lv_anim_start(&a);
  }

  // Caixa central com mensagem (background preto pra isolar do rain)
  lv_obj_t *msgBg = lv_obj_create(matrixScreen);
  lv_obj_set_size(msgBg, SCREEN_W - sw(20), sh(48));
  lv_obj_align(msgBg, LV_ALIGN_CENTER, 0, 0);
  lv_obj_set_style_bg_color(msgBg, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_opa(msgBg, LV_OPA_80, 0);
  lv_obj_set_style_border_color(msgBg, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_border_width(msgBg, 1, 0);
  lv_obj_set_style_radius(msgBg, 4, 0);
  lv_obj_set_style_pad_all(msgBg, 0, 0);
  lv_obj_remove_flag(msgBg, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_remove_flag(msgBg, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_shadow_color(msgBg, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_shadow_width(msgBg, 16, 0);
  lv_obj_set_style_shadow_opa(msgBg, LV_OPA_60, 0);

  matrixMsg = lv_label_create(msgBg);
  lv_label_set_text(matrixMsg, BOOT_MSGS[0]);
  lv_obj_set_style_text_font(matrixMsg, FONT_BODY, 0);
  lv_obj_set_style_text_color(matrixMsg, lv_color_hex(COL_GRN), 0);
  lv_obj_center(matrixMsg);

  // Tap em qualquer lugar pula
  lv_obj_add_flag(matrixScreen, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(matrixScreen, [](lv_event_t *e) {
    matrixFinish();
  }, LV_EVENT_CLICKED, NULL);

  matrixTimer = lv_timer_create(matrixTick, 650, NULL);
}

static void matrixFinish() {
  if (!matrixScreen) return;
  if (matrixTimer) { lv_timer_del(matrixTimer); matrixTimer = nullptr; }

  // Fade out via opacidade do container inteiro
  lv_anim_t a;
  lv_anim_init(&a);
  lv_anim_set_var(&a, matrixScreen);
  lv_anim_set_values(&a, LV_OPA_COVER, LV_OPA_0);
  lv_anim_set_time(&a, 450);
  lv_anim_set_exec_cb(&a, [](void *obj, int32_t v) {
    lv_obj_set_style_opa((lv_obj_t*)obj, v, 0);
  });
  lv_anim_set_completed_cb(&a, [](lv_anim_t *an) {
    if (matrixScreen) {
      lv_obj_del(matrixScreen);
      matrixScreen = nullptr;
      for (int i = 0; i < MATRIX_COLS; i++) matrixColumns[i] = nullptr;
      matrixMsg = nullptr;
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

  // Area scrollavel com os 5 campos
  lv_obj_t *list = lv_obj_create(configModal);
  lv_obj_set_size(list, SCREEN_W - sw(12), sh(130));
  lv_obj_align(list, LV_ALIGN_TOP_MID, 0, sh(24));
  lv_obj_set_style_bg_opa(list, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(list, 0, 0);
  lv_obj_set_style_pad_all(list, sw(2), 0);
  lv_obj_set_flex_flow(list, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(list, sh(3), 0);

  auto addField = [&](const char *label, const char *initVal, lv_obj_t **out,
                       bool pwd = false, bool numeric = false) {
    makeLabel(list, label, COL_DIM, FONT_CAPTION, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_t *ta = lv_textarea_create(list);
    lv_obj_set_width(ta, lv_pct(100));
    lv_obj_set_height(ta, sh(22));
    lv_textarea_set_one_line(ta, true);
    lv_textarea_set_text(ta, initVal ? initVal : "");
    if (pwd)     lv_textarea_set_password_mode(ta, true);
    if (numeric) lv_textarea_set_accepted_chars(ta, "0123456789");
    lv_obj_set_style_text_font(ta, FONT_BODY, 0);
    lv_obj_set_style_bg_color(ta, lv_color_hex(COL_CARD), 0);
    lv_obj_set_style_border_color(ta, lv_color_hex(COL_BORDER), 0);
    lv_obj_set_style_border_width(ta, 1, 0);
    lv_obj_add_event_cb(ta, cfgFocusCb, LV_EVENT_CLICKED, NULL);
    *out = ta;
  };

  addField("WiFi SSID",      WIFI_SSID,    &taSsid);

  // Botao SCAN — dispara busca assincrona, nao trava LVGL
  lv_obj_t *btnScan = lv_btn_create(list);
  lv_obj_set_width(btnScan, lv_pct(100));
  lv_obj_set_height(btnScan, sh(22));
  lv_obj_set_style_bg_color(btnScan, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_border_color(btnScan, lv_color_hex(COL_CYN), 0);
  lv_obj_set_style_border_width(btnScan, 1, 0);
  lv_obj_add_event_cb(btnScan, scanStartCb, LV_EVENT_CLICKED, NULL);
  makeLabel(btnScan, "Buscar redes WiFi", COL_CYN, FONT_CAPTION, LV_ALIGN_CENTER, 0, 0);

  addField("WiFi Senha",     WIFI_PASS,    &taPass,  true);
  addField("Server URL",     SERVER_URL,   &taUrl);
  addField("Device Token",   DEVICE_TOKEN, &taToken);
  char tentStr[12]; snprintf(tentStr, sizeof(tentStr), "%d", TENT_ID);
  addField("Tent ID",        tentStr,      &taTent,  false, true);

  // Botoes no rodape
  int btnY = sh(160);
  lv_obj_t *btnCancel = lv_btn_create(configModal);
  lv_obj_set_size(btnCancel, sw(90), sh(28));
  lv_obj_align(btnCancel, LV_ALIGN_BOTTOM_LEFT, sw(6), -sh(6));
  lv_obj_set_style_bg_color(btnCancel, lv_color_hex(COL_CARD), 0);
  lv_obj_add_event_cb(btnCancel, cfgCancelCb, LV_EVENT_CLICKED, NULL);
  makeLabel(btnCancel, "Cancelar", COL_TEXT, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  lv_obj_t *btnReset = lv_btn_create(configModal);
  lv_obj_set_size(btnReset, sw(70), sh(28));
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
  makeLabel(btnReset, "Reset WiFi", COL_RED, FONT_CAPTION, LV_ALIGN_CENTER, 0, 0);

  lv_obj_t *btnSave = lv_btn_create(configModal);
  lv_obj_set_size(btnSave, sw(100), sh(28));
  lv_obj_align(btnSave, LV_ALIGN_BOTTOM_RIGHT, -sw(6), -sh(6));
  lv_obj_set_style_bg_color(btnSave, lv_color_hex(COL_GRN), 0);
  applyBloom(btnSave, COL_GRN);
  lv_obj_add_event_cb(btnSave, cfgSaveCb, LV_EVENT_CLICKED, NULL);
  makeLabel(btnSave, "Salvar + Reboot", COL_TEXT, FONT_BODY, LV_ALIGN_CENTER, 0, 0);
  (void)btnY;

  // Keyboard compartilhado — esconde ao pressionar OK ou Cancelar
  kbCfg = lv_keyboard_create(configModal);
  lv_obj_set_size(kbCfg, SCREEN_W, sh(110));
  lv_obj_align(kbCfg, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_add_flag(kbCfg, LV_OBJ_FLAG_HIDDEN);
  lv_obj_set_style_text_font(kbCfg, FONT_BODY, 0);
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
<html lang="pt-br"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cultivo Setup</title><style>
*{box-sizing:border-box}
body{background:#0B0F14;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;
  max-width:460px;margin:0 auto;padding:24px}
h1{color:#4ADE80;text-align:center;font-weight:300;letter-spacing:3px;margin:20px 0 28px;
  text-shadow:0 0 12px rgba(74,222,128,.4)}
label{display:block;margin-top:18px;color:#6B7280;font-size:11px;
  text-transform:uppercase;letter-spacing:1px}
input,select{width:100%;padding:12px;background:#111827;border:1px solid #1F2937;
  color:#fff;border-radius:8px;font-size:16px;margin-top:6px;outline:none;transition:border .2s}
input:focus,select:focus{border-color:#4ADE80}
button{width:100%;padding:14px;background:#4ADE80;color:#0B0F14;border:none;
  border-radius:8px;font-size:14px;font-weight:700;margin-top:28px;cursor:pointer;
  letter-spacing:1px;text-transform:uppercase;box-shadow:0 0 16px rgba(74,222,128,.3)}
button:active{transform:translateY(1px)}
.status{margin-top:14px;color:#6B7280;font-size:12px;text-align:center}
.logo{text-align:center;color:#4ADE80;font-size:32px;margin-bottom:-6px}
</style></head><body>
<div class="logo">&#127793;</div>
<h1>CULTIVO SETUP</h1>
<form action="/save" method="POST">
<label>Rede WiFi</label>
<select name="ssid" id="ssid"><option>Escaneando...</option></select>
<label>Senha WiFi</label>
<input type="password" name="pass" autocomplete="off">
<label>Server URL</label>
<input type="text" name="url" value="https://cultivo.x.andy.plus">
<label>Device Token</label>
<input type="text" name="token" autocomplete="off">
<label>Tent ID</label>
<input type="number" name="tent" value="1" min="1">
<button type="submit">Salvar e Reiniciar</button>
<div class="status" id="status">Escaneando redes WiFi...</div>
</form>
<p style="color:#475569;font-size:11px;text-align:center;margin-top:20px"><a href="/update" style="color:#475569">recovery: atualizar firmware</a></p>
<script>
fetch('/scan').then(r=>r.json()).then(d=>{
  const s=document.getElementById('ssid');s.innerHTML='';
  (d.networks||[]).forEach(n=>{const o=document.createElement('option');
    o.textContent=n;s.appendChild(o)});
  document.getElementById('status').textContent=(d.networks||[]).length+' redes encontradas';
}).catch(()=>{document.getElementById('status').textContent='Erro ao escanear'});
</script></body></html>)HTML";

static const char PORTAL_DONE_HTML[] PROGMEM = R"HTML(<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="3">
<style>body{background:#0B0F14;color:#4ADE80;font-family:sans-serif;
text-align:center;padding:80px 20px}h1{letter-spacing:3px}</style></head><body>
<h1>SALVO!</h1><p style="color:#6B7280">Reiniciando...</p></body></html>)HTML";

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
static const char PORTAL_UPDATE_HTML[] PROGMEM = R"HTML(
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cultivo Update</title>
<style>body{background:#0b0f14;color:#e2e8f0;font-family:system-ui;padding:20px;max-width:480px;margin:0 auto}
h1{color:#22c55e}button{background:#22c55e;color:#000;border:0;padding:12px 20px;border-radius:8px;font-weight:700;width:100%;margin-top:12px}
input[type=file]{color:#e2e8f0;width:100%;padding:8px;border:1px solid #475569;border-radius:6px;background:#1e293b}
p{color:#94a3b8;font-size:14px}</style></head><body>
<h1>Firmware Update</h1>
<p>Selecione o arquivo <code>firmware.bin</code> (tipicamente em <code>.pio/build/real/firmware.bin</code>).</p>
<form method="POST" enctype="multipart/form-data" action="/update"><input type="file" name="fw" accept=".bin" required><button type="submit">Enviar</button></form>
<p><a href="/" style="color:#22c55e">← Voltar</a></p></body></html>
)HTML";

static void handlePortalUpdateGet() {
  apServer->send_P(200, "text/html", PORTAL_UPDATE_HTML);
}

static void handlePortalUpdateDone() {
  bool ok = !Update.hasError();
  apServer->send(200, "text/html",
    ok ? "<h1 style='color:#22c55e'>Update OK — rebootando...</h1>"
       : "<h1 style='color:#ef4444'>Update FALHOU</h1>");
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
// Aba HOME — estilo Ebike demo: arc gigante (TEMP) + coluna de mini-cards
// Layout responsivo via sw()/sh() — escala proporcional no hardware real
// ════════════════════════════════════════════════════════════════════════════════
static void buildHome(lv_obj_t *tab) {
  lv_obj_set_style_pad_all(tab, 0, 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_bg_color(tab, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_opa(tab, LV_OPA_COVER, 0);

  // ═══ Header compacto ═══
  lv_obj_t *hdrIcon = lv_img_create(tab);
  lv_img_set_src(hdrIcon, &ic_sprout);
  lv_obj_set_style_img_recolor(hdrIcon, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_img_recolor_opa(hdrIcon, LV_OPA_COVER, 0);
  lv_obj_align(hdrIcon, LV_ALIGN_TOP_LEFT, sw(4), sh(2));

  lblTitle = makeLabel(tab, TENT_NAME, COL_TEXT, FONT_TITLE, LV_ALIGN_TOP_LEFT, sw(38), sh(4));

  char subBuf[48];
  snprintf(subBuf, sizeof(subBuf), "Sem %d/%d  %s", semana, totalSem, FASE);
  lblSub = makeLabel(tab, subBuf, COL_PRP, FONT_CAPTION, LV_ALIGN_TOP_LEFT, sw(38), sh(22));

  lv_obj_t *wifiIcon = lv_img_create(tab);
  lv_img_set_src(wifiIcon, wifiOk ? &ic_wifi : &ic_wifi_off);
  lv_obj_set_style_img_recolor(wifiIcon, lv_color_hex(wifiOk ? COL_GRN : COL_DIM), 0);
  lv_obj_set_style_img_recolor_opa(wifiIcon, LV_OPA_COVER, 0);
  lv_obj_align(wifiIcon, LV_ALIGN_TOP_RIGHT, -sw(4), sh(4));
  lblWifi = wifiIcon;

  // Gear icon (ao lado do wifi) — abre modal de configuracao
  // Usa lv_font_montserrat_14 porque LV_SYMBOL_SETTINGS e' glyph FontAwesome
  // (Manrope nao tem essa faixa Unicode)
  lv_obj_t *btnCfg = lv_label_create(tab);
  lv_label_set_text(btnCfg, LV_SYMBOL_SETTINGS);
  lv_obj_set_style_text_color(btnCfg, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(btnCfg, &lv_font_montserrat_14, 0);
  lv_obj_align(btnCfg, LV_ALIGN_TOP_RIGHT, -sw(36), sh(6));
  lv_obj_add_flag(btnCfg, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_ext_click_area(btnCfg, sw(12));
  lv_obj_add_event_cb(btnCfg, [](lv_event_t *e) { openConfigModal(); }, LV_EVENT_CLICKED, NULL);

  // ═══ Corpo: arc gigante à esquerda + 3 mini-cards à direita ═══
  int bodyY = sh(42);
  int bodyH = TAB_H - bodyY - sh(4);
  int halfW = SCREEN_W / 2;

  // ─── ARC TEMP (estilo velocímetro Ebike) ────────────────────────────
  int arcSize = (bodyH < halfW - sw(8)) ? bodyH : halfW - sw(8);
  arcTemp = lv_arc_create(tab);
  lv_obj_set_size(arcTemp, arcSize, arcSize);
  lv_obj_set_pos(arcTemp, (halfW - arcSize) / 2, bodyY + (bodyH - arcSize) / 2);
  lv_arc_set_range(arcTemp, 0, 40);
  lv_arc_set_value(arcTemp, (int)tempC);
  lv_arc_set_bg_angles(arcTemp, 135, 45);
  lv_arc_set_rotation(arcTemp, 0);
  lv_obj_remove_style(arcTemp, NULL, LV_PART_KNOB);
  lv_obj_clear_flag(arcTemp, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_style_arc_width(arcTemp, sw(8),  LV_PART_MAIN);
  lv_obj_set_style_arc_color(arcTemp, lv_color_hex(0x1F2937), LV_PART_MAIN);
  lv_obj_set_style_arc_opa(arcTemp, LV_OPA_80, LV_PART_MAIN);
  lv_obj_set_style_arc_width(arcTemp, sw(10), LV_PART_INDICATOR);
  lv_obj_set_style_arc_color(arcTemp, lv_color_hex(COL_GRN), LV_PART_INDICATOR);

  lv_obj_t *lblTempHdr = lv_label_create(arcTemp);
  lv_label_set_text(lblTempHdr, "TEMP");
  lv_obj_set_style_text_color(lblTempHdr, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(lblTempHdr, FONT_CAPTION, 0);
  lv_obj_align(lblTempHdr, LV_ALIGN_CENTER, 0, -arcSize / 4);

  lblTemp = lv_label_create(arcTemp);
  lv_label_set_text(lblTemp, "--");
  lv_obj_set_style_text_color(lblTemp, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_text_font(lblTemp, FONT_VALUE, 0);
  lv_obj_align(lblTemp, LV_ALIGN_CENTER, 0, 0);
  applyBloom(lblTemp, COL_GRN);
  // Arc TEMP tambem ganha bloom no stroke (efeito velocimetro "vivo")
  lv_obj_set_style_shadow_color(arcTemp, lv_color_hex(COL_GRN), LV_PART_INDICATOR);
  lv_obj_set_style_shadow_width(arcTemp, 16, LV_PART_INDICATOR);
  lv_obj_set_style_shadow_opa(arcTemp, LV_OPA_60, LV_PART_INDICATOR);

  // Ring wave — radar ping emanando do centro do arco (duas ondas offset)
  int arcCx = (halfW - arcSize) / 2 + arcSize / 2;
  int arcCy = bodyY + (bodyH - arcSize) / 2 + arcSize / 2;
  // Ring wave desabilitado temporariamente — o wrapper extrapolava TAB_H
  // e parecia confundir o hit-test do LVGL v9 sobre a navbar.
  // applyRingWave(tab, arcCx, arcCy, (int)(arcSize * 1.35f), COL_GRN);

  lv_obj_t *lblTempUnit = lv_label_create(arcTemp);
  lv_label_set_text(lblTempUnit, "°C");
  lv_obj_set_style_text_color(lblTempUnit, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(lblTempUnit, FONT_CAPTION, 0);
  lv_obj_align(lblTempUnit, LV_ALIGN_CENTER, 0, arcSize / 4);

  // ─── 3 mini-cards à direita (UMIDADE, pH, EC) ─────────────────────────
  int rightX = halfW + sw(2);
  int cardW = SCREEN_W - rightX - sw(4);
  int cardGap = sh(4);
  int cardH = (bodyH - 2 * cardGap) / 3;

  auto makeMiniCard = [&](int yOffset, const char *label, const char *initVal,
                          uint32_t color, const lv_img_dsc_t *icon,
                          lv_obj_t **sparkOut, lv_chart_series_t **serOut) -> lv_obj_t* {
    lv_obj_t *c = makeCard(tab, rightX, bodyY + yOffset, cardW, cardH);
    lv_obj_set_style_pad_all(c, sw(4), 0);
    applyRingPulse(c, color);  // outline colorido pulsando — vibe monitor cardiaco

    lv_obj_t *ico = lv_img_create(c);
    lv_img_set_src(ico, icon);
    lv_obj_set_style_img_recolor(ico, lv_color_hex(color), 0);
    lv_obj_set_style_img_recolor_opa(ico, LV_OPA_COVER, 0);
    lv_obj_align(ico, LV_ALIGN_LEFT_MID, 0, 0);

    lv_obj_t *lb = lv_label_create(c);
    lv_label_set_text(lb, label);
    lv_obj_set_style_text_color(lb, lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_text_font(lb, FONT_CAPTION, 0);
    lv_obj_align(lb, LV_ALIGN_TOP_RIGHT, 0, 0);

    int chartW = cardW - sw(44);
    int chartH = sh(14);
    lv_obj_t *ch = lv_chart_create(c);
    lv_obj_set_size(ch, chartW, chartH);
    lv_obj_align(ch, LV_ALIGN_RIGHT_MID, 0, -sh(1));
    lv_chart_set_type(ch, LV_CHART_TYPE_LINE);
    lv_chart_set_point_count(ch, 20);
    lv_chart_set_div_line_count(ch, 0, 0);
    // Aura translucida atras da linha (da profundidade ao sparkline)
    lv_obj_set_style_bg_color(ch, lv_color_hex(color), 0);
    lv_obj_set_style_bg_opa(ch, LV_OPA_10, 0);
    lv_obj_set_style_radius(ch, 4, 0);
    lv_obj_set_style_border_width(ch, 0, 0);
    lv_obj_set_style_width(ch,  0, LV_PART_INDICATOR);   // v9: size separado em w/h
    lv_obj_set_style_height(ch, 0, LV_PART_INDICATOR);
    lv_obj_set_style_line_width(ch, sw(2), LV_PART_ITEMS);
    lv_obj_set_style_line_color(ch, lv_color_hex(color), LV_PART_ITEMS);
    lv_obj_set_style_pad_all(ch, 0, 0);
    *serOut = lv_chart_add_series(ch, lv_color_hex(color), LV_CHART_AXIS_PRIMARY_Y);
    *sparkOut = ch;

    lv_obj_t *v = lv_label_create(c);
    lv_label_set_text(v, initVal);
    lv_obj_set_style_text_color(v, lv_color_hex(color), 0);
    lv_obj_set_style_text_font(v, FONT_TITLE, 0);
    lv_obj_align(v, LV_ALIGN_BOTTOM_RIGHT, 0, sh(2));
    applyBloom(v, color);
    return v;
  };

  lblRh = makeMiniCard(0,                     "UMIDADE", "--", COL_CYN, &ic_droplet,   &sparkRh, &serRhS);
  lblPh = makeMiniCard(cardH + cardGap,       "pH",      "--", COL_GRN, &ic_beaker,    &sparkPh, &serPhS);
  lblEc = makeMiniCard((cardH + cardGap) * 2, "EC",      "--", COL_PRP, &ic_test_tube, &sparkEc, &serEcS);

  // Tap no arco TEMP ou no card UMIDADE -> forca refresh Tuya no servidor
  // pH/EC ficam de fora (nao vem do Tuya — sao entrada manual).
  auto refreshTapCb = [](lv_event_t *e) {
    refreshPending = true;
    // Flash visual imediato — realca shadow do target em 180ms e volta
    lv_obj_t *t = (lv_obj_t*)lv_event_get_target(e);
    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, t);
    lv_anim_set_values(&a, LV_OPA_COVER, LV_OPA_60);
    lv_anim_set_time(&a, 180);
    lv_anim_set_playback_time(&a, 180);
    lv_anim_set_exec_cb(&a, [](void *obj, int32_t v) {
      lv_obj_set_style_shadow_opa((lv_obj_t*)obj, v, 0);
    });
    lv_anim_start(&a);
  };
  lv_obj_add_flag(arcTemp, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(arcTemp, refreshTapCb, LV_EVENT_CLICKED, NULL);
  lv_obj_t *cardRh = lv_obj_get_parent(lblRh);
  lv_obj_add_event_cb(cardRh, refreshTapCb, LV_EVENT_CLICKED, NULL);

  // Inicializa sparklines com valores iniciais + ajusta range
  lv_chart_set_range(sparkRh, LV_CHART_AXIS_PRIMARY_Y, 0, 100);
  lv_chart_set_range(sparkPh, LV_CHART_AXIS_PRIMARY_Y, 40, 90);
  lv_chart_set_range(sparkEc, LV_CHART_AXIS_PRIMARY_Y, 0, 40);
  for (int i = 0; i < 20; i++) {
    lv_chart_set_next_value(sparkRh, serRhS, (int32_t)rh);
    lv_chart_set_next_value(sparkPh, serPhS, (int32_t)(phv * 10));
    lv_chart_set_next_value(sparkEc, serEcS, (int32_t)(ecv * 10));
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// Timer de pulso: anima sparklines + pulsa o arc TEMP (efeito ECG/monitor)
// ════════════════════════════════════════════════════════════════════════════════
static void pulseTimerCb(lv_timer_t *t) {
  // Variação senoidal pequena em torno do valor atual (ilusão de "vivo")
  static uint32_t tick = 0;
  tick++;
  float wave = sinf(tick * 0.4f);        // -1..1
  float jitter = ((rand() % 100) - 50) / 100.0f;  // -0.5..0.5

  if (sparkRh && serRhS) {
    int32_t v = (int32_t)(rh + wave * 1.5f + jitter);
    lv_chart_set_next_value(sparkRh, serRhS, v);
  }
  if (sparkPh && serPhS) {
    int32_t v = (int32_t)((phv + wave * 0.1f + jitter * 0.1f) * 10);
    lv_chart_set_next_value(sparkPh, serPhS, v);
  }
  if (sparkEc && serEcS) {
    int32_t v = (int32_t)((ecv + wave * 0.1f + jitter * 0.05f) * 10);
    lv_chart_set_next_value(sparkEc, serEcS, v);
  }
}

static void startPulseTimer() {
  if (pulseTimer) return;
  pulseTimer = lv_timer_create(pulseTimerCb, 300, NULL);  // 300ms = ~3Hz de pulso
}

// ════════════════════════════════════════════════════════════════════════════════
// Aba LUX / PPFD — toggle de unidade + ajuste via +/- + salvar no backend
// ════════════════════════════════════════════════════════════════════════════════
static bool postPpfd(int ppfd);  // fwd

static void refreshLuxDisplay() {
  if (!lblLuxValue || !lblLuxUnit) return;
  char buf[16];
  if (luxMode == 0) {
    snprintf(buf, sizeof(buf), "%d", targetPpfd);
    lv_label_set_text(lblLuxValue, buf);
    lv_label_set_text(lblLuxUnit, "umol/s.m²");
    lv_obj_set_style_text_color(lblLuxValue, lv_color_hex(COL_GRN), 0);
  } else {
    snprintf(buf, sizeof(buf), "%d", targetPpfd * LUX_PER_PPFD);
    lv_label_set_text(lblLuxValue, buf);
    lv_label_set_text(lblLuxUnit, "LUX");
    lv_obj_set_style_text_color(lblLuxValue, lv_color_hex(COL_YEL), 0);
  }
  // Toggle visual: destaca o modo ativo
  if (btnModePpfd && btnModeLux) {
    lv_obj_set_style_bg_color(btnModePpfd, lv_color_hex(luxMode==0 ? COL_GRN  : COL_CARD), 0);
    lv_obj_set_style_bg_color(btnModeLux,  lv_color_hex(luxMode==1 ? COL_YEL  : COL_CARD), 0);
  }
  if (luxBar) lv_bar_set_value(luxBar, targetPpfd, LV_ANIM_ON);
}

static void luxStepCb(lv_event_t *e) {
  int delta = (int)(intptr_t)lv_event_get_user_data(e);
  targetPpfd += delta;
  if (targetPpfd < 0)    targetPpfd = 0;
  if (targetPpfd > 2000) targetPpfd = 2000;
  refreshLuxDisplay();
}

static void luxModeCb(lv_event_t *e) {
  luxMode = (int)(intptr_t)lv_event_get_user_data(e);
  refreshLuxDisplay();
}

static void luxSaveCb(lv_event_t *e) {
  if (postPpfd(targetPpfd)) {
    currentPpfd = targetPpfd;
    currentLux  = targetPpfd * LUX_PER_PPFD;
  }
}

static void buildLux(lv_obj_t *tab) {
  lv_obj_set_style_pad_all(tab, sw(6), 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_bg_color(tab, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_opa(tab, LV_OPA_COVER, 0);

  // Header: lampada + titulo
  lv_obj_t *iconBulb = lv_img_create(tab);
  lv_img_set_src(iconBulb, &ic_lightbulb);
  lv_obj_set_style_img_recolor(iconBulb, lv_color_hex(COL_YEL), 0);
  lv_obj_set_style_img_recolor_opa(iconBulb, LV_OPA_COVER, 0);
  lv_obj_align(iconBulb, LV_ALIGN_TOP_LEFT, sw(4), sh(2));
  makeLabel(tab, "LUX / PPFD", COL_TEXT, FONT_TITLE, LV_ALIGN_TOP_LEFT, sw(38), sh(4));

  // Toggle PPFD/LUX (2 botoes no topo direito)
  int togW = sw(52), togH = sh(20);
  btnModePpfd = lv_btn_create(tab);
  lv_obj_set_size(btnModePpfd, togW, togH);
  lv_obj_align(btnModePpfd, LV_ALIGN_TOP_RIGHT, -togW - sw(4), sh(4));
  lv_obj_set_style_radius(btnModePpfd, 6, 0);
  lv_obj_add_event_cb(btnModePpfd, luxModeCb, LV_EVENT_CLICKED, (void*)(intptr_t)0);
  makeLabel(btnModePpfd, "PPFD", COL_TEXT, FONT_CAPTION, LV_ALIGN_CENTER, 0, 0);

  btnModeLux = lv_btn_create(tab);
  lv_obj_set_size(btnModeLux, togW, togH);
  lv_obj_align(btnModeLux, LV_ALIGN_TOP_RIGHT, -sw(4), sh(4));
  lv_obj_set_style_radius(btnModeLux, 6, 0);
  lv_obj_add_event_cb(btnModeLux, luxModeCb, LV_EVENT_CLICKED, (void*)(intptr_t)1);
  makeLabel(btnModeLux, "LUX", COL_TEXT, FONT_CAPTION, LV_ALIGN_CENTER, 0, 0);

  // Valor grande centralizado
  int valueY = sh(48);
  lblLuxValue = lv_label_create(tab);
  lv_label_set_text(lblLuxValue, "0");
  lv_obj_set_style_text_font(lblLuxValue, FONT_VALUE, 0);
  lv_obj_set_style_text_color(lblLuxValue, lv_color_hex(COL_GRN), 0);
  lv_obj_align(lblLuxValue, LV_ALIGN_TOP_MID, 0, valueY);
  applyBloom(lblLuxValue, COL_GRN);

  lblLuxUnit = lv_label_create(tab);
  lv_label_set_text(lblLuxUnit, "umol/s.m²");
  lv_obj_set_style_text_font(lblLuxUnit, FONT_CAPTION, 0);
  lv_obj_set_style_text_color(lblLuxUnit, lv_color_hex(COL_DIM), 0);
  lv_obj_align(lblLuxUnit, LV_ALIGN_TOP_MID, 0, valueY + sh(40));

  // Linha com botoes - / +
  int ctlY = valueY + sh(60);
  int btnSize = sh(38);
  lv_obj_t *btnMinus = lv_btn_create(tab);
  lv_obj_set_size(btnMinus, btnSize, btnSize);
  lv_obj_align(btnMinus, LV_ALIGN_TOP_MID, -sw(60), ctlY);
  lv_obj_set_style_radius(btnMinus, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_color(btnMinus, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_border_color(btnMinus, lv_color_hex(COL_RED), 0);
  lv_obj_set_style_border_width(btnMinus, 2, 0);
  lv_obj_add_event_cb(btnMinus, luxStepCb, LV_EVENT_CLICKED, (void*)(intptr_t)(-STEP_PPFD));
  lv_obj_add_event_cb(btnMinus, luxStepCb, LV_EVENT_LONG_PRESSED_REPEAT, (void*)(intptr_t)(-STEP_PPFD));
  makeLabel(btnMinus, "-", COL_RED, FONT_VALUE, LV_ALIGN_CENTER, 0, -sh(4));

  lv_obj_t *btnPlus = lv_btn_create(tab);
  lv_obj_set_size(btnPlus, btnSize, btnSize);
  lv_obj_align(btnPlus, LV_ALIGN_TOP_MID, sw(60), ctlY);
  lv_obj_set_style_radius(btnPlus, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_color(btnPlus, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_border_color(btnPlus, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_border_width(btnPlus, 2, 0);
  lv_obj_add_event_cb(btnPlus, luxStepCb, LV_EVENT_CLICKED, (void*)(intptr_t)(+STEP_PPFD));
  lv_obj_add_event_cb(btnPlus, luxStepCb, LV_EVENT_LONG_PRESSED_REPEAT, (void*)(intptr_t)(+STEP_PPFD));
  makeLabel(btnPlus, "+", COL_GRN, FONT_VALUE, LV_ALIGN_CENTER, 0, -sh(4));

  // Botao SALVAR
  lv_obj_t *btnSave = lv_btn_create(tab);
  lv_obj_set_size(btnSave, sw(120), sh(24));
  lv_obj_align(btnSave, LV_ALIGN_TOP_MID, 0, ctlY + btnSize + sh(6));
  lv_obj_set_style_bg_color(btnSave, lv_color_hex(COL_GRN), 0);
  applyBloom(btnSave, COL_GRN);
  lv_obj_add_event_cb(btnSave, luxSaveCb, LV_EVENT_CLICKED, NULL);
  makeLabel(btnSave, "SALVAR", COL_TEXT, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  // Barra visual (0 a 1500 PPFD)
  int barY = TAB_H - sh(18);
  luxBar = lv_bar_create(tab);
  lv_obj_set_size(luxBar, SCREEN_W - sw(16), sh(8));
  lv_obj_set_pos(luxBar, sw(8), barY);
  lv_bar_set_range(luxBar, 0, 1500);
  lv_obj_set_style_bg_color(luxBar, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_bg_color(luxBar, lv_color_hex(COL_GRN), LV_PART_INDICATOR);
  lv_obj_set_style_shadow_color(luxBar, lv_color_hex(COL_GRN), LV_PART_INDICATOR);
  lv_obj_set_style_shadow_width(luxBar, 12, LV_PART_INDICATOR);
  lv_obj_set_style_shadow_opa(luxBar, LV_OPA_60, LV_PART_INDICATOR);

  refreshLuxDisplay();
}

// ════════════════════════════════════════════════════════════════════════════════
// Aba pH/EC — dois campos + keyboard numerico nativo + salvar
// ════════════════════════════════════════════════════════════════════════════════
static void postReading(float newPh, float newEc);  // fwd
static void refreshHomeValues();                    // fwd

static void updatePhEcHighlights() {
  lv_obj_set_style_border_color(taPh, lv_color_hex(activePhEcField==0 ? COL_GRN : COL_BORDER), 0);
  lv_obj_set_style_border_color(taEc, lv_color_hex(activePhEcField==1 ? COL_CYN : COL_BORDER), 0);
  lv_obj_set_style_border_width(taPh, 2, 0);
  lv_obj_set_style_border_width(taEc, 2, 0);
}

static void phEcFocusCb(lv_event_t *e) {
  lv_obj_t *ta = (lv_obj_t*)lv_event_get_target(e);
  activePhEcField = (ta == taPh) ? 0 : 1;
  lv_keyboard_set_textarea(kbNumero, ta);
  updatePhEcHighlights();
}

static void phEcSalvarCb(lv_event_t *e) {
  const char *sPh = lv_textarea_get_text(taPh);
  const char *sEc = lv_textarea_get_text(taEc);
  float newPh = atof(sPh);
  float newEc = atof(sEc);
  if (strlen(sPh)) phv = newPh;
  if (strlen(sEc)) ecv = newEc;
  postReading(newPh, newEc);
  refreshHomeValues();
  lv_textarea_set_text(taPh, "");
  lv_textarea_set_text(taEc, "");

  lv_obj_t *msg = lv_msgbox_create(NULL);
  lv_msgbox_add_title(msg, "Medicao salva");
  lv_msgbox_add_text(msg, "pH/EC registrados.");
  lv_obj_center(msg);
  lv_timer_t *t = lv_timer_create([](lv_timer_t *t) {
    lv_obj_t *m = (lv_obj_t*)lv_timer_get_user_data(t);
    lv_msgbox_close(m);
    lv_timer_delete(t);
  }, 1500, msg);
  (void)t;
}

static void buildPhEc(lv_obj_t *tab) {
  lv_obj_set_style_pad_all(tab, sw(6), 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);

  makeLabel(tab, "MEDICAO pH / EC", COL_TEXT, FONT_BODY, LV_ALIGN_TOP_MID, 0, 0);

  int fieldW = (SCREEN_W - sw(24)) / 2;
  int fieldH = sh(38);

  taPh = lv_textarea_create(tab);
  lv_obj_set_size(taPh, fieldW, fieldH);
  lv_obj_set_pos(taPh, sw(6), sh(18));
  lv_textarea_set_accepted_chars(taPh, "0123456789.");
  lv_textarea_set_max_length(taPh, 5);
  lv_textarea_set_one_line(taPh, true);
  lv_textarea_set_placeholder_text(taPh, "pH");
  lv_obj_set_style_bg_color(taPh, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_text_color(taPh, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_text_font(taPh, FONT_TITLE, 0);
  lv_obj_add_event_cb(taPh, phEcFocusCb, LV_EVENT_CLICKED, NULL);

  taEc = lv_textarea_create(tab);
  lv_obj_set_size(taEc, fieldW, fieldH);
  lv_obj_set_pos(taEc, sw(12) + fieldW, sh(18));
  lv_textarea_set_accepted_chars(taEc, "0123456789.");
  lv_textarea_set_max_length(taEc, 5);
  lv_textarea_set_one_line(taEc, true);
  lv_textarea_set_placeholder_text(taEc, "EC");
  lv_obj_set_style_bg_color(taEc, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_text_color(taEc, lv_color_hex(COL_CYN), 0);
  lv_obj_set_style_text_font(taEc, FONT_TITLE, 0);
  lv_obj_add_event_cb(taEc, phEcFocusCb, LV_EVENT_CLICKED, NULL);

  // Botao SALVAR
  lv_obj_t *btnSave = lv_btn_create(tab);
  lv_obj_set_size(btnSave, SCREEN_W - sw(24), sh(30));
  lv_obj_set_pos(btnSave, sw(12), sh(62));
  lv_obj_set_style_bg_color(btnSave, lv_color_hex(0x064E3B), 0);
  lv_obj_set_style_border_color(btnSave, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_border_width(btnSave, 1, 0);
  lv_obj_add_event_cb(btnSave, phEcSalvarCb, LV_EVENT_CLICKED, NULL);
  makeLabel(btnSave, "SALVAR", COL_GRN, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  // Keyboard numerico (ocupa o resto da tela)
  kbNumero = lv_keyboard_create(tab);
  lv_keyboard_set_mode(kbNumero, LV_KEYBOARD_MODE_NUMBER);
  lv_keyboard_set_textarea(kbNumero, taPh);
  lv_keyboard_set_popovers(kbNumero, false);
  lv_obj_set_size(kbNumero, SCREEN_W - sw(12), TAB_H - sh(100));
  lv_obj_align(kbNumero, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_set_style_bg_color(kbNumero, lv_color_hex(COL_BG), 0);

  activePhEcField = 0;
  updatePhEcHighlights();
}

// ════════════════════════════════════════════════════════════════════════════════
// Aba TAREFAS — checklist com lv_checkbox
// ════════════════════════════════════════════════════════════════════════════════
static void fetchTasks();
static void postTaskComplete(int taskId);
static void initMockTarefas() {
  const char* mock[] = {
    "Regar planta 1", "Medir pH da agua", "Verificar temperatura",
    "Trocar filtro", "Limpar reservatorio"
  };
  numTarefas = 5;
  for (int i = 0; i < 5; i++) {
    strncpy(tarefas[i].texto, mock[i], 79);
    tarefas[i].texto[79] = '\0';
    tarefas[i].feito = false;
    tarefas[i].serverId = -1;
  }
}

static void tarefaToggleCb(lv_event_t *e) {
  lv_obj_t *cb = (lv_obj_t*)lv_event_get_target(e);
  int idx = (int)(intptr_t)lv_event_get_user_data(e);
  if (idx < 0 || idx >= numTarefas) return;
  tarefas[idx].feito = lv_obj_has_state(cb, LV_STATE_CHECKED);
  if (tarefas[idx].serverId > 0) postTaskComplete(tarefas[idx].serverId);
}

static void rebuildTarefasList() {
  lv_obj_clean(tarefasList);
  if (numTarefas == 0) {
    lv_obj_t *l = lv_label_create(tarefasList);
    lv_label_set_text(l, "Sem tarefas");
    lv_obj_set_style_text_color(l, lv_color_hex(COL_DIM), 0);
    lv_obj_center(l);
    return;
  }
  for (int i = 0; i < numTarefas; i++) {
    lv_obj_t *item = lv_obj_create(tarefasList);
    lv_obj_set_width(item, LV_PCT(100));
    lv_obj_set_height(item, LV_SIZE_CONTENT);
    lv_obj_set_style_bg_color(item, lv_color_hex(COL_CARD), 0);
    lv_obj_set_style_border_color(item, lv_color_hex(COL_BORDER), 0);
    lv_obj_set_style_border_width(item, 1, 0);
    lv_obj_set_style_pad_all(item, 6, 0);
    lv_obj_clear_flag(item, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *cb = lv_checkbox_create(item);
    lv_checkbox_set_text(cb, tarefas[i].texto);
    lv_obj_set_style_text_color(cb, lv_color_hex(tarefas[i].feito ? COL_DIM : COL_TEXT), 0);
    if (tarefas[i].feito) lv_obj_add_state(cb, LV_STATE_CHECKED);
    lv_obj_add_event_cb(cb, tarefaToggleCb, LV_EVENT_VALUE_CHANGED, (void*)(intptr_t)i);
  }
}

static void buildTarefas(lv_obj_t *tab) {
  lv_obj_set_style_pad_all(tab, sw(6), 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);

  makeLabel(tab, "TAREFAS DO DIA", COL_TEXT, FONT_BODY, LV_ALIGN_TOP_MID, 0, 0);

  tarefasList = lv_obj_create(tab);
  lv_obj_set_size(tarefasList, SCREEN_W - sw(12), TAB_H - sh(34));
  lv_obj_align(tarefasList, LV_ALIGN_TOP_MID, 0, sh(22));
  lv_obj_set_style_bg_opa(tarefasList, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(tarefasList, 0, 0);
  lv_obj_set_flex_flow(tarefasList, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(tarefasList, sh(4), 0);

  rebuildTarefasList();
}

// ════════════════════════════════════════════════════════════════════════════════
// Aba HISTORICO — grafico de linha + btnmatrix metrica/periodo
// ════════════════════════════════════════════════════════════════════════════════
static bool fetchHistory(const char* metric, const char* period, float *buf, int &n, int maxN);

static uint32_t metricHistColor(int m) {
  return m == 0 ? COL_GRN : m == 1 ? COL_CYN : m == 2 ? COL_GRN : COL_CYN;
}

static void applyHistToChart() {
  static float buf[60];
  int n = 0;
  fetchHistory(METRIC_KEYS[histMetric], PERIOD_KEYS[histPeriod], buf, n, 60);
  if (n < 2) {
    lv_chart_set_point_count(chartHist, 2);
    lv_chart_set_all_values(chartHist, serHist, LV_CHART_POINT_NONE);
    lv_chart_refresh(chartHist);
    return;
  }
  float vmin = buf[0], vmax = buf[0];
  for (int i = 1; i < n; i++) {
    if (buf[i] < vmin) vmin = buf[i];
    if (buf[i] > vmax) vmax = buf[i];
  }
  if (vmax - vmin < 0.5f) { vmin -= 0.5f; vmax += 0.5f; }
  lv_chart_set_range(chartHist, LV_CHART_AXIS_PRIMARY_Y, (int32_t)(vmin*10), (int32_t)(vmax*10));
  lv_chart_set_point_count(chartHist, n);
  lv_chart_set_all_values(chartHist, serHist, LV_CHART_POINT_NONE);
  for (int i = 0; i < n; i++) lv_chart_set_next_value(chartHist, serHist, (int32_t)(buf[i]*10));
  lv_obj_set_style_line_color(chartHist, lv_color_hex(metricHistColor(histMetric)), LV_PART_ITEMS);
  lv_chart_refresh(chartHist);
}

static void mtxMetricCb(lv_event_t *e) {
  uint16_t idx = lv_btnmatrix_get_selected_btn((lv_obj_t*)lv_event_get_target(e));
  if (idx < 4 && (int)idx != histMetric) {
    histMetric = idx;
    applyHistToChart();
  }
}

static void mtxPeriodCb(lv_event_t *e) {
  uint16_t idx = lv_btnmatrix_get_selected_btn((lv_obj_t*)lv_event_get_target(e));
  if (idx < 3 && (int)idx != histPeriod) {
    histPeriod = idx;
    applyHistToChart();
  }
}

static void buildHistorico(lv_obj_t *tab) {
  lv_obj_set_style_pad_all(tab, sw(6), 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);

  makeLabel(tab, "HISTORICO", COL_TEXT, FONT_BODY, LV_ALIGN_TOP_MID, 0, 0);

  // Btnmatrix metrica (4 botoes no topo)
  static const char *metricBtns[] = {"TEMP", "UMID", "pH", "EC", ""};
  mtxMetric = lv_btnmatrix_create(tab);
  lv_btnmatrix_set_map(mtxMetric, metricBtns);
  lv_btnmatrix_set_one_checked(mtxMetric, true);
  for (int i = 0; i < 4; i++) lv_btnmatrix_set_btn_ctrl(mtxMetric, i, LV_BTNMATRIX_CTRL_CHECKABLE);
  lv_btnmatrix_set_btn_ctrl(mtxMetric, 0, LV_BTNMATRIX_CTRL_CHECKED);
  lv_obj_set_size(mtxMetric, SCREEN_W - sw(12), sh(24));
  lv_obj_align(mtxMetric, LV_ALIGN_TOP_MID, 0, sh(20));
  lv_obj_set_style_bg_color(mtxMetric, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_text_font(mtxMetric, FONT_BODY, 0);
  lv_obj_add_event_cb(mtxMetric, mtxMetricCb, LV_EVENT_VALUE_CHANGED, NULL);

  // Chart no meio
  chartHist = lv_chart_create(tab);
  lv_chart_set_type(chartHist, LV_CHART_TYPE_LINE);
  lv_chart_set_point_count(chartHist, 24);
  lv_chart_set_div_line_count(chartHist, 4, 6);
  lv_obj_set_style_width(chartHist,  0, LV_PART_INDICATOR);
  lv_obj_set_style_height(chartHist, 0, LV_PART_INDICATOR);
  lv_obj_set_style_line_width(chartHist, sw(2), LV_PART_ITEMS);
  lv_obj_set_style_bg_color(chartHist, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_border_color(chartHist, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_line_color(chartHist, lv_color_hex(COL_BORDER), LV_PART_MAIN);
  int chartY = sh(50), chartH = TAB_H - chartY - sh(34);
  lv_obj_set_size(chartHist, SCREEN_W - sw(12), chartH);
  lv_obj_align(chartHist, LV_ALIGN_TOP_MID, 0, chartY);
  serHist = lv_chart_add_series(chartHist, lv_color_hex(COL_GRN), LV_CHART_AXIS_PRIMARY_Y);

  // Btnmatrix periodo (3 botoes embaixo)
  static const char *periodBtns[] = {"24h", "7d", "30d", ""};
  mtxPeriod = lv_btnmatrix_create(tab);
  lv_btnmatrix_set_map(mtxPeriod, periodBtns);
  lv_btnmatrix_set_one_checked(mtxPeriod, true);
  for (int i = 0; i < 3; i++) lv_btnmatrix_set_btn_ctrl(mtxPeriod, i, LV_BTNMATRIX_CTRL_CHECKABLE);
  lv_btnmatrix_set_btn_ctrl(mtxPeriod, 0, LV_BTNMATRIX_CTRL_CHECKED);
  lv_obj_set_size(mtxPeriod, SCREEN_W - sw(12), sh(24));
  lv_obj_align(mtxPeriod, LV_ALIGN_BOTTOM_MID, 0, -sh(4));
  lv_obj_set_style_bg_color(mtxPeriod, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_text_font(mtxPeriod, FONT_BODY, 0);
  lv_obj_add_event_cb(mtxPeriod, mtxPeriodCb, LV_EVENT_VALUE_CHANGED, NULL);
}

// ════════════════════════════════════════════════════════════════════════════════
// Abas placeholder (próximos commits)
// ════════════════════════════════════════════════════════════════════════════════
static void buildPlaceholder(lv_obj_t *tab, const char *text) {
  lv_obj_t *l = lv_label_create(tab);
  lv_label_set_text(l, text);
  lv_obj_set_style_text_color(l, lv_color_hex(COL_DIM), 0);
  lv_obj_center(l);
}

// ════════════════════════════════════════════════════════════════════════════════
// UI redraw (valores)
// ════════════════════════════════════════════════════════════════════════════════
static uint32_t cTemp(float t)  { return (t < 18 || t > 32) ? COL_RED : (t > 28) ? COL_YEL : COL_GRN; }
static uint32_t cRH(float r)    { return (r < 40 || r > 80) ? COL_RED : (r > 70) ? COL_YEL : COL_CYN; }

static void refreshHomeValues() {
  char buf[16];
  // TEMP — atualiza label central + cor + posição do arc
  snprintf(buf, sizeof(buf), "%.1f", tempC);
  lv_label_set_text(lblTemp, buf);
  uint32_t tc = cTemp(tempC);
  lv_obj_set_style_text_color(lblTemp, lv_color_hex(tc), 0);
  if (arcTemp) {
    lv_arc_set_value(arcTemp, (int)tempC);
    lv_obj_set_style_arc_color(arcTemp, lv_color_hex(tc), LV_PART_INDICATOR);
  }

  snprintf(buf, sizeof(buf), "%.0f%%", rh);
  lv_label_set_text(lblRh, buf);
  lv_obj_set_style_text_color(lblRh, lv_color_hex(cRH(rh)), 0);

  snprintf(buf, sizeof(buf), "%.1f", phv);  lv_label_set_text(lblPh, buf);
  snprintf(buf, sizeof(buf), "%.1f", ecv);  lv_label_set_text(lblEc, buf);

  // LUX / PPFD (aba reformulada: toggle + ± + salvar)
  refreshLuxDisplay();

  char subBuf[48];
  snprintf(subBuf, sizeof(subBuf), "Sem %d/%d  %s", semana, totalSem, FASE);
  lv_label_set_text(lblSub, subBuf);
  lv_label_set_text(lblTitle, TENT_NAME);
  lv_img_set_src(lblWifi, wifiOk ? &ic_wifi : &ic_wifi_off);
  lv_obj_set_style_img_recolor(lblWifi, lv_color_hex(wifiOk ? COL_GRN : COL_DIM), 0);
}

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

// Certificado raiz ISRG Root X1 (Let's Encrypt) — cobre cultivo.x.andy.plus e
// qualquer outro servidor HTTPS com cert Let's Encrypt. Para servidores self-hosted
// com CA diferente, troque pelo cert raiz correspondente.
static const char ISRG_ROOT_X1[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
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
)EOF";

// Helper que escolhe WiFiClient (http) ou WiFiClientSecure (https) automaticamente.
// Usa ISRG Root X1 para validar certs Let's Encrypt (cultivo.x.andy.plus).
// Para servidores self-hosted com outra CA, ajuste ISRG_ROOT_X1 acima.
static WiFiClient       httpPlainClient;
static WiFiClientSecure httpSecureClient;
static bool httpClientsInited = false;

static bool httpBegin(HTTPClient &http, const char *url) {
  if (!httpClientsInited) {
    httpSecureClient.setCACert(ISRG_ROOT_X1);
    httpClientsInited = true;
  }
  if (strncmp(url, "https://", 8) == 0) {
    return http.begin(httpSecureClient, url);
  }
  return http.begin(httpPlainClient, url);
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
  if (code != 200) { http.end(); return false; }

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

static bool fetchHistory(const char* metric, const char* period, float *buf, int &n, int maxN) {
  n = 0;
  if (!wifiOk) return false;
  HTTPClient http;
  char url[160];
  snprintf(url, sizeof(url), "%s/api/device/history/%d?metric=%s&period=%s",
           SERVER_URL, TENT_ID, metric, period);
  httpBegin(http, url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  int code = http.GET();
  if (code != 200) { http.end(); return false; }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getStream());
  http.end();
  if (err != DeserializationError::Ok) return false;
  JsonArray arr = doc.as<JsonArray>();
  for (JsonObject pt : arr) {
    if (n >= maxN) break;
    buf[n++] = pt["v"] | 0.0f;
  }
  return true;
}

static void fetchTasks() {
  if (!wifiOk) return;
  HTTPClient http;
  char url[128];
  snprintf(url, sizeof(url), "%s/api/device/tasks/%d", SERVER_URL, TENT_ID);
  httpBegin(http, url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  int code = http.GET();
  if (code != 200) { http.end(); return; }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getStream());
  http.end();
  if (err != DeserializationError::Ok) return;
  JsonArray arr = doc.as<JsonArray>();
  numTarefas = 0;
  for (JsonObject t : arr) {
    if (numTarefas >= 10) break;
    const char *tx = t["texto"] | "...";
    strncpy(tarefas[numTarefas].texto, tx, 79);
    tarefas[numTarefas].texto[79] = '\0';
    tarefas[numTarefas].feito    = t["feito"] | false;
    tarefas[numTarefas].serverId = t["id"]    | -1;
    numTarefas++;
  }
}

static void postTaskComplete(int taskId) {
  if (!wifiOk || taskId <= 0) return;
  HTTPClient http;
  char url[128];
  snprintf(url, sizeof(url), "%s/api/device/task-complete", SERVER_URL);
  httpBegin(http, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  char body[48];
  snprintf(body, sizeof(body), "{\"taskId\":%d}", taskId);
  int code = http.POST(body);
  http.end();
  Serial.printf("postTaskComplete(%d): %d\n", taskId, code);
}

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

// HOME nao usa mais sparklines (historico esta na aba GRAFIC)
// fetchHistoryAll vira no-op para manter compatibilidade de chamadas existentes
static void fetchHistoryAll() {
  // intencionalmente vazio — historico agora so na aba GRAFIC via applyHistToChart
}

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
      fetchHistoryAll();
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
// Navegação custom: content area + bottom nav com icones Lucide coloridos
// ════════════════════════════════════════════════════════════════════════════════

// Destaca tab ativa e esmaece as outras
static void navSetActive(int idx) {
  for (int i = 0; i < 5; i++) {
    bool sel = (i == idx);
    lv_obj_set_style_img_recolor(navIcons[i],
      lv_color_hex(sel ? NAV_COLORS[i] : COL_DIM), 0);
    lv_obj_set_style_img_recolor_opa(navIcons[i], LV_OPA_COVER, 0);
  }
}

// Fade out do screen atual + fade in do novo
static void switchScreen(int idx) {
  if (idx == activeScreen) return;
  lv_obj_t *screens[5] = { screenHome, screenLux, screenPhEc, screenTarefa, screenGrafic };
  if (idx < 0 || idx >= 5) return;

  lv_obj_add_flag(screens[activeScreen], LV_OBJ_FLAG_HIDDEN);
  lv_obj_clear_flag(screens[idx], LV_OBJ_FLAG_HIDDEN);

  // Fade-in suave do novo screen
  lv_anim_t a;
  lv_anim_init(&a);
  lv_anim_set_var(&a, screens[idx]);
  lv_anim_set_values(&a, LV_OPA_TRANSP, LV_OPA_COVER);
  lv_anim_set_time(&a, 180);
  lv_anim_set_exec_cb(&a, [](void *obj, int32_t v) {
    lv_obj_set_style_opa((lv_obj_t*)obj, v, 0);
  });
  lv_anim_start(&a);

  activeScreen = idx;
  navSetActive(idx);

  // Re-fetch dados quando entra em tab dinamica
  if (idx == 3 && wifiOk) {           // TAREFA
    fetchTasks();
    rebuildTarefasList();
  } else if (idx == 4 && wifiOk) {    // GRAFIC
    applyHistToChart();
  } else if (idx == 0) {
    refreshHomeValues();
  }
}

// Callback de clique no icone da navbar
static void navBtnClickCb(lv_event_t *e) {
  int idx = (int)(intptr_t)lv_event_get_user_data(e);
  Serial.printf("[nav] click idx=%d\n", idx);
  switchScreen(idx);
}

static void buildNavbar(lv_obj_t *parent) {
  navbar = lv_obj_create(parent);
  lv_obj_set_size(navbar, SCREEN_W, TABBAR_H);
  lv_obj_align(navbar, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_set_style_bg_color(navbar, lv_color_hex(0x0A0F17), 0);
  lv_obj_set_style_bg_opa(navbar, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(navbar, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_border_width(navbar, 1, 0);
  lv_obj_set_style_border_side(navbar, LV_BORDER_SIDE_TOP, 0);
  lv_obj_set_style_radius(navbar, 0, 0);
  lv_obj_set_style_pad_all(navbar, 0, 0);
  lv_obj_clear_flag(navbar, LV_OBJ_FLAG_SCROLLABLE);

  int btnW = SCREEN_W / 5;
  for (int i = 0; i < 5; i++) {
    // Container clicavel (sem visual proprio — so area de toque)
    lv_obj_t *btn = lv_obj_create(navbar);
    lv_obj_set_size(btn, btnW, TABBAR_H);
    lv_obj_set_pos(btn, i * btnW, 0);
    lv_obj_set_style_bg_opa(btn, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(btn, 0, 0);
    lv_obj_set_style_radius(btn, 0, 0);
    lv_obj_set_style_pad_all(btn, 0, 0);
    lv_obj_clear_flag(btn, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_event_cb(btn, navBtnClickCb, LV_EVENT_CLICKED, (void*)(intptr_t)i);

    // Icone Lucide tintado
    lv_obj_t *ic = lv_img_create(btn);
    lv_img_set_src(ic, NAV_ICONS_IMG[i]);
    lv_obj_set_style_img_recolor_opa(ic, LV_OPA_COVER, 0);
    lv_obj_center(ic);
    navIcons[i] = ic;
  }

  navSetActive(0);
}

// ════════════════════════════════════════════════════════════════════════════════
// Tema dark + layout principal
// ════════════════════════════════════════════════════════════════════════════════
static void buildUI() {
  lv_obj_t *scr = lv_scr_act();
  // Background: gradient diagonal-ish (azul escuro -> preto puro)
  lv_obj_set_style_bg_color(scr, lv_color_hex(0x0F1729), 0);
  lv_obj_set_style_bg_grad_color(scr, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_grad_dir(scr, LV_GRAD_DIR_VER, 0);
  lv_obj_set_style_bg_main_stop(scr, 0, 0);
  lv_obj_set_style_bg_grad_stop(scr, 200, 0);
  lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
  lv_obj_set_style_pad_all(scr, 0, 0);

  // Overlay 1 — glow ambient verde sutil no canto superior esquerdo
  // (simula luz "caindo" sobre o dashboard, tipo HUD de nave)
  lv_obj_t *glow1 = lv_obj_create(scr);
  lv_obj_set_size(glow1, SCREEN_W * 3 / 5, SCREEN_H * 3 / 5);
  lv_obj_set_pos(glow1, 0, 0);
  lv_obj_set_style_bg_color(glow1, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_bg_opa(glow1, LV_OPA_10, 0);
  lv_obj_set_style_bg_grad_color(glow1, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_grad_dir(glow1, LV_GRAD_DIR_HOR, 0);
  lv_obj_set_style_border_width(glow1, 0, 0);
  lv_obj_set_style_radius(glow1, 0, 0);
  lv_obj_set_style_pad_all(glow1, 0, 0);
  lv_obj_add_flag(glow1, LV_OBJ_FLAG_IGNORE_LAYOUT);
  lv_obj_remove_flag(glow1, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_remove_flag(glow1, LV_OBJ_FLAG_SCROLLABLE);

  // Overlay 2 — glow ciano no canto direito inferior (contraponto de cor)
  lv_obj_t *glow2 = lv_obj_create(scr);
  lv_obj_set_size(glow2, SCREEN_W * 2 / 5, SCREEN_H * 2 / 5);
  lv_obj_align(glow2, LV_ALIGN_BOTTOM_RIGHT, 0, 0);
  lv_obj_set_style_bg_color(glow2, lv_color_hex(COL_CYN), 0);
  lv_obj_set_style_bg_opa(glow2, LV_OPA_10, 0);
  lv_obj_set_style_bg_grad_color(glow2, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_grad_dir(glow2, LV_GRAD_DIR_VER, 0);
  lv_obj_set_style_border_width(glow2, 0, 0);
  lv_obj_set_style_radius(glow2, 0, 0);
  lv_obj_set_style_pad_all(glow2, 0, 0);
  lv_obj_add_flag(glow2, LV_OBJ_FLAG_IGNORE_LAYOUT);
  lv_obj_remove_flag(glow2, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_remove_flag(glow2, LV_OBJ_FLAG_SCROLLABLE);

  // Area de conteudo (ocupa a tela inteira menos a navbar)
  // FASE C — Particles flutuando no fundo (atras do conteudo, na frente dos glows)
  // Temporariamente off enquanto investigo o hit-test da navbar
  // spawnParticleField(scr);

  contentArea = lv_obj_create(scr);
  lv_obj_set_size(contentArea, SCREEN_W, TAB_H);
  lv_obj_set_pos(contentArea, 0, 0);
  lv_obj_set_style_bg_opa(contentArea, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(contentArea, 0, 0);
  lv_obj_set_style_pad_all(contentArea, 0, 0);
  lv_obj_clear_flag(contentArea, LV_OBJ_FLAG_SCROLLABLE);

  // Helper pra criar cada screen como lv_obj do mesmo tamanho
  auto makeScreen = [&]() -> lv_obj_t* {
    lv_obj_t *s = lv_obj_create(contentArea);
    lv_obj_set_size(s, SCREEN_W, TAB_H);
    lv_obj_set_pos(s, 0, 0);
    lv_obj_set_style_bg_opa(s, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(s, 0, 0);
    lv_obj_set_style_pad_all(s, 0, 0);
    lv_obj_clear_flag(s, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(s, LV_OBJ_FLAG_HIDDEN);
    return s;
  };

  screenHome   = makeScreen();
  screenLux  = makeScreen();
  screenPhEc   = makeScreen();
  screenTarefa = makeScreen();
  screenGrafic = makeScreen();

  buildHome(screenHome);
  buildLux(screenLux);
  buildPhEc(screenPhEc);
  buildTarefas(screenTarefa);
  buildHistorico(screenGrafic);

  // HOME visivel por padrao
  lv_obj_clear_flag(screenHome, LV_OBJ_FLAG_HIDDEN);

  buildNavbar(scr);

  // FASE C — Scan line desabilitado: o overlay no topo do z-order estava
  // bloqueando hits em cima da navbar. Mantemos a funcao pra reativar depois
  // movendo pra dentro do contentArea se quisermos o efeito sem interferencia.
  // buildScanLine(scr);

  refreshHomeValues();
  startPulseTimer();   // anima sparklines dos mini-cards a cada 300ms
}

// ════════════════════════════════════════════════════════════════════════════════
// Arduino entry points
// ════════════════════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  Serial.printf("\n[boot] Cultivo ESP32 Display fw=%s\n", FW_VERSION);
  loadConfigFromNVS();

#ifdef REAL_HARDWARE
  bus = new Arduino_HWSPI(TFT_DC, TFT_CS, TFT_SCK, TFT_MOSI, TFT_MISO);
  gfx = new Arduino_AXS15231B(bus, TFT_RST, 1);
  gfx->begin();
  gfx->fillScreen(0);
#else
  Serial.println("[boot] SPI+TFT init"); Serial.flush();
  SPI.begin(TFT_SCK, TFT_MISO, TFT_MOSI, TFT_CS);
  tft.begin();
  tft.setRotation(1);
  tft.fillScreen(0);
#endif

  Serial.println("[boot] Wire init"); Serial.flush();
  Wire.begin(TOUCH_SDA, TOUCH_SCL);
  Serial.println("[boot] lv_init"); Serial.flush();
  lv_init();

  // LVGL v9: tick a partir de millis() (nao precisa de timer manual)
  lv_tick_set_cb([]() -> uint32_t { return millis(); });

  // LVGL v9: criar display + setar flush callback + buffers
  // (ordem importa: flush_cb antes de set_buffers; color format fica no default
  // que e' RGB565 quando LV_COLOR_DEPTH=16)
  Serial.println("[boot] lv_display_create"); Serial.flush();
  lv_display_t *disp = lv_display_create(SCREEN_W, SCREEN_H);
  Serial.println("[boot] display_set_flush_cb"); Serial.flush();
  lv_display_set_flush_cb(disp, disp_flush);
  Serial.println("[boot] display_set_buffers"); Serial.flush();
  // Usa single buffer (buf2=NULL) pra evitar qualquer dor de double-buffering
  lv_display_set_buffers(disp, buf1, NULL, sizeof(buf1), LV_DISPLAY_RENDER_MODE_PARTIAL);
  Serial.println("[boot] display_set_buffers ok"); Serial.flush();

  // LVGL v9: criar input device (touch)
  Serial.println("[boot] indev_create"); Serial.flush();
  lv_indev_t *indev = lv_indev_create();
  lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER);
  lv_indev_set_read_cb(indev, touchpad_read);

  Serial.println("[boot] buildUI"); Serial.flush();
  buildUI();
  Serial.println("[boot] buildUI ok"); Serial.flush();

  // Matrix splash — overlay em cima do UI ja montado
  Serial.println("[boot] matrix splash"); Serial.flush();
  buildMatrixSplash();
  unsigned long splashStart = millis();
  while (matrixScreen && millis() - splashStart < 4200) {
    lv_timer_handler();
    delay(5);
  }
  matrixFinish();
  // Deixa o fade completar
  unsigned long fadeStart = millis();
  while (matrixScreen && millis() - fadeStart < 600) {
    lv_timer_handler();
    delay(5);
  }

  initMockTarefas();
  rebuildTarefasList();

  // Sem WiFi salvo → primeiro boot. Comportamento muda por alvo:
  //  • Hardware real: sobe AP portal (user configura via celular no 192.168.4.1)
  //  • Wokwi (esp32dev): nao tem AP real + o softAP trava o I2C do touch.
  //    Entao abre direto o modal de config com teclado no display.
  if (strlen(WIFI_SSID) == 0) {
#ifdef REAL_HARDWARE
    Serial.println("[boot] sem WiFi salvo, subindo AP portal");
    startApPortal();
    return;
#else
    Serial.println("[boot] sem WiFi (Wokwi) -> modal de config direto");
    // Reabre o modal sempre que fechar — sem salvar, sem saida. Save -> reboot.
    while (true) {
      if (!configModal) openConfigModal();
      lv_timer_handler();
      delay(5);
    }
#endif
  }

  connectWifi();
  if (wifiOk) {
    // Fetch inicial no thread principal — garante dados prontos antes de mostrar UI
    fetchDisplayData();
    fetchHistoryAll();
    fetchTasks();
    rebuildTarefasList();
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
