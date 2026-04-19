// ════════════════════════════════════════════════════════════════════════════════
//  Cultivo ESP32 Display — versão LVGL (Fase F, em construção)
//  Visual polido com widgets nativos do LVGL, charts suaves, dark theme.
//  Este arquivo é compilado nos envs [env:esp32dev] e [env:real].
//  A versão classic (Adafruit_GFX) permanece em src/main.cpp (envs -classic).
// ════════════════════════════════════════════════════════════════════════════════

#include <Arduino.h>
#include <Wire.h>
#include <lvgl.h>

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

// ── LVGL buffers ────────────────────────────────────────────────────────────────
static lv_disp_draw_buf_t draw_buf;
static const uint32_t BUF_LINES = 20;
static lv_color_t buf1[480 * BUF_LINES];   // dimensionado para pior caso (480)
static lv_color_t buf2[480 * BUF_LINES];

// ── Callback de flush para o display ────────────────────────────────────────────
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

// ── Touch via I2C FT6206 ────────────────────────────────────────────────────────
static bool ftRead(int &rx, int &ry) {
  Wire.beginTransmission(FT_ADDR);
  Wire.write(0x02);
  if (Wire.endTransmission(false) != 0) return false;
  Wire.requestFrom((int)FT_ADDR, 5);
  if (Wire.available() < 5) return false;
  uint8_t toques = Wire.read();
  uint8_t xh = Wire.read(), xl = Wire.read();
  uint8_t yh = Wire.read(), yl = Wire.read();
  if (toques == 0 || toques > 2) return false;
  rx = ((xh & 0x0F) << 8) | xl;
  ry = ((yh & 0x0F) << 8) | yl;
  return true;
}

static void touchpad_read(lv_indev_drv_t *drv, lv_indev_data_t *data) {
  int rx, ry;
  if (!ftRead(rx, ry)) {
    data->state = LV_INDEV_STATE_REL;
    return;
  }
#ifdef REAL_HARDWARE
  // AXS15231B em landscape — coords direto (verificar na prática)
  data->point.x = rx;
  data->point.y = ry;
#else
  // ILI9341 landscape (rotation=1): mapeia portrait -> landscape
  data->point.x = map(ry, 0, 320, 0, SCREEN_W);
  data->point.y = map(rx, 0, 240, SCREEN_H, 0);
#endif
  data->state = LV_INDEV_STATE_PR;
}

// ── HOME screen ─────────────────────────────────────────────────────────────────
static lv_obj_t *scrHome;
static lv_obj_t *lblTemp;
static lv_obj_t *lblRh;
static lv_obj_t *chart;
static lv_chart_series_t *serTemp;

static void buildHome() {
  scrHome = lv_obj_create(NULL);
  lv_obj_set_style_bg_color(scrHome, lv_color_hex(0x0B0F14), 0);
  lv_obj_set_style_bg_opa(scrHome, LV_OPA_COVER, 0);

  // Título
  lv_obj_t *title = lv_label_create(scrHome);
  lv_label_set_text(title, "ESTUFA 1");
  lv_obj_set_style_text_color(title, lv_color_hex(0xFFFFFF), 0);
  lv_obj_set_style_text_font(title, &lv_font_montserrat_16, 0);
  lv_obj_align(title, LV_ALIGN_TOP_LEFT, 8, 6);

  lv_obj_t *sub = lv_label_create(scrHome);
  lv_label_set_text(sub, "Sem 4/16  FLORACAO");
  lv_obj_set_style_text_color(sub, lv_color_hex(0xA78BFA), 0);
  lv_obj_set_style_text_font(sub, &lv_font_montserrat_14, 0);
  lv_obj_align(sub, LV_ALIGN_TOP_LEFT, 8, 26);

  // Card TEMP
  lv_obj_t *cardT = lv_obj_create(scrHome);
  int cardW = SCREEN_W / 2 - 12;
  lv_obj_set_size(cardT, cardW, 80);
  lv_obj_align(cardT, LV_ALIGN_TOP_LEFT, 6, 48);
  lv_obj_set_style_bg_color(cardT, lv_color_hex(0x111827), 0);
  lv_obj_set_style_border_color(cardT, lv_color_hex(0x1F2937), 0);
  lv_obj_set_style_radius(cardT, 8, 0);

  lv_obj_t *lT = lv_label_create(cardT);
  lv_label_set_text(lT, "TEMP");
  lv_obj_set_style_text_color(lT, lv_color_hex(0x6B7280), 0);
  lv_obj_align(lT, LV_ALIGN_TOP_LEFT, 2, 2);

  lblTemp = lv_label_create(cardT);
  lv_label_set_text(lblTemp, "24.5°");
  lv_obj_set_style_text_font(lblTemp, &lv_font_montserrat_24, 0);
  lv_obj_set_style_text_color(lblTemp, lv_color_hex(0x4ADE80), 0);
  lv_obj_align(lblTemp, LV_ALIGN_CENTER, 0, 4);

  // Card RH
  lv_obj_t *cardR = lv_obj_create(scrHome);
  lv_obj_set_size(cardR, cardW, 80);
  lv_obj_align(cardR, LV_ALIGN_TOP_RIGHT, -6, 48);
  lv_obj_set_style_bg_color(cardR, lv_color_hex(0x111827), 0);
  lv_obj_set_style_border_color(cardR, lv_color_hex(0x1F2937), 0);
  lv_obj_set_style_radius(cardR, 8, 0);

  lv_obj_t *lR = lv_label_create(cardR);
  lv_label_set_text(lR, "UMIDADE");
  lv_obj_set_style_text_color(lR, lv_color_hex(0x6B7280), 0);
  lv_obj_align(lR, LV_ALIGN_TOP_LEFT, 2, 2);

  lblRh = lv_label_create(cardR);
  lv_label_set_text(lblRh, "62%");
  lv_obj_set_style_text_font(lblRh, &lv_font_montserrat_24, 0);
  lv_obj_set_style_text_color(lblRh, lv_color_hex(0x2DD4BF), 0);
  lv_obj_align(lblRh, LV_ALIGN_CENTER, 0, 4);

  // Chart (placeholder — substituído por dados reais depois)
  chart = lv_chart_create(scrHome);
  lv_obj_set_size(chart, SCREEN_W - 16, SCREEN_H - 180);
  lv_obj_align(chart, LV_ALIGN_BOTTOM_MID, 0, -44);
  lv_obj_set_style_bg_color(chart, lv_color_hex(0x111827), 0);
  lv_obj_set_style_border_color(chart, lv_color_hex(0x1F2937), 0);
  lv_chart_set_type(chart, LV_CHART_TYPE_LINE);
  lv_chart_set_point_count(chart, 12);
  lv_chart_set_range(chart, LV_CHART_AXIS_PRIMARY_Y, 20, 30);
  lv_chart_set_div_line_count(chart, 3, 0);

  serTemp = lv_chart_add_series(chart, lv_color_hex(0x4ADE80), LV_CHART_AXIS_PRIMARY_Y);
  int32_t demo[12] = { 24, 25, 24, 23, 25, 26, 25, 24, 25, 26, 27, 26 };
  for (int i = 0; i < 12; i++) lv_chart_set_next_value(chart, serTemp, demo[i]);
  lv_chart_refresh(chart);

  // Barra de navegação (placeholder — será substituída por lv_tabview depois)
  lv_obj_t *nav = lv_obj_create(scrHome);
  lv_obj_set_size(nav, SCREEN_W, 36);
  lv_obj_align(nav, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_set_style_bg_color(nav, lv_color_hex(0x0B0F14), 0);
  lv_obj_set_style_border_color(nav, lv_color_hex(0x1F2937), 0);
  lv_obj_set_style_radius(nav, 0, 0);

  lv_obj_t *navLbl = lv_label_create(nav);
  lv_label_set_text(navLbl, "INICIO  REGAR  pH/EC  TAREFA  GRAFIC");
  lv_obj_set_style_text_color(navLbl, lv_color_hex(0x6B7280), 0);
  lv_obj_center(navLbl);

  lv_scr_load(scrHome);
}

// ── Arduino entry points ────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Serial.println("\n[LVGL] boot");

#ifdef REAL_HARDWARE
  bus = new Arduino_HWSPI(TFT_DC, TFT_CS, TFT_SCK, TFT_MOSI, TFT_MISO);
  gfx = new Arduino_AXS15231B(bus, TFT_RST, 1 /* landscape */);
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
  disp_drv.hor_res = SCREEN_W;
  disp_drv.ver_res = SCREEN_H;
  disp_drv.flush_cb = disp_flush;
  disp_drv.draw_buf = &draw_buf;
  lv_disp_drv_register(&disp_drv);

  static lv_indev_drv_t indev_drv;
  lv_indev_drv_init(&indev_drv);
  indev_drv.type = LV_INDEV_TYPE_POINTER;
  indev_drv.read_cb = touchpad_read;
  lv_indev_drv_register(&indev_drv);

  buildHome();

  Serial.println("[LVGL] UI pronta");
}

void loop() {
  lv_timer_handler();
  delay(5);
}
