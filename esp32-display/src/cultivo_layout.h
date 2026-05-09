// ════════════════════════════════════════════════════════════════════════════════
// cultivo_layout.h — constantes de tela/fonte/cor compartilhadas
//
// Sem dependencia Arduino — pode ser incluido tanto pelo firmware (via
// hal_platform.h) quanto pelo simulador SDL2. Os macros HAL_SCREEN_W/H
// e FONT_* sao escolhidos via #ifdef pra cada alvo:
//
//   REAL_HARDWARE   → ESP32-S3 + JC4832W535 (480x320)
//   CULTIVO_SIM     → simulador SDL2 no Mac (480x320, mesmas fontes)
//   (default Wokwi) → ESP32-S3 + ILI9341    (320x240, fontes compactas)
// ════════════════════════════════════════════════════════════════════════════════
#pragma once
#include "lvgl.h"
#include "fonts/cultivo_fonts.h"

#if defined(REAL_HARDWARE) || defined(CULTIVO_SIM)
  #define HAL_SCREEN_W 480
  #define HAL_SCREEN_H 320
  // Geist (Cultivo Design System) no real + sim. Manrope mantido pro Wokwi.
  #define FONT_VALUE   (&geist_bold_40)
  #define FONT_TITLE   (&geist_bold_24)
  #define FONT_BODY    (&geist_sb_18)
  #define FONT_CAPTION (&geist_sb_14)
#else  // Wokwi
  #define HAL_SCREEN_W 320
  #define HAL_SCREEN_H 240
  #define FONT_VALUE   (&manrope_bold_28)
  #define FONT_TITLE   (&manrope_bold_18)
  #define FONT_BODY    (&manrope_sb_14)
  #define FONT_CAPTION (&manrope_sb_12)
#endif

// ── Paleta de cores (espelha DisplayMode.tsx do web app) ──────────────────────
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
