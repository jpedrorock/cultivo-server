// ════════════════════════════════════════════════════════════════════════════════
//  Cultivo ESP32 Display — versão LVGL (Fase F)
//  Dashboard polido com lv_tabview + widgets nativos + dark theme.
//  Compilado em [env:esp32dev] (Wokwi) e [env:real] (JC4832W535).
// ════════════════════════════════════════════════════════════════════════════════

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <lvgl.h>

// ════════════════════════════════════════════════════════════════════════════════
// CONFIGURACAO — preencha antes de compilar
// ════════════════════════════════════════════════════════════════════════════════
#define WIFI_SSID    ""
#define WIFI_PASS    ""
#define SERVER_URL   "http://192.168.1.100:3000"
#define DEVICE_TOKEN ""
#define TENT_ID      1
// ════════════════════════════════════════════════════════════════════════════════

// ── Driver de display ───────────────────────────────────────────────────────────
#ifdef REAL_HARDWARE
  #include <Arduino_GFX_Library.h>
  #define TFT_CS    10
  #define TFT_DC     8
  #define TFT_RST   14
  #define TFT_SCK   12
  #define TFT_MOSI  11
  #define TFT_MISO  13
  #define TOUCH_SDA  4
  #define TOUCH_SCL  5
  #define FT_ADDR   0x38
  static Arduino_DataBus *bus = nullptr;
  static Arduino_GFX     *gfx = nullptr;
  static const int SCREEN_W = 480;
  static const int SCREEN_H = 320;
#else
  #include <Adafruit_GFX.h>
  #include <Adafruit_ILI9341.h>
  #define TFT_DC     2
  #define TFT_CS    15
  #define TOUCH_SDA 21
  #define TOUCH_SCL 22
  #define FT_ADDR  0x38
  static Adafruit_ILI9341 tft(TFT_CS, TFT_DC);
  static const int SCREEN_W = 320;
  static const int SCREEN_H = 240;
#endif

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

// ── LVGL buffers ────────────────────────────────────────────────────────────────
static lv_disp_draw_buf_t draw_buf;
static const uint32_t BUF_LINES = 20;
static lv_color_t buf1[480 * BUF_LINES];
static lv_color_t buf2[480 * BUF_LINES];

// ── Estado dos dados ────────────────────────────────────────────────────────────
static char TENT_NAME[50] = "ESTUFA 1";
static char FASE[20]      = "FLORACAO";
static float tempC = 24.5f, rh = 62.0f, vpd = 1.1f, phv = 6.2f, ecv = 1.8f;
static int semana = 4, totalSem = 16;

static bool wifiOk = false;
static unsigned long lastFetch = 0;
static const unsigned long FETCH_INTERVAL = 30000;

// ── Widgets HOME ────────────────────────────────────────────────────────────────
static lv_obj_t *tabview;
static lv_obj_t *tabHome, *tabRegar, *tabPhEc, *tabTarefa, *tabGrafic;
static lv_obj_t *lblTitle, *lblSub, *lblWifi;
static lv_obj_t *lblTemp, *lblRh, *lblPh, *lblEc;
static lv_obj_t *chartTemp, *chartRh;
static lv_chart_series_t *serTempLive, *serRhLive;

// ── Widgets REGAR ───────────────────────────────────────────────────────────────
static lv_obj_t *lblLitros, *sliderRegar;
static float litros = 1.0f;

// ── Widgets pH/EC ───────────────────────────────────────────────────────────────
static lv_obj_t *taPh, *taEc, *kbNumero;
static int activePhEcField = 0;  // 0=pH, 1=EC

// ════════════════════════════════════════════════════════════════════════════════
// Display + touch callbacks
// ════════════════════════════════════════════════════════════════════════════════
static void disp_flush(lv_disp_drv_t *disp, const lv_area_t *area, lv_color_t *px_map) {
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
  lv_disp_flush_ready(disp);
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

static void touchpad_read(lv_indev_drv_t *drv, lv_indev_data_t *data) {
  int rx, ry;
  if (!ftRead(rx, ry)) { data->state = LV_INDEV_STATE_REL; return; }
#ifdef REAL_HARDWARE
  data->point.x = rx; data->point.y = ry;
#else
  data->point.x = map(ry, 0, 320, 0, SCREEN_W);
  data->point.y = map(rx, 0, 240, SCREEN_H, 0);
#endif
  data->state = LV_INDEV_STATE_PR;
}

// ════════════════════════════════════════════════════════════════════════════════
// Helper: card estilizado
// ════════════════════════════════════════════════════════════════════════════════
static lv_obj_t* makeCard(lv_obj_t *parent, int x, int y, int w, int h) {
  lv_obj_t *c = lv_obj_create(parent);
  lv_obj_set_size(c, w, h);
  lv_obj_set_pos(c, x, y);
  lv_obj_set_style_bg_color(c, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_border_color(c, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_border_width(c, 1, 0);
  lv_obj_set_style_radius(c, 8, 0);
  lv_obj_set_style_pad_all(c, 6, 0);
  lv_obj_clear_flag(c, LV_OBJ_FLAG_SCROLLABLE);
  return c;
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
// Aba HOME — 4 cards (TEMP, RH, pH, EC) + 2 mini-charts
// ════════════════════════════════════════════════════════════════════════════════
static void buildHome(lv_obj_t *tab) {
  lv_obj_set_style_pad_all(tab, 4, 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);

  // Header (título + subtítulo + wifi)
  lblTitle = makeLabel(tab, TENT_NAME, COL_TEXT, &lv_font_montserrat_16, LV_ALIGN_TOP_LEFT, 4, 0);

  char subBuf[48];
  snprintf(subBuf, sizeof(subBuf), "Sem %d/%d  %s", semana, totalSem, FASE);
  lblSub = makeLabel(tab, subBuf, COL_PRP, &lv_font_montserrat_14, LV_ALIGN_TOP_LEFT, 4, 20);

  lblWifi = lv_led_create(tab);
  lv_obj_set_size(lblWifi, 8, 8);
  lv_obj_align(lblWifi, LV_ALIGN_TOP_RIGHT, -6, 8);
  lv_led_set_color(lblWifi, lv_color_hex(wifiOk ? COL_GRN : COL_DIM));
  lv_led_on(lblWifi);

  // Layout grid 2x2 — cards TEMP/RH (row 1), pH/EC (row 2)
  int contentY = 42;
  int contentH = SCREEN_H - contentY - 4;   // espaço antes da nav (tabview já conta)
  int rowH = contentH / 2 - 3;
  int colW = (SCREEN_W - 12) / 2;

  // Row 1 — TEMP (maior)
  lv_obj_t *cardT = makeCard(tab, 4, contentY, colW, rowH);
  makeLabel(cardT, "TEMP", COL_DIM, &lv_font_montserrat_12, LV_ALIGN_TOP_LEFT, 0, 0);
  lblTemp = makeLabel(cardT, "--", COL_GRN, &lv_font_montserrat_24, LV_ALIGN_TOP_LEFT, 0, 16);

  // Mini-chart TEMP no rodapé do card
  chartTemp = lv_chart_create(cardT);
  lv_obj_set_size(chartTemp, colW - 20, rowH - 50);
  lv_obj_align(chartTemp, LV_ALIGN_BOTTOM_RIGHT, 0, 0);
  lv_chart_set_type(chartTemp, LV_CHART_TYPE_LINE);
  lv_chart_set_point_count(chartTemp, 24);
  lv_chart_set_div_line_count(chartTemp, 0, 0);
  lv_obj_set_style_bg_opa(chartTemp, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(chartTemp, 0, 0);
  lv_obj_set_style_size(chartTemp, 0, LV_PART_INDICATOR);  // sem pontos
  lv_obj_set_style_line_width(chartTemp, 2, LV_PART_ITEMS);
  serTempLive = lv_chart_add_series(chartTemp, lv_color_hex(COL_GRN), LV_CHART_AXIS_PRIMARY_Y);

  // Row 1 — RH
  lv_obj_t *cardR = makeCard(tab, 8 + colW, contentY, colW, rowH);
  makeLabel(cardR, "UMIDADE", COL_DIM, &lv_font_montserrat_12, LV_ALIGN_TOP_LEFT, 0, 0);
  lblRh = makeLabel(cardR, "--", COL_CYN, &lv_font_montserrat_24, LV_ALIGN_TOP_LEFT, 0, 16);

  chartRh = lv_chart_create(cardR);
  lv_obj_set_size(chartRh, colW - 20, rowH - 50);
  lv_obj_align(chartRh, LV_ALIGN_BOTTOM_RIGHT, 0, 0);
  lv_chart_set_type(chartRh, LV_CHART_TYPE_LINE);
  lv_chart_set_point_count(chartRh, 24);
  lv_chart_set_div_line_count(chartRh, 0, 0);
  lv_obj_set_style_bg_opa(chartRh, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(chartRh, 0, 0);
  lv_obj_set_style_size(chartRh, 0, LV_PART_INDICATOR);
  lv_obj_set_style_line_width(chartRh, 2, LV_PART_ITEMS);
  serRhLive = lv_chart_add_series(chartRh, lv_color_hex(COL_CYN), LV_CHART_AXIS_PRIMARY_Y);

  // Row 2 — pH
  int row2Y = contentY + rowH + 6;
  lv_obj_t *cardPh = makeCard(tab, 4, row2Y, colW, rowH);
  makeLabel(cardPh, "pH", COL_DIM, &lv_font_montserrat_12, LV_ALIGN_TOP_LEFT, 0, 0);
  lblPh = makeLabel(cardPh, "--", COL_GRN, &lv_font_montserrat_24, LV_ALIGN_CENTER, 0, 6);

  // Row 2 — EC
  lv_obj_t *cardEc = makeCard(tab, 8 + colW, row2Y, colW, rowH);
  makeLabel(cardEc, "EC mS/cm", COL_DIM, &lv_font_montserrat_12, LV_ALIGN_TOP_LEFT, 0, 0);
  lblEc = makeLabel(cardEc, "--", COL_CYN, &lv_font_montserrat_24, LV_ALIGN_CENTER, 0, 6);
}

// ════════════════════════════════════════════════════════════════════════════════
// Aba REGAR — volume de rega com slider + botoes +/- + salvar
// ════════════════════════════════════════════════════════════════════════════════
static void postWatering(float l);   // fwd declaration

static void updateLitrosLabel() {
  char buf[16];
  snprintf(buf, sizeof(buf), "%.1f L", litros);
  lv_label_set_text(lblLitros, buf);
}

static void regarSliderCb(lv_event_t *e) {
  int32_t v = lv_slider_get_value((lv_obj_t*)lv_event_get_target(e));
  litros = v / 10.0f;
  updateLitrosLabel();
}

static void regarBtnCb(lv_event_t *e) {
  int delta = (int)(intptr_t)lv_event_get_user_data(e);
  litros += delta * 0.5f;
  if (litros < 0.5f) litros = 0.5f;
  if (litros > 20.0f) litros = 20.0f;
  lv_slider_set_value(sliderRegar, (int32_t)(litros * 10), LV_ANIM_ON);
  updateLitrosLabel();
}

static void regarSalvarCb(lv_event_t *e) {
  postWatering(litros);
  // feedback toast
  lv_obj_t *msg = lv_msgbox_create(NULL, "Rega salva", "Volume registrado.", NULL, false);
  lv_obj_center(msg);
  lv_obj_t *bg = lv_msgbox_get_content(msg);
  lv_obj_set_style_bg_color(bg, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_text_color(bg, lv_color_hex(COL_GRN), 0);
  // fecha automaticamente em 1.5s
  lv_timer_t *t = lv_timer_create([](lv_timer_t *t) {
    lv_obj_t *m = (lv_obj_t*)t->user_data;
    lv_msgbox_close(m);
    lv_timer_del(t);
  }, 1500, msg);
  (void)t;
}

static void buildRegar(lv_obj_t *tab) {
  lv_obj_set_style_pad_all(tab, 8, 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);

  makeLabel(tab, "REGA", COL_TEXT, &lv_font_montserrat_16, LV_ALIGN_TOP_MID, 0, 0);
  makeLabel(tab, "Quantos litros voce regou?", COL_DIM, &lv_font_montserrat_14, LV_ALIGN_TOP_MID, 0, 22);

  // Card central com valor
  int cardW = SCREEN_W - 32;
  int cardH = 60;
  lv_obj_t *card = makeCard(tab, 16, 46, cardW, cardH);
  lblLitros = makeLabel(card, "1.0 L", COL_CYN, &lv_font_montserrat_24, LV_ALIGN_CENTER, 0, 0);

  // Botoes - / +
  int btnY = 46 + cardH + 10;
  lv_obj_t *btnMinus = lv_btn_create(tab);
  lv_obj_set_size(btnMinus, 48, 36);
  lv_obj_set_pos(btnMinus, 16, btnY);
  lv_obj_set_style_bg_color(btnMinus, lv_color_hex(COL_BORDER), 0);
  lv_obj_add_event_cb(btnMinus, regarBtnCb, LV_EVENT_CLICKED, (void*)(intptr_t)-1);
  makeLabel(btnMinus, "-", COL_RED, &lv_font_montserrat_24, LV_ALIGN_CENTER, 0, -2);

  lv_obj_t *btnPlus = lv_btn_create(tab);
  lv_obj_set_size(btnPlus, 48, 36);
  lv_obj_set_pos(btnPlus, SCREEN_W - 16 - 48, btnY);
  lv_obj_set_style_bg_color(btnPlus, lv_color_hex(COL_BORDER), 0);
  lv_obj_add_event_cb(btnPlus, regarBtnCb, LV_EVENT_CLICKED, (void*)(intptr_t)+1);
  makeLabel(btnPlus, "+", COL_GRN, &lv_font_montserrat_24, LV_ALIGN_CENTER, 0, -2);

  // Slider entre os botoes
  sliderRegar = lv_slider_create(tab);
  lv_obj_set_size(sliderRegar, SCREEN_W - 32 - 48*2 - 20, 8);
  lv_obj_set_pos(sliderRegar, 16 + 48 + 10, btnY + 14);
  lv_slider_set_range(sliderRegar, 5, 200);  // 0.5 a 20.0 (x10)
  lv_slider_set_value(sliderRegar, 10, LV_ANIM_OFF);
  lv_obj_add_event_cb(sliderRegar, regarSliderCb, LV_EVENT_VALUE_CHANGED, NULL);

  // Botao SALVAR
  lv_obj_t *btnSave = lv_btn_create(tab);
  lv_obj_set_size(btnSave, SCREEN_W - 32, 36);
  lv_obj_align(btnSave, LV_ALIGN_BOTTOM_MID, 0, -8);
  lv_obj_set_style_bg_color(btnSave, lv_color_hex(0x064E3B), 0);
  lv_obj_set_style_border_color(btnSave, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_border_width(btnSave, 1, 0);
  lv_obj_add_event_cb(btnSave, regarSalvarCb, LV_EVENT_CLICKED, NULL);
  makeLabel(btnSave, "SALVAR", COL_GRN, &lv_font_montserrat_16, LV_ALIGN_CENTER, 0, 0);
}

// ════════════════════════════════════════════════════════════════════════════════
// Aba pH/EC — dois campos + keyboard numerico nativo + salvar
// ════════════════════════════════════════════════════════════════════════════════
static void postReading(float newPh, float newEc);  // fwd

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

  lv_obj_t *msg = lv_msgbox_create(NULL, "Medicao salva", "pH/EC registrados.", NULL, false);
  lv_obj_center(msg);
  lv_timer_t *t = lv_timer_create([](lv_timer_t *t) {
    lv_obj_t *m = (lv_obj_t*)t->user_data;
    lv_msgbox_close(m);
    lv_timer_del(t);
  }, 1500, msg);
  (void)t;
}

static void buildPhEc(lv_obj_t *tab) {
  lv_obj_set_style_pad_all(tab, 6, 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);

  makeLabel(tab, "MEDICAO pH / EC", COL_TEXT, &lv_font_montserrat_14, LV_ALIGN_TOP_MID, 0, 0);

  int fieldW = (SCREEN_W - 24) / 2;
  int fieldH = 38;

  taPh = lv_textarea_create(tab);
  lv_obj_set_size(taPh, fieldW, fieldH);
  lv_obj_set_pos(taPh, 6, 18);
  lv_textarea_set_accepted_chars(taPh, "0123456789.");
  lv_textarea_set_max_length(taPh, 5);
  lv_textarea_set_one_line(taPh, true);
  lv_textarea_set_placeholder_text(taPh, "pH");
  lv_obj_set_style_bg_color(taPh, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_text_color(taPh, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_text_font(taPh, &lv_font_montserrat_16, 0);
  lv_obj_add_event_cb(taPh, phEcFocusCb, LV_EVENT_CLICKED, NULL);

  taEc = lv_textarea_create(tab);
  lv_obj_set_size(taEc, fieldW, fieldH);
  lv_obj_set_pos(taEc, 12 + fieldW, 18);
  lv_textarea_set_accepted_chars(taEc, "0123456789.");
  lv_textarea_set_max_length(taEc, 5);
  lv_textarea_set_one_line(taEc, true);
  lv_textarea_set_placeholder_text(taEc, "EC");
  lv_obj_set_style_bg_color(taEc, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_text_color(taEc, lv_color_hex(COL_CYN), 0);
  lv_obj_set_style_text_font(taEc, &lv_font_montserrat_16, 0);
  lv_obj_add_event_cb(taEc, phEcFocusCb, LV_EVENT_CLICKED, NULL);

  // Botao SALVAR
  lv_obj_t *btnSave = lv_btn_create(tab);
  lv_obj_set_size(btnSave, SCREEN_W - 24, 30);
  lv_obj_set_pos(btnSave, 12, 62);
  lv_obj_set_style_bg_color(btnSave, lv_color_hex(0x064E3B), 0);
  lv_obj_set_style_border_color(btnSave, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_border_width(btnSave, 1, 0);
  lv_obj_add_event_cb(btnSave, phEcSalvarCb, LV_EVENT_CLICKED, NULL);
  makeLabel(btnSave, "SALVAR", COL_GRN, &lv_font_montserrat_14, LV_ALIGN_CENTER, 0, 0);

  // Keyboard numerico (ocupa o resto da tela)
  kbNumero = lv_keyboard_create(tab);
  lv_keyboard_set_mode(kbNumero, LV_KEYBOARD_MODE_NUMBER);
  lv_keyboard_set_textarea(kbNumero, taPh);
  lv_keyboard_set_popovers(kbNumero, false);
  lv_obj_set_size(kbNumero, SCREEN_W - 12, SCREEN_H - 130);
  lv_obj_align(kbNumero, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_set_style_bg_color(kbNumero, lv_color_hex(COL_BG), 0);

  activePhEcField = 0;
  updatePhEcHighlights();
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
  snprintf(buf, sizeof(buf), "%.1f°", tempC);
  lv_label_set_text(lblTemp, buf);
  lv_obj_set_style_text_color(lblTemp, lv_color_hex(cTemp(tempC)), 0);

  snprintf(buf, sizeof(buf), "%.0f%%", rh);
  lv_label_set_text(lblRh, buf);
  lv_obj_set_style_text_color(lblRh, lv_color_hex(cRH(rh)), 0);

  snprintf(buf, sizeof(buf), "%.1f", phv);  lv_label_set_text(lblPh, buf);
  snprintf(buf, sizeof(buf), "%.1f", ecv);  lv_label_set_text(lblEc, buf);

  char subBuf[48];
  snprintf(subBuf, sizeof(subBuf), "Sem %d/%d  %s", semana, totalSem, FASE);
  lv_label_set_text(lblSub, subBuf);
  lv_label_set_text(lblTitle, TENT_NAME);
  lv_led_set_color(lblWifi, lv_color_hex(wifiOk ? COL_GRN : COL_DIM));
}

static void pushSeries(lv_obj_t *chart, lv_chart_series_t *ser, float *vals, int n) {
  if (n < 2) return;
  float vmin = vals[0], vmax = vals[0];
  for (int i = 1; i < n; i++) {
    if (vals[i] < vmin) vmin = vals[i];
    if (vals[i] > vmax) vmax = vals[i];
  }
  if (vmax - vmin < 0.5f) { vmin -= 0.5f; vmax += 0.5f; }
  lv_chart_set_range(chart, LV_CHART_AXIS_PRIMARY_Y, (int32_t)(vmin*10), (int32_t)(vmax*10));
  lv_chart_set_point_count(chart, n);
  lv_chart_set_all_value(chart, ser, LV_CHART_POINT_NONE);
  for (int i = 0; i < n; i++) lv_chart_set_next_value(chart, ser, (int32_t)(vals[i]*10));
  lv_chart_refresh(chart);
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

static bool fetchDisplayData() {
  if (!wifiOk) return false;
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/device/display/" + String(TENT_ID);
  http.begin(url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  int code = http.GET();
  if (code != 200) { http.end(); return false; }
  String body = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok) return false;
  if (!doc["tempC"].isNull())    tempC    = doc["tempC"].as<float>();
  if (!doc["rh"].isNull())       rh       = doc["rh"].as<float>();
  if (!doc["vpd"].isNull())      vpd      = doc["vpd"].as<float>();
  if (!doc["ph"].isNull())       phv      = doc["ph"].as<float>();
  if (!doc["ec"].isNull())       ecv      = doc["ec"].as<float>();
  if (!doc["semana"].isNull())   semana   = doc["semana"].as<int>();
  if (!doc["totalSem"].isNull()) totalSem = doc["totalSem"].as<int>();
  const char* f = doc["fase"];     if (f) { strncpy(FASE, f, sizeof(FASE)-1); FASE[sizeof(FASE)-1]='\0'; }
  const char* t = doc["tentName"]; if (t) { strncpy(TENT_NAME, t, sizeof(TENT_NAME)-1); TENT_NAME[sizeof(TENT_NAME)-1]='\0'; }
  return true;
}

static void postReading(float newPh, float newEc) {
  if (!wifiOk) return;
  HTTPClient http;
  http.begin(String(SERVER_URL) + "/api/device/readings");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  String body = "{\"tentId\":" + String(TENT_ID) +
                ",\"ph\":" + String(newPh, 1) +
                ",\"ec\":" + String(newEc, 2) + "}";
  int code = http.POST(body);
  http.end();
  Serial.printf("postReading: %d\n", code);
}

static void postWatering(float l) {
  if (!wifiOk) return;
  HTTPClient http;
  http.begin(String(SERVER_URL) + "/api/device/watering");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  String body = "{\"tentId\":" + String(TENT_ID) + ",\"litros\":" + String(l, 1) + "}";
  int code = http.POST(body);
  http.end();
  Serial.printf("postWatering: %d\n", code);
}

static void fetchHistoryAll() {
  if (!wifiOk) return;
  HTTPClient http;
  http.begin(String(SERVER_URL) + "/api/device/history-all/" + String(TENT_ID) + "?period=24h");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  int code = http.GET();
  if (code != 200) { http.end(); return; }
  String body = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok) return;

  static float tb[24], rb[24];
  int tN = 0, rN = 0;
  JsonArray tArr = doc["temp"].as<JsonArray>();
  for (JsonVariant v : tArr) { if (tN < 24) tb[tN++] = v.as<float>(); }
  JsonArray rArr = doc["rh"].as<JsonArray>();
  for (JsonVariant v : rArr) { if (rN < 24) rb[rN++] = v.as<float>(); }
  pushSeries(chartTemp, serTempLive, tb, tN);
  pushSeries(chartRh,   serRhLive,   rb, rN);
}

// ════════════════════════════════════════════════════════════════════════════════
// Tema dark + tabview
// ════════════════════════════════════════════════════════════════════════════════
static void buildUI() {
  lv_obj_t *scr = lv_scr_act();
  lv_obj_set_style_bg_color(scr, lv_color_hex(COL_BG), 0);

  tabview = lv_tabview_create(scr, LV_DIR_BOTTOM, 34);
  lv_obj_set_style_bg_color(tabview, lv_color_hex(COL_BG), 0);

  lv_obj_t *tabBtns = lv_tabview_get_tab_btns(tabview);
  lv_obj_set_style_bg_color(tabBtns, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_border_color(tabBtns, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_text_font(tabBtns, &lv_font_montserrat_12, 0);

  tabHome   = lv_tabview_add_tab(tabview, "INICIO");
  tabRegar  = lv_tabview_add_tab(tabview, "REGAR");
  tabPhEc   = lv_tabview_add_tab(tabview, "pH/EC");
  tabTarefa = lv_tabview_add_tab(tabview, "TAREFA");
  tabGrafic = lv_tabview_add_tab(tabview, "GRAFIC");

  buildHome(tabHome);
  buildRegar(tabRegar);
  buildPhEc(tabPhEc);
  buildPlaceholder(tabTarefa, "Tela TAREFAS (em breve)");
  buildPlaceholder(tabGrafic, "Tela GRAFICOS (em breve)");

  refreshHomeValues();
}

// ════════════════════════════════════════════════════════════════════════════════
// Arduino entry points
// ════════════════════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  Serial.println("\n[LVGL] boot");

#ifdef REAL_HARDWARE
  bus = new Arduino_HWSPI(TFT_DC, TFT_CS, TFT_SCK, TFT_MOSI, TFT_MISO);
  gfx = new Arduino_AXS15231B(bus, TFT_RST, 1);
  gfx->begin();
  gfx->fillScreen(0);
#else
  tft.begin();
  tft.setRotation(1);
  tft.fillScreen(0);
#endif

  Wire.begin(TOUCH_SDA, TOUCH_SCL);
  lv_init();

  lv_disp_draw_buf_init(&draw_buf, buf1, buf2, SCREEN_W * BUF_LINES);

  static lv_disp_drv_t disp_drv;
  lv_disp_drv_init(&disp_drv);
  disp_drv.hor_res  = SCREEN_W;
  disp_drv.ver_res  = SCREEN_H;
  disp_drv.flush_cb = disp_flush;
  disp_drv.draw_buf = &draw_buf;
  lv_disp_drv_register(&disp_drv);

  static lv_indev_drv_t indev_drv;
  lv_indev_drv_init(&indev_drv);
  indev_drv.type    = LV_INDEV_TYPE_POINTER;
  indev_drv.read_cb = touchpad_read;
  lv_indev_drv_register(&indev_drv);

  buildUI();

  connectWifi();
  if (wifiOk) {
    fetchDisplayData();
    fetchHistoryAll();
    lastFetch = millis();
    refreshHomeValues();
  }
  Serial.println("[LVGL] UI pronta");
}

void loop() {
  if (wifiOk && millis() - lastFetch >= FETCH_INTERVAL) {
    lastFetch = millis();
    if (fetchDisplayData()) refreshHomeValues();
    fetchHistoryAll();
  }
  lv_timer_handler();
  delay(5);
}
