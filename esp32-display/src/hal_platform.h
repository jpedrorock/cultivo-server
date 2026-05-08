// ════════════════════════════════════════════════════════════════════════════════
// hal_platform.h — encapsula diferenças entre Wokwi (esp32dev) e hardware real
//
// Wokwi: ESP32-S3 DevKit + ILI9341 320x240 via Adafruit_GFX (SPI lento)
// Real:  ESP32-S3 + JC4832W535 (AXS15231B 320x480 nativo, rotacionado 480x320
//        landscape) via Arduino_GFX QSPI + touch I2C integrado no mesmo chip
//
// O flag REAL_HARDWARE e' setado so no env=real do platformio.ini.
// Pinout do JC4832W535 (Guition) hardcoded aqui; os parametros de
// hal_display_init/Wire.begin no main_lvgl.cpp seguem usados pra Wokwi.
// ════════════════════════════════════════════════════════════════════════════════
#ifndef HAL_PLATFORM_H
#define HAL_PLATFORM_H

#include <Arduino.h>
#include "cultivo_layout.h"   // HAL_SCREEN_W/H + FONT_* + cores (sem dep Arduino)

#ifdef REAL_HARDWARE
  #include <Arduino_GFX_Library.h>
  #include <canvas/Arduino_Canvas.h>
  #include <Wire.h>
  #include <driver/i2c.h>   // ESP-IDF i2c_master — Arduino Wire nao funciona com este chip
  extern Arduino_DataBus *bus;
  extern Arduino_GFX     *gfx;
  extern Arduino_Canvas  *canvas;  // CYD-Klipper pattern: gfx -> canvas -> push

  // ── JC3248W535C pinout (Guition / Shenzhen Jingcai) ─────────────────────────
  // Confirmado pela board config oficial do CYD-Klipper p/ este modelo exato.
  // Display: AXS15231B em QSPI (4 linhas), 320x480 portrait nativo.
  #define LCD_BL     1     // backlight via LEDC PWM
  #define LCD_RST   -1     // sem pino HW de reset (usa software reset cmd)
  #define LCD_CS    45
  #define LCD_SCK   47
  #define LCD_D0    21
  #define LCD_D1    48
  #define LCD_D2    40
  #define LCD_D3    39

  // Touch: AXS15231B integra display QSPI + touch I2C no mesmo chip.
  // Protocolo de touch e' proprietario (nao FT/CST padrao): comando 11 bytes
  // pra enderecar registro, depois leitura de 8 bytes com event/x/y.
  // SCL=8 confirmado pelo CYD-Klipper (estava 5 antes — provavelmente nunca
  // leu touch). LCD nao usa pin DC (QSPI codifica command no protocolo),
  // entao GPIO 8 fica livre p/ touch SCL sem conflito.
  #define TP_SDA       4
  #define TP_SCL       8
  #define TP_INT       3   // -1 desabilita IRQ
  #define TP_RST      -1
  #define TP_I2C_ADDR  0x3B
#else
  #include <Adafruit_GFX.h>
  #include <Adafruit_ILI9341.h>
  extern Adafruit_ILI9341 tft;
#endif

// Inicializa bus + controlador de display + backlight. Para JC4832W535 os
// pinos sao fixos (acima); pra Wokwi seguem pelos parametros (TFT_SCK etc.
// definidos em main_lvgl.cpp). Display nativo 320x480 (portrait); usamos
// rotation=1 pra renderizar em 480x320 landscape.
static inline void hal_display_init(int sck, int miso, int mosi, int cs, int dc, int rst) {
#ifdef REAL_HARDWARE
  (void)sck; (void)miso; (void)mosi; (void)cs; (void)dc; (void)rst;

  // Backlight: LEDC PWM (Arduino-ESP32 2.0.x API: setup + attachPin + write)
  ledcSetup(0 /* channel */, 5000 /* freq Hz */, 8 /* bits */);
  ledcAttachPin(LCD_BL, 0);
  ledcWrite(0, 200);  // ~80% — ajustavel depois pelo auto-dim

  // Setup do display em PORTRAIT NATIVO 320x480 — orientacao que o AXS15231B
  // QSPI aceita corretamente (testes em landscape resultaram em addr-window
  // corrompido = "linha vertical 1px com pixels comprimidos"). A app continua
  // pensando em landscape 480x320 via lv_display_set_rotation(90) no LVGL.
  // Pattern do CYD-Klipper (mesmo board JC3248W535C):
  //   1. construtor com rotation=0 (NAO setRotation depois — quebra MADCTL)
  //   2. canvas.begin() em vez de gfx->begin() — chama gfx.begin internamente
  //      e ja aloca o framebuffer da canvas
  //   3. invertDisplay(true) — AXS15231B requer cores invertidas
  //   4. toda escrita via canvas->draw...+flush() (1 push fullscreen por frame)
  bus = new Arduino_ESP32QSPI(LCD_CS, LCD_SCK, LCD_D0, LCD_D1, LCD_D2, LCD_D3);
  gfx = new Arduino_AXS15231B(bus, LCD_RST, 0 /* portrait native */,
                              true /* IPS */, 320, 480, 0, 0, 0, 0);
  canvas = new Arduino_Canvas(320, 480, gfx, 0, 0);
  // QSPI 60MHz — meio-termo. 80MHz causou pixels perdidos; 40MHz e' seguro
  // mas custa perf. Tentando 60MHz: se aparecer pixelacao, voltar p/ 40.
  if (!canvas->begin(60000000)) {
    Serial.println("[hal] canvas->begin() FAILED");
    Serial.flush();
  }
  gfx->invertDisplay(true);
  canvas->fillScreen(0); canvas->flush();
#else
  SPI.begin(sck, miso, mosi, cs);
  tft.begin();
  tft.setRotation(1);
  tft.fillScreen(0);
#endif
}

// Flush de pixels RGB565 — abstração sobre draw16bitRGBBitmap / writePixels
static inline void hal_push_pixels(int x, int y, int w, int h, uint16_t *px) {
#ifdef REAL_HARDWARE
  gfx->draw16bitRGBBitmap(x, y, px, w, h);
#else
  tft.startWrite();
  tft.setAddrWindow(x, y, w, h);
  tft.writePixels(px, w * h);
  tft.endWrite();
#endif
}

// Touch via ESP-IDF i2c_master (peripheral 1) — Arduino Wire nao funciona com
// este chip neste board. ESP-IDF usa o mesmo padrao do firmware de fabrica.
#define HAL_TOUCH_I2C_PORT  I2C_NUM_1

static inline bool hal_touch_init() {
#ifdef REAL_HARDWARE
  i2c_config_t conf = {};
  conf.mode             = I2C_MODE_MASTER;
  conf.sda_io_num       = TP_SDA;
  conf.scl_io_num       = TP_SCL;
  conf.sda_pullup_en    = GPIO_PULLUP_ENABLE;
  conf.scl_pullup_en    = GPIO_PULLUP_ENABLE;
  conf.master.clk_speed = 100000;
  if (i2c_param_config(HAL_TOUCH_I2C_PORT, &conf) != ESP_OK) return false;
  if (i2c_driver_install(HAL_TOUCH_I2C_PORT, I2C_MODE_MASTER, 0, 0, 0) != ESP_OK) return false;
  return true;
#else
  return true;
#endif
}

// Le um toque do controlador. Retorna true se ha contato; rx/ry em coords
// nativas (panel portrait 320x480, mapeadas depois por hal_map_touch).
static inline bool hal_touch_read(int *rx, int *ry) {
#ifdef REAL_HARDWARE
  static const uint8_t cmd[11] = {
    0xB5, 0xAB, 0xA5, 0x5A, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00
  };
  uint8_t b[8] = {0};
  if (i2c_master_write_to_device(HAL_TOUCH_I2C_PORT, TP_I2C_ADDR, cmd, sizeof(cmd),
                                  pdMS_TO_TICKS(50)) != ESP_OK) return false;
  if (i2c_master_read_from_device(HAL_TOUCH_I2C_PORT, TP_I2C_ADDR, b, sizeof(b),
                                   pdMS_TO_TICKS(50)) != ESP_OK) return false;
  if (b[0] != 0 || b[1] == 0) return false;
  *rx = ((b[2] & 0x0F) << 8) | b[3];
  *ry = ((b[4] & 0x0F) << 8) | b[5];
  return true;
#else
  Wire.beginTransmission(0x38);   // FT6336
  Wire.write(0x02);
  Wire.endTransmission(false);
  Wire.requestFrom(0x38, 5);
  if (Wire.available() < 5) return false;
  uint8_t fingers = Wire.read();
  uint8_t xh = Wire.read(), xl = Wire.read();
  uint8_t yh = Wire.read(), yl = Wire.read();
  if (fingers == 0) return false;
  *rx = ((xh & 0x0F) << 8) | xl;
  *ry = ((yh & 0x0F) << 8) | yl;
  return true;
#endif
}

// Mapeia coords brutas do controlador pra coords de tela do alvo.
// Real: AXS15231B reporta touch em panel native portrait (rx 0..319, ry 0..479).
//   LVGL configurada em portrait (320x480) com lv_display_set_rotation
//   ROTATION_90 — LVGL aplica rotacao tanto no display QUANTO nas coords
//   do touch automaticamente. Aqui so passa identity (rx, ry).
// Wokwi (FT6336 simulado): rotaciona 90 graus + escala pro display 320x240.
static inline void hal_map_touch(int rx, int ry, int *outX, int *outY) {
#ifdef REAL_HARDWARE
  // FORMULA confirmada por teste de 4 cantos (8 nov 2026), validada
  // matematicamente: TL/TR/BL/BR raw values produzem 0/479,0/319 logicals.
  // LVGL configurada em landscape 480x320 — esta e' a coord que ele espera.
  *outX = 479 - ry;
  *outY = rx;
  if (*outX < 0) *outX = 0; if (*outX > 479) *outX = 479;
  if (*outY < 0) *outY = 0; if (*outY > 319) *outY = 319;
#else
  *outX = map(ry, 0, 320, 0, HAL_SCREEN_W);
  *outY = HAL_SCREEN_H - map(rx, 0, 240, 0, HAL_SCREEN_H);
#endif
}

#endif  // HAL_PLATFORM_H
