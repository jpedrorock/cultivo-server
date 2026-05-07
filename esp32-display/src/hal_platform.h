// ════════════════════════════════════════════════════════════════════════════════
// hal_platform.h — encapsula diferenças entre Wokwi (esp32dev) e hardware real
//
// Wokwi: ESP32-S3 DevKit + ILI9341 320x240 via Adafruit_GFX (SPI lento)
// Real:  ESP32-S3 + JC4832W535 (AXS15231B 480x320) via Arduino_GFX (SPI rapido)
//
// O flag REAL_HARDWARE e' setado so no env=real do platformio.ini.
// Qualquer codigo que precisar dos dois alvos usa as constantes e macros daqui.
// Objetos globais (gfx/bus para real, tft para Wokwi) sao declarados via extern
// e definidos em main_lvgl.cpp.
// ════════════════════════════════════════════════════════════════════════════════
#ifndef HAL_PLATFORM_H
#define HAL_PLATFORM_H

#include <Arduino.h>
#include "cultivo_layout.h"   // HAL_SCREEN_W/H + FONT_* + cores (sem dep Arduino)

#ifdef REAL_HARDWARE
  #include <Arduino_GFX_Library.h>
  extern Arduino_DataBus *bus;
  extern Arduino_GFX     *gfx;
#else
  #include <Adafruit_GFX.h>
  #include <Adafruit_ILI9341.h>
  extern Adafruit_ILI9341 tft;
#endif

// Inicializa bus SPI + controlador de display. Deve ser chamado em setup()
// antes de qualquer operacao grafica. Os pinos variam pelos alvos:
// - Real (AXS15231B): bus custom com 4 pinos de dados
// - Wokwi (ILI9341):  SPI hardware padrao
static inline void hal_display_init(int sck, int miso, int mosi, int cs, int dc, int rst) {
#ifdef REAL_HARDWARE
  bus = new Arduino_HWSPI(dc, cs, sck, mosi, miso);
  gfx = new Arduino_AXS15231B(bus, rst, 1);
  gfx->begin();
  gfx->fillScreen(0);
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

// Mapeia coords brutas do FT controller pra coords de tela do alvo.
// Real: passa direto. Wokwi: rotaciona 90 graus + escala pro display 320x240.
static inline void hal_map_touch(int rx, int ry, int *outX, int *outY) {
#ifdef REAL_HARDWARE
  *outX = rx; *outY = ry;
#else
  *outX = map(ry, 0, 320, 0, HAL_SCREEN_W);
  *outY = HAL_SCREEN_H - map(rx, 0, 240, 0, HAL_SCREEN_H);
#endif
}

#endif  // HAL_PLATFORM_H
