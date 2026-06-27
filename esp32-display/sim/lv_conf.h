/**
 * lv_conf.h para o simulador SDL2 (Mac).
 *
 * Espelha os flags de platformio.ini (esp32-display/platformio.ini) pra
 * manter paridade visual com o firmware real, e habilita o driver SDL da
 * LVGL 9.2 pra renderizar em uma janela nativa no Mac.
 */

#ifndef LV_CONF_H
#define LV_CONF_H

#include <stdint.h>

/*====================
 * Configuracoes gerais
 *====================*/

/* RGB565 — mesmo formato do ESP32 (ILI9341 / AXS15231B).
 * Mantemos 16-bit pra paridade visual. */
#define LV_COLOR_DEPTH 16

/*=========================
 * Recursos / Memoria
 *=========================*/
#define LV_USE_STDLIB_MALLOC   LV_STDLIB_CLIB
#define LV_USE_STDLIB_STRING   LV_STDLIB_CLIB
#define LV_USE_STDLIB_SPRINTF  LV_STDLIB_CLIB

/* Desabilita otimizacoes assembly (NEON/Helium) — os arquivos .S usam
 * diretivas GCC que nao compilam com o assembler do Apple no macOS ARM64. */
#define LV_DRAW_SW_ASM LV_DRAW_SW_ASM_NONE

/*====================
 * HAL
 *====================*/
#define LV_TICK_CUSTOM 0  /* SDL driver chama lv_tick_inc automaticamente */
#define LV_DEF_REFR_PERIOD 16  /* ~60 FPS */

/*====================
 * Logging
 *====================*/
#define LV_USE_LOG 1
#define LV_LOG_LEVEL LV_LOG_LEVEL_WARN
#define LV_LOG_PRINTF 1

/*====================
 * Asserts (uteis no desenvolvimento)
 *====================*/
#define LV_USE_ASSERT_NULL      1
#define LV_USE_ASSERT_MALLOC    1

/*====================
 * OS
 *====================*/
#define LV_USE_OS LV_OS_NONE

/*====================
 * Snapshot (captura 1:1 pro preview no chat — modo --shot do sim_main)
 *====================*/
#define LV_USE_SNAPSHOT 1

/*====================
 * Widgets
 *====================*/
/* Todos ativos por default no 9.2 — deixamos como vem */

/*====================
 * Fontes
 *====================*/
/* Necessarias pelo teclado (glyphs FontAwesome) */
#define LV_FONT_MONTSERRAT_14 1
#define LV_FONT_MONTSERRAT_24 1
#define LV_FONT_DEFAULT &lv_font_montserrat_14

/*====================
 * Drivers
 *====================*/
#define LV_USE_SDL              1
#define LV_SDL_INCLUDE_PATH     <SDL2/SDL.h>
#define LV_SDL_RENDER_MODE      LV_DISPLAY_RENDER_MODE_DIRECT
#define LV_SDL_BUF_COUNT        1
#define LV_SDL_FULLSCREEN       0
#define LV_SDL_MOUSEWHEEL_MODE  LV_SDL_MOUSEWHEEL_MODE_ENCODER

#endif /* LV_CONF_H */
