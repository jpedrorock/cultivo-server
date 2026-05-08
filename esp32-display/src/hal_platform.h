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
  if (!canvas->begin()) {
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

// Le um toque do controlador. Retorna true se ha contato; rx/ry em coords
// nativas do hardware (mapeadas depois por hal_map_touch).
//   Real: AXS15231B touch — protocolo proprio (cmd 11B + read 8B)
//   Wokwi: FT6336 — registro 0x02 com fingers/x/y simples
static inline bool hal_touch_read(int *rx, int *ry) {
#ifdef REAL_HARDWARE
  static const uint8_t cmd[11] = {
    0xB5, 0xAB, 0xA5, 0x5A, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00
  };
  Wire.beginTransmission(TP_I2C_ADDR);
  Wire.write(cmd, sizeof(cmd));
  if (Wire.endTransmission() != 0) return false;
  delayMicroseconds(150);
  Wire.requestFrom((int)TP_I2C_ADDR, 8);
  if (Wire.available() < 8) return false;
  uint8_t b[8];
  for (int i = 0; i < 8; i++) b[i] = Wire.read();
  uint8_t event  = b[0] >> 4;
  uint8_t finger = b[1];
  if (event == 0 || finger == 0) return false;
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
// Real (AXS15231B + rotation=1): touch ja vem em coords landscape, passa direto.
// Wokwi (FT6336 simulado): rotaciona 90 graus + escala pro display 320x240.
static inline void hal_map_touch(int rx, int ry, int *outX, int *outY) {
#ifdef REAL_HARDWARE
  *outX = rx; *outY = ry;
#else
  *outX = map(ry, 0, 320, 0, HAL_SCREEN_W);
  *outY = HAL_SCREEN_H - map(rx, 0, 240, 0, HAL_SCREEN_H);
#endif
}

#endif  // HAL_PLATFORM_H
