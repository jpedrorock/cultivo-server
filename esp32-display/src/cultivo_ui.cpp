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

extern "C" void cultivoUI_setLuxSaveHandler(CultivoSaveLuxFn cb)         { onLuxSave    = cb; }
extern "C" void cultivoUI_setPhEcSaveHandler(CultivoSavePhEcFn cb)       { onPhEcSave   = cb; }
extern "C" void cultivoUI_setConfigOpenHandler(CultivoOpenConfigFn cb)   { onConfigOpen = cb; }
extern "C" void cultivoUI_setRefreshHandler(CultivoRefreshFn cb)         { onRefresh    = cb; }
extern "C" void cultivoUI_setSceneTriggerHandler(CultivoSceneTriggerFn cb) { onSceneTrigger = cb; }

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
// Navbar 3 tabs: Home / Hist / Cenas
// DS: ativo SEMPRE em COL_PRIMARY (verde brand) com indicador linha 2px
// no topo do tab. Era 3 cores diferentes (GRN/CYN/AMBER) — ficava parecendo
// botoes desconectados, agora sao "tabs" coerentes igual app/iOS.
#define NAV_COUNT 3
static const lv_image_dsc_t *NAV_ICONS_IMG[NAV_COUNT] = {
  &ic_home, &ic_activity, &ic_zap
};

static lv_obj_t *contentArea;
static lv_obj_t *screenHome, *screenTarefa, *screenGrafic;
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

  // (icone refresh removido — server polling a cada 30s torna refresh manual
  // redundante. Atalho via tap no card UMID continua disponivel.)

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
  {
    int yOffset = (cardH + cardGap) * 2;
    lv_obj_t *c = makeCard(homeFaceA, 0, yOffset, cardW, cycleH);
    lv_obj_set_style_pad_all(c, sw(6), 0);

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

extern "C" void refreshHomeValues() {
  // Refresh trouxe valores frescos. Se estava refreshing (user tocou no
  // botao manual), mostra toast "Atualizado" pra confirmar conclusao.
  // Refresh automatico (fetch periodico) tem isRefreshing=false, sem toast
  // — evita spam visual a cada 30s.
  bool wasManualRefresh = isRefreshing;
  isRefreshing = false;
  if (wasManualRefresh) showToast("Atualizado");
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

  // Card CICLO — atualiza valor "Sem X/Y" + badge fase (texto + cor). Cor
  // do phase token muda automatico se ciclo passou (ex: VEGA -> FLORA).
  if (lblCycleVal) {
    snprintf(buf, sizeof(buf), "Sem %d/%d", semana, totalSem);
    lv_label_set_text(lblCycleVal, buf);
  }
  if (lblCycleBadge) {
    uint32_t pc = phaseColor(FASE);
    lv_label_set_text(lblCycleBadge, FASE);
    lv_obj_set_style_text_color(lblCycleBadge, lv_color_hex(pc), 0);
    lv_obj_set_style_bg_color(lblCycleBadge, lv_color_hex(pc), 0);
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
static const lv_image_dsc_t* resolveIcon(const char *hint, bool isScene, int slotIdx) {
  if (!hint || !*hint) {
    // Cena sem hint: cycling por slot (variedade visual). Device sem hint: zap.
    if (isScene) {
      static const lv_image_dsc_t *cyc[SCENES_MAX] = {
        &ic_droplet, &ic_lightbulb, &ic_sprout,
        &ic_activity, &ic_flask, &ic_thermometer
      };
      return cyc[slotIdx % SCENES_MAX];
    }
    return &ic_zap;
  }
  // iconHint conhecidos do server (sprint 1)
  if (!strcmp(hint, "light"))  return &ic_lightbulb;
  if (!strcmp(hint, "fan"))    return &ic_activity;     // wave/wind
  if (!strcmp(hint, "pump"))   return &ic_droplet;
  if (!strcmp(hint, "heater")) return &ic_thermometer;
  if (!strcmp(hint, "ac"))     return &ic_thermometer;
  return &ic_zap;
}

// Storage atual (preenchido pelo app via cultivoUI_applyItems)
typedef struct {
  char     id[48];          // sceneId/deviceId Tuya
  char     name[24];        // label
  uint8_t  type;            // 0=scene, 1=device
  bool     state;           // device on/off
  char     iconHint[12];    // "light"/"fan"/etc
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
  if (items[idx].type != 1) return;  // so' devices

  bool on = items[idx].state;
  if (on) {
    // ON: card "aceso"
    lv_obj_set_style_bg_color(itemBtns[idx],     lv_color_hex(COL_PRIMARY), 0);
    lv_obj_set_style_bg_opa(itemBtns[idx],       LV_OPA_30, 0);
    lv_obj_set_style_border_color(itemBtns[idx], lv_color_hex(COL_PRIMARY), 0);
    lv_obj_set_style_image_recolor(itemIcons[idx], lv_color_hex(COL_TEXT), 0);
    // Shadow primary suave pra dar feel de "irradiando luz"
    lv_obj_set_style_shadow_color(itemBtns[idx], lv_color_hex(COL_PRIMARY), 0);
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

// Feedback de tap:
//   scene  : flash border primary (one-shot) — sem state, so' confirma trigger
//   device : NAO inverte state localmente (era "optimistic toggle" e gerava
//            "pisca acende-apaga" quando server respondia diferente). Em vez
//            disso, mostra estado "carregando" (border primary fixo + opa
//            reduzido) e aguarda cultivoUI_setDeviceState do app pra pintar
//            estado real. App garante chamar setDeviceState mesmo em falha
//            (com state antigo).
static void sceneClickCb(lv_event_t *e) {
  int idx = (int)(intptr_t)lv_event_get_user_data(e);
  if (idx < 0 || idx >= sceneCount) return;
  printf("[ui] item tap idx=%d type=%d (%s)\n",
         idx, items[idx].type, items[idx].name);
  if (onSceneTrigger) onSceneTrigger(idx);

  if (items[idx].type == 1) {
    // Device — feedback "carregando" sem mudar state local.
    // Border primary + opacidade reduzida. setDeviceState restaura full opa.
    if (itemBtns[idx]) {
      lv_obj_set_style_border_color(itemBtns[idx], lv_color_hex(COL_PRIMARY), 0);
      lv_obj_set_style_opa(itemBtns[idx], LV_OPA_70, 0);
    }
    return;
  }

  // Scene — flash border primary -> volta ao neutro
  lv_obj_t *btn = (lv_obj_t*)lv_event_get_target(e);
  lv_obj_set_style_border_color(btn, lv_color_hex(COL_PRIMARY), 0);
  lv_anim_t a;
  lv_anim_init(&a);
  lv_anim_set_var(&a, btn);
  lv_anim_set_values(&a, 0xFF, 0x00);  // marker — usado p/ trigger reset
  lv_anim_set_time(&a, MOTION_FAST + MOTION_MED);
  lv_anim_set_exec_cb(&a, [](void *obj, int32_t v) {
    if (v < 0x40) {
      lv_obj_set_style_border_color((lv_obj_t*)obj, lv_color_hex(COL_BORDER), 0);
    }
  });
  lv_anim_start(&a);
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
    const lv_image_dsc_t *iconImg = resolveIcon(items[i].iconHint, isScene, i);
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
    items[i].type  = src[i].type;
    items[i].state = src[i].state;
  }
  // Limpa slots nao usados (evita render de lixo se shrink)
  for (int i = count; i < SCENES_MAX; i++) {
    items[i].id[0] = items[i].name[0] = items[i].iconHint[0] = '\0';
    items[i].type = 0; items[i].state = false;
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
  if (items[idx].type != 1) return;  // so' devices
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
  makeLabel(tab, "CENAS", COL_TEXT, FONT_TITLE, LV_ALIGN_TOP_LEFT, sw(38), sh(4));
  makeLabel(tab, "Atalhos Tuya", COL_DIM, FONT_CAPTION, LV_ALIGN_TOP_RIGHT, -sw(6), sh(8));

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

static lv_obj_t *histChart = nullptr;
static lv_chart_series_t *histSer = nullptr;
static int histMetric = 0;  // 0=temp, 1=rh, 2=ph, 3=ec

static const struct {
  const char *name;
  uint32_t color;
  int ymin, ymax;
  // Multiplicador p/ converter float -> int do chart (LVGL chart usa int).
  // pH/EC vao em decimo (6.2 -> 62), tempC/rh inteiro.
  float scale;
  // Origem do array (escolhido por idx em applyHistData).
} HIST_METRICS[4] = {
  // Cores DS: cada metrica tem cor distinta na sparkline pra leitura rapida
  // ("essa onda laranja e' temperatura"). Valor branco fica no header — cor
  // aqui e' decorativa, nao compete com primary/branding.
  {"TEMP", COL_PHASE_HARVEST, 15, 35,  1.0f},   // laranja (igual app mobile)
  {"UMID", COL_CYN,            0, 100, 1.0f},   // ciano
  {"pH",   COL_PRP,           40, 90,  10.0f},  // roxo claro (5.5-7.5 -> 55-75)
  {"EC",   COL_AMBER,          0, 40,  10.0f},  // amber (0-4.0 mS/cm)
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
  // Linha do chart pega cor da metrica (decorativo); outline pulse nao muda
  // (fica COL_PRIMARY fixo via applyRingPulse no buildHistorico).
  lv_obj_set_style_line_color(histChart, lv_color_hex(m.color), LV_PART_ITEMS);
  lv_obj_set_style_bg_color(histChart, lv_color_hex(m.color), LV_PART_INDICATOR);

  const float *arr = histArrayFor(histMetric);
  // histCount = pontos validos. Resto dos 24 fica como LV_CHART_POINT_NONE
  // pra LVGL pular. Empurramos os validos pelos ULTIMOS slots (mais recentes
  // a direita do chart) — slot 23 = mais novo, slot 0 = mais antigo OU vazio.
  int valid = histCount > HIST_POINTS ? HIST_POINTS : histCount;
  int pad   = HIST_POINTS - valid;  // slots vazios a esquerda
  for (int i = 0; i < HIST_POINTS; i++) {
    if (i < pad) {
      lv_chart_set_value_by_id(histChart, histSer, i, LV_CHART_POINT_NONE);
    } else {
      lv_chart_set_value_by_id(histChart, histSer, i,
        (int32_t)(arr[i - pad] * m.scale));
    }
  }
  lv_chart_refresh(histChart);
}

extern "C" void cultivoUI_applyHistory(void) {
  applyHistData();
}

static lv_obj_t *histMetricBtns[4] = {nullptr};

// Aplica visual de pill DS aos botoes — ativo: bg primary + texto branco;
// inativo: bg transparent + border neutra + texto dim. Estilo iOS segmented.
static void histStylePills(int activeIdx) {
  for (int i = 0; i < 4; i++) {
    bool sel = (i == activeIdx);
    lv_obj_set_style_bg_color(histMetricBtns[i],
      lv_color_hex(sel ? COL_PRIMARY : COL_CARD), 0);
    lv_obj_set_style_bg_opa(histMetricBtns[i],
      sel ? LV_OPA_COVER : LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_color(histMetricBtns[i],
      lv_color_hex(sel ? COL_PRIMARY : COL_BORDER), 0);
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

  // Chart DS — bg = COL_CARD elevado, border neutra finissima, line_width 3
  int btnH     = sh(32);
  int btnAreaH = btnH + sh(10);  // botao + gap
  histChart = lv_chart_create(tab);
  lv_obj_set_size(histChart, SCREEN_W - sw(16), TAB_H - sh(34) - btnAreaH);
  lv_obj_align(histChart, LV_ALIGN_TOP_MID, 0, sh(28));
  lv_chart_set_type(histChart, LV_CHART_TYPE_LINE);
  lv_chart_set_point_count(histChart, 24);
  lv_chart_set_div_line_count(histChart, 3, 5);
  lv_obj_set_style_bg_color(histChart, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_border_color(histChart, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_border_width(histChart, 1, 0);
  lv_obj_set_style_radius(histChart, RADIUS_LG, 0);
  lv_obj_set_style_line_color(histChart, lv_color_hex(COL_BORDER), LV_PART_MAIN);
  lv_obj_set_style_line_width(histChart, sw(3), LV_PART_ITEMS);
  lv_obj_set_style_width(histChart,  0, LV_PART_INDICATOR);
  lv_obj_set_style_height(histChart, 0, LV_PART_INDICATOR);
  lv_obj_set_style_pad_all(histChart, sw(6), 0);
  histSer = lv_chart_add_series(histChart, lv_color_hex(COL_PRIMARY), LV_CHART_AXIS_PRIMARY_Y);

  // Pulse "live" no outline do chart — feel de monitor ativo. Usa motion
  // breath token (2500ms) pra alinhar com --motion-breath do CSS, e cor
  // PRIMARY (nao muda por metrica) — assim a "respiracao" e' brand-coerente.
  applyRingPulse(histChart, COL_PRIMARY, MOTION_BREATH, 0);

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
  // 3 tabs: Home / Hist / Cenas
  lv_obj_t *screens[NAV_COUNT] = {
    screenHome, screenGrafic, screenTarefa
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
  // screenLux/PhEc nao construidas — registro vai pelo app mobile.

  buildHome(screenHome);
  buildTarefas(screenTarefa);
  buildHistorico(screenGrafic);
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
