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

// ────────────────────────────────────────────────────────────────────────────
// Paleta — Cultivo Design System (client/src/index.css :root .dark)
// Cores convertidas de OKLCH pra hex (RGB565 friendly).
// Mantemos os macros antigos COL_* funcionais — alguns telas legadas ainda
// referenciam — mas valor agora bate com o DS real do web app.
// ────────────────────────────────────────────────────────────────────────────

// Background: oklch(0.09 0.008 240) — quase preto com tint frio
#define COL_BG      0x0A0E14
// Card: oklch(0.14 0.010 240) — step de elevação sobre BG
#define COL_CARD    0x131820
// Border: oklch(0.18 0.010 240) — sutil, mal visível
#define COL_BORDER  0x1F2937
// Foreground: oklch(0.97 0 0) — branco off
#define COL_TEXT    0xF9FAFB
// Muted-foreground: oklch(0.46 0.008 240) — cinza médio
#define COL_DIM     0x6B7280

// Primary: oklch(0.62 0.17 145) — verde vibrante, "marca" do Cultivo.
// COL_GRN e COL_PRIMARY apontam pro mesmo verde por compatibilidade,
// mas codigo novo deve usar COL_PRIMARY pra clareza semantica.
#define COL_PRIMARY 0x22C55E
#define COL_GRN     0x22C55E

// Cores de metrica (usadas em sparklines/icones — sempre acompanhadas
// de valor branco pra hierarquia clara)
#define COL_YEL     0xFBBF24    // PPFD/lux
#define COL_RED     0xF87171    // alertas/critical (NAO usar em metricas normais)
#define COL_CYN     0x06B6D4    // umidade
#define COL_PRP     0xA78BFA    // pH
#define COL_BLU     0x60A5FA    // wifi/info
#define COL_AMBER   0xE0A32E    // EC

// ── Phase tokens (espelha .dark phase palette do client/src/index.css) ──────
// Cor da fase de cultivo — usada em badges no header, indicadores de ciclo.
// Importante: FLORACAO e' MAGENTA (#BE4BDB), nao verde — verde e' VEGA.
#define COL_PHASE_SEEDLING    0x8EC58C
#define COL_PHASE_VEGETATIVE  0x40C057
#define COL_PHASE_FLOWERING   0xBE4BDB
#define COL_PHASE_FLUSHING    0x20C997
#define COL_PHASE_HARVEST     0xFD7C36
#define COL_PHASE_DRYING      0xE0A32E
#define COL_PHASE_CURING      0xB07E3A
#define COL_PHASE_MAINTENANCE 0x93C5FD

// ── Motion tokens ───────────────────────────────────────────────────────────
// Durations em ms — bate com --motion-* do CSS (menos breath que o app
// usa 2500ms; 2800 atual fica explicitamente intencional pra ring-pulse,
// alinhamos pra 2500 pra coerencia).
#define MOTION_FAST   150
#define MOTION_MED    300
#define MOTION_SLOW   600
#define MOTION_BREATH 2500

// ── Radius tokens ───────────────────────────────────────────────────────────
// --radius: 0.75rem (12px) no DS. Variantes derivadas seguem o CSS.
#define RADIUS_SM 8
#define RADIUS_MD 10
#define RADIUS_LG 12
#define RADIUS_XL 16

// Helper: resolve temperatura -> cor por range. Da' feedback visual sobre
// o estado da estufa em escala fria->quente:
//   < 25 °C: azul     (frio)
//   25-27:   verde    (ideal — primary)
//   28-30:   laranja  (morno, atencao)
//   > 30:    vermelho (quente, perigo)
// Cores sao tokens DS (COL_*), nao arbitrarias.
static inline uint32_t tempColor(float t) {
  if (t < 25.0f) return COL_BLU;
  if (t < 28.0f) return COL_PRIMARY;
  if (t <= 30.0f) return COL_PHASE_HARVEST;
  return COL_RED;
}

// Helper: resolve VPD (kPa) -> cor token por faixa.
//   < 0.8 kPa  : azul   (UMIDO — VPD baixo, stomatos fechados, risco mofo)
//   0.8–1.2 kPa: verde  (IDEAL — faixa veg/flora equilibrada)
//   > 1.2 kPa  : amarelo (SECO  — VPD alto, stress hidrico, ponta queimada)
static inline uint32_t vpdColor(float v) {
  if (v < 0.8f)  return COL_CYN;      // azul  — umido
  if (v <= 1.2f) return COL_PRIMARY;  // verde — ideal
  return COL_YEL;                      // amarelo — seco
}

// Helper: retorna nome curto da zona de VPD (ASCII — LVGL nao renderiza emoji).
static inline const char* vpdZone(float v) {
  if (v < 0.8f)  return "UMIDO";
  if (v <= 1.2f) return "IDEAL";
  return "SECO";
}

// Helper: resolve nome de fase ("VEGA"/"FLORA"/"DRYING"/etc) -> cor token.
// Default = primary (caso fase desconhecida ou string vazia).
static inline uint32_t phaseColor(const char *fase) {
  if (!fase || !*fase) return COL_PRIMARY;
  // Comparacao case-sensitive — server envia uppercase ("VEGA", "FLORA").
  if (fase[0] == 'V')                 return COL_PHASE_VEGETATIVE;  // VEGA
  if (fase[0] == 'F' && fase[1] == 'L') {
    if (fase[2] == 'O')               return COL_PHASE_FLOWERING;   // FLORA, FLORACAO
    if (fase[2] == 'U')               return COL_PHASE_FLUSHING;    // FLUSHING
  }
  if (fase[0] == 'D')                 return COL_PHASE_DRYING;      // DRYING
  if (fase[0] == 'C')                 return COL_PHASE_CURING;      // CURING
  if (fase[0] == 'H')                 return COL_PHASE_HARVEST;     // HARVEST
  if (fase[0] == 'M')                 return COL_PHASE_MAINTENANCE; // MAINTENANCE
  if (fase[0] == 'S')                 return COL_PHASE_SEEDLING;    // SEEDLING
  return COL_PRIMARY;
}
