#pragma once
#include "lvgl.h"

#ifdef __cplusplus
extern "C" {
#endif

// Fontes Wokwi (320x240) — compactas, Manrope (sem migrar p/ Geist no Wokwi)
extern const lv_font_t manrope_bold_28;
extern const lv_font_t manrope_bold_18;
extern const lv_font_t manrope_sb_14;
extern const lv_font_t manrope_sb_12;

// Fontes hardware real (480x320) — Geist (Cultivo Design System).
// Variable font instanciada em Bold (700) + SemiBold (600). cultivo_layout.h
// mapeia FONT_VALUE/TITLE/BODY/CAPTION pra elas no env=real.
extern const lv_font_t geist_bold_40;
extern const lv_font_t geist_bold_24;
extern const lv_font_t geist_sb_18;
extern const lv_font_t geist_sb_14;

// Inter (escolha do Joao; substitui Geist no real+sim). Mesmas opts (4bpp,
// range latino) nos 4 tamanhos. cultivo_layout.h aponta FONT_* pra elas.
extern const lv_font_t inter_bold_40;
extern const lv_font_t inter_bold_24;
extern const lv_font_t inter_sb_18;
extern const lv_font_t inter_sb_14;

// Manrope ainda usado p/ Wokwi (acima); arquivos .c removidos do build em real
// quando esse migrar. Aliases mantidos pra build atual nao quebrar.
extern const lv_font_t manrope_bold_40;
extern const lv_font_t manrope_bold_24;
extern const lv_font_t manrope_sb_18;

#ifdef __cplusplus
}
#endif
