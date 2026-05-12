// ════════════════════════════════════════════════════════════════════════════════
// cultivo_ui.cpp — UI compartilhada entre simulador SDL2 e firmware ESP32-S3
//
// Constroi as 5 telas principais + navbar + animacoes. Nao inclui:
//   - splash / AP portal / modal de config (firmware-only, em main_lvgl.cpp)
//   - WiFi / HTTP / NVS (firmware-only)
//   - inicializacao de display/touch (hal_platform.h)
//
// Resolucao escolhida via macros HAL_SCREEN_W/H em cultivo_layout.h:
//   REAL_HARDWARE  → 480x320 (JC4832W535)
//   CULTIVO_SIM    → 480x320 (sim Mac/SDL2)
//   default Wokwi  → 320x240 (ILI9341)
//
// O app (sim ou firmware) escreve sensor state nos globals tempC/rh/etc.
// e chama refreshHomeValues() pra forcar redraw. Save handlers do usuario
// podem ser registrados via cultivoUI_setXxxHandler() — defaults so' printf.
// ════════════════════════════════════════════════════════════════════════════════

#include "lvgl.h"
#include "cultivo_icons.h"
#include "cultivo_layout.h"   // HAL_SCREEN_W/H + FONT_* + cores
#include "cultivo_ui.h"

#include <cstdio>
#include <cstring>
#include <cmath>
#include <cstdlib>

// PSRAM alloc (firmware) ou stub stdlib (sim)
#ifdef REAL_HARDWARE
  #include "esp_heap_caps.h"
#else
  #define heap_caps_malloc(sz, caps) malloc(sz)
  #define heap_caps_free(p)          free(p)
  #define MALLOC_CAP_SPIRAM 0
  #define MALLOC_CAP_8BIT   0
#endif

// ════════════════════════════════════════════════════════════════════════════════
// Aliases de tela / helpers de escala
// ════════════════════════════════════════════════════════════════════════════════
static const int SCREEN_W = HAL_SCREEN_W;
static const int SCREEN_H = HAL_SCREEN_H;
// Wokwi 320x240 -> nav 48; real 480x320 e sim -> nav 54.
static const int TABBAR_H = (SCREEN_H >= 320) ? 54 : 48;
static const int TAB_H    = SCREEN_H - TABBAR_H;

// Escala relativa ao design Wokwi 320x240
static inline int sw(int v) { return (v * SCREEN_W) / 320; }
static inline int sh(int v) { return (v * SCREEN_H) / 240; }
// ss() = menor dos dois — pra elementos quadrados (botoes circulares, icones).
static inline int ss(int v) { return sw(v) < sh(v) ? sw(v) : sh(v); }

// Grid de layout compartilhado — evita magic numbers em cada screen
static const int HEADER_H    = 34;
static const int GUTTER      = 8;
static const int CARD_RADIUS = 10;
static const int TOUCH_MIN   = 32;

// ════════════════════════════════════════════════════════════════════════════════
// Sensor state — declarado em cultivo_ui.h como extern. App escreve aqui.
// ════════════════════════════════════════════════════════════════════════════════
char  TENT_NAME[50] = "ESTUFA 1";
char  FASE[20]      = "FLORACAO";
float tempC = 24.5f, rh = 62.0f, vpd = 1.1f, phv = 6.2f, ecv = 1.8f;
int   semana = 4, totalSem = 16;
bool  wifiOk = false;        // firmware: setado pelo connectWifi(); sim: forcado p/ true em sim_main.cpp
int   currentLux = 0;
int   currentPpfd = 430;
int   targetPpfd  = 450;
int   luxMode     = 0;       // 0=PPFD, 1=LUX
static const int LUX_PER_PPFD = 54;
static const int STEP_PPFD    = 25;

// ════════════════════════════════════════════════════════════════════════════════
// Save handlers (registrados pelo app; defaults imprimem via printf)
// ════════════════════════════════════════════════════════════════════════════════
static CultivoSaveLuxFn      onLuxSave     = nullptr;
static CultivoSavePhEcFn     onPhEcSave    = nullptr;
static CultivoOpenConfigFn   onConfigOpen  = nullptr;
static CultivoRefreshFn      onRefresh     = nullptr;
static CultivoSceneTriggerFn onSceneTrigger = nullptr;
static CultivoWifiReconnectFn onWifiReconnect = nullptr;

extern "C" void cultivoUI_setLuxSaveHandler(CultivoSaveLuxFn cb)         { onLuxSave    = cb; }
extern "C" void cultivoUI_setPhEcSaveHandler(CultivoSavePhEcFn cb)       { onPhEcSave   = cb; }
extern "C" void cultivoUI_setConfigOpenHandler(CultivoOpenConfigFn cb)   { onConfigOpen = cb; }
extern "C" void cultivoUI_setRefreshHandler(CultivoRefreshFn cb)         { onRefresh    = cb; }
extern "C" void cultivoUI_setSceneTriggerHandler(CultivoSceneTriggerFn cb) { onSceneTrigger = cb; }
extern "C" void cultivoUI_setWifiReconnectHandler(CultivoWifiReconnectFn cb) { onWifiReconnect = cb; }

// Estado de refresh em andamento + spin do icone refresh top-right.
// refreshIcon = ponteiro pro ic_refresh do header (setado em buildHome).
// Spin tick incrementa angulo a cada 50ms. Para sozinho quando isRefreshing
// vira false (refreshHomeValues seta) ou quando timeout (10s sem resposta).
static bool isRefreshing = false;
static lv_timer_t *refreshSpinTimer = nullptr;
static lv_obj_t  *refreshIcon       = nullptr;
static uint32_t   refreshStartedAt  = 0;
static int32_t    refreshAngle      = 0;
#define REFRESH_TIMEOUT_MS 10000

// Forward decl — definida apos showToast
static void showToast(const char *msg);

static void refreshSpinTick(lv_timer_t *t) {
  // Timeout — server nao respondeu em 10s, libera flag + avisa user
  if (isRefreshing && (lv_tick_get() - refreshStartedAt > REFRESH_TIMEOUT_MS)) {
    isRefreshing = false;
    showToast("Falha — tente novamente");
  }

  if (!isRefreshing) {
    // Para timer + reseta rotacao do icone (volta ao angulo 0)
    lv_timer_del(t);
    refreshSpinTimer = nullptr;
    refreshAngle = 0;
    if (refreshIcon) {
      lv_obj_set_style_transform_rotation(refreshIcon, 0, 0);
    }
    return;
  }

  // Incremento de 36 decimos = 3.6 graus por tick. 50ms tick → 72 graus/s
  // → ~5s por volta completa. Visualmente "trabalhando", nao frenetico.
  refreshAngle = (refreshAngle + 36) % 3600;
  if (refreshIcon) {
    lv_obj_set_style_transform_rotation(refreshIcon, refreshAngle, 0);
  }
}

extern "C" void cultivoUI_setRefreshing(bool active) {
  isRefreshing = active;
}

// ════════════════════════════════════════════════════════════════════════════════
// Widgets compartilhados entre screens (idem main_lvgl.cpp)
// ════════════════════════════════════════════════════════════════════════════════
// Navbar 5 tabs: Home / Hist / Dispositivos / Tarefas / Plantas
// DS: ativo SEMPRE em COL_PRIMARY (verde brand) com indicador linha 2px
// no topo do tab. Largura por tab: 480/5 = 96px (alvo de tap confortavel,
// icone 24-32px ao centro). Indicator ajusta proporcionalmente.
#define NAV_COUNT 5
// Ordem dos tabs (esquerda -> direita):
//   0=Home  1=Plantas  2=Historico  3=Tarefas  4=Cenas
static const lv_image_dsc_t *NAV_ICONS_IMG[NAV_COUNT] = {
  &ic_home, &ic_sprout, &ic_activity, &ic_tasks, &ic_grid
};

static lv_obj_t *contentArea;
static lv_obj_t *screenHome, *screenTarefa, *screenGrafic, *screenTasks, *screenPlants;
static lv_obj_t *screenLux = nullptr, *screenPhEc = nullptr;  // legacy refs
static lv_obj_t *navbar;
static lv_obj_t *navIcons[NAV_COUNT];
int activeScreen = 0;

static lv_obj_t *lblTitle, *lblSub, *lblWifi;
static lv_obj_t *lblTemp, *lblRh, *lblVpd;
// lblPpfd / sparkPpfd / serPpfdS removidos — card PPFD substituido pelo card
// CICLO (mostra Sem X/Y + badge fase). PPFD continua acessivel via tap-pra-
// ciclar no anel principal (modo arcMode=3 com FASE).
static lv_obj_t *lblPpfd = nullptr;  // legacy ref — pode sair se nada referencia
// Card CICLO — substitui PPFD no slot 3. lblCycleVal mostra "Sem X/Y",
// lblCycleBadge e' a pill colorida com nome da fase (FLORA/VEGA/...) na
// cor do phase token. Atualizados em refreshHomeValues.
static lv_obj_t *lblCycleVal   = nullptr;
static lv_obj_t *lblCycleBadge = nullptr;
// Container do card ciclo — guardamos pra re-tintar o gradient quando a
// fase mudar (refreshHomeValues). Sem isso, o tint ficava fixo na fase do boot.
static lv_obj_t *cardCycle     = nullptr;
// lblTemp = numero grande do arc; lblEcHome/lblPhHome legacy.
static lv_obj_t *lblEcHome = nullptr, *lblPhHome = nullptr;  // legacy
static lv_obj_t *lblCiclo = nullptr, *ciclBar = nullptr;     // legacy
static lv_obj_t *homeFaceA;                   // container dos mini-cards
// Header + unit do arc — agora dinamicos pq tap cicla TEMP/pH/EC/FLOR
static lv_obj_t *lblArcHdr = nullptr;
static lv_obj_t *lblArcUnit = nullptr;
static lv_obj_t *arcTemp;
// arcMode: 0=TEMP, 1=pH, 2=EC, 3=FLORACAO. Tap no arc cicla.
static int arcMode = 0;
// Forward declaration: updateArcMode e' chamado em buildHome (load + tap)
// e em refreshHomeValues, mas a definicao vem depois — por que' a logica
// referencia globais que sao setadas em buildHome (lblArcHdr/Unit).
static void updateArcMode();
static lv_obj_t *sparkRh, *sparkVpd;
static lv_obj_t *sparkPpfd = nullptr;  // legacy — card PPFD removido
static lv_chart_series_t *serRhS, *serVpdS;
static lv_chart_series_t *serPpfdS = nullptr;  // legacy
static lv_timer_t *pulseTimer = nullptr;
#ifdef CULTIVO_SIM
static lv_timer_t *mockTimer  = nullptr;
#endif

static lv_obj_t *lblLuxValue, *lblLuxUnit, *luxBar;
static lv_obj_t *btnModePpfd, *btnModeLux;

// ════════════════════════════════════════════════════════════════════════════════
// Helpers visuais (identicos ao main_lvgl.cpp)
// ════════════════════════════════════════════════════════════════════════════════
// Tint subtil do card: troca o topo do gradient pra uma versao escura da
// cor da metrica, mantendo o bottom near-black. Aplicar APOS makeCard.
//   factor = 30..80 fica subtle (recomendado 50). 0=preto, 255=cor pura.
static void tintCard(lv_obj_t *c, uint32_t color, uint8_t factor = 50) {
  uint8_t r = ((color >> 16) & 0xFF) * factor / 255;
  uint8_t g = ((color >> 8)  & 0xFF) * factor / 255;
  uint8_t b = ( color        & 0xFF) * factor / 255;
  uint32_t top = ((uint32_t)r << 16) | ((uint32_t)g << 8) | b;
  lv_obj_set_style_bg_color(c, lv_color_hex(top), 0);
  // bg_grad_color ja' eh 0x050811 do makeCard — mantemos o fade pra preto
}

static lv_obj_t* makeCard(lv_obj_t *parent, int x, int y, int w, int h) {
  lv_obj_t *c = lv_obj_create(parent);
  lv_obj_set_size(c, w, h);
  lv_obj_set_pos(c, x, y);
  lv_obj_set_style_bg_color(c, lv_color_hex(0x243142), 0);
  lv_obj_set_style_bg_grad_color(c, lv_color_hex(0x050811), 0);
  lv_obj_set_style_bg_grad_dir(c, LV_GRAD_DIR_VER, 0);
  lv_obj_set_style_bg_main_stop(c, 0, 0);
  lv_obj_set_style_bg_grad_stop(c, 230, 0);
  lv_obj_set_style_bg_opa(c, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(c, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_border_width(c, 1, 0);
  lv_obj_set_style_radius(c, 10, 0);
  lv_obj_set_style_pad_all(c, 6, 0);
  lv_obj_set_style_shadow_color(c, lv_color_hex(0x000000), 0);
  lv_obj_set_style_shadow_width(c, 12, 0);
  lv_obj_set_style_shadow_opa(c, LV_OPA_50, 0);
  lv_obj_set_style_shadow_spread(c, 0, 0);
  lv_obj_set_style_shadow_ofs_x(c, 0, 0);
  lv_obj_set_style_shadow_ofs_y(c, 4, 0);
  lv_obj_clear_flag(c, LV_OBJ_FLAG_SCROLLABLE);
  return c;
}

static void anim_shadow_opa_cb(void *obj, int32_t v) {
  lv_obj_set_style_shadow_opa((lv_obj_t*)obj, v, 0);
}

static void startBreathe(lv_obj_t *obj, uint32_t minOpa, uint32_t maxOpa, uint32_t periodMs) {
  lv_anim_t a;
  lv_anim_init(&a);
  lv_anim_set_var(&a, obj);
  lv_anim_set_values(&a, minOpa, maxOpa);
  lv_anim_set_time(&a, periodMs);
  lv_anim_set_playback_time(&a, periodMs);
  lv_anim_set_repeat_count(&a, LV_ANIM_REPEAT_INFINITE);
  lv_anim_set_exec_cb(&a, anim_shadow_opa_cb);
  lv_anim_start(&a);
}

static void applyBloom(lv_obj_t *obj, uint32_t color) {
  lv_obj_set_style_shadow_color(obj, lv_color_hex(color), 0);
  lv_obj_set_style_shadow_width(obj, 28, 0);
  lv_obj_set_style_shadow_opa(obj, LV_OPA_70, 0);
  lv_obj_set_style_shadow_spread(obj, 2, 0);
  lv_obj_set_style_shadow_ofs_x(obj, 0, 0);
  lv_obj_set_style_shadow_ofs_y(obj, 0, 0);
  startBreathe(obj, LV_OPA_40, LV_OPA_80, 2200);
}

static void anim_outline_opa_cb(void *obj, int32_t v) {
  lv_obj_set_style_outline_opa((lv_obj_t*)obj, v, 0);
}

static void applyRingPulse(lv_obj_t *card, uint32_t color,
                           uint32_t periodMs = 2800, uint32_t delayMs = 0) {
  lv_obj_set_style_outline_color(card, lv_color_hex(color), 0);
  lv_obj_set_style_outline_width(card, 2, 0);
  lv_obj_set_style_outline_pad(card, 0, 0);
  lv_obj_set_style_outline_opa(card, LV_OPA_0, 0);
  lv_anim_t a;
  lv_anim_init(&a);
  lv_anim_set_var(&a, card);
  lv_anim_set_values(&a, LV_OPA_0, LV_OPA_60);
  lv_anim_set_time(&a, periodMs);
  lv_anim_set_playback_time(&a, periodMs);
  lv_anim_set_delay(&a, delayMs);
  lv_anim_set_repeat_count(&a, LV_ANIM_REPEAT_INFINITE);
  lv_anim_set_exec_cb(&a, anim_outline_opa_cb);
  lv_anim_start(&a);
}

static lv_obj_t* makeLabel(lv_obj_t *parent, const char *text, uint32_t color,
                            const lv_font_t *font, lv_align_t align, int x, int y) {
  lv_obj_t *l = lv_label_create(parent);
  lv_label_set_text(l, text);
  lv_obj_set_style_text_color(l, lv_color_hex(color), 0);
  if (font) lv_obj_set_style_text_font(l, font, 0);
  lv_obj_align(l, align, x, y);
  return l;
}

// Cor dinamica baseada em faixas saudaveis (mesmo do firmware real)
static uint32_t cTemp(float t) {
  if (t < 18 || t > 30) return COL_RED;
  if (t < 21 || t > 27) return COL_YEL;
  return COL_GRN;
}
static uint32_t cRH(float h) {
  if (h < 40 || h > 75) return COL_RED;
  if (h < 50 || h > 70) return COL_YEL;
  return COL_CYN;
}

// ════════════════════════════════════════════════════════════════════════════════
// Tela HOME — arc TEMP gigante + 3 mini-cards (UMIDADE / pH / EC) com sparklines
// ════════════════════════════════════════════════════════════════════════════════
static void buildHome(lv_obj_t *tab) {
  lv_obj_set_style_pad_all(tab, 0, 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_bg_color(tab, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(tab, LV_OPA_COVER, 0);

  // ── Header (DS): TITULO                                       [gear][wifi]
  // Sem icone refresh — server ja' faz polling a cada 30s, refresh manual
  // ficou redundante. Tap no card UMID continua disponivel como atalho
  // discreto pra quem quiser forcar pull on-demand (mostra toast).
  lblTitle = makeLabel(tab, TENT_NAME, COL_TEXT, FONT_TITLE, LV_ALIGN_TOP_LEFT, sw(8), sh(10));
  lblSub = nullptr;  // legacy — semana/fase agora no card CICLO

  lv_obj_t *wifiIcon = lv_image_create(tab);
  lv_image_set_src(wifiIcon, wifiOk ? &ic_wifi : &ic_wifi_off);
  lv_obj_set_style_image_recolor(wifiIcon, lv_color_hex(wifiOk ? COL_PRIMARY : COL_DIM), 0);
  lv_obj_set_style_image_recolor_opa(wifiIcon, LV_OPA_COVER, 0);
  lv_obj_align(wifiIcon, LV_ALIGN_TOP_RIGHT, -sw(4), sh(4));
  lblWifi = wifiIcon;
  // Tap no icone — se offline, pede reconexao ao app (vai forcar WiFi
  // begin novamente sem esperar o retry de 30s). Se online, so mostra
  // toast de status — usuario sabe que ta tudo OK.
  lv_obj_add_flag(wifiIcon, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_ext_click_area(wifiIcon, sw(10));
  lv_obj_add_event_cb(wifiIcon, [](lv_event_t *e) {
    if (wifiOk) {
      showToast("WiFi conectado");
    } else {
      showToast("Reconectando WiFi...");
      if (onWifiReconnect) onWifiReconnect();
    }
  }, LV_EVENT_CLICKED, NULL);

  // Gear — abre modal de config. Era LV_SYMBOL_SETTINGS em font 24
  // (~15px efetivo, ficava menor que os icones rasterizados de 32px).
  // Trocado por ic_settings (imagem 32px) pra match visual com refresh+wifi.
  lv_obj_t *btnCfg = lv_image_create(tab);
  lv_image_set_src(btnCfg, &ic_settings);
  lv_obj_set_style_image_recolor(btnCfg, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_image_recolor_opa(btnCfg, LV_OPA_COVER, 0);
  lv_obj_align(btnCfg, LV_ALIGN_TOP_RIGHT, -sw(44), sh(4));
  lv_obj_add_flag(btnCfg, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_ext_click_area(btnCfg, sw(8));
  lv_obj_add_event_cb(btnCfg, [](lv_event_t *e) {
    (void)e;
    if (onConfigOpen) onConfigOpen();
  }, LV_EVENT_CLICKED, NULL);

  // Refresh icon — botao explicito de "atualizar agora". Servia como
  // backup quando polling 30s falhava em update visivel (WiFi lento, server
  // demora, etc.). Trackado em refreshIcon pra a animacao de rotacao
  // (controlada por isRefreshing) acontecer durante o fetch.
  refreshIcon = lv_image_create(tab);
  lv_image_set_src(refreshIcon, &ic_refresh);
  lv_obj_set_style_image_recolor(refreshIcon, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_image_recolor_opa(refreshIcon, LV_OPA_COVER, 0);
  lv_obj_align(refreshIcon, LV_ALIGN_TOP_RIGHT, -sw(84), sh(4));
  lv_obj_add_flag(refreshIcon, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_ext_click_area(refreshIcon, sw(8));
  lv_obj_add_event_cb(refreshIcon, [](lv_event_t *e) {
    (void)e;
    if (onRefresh && !isRefreshing) {
      isRefreshing = true;
      showToast("Atualizando...");
      onRefresh();  // netTask pega refreshPending e refaz fetchDisplay/scenes/tasks/plants/history
    } else if (isRefreshing) {
      showToast("Ja' atualizando");
    }
  }, LV_EVENT_CLICKED, NULL);

  // Single-face redesign: sem botao flip. Tap no arc cicla TEMP/pH/EC/FLORACAO.
  // Mini-cards UMID/VPD/PPFD ficam sempre visiveis a direita.

  // Corpo: arc grande a esquerda + mini-cards a direita.
  int bodyY = sh(42);
  int bodyH = TAB_H - bodyY - sh(4);
  int halfW = SCREEN_W / 2;

  int arcSize = (bodyH < halfW - sw(8)) ? bodyH : halfW - sw(8);
  arcTemp = lv_arc_create(tab);
  lv_obj_set_size(arcTemp, arcSize, arcSize);
  lv_obj_set_pos(arcTemp, (halfW - arcSize) / 2, bodyY + (bodyH - arcSize) / 2);
  lv_arc_set_range(arcTemp, 0, 40);
  lv_arc_set_value(arcTemp, (int)tempC);
  lv_arc_set_bg_angles(arcTemp, 135, 45);
  lv_arc_set_rotation(arcTemp, 0);
  lv_obj_remove_style(arcTemp, NULL, LV_PART_KNOB);
  // Tap no arc -> cicla TEMP -> pH -> EC -> FLORACAO -> ... E aciona refresh
  // do server (1 tap = ver outro modo + puxar dados frescos).
  lv_obj_add_flag(arcTemp, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_ext_click_area(arcTemp, sw(4));
  lv_obj_add_event_cb(arcTemp, [](lv_event_t *e) {
    (void)e;
    arcMode = (arcMode + 1) % 4;
    updateArcMode();
    if (onRefresh && !isRefreshing) {
      isRefreshing = true;
      onRefresh();  // refresh em paralelo — refreshHomeValues aplica quando voltar
    }
  }, LV_EVENT_CLICKED, NULL);
  // Anel DS: track neutro COL_BORDER + indicator COL_PRIMARY (verde brand).
  // Sem variar cor por modo — phase ja' aparece no badge do header. Shadow
  // suave (era 60 opa, agora 30) pra ficar menos "neon" e mais "premium".
  lv_obj_set_style_bg_opa(arcTemp, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(arcTemp, 0, 0);
  lv_obj_set_style_pad_all(arcTemp, 0, 0);
  lv_obj_set_style_arc_width(arcTemp, sw(8),  LV_PART_MAIN);
  lv_obj_set_style_arc_color(arcTemp, lv_color_hex(COL_BORDER), LV_PART_MAIN);
  lv_obj_set_style_arc_opa(arcTemp, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_arc_width(arcTemp, sw(10), LV_PART_INDICATOR);
  lv_obj_set_style_arc_color(arcTemp, lv_color_hex(COL_PRIMARY), LV_PART_INDICATOR);
  lv_obj_set_style_shadow_color(arcTemp, lv_color_hex(COL_PRIMARY), LV_PART_INDICATOR);
  lv_obj_set_style_shadow_width(arcTemp, 12, LV_PART_INDICATOR);
  lv_obj_set_style_shadow_opa(arcTemp, LV_OPA_30, LV_PART_INDICATOR);

  // Header (TEMP/pH/EC/FASE) + valor + unit — todos dinamicos via updateArcMode
  lblArcHdr = lv_label_create(arcTemp);
  lv_label_set_text(lblArcHdr, "TEMP");
  lv_obj_set_style_text_color(lblArcHdr, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(lblArcHdr, FONT_CAPTION, 0);
  lv_obj_align(lblArcHdr, LV_ALIGN_CENTER, 0, -arcSize / 4);

  // Valor: branco fixo (DS hierarchy — cor nunca dispute com o anel)
  lblTemp = lv_label_create(arcTemp);
  lv_label_set_text(lblTemp, "--");
  lv_obj_set_style_text_color(lblTemp, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_text_font(lblTemp, FONT_VALUE, 0);
  lv_obj_align(lblTemp, LV_ALIGN_CENTER, 0, 0);

  lblArcUnit = lv_label_create(arcTemp);
  lv_label_set_text(lblArcUnit, "°C");
  lv_obj_set_style_text_color(lblArcUnit, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(lblArcUnit, FONT_CAPTION, 0);
  lv_obj_align(lblArcUnit, LV_ALIGN_CENTER, 0, arcSize / 4);

  // 3 mini-cards a direita — UMID/VPD altos (pra valor + sparkline respirarem)
  // + CICLO compacto (so' uma linha: icone + Sem X/Y + badge fase).
  // Distribuicao: cycleH fixo ~1/4 da altura, restante (3/4) dividido entre
  // UMID e VPD. Da' ~50% mais altura aos cards de metrica vs era 1/3 cada.
  int rightX = halfW + sw(2);
  int cardW = SCREEN_W - rightX - sw(4);
  int cardGap = sh(4);
  int cycleH = sh(38);                           // CICLO compacto (1 linha)
  int cardH = (bodyH - cycleH - 2 * cardGap) / 2; // UMID/VPD pegam o resto

  auto makeFaceContainer = [&]() -> lv_obj_t* {
    lv_obj_t *ctr = lv_obj_create(tab);
    lv_obj_set_size(ctr, cardW, bodyH);
    lv_obj_set_pos(ctr, rightX, bodyY);
    lv_obj_set_style_bg_opa(ctr, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(ctr, 0, 0);
    lv_obj_set_style_pad_all(ctr, 0, 0);
    lv_obj_clear_flag(ctr, LV_OBJ_FLAG_SCROLLABLE);
    return ctr;
  };
  homeFaceA = makeFaceContainer();

  // Mini-card DS — layout coerente com cards do app mobile:
  //   topo-esq:    [icone-cor] LABEL                                   [◉ wifi]
  //   centro-dir:                                            VALOR (branco)
  //   rodape-esq:  [─── sparkline ───]
  //
  // Sem ring-pulse colorido (era distrativo), sem bg do chart, valor sempre
  // em COL_TEXT branco (cor da metrica fica so' no icone + linha do chart).
  auto makeMiniCard = [&](lv_obj_t *parent, int yOffset, const char *label, const char *initVal,
                          uint32_t color, const lv_image_dsc_t *icon,
                          lv_obj_t **sparkOut, lv_chart_series_t **serOut) -> lv_obj_t* {
    lv_obj_t *c = makeCard(parent, 0, yOffset, cardW, cardH);
    lv_obj_set_style_pad_all(c, sw(4), 0);
    // Tint do gradient na cor da metrica — UMID ciano, VPD verde (COL_PRIMARY).
    // Subtle (factor 50/255 ~= 20%) — fica obvio sem ser saturado.
    tintCard(c, color, 50);

    int iconW      = sw(22);    // x-offset do label depois do icone
    int wifiW      = sw(14);    // espaco reservado pro mini wifi top-right
    int valueRoomW = sw(60);    // largura reservada pro VALOR na direita
    int chartH     = sh(10);
    int sparkW     = cardW - valueRoomW - sw(6);

    lv_obj_t *ico = lv_image_create(c);
    lv_image_set_src(ico, icon);
    lv_obj_set_style_image_recolor(ico, lv_color_hex(color), 0);
    lv_obj_set_style_image_recolor_opa(ico, LV_OPA_COVER, 0);
    lv_obj_align(ico, LV_ALIGN_TOP_LEFT, 0, sh(2));

    lv_obj_t *lb = lv_label_create(c);
    lv_label_set_text(lb, label);
    lv_obj_set_style_text_color(lb, lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_text_font(lb, FONT_CAPTION, 0);
    lv_obj_align(lb, LV_ALIGN_TOP_LEFT, iconW, sh(4));

    // Mini wifi top-right — verde quando dado fresh, dim quando offline.
    // Reduzido a ~50% (transform_zoom 128) pra nao competir com o icone
    // principal da metrica. Igual indicadores do app mobile.
    lv_obj_t *wifi = lv_image_create(c);
    lv_image_set_src(wifi, &ic_wifi);
    lv_obj_set_style_image_recolor(wifi, lv_color_hex(wifiOk ? COL_PRIMARY : COL_DIM), 0);
    lv_obj_set_style_image_recolor_opa(wifi, LV_OPA_COVER, 0);
    lv_obj_set_style_transform_zoom(wifi, 128, 0);   // ~50% (16->8px)
    lv_obj_align(wifi, LV_ALIGN_TOP_RIGHT, 0, sh(2));
    (void)wifiW;  // reservado pra alignment futuro

    // Valor: branco fixo (DS hierarchy). Cor da metrica fica so' no icone
    // e no sparkline — assim a leitura "olho bate primeiro no numero".
    lv_obj_t *v = lv_label_create(c);
    lv_label_set_text(v, initVal);
    lv_obj_set_style_text_color(v, lv_color_hex(COL_TEXT), 0);
    lv_obj_set_style_text_font(v, FONT_TITLE, 0);
    lv_obj_align(v, LV_ALIGN_RIGHT_MID, 0, 0);

    // Sparkline minimalista — sem fundo colorido, sem radius, linha 3px
    // pra dar presenca visual na cor da metrica. Match com sparklines do app.
    lv_obj_t *ch = lv_chart_create(c);
    lv_obj_set_size(ch, sparkW, chartH);
    lv_obj_align(ch, LV_ALIGN_BOTTOM_LEFT, 0, -sh(2));
    lv_chart_set_type(ch, LV_CHART_TYPE_LINE);
    lv_chart_set_point_count(ch, 20);
    lv_chart_set_div_line_count(ch, 0, 0);
    lv_obj_set_style_bg_opa(ch, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(ch, 0, 0);
    lv_obj_set_style_width(ch,  0, LV_PART_INDICATOR);
    lv_obj_set_style_height(ch, 0, LV_PART_INDICATOR);
    lv_obj_set_style_line_width(ch, sw(3), LV_PART_ITEMS);
    lv_obj_set_style_line_color(ch, lv_color_hex(color), LV_PART_ITEMS);
    lv_obj_set_style_pad_all(ch, 0, 0);
    *serOut = lv_chart_add_series(ch, lv_color_hex(color), LV_CHART_AXIS_PRIMARY_Y);
    *sparkOut = ch;

    return v;
  };

  // Face A — slot 0+1: sensores de ambiente. Cores DS:
  //   UMIDADE  ciano  + ic_droplet
  //   VPD      verde  + ic_activity (wave/wind)
  lblRh   = makeMiniCard(homeFaceA, 0,                     "UMIDADE", "--", COL_CYN,     &ic_droplet,   &sparkRh,   &serRhS);
  lblVpd  = makeMiniCard(homeFaceA, cardH + cardGap,       "VPD",     "--", COL_PRIMARY, &ic_activity,  &sparkVpd,  &serVpdS);

  // Slot 3 — CARD CICLO compacto (1 linha so'). Layout horizontal:
  //   Sem 4/16                                       [FLORACAO]
  // Sem icone planta — badge ja' comunica fase via cor, icone era ruido.
  // Gradient tinted na cor da fase atual (re-tintado em refreshHomeValues
  // quando FASE muda).
  {
    int yOffset = (cardH + cardGap) * 2;
    lv_obj_t *c = makeCard(homeFaceA, 0, yOffset, cardW, cycleH);
    lv_obj_set_style_pad_all(c, sw(6), 0);
    cardCycle = c;  // expor pra refreshHomeValues re-tintar
    tintCard(c, phaseColor(FASE), 50);

    // "Sem X/Y" esquerda, branco bold (FONT_BODY p/ caber bem)
    lblCycleVal = lv_label_create(c);
    lv_label_set_text(lblCycleVal, "Sem -/-");
    lv_obj_set_style_text_color(lblCycleVal, lv_color_hex(COL_TEXT), 0);
    lv_obj_set_style_text_font(lblCycleVal, FONT_BODY, 0);
    lv_obj_align(lblCycleVal, LV_ALIGN_LEFT_MID, 0, 0);

    // Badge fase pill na direita — bg colorido translucido + texto colorido
    lblCycleBadge = lv_label_create(c);
    lv_label_set_text(lblCycleBadge, FASE);
    lv_obj_set_style_text_color(lblCycleBadge, lv_color_hex(phaseColor(FASE)), 0);
    lv_obj_set_style_text_font(lblCycleBadge, FONT_CAPTION, 0);
    lv_obj_set_style_bg_color(lblCycleBadge, lv_color_hex(phaseColor(FASE)), 0);
    lv_obj_set_style_bg_opa(lblCycleBadge, LV_OPA_20, 0);
    lv_obj_set_style_pad_left(lblCycleBadge, sw(6), 0);
    lv_obj_set_style_pad_right(lblCycleBadge, sw(6), 0);
    lv_obj_set_style_pad_top(lblCycleBadge, sh(1), 0);
    lv_obj_set_style_pad_bottom(lblCycleBadge, sh(1), 0);
    lv_obj_set_style_radius(lblCycleBadge, RADIUS_SM, 0);
    lv_obj_align(lblCycleBadge, LV_ALIGN_RIGHT_MID, 0, 0);
  }

  // Tap no card UMIDADE -> refresh-only (sem ciclar o arc), util pra
  // forcar pull fresh sem mudar de modo. Sem placeholder "..." porque
  // refresh costuma vir em ~1-2s e o flicker e' mais distrativo.
  lv_obj_t *cardRh = lv_obj_get_parent(lblRh);
  lv_obj_add_flag(cardRh, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(cardRh, [](lv_event_t *e) {
    (void)e;
    if (onRefresh && !isRefreshing) {
      isRefreshing = true;
      onRefresh();
    }
  }, LV_EVENT_CLICKED, NULL);

  lv_chart_set_range(sparkRh,  LV_CHART_AXIS_PRIMARY_Y, 0, 100);
  lv_chart_set_range(sparkVpd, LV_CHART_AXIS_PRIMARY_Y, 0, 30);     // VPD * 10 (0-3.0 kPa)
  for (int i = 0; i < 20; i++) {
    lv_chart_set_next_value(sparkRh,  serRhS,  (int32_t)rh);
    lv_chart_set_next_value(sparkVpd, serVpdS, (int32_t)(vpd * 10));
  }

  // Face B (EC/pH/ciclo) removida — esses dados agora aparecem no arc cycle.
  // Aplica primeiro modo (TEMP) com os valores iniciais.
  updateArcMode();
}

// Reconfigura arc + labels conforme arcMode (0=TEMP/1=pH/2=EC/3=FASE).
// DS hierarchy: cada modo tem sua cor (token DS, nao arbitraria) — assim o
// tap-pra-ciclar da' feedback visual claro. Valor central permanece branco
// (info principal sempre com max contraste). Cor pinta:
//   - anel indicator + shadow
//   - header label ("TEMP"/"pH"/"EC"/<FASE>)
//
//   TEMP: phase_harvest laranja (igual sparkline TEMP no Hist + app mobile)
//   pH:   COL_PRP roxo claro
//   EC:   COL_AMBER amber
//   FASE: phaseColor(FASE) — cor real da fase atual (FLORA=magenta etc)
static void updateArcMode() {
  if (!lblTemp || !arcTemp) return;
  char buf[24];
  uint32_t col = COL_PRIMARY;
  switch (arcMode) {
    case 0: { // TEMP
      lv_label_set_text(lblArcHdr, "TEMP");
      lv_label_set_text(lblArcUnit, "\xC2\xB0""C");
      snprintf(buf, sizeof(buf), "%.1f", tempC);
      lv_label_set_text(lblTemp, buf);
      lv_arc_set_range(arcTemp, 0, 40);
      lv_arc_set_value(arcTemp, (int)tempC);
      // Cor reflete range termico — feedback visual: azul=frio, verde=ideal,
      // laranja=morno, vermelho=quente. Mais util que cor fixa pois user
      // identifica problemas de longe (ex: anel vermelho = estufa esquentou).
      col = tempColor(tempC);
      break;
    }
    case 1: { // pH
      lv_label_set_text(lblArcHdr, "pH");
      lv_label_set_text(lblArcUnit, "");
      snprintf(buf, sizeof(buf), "%.1f", phv);
      lv_label_set_text(lblTemp, buf);
      lv_arc_set_range(arcTemp, 0, 140);
      lv_arc_set_value(arcTemp, (int)(phv * 10));
      col = COL_PRP;  // roxo claro (DS, igual pill pH no Hist)
      break;
    }
    case 2: { // EC
      lv_label_set_text(lblArcHdr, "EC");
      lv_label_set_text(lblArcUnit, "mS/cm");
      snprintf(buf, sizeof(buf), "%.1f", ecv);
      lv_label_set_text(lblTemp, buf);
      lv_arc_set_range(arcTemp, 0, 40);  // EC * 10 (0-4.0 mS/cm)
      lv_arc_set_value(arcTemp, (int)(ecv * 10));
      col = COL_AMBER;  // amber (DS, igual chart Hist EC)
      break;
    }
    case 3: { // FASE
      lv_label_set_text(lblArcHdr, FASE);
      snprintf(buf, sizeof(buf), "Sem %d/%d", semana, totalSem);
      lv_label_set_text(lblArcUnit, buf);
      char vbuf[8]; snprintf(vbuf, sizeof(vbuf), "%d", semana);
      lv_label_set_text(lblTemp, vbuf);
      int total = totalSem > 0 ? totalSem : 16;
      lv_arc_set_range(arcTemp, 0, total);
      lv_arc_set_value(arcTemp, semana);
      col = phaseColor(FASE);  // cor do phase token (FLORA=magenta etc)
      break;
    }
  }
  // Valor central permanece branco (DS — info principal sempre max contraste).
  lv_obj_set_style_text_color(lblTemp, lv_color_hex(COL_TEXT), 0);
  // Header ("TEMP"/"pH"/...) e anel pegam cor do modo — feedback visual do tap.
  lv_obj_set_style_text_color(lblArcHdr, lv_color_hex(col), 0);
  lv_obj_set_style_arc_color(arcTemp, lv_color_hex(col), LV_PART_INDICATOR);
  lv_obj_set_style_shadow_color(arcTemp, lv_color_hex(col), LV_PART_INDICATOR);
}

// ════════════════════════════════════════════════════════════════════════════════
// Toast — feedback transitorio (ex: "Atualizado" apos refresh manual). Cria
// label flutuante no topo da tela ativa, anima fade in -> hold 1.2s -> fade
// out -> auto-destroi. Reentrante (cada chamada cria um novo toast).
//
// Estilo DS: card escuro (COL_CARD bg, COL_BORDER border), radius LG,
// icone ic_check_circle primary + texto branco. Sombra leve pra "flutuar"
// sobre o conteudo.
// ════════════════════════════════════════════════════════════════════════════════
static void toastDeleteCb(lv_anim_t *a) {
  lv_obj_t *o = (lv_obj_t*)lv_anim_get_user_data(a);
  if (o) lv_obj_del(o);
}

static void toastFadeOutCb(lv_timer_t *t) {
  lv_obj_t *toast = (lv_obj_t*)lv_timer_get_user_data(t);
  lv_timer_del(t);
  if (!toast) return;
  lv_anim_t a;
  lv_anim_init(&a);
  lv_anim_set_var(&a, toast);
  lv_anim_set_values(&a, LV_OPA_COVER, LV_OPA_TRANSP);
  lv_anim_set_time(&a, MOTION_MED);
  lv_anim_set_exec_cb(&a, [](void *obj, int32_t v) {
    lv_obj_set_style_opa((lv_obj_t*)obj, v, 0);
  });
  lv_anim_set_user_data(&a, toast);
  lv_anim_set_completed_cb(&a, toastDeleteCb);
  lv_anim_start(&a);
}

static void showToast(const char *msg) {
  lv_obj_t *toast = lv_obj_create(lv_layer_top());
  lv_obj_remove_style_all(toast);
  lv_obj_set_style_bg_color(toast, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_bg_opa(toast, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(toast, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_border_width(toast, 1, 0);
  lv_obj_set_style_radius(toast, RADIUS_LG, 0);
  lv_obj_set_style_pad_hor(toast, sw(12), 0);
  lv_obj_set_style_pad_ver(toast, sh(6),  0);
  lv_obj_set_style_shadow_width(toast, 12, 0);
  lv_obj_set_style_shadow_opa(toast, LV_OPA_50, 0);
  lv_obj_set_style_shadow_color(toast, lv_color_hex(0x000000), 0);
  lv_obj_set_size(toast, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
  lv_obj_align(toast, LV_ALIGN_TOP_MID, 0, sh(40));
  lv_obj_clear_flag(toast, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_clear_flag(toast, LV_OBJ_FLAG_CLICKABLE);

  lv_obj_t *icon = lv_image_create(toast);
  lv_image_set_src(icon, &ic_check_circle);
  lv_obj_set_style_image_recolor(icon, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_image_recolor_opa(icon, LV_OPA_COVER, 0);
  lv_obj_align(icon, LV_ALIGN_LEFT_MID, 0, 0);

  lv_obj_t *lbl = lv_label_create(toast);
  lv_label_set_text(lbl, msg);
  lv_obj_set_style_text_color(lbl, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_text_font(lbl, FONT_BODY, 0);
  lv_obj_align(lbl, LV_ALIGN_LEFT_MID, sw(24), 0);

  // Fade in
  lv_obj_set_style_opa(toast, LV_OPA_TRANSP, 0);
  lv_anim_t a;
  lv_anim_init(&a);
  lv_anim_set_var(&a, toast);
  lv_anim_set_values(&a, LV_OPA_TRANSP, LV_OPA_COVER);
  lv_anim_set_time(&a, MOTION_FAST);
  lv_anim_set_exec_cb(&a, [](void *obj, int32_t v) {
    lv_obj_set_style_opa((lv_obj_t*)obj, v, 0);
  });
  lv_anim_start(&a);

  // Hold 1200ms -> fade out -> delete (chain via timer one-shot)
  lv_timer_t *t = lv_timer_create(toastFadeOutCb, 1200, toast);
  lv_timer_set_repeat_count(t, 1);
}

// Forward decl — definida apos paintDeviceState (~500 linhas abaixo)
extern "C" void cultivoUI_stopItemSpin(int idx);

extern "C" void refreshHomeValues() {
  // Refresh trouxe valores frescos. Se estava refreshing (user tocou no
  // botao manual), mostra toast "Atualizado" pra confirmar conclusao.
  // Refresh automatico (fetch periodico) tem isRefreshing=false, sem toast
  // — evita spam visual a cada 30s.
  bool wasManualRefresh = isRefreshing;
  isRefreshing = false;
  if (wasManualRefresh) showToast("Atualizado");
  // Para spin de card refresh (caso user tenha tocado em item iconHint=refresh).
  // Chamamos via API publica pra evitar forward decl da static interna.
  cultivoUI_stopItemSpin(-1);
  char buf[64];

  // Header agora SO' tem nome da estufa (semana/fase migrou pro card CICLO).
  if (lblTitle) lv_label_set_text(lblTitle, TENT_NAME);

  // Atualiza icone wifi conforme estado atual — sem isso, o icone pegava
  // wifiOk so' no buildHome (boot) e nunca mais mudava. Quando wifi conecta
  // depois (boot offline -> conecta) ficava mostrando 'off' eternamente.
  if (lblWifi) {
    lv_image_set_src(lblWifi, wifiOk ? &ic_wifi : &ic_wifi_off);
    lv_obj_set_style_image_recolor(lblWifi,
      lv_color_hex(wifiOk ? COL_PRIMARY : COL_DIM), 0);
  }

  // Arc principal: re-renderiza no modo atual com valores frescos
  updateArcMode();

  // Mini-cards laterais. Valor fica branco fixo (DS).
  snprintf(buf, sizeof(buf), "%.0f%%", rh);
  lv_label_set_text(lblRh, buf);

  if (lblVpd) {
    snprintf(buf, sizeof(buf), "%.2f", vpd);
    lv_label_set_text(lblVpd, buf);
  }

  // Card CICLO — "Sem X/Y" + badge fase. Quando semana=0 (estufa de
  // MANUTENCAO/DRYING — sem ciclo VEGA/FLORA), esconde a contagem e mostra
  // so' o badge da fase. Server fix: PR #13 envia semana=0 pra essas categorias.
  if (lblCycleVal) {
    if (semana > 0 && totalSem > 0) {
      snprintf(buf, sizeof(buf), "Sem %d/%d", semana, totalSem);
    } else {
      buf[0] = '\0';  // sem ciclo — badge fase fica sozinho
    }
    lv_label_set_text(lblCycleVal, buf);
  }
  if (lblCycleBadge) {
    uint32_t pc = phaseColor(FASE);
    lv_label_set_text(lblCycleBadge, FASE);
    lv_obj_set_style_text_color(lblCycleBadge, lv_color_hex(pc), 0);
    lv_obj_set_style_bg_color(lblCycleBadge, lv_color_hex(pc), 0);
    // Re-tinta o card inteiro na cor da fase atual (gradient top)
    if (cardCycle) tintCard(cardCycle, pc, 50);
  }
}

// Auto-scale do sparkline: olha os ultimos 20 pontos e ajusta range pra
// que a variacao real ocupe ~60% da altura. Sem isso, RH variando 50-60%
// num range 0-100 ficava a barriga visual de ~14% (quase invisivel em 14px
// de altura). Com auto-scale, mesma variacao ocupa ~60% — onda fica obvia.
//
// Algoritmo: min/max dos pontos validos + padding 25% do range. Se ainda
// nao tem variacao (min == max), expande artificialmente (+/-1) pra evitar
// linha reta colada no eixo.
static void autoscaleSpark(lv_obj_t *chart, lv_chart_series_t *ser) {
  if (!chart || !ser) return;
  int32_t *arr = lv_chart_get_y_array(chart, ser);
  if (!arr) return;
  int32_t mn = INT32_MAX, mx = INT32_MIN;
  bool any = false;
  for (int i = 0; i < 20; i++) {
    int32_t v = arr[i];
    if (v == LV_CHART_POINT_NONE) continue;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
    any = true;
  }
  if (!any) return;
  if (mn == mx) { mn--; mx++; }              // range zero -> expande artificial
  int32_t pad = (mx - mn) / 4;               // 25% padding em cima e embaixo
  if (pad < 1) pad = 1;
  lv_chart_set_range(chart, LV_CHART_AXIS_PRIMARY_Y, mn - pad, mx + pad);
  lv_chart_refresh(chart);
}

// Timer de pulso: anima sparklines + arc pra simular monitor ao vivo
static void pulseTimerCb(lv_timer_t *t) {
  (void)t;
  static uint32_t tick = 0;
  tick++;
  float wave = sinf(tick * 0.4f);
  float jitter = ((rand() % 100) - 50) / 100.0f;

  if (sparkRh && serRhS) {
    lv_chart_set_next_value(sparkRh, serRhS, (int32_t)(rh + wave * 1.5f + jitter));
    autoscaleSpark(sparkRh, serRhS);
  }
  if (sparkVpd && serVpdS) {
    lv_chart_set_next_value(sparkVpd, serVpdS, (int32_t)((vpd + wave * 0.03f) * 10));
    autoscaleSpark(sparkVpd, serVpdS);
  }
  // sparkPpfd removido — card PPFD substituido pelo card CICLO (estatico).

  // Sync wifi icon a cada tick — captura desconexao mesmo sem fetch ativo.
  // Custo: 1 if + max 2 set_style por 300ms — desprezivel.
  static bool lastWifi = !wifiOk;  // forca primeira sync
  if (lblWifi && wifiOk != lastWifi) {
    lastWifi = wifiOk;
    lv_image_set_src(lblWifi, wifiOk ? &ic_wifi : &ic_wifi_off);
    lv_obj_set_style_image_recolor(lblWifi,
      lv_color_hex(wifiOk ? COL_PRIMARY : COL_DIM), 0);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// Tela LUX/PPFD — toggle de unidade + valor grande + botoes -/+ + SALVAR
// ════════════════════════════════════════════════════════════════════════════════
static void refreshLuxDisplay() {
  char buf[24];
  if (luxMode == 0) {
    snprintf(buf, sizeof(buf), "%d", targetPpfd);
    lv_label_set_text(lblLuxValue, buf);
    lv_label_set_text(lblLuxUnit, "umol/s.m²");
    lv_obj_set_style_text_color(lblLuxValue, lv_color_hex(COL_GRN), 0);
  } else {
    snprintf(buf, sizeof(buf), "%d", targetPpfd * LUX_PER_PPFD);
    lv_label_set_text(lblLuxValue, buf);
    lv_label_set_text(lblLuxUnit, "LUX");
    lv_obj_set_style_text_color(lblLuxValue, lv_color_hex(COL_YEL), 0);
  }
  if (btnModePpfd && btnModeLux) {
    lv_obj_set_style_bg_color(btnModePpfd,
      lv_color_hex(luxMode == 0 ? COL_GRN : COL_CARD), 0);
    lv_obj_set_style_bg_color(btnModeLux,
      lv_color_hex(luxMode == 1 ? COL_YEL : COL_CARD), 0);
  }
  if (luxBar) lv_bar_set_value(luxBar, targetPpfd, LV_ANIM_ON);
}

static void luxStepCb(lv_event_t *e) {
  int delta = (int)(intptr_t)lv_event_get_user_data(e);
  targetPpfd += delta;
  if (targetPpfd < 0)    targetPpfd = 0;
  if (targetPpfd > 2000) targetPpfd = 2000;
  refreshLuxDisplay();
}

static void luxSaveCb(lv_event_t *e) {
  (void)e;
  currentPpfd = targetPpfd;
  if (onLuxSave) onLuxSave(targetPpfd);
  else           printf("[ui] lux salvo: %d PPFD (sem handler)\n", targetPpfd);
}

static void buildLux(lv_obj_t *tab) {
  lv_obj_set_style_pad_all(tab, 0, 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_bg_color(tab, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_opa(tab, LV_OPA_COVER, 0);

  // ═══ Header ═══
  lv_obj_t *hdrIcon = lv_image_create(tab);
  lv_image_set_src(hdrIcon, &ic_lightbulb);
  lv_obj_set_style_image_recolor(hdrIcon, lv_color_hex(COL_YEL), 0);
  lv_obj_set_style_image_recolor_opa(hdrIcon, LV_OPA_COVER, 0);
  lv_obj_align(hdrIcon, LV_ALIGN_TOP_LEFT, sw(6), sh(6));

  makeLabel(tab, "LUX / PPFD", COL_TEXT, FONT_TITLE, LV_ALIGN_TOP_LEFT, sw(36), sh(5));

  // Toggle PPFD/LUX — pill-shaped, raio alto
  btnModePpfd = lv_btn_create(tab);
  lv_obj_set_size(btnModePpfd, sw(54), sh(22));
  lv_obj_align(btnModePpfd, LV_ALIGN_TOP_RIGHT, -sw(62), sh(5));
  lv_obj_set_style_bg_color(btnModePpfd, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_radius(btnModePpfd, sh(11), 0);
  lv_obj_add_event_cb(btnModePpfd, [](lv_event_t *e) {
    (void)e; luxMode = 0; refreshLuxDisplay();
  }, LV_EVENT_CLICKED, NULL);
  makeLabel(btnModePpfd, "PPFD", COL_TEXT, FONT_CAPTION, LV_ALIGN_CENTER, 0, 0);

  btnModeLux = lv_btn_create(tab);
  lv_obj_set_size(btnModeLux, sw(54), sh(22));
  lv_obj_align(btnModeLux, LV_ALIGN_TOP_RIGHT, -sw(6), sh(5));
  lv_obj_set_style_bg_color(btnModeLux, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_radius(btnModeLux, sh(11), 0);
  lv_obj_add_event_cb(btnModeLux, [](lv_event_t *e) {
    (void)e; luxMode = 1; refreshLuxDisplay();
  }, LV_EVENT_CLICKED, NULL);
  makeLabel(btnModeLux, "LUX", COL_TEXT, FONT_CAPTION, LV_ALIGN_CENTER, 0, 0);

  // ═══ Body: 2 colunas (valor a esquerda, controles a direita) ═══
  int bodyY      = sh(36);
  int bodyH      = TAB_H - bodyY - sh(22);   // reserva pro bar no fim
  int leftW      = SCREEN_W * 55 / 100;
  int rightX     = leftW;
  int rightW     = SCREEN_W - rightX - sw(12);
  int vCenter    = bodyY + bodyH / 2;

  // Container esquerdo (valor + unidade) com flex vertical centralizado
  lv_obj_t *leftCol = lv_obj_create(tab);
  lv_obj_set_pos(leftCol, 0, bodyY);
  lv_obj_set_size(leftCol, leftW, bodyH);
  lv_obj_set_style_bg_opa(leftCol, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(leftCol, 0, 0);
  lv_obj_set_style_pad_all(leftCol, 0, 0);
  lv_obj_clear_flag(leftCol, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_flex_flow(leftCol, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(leftCol, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

  lblLuxValue = lv_label_create(leftCol);
  lv_label_set_text(lblLuxValue, "0");
  lv_obj_set_style_text_font(lblLuxValue, FONT_VALUE, 0);
  lv_obj_set_style_text_color(lblLuxValue, lv_color_hex(COL_GRN), 0);
  // sem bloom no numero

  lblLuxUnit = lv_label_create(leftCol);
  lv_label_set_text(lblLuxUnit, "umol/s.m²");
  lv_obj_set_style_text_font(lblLuxUnit, FONT_BODY, 0);
  lv_obj_set_style_text_color(lblLuxUnit, lv_color_hex(COL_DIM), 0);

  // Botoes -/+ quadrados (ss pra nao distorcer em aspectos diferentes)
  int btnSize = ss(44);
  int gap     = sw(10);
  int btnsW   = btnSize * 2 + gap;
  int btnsX   = rightX + (rightW - btnsW) / 2;
  int btnsY   = vCenter - btnSize - sh(6);

  lv_obj_t *btnMinus = lv_btn_create(tab);
  lv_obj_set_size(btnMinus, btnSize, btnSize);
  lv_obj_set_pos(btnMinus, btnsX, btnsY);
  lv_obj_set_style_radius(btnMinus, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_color(btnMinus, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_border_color(btnMinus, lv_color_hex(COL_RED), 0);
  lv_obj_set_style_border_width(btnMinus, 2, 0);
  lv_obj_add_event_cb(btnMinus, luxStepCb, LV_EVENT_CLICKED,
                      (void*)(intptr_t)(-STEP_PPFD));
  lv_obj_add_event_cb(btnMinus, luxStepCb, LV_EVENT_LONG_PRESSED_REPEAT,
                      (void*)(intptr_t)(-STEP_PPFD));
  makeLabel(btnMinus, "-", COL_RED, FONT_VALUE, LV_ALIGN_CENTER, 0, -sh(4));

  lv_obj_t *btnPlus = lv_btn_create(tab);
  lv_obj_set_size(btnPlus, btnSize, btnSize);
  lv_obj_set_pos(btnPlus, btnsX + btnSize + gap, btnsY);
  lv_obj_set_style_radius(btnPlus, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_color(btnPlus, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_border_color(btnPlus, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_border_width(btnPlus, 2, 0);
  lv_obj_add_event_cb(btnPlus, luxStepCb, LV_EVENT_CLICKED,
                      (void*)(intptr_t)(+STEP_PPFD));
  lv_obj_add_event_cb(btnPlus, luxStepCb, LV_EVENT_LONG_PRESSED_REPEAT,
                      (void*)(intptr_t)(+STEP_PPFD));
  makeLabel(btnPlus, "+", COL_GRN, FONT_VALUE, LV_ALIGN_CENTER, 0, -sh(4));

  // SALVAR embaixo dos botoes, mesmo width deles somados
  lv_obj_t *btnSave = lv_btn_create(tab);
  lv_obj_set_size(btnSave, btnsW, sh(28));
  lv_obj_set_pos(btnSave, btnsX, btnsY + btnSize + sh(14));
  lv_obj_set_style_bg_color(btnSave, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_radius(btnSave, sh(14), 0);
  applyBloom(btnSave, COL_GRN);
  lv_obj_add_event_cb(btnSave, luxSaveCb, LV_EVENT_CLICKED, NULL);
  makeLabel(btnSave, "SALVAR", COL_TEXT, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  // ═══ Barra de progresso (0-1500 PPFD) ═══
  luxBar = lv_bar_create(tab);
  lv_obj_set_size(luxBar, SCREEN_W - sw(24), sh(8));
  lv_obj_align(luxBar, LV_ALIGN_BOTTOM_MID, 0, -sh(8));
  lv_bar_set_range(luxBar, 0, 1500);
  lv_bar_set_value(luxBar, targetPpfd, LV_ANIM_OFF);
  lv_obj_set_style_bg_color(luxBar, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_bg_opa(luxBar, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(luxBar, sh(4), 0);
  lv_obj_set_style_bg_color(luxBar, lv_color_hex(COL_GRN), LV_PART_INDICATOR);
  lv_obj_set_style_radius(luxBar, sh(4), LV_PART_INDICATOR);
  lv_obj_set_style_shadow_color(luxBar, lv_color_hex(COL_GRN), LV_PART_INDICATOR);
  lv_obj_set_style_shadow_width(luxBar, 14, LV_PART_INDICATOR);
  lv_obj_set_style_shadow_opa(luxBar, LV_OPA_50, LV_PART_INDICATOR);

  refreshLuxDisplay();
}

// ════════════════════════════════════════════════════════════════════════════════
// Tela pH/EC — 2 cards com valor + botoes -/+ + SALVAR
// ════════════════════════════════════════════════════════════════════════════════
static lv_obj_t *lblPhVal, *lblEcVal;

static void refreshPhEcDisplay() {
  char buf[16];
  if (lblPhVal) { snprintf(buf, sizeof(buf), "%.1f", phv); lv_label_set_text(lblPhVal, buf); }
  if (lblEcVal) { snprintf(buf, sizeof(buf), "%.1f", ecv); lv_label_set_text(lblEcVal, buf); }
}

static void phStepCb(lv_event_t *e) {
  int dir = (int)(intptr_t)lv_event_get_user_data(e);
  phv += dir * 0.1f;
  if (phv < 0)  phv = 0;
  if (phv > 14) phv = 14;
  refreshPhEcDisplay();
}

static void ecStepCb(lv_event_t *e) {
  int dir = (int)(intptr_t)lv_event_get_user_data(e);
  ecv += dir * 0.1f;
  if (ecv < 0) ecv = 0;
  if (ecv > 5) ecv = 5;
  refreshPhEcDisplay();
}

static void buildPhEc(lv_obj_t *tab) {
  lv_obj_set_style_pad_all(tab, 0, 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_bg_color(tab, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_opa(tab, LV_OPA_COVER, 0);

  lv_obj_t *hdrIcon = lv_image_create(tab);
  lv_image_set_src(hdrIcon, &ic_flask);
  lv_obj_set_style_image_recolor(hdrIcon, lv_color_hex(COL_PRP), 0);
  lv_obj_set_style_image_recolor_opa(hdrIcon, LV_OPA_COVER, 0);
  lv_obj_align(hdrIcon, LV_ALIGN_TOP_LEFT, sw(4), sh(2));
  makeLabel(tab, "pH / EC", COL_TEXT, FONT_TITLE, LV_ALIGN_TOP_LEFT, sw(38), sh(4));

  int cardGap = sw(8);
  int cardW = (SCREEN_W - cardGap * 3) / 2;
  int cardY = sh(38);
  int cardH = TAB_H - cardY - sh(40);  // deixa espaco pro SALVAR

  auto makeValueCard = [&](int x, const char *label, uint32_t color,
                           const lv_image_dsc_t *icon, lv_obj_t **out,
                           lv_event_cb_t cbFn) {
    lv_obj_t *c = makeCard(tab, x, cardY, cardW, cardH);
    applyRingPulse(c, color);

    lv_obj_t *ico = lv_image_create(c);
    lv_image_set_src(ico, icon);
    lv_obj_set_style_image_recolor(ico, lv_color_hex(color), 0);
    lv_obj_set_style_image_recolor_opa(ico, LV_OPA_COVER, 0);
    lv_obj_align(ico, LV_ALIGN_TOP_LEFT, 0, 0);

    makeLabel(c, label, COL_DIM, FONT_CAPTION, LV_ALIGN_TOP_RIGHT, 0, 0);

    lv_obj_t *v = lv_label_create(c);
    lv_label_set_text(v, "0.0");
    lv_obj_set_style_text_font(v, FONT_VALUE, 0);
    lv_obj_set_style_text_color(v, lv_color_hex(color), 0);
    lv_obj_align(v, LV_ALIGN_CENTER, 0, -sh(4));
    // sem bloom no numero — card border ja' destaca
    *out = v;

    int btnSize = sh(30);
    lv_obj_t *btnMinus = lv_btn_create(c);
    lv_obj_set_size(btnMinus, btnSize, btnSize);
    lv_obj_align(btnMinus, LV_ALIGN_BOTTOM_LEFT, sw(4), -sh(4));
    lv_obj_set_style_radius(btnMinus, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(btnMinus, lv_color_hex(COL_CARD), 0);
    lv_obj_set_style_border_color(btnMinus, lv_color_hex(COL_RED), 0);
    lv_obj_set_style_border_width(btnMinus, 2, 0);
    lv_obj_add_event_cb(btnMinus, cbFn, LV_EVENT_CLICKED, (void*)(intptr_t)(-1));
    lv_obj_add_event_cb(btnMinus, cbFn, LV_EVENT_LONG_PRESSED_REPEAT, (void*)(intptr_t)(-1));
    makeLabel(btnMinus, "-", COL_RED, FONT_TITLE, LV_ALIGN_CENTER, 0, -sh(2));

    lv_obj_t *btnPlus = lv_btn_create(c);
    lv_obj_set_size(btnPlus, btnSize, btnSize);
    lv_obj_align(btnPlus, LV_ALIGN_BOTTOM_RIGHT, -sw(4), -sh(4));
    lv_obj_set_style_radius(btnPlus, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(btnPlus, lv_color_hex(COL_CARD), 0);
    lv_obj_set_style_border_color(btnPlus, lv_color_hex(COL_GRN), 0);
    lv_obj_set_style_border_width(btnPlus, 2, 0);
    lv_obj_add_event_cb(btnPlus, cbFn, LV_EVENT_CLICKED, (void*)(intptr_t)(+1));
    lv_obj_add_event_cb(btnPlus, cbFn, LV_EVENT_LONG_PRESSED_REPEAT, (void*)(intptr_t)(+1));
    makeLabel(btnPlus, "+", COL_GRN, FONT_TITLE, LV_ALIGN_CENTER, 0, -sh(2));
  };

  makeValueCard(cardGap, "pH", COL_GRN, &ic_beaker, &lblPhVal, phStepCb);
  makeValueCard(cardGap * 2 + cardW, "EC", COL_PRP, &ic_test_tube, &lblEcVal, ecStepCb);

  lv_obj_t *btnSave = lv_btn_create(tab);
  lv_obj_set_size(btnSave, sw(140), sh(26));
  lv_obj_align(btnSave, LV_ALIGN_BOTTOM_MID, 0, -sh(6));
  lv_obj_set_style_bg_color(btnSave, lv_color_hex(COL_GRN), 0);
  applyBloom(btnSave, COL_GRN);
  lv_obj_add_event_cb(btnSave, [](lv_event_t *e) {
    (void)e;
    if (onPhEcSave) onPhEcSave(phv, ecv);
    else            printf("[ui] pH/EC salvo: pH=%.1f EC=%.1f (sem handler)\n", phv, ecv);
  }, LV_EVENT_CLICKED, NULL);
  makeLabel(btnSave, "SALVAR", COL_TEXT, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  refreshPhEcDisplay();
}

// ════════════════════════════════════════════════════════════════════════════════
// Tela CENAS — atalhos cenas + dispositivos vinculados a estufa. Items vem
// dinamicos do server via GET /api/device/scenes (formato novo {items:[...]}).
// Cada item tem type=scene (tap dispara cena Tuya) ou type=device (tap toggla
// on/off). App chama cultivoUI_applyItems() e UI rebuilda o grid 2x3.
// onSceneTrigger(idx) → app resolve type via storage proprio e POSTa endpoint
// correto. Quando count == 0 (sem vinculos), mostra placeholder textual.
// ════════════════════════════════════════════════════════════════════════════════

// Paleta de cores p/ cenas (cycling por slot — cenas nao tem cor no payload)
static const uint32_t SCENE_COLOR_PALETTE[SCENES_MAX] = {
  COL_CYN, COL_YEL, COL_PRIMARY, COL_BLU, COL_PRP, COL_AMBER,
};

// Resolve iconHint string -> ic_* image. Default = ic_zap (raio).
// Tambem usado no fallback de cena sem iconHint definido.
// type: 0=scene, 1=device, 2=automation
//
// Mapping completo dos iconHints que o server pode enviar (espelha os
// dropdowns da UI web em /tent/X). Sem conversor SVG local pra baixar mais
// icones do Lucide, alguns hints (heater/ac/humidifier/dehumidifier/co2)
// reusam icones existentes como aproximacao razoavel ate' ter assets reais.
static const lv_image_dsc_t* resolveIcon(const char *hint, uint8_t type, int slotIdx) {
  if (!hint || !*hint) {
    if (type == 0) {
      // Scene sem hint: cycling palette por slot (variedade visual)
      static const lv_image_dsc_t *cyc[SCENES_MAX] = {
        &ic_droplet, &ic_lightbulb, &ic_sprout,
        &ic_wind, &ic_flask, &ic_thermometer
      };
      return cyc[slotIdx % SCENES_MAX];
    }
    if (type == 2) return &ic_clock;  // automation default = relogio
    return &ic_zap;                    // device default
  }
  // Devices fisicos (todos com icones REAIS do Lucide agora)
  if (!strcmp(hint, "light"))        return &ic_lightbulb;     // 💡 LED, lampada
  if (!strcmp(hint, "fan"))          return &ic_fan;           // 🌀 exaustor com pas
  if (!strcmp(hint, "pump"))         return &ic_droplet;       // 💧 bomba, rega manual
  if (!strcmp(hint, "heater"))       return &ic_flame;         // 🔥 aquecedor (chama)
  if (!strcmp(hint, "ac"))           return &ic_snowflake;     // ❄ ar-condicionado
  if (!strcmp(hint, "humidifier"))   return &ic_cloud;         // ☁ umidificador
  if (!strcmp(hint, "dehumidifier")) return &ic_wind;          // 💨 vento remove umidade
  if (!strcmp(hint, "co2"))          return &ic_cloud;         // ☁ CO2
  // Cenas / automations / refresh
  if (!strcmp(hint, "schedule"))     return &ic_clock;         // ⏰ rega automatica
  if (!strcmp(hint, "automation"))   return &ic_clock;
  if (!strcmp(hint, "timer"))        return &ic_timer;         // alternativa
  if (!strcmp(hint, "clock"))        return &ic_clock;
  // Sensor card: visual padrao e' "activity" (wave — sugere monitoramento).
  // Durante tap, startItemSpin troca o src pra ic_refresh + rotaciona; quando
  // termina (stopItemSpin), restaura ic_activity.
  if (!strcmp(hint, "refresh"))      return &ic_activity;
  if (!strcmp(hint, "sensor"))       return &ic_activity;
  if (!strcmp(hint, "other"))        return &ic_zap;           // ⚡ default fallback
  return &ic_zap;
}

// Storage atual (preenchido pelo app via cultivoUI_applyItems)
typedef struct {
  char     id[48];          // sceneId/deviceId Tuya
  char     name[24];        // label
  uint8_t  type;            // 0=scene, 1=device, 2=automation
  bool     state;           // device/automation on/off
  char     iconHint[16];    // "light"/"fan"/"dehumidifier"/etc
  uint16_t executionSec;    // duracao scene em segundos (0 = default 5s)
} ItemStorage;
static ItemStorage items[SCENES_MAX];
static int sceneCount = 0;  // mantem nome legado p/ minimizar diff
// Refs aos botoes pra updates pontuais (toggle visual sem rebuild full)
static lv_obj_t *itemBtns[SCENES_MAX]  = {nullptr};
static lv_obj_t *itemIcons[SCENES_MAX] = {nullptr};

// Tab pai dos botoes — guardado pra rebuild quando dados chegam do server
static lv_obj_t *sceneTab = nullptr;
// Container do grid (filho do tab) — droppado e recriado em cada apply pra
// limpar botoes antigos sem mexer no header
static lv_obj_t *sceneGrid = nullptr;
// Label de placeholder ("Sem cenas...") — visivel quando count == 0
static lv_obj_t *sceneEmpty = nullptr;

// Pinta visual on/off de um device card.
// ON  : card "preenchido" — bg primary opa 25, border primary cheio, icone
//       BRANCO brilhante (= "lampada acesa"), shadow primary suave
// OFF : card "vazado"   — bg card neutro, border BORDER neutra, icone DIM
//       (= "lampada apagada")
// Diferenca obvia a metros de distancia, sem precisar rasterizar icones
// "filled" novos. Idempotente — pode ser chamado a qualquer hora.
static void paintDeviceState(int idx) {
  if (idx < 0 || idx >= SCENES_MAX) return;
  if (!itemBtns[idx] || !itemIcons[idx]) return;
  // device (type=1) e automation (type=2) tem mesmo visual ON/OFF
  if (items[idx].type != 1 && items[idx].type != 2) return;

  bool on = items[idx].state;
  if (on) {
    // ON: card "aceso". COR DO FUNDO (bg) varia por iconHint pra dar
    // realismo — lampada acesa = card amarelo, aquecedor = vermelho, etc.
    // Icone fica branco (max contraste sobre fundo colorido).
    const char *hint = items[idx].iconHint;
    uint32_t bgC = COL_PRIMARY;   // default verde brand
    if      (!strcmp(hint, "light"))  bgC = COL_YEL;   // 💡 fundo amarelo
    else if (!strcmp(hint, "heater")) bgC = COL_RED;   // 🔥 fundo vermelho
    else if (!strcmp(hint, "ac"))     bgC = COL_CYN;   // ❄ fundo ciano
    lv_obj_set_style_bg_color(itemBtns[idx],       lv_color_hex(bgC), 0);
    lv_obj_set_style_bg_opa(itemBtns[idx],         LV_OPA_30, 0);
    lv_obj_set_style_border_color(itemBtns[idx],   lv_color_hex(bgC), 0);
    lv_obj_set_style_image_recolor(itemIcons[idx], lv_color_hex(COL_TEXT), 0);
    // Shadow na cor do device pra dar feel "irradiando"
    lv_obj_set_style_shadow_color(itemBtns[idx], lv_color_hex(bgC), 0);
    lv_obj_set_style_shadow_width(itemBtns[idx], 12, 0);
    lv_obj_set_style_shadow_opa(itemBtns[idx],   LV_OPA_30, 0);
    lv_obj_set_style_shadow_spread(itemBtns[idx], 0, 0);
  } else {
    // OFF: card "apagado"
    lv_obj_set_style_bg_color(itemBtns[idx],     lv_color_hex(COL_CARD), 0);
    lv_obj_set_style_bg_opa(itemBtns[idx],       LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(itemBtns[idx], lv_color_hex(COL_BORDER), 0);
    lv_obj_set_style_image_recolor(itemIcons[idx], lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_shadow_width(itemBtns[idx], 0, 0);  // sem glow
  }
}

// ── Spin do icone de um item (refresh em andamento) ──────────────────────────
// Usado pelo card iconHint=refresh/sensor enquanto o server processa o
// refreshTuya. Visual: troca o icone "activity" (wave/sensor) pelo ic_refresh
// + rotaciona rapido (~1s/volta). Quando termina (stopItemSpin), volta pra
// ic_activity. Auto-stop apos 10s caso esqueca de stopItemSpin (defensive).
static lv_timer_t *itemSpinTimer = nullptr;
static int        itemSpinIdx    = -1;
static int32_t    itemSpinAngle  = 0;
static uint32_t   itemSpinStart  = 0;

// Forward decl pra restaurar icone original
static const lv_image_dsc_t* resolveIcon(const char *hint, uint8_t type, int slotIdx);

static void itemSpinStopInternal() {
  if (itemSpinTimer) {
    lv_timer_del(itemSpinTimer);
    itemSpinTimer = nullptr;
  }
  if (itemSpinIdx >= 0 && itemSpinIdx < SCENES_MAX && itemIcons[itemSpinIdx]) {
    // Reset rotation
    lv_obj_set_style_transform_rotation(itemIcons[itemSpinIdx], 0, 0);
    // Restaura icone original (provavelmente ic_activity p/ sensor)
    const lv_image_dsc_t *orig = resolveIcon(items[itemSpinIdx].iconHint,
                                              items[itemSpinIdx].type,
                                              itemSpinIdx);
    lv_image_set_src(itemIcons[itemSpinIdx], orig);
  }
  itemSpinIdx = -1;
  itemSpinAngle = 0;
}

static void itemSpinTick(lv_timer_t *t) {
  (void)t;
  // Timeout 10s (refresh deveria voltar bem antes)
  if (lv_tick_get() - itemSpinStart > 10000) {
    itemSpinStopInternal();
    return;
  }
  if (itemSpinIdx < 0 || itemSpinIdx >= SCENES_MAX || !itemIcons[itemSpinIdx]) {
    itemSpinStopInternal();
    return;
  }
  // 180 decimos/tick × 33 ticks/s (30ms) = ~6000 décimos/s ≈ 600°/s ≈ ~1s/volta
  itemSpinAngle = (itemSpinAngle + 180) % 3600;
  lv_obj_set_style_transform_rotation(itemIcons[itemSpinIdx], itemSpinAngle, 0);
}

extern "C" void cultivoUI_startItemSpin(int idx) {
  if (idx < 0 || idx >= sceneCount) return;
  if (!itemIcons[idx]) return;
  // Para spin anterior se ainda rodando em outro item
  if (itemSpinTimer) itemSpinStopInternal();
  itemSpinIdx   = idx;
  itemSpinAngle = 0;
  itemSpinStart = lv_tick_get();
  // Pivot no centro do icone (32x32 = 16,16) — sem isso gira em torno do
  // canto top-left e o icone "viaja" pelo card
  lv_obj_set_style_transform_pivot_x(itemIcons[idx], 16, 0);
  lv_obj_set_style_transform_pivot_y(itemIcons[idx], 16, 0);
  // Troca o icone do card pra ic_refresh (so' durante o spin)
  lv_image_set_src(itemIcons[idx], &ic_refresh);
  // Tick 30ms pra animacao mais fluida (era 50ms)
  itemSpinTimer = lv_timer_create(itemSpinTick, 30, NULL);
}

extern "C" void cultivoUI_stopItemSpin(int idx) {
  (void)idx;  // sempre para o spin ativo (so' tem 1 por vez)
  itemSpinStopInternal();
}

// Feedback de tap:
//   scene  : flash border primary (one-shot) — sem state, so' confirma trigger
//   device : NAO inverte state localmente (era "optimistic toggle" e gerava
//            "pisca acende-apaga" quando server respondia diferente). Em vez
//            disso, mostra estado "carregando" (border primary fixo + opa
//            reduzido) e aguarda cultivoUI_setDeviceState do app pra pintar
//            estado real. App garante chamar setDeviceState mesmo em falha
//            (com state antigo).
// Forward decl — definida apos sceneClickCb
static void sceneActivePulse(int idx);

static void sceneClickCb(lv_event_t *e) {
  int idx = (int)(intptr_t)lv_event_get_user_data(e);
  if (idx < 0 || idx >= sceneCount) return;
  printf("[ui] item tap idx=%d type=%d (%s)\n",
         idx, items[idx].type, items[idx].name);
  if (onSceneTrigger) onSceneTrigger(idx);

  // Refresh/sensor — animacao de rotacao no icone enquanto refresh roda.
  // Seta isRefreshing=true pra que refreshHomeValues mostre toast "Atualizado"
  // quando dados frescos chegarem (mesmo mecanismo do botao header antigo).
  // App vai chamar cultivoUI_stopItemSpin quando dados frescos chegarem.
  if (!strcmp(items[idx].iconHint, "refresh") ||
      !strcmp(items[idx].iconHint, "sensor")) {
    isRefreshing = true;
    cultivoUI_startItemSpin(idx);
    return;
  }

  if (items[idx].type == 1 || items[idx].type == 2) {
    // Device OU automation — feedback "carregando" sem mudar state local.
    // Border primary + opacidade reduzida. setDeviceState restaura full opa.
    if (itemBtns[idx]) {
      lv_obj_set_style_border_color(itemBtns[idx], lv_color_hex(COL_PRIMARY), 0);
      lv_obj_set_style_opa(itemBtns[idx], LV_OPA_70, 0);
    }
    return;
  }

  // Scene — visual "executando" por SCENE_ACTIVE_MS (5s default). Card
  // fica aceso (igual device ON) e volta ao normal apos timeout. Sem
  // checar state real (Tuya nao expoe). Quando outra IA implementar
  // executionSec em tentScenes, basta sobrescrever esse default.
  sceneActivePulse(idx);
}

// Reset visual do card scene apos timeout do "executando"
static lv_timer_t *sceneActiveTimer = nullptr;
static int         sceneActiveIdx   = -1;
static const uint32_t SCENE_ACTIVE_MS_DEFAULT = 5000;  // fallback se server nao enviou executionSec

static void sceneActiveResetCb(lv_timer_t *t) {
  lv_timer_del(t);
  if (sceneActiveTimer == t) sceneActiveTimer = nullptr;
  int idx = sceneActiveIdx;
  sceneActiveIdx = -1;
  if (idx < 0 || idx >= SCENES_MAX || !itemBtns[idx]) return;
  // Volta ao visual neutro (sem aceso)
  lv_obj_set_style_bg_color(itemBtns[idx],     lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_bg_opa(itemBtns[idx],       LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(itemBtns[idx], lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_shadow_width(itemBtns[idx], 0, 0);
}

static void sceneActivePulse(int idx) {
  if (idx < 0 || idx >= SCENES_MAX || !itemBtns[idx]) return;
  // Cancela pulse anterior (se outra cena estava "executando")
  if (sceneActiveTimer) {
    lv_timer_del(sceneActiveTimer);
    sceneActiveTimer = nullptr;
  }
  sceneActiveIdx = idx;
  // Pinta card aceso (mesmo visual de device ON)
  lv_obj_set_style_bg_color(itemBtns[idx],     lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_bg_opa(itemBtns[idx],       LV_OPA_30, 0);
  lv_obj_set_style_border_color(itemBtns[idx], lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_shadow_color(itemBtns[idx], lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_shadow_width(itemBtns[idx], 12, 0);
  lv_obj_set_style_shadow_opa(itemBtns[idx],   LV_OPA_30, 0);
  lv_obj_set_style_shadow_spread(itemBtns[idx], 0, 0);
  // Timer one-shot pra voltar ao normal. Duracao vem do server (executionSec
  // — campo configurado pelo user em /tent/X). Fallback 5s se ausente/0.
  uint32_t durMs = items[idx].executionSec > 0
                   ? (uint32_t)items[idx].executionSec * 1000UL
                   : SCENE_ACTIVE_MS_DEFAULT;
  sceneActiveTimer = lv_timer_create(sceneActiveResetCb, durMs, NULL);
  lv_timer_set_repeat_count(sceneActiveTimer, 1);
}

// Constroi (ou reconstroi) o grid de cenas. Chamado em buildTarefas (1a vez)
// e em cultivoUI_applyScenes (quando dados chegam do server).
static void rebuildSceneGrid() {
  if (!sceneTab) return;

  // Drop grid anterior (se existir) — limpa botoes velhos sem tocar no header.
  if (sceneGrid) {
    lv_obj_del(sceneGrid);
    sceneGrid = nullptr;
  }
  if (sceneEmpty) {
    lv_obj_del(sceneEmpty);
    sceneEmpty = nullptr;
  }

  // Sem cenas: empty state DS — icone dim grande + texto secundario.
  // Padrao consistente com empty states do app web (ex: lista vazia).
  if (sceneCount == 0) {
    lv_obj_t *emptyWrap = lv_obj_create(sceneTab);
    lv_obj_set_size(emptyWrap, sw(220), sh(80));
    lv_obj_align(emptyWrap, LV_ALIGN_CENTER, 0, sh(8));
    lv_obj_set_style_bg_opa(emptyWrap, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(emptyWrap, 0, 0);
    lv_obj_set_style_pad_all(emptyWrap, 0, 0);
    lv_obj_clear_flag(emptyWrap, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *ico = lv_image_create(emptyWrap);
    lv_image_set_src(ico, &ic_zap);
    lv_obj_set_style_image_recolor(ico, lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_image_recolor_opa(ico, LV_OPA_COVER, 0);
    lv_obj_align(ico, LV_ALIGN_TOP_MID, 0, 0);

    sceneEmpty = lv_label_create(emptyWrap);
    lv_label_set_text(sceneEmpty,
      "Buscando cenas...\n"
      "Configure suas cenas Tuya no app pra acessa-las aqui.");
    lv_label_set_long_mode(sceneEmpty, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(sceneEmpty, sw(220));
    lv_obj_set_style_text_color(sceneEmpty, lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_text_font(sceneEmpty, FONT_CAPTION, 0);
    lv_obj_set_style_text_align(sceneEmpty, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(sceneEmpty, LV_ALIGN_TOP_MID, 0, sh(20));
    return;
  }

  // Container invisivel ocupando area abaixo do header
  sceneGrid = lv_obj_create(sceneTab);
  int gridY = sh(28);
  int gridH = TAB_H - gridY - sh(4);
  lv_obj_set_size(sceneGrid, SCREEN_W, gridH);
  lv_obj_set_pos(sceneGrid, 0, gridY);
  lv_obj_set_style_bg_opa(sceneGrid, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(sceneGrid, 0, 0);
  lv_obj_set_style_pad_all(sceneGrid, 0, 0);
  lv_obj_clear_flag(sceneGrid, LV_OBJ_FLAG_SCROLLABLE);

  // Grid 2 linhas x 3 colunas (max 6 cenas). Botoes sao maiores que o
  // antigo 2x6, dando feel mais "iOS Home" — alvo de toque ~150x100 px.
  const int COLS = 3, ROWS = 2;
  int gridX = sw(6);
  int gridW = SCREEN_W - 2 * gridX;
  int gap   = sw(4);
  int btnW  = (gridW - (COLS - 1) * gap) / COLS;
  int btnH  = (gridH - (ROWS - 1) * gap) / ROWS;

  // Reset refs antigos (botoes vao ser recriados)
  for (int i = 0; i < SCENES_MAX; i++) { itemBtns[i] = nullptr; itemIcons[i] = nullptr; }

  for (int i = 0; i < sceneCount && i < SCENES_MAX; i++) {
    int row = i / COLS;
    int col = i % COLS;
    int x = gridX + col * (btnW + gap);
    int y = row * (btnH + gap);

    bool isScene = (items[i].type == 0);
    const lv_image_dsc_t *iconImg = resolveIcon(items[i].iconHint, items[i].type, i);
    // Cor scene = paleta cycling (decorativo). Device = pintada por paintDeviceState
    uint32_t iconColor = isScene ? SCENE_COLOR_PALETTE[i] : COL_DIM;

    // Card DS — bg/border iniciais; paintDeviceState aplica estado on/off depois
    lv_obj_t *btn = lv_obj_create(sceneGrid);
    lv_obj_set_size(btn, btnW, btnH);
    lv_obj_set_pos(btn, x, y);
    lv_obj_set_style_bg_color(btn, lv_color_hex(COL_CARD), 0);
    lv_obj_set_style_bg_opa(btn, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(btn, lv_color_hex(COL_BORDER), 0);
    lv_obj_set_style_border_width(btn, 1, 0);
    lv_obj_set_style_radius(btn, RADIUS_LG, 0);
    lv_obj_set_style_pad_all(btn, sw(2), 0);
    lv_obj_set_style_shadow_width(btn, 0, 0);
    lv_obj_clear_flag(btn, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(btn, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(btn, sceneClickCb, LV_EVENT_CLICKED, (void*)(intptr_t)i);

    // Icone top
    lv_obj_t *ico = lv_image_create(btn);
    lv_image_set_src(ico, iconImg);
    lv_obj_set_style_image_recolor(ico, lv_color_hex(iconColor), 0);
    lv_obj_set_style_image_recolor_opa(ico, LV_OPA_COVER, 0);
    lv_obj_align(ico, LV_ALIGN_TOP_MID, 0, sh(12));

    // Label embaixo
    lv_obj_t *lbl = lv_label_create(btn);
    lv_label_set_text(lbl, items[i].name);
    lv_label_set_long_mode(lbl, LV_LABEL_LONG_DOT);
    lv_obj_set_width(lbl, btnW - sw(8));
    lv_obj_set_style_text_color(lbl, lv_color_hex(COL_TEXT), 0);
    lv_obj_set_style_text_font(lbl, FONT_CAPTION, 0);
    lv_obj_set_style_text_align(lbl, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(lbl, LV_ALIGN_BOTTOM_MID, 0, -sh(4));

    // Salva refs + aplica estado on/off (so' efetivo em devices)
    itemBtns[i]  = btn;
    itemIcons[i] = ico;
    if (!isScene) paintDeviceState(i);
  }
}

// Helper interno: copia 1 string com cap (evita repetir strncpy + null term).
static void copyStr(char *dst, size_t dstLen, const char *src) {
  if (!dst || dstLen == 0) return;
  if (!src) { dst[0] = '\0'; return; }
  strncpy(dst, src, dstLen - 1);
  dst[dstLen - 1] = '\0';
}

extern "C" void cultivoUI_applyItems(const CultivoItem *src, int count) {
  if (count < 0) count = 0;
  if (count > SCENES_MAX) count = SCENES_MAX;
  sceneCount = count;
  for (int i = 0; i < count; i++) {
    copyStr(items[i].id,       sizeof(items[i].id),       src[i].id);
    copyStr(items[i].name,     sizeof(items[i].name),     src[i].name);
    copyStr(items[i].iconHint, sizeof(items[i].iconHint), src[i].iconHint);
    items[i].type         = src[i].type;
    items[i].state        = src[i].state;
    items[i].executionSec = src[i].executionSec;
  }
  // Limpa slots nao usados (evita render de lixo se shrink)
  for (int i = count; i < SCENES_MAX; i++) {
    items[i].id[0] = items[i].name[0] = items[i].iconHint[0] = '\0';
    items[i].type = 0; items[i].state = false; items[i].executionSec = 0;
  }
  printf("[ui] cultivoUI_applyItems count=%d\n", count);
  rebuildSceneGrid();
}

// Legacy: mantida pra compat. Constroi CultivoItem[] com type=scene + iconHint
// vazio (paleta cycling resolve icone).
extern "C" void cultivoUI_applyScenes(const char *names[], int count) {
  CultivoItem buf[SCENES_MAX] = {};
  if (count > SCENES_MAX) count = SCENES_MAX;
  for (int i = 0; i < count; i++) {
    buf[i].id       = "";       // legacy nao tem id (app usa storage proprio)
    buf[i].name     = names[i] ? names[i] : "";
    buf[i].type     = 0;        // scene
    buf[i].state    = false;
    buf[i].iconHint = "";
  }
  cultivoUI_applyItems(buf, count);
}

extern "C" void cultivoUI_setDeviceState(int idx, bool state) {
  if (idx < 0 || idx >= sceneCount) return;
  if (items[idx].type != 1 && items[idx].type != 2) return;  // device + automation
  items[idx].state = state;
  // Restaura opacidade cheia (sceneClickCb baixou pra 70 enquanto carregava)
  if (itemBtns[idx]) lv_obj_set_style_opa(itemBtns[idx], LV_OPA_COVER, 0);
  paintDeviceState(idx);
}

static void buildTarefas(lv_obj_t *tab) {
  lv_obj_set_style_pad_all(tab, 0, 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_bg_color(tab, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(tab, LV_OPA_COVER, 0);

  // Header DS — icone primary (era YEL/amber), titulo + sub
  lv_obj_t *hdrIcon = lv_image_create(tab);
  lv_image_set_src(hdrIcon, &ic_zap);
  lv_obj_set_style_image_recolor(hdrIcon, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_image_recolor_opa(hdrIcon, LV_OPA_COVER, 0);
  lv_obj_align(hdrIcon, LV_ALIGN_TOP_LEFT, sw(4), sh(2));
  makeLabel(tab, "DISPOSITIVOS", COL_TEXT, FONT_TITLE, LV_ALIGN_TOP_LEFT, sw(38), sh(4));
  makeLabel(tab, "Cenas + controles", COL_DIM, FONT_CAPTION, LV_ALIGN_TOP_RIGHT, -sw(6), sh(8));

  // Guarda parent pra rebuild dinamico quando applyScenes for chamado
  sceneTab = tab;
  rebuildSceneGrid();  // 1a build com sceneCount=0 (mostra placeholder)
}

// ════════════════════════════════════════════════════════════════════════════════
// Tela Historico — chart + botoes de metrica (temp/rh/ph/ec)
// Dados reais do server via fetchHistoryAll (firmware) ou mock (sim).
// Buffers preenchidos pelo app, UI le e renderiza no applyHistData.
// ════════════════════════════════════════════════════════════════════════════════
extern "C" {
  float histTemp[HIST_POINTS] = {0};
  float histRh  [HIST_POINTS] = {0};
  float histPh  [HIST_POINTS] = {0};
  float histEc  [HIST_POINTS] = {0};
  int   histCount = 0;  // 0 = sem dados ainda
}

static lv_obj_t *histChart    = nullptr;
static lv_obj_t *histStatsLbl = nullptr;  // "Agora X · Min Y · Max Z"
static lv_obj_t *histXAxisLbl = nullptr;  // "-24h ... agora"
static lv_chart_series_t *histSer = nullptr;
static int histMetric = 0;  // 0=temp, 1=rh, 2=ph, 3=ec

static const struct {
  const char *name;
  uint32_t color;
  int ymin, ymax;
  // Multiplicador p/ converter float -> int do chart (LVGL chart usa int).
  // pH/EC vao em decimo (6.2 -> 62), tempC/rh inteiro.
  float scale;
  // Unidade pra mostrar no header (ex: "TEMP: 24.5°C")
  const char *unit;
  // Casas decimais no display ("%.1f" pra TEMP/pH/EC, "%.0f" pra UMID)
  int decimals;
  // Origem do array (escolhido por idx em applyHistData).
} HIST_METRICS[4] = {
  // Cores DS: cada metrica tem cor distinta na sparkline pra leitura rapida
  // ("essa onda laranja e' temperatura"). Valor branco fica no header — cor
  // aqui e' decorativa, nao compete com primary/branding.
  {"TEMP", COL_PHASE_HARVEST, 15, 35,  1.0f,  "\xC2\xB0""C", 1},  // °C UTF-8
  {"UMID", COL_CYN,            0, 100, 1.0f,  "%",           0},
  {"pH",   COL_PRP,           40, 90,  10.0f, "",            1},
  {"EC",   COL_AMBER,          0, 40,  10.0f, "",            1},
};

static const float *histArrayFor(int metric) {
  switch (metric) {
    case 0: return histTemp;
    case 1: return histRh;
    case 2: return histPh;
    case 3: return histEc;
  }
  return histTemp;
}

static void applyHistData() {
  if (!histChart || !histSer) return;
  auto &m = HIST_METRICS[histMetric];
  lv_chart_set_range(histChart, LV_CHART_AXIS_PRIMARY_Y, m.ymin, m.ymax);
  // Tudo na cor da metrica: linha (via set_series_color, sobrescreve estilo),
  // gradient fill, indicator (bolinha), outline pulse — display "respira"
  // na cor do que esta sendo monitorado.
  lv_chart_set_series_color(histChart, histSer, lv_color_hex(m.color));
  lv_obj_set_style_line_color(histChart, lv_color_hex(m.color), LV_PART_ITEMS);
  lv_obj_set_style_bg_color(histChart, lv_color_hex(m.color), LV_PART_ITEMS);
  lv_obj_set_style_bg_grad_color(histChart, lv_color_hex(COL_BG), LV_PART_ITEMS);
  lv_obj_set_style_bg_color(histChart, lv_color_hex(m.color), LV_PART_INDICATOR);
  lv_obj_set_style_outline_color(histChart, lv_color_hex(m.color), 0);

  const float *arr = histArrayFor(histMetric);
  // histCount = pontos validos. Resto dos 24 fica como LV_CHART_POINT_NONE
  // pra LVGL pular. Empurramos os validos pelos ULTIMOS slots (mais recentes
  // a direita do chart) — slot 23 = mais novo, slot 0 = mais antigo OU vazio.
  int valid = histCount > HIST_POINTS ? HIST_POINTS : histCount;
  int pad   = HIST_POINTS - valid;  // slots vazios a esquerda

  // Coleta min/max/last/prev enquanto popula o chart
  float minV = 0, maxV = 0, lastV = 0, prevV = 0;
  bool hasAny = false, hasPrev = false;

  for (int i = 0; i < HIST_POINTS; i++) {
    if (i < pad) {
      lv_chart_set_value_by_id(histChart, histSer, i, LV_CHART_POINT_NONE);
    } else {
      float v = arr[i - pad];
      lv_chart_set_value_by_id(histChart, histSer, i, (int32_t)(v * m.scale));
      if (!hasAny) { minV = maxV = v; hasAny = true; }
      else { if (v < minV) minV = v; if (v > maxV) maxV = v; }
      if (hasAny) { prevV = lastV; hasPrev = true; }
      lastV = v;  // ultimo valido = mais recente
    }
  }
  // hasPrev so' eh true se temos pelo menos 2 pontos
  hasPrev = hasPrev && (valid >= 2);

  lv_chart_refresh(histChart);

  // Atualiza header de stats. Formato:
  //   "Agora 24.5°C ↑+0.3  Min 21.2  Max 27.8"
  //
  // Seta de tendencia: compara ultimo vs penultimo. Threshold de 0.1 unidade
  // pra evitar arrow tremulando em variacao desprezivel.
  if (histStatsLbl) {
    if (!hasAny) {
      lv_label_set_text(histStatsLbl, "sem dados ainda");
    } else {
      char buf[128];
      const char *fmt;
      if (hasPrev) {
        float delta = lastV - prevV;
        const char *arrow = delta > 0.1f ? LV_SYMBOL_UP
                          : delta < -0.1f ? LV_SYMBOL_DOWN
                          : "";
        if (m.decimals == 0) {
          fmt = "Agora %.0f%s %s%+.0f  Min %.0f  Max %.0f";
          snprintf(buf, sizeof(buf), fmt, lastV, m.unit, arrow, delta, minV, maxV);
        } else {
          fmt = "Agora %.1f%s %s%+.1f  Min %.1f  Max %.1f";
          snprintf(buf, sizeof(buf), fmt, lastV, m.unit, arrow, delta, minV, maxV);
        }
      } else {
        fmt = m.decimals == 0
          ? "Agora %.0f%s  Min %.0f  Max %.0f"
          : "Agora %.1f%s  Min %.1f  Max %.1f";
        snprintf(buf, sizeof(buf), fmt, lastV, m.unit, minV, maxV);
      }
      lv_label_set_text(histStatsLbl, buf);
      lv_obj_set_style_text_color(histStatsLbl, lv_color_hex(m.color), 0);
    }
  }
}

extern "C" void cultivoUI_applyHistory(void) {
  applyHistData();
}

static lv_obj_t *histMetricBtns[4] = {nullptr};

// Aplica visual de pill DS aos botoes. Cada metrica tem SUA propria cor:
//   - ativo:   bg cor-da-metrica + border cor-da-metrica + texto branco
//   - inativo: bg transparent + border neutra + texto dim
// Antes era tudo COL_PRIMARY (verde) fixo — user pediu cor por metrica.
static void histStylePills(int activeIdx) {
  for (int i = 0; i < 4; i++) {
    bool sel = (i == activeIdx);
    uint32_t metricC = HIST_METRICS[i].color;
    lv_obj_set_style_bg_color(histMetricBtns[i],
      lv_color_hex(sel ? metricC : COL_CARD), 0);
    lv_obj_set_style_bg_opa(histMetricBtns[i],
      sel ? LV_OPA_COVER : LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_color(histMetricBtns[i],
      lv_color_hex(sel ? metricC : COL_BORDER), 0);
    lv_obj_t *lbl = lv_obj_get_child(histMetricBtns[i], 0);
    if (lbl) lv_obj_set_style_text_color(lbl,
      lv_color_hex(sel ? COL_TEXT : COL_DIM), 0);
  }
}

static void histMetricCb(lv_event_t *e) {
  int idx = (int)(intptr_t)lv_event_get_user_data(e);
  histMetric = idx;
  histStylePills(idx);
  applyHistData();
}

static void buildHistorico(lv_obj_t *tab) {
  lv_obj_set_style_pad_all(tab, 0, 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_bg_color(tab, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(tab, LV_OPA_COVER, 0);

  // Header — icone primary (era ciano), titulo + sub
  lv_obj_t *hdrIcon = lv_image_create(tab);
  lv_image_set_src(hdrIcon, &ic_activity);
  lv_obj_set_style_image_recolor(hdrIcon, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_image_recolor_opa(hdrIcon, LV_OPA_COVER, 0);
  lv_obj_align(hdrIcon, LV_ALIGN_TOP_LEFT, sw(4), sh(2));
  makeLabel(tab, "HISTORICO", COL_TEXT, FONT_TITLE, LV_ALIGN_TOP_LEFT, sw(38), sh(4));
  makeLabel(tab, "ultimas 24h", COL_DIM, FONT_CAPTION, LV_ALIGN_TOP_RIGHT, -sw(6), sh(8));

  // Stats header: "Agora X · Min Y · Max Z" na cor da metrica
  histStatsLbl = lv_label_create(tab);
  lv_label_set_text(histStatsLbl, "carregando...");
  lv_obj_set_style_text_color(histStatsLbl, lv_color_hex(COL_PHASE_HARVEST), 0);
  lv_obj_set_style_text_font(histStatsLbl, FONT_CAPTION, 0);
  lv_obj_align(histStatsLbl, LV_ALIGN_TOP_MID, 0, sh(22));

  // Chart DS — bg = COL_CARD elevado, border neutra finissima, line_width 3
  int btnH     = sh(32);
  int btnAreaH = btnH + sh(10);  // botao + gap
  int xAxisH   = sh(10);          // espaco pros time labels
  histChart = lv_chart_create(tab);
  lv_obj_set_size(histChart, SCREEN_W - sw(16), TAB_H - sh(48) - btnAreaH - xAxisH);
  lv_obj_align(histChart, LV_ALIGN_TOP_MID, 0, sh(40));
  lv_chart_set_type(histChart, LV_CHART_TYPE_LINE);
  lv_chart_set_point_count(histChart, 24);
  lv_chart_set_div_line_count(histChart, 3, 5);
  lv_obj_set_style_bg_color(histChart, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_border_color(histChart, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_border_width(histChart, 1, 0);
  lv_obj_set_style_radius(histChart, RADIUS_LG, 0);
  lv_obj_set_style_line_color(histChart, lv_color_hex(COL_BORDER), LV_PART_MAIN);
  lv_obj_set_style_line_width(histChart, sw(3), LV_PART_ITEMS);
  // Gradient fill abaixo da linha — bg_opa 30 com gradient vertical
  // do COL_BG (transparente) ate' a cor da metrica. Visual mais cheio.
  lv_obj_set_style_bg_opa(histChart, LV_OPA_30, LV_PART_ITEMS);
  lv_obj_set_style_bg_grad_dir(histChart, LV_GRAD_DIR_VER, LV_PART_ITEMS);
  lv_obj_set_style_bg_main_stop(histChart, 0, LV_PART_ITEMS);
  lv_obj_set_style_bg_grad_stop(histChart, 200, LV_PART_ITEMS);
  // Ponto indicator: bolinha 7px na cor da metrica destaca os pontos.
  // Antes era 0 (sem pontos visiveis); agora cada ponto valido vira um dot.
  lv_obj_set_style_width(histChart,  sw(6), LV_PART_INDICATOR);
  lv_obj_set_style_height(histChart, sw(6), LV_PART_INDICATOR);
  lv_obj_set_style_radius(histChart, LV_RADIUS_CIRCLE, LV_PART_INDICATOR);
  lv_obj_set_style_pad_all(histChart, sw(6), 0);
  histSer = lv_chart_add_series(histChart, lv_color_hex(COL_PRIMARY), LV_CHART_AXIS_PRIMARY_Y);

  // Pulse "live" no outline do chart — feel de monitor ativo. Cor inicial
  // = TEMP (laranja); applyHistData troca a cor do outline conforme metrica
  // selecionada (laranja/ciano/roxo/amber).
  applyRingPulse(histChart, HIST_METRICS[0].color, MOTION_BREATH, 0);

  // X-axis time labels — span igualmente espacado embaixo do chart.
  // 5 marcadores: -24h, -18h, -12h, -6h, agora (cada ponto = 1h).
  // Espacamento horizontal alinhado com o chart (mesma largura interna).
  histXAxisLbl = lv_label_create(tab);
  lv_label_set_text(histXAxisLbl, "-24h     -18h     -12h     -6h     agora");
  lv_obj_set_style_text_color(histXAxisLbl, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(histXAxisLbl, FONT_CAPTION, 0);
  lv_obj_align(histXAxisLbl, LV_ALIGN_TOP_MID, 0, sh(40) + (TAB_H - sh(48) - btnAreaH - xAxisH) + sh(2));

  // Botoes pill (segmented control) — DS style. Inicializa como botoes
  // neutros; histStylePills aplica o estado visual logo abaixo.
  int btnGap = sw(8);
  int btnW = (SCREEN_W - sw(16) - btnGap * 3) / 4;
  for (int i = 0; i < 4; i++) {
    lv_obj_t *btn = lv_btn_create(tab);
    lv_obj_set_size(btn, btnW, btnH);
    lv_obj_align(btn, LV_ALIGN_BOTTOM_LEFT,
                 sw(8) + i * (btnW + btnGap), -sh(6));
    lv_obj_set_style_border_width(btn, 1, 0);
    lv_obj_set_style_radius(btn, RADIUS_XL, 0);  // pill radius
    lv_obj_set_style_shadow_width(btn, 0, 0);
    lv_obj_add_event_cb(btn, histMetricCb, LV_EVENT_CLICKED, (void*)(intptr_t)i);
    lv_obj_t *lbl = makeLabel(btn, HIST_METRICS[i].name,
                              COL_DIM, FONT_CAPTION, LV_ALIGN_CENTER, 0, 0);
    (void)lbl;
    histMetricBtns[i] = btn;
  }
  histStylePills(0);  // TEMP ativo no boot

  applyHistData();
}

// ════════════════════════════════════════════════════════════════════════════════
// Navbar DS — 3 tabs com indicador linha topo no tab ativo (estilo iOS/Material).
// Atualiza cor do icone (primary se ativo, dim caso contrario) E posiciona
// o indicator com animacao fast (150ms) — "swipe" entre tabs.
// ════════════════════════════════════════════════════════════════════════════════
static lv_obj_t *navIndicator = nullptr;

static void navSetActive(int idx) {
  for (int i = 0; i < NAV_COUNT; i++) {
    bool sel = (i == idx);
    lv_obj_set_style_image_recolor(navIcons[i],
      lv_color_hex(sel ? COL_PRIMARY : COL_DIM), 0);
    lv_obj_set_style_image_recolor_opa(navIcons[i], LV_OPA_COVER, 0);
  }

  // Indicator linha primary no topo do tab ativo. Anima x_pos com motion fast.
  if (navIndicator) {
    int btnW = SCREEN_W / NAV_COUNT;
    int targetX = idx * btnW;
    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, navIndicator);
    int32_t curX = lv_obj_get_x(navIndicator);
    lv_anim_set_values(&a, curX, targetX);
    lv_anim_set_time(&a, MOTION_FAST);
    lv_anim_set_exec_cb(&a, [](void *obj, int32_t v) {
      lv_obj_set_x((lv_obj_t*)obj, v);
    });
    lv_anim_start(&a);
  }
}

static void switchScreen(int idx) {
  if (idx == activeScreen) return;
  // 5 tabs: 0=Home, 1=Plantas, 2=Historico, 3=Tarefas, 4=Cenas
  // (screenTarefa = Cenas/Dispositivos — nome legado da var)
  lv_obj_t *screens[NAV_COUNT] = {
    screenHome, screenPlants, screenGrafic, screenTasks, screenTarefa
  };
  if (idx < 0 || idx >= NAV_COUNT) return;

  lv_obj_add_flag(screens[activeScreen], LV_OBJ_FLAG_HIDDEN);
  lv_obj_clear_flag(screens[idx], LV_OBJ_FLAG_HIDDEN);

  lv_anim_t a;
  lv_anim_init(&a);
  lv_anim_set_var(&a, screens[idx]);
  lv_anim_set_values(&a, LV_OPA_TRANSP, LV_OPA_COVER);
  lv_anim_set_time(&a, 180);
  lv_anim_set_exec_cb(&a, [](void *obj, int32_t v) {
    lv_obj_set_style_opa((lv_obj_t*)obj, v, 0);
  });
  lv_anim_start(&a);

  activeScreen = idx;
  navSetActive(idx);
  if (idx == 0) refreshHomeValues();
}

static void navBtnClickCb(lv_event_t *e) {
  int idx = (int)(intptr_t)lv_event_get_user_data(e);
  printf("[sim] nav click idx=%d\n", idx);
  switchScreen(idx);
}

static void buildNavbar(lv_obj_t *parent) {
  navbar = lv_obj_create(parent);
  lv_obj_set_size(navbar, SCREEN_W, TABBAR_H);
  lv_obj_align(navbar, LV_ALIGN_BOTTOM_MID, 0, 0);
  // BG = COL_BG (mesmo do tab) pra dar feel "single surface" — separa so'
  // pela border-top finissima COL_BORDER. Era 0x0A0F17 arbitrario.
  lv_obj_set_style_bg_color(navbar, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(navbar, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(navbar, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_border_width(navbar, 1, 0);
  lv_obj_set_style_border_side(navbar, LV_BORDER_SIDE_TOP, 0);
  lv_obj_set_style_radius(navbar, 0, 0);
  lv_obj_set_style_pad_all(navbar, 0, 0);
  lv_obj_clear_flag(navbar, LV_OBJ_FLAG_SCROLLABLE);

  int btnW = SCREEN_W / NAV_COUNT;

  // Indicator: linha 2px PRIMARY no topo, posicionado sobre o tab ativo.
  // Criado ANTES dos botoes pra ficar atras (z-order natural — botoes
  // desenham por cima mas mantem clickable).
  navIndicator = lv_obj_create(navbar);
  lv_obj_set_size(navIndicator, btnW, sh(2));
  lv_obj_set_pos(navIndicator, 0, 0);
  lv_obj_set_style_bg_color(navIndicator, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_bg_opa(navIndicator, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(navIndicator, 0, 0);
  lv_obj_set_style_radius(navIndicator, 0, 0);
  lv_obj_set_style_pad_all(navIndicator, 0, 0);
  lv_obj_clear_flag(navIndicator, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_clear_flag(navIndicator, LV_OBJ_FLAG_SCROLLABLE);

  for (int i = 0; i < NAV_COUNT; i++) {
    lv_obj_t *btn = lv_obj_create(navbar);
    lv_obj_set_size(btn, btnW, TABBAR_H);
    lv_obj_set_pos(btn, i * btnW, 0);
    lv_obj_set_style_bg_opa(btn, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(btn, 0, 0);
    lv_obj_set_style_radius(btn, 0, 0);
    lv_obj_set_style_pad_all(btn, 0, 0);
    lv_obj_clear_flag(btn, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_event_cb(btn, navBtnClickCb, LV_EVENT_CLICKED,
                        (void*)(intptr_t)i);

    lv_obj_t *ic = lv_image_create(btn);
    lv_image_set_src(ic, NAV_ICONS_IMG[i]);
    lv_obj_set_style_image_recolor_opa(ic, LV_OPA_COVER, 0);
    lv_obj_center(ic);
    navIcons[i] = ic;
  }

  navSetActive(0);
}

#ifdef CULTIVO_SIM
// ════════════════════════════════════════════════════════════════════════════════
// Timer de mock: varia tempC/rh/ph/ec em ondas senoidais — UI fica "viva"
// (so' no simulador; no firmware quem alimenta esses globals e fetchDisplayData)
// ════════════════════════════════════════════════════════════════════════════════
static void mockTimerCb(lv_timer_t *t) {
  (void)t;
  static uint32_t tick = 0;
  tick++;
  float w1 = sinf(tick * 0.1f);
  float w2 = sinf(tick * 0.07f + 1.3f);
  float w3 = sinf(tick * 0.05f + 2.1f);

  tempC = 24.5f + w1 * 2.0f;
  rh    = 62.0f + w2 * 6.0f;
  phv   = 6.2f  + w3 * 0.3f;
  ecv   = 1.8f  + w1 * 0.2f;

  // VPD via Tetens — SVP(kPa) = 0.6108 * e^(17.27*T/(T+237.3))
  // VPD = SVP * (1 - RH/100). Mesma formula do app web.
  float svp = 0.6108f * expf(17.27f * tempC / (tempC + 237.3f));
  vpd = svp * (1.0f - rh / 100.0f);

  // PPFD atual oscilando em torno do target (simula dimming/flutuacao)
  currentPpfd = targetPpfd + (int)(w3 * 25.0f);
  if (currentPpfd < 0) currentPpfd = 0;

  if (activeScreen == 0) refreshHomeValues();
}
#endif  // CULTIVO_SIM

// ════════════════════════════════════════════════════════════════════════════════
// Aba TAREFAS — lista vertical scrollable. App preenche via applyTasks.
// Tap em qualquer row dispara onTaskToggle(taskId) e UI inverte visual
// (optimistic, server confirma ou reverte via setTaskDone).
// ════════════════════════════════════════════════════════════════════════════════
typedef struct {
  int  id;
  char title[64];
  bool done;
} TaskStorage;
static TaskStorage tasks[TASKS_MAX];
static int taskCount = 0;
static lv_obj_t *tasksTab     = nullptr;
static lv_obj_t *tasksList    = nullptr;  // container scrollable
static lv_obj_t *tasksEmpty   = nullptr;  // empty state
static lv_obj_t *taskRows[TASKS_MAX] = {nullptr};
static lv_obj_t *taskChecks[TASKS_MAX] = {nullptr};
static lv_obj_t *taskLabels[TASKS_MAX] = {nullptr};

static CultivoTaskToggleFn onTaskToggle = nullptr;
extern "C" void cultivoUI_setTaskToggleHandler(CultivoTaskToggleFn cb) {
  onTaskToggle = cb;
}

// Pinta row conforme done: ✓ verde sobre bg primary opa 20 + label dim
// strikethrough; OFF: ⬜ vazio + label COL_TEXT
static void paintTaskRow(int idx) {
  if (idx < 0 || idx >= TASKS_MAX) return;
  if (!taskRows[idx] || !taskChecks[idx] || !taskLabels[idx]) return;
  bool done = tasks[idx].done;
  if (done) {
    lv_image_set_src(taskChecks[idx], &ic_check_circle);
    lv_obj_set_style_image_recolor(taskChecks[idx], lv_color_hex(COL_PRIMARY), 0);
    lv_obj_set_style_text_color(taskLabels[idx], lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_text_decor(taskLabels[idx], LV_TEXT_DECOR_STRIKETHROUGH, 0);
    lv_obj_set_style_bg_opa(taskRows[idx], LV_OPA_10, 0);
  } else {
    lv_image_set_src(taskChecks[idx], &ic_check_circle);
    lv_obj_set_style_image_recolor(taskChecks[idx], lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_text_color(taskLabels[idx], lv_color_hex(COL_TEXT), 0);
    lv_obj_set_style_text_decor(taskLabels[idx], LV_TEXT_DECOR_NONE, 0);
    lv_obj_set_style_bg_opa(taskRows[idx], LV_OPA_COVER, 0);
  }
}

static void taskRowClickCb(lv_event_t *e) {
  int idx = (int)(intptr_t)lv_event_get_user_data(e);
  if (idx < 0 || idx >= taskCount) return;
  // Optimistic flip
  tasks[idx].done = !tasks[idx].done;
  paintTaskRow(idx);
  printf("[ui] task tap idx=%d id=%d -> %s\n",
         idx, tasks[idx].id, tasks[idx].done ? "DONE" : "TODO");
  if (onTaskToggle) onTaskToggle(tasks[idx].id);
}

static void rebuildTasksList() {
  if (!tasksTab) return;
  // Drop estruturas anteriores
  if (tasksList)  { lv_obj_del(tasksList);  tasksList = nullptr; }
  if (tasksEmpty) { lv_obj_del(tasksEmpty); tasksEmpty = nullptr; }
  for (int i = 0; i < TASKS_MAX; i++) {
    taskRows[i] = taskChecks[i] = taskLabels[i] = nullptr;
  }

  // Empty state
  if (taskCount == 0) {
    tasksEmpty = lv_label_create(tasksTab);
    lv_label_set_text(tasksEmpty,
      "Nenhuma tarefa pendente\n"
      "Cadastre tarefas no app web");
    lv_obj_set_style_text_color(tasksEmpty, lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_text_font(tasksEmpty, FONT_CAPTION, 0);
    lv_obj_set_style_text_align(tasksEmpty, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(tasksEmpty, LV_ALIGN_CENTER, 0, sh(8));
    return;
  }

  // Container scrollable
  int listY = sh(28);
  int listH = TAB_H - listY - sh(4);
  tasksList = lv_obj_create(tasksTab);
  lv_obj_set_size(tasksList, SCREEN_W, listH);
  lv_obj_set_pos(tasksList, 0, listY);
  lv_obj_set_style_bg_opa(tasksList, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(tasksList, 0, 0);
  lv_obj_set_style_pad_all(tasksList, sw(6), 0);
  lv_obj_set_flex_flow(tasksList, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(tasksList, sh(4), 0);
  lv_obj_set_scroll_dir(tasksList, LV_DIR_VER);

  for (int i = 0; i < taskCount && i < TASKS_MAX; i++) {
    lv_obj_t *row = lv_obj_create(tasksList);
    lv_obj_set_size(row, LV_PCT(100), sh(36));
    lv_obj_set_style_bg_color(row, lv_color_hex(COL_CARD), 0);
    lv_obj_set_style_bg_opa(row, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(row, lv_color_hex(COL_BORDER), 0);
    lv_obj_set_style_border_width(row, 1, 0);
    lv_obj_set_style_radius(row, RADIUS_MD, 0);
    lv_obj_set_style_pad_hor(row, sw(8), 0);
    lv_obj_set_style_pad_ver(row, sh(4), 0);
    lv_obj_clear_flag(row, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(row, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(row, taskRowClickCb, LV_EVENT_CLICKED, (void*)(intptr_t)i);

    lv_obj_t *chk = lv_image_create(row);
    lv_image_set_src(chk, &ic_check_circle);
    lv_obj_set_style_image_recolor_opa(chk, LV_OPA_COVER, 0);
    lv_obj_set_style_transform_zoom(chk, 160, 0);  // ~50% (32->16px)
    lv_obj_align(chk, LV_ALIGN_LEFT_MID, -sw(4), 0);

    lv_obj_t *lbl = lv_label_create(row);
    lv_label_set_text(lbl, tasks[i].title);
    lv_label_set_long_mode(lbl, LV_LABEL_LONG_DOT);
    lv_obj_set_width(lbl, SCREEN_W - sw(40));
    lv_obj_set_style_text_font(lbl, FONT_CAPTION, 0);
    lv_obj_align(lbl, LV_ALIGN_LEFT_MID, sw(20), 0);

    taskRows[i]   = row;
    taskChecks[i] = chk;
    taskLabels[i] = lbl;
    paintTaskRow(i);
  }
}

extern "C" void cultivoUI_applyTasks(const CultivoTask *items, int count) {
  if (count < 0) count = 0;
  if (count > TASKS_MAX) count = TASKS_MAX;
  taskCount = count;
  for (int i = 0; i < count; i++) {
    tasks[i].id = items[i].id;
    if (items[i].title) {
      strncpy(tasks[i].title, items[i].title, sizeof(tasks[i].title) - 1);
      tasks[i].title[sizeof(tasks[i].title) - 1] = '\0';
    } else {
      tasks[i].title[0] = '\0';
    }
    tasks[i].done = items[i].done;
  }
  for (int i = count; i < TASKS_MAX; i++) {
    tasks[i].id = 0; tasks[i].title[0] = '\0'; tasks[i].done = false;
  }
  printf("[ui] applyTasks count=%d\n", count);
  rebuildTasksList();
}

extern "C" void cultivoUI_setTaskDone(int taskId, bool done) {
  for (int i = 0; i < taskCount; i++) {
    if (tasks[i].id == taskId) {
      tasks[i].done = done;
      paintTaskRow(i);
      return;
    }
  }
}

static void buildTasksScreen(lv_obj_t *tab) {
  lv_obj_set_style_pad_all(tab, 0, 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_bg_color(tab, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(tab, LV_OPA_COVER, 0);

  // Header
  lv_obj_t *hdrIcon = lv_image_create(tab);
  lv_image_set_src(hdrIcon, &ic_tasks);
  lv_obj_set_style_image_recolor(hdrIcon, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_image_recolor_opa(hdrIcon, LV_OPA_COVER, 0);
  lv_obj_align(hdrIcon, LV_ALIGN_TOP_LEFT, sw(4), sh(2));
  makeLabel(tab, "TAREFAS", COL_TEXT, FONT_TITLE, LV_ALIGN_TOP_LEFT, sw(38), sh(4));
  makeLabel(tab, "Da semana", COL_DIM, FONT_CAPTION, LV_ALIGN_TOP_RIGHT, -sw(6), sh(8));

  tasksTab = tab;
  rebuildTasksList();  // primeira build com count=0 -> empty state
}

// ════════════════════════════════════════════════════════════════════════════════
// Aba PLANTAS — lista de plantas da estufa + detalhe c/ foto
//
// Layout:
//  - Header: ic_sprout + "PLANTAS" + sub "Da estufa"
//  - Lista scrollable (max 10): cada row = stage icon + name + healthBadge + 📷
//  - Tap em row -> dispara onPlantPhotoRequest(id), abre overlay de detalhe
//  - Overlay: foto centralizada (320x240) + status + data + tap back
//
// healthStatus encoding (sincronizado com server):
//  0 = NULL (cinza dim "—")
//  1 = HEALTHY (verde primary)
//  2 = STRESSED (amber)
//  3 = SICK (red)
//  4 = RECOVERING (laranja phase_harvest)
// ════════════════════════════════════════════════════════════════════════════════
typedef struct {
  int  id;
  char name[64];
  char code[32];
  uint8_t stage;
  uint8_t healthStatus;
  bool hasPhoto;
  char lastPhotoDate[32];
} PlantStorage;
static PlantStorage plants[PLANTS_MAX];
static int plantCount = 0;
static lv_obj_t *plantsTab   = nullptr;
static lv_obj_t *plantsList  = nullptr;
static lv_obj_t *plantsEmpty = nullptr;

// Tela de detalhe (overlay sobre o tab)
static lv_obj_t *plantDetailScreen = nullptr;
static lv_obj_t *plantDetailImage  = nullptr;
static lv_obj_t *plantDetailStatus = nullptr;
static lv_obj_t *plantDetailDate   = nullptr;
static lv_obj_t *plantDetailName   = nullptr;
static lv_obj_t *plantDetailLoad   = nullptr;  // label "Carregando foto..."
static int       plantDetailId     = -1;  // qual planta esta sendo exibida

// Buffer JPEG global na PSRAM (alocado lazy, 128KB folgado)
static uint8_t      *plantJpegBuf  = nullptr;
static size_t        plantJpegLen  = 0;
static lv_image_dsc_t plantJpegDsc = {};

static CultivoPlantPhotoRequestFn onPlantPhotoRequest = nullptr;
static CultivoPlantDetailClosedFn onPlantDetailClosed = nullptr;
extern "C" void cultivoUI_setPlantPhotoRequestHandler(CultivoPlantPhotoRequestFn cb) {
  onPlantPhotoRequest = cb;
}
extern "C" void cultivoUI_setPlantDetailClosedHandler(CultivoPlantDetailClosedFn cb) {
  onPlantDetailClosed = cb;
}

static uint32_t healthColor(uint8_t status) {
  switch (status) {
    case 1: return COL_PRIMARY;          // HEALTHY = verde
    case 2: return COL_AMBER;            // STRESSED = amber
    case 3: return COL_RED;              // SICK = vermelho
    case 4: return COL_PHASE_HARVEST;    // RECOVERING = laranja
    default: return COL_DIM;             // NULL = cinza
  }
}
static const char* healthLabel(uint8_t status) {
  switch (status) {
    case 1: return "HEALTHY";
    case 2: return "STRESSED";
    case 3: return "SICK";
    case 4: return "RECOVERING";
    default: return "—";
  }
}
static const lv_image_dsc_t* stageIcon(uint8_t stage) {
  // 0=CLONE, 1=SEEDLING, 2=PLANT — todos viram ic_sprout por enquanto
  // (sem icones diferentes pra cada). Stage e' textual no label.
  (void)stage;
  return &ic_sprout;
}
static const char* stageLabel(uint8_t stage) {
  switch (stage) {
    case 0: return "CLONE";
    case 1: return "SEEDLING";
    case 2: return "PLANT";
    default: return "?";
  }
}

// Forward decl
static void openPlantDetail(int idx);
static void closePlantDetail();
static void rebuildPlantsList();

static void plantRowClickCb(lv_event_t *e) {
  int idx = (int)(intptr_t)lv_event_get_user_data(e);
  if (idx < 0 || idx >= plantCount) return;
  openPlantDetail(idx);
}

static void rebuildPlantsList() {
  if (!plantsTab) return;
  if (plantsList)  { lv_obj_del(plantsList);  plantsList = nullptr; }
  if (plantsEmpty) { lv_obj_del(plantsEmpty); plantsEmpty = nullptr; }

  if (plantCount == 0) {
    plantsEmpty = lv_label_create(plantsTab);
    lv_label_set_text(plantsEmpty,
      "Nenhuma planta ativa\n"
      "Cadastre plantas no app web");
    lv_obj_set_style_text_color(plantsEmpty, lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_text_font(plantsEmpty, FONT_CAPTION, 0);
    lv_obj_set_style_text_align(plantsEmpty, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(plantsEmpty, LV_ALIGN_CENTER, 0, sh(8));
    return;
  }

  int listY = sh(28);
  int listH = TAB_H - listY - sh(4);
  plantsList = lv_obj_create(plantsTab);
  lv_obj_set_size(plantsList, SCREEN_W, listH);
  lv_obj_set_pos(plantsList, 0, listY);
  lv_obj_set_style_bg_opa(plantsList, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(plantsList, 0, 0);
  lv_obj_set_style_pad_all(plantsList, sw(6), 0);
  lv_obj_set_flex_flow(plantsList, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(plantsList, sh(4), 0);
  lv_obj_set_scroll_dir(plantsList, LV_DIR_VER);

  for (int i = 0; i < plantCount && i < PLANTS_MAX; i++) {
    lv_obj_t *row = lv_obj_create(plantsList);
    lv_obj_set_size(row, LV_PCT(100), sh(44));
    lv_obj_set_style_bg_color(row, lv_color_hex(COL_CARD), 0);
    lv_obj_set_style_bg_opa(row, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(row, lv_color_hex(COL_BORDER), 0);
    lv_obj_set_style_border_width(row, 1, 0);
    lv_obj_set_style_radius(row, RADIUS_MD, 0);
    lv_obj_set_style_pad_hor(row, sw(8), 0);
    lv_obj_set_style_pad_ver(row, sh(4), 0);
    lv_obj_clear_flag(row, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(row, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(row, plantRowClickCb, LV_EVENT_CLICKED, (void*)(intptr_t)i);

    // Stage icon esquerda
    lv_obj_t *stIcon = lv_image_create(row);
    lv_image_set_src(stIcon, stageIcon(plants[i].stage));
    lv_obj_set_style_image_recolor(stIcon, lv_color_hex(COL_PRIMARY), 0);
    lv_obj_set_style_image_recolor_opa(stIcon, LV_OPA_COVER, 0);
    lv_obj_align(stIcon, LV_ALIGN_LEFT_MID, 0, 0);

    // Name + code/stage
    lv_obj_t *nameLbl = lv_label_create(row);
    lv_label_set_text(nameLbl, plants[i].name);
    lv_label_set_long_mode(nameLbl, LV_LABEL_LONG_DOT);
    lv_obj_set_width(nameLbl, sw(220));
    lv_obj_set_style_text_font(nameLbl, FONT_CAPTION, 0);
    lv_obj_set_style_text_color(nameLbl, lv_color_hex(COL_TEXT), 0);
    lv_obj_align(nameLbl, LV_ALIGN_LEFT_MID, sw(32), -sh(8));

    // Code · stage
    char subBuf[64];
    if (plants[i].code[0]) {
      snprintf(subBuf, sizeof(subBuf), "%s · %s",
               plants[i].code, stageLabel(plants[i].stage));
    } else {
      snprintf(subBuf, sizeof(subBuf), "%s%s", stageLabel(plants[i].stage),
               plants[i].hasPhoto ? "" : " · sem foto");
    }
    lv_obj_t *subLbl = lv_label_create(row);
    lv_label_set_text(subLbl, subBuf);
    lv_obj_set_style_text_font(subLbl, FONT_CAPTION, 0);
    lv_obj_set_style_text_color(subLbl, lv_color_hex(COL_DIM), 0);
    lv_obj_align(subLbl, LV_ALIGN_LEFT_MID, sw(32), sh(8));

    // Health badge (right)
    lv_obj_t *hb = lv_label_create(row);
    lv_label_set_text(hb, healthLabel(plants[i].healthStatus));
    uint32_t hc = healthColor(plants[i].healthStatus);
    lv_obj_set_style_text_color(hb, lv_color_hex(hc), 0);
    lv_obj_set_style_bg_color(hb, lv_color_hex(hc), 0);
    lv_obj_set_style_bg_opa(hb, plants[i].healthStatus ? LV_OPA_20 : LV_OPA_10, 0);
    lv_obj_set_style_pad_hor(hb, sw(6), 0);
    lv_obj_set_style_pad_ver(hb, sh(1), 0);
    lv_obj_set_style_radius(hb, RADIUS_SM, 0);
    lv_obj_set_style_text_font(hb, FONT_CAPTION, 0);
    lv_obj_align(hb, LV_ALIGN_RIGHT_MID, plants[i].hasPhoto ? -sw(28) : 0, 0);

    // 📷 indicador (canto direito) se hasPhoto
    if (plants[i].hasPhoto) {
      lv_obj_t *camIcon = lv_image_create(row);
      lv_image_set_src(camIcon, &ic_refresh);  // placeholder — sem ic_camera ainda
      lv_obj_set_style_image_recolor(camIcon, lv_color_hex(COL_DIM), 0);
      lv_obj_set_style_image_recolor_opa(camIcon, LV_OPA_COVER, 0);
      lv_obj_set_style_transform_zoom(camIcon, 128, 0);  // ~50%
      lv_obj_align(camIcon, LV_ALIGN_RIGHT_MID, 0, 0);
    }
  }
}

extern "C" void cultivoUI_applyPlants(const CultivoPlant *items, int count) {
  if (count < 0) count = 0;
  if (count > PLANTS_MAX) count = PLANTS_MAX;
  plantCount = count;
  for (int i = 0; i < count; i++) {
    plants[i].id = items[i].id;
    if (items[i].name) {
      strncpy(plants[i].name, items[i].name, sizeof(plants[i].name) - 1);
      plants[i].name[sizeof(plants[i].name) - 1] = '\0';
    } else { plants[i].name[0] = '\0'; }
    if (items[i].code) {
      strncpy(plants[i].code, items[i].code, sizeof(plants[i].code) - 1);
      plants[i].code[sizeof(plants[i].code) - 1] = '\0';
    } else { plants[i].code[0] = '\0'; }
    plants[i].stage = items[i].stage;
    plants[i].healthStatus = items[i].healthStatus;
    plants[i].hasPhoto = items[i].hasPhoto;
    if (items[i].lastPhotoDate) {
      strncpy(plants[i].lastPhotoDate, items[i].lastPhotoDate,
              sizeof(plants[i].lastPhotoDate) - 1);
      plants[i].lastPhotoDate[sizeof(plants[i].lastPhotoDate) - 1] = '\0';
    } else { plants[i].lastPhotoDate[0] = '\0'; }
  }
  for (int i = count; i < PLANTS_MAX; i++) {
    plants[i].id = 0;
    plants[i].name[0] = plants[i].code[0] = plants[i].lastPhotoDate[0] = '\0';
    plants[i].stage = plants[i].healthStatus = 0;
    plants[i].hasPhoto = false;
  }
  printf("[ui] applyPlants count=%d\n", count);
  rebuildPlantsList();
}

// ─── Tela de detalhe ──────────────────────────────────────────────────────────

static void plantDetailBackCb(lv_event_t *e) {
  (void)e;
  closePlantDetail();
}

static void openPlantDetail(int idx) {
  if (idx < 0 || idx >= plantCount) return;
  plantDetailId = plants[idx].id;

  // Cria overlay fullscreen. Se ja existe (user reabriu rapido), deleta
  // primeiro e ZERA todos os child pointers — senao callbacks ou apply
  // posterior podem tocar widgets ja deletados (use-after-free LVGL crash).
  if (plantDetailScreen) {
    lv_obj_del(plantDetailScreen);
    plantDetailScreen = nullptr;
    plantDetailImage  = nullptr;
    plantDetailStatus = nullptr;
    plantDetailDate   = nullptr;
    plantDetailName   = nullptr;
    plantDetailLoad   = nullptr;
  }
  plantDetailScreen = lv_obj_create(lv_layer_top());
  lv_obj_remove_style_all(plantDetailScreen);
  lv_obj_set_size(plantDetailScreen, SCREEN_W, SCREEN_H);
  lv_obj_set_pos(plantDetailScreen, 0, 0);
  lv_obj_set_style_bg_color(plantDetailScreen, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(plantDetailScreen, LV_OPA_COVER, 0);
  lv_obj_clear_flag(plantDetailScreen, LV_OBJ_FLAG_SCROLLABLE);

  // Header: ← + nome
  lv_obj_t *backBtn = lv_label_create(plantDetailScreen);
  lv_label_set_text(backBtn, LV_SYMBOL_LEFT);
  lv_obj_set_style_text_color(backBtn, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_text_font(backBtn, &lv_font_montserrat_24, 0);
  lv_obj_align(backBtn, LV_ALIGN_TOP_LEFT, sw(8), sh(8));
  lv_obj_add_flag(backBtn, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_ext_click_area(backBtn, sw(12));
  lv_obj_add_event_cb(backBtn, plantDetailBackCb, LV_EVENT_CLICKED, NULL);

  plantDetailName = lv_label_create(plantDetailScreen);
  lv_label_set_text(plantDetailName, plants[idx].name);
  lv_label_set_long_mode(plantDetailName, LV_LABEL_LONG_DOT);
  lv_obj_set_width(plantDetailName, SCREEN_W - sw(60));
  lv_obj_set_style_text_color(plantDetailName, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_text_font(plantDetailName, FONT_BODY, 0);
  lv_obj_align(plantDetailName, LV_ALIGN_TOP_LEFT, sw(40), sh(10));

  // Container da foto (centralizado)
  plantDetailImage = lv_image_create(plantDetailScreen);
  lv_obj_set_size(plantDetailImage, sw(280), sh(200));
  lv_obj_align(plantDetailImage, LV_ALIGN_CENTER, 0, -sh(12));
  // Placeholder ate' a foto chegar — mostra mensagem loading. Trackeado
  // como plantDetailLoad pra deletar quando o JPEG aplicar (senão fica
  // sobreposto na imagem).
  plantDetailLoad = lv_label_create(plantDetailScreen);
  lv_label_set_text(plantDetailLoad, plants[idx].hasPhoto ? "Carregando foto..." : "Sem foto ainda\nRegistre uma no app");
  lv_obj_set_style_text_align(plantDetailLoad, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_style_text_color(plantDetailLoad, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(plantDetailLoad, FONT_CAPTION, 0);
  lv_obj_align(plantDetailLoad, LV_ALIGN_CENTER, 0, -sh(12));

  // Status + data (rodape)
  plantDetailStatus = lv_label_create(plantDetailScreen);
  char sbuf[64];
  snprintf(sbuf, sizeof(sbuf), "Status: %s", healthLabel(plants[idx].healthStatus));
  lv_label_set_text(plantDetailStatus, sbuf);
  lv_obj_set_style_text_color(plantDetailStatus, lv_color_hex(healthColor(plants[idx].healthStatus)), 0);
  lv_obj_set_style_text_font(plantDetailStatus, FONT_CAPTION, 0);
  lv_obj_align(plantDetailStatus, LV_ALIGN_BOTTOM_LEFT, sw(12), -sh(28));

  plantDetailDate = lv_label_create(plantDetailScreen);
  if (plants[idx].lastPhotoDate[0]) {
    lv_label_set_text_fmt(plantDetailDate, "Foto: %.16s", plants[idx].lastPhotoDate);
  } else {
    lv_label_set_text(plantDetailDate, "");
  }
  lv_obj_set_style_text_color(plantDetailDate, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(plantDetailDate, FONT_CAPTION, 0);
  lv_obj_align(plantDetailDate, LV_ALIGN_BOTTOM_LEFT, sw(12), -sh(8));

  // Pede a foto ao app (so' se hasPhoto)
  if (plants[idx].hasPhoto && onPlantPhotoRequest) {
    onPlantPhotoRequest(plantDetailId);
  }
}

static void closePlantDetail() {
  if (plantDetailScreen) { lv_obj_del(plantDetailScreen); plantDetailScreen = nullptr; }
  plantDetailImage = plantDetailStatus = plantDetailDate = plantDetailName = nullptr;
  plantDetailLoad  = nullptr;
  plantDetailId = -1;
  // Libera buffer JPEG da PSRAM — sem isso ficariam ~128KB pinados entre
  // aberturas. PSRAM realloca rapido na proxima foto.
  if (plantJpegBuf) {
    heap_caps_free(plantJpegBuf);
    plantJpegBuf = nullptr;
    plantJpegLen = 0;
  }
  // Notifica app — main_lvgl libera o buffer de DOWNLOAD (outros 128KB)
  if (onPlantDetailClosed) onPlantDetailClosed();
}

extern "C" void cultivoUI_applyPlantPhoto(int plantId,
                                           const uint8_t *jpegBytes, size_t len,
                                           uint8_t healthStatus,
                                           const char *dateStr) {
  if (plantId != plantDetailId) {
    // User ja' fechou ou abriu outra — ignora
    return;
  }
  if (!plantDetailImage) return;

  if (!jpegBytes || len == 0) {
    printf("[ui] plant photo indisponivel (len=%u)\n", (unsigned)len);
    // Atualiza o loading label pra mostrar mensagem de erro ao inves de
    // ficar "Carregando..." pra sempre
    if (plantDetailLoad) {
      lv_label_set_text(plantDetailLoad, "Foto indisponivel");
    }
    return;
  }

  // RGB565 raw: server pre-decoda JPEG (Sharp .raw()) e empacota como
  // 320x240x2 = 153600 bytes RGB565 little-endian. ESP so' faz memcpy
  // pro buffer LVGL e seta cf=LV_COLOR_FORMAT_RGB565.
  //
  // Por que? Tentamos JPEG via TJPGD do LVGL:
  //  - is_jpg() exige JFIF marker (Sharp omite) -> injetar JFIF
  //  - decoder buffer-mode exige LV_USE_FS_MEMFS=1 -> heap crash
  //  - Cloudflare adiciona chunked encoding -> strip prefix
  // 3 problemas distintos por um decoder de 5KB. Pivotar pra pixels
  // raw eliminou tudo.
  const uint16_t IMG_W = 320, IMG_H = 240;
  const size_t EXPECTED_LEN = (size_t)IMG_W * IMG_H * 2;

  if (len < EXPECTED_LEN) {
    printf("[ui] plant photo size mismatch: %u vs %u — render parcial\n",
           (unsigned)len, (unsigned)EXPECTED_LEN);
  }

  // Copia pra buffer persistente em PSRAM (LVGL precisa do ponteiro valido)
  if (plantJpegBuf && plantJpegLen < len) {
    heap_caps_free(plantJpegBuf);
    plantJpegBuf = nullptr;
    plantJpegLen = 0;  // sem isso, malloc fail abaixo deixa len cravado >0
                       // e proxima call salta o malloc (NULL ptr crash em memcpy)
  }
  if (!plantJpegBuf) {
    plantJpegBuf = (uint8_t*)heap_caps_malloc(len, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!plantJpegBuf) {
      printf("[ui] plant photo malloc fail (%u bytes)\n", (unsigned)len);
      plantJpegLen = 0;  // garante reset pra proxima tentativa
      if (plantDetailLoad) lv_label_set_text(plantDetailLoad, "Sem memoria");
      return;
    }
  }
  // Safety: se jpegBytes for NULL (use-after-free se main_lvgl liberou
  // plantPhotoBuf antes do apply chegar aqui), aborta sem memcpy.
  if (!jpegBytes) {
    printf("[ui] plant photo: jpegBytes NULL — abort\n");
    plantJpegLen = 0;
    if (plantDetailLoad) lv_label_set_text(plantDetailLoad, "Erro");
    return;
  }
  // Server manda RGB565 LE (low byte primeiro). LVGL com LV_COLOR_DEPTH=16
  // tambem usa LE nativo. Sem byte swap.
  memcpy(plantJpegBuf, jpegBytes, len);
  plantJpegLen = len;

  // Dsc pra pixels prontos — sem decoder, LVGL so' blita os bytes.
  plantJpegDsc.header.magic  = LV_IMAGE_HEADER_MAGIC;
  plantJpegDsc.header.cf     = LV_COLOR_FORMAT_RGB565;
  plantJpegDsc.header.flags  = 0;
  plantJpegDsc.header.w      = IMG_W;
  plantJpegDsc.header.h      = IMG_H;
  plantJpegDsc.header.stride = IMG_W * 2;
  plantJpegDsc.data          = plantJpegBuf;
  plantJpegDsc.data_size     = len;

  // Remove o label de loading ANTES de setar a imagem (TJPGD pode demorar
  // 50-100ms decodando — se label fica em cima da image, parece travado)
  if (plantDetailLoad) {
    lv_obj_del(plantDetailLoad);
    plantDetailLoad = nullptr;
  }
  lv_image_set_src(plantDetailImage, &plantJpegDsc);

  // Atualiza badge de status (vem do header X-Health-Status — pode diferir
  // do health "atual" da planta)
  if (plantDetailStatus) {
    char sbuf[64];
    snprintf(sbuf, sizeof(sbuf), "Status: %s", healthLabel(healthStatus));
    lv_label_set_text(plantDetailStatus, sbuf);
    lv_obj_set_style_text_color(plantDetailStatus,
                                 lv_color_hex(healthColor(healthStatus)), 0);
  }
  if (plantDetailDate && dateStr && *dateStr) {
    lv_label_set_text_fmt(plantDetailDate, "Foto: %s", dateStr);
  }
  printf("[ui] plant photo applied plant=%d len=%u status=%u\n",
         plantId, (unsigned)len, healthStatus);
}

static void buildPlantsScreen(lv_obj_t *tab) {
  lv_obj_set_style_pad_all(tab, 0, 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_bg_color(tab, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(tab, LV_OPA_COVER, 0);

  lv_obj_t *hdrIcon = lv_image_create(tab);
  lv_image_set_src(hdrIcon, &ic_sprout);
  lv_obj_set_style_image_recolor(hdrIcon, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_image_recolor_opa(hdrIcon, LV_OPA_COVER, 0);
  lv_obj_align(hdrIcon, LV_ALIGN_TOP_LEFT, sw(4), sh(2));
  makeLabel(tab, "PLANTAS", COL_TEXT, FONT_TITLE, LV_ALIGN_TOP_LEFT, sw(38), sh(4));
  makeLabel(tab, "Da estufa", COL_DIM, FONT_CAPTION, LV_ALIGN_TOP_RIGHT, -sw(6), sh(8));

  plantsTab = tab;
  rebuildPlantsList();
}

// ════════════════════════════════════════════════════════════════════════════════
// buildCultivoUI — entrypoint (equivalente ao buildUI() do main_lvgl.cpp)
// ════════════════════════════════════════════════════════════════════════════════
extern "C" void buildCultivoUI(void) {
  lv_obj_t *scr = lv_scr_act();
  lv_obj_set_style_bg_color(scr, lv_color_hex(0x0F1729), 0);
  lv_obj_set_style_bg_grad_color(scr, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_grad_dir(scr, LV_GRAD_DIR_VER, 0);
  lv_obj_set_style_bg_main_stop(scr, 0, 0);
  lv_obj_set_style_bg_grad_stop(scr, 200, 0);
  lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
  lv_obj_set_style_pad_all(scr, 0, 0);

  // Glow verde canto superior esquerdo
  lv_obj_t *glow1 = lv_obj_create(scr);
  lv_obj_set_size(glow1, SCREEN_W * 3 / 5, SCREEN_H * 3 / 5);
  lv_obj_set_pos(glow1, 0, 0);
  lv_obj_set_style_bg_color(glow1, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_bg_opa(glow1, LV_OPA_10, 0);
  lv_obj_set_style_bg_grad_color(glow1, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_grad_dir(glow1, LV_GRAD_DIR_HOR, 0);
  lv_obj_set_style_border_width(glow1, 0, 0);
  lv_obj_set_style_radius(glow1, 0, 0);
  lv_obj_set_style_pad_all(glow1, 0, 0);
  lv_obj_add_flag(glow1, LV_OBJ_FLAG_IGNORE_LAYOUT);
  lv_obj_remove_flag(glow1, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_remove_flag(glow1, LV_OBJ_FLAG_SCROLLABLE);

  // Glow ciano canto inferior direito
  lv_obj_t *glow2 = lv_obj_create(scr);
  lv_obj_set_size(glow2, SCREEN_W * 2 / 5, SCREEN_H * 2 / 5);
  lv_obj_align(glow2, LV_ALIGN_BOTTOM_RIGHT, 0, 0);
  lv_obj_set_style_bg_color(glow2, lv_color_hex(COL_CYN), 0);
  lv_obj_set_style_bg_opa(glow2, LV_OPA_10, 0);
  lv_obj_set_style_bg_grad_color(glow2, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_grad_dir(glow2, LV_GRAD_DIR_VER, 0);
  lv_obj_set_style_border_width(glow2, 0, 0);
  lv_obj_set_style_radius(glow2, 0, 0);
  lv_obj_set_style_pad_all(glow2, 0, 0);
  lv_obj_add_flag(glow2, LV_OBJ_FLAG_IGNORE_LAYOUT);
  lv_obj_remove_flag(glow2, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_remove_flag(glow2, LV_OBJ_FLAG_SCROLLABLE);

  // Content area (tela inteira menos navbar)
  contentArea = lv_obj_create(scr);
  lv_obj_set_size(contentArea, SCREEN_W, TAB_H);
  lv_obj_set_pos(contentArea, 0, 0);
  lv_obj_set_style_bg_opa(contentArea, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(contentArea, 0, 0);
  lv_obj_set_style_pad_all(contentArea, 0, 0);
  lv_obj_clear_flag(contentArea, LV_OBJ_FLAG_SCROLLABLE);

  auto makeScreen = [&]() -> lv_obj_t* {
    lv_obj_t *s = lv_obj_create(contentArea);
    lv_obj_set_size(s, SCREEN_W, TAB_H);
    lv_obj_set_pos(s, 0, 0);
    lv_obj_set_style_bg_opa(s, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(s, 0, 0);
    lv_obj_set_style_pad_all(s, 0, 0);
    lv_obj_clear_flag(s, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(s, LV_OBJ_FLAG_HIDDEN);
    return s;
  };

  screenHome   = makeScreen();
  screenTarefa = makeScreen();
  screenGrafic = makeScreen();
  screenTasks  = makeScreen();  // 4a tab: lista de tarefas
  screenPlants = makeScreen();  // 5a tab: lista de plantas + foto detail
  // screenLux/PhEc nao construidas — registro vai pelo app mobile.

  buildHome(screenHome);
  buildTarefas(screenTarefa);
  buildHistorico(screenGrafic);
  buildTasksScreen(screenTasks);
  buildPlantsScreen(screenPlants);
  // buildLux/PhEc nao chamados (telas removidas — registro vai pelo app)

  lv_obj_clear_flag(screenHome, LV_OBJ_FLAG_HIDDEN);
  buildNavbar(scr);

  refreshHomeValues();

  // pulse das sparklines (visual): 300ms; vale tanto pra sim quanto firmware
  pulseTimer = lv_timer_create(pulseTimerCb, 300, NULL);
  // Histórico nao tem mais wave-anim mockada — chart redesenha so' quando
  // chegam dados reais novos do server (cultivoUI_applyHistory).

#ifdef CULTIVO_SIM
  // Mock dos sensores so' no sim. No firmware quem alimenta tempC/rh/etc
  // e o fetchDisplayData() rodando em background (netTask).
  mockTimer  = lv_timer_create(mockTimerCb,  500, NULL);
#endif
}
