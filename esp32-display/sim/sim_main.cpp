// ════════════════════════════════════════════════════════════════════════════════
// sim_main.cpp — entrypoint do simulador SDL2 para Mac/Linux
//
// Cria janela SDL 480×320 (tamanho do display real JC4832W535), inicializa
// LVGL via driver SDL nativo (LV_USE_SDL=1) e chama buildCultivoUI() que esta
// em cultivo_ui.cpp. Roda o timer loop do LVGL indefinidamente.
//
// Build:
//   cd esp32-display/sim
//   cmake -B build
//   cmake --build build
//   ./build/cultivo_sim
// ════════════════════════════════════════════════════════════════════════════════

#include <SDL2/SDL.h>
#include <unistd.h>
#include <cstdio>

#include "lvgl.h"
// Quando LV_USE_SDL=1 em lv_conf.h, lvgl.h expoe lv_sdl_window_create /
// lv_sdl_mouse_create via src/drivers/sdl/lv_sdl_*.h (incluido transitivamente).

#include "cultivo_ui.h"

#define SIM_W 480
#define SIM_H 320

int main(int argc, char *argv[]) {
  (void)argc; (void)argv;

  lv_init();

  // Display + mouse via driver SDL built-in da LVGL 9
  lv_display_t *disp = lv_sdl_window_create(SIM_W, SIM_H);
  lv_sdl_window_set_title(disp, "Cultivo — Simulator (Mac)");

  lv_indev_t *mouse = lv_sdl_mouse_create();
  (void)mouse;

  printf("[sim] LVGL %d.%d.%d + SDL2 pronto em %dx%d\n",
         LVGL_VERSION_MAJOR, LVGL_VERSION_MINOR, LVGL_VERSION_PATCH,
         SIM_W, SIM_H);

  // Constroi a UI do Cultivo (mesma estrutura do main_lvgl.cpp, mas com
  // dados mockados — sem WiFi/HTTP/sensores reais).
  buildCultivoUI();

  // Loop principal — LVGL agenda os frames internamente via timers.
  while (1) {
    uint32_t timeTillNext = lv_timer_handler();
    if (timeTillNext == LV_NO_TIMER_READY) timeTillNext = 10;
    SDL_Delay(timeTillNext);
  }

  return 0;
}
