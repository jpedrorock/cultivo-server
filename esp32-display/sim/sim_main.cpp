// ════════════════════════════════════════════════════════════════════════════════
// sim_main.cpp — entrypoint do simulador SDL2 para Mac/Linux
//
// Cria janela SDL 480×320 (tamanho do display real JC4832W535), inicializa
// LVGL via driver SDL nativo (LV_USE_SDL=1) e chama buildCultivoUI() que esta
// em cultivo_ui.cpp. Roda o timer loop do LVGL indefinidamente.
//
// Modos:
//   ./build/cultivo_sim            → janela interativa (loop normal)
//   ./build/cultivo_sim --shot X   → renderiza ~120 frames, salva BMP em X e sai
//                                    (preview 1:1 do firmware real, sem permissoes)
//
// Build:
//   cd esp32-display/sim && cmake -B build && cmake --build build
// ════════════════════════════════════════════════════════════════════════════════

#include <SDL2/SDL.h>
#include <unistd.h>
#include <cstdio>
#include <cstring>

#include "lvgl.h"
// Quando LV_USE_SDL=1 em lv_conf.h, lvgl.h expoe lv_sdl_window_create /
// lv_sdl_mouse_create via src/drivers/sdl/lv_sdl_*.h (incluido transitivamente).

#include "cultivo_ui.h"

extern "C" void cultivoUI_showIdleOverlay(void);
extern "C" void cultivoUI_hideIdleOverlay(void);
extern "C" void cultivoUI_tickIdleOverlay(void);

#define SIM_W 480
#define SIM_H 320

// Escreve um BMP 32-bit (BGRA, bottom-up) a partir do buffer ARGB8888 do LVGL.
// ARGB8888 em memoria little-endian = bytes B,G,R,A — bate com o esperado pelo BMP.
static void write_bmp(const char *path, const uint8_t *px, int w, int h, uint32_t stride) {
  FILE *f = fopen(path, "wb");
  if (!f) { printf("[shot] fopen falhou: %s\n", path); return; }
  uint32_t imgSize = (uint32_t)w * h * 4;
  uint32_t fileSize = 54 + imgSize;
  uint8_t H[54];
  memset(H, 0, sizeof(H));
  H[0] = 'B'; H[1] = 'M';
  H[2] = fileSize; H[3] = fileSize >> 8; H[4] = fileSize >> 16; H[5] = fileSize >> 24;
  H[10] = 54;   // offset dos pixels
  H[14] = 40;   // tamanho do DIB header
  H[18] = w; H[19] = w >> 8; H[20] = w >> 16; H[21] = w >> 24;
  H[22] = h; H[23] = h >> 8; H[24] = h >> 16; H[25] = h >> 24;
  H[26] = 1;    // planes
  H[28] = 32;   // bpp
  H[34] = imgSize; H[35] = imgSize >> 8; H[36] = imgSize >> 16; H[37] = imgSize >> 24;
  fwrite(H, 1, 54, f);
  for (int y = h - 1; y >= 0; y--)
    fwrite(px + (size_t)y * stride, 1, (size_t)w * 4, f);
  fclose(f);
  printf("[shot] BMP salvo: %s (%dx%d stride=%u)\n", path, w, h, stride);
}

int main(int argc, char *argv[]) {
  setvbuf(stdout, NULL, _IONBF, 0);  // flush imediato (logs aparecem mesmo redirecionado)
  bool shot     = (argc >= 2 && strcmp(argv[1], "--shot") == 0);
  bool idletest = (argc >= 2 && strcmp(argv[1], "--idletest") == 0);
  const char *shotPath = (argc >= 3) ? argv[2] : "/tmp/cultivo_shot.bmp";

  lv_init();

  // Display + mouse via driver SDL built-in da LVGL 9
  lv_display_t *disp = lv_sdl_window_create(SIM_W, SIM_H);
  lv_sdl_window_set_title(disp, "Cultivo — Simulator (Mac)");

  lv_indev_t *mouse = lv_sdl_mouse_create();
  (void)mouse;

  printf("[sim] LVGL %d.%d.%d + SDL2 pronto em %dx%d (shot=%d)\n",
         LVGL_VERSION_MAJOR, LVGL_VERSION_MINOR, LVGL_VERSION_PATCH,
         SIM_W, SIM_H, (int)shot);

  // Constroi a UI do Cultivo (mesma estrutura do main_lvgl.cpp, mas com
  // dados mockados — sem WiFi/HTTP/sensores reais).
  buildCultivoUI();

  if (idletest) {
    // Reproduz o ciclo sleep/wake: mostra e esconde o idle overlay varias vezes,
    // rodando o timer (que executa anims) entre cada passo. Use-after-free ou
    // double-free no show/hide aparece como segfault aqui.
    for (int cyc = 0; cyc < 10; cyc++) {
      printf("[idletest] cyc %d show\n", cyc);
      cultivoUI_showIdleOverlay();
      for (int i = 0; i < 25; i++) { cultivoUI_tickIdleOverlay(); lv_timer_handler(); SDL_Delay(4); }
      printf("[idletest] cyc %d hide\n", cyc);
      cultivoUI_hideIdleOverlay();
      for (int i = 0; i < 25; i++) { lv_timer_handler(); SDL_Delay(4); }
    }
    printf("[idletest] OK — 10 ciclos sem crash\n");
    return 0;
  }

  if (shot) {
    // Roda ~120 frames (~2s) pra o mockTimer popular valores + animacoes
    // assentarem, depois faz snapshot da tela ativa e salva o BMP.
    for (int i = 0; i < 120; i++) { lv_timer_handler(); SDL_Delay(16); }
    lv_draw_buf_t *snap = lv_snapshot_take(lv_screen_active(), LV_COLOR_FORMAT_ARGB8888);
    if (snap) {
      write_bmp(shotPath, (const uint8_t *)snap->data,
                snap->header.w, snap->header.h, snap->header.stride);
      lv_draw_buf_destroy(snap);
    } else {
      printf("[shot] lv_snapshot_take retornou NULL\n");
    }
    return 0;
  }

  // Loop principal — LVGL agenda os frames internamente via timers.
  while (1) {
    uint32_t timeTillNext = lv_timer_handler();
    if (timeTillNext == LV_NO_TIMER_READY) timeTillNext = 10;
    SDL_Delay(timeTillNext);
  }

  return 0;
}
