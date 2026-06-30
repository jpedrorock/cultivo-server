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
#include <math.h>     // pra isnan() unqualified (cmath so' tem std::isnan)
#include <cstdlib>
#include <ctime>      // pra localtime_r no ambient idle overlay

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
// Valores iniciais: no FIRMWARE sao sentinels (NaN/vazio) pra mostrar "--"
// antes do primeiro fetch — usuario nao confunde demo data com dados reais.
// fetchDisplayData() preenche valores reais no primeiro sucesso e mantem
// (mesmo se WiFi cair, ultimos valores ficam > demo data confusa).
// No SIMULADOR usamos defaults realistas pra UI ficar "viva" sem servidor.
#ifdef CULTIVO_SIM
char  TENT_NAME[50] = "ESTUFA SIM";
char  FASE[20]      = "FLORACAO";
float tempC = 24.5f, rh = 62.0f, vpd = 1.1f, phv = 6.2f, ecv = 1.8f;
int   semana = 4, totalSem = 16;
#else
char  TENT_NAME[50] = "";
char  FASE[20]      = "";
float tempC = NAN, rh = NAN, vpd = NAN, phv = NAN, ecv = NAN;
int   semana = 0, totalSem = 0;
#endif
bool  wifiOk = false;        // firmware: setado pelo connectWifi(); sim: forcado p/ true em sim_main.cpp
int   sensorAgeSec   = -1;   // -1 = sem dado; updated em fetchDisplayData
int   dailyLogAgeSec = -1;   // idem
int   lightOnHour    = 6;    // default 18/6 (VEGA) ate' fetchDisplay preencher
int   lightOffHour   = 24;
int   currentLux = 0;
int   currentPpfd = 0;
int   targetPpfd  = 0;
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
static CultivoHistPeriodFn   onHistPeriod  = nullptr;
static CultivoDeviceLevelFn  onDeviceLevel = nullptr;

extern "C" void cultivoUI_setLuxSaveHandler(CultivoSaveLuxFn cb)         { onLuxSave    = cb; }
extern "C" void cultivoUI_setPhEcSaveHandler(CultivoSavePhEcFn cb)       { onPhEcSave   = cb; }
extern "C" void cultivoUI_setConfigOpenHandler(CultivoOpenConfigFn cb)   { onConfigOpen = cb; }
extern "C" void cultivoUI_setRefreshHandler(CultivoRefreshFn cb)         { onRefresh    = cb; }
extern "C" void cultivoUI_setSceneTriggerHandler(CultivoSceneTriggerFn cb) { onSceneTrigger = cb; }
extern "C" void cultivoUI_setWifiReconnectHandler(CultivoWifiReconnectFn cb) { onWifiReconnect = cb; }
extern "C" void cultivoUI_setHistPeriodHandler(CultivoHistPeriodFn cb)   { onHistPeriod = cb; }
extern "C" void cultivoUI_setDeviceLevelHandler(CultivoDeviceLevelFn cb) { onDeviceLevel = cb; }

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
// Barra de progresso da fase atual no card ciclo (semana/totalSem).
// Cor da barra = phaseColor(FASE). Atualizada em refreshHomeValues.
static lv_obj_t *cycleProgress = nullptr;
// Accent de fase — linha fininha (3px) logo abaixo do header, na cor da fase
// atual (espelha a borda-esquerda do TentCard do app). Cor setada em
// refreshHomeValues; oculta enquanto FASE vazia (sem fetch).
static lv_obj_t *phaseAccent = nullptr;
// LivePill — pilula "ao vivo" com dot verde pulsante no header (assinatura do
// app, sinaliza dado fresco). Visivel so' quando wifiOk; togglada em
// refreshHomeValues junto com o icone wifi.
static lv_obj_t *livePill = nullptr;
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
  // Flat (feedback Joao: "mais flat"): cards uniformes COL_CARD. A identidade
  // de cor vem do icone/sparkline/badge, nao de um gradiente no card.
  (void)color; (void)factor;
  lv_obj_set_style_bg_color(c, lv_color_hex(COL_CARD), 0);
}

static lv_obj_t* makeCard(lv_obj_t *parent, int x, int y, int w, int h) {
  lv_obj_t *c = lv_obj_create(parent);
  lv_obj_set_size(c, w, h);
  lv_obj_set_pos(c, x, y);
  // Flat (feedback Joao: "mais flat"): bg solido COL_CARD, SEM gradiente e SEM
  // sombra pesada. Separacao do fundo vem da border finissima COL_BORDER.
  lv_obj_set_style_bg_color(c, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_bg_opa(c, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(c, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_border_width(c, 1, 0);
  lv_obj_set_style_radius(c, 10, 0);
  lv_obj_set_style_pad_all(c, 6, 0);
  lv_obj_set_style_shadow_width(c, 0, 0);
  lv_obj_clear_flag(c, LV_OBJ_FLAG_SCROLLABLE);
  return c;
}

// Encolhe um icone rasterizado (32px) via transform com pivot no centro (fica
// centralizado na propria box). zoom 256=100%; ~140=55% (~18px). Feedback Joao:
// icones grandes demais no device vs o mock (que usava icones finos).
static inline void shrinkIcon(lv_obj_t *img, int32_t zoom) {
  lv_obj_set_style_transform_pivot_x(img, 16, 0);
  lv_obj_set_style_transform_pivot_y(img, 16, 0);
  lv_obj_set_style_transform_zoom(img, zoom, 0);
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

// Badges de freshness dos sensores (apontam pro mini-icone topo-right de
// cada card UMID/VPD). Atualizados em refreshHomeValues conforme idade
// dos sensores (sensorAgeSec do server).
static lv_obj_t *badgeRh  = nullptr;
static lv_obj_t *badgeVpd = nullptr;

// Cor do badge de freshness:
//   verde    < 2min  (sensor live)
//   amarelo  < 15min (sensor lento — Tuya rate-limit / rede ruim)
//   vermelho >=15min OU -1 (sensor offline / sem dado)
static uint32_t freshnessColor(int ageSec) {
  if (ageSec < 0)   return COL_RED;
  if (ageSec < 120) return COL_PRIMARY;  // verde live
  if (ageSec < 900) return COL_YEL;
  return COL_RED;
}

// ════════════════════════════════════════════════════════════════════════════════
// AMBIENT IDLE OVERLAY — screensaver minimalista
// Mostrado quando display fica idle (firmware chama show/hide via API publica).
// Layout:
//          HH:MM
//   24.5°C  62%  0.85kPa
//
// IMPORTANTE: NAO usar lv_label_set_text_fmt com %f — o lv_snprintf
// interno do LVGL nao suporta floating-point format (default config).
// Usar snprintf padrao do C numa string buffer + lv_label_set_text.
// ════════════════════════════════════════════════════════════════════════════════
static lv_obj_t *idleOverlay   = nullptr;
static lv_obj_t *idleClockLbl  = nullptr;
static lv_obj_t *idleDateLbl   = nullptr;   // "sex . 27 jun"
static lv_obj_t *idlePhaseLbl  = nullptr;   // pilula "<Fase> . Sem X/Y"
static lv_obj_t *idleStatusLbl = nullptr;   // veredito natural (tudo certo / atencao)
static lv_obj_t *idleTempLbl   = nullptr;
static lv_obj_t *idleRhLbl     = nullptr;
static lv_obj_t *idleVpdLbl    = nullptr;
static lv_obj_t *idleTempDot   = nullptr;   // dot de status por metrica (verde/ambar)
static lv_obj_t *idleRhDot     = nullptr;
static lv_obj_t *idleVpdDot    = nullptr;
static lv_obj_t *idleAlertIco  = nullptr;   // luz de alerta (icone pulsante, estilo painel)

extern "C" void cultivoUI_showIdleOverlay(void) {
  if (idleOverlay) {
    // Ja existe — so REEXIBE (nao recria). Persistir o overlay e' o fix
    // definitivo do travamento: zero delete/realocacao de ~20 objs no
    // sleep/wake. Traz pra frente + atualiza os valores.
    lv_obj_clear_flag(idleOverlay, LV_OBJ_FLAG_HIDDEN);
    lv_obj_move_foreground(idleOverlay);
    cultivoUI_tickIdleOverlay();
    return;
  }
  idleOverlay = lv_obj_create(lv_layer_top());
  lv_obj_remove_style_all(idleOverlay);
  lv_obj_set_size(idleOverlay, SCREEN_W, SCREEN_H);
  lv_obj_set_pos(idleOverlay, 0, 0);
  lv_obj_set_style_bg_color(idleOverlay, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(idleOverlay, LV_OPA_COVER, 0);
  lv_obj_clear_flag(idleOverlay, LV_OBJ_FLAG_SCROLLABLE);

  // ── Topo-esq: dot "ao vivo" (estatico) + nome da estufa ────────────────
  lv_obj_t *liveDot = lv_obj_create(idleOverlay);
  lv_obj_remove_style_all(liveDot);
  lv_obj_set_size(liveDot, sw(8), sw(8));
  lv_obj_align(liveDot, LV_ALIGN_TOP_LEFT, sw(16), sh(15));
  lv_obj_set_style_radius(liveDot, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_color(liveDot, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_bg_opa(liveDot, LV_OPA_COVER, 0);
  // Sem shadow/breathe — screensaver flat e a prova de travamento: a criacao
  // pesada (sombras + anims) congelava showIdleOverlay em devices c/ pouco heap.

  lv_obj_t *tentLbl = lv_label_create(idleOverlay);
  lv_label_set_text(tentLbl, TENT_NAME[0] ? TENT_NAME : "Estufa");
  lv_obj_set_style_text_color(tentLbl, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_text_font(tentLbl, FONT_BODY, 0);
  lv_obj_align(tentLbl, LV_ALIGN_TOP_LEFT, sw(30), sh(11));

  // ── Topo-dir: pilula da fase ("<Fase> . Sem X/Y") — texto/cor no tick ──
  idlePhaseLbl = lv_label_create(idleOverlay);
  lv_label_set_text(idlePhaseLbl, "");
  lv_obj_set_style_text_font(idlePhaseLbl, FONT_CAPTION, 0);
  lv_obj_set_style_bg_opa(idlePhaseLbl, LV_OPA_20, 0);
  lv_obj_set_style_radius(idlePhaseLbl, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_pad_left(idlePhaseLbl, sw(8), 0);
  lv_obj_set_style_pad_right(idlePhaseLbl, sw(8), 0);
  lv_obj_set_style_pad_top(idlePhaseLbl, sh(3), 0);
  lv_obj_set_style_pad_bottom(idlePhaseLbl, sh(3), 0);
  lv_obj_align(idlePhaseLbl, LV_ALIGN_TOP_RIGHT, -sw(14), sh(11));

  // Luz de alerta (estilo painel de carro): icone pulsante quando ha alerta
  // ativo. Sem texto. Cor/visibilidade definidas no tick. Comeca oculto.
  idleAlertIco = lv_image_create(idleOverlay);
  lv_image_set_src(idleAlertIco, &ic_alert);
  lv_obj_set_style_image_recolor(idleAlertIco, lv_color_hex(COL_RED), 0);
  lv_obj_set_style_image_recolor_opa(idleAlertIco, LV_OPA_COVER, 0);
  lv_obj_set_style_transform_zoom(idleAlertIco, 192, 0);   // ~75% (32->24px)
  lv_obj_align(idleAlertIco, LV_ALIGN_TOP_MID, 0, sh(9));
  lv_obj_add_flag(idleAlertIco, LV_OBJ_FLAG_HIDDEN);

  // ── Centro: relogio com glow na cor da fase + data ─────────────────────
  idleClockLbl = lv_label_create(idleOverlay);
  lv_label_set_text(idleClockLbl, "--:--");
  lv_obj_set_style_text_color(idleClockLbl, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_text_font(idleClockLbl, FONT_VALUE, 0);
  // Sem glow/shadow: a sombra de 30px no relogio grande era a alocacao + render
  // mais pesados da tela e travavam showIdleOverlay em devices com pouco heap.
  lv_obj_align(idleClockLbl, LV_ALIGN_CENTER, 0, -sh(34));

  idleDateLbl = lv_label_create(idleOverlay);
  lv_label_set_text(idleDateLbl, "");
  lv_obj_set_style_text_color(idleDateLbl, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(idleDateLbl, FONT_CAPTION, 0);
  lv_obj_align(idleDateLbl, LV_ALIGN_CENTER, 0, sh(2));

  // Veredito em linguagem natural (pilula) — texto/cor no tick
  idleStatusLbl = lv_label_create(idleOverlay);
  lv_label_set_text(idleStatusLbl, "");
  lv_obj_set_style_text_font(idleStatusLbl, FONT_CAPTION, 0);
  lv_obj_set_style_bg_opa(idleStatusLbl, LV_OPA_20, 0);
  lv_obj_set_style_radius(idleStatusLbl, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_pad_left(idleStatusLbl, sw(10), 0);
  lv_obj_set_style_pad_right(idleStatusLbl, sw(10), 0);
  lv_obj_set_style_pad_top(idleStatusLbl, sh(3), 0);
  lv_obj_set_style_pad_bottom(idleStatusLbl, sh(3), 0);
  lv_obj_align(idleStatusLbl, LV_ALIGN_CENTER, 0, sh(28));

  // ── Rodape: 3 cards flat (TEMP/UMID/VPD) com dot de status ─────────────
  int icMargin = sw(16);
  int icGap    = sw(8);
  int icCardW  = (SCREEN_W - icMargin * 2 - icGap * 2) / 3;
  int icCardH  = sh(60);
  int icCardY  = SCREEN_H - icCardH - sh(12);
  auto makeIdleCard = [&](int x, const lv_image_dsc_t *icon, const char *label,
                          uint32_t color, lv_obj_t **valOut, lv_obj_t **dotOut) {
    lv_obj_t *c = lv_obj_create(idleOverlay);
    lv_obj_remove_style_all(c);
    lv_obj_set_size(c, icCardW, icCardH);
    lv_obj_set_pos(c, x, icCardY);
    lv_obj_set_style_bg_color(c, lv_color_hex(COL_CARD), 0);
    lv_obj_set_style_bg_opa(c, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(c, lv_color_hex(COL_BORDER), 0);
    lv_obj_set_style_border_width(c, 1, 0);
    lv_obj_set_style_radius(c, 10, 0);
    lv_obj_clear_flag(c, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *ico = lv_image_create(c);
    lv_image_set_src(ico, icon);
    lv_obj_set_style_image_recolor(ico, lv_color_hex(color), 0);
    lv_obj_set_style_image_recolor_opa(ico, LV_OPA_COVER, 0);
    lv_obj_set_style_transform_zoom(ico, 160, 0);   // ~62% (32->20px)
    lv_obj_align(ico, LV_ALIGN_TOP_LEFT, sw(8), sh(7));

    lv_obj_t *lbl = lv_label_create(c);
    lv_label_set_text(lbl, label);
    lv_obj_set_style_text_color(lbl, lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_text_font(lbl, FONT_CAPTION, 0);
    lv_obj_align(lbl, LV_ALIGN_TOP_LEFT, sw(26), sh(9));

    lv_obj_t *v = lv_label_create(c);
    lv_label_set_text(v, "--");
    lv_obj_set_style_text_color(v, lv_color_hex(COL_TEXT), 0);
    lv_obj_set_style_text_font(v, FONT_TITLE, 0);
    lv_obj_align(v, LV_ALIGN_BOTTOM_LEFT, sw(8), -sh(6));
    *valOut = v;

    lv_obj_t *dot = lv_obj_create(c);
    lv_obj_remove_style_all(dot);
    lv_obj_set_size(dot, sw(7), sw(7));
    lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(dot, lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_bg_opa(dot, LV_OPA_COVER, 0);
    lv_obj_align(dot, LV_ALIGN_TOP_RIGHT, -sw(8), sh(9));
    *dotOut = dot;
  };
  makeIdleCard(icMargin,                         &ic_thermometer, "TEMP",    COL_PHASE_HARVEST, &idleTempLbl, &idleTempDot);
  makeIdleCard(icMargin + icCardW + icGap,       &ic_droplet,     "UMIDADE", COL_CYN,           &idleRhLbl,   &idleRhDot);
  makeIdleCard(icMargin + (icCardW + icGap) * 2, &ic_activity,    "VPD",     COL_PRIMARY,       &idleVpdLbl,  &idleVpdDot);

  cultivoUI_tickIdleOverlay();  // preenche clock/data/fase/status/valores
}

extern "C" void cultivoUI_hideIdleOverlay(void) {
  if (!idleOverlay) return;
  // So ESCONDE — nunca deleta. Esta funcao roda de dentro do screenWake() <-
  // touchpad_read (indev cb); deletar a arvore grande ali corrompia o indev /
  // estourava a stack de 16KB do ESP -> travava no screensaver em ALGUNS
  // devices (undefined behavior, depende do estado de heap). Com hide/show o
  // overlay e' criado 1x e so alterna LV_OBJ_FLAG_HIDDEN: zero delete, zero
  // realocacao, zero risco. Os ponteiros seguem validos pro tick.
  lv_obj_add_flag(idleOverlay, LV_OBJ_FLAG_HIDDEN);
}

// ════════════════════════════════════════════════════════════════════════════════
// ALERT OVERLAY — modal que cobre tela quando server pushou alerta via SSE
// ════════════════════════════════════════════════════════════════════════════════
// Alert "light" (estilo luz de painel de carro): SSE alert acende um icone
// pulsante na tela de descanso por ALERT_LIGHT_TTL_SEC; SEM banner e SEM
// buzzer (pedido Joao — o banner ficava incomodando). O detalhe fica no app.
static CultivoAlertAckFn onAlertAck = nullptr;  // mantido (registrado pelo main)
static bool     g_alertActive = false;
static uint32_t g_alertColor  = COL_RED;
static time_t   g_alertSec    = 0;
#define ALERT_LIGHT_TTL_SEC 900   // 15 min sem alerta novo -> apaga a luz

extern "C" void cultivoUI_setAlertAckHandler(CultivoAlertAckFn cb) {
  onAlertAck = cb;
}

// Alerta do SSE: NAO mostra mais banner (incomodava "toda hora"). So' acende a
// "luz" de alerta da tela de descanso (icone pulsante, sem texto) — o detalhe
// do alerta o usuario ve no app. Severidade vira cor (vermelho/ambar).
extern "C" void cultivoUI_showAlert(int alertId, const char *type, const char *metric, const char *message) {
  (void)alertId; (void)metric; (void)message;
  g_alertActive = true;
  g_alertSec    = time(nullptr);
  g_alertColor  = (type && !strcmp(type, "SAFETY_LIMIT")) ? COL_RED : COL_AMBER;
  // Se a tela de descanso ja' estiver visivel, reflete na hora (senao o tick pega).
  if (idleAlertIco) {
    lv_obj_set_style_image_recolor(idleAlertIco, lv_color_hex(g_alertColor), 0);
    lv_obj_set_style_shadow_color(idleAlertIco, lv_color_hex(g_alertColor), 0);
    lv_obj_clear_flag(idleAlertIco, LV_OBJ_FLAG_HIDDEN);
  }
}

// ── Overlay de OTA (feedback do "Verificar atualizacao") ──────────────────────
// Banner central com texto atualizavel. Mostra progresso do update, que antes
// so' ia pro Serial (user via "nada acontece" na tela).
static lv_obj_t *otaOverlay = nullptr;
static lv_obj_t *otaLabel   = nullptr;

extern "C" void cultivoUI_showOtaStatus(const char *msg, int autoHideMs) {
  if (!otaOverlay) {
    otaOverlay = lv_obj_create(lv_layer_top());
    lv_obj_remove_style_all(otaOverlay);
    lv_obj_set_size(otaOverlay, SCREEN_W - sw(40), sh(80));
    lv_obj_align(otaOverlay, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_bg_color(otaOverlay, lv_color_hex(COL_CARD), 0);
    lv_obj_set_style_bg_opa(otaOverlay, LV_OPA_COVER, 0);
    lv_obj_set_style_radius(otaOverlay, RADIUS_LG, 0);
    lv_obj_set_style_border_color(otaOverlay, lv_color_hex(COL_PRIMARY), 0);
    lv_obj_set_style_border_width(otaOverlay, sw(2), 0);
    lv_obj_set_style_shadow_width(otaOverlay, 24, 0);
    lv_obj_set_style_shadow_color(otaOverlay, lv_color_hex(0x000000), 0);
    lv_obj_set_style_shadow_opa(otaOverlay, LV_OPA_50, 0);
    lv_obj_set_style_pad_all(otaOverlay, sw(12), 0);
    lv_obj_clear_flag(otaOverlay, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *hdr = lv_label_create(otaOverlay);
    lv_label_set_text(hdr, "ATUALIZACAO");
    lv_obj_set_style_text_color(hdr, lv_color_hex(COL_PRIMARY), 0);
    lv_obj_set_style_text_font(hdr, FONT_CAPTION, 0);
    lv_obj_align(hdr, LV_ALIGN_TOP_MID, 0, 0);

    otaLabel = lv_label_create(otaOverlay);
    lv_label_set_long_mode(otaLabel, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(otaLabel, SCREEN_W - sw(64));
    lv_obj_set_style_text_color(otaLabel, lv_color_hex(COL_TEXT), 0);
    lv_obj_set_style_text_font(otaLabel, FONT_BODY, 0);
    lv_obj_set_style_text_align(otaLabel, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(otaLabel, LV_ALIGN_CENTER, 0, sh(8));
  }
  if (otaLabel) lv_label_set_text(otaLabel, msg ? msg : "");

  // autoHideMs > 0 → some sozinho (sucesso/erro/já atualizado).
  // Cancela timer anterior pra não fechar no meio.
  static lv_timer_t *otaHideTimer = nullptr;
  if (otaHideTimer) { lv_timer_del(otaHideTimer); otaHideTimer = nullptr; }
  if (autoHideMs > 0) {
    otaHideTimer = lv_timer_create([](lv_timer_t *t) {
      lv_timer_del(t);
      if (otaOverlay) { lv_obj_del(otaOverlay); otaOverlay = nullptr; otaLabel = nullptr; }
    }, autoHideMs, NULL);
    lv_timer_set_repeat_count(otaHideTimer, 1);
  }
}

extern "C" void cultivoUI_tickIdleOverlay(void) {
  if (!idleOverlay || !idleClockLbl) return;
  // Hora/data via configTime (TZ BRT-3). localtime_r thread-safe.
  // CRITICO: snprintf padrao + lv_label_set_text — lv_label_set_text_fmt usa
  // lv_snprintf INTERNO que NAO suporta %f no default config (bug em prod).
  time_t now = time(nullptr);
  struct tm tmInfo;
  char buf[48];
  if (now > 1700000000 && localtime_r(&now, &tmInfo)) {  // sanity: pos-2023
    snprintf(buf, sizeof(buf), "%02d:%02d", tmInfo.tm_hour, tmInfo.tm_min);
    lv_label_set_text(idleClockLbl, buf);
    if (idleDateLbl) {
      static const char *wd[7] = {"dom","seg","ter","qua","qui","sex","sab"};
      static const char *mo[12] = {"jan","fev","mar","abr","mai","jun",
                                   "jul","ago","set","out","nov","dez"};
      snprintf(buf, sizeof(buf), "%s \xC2\xB7 %d %s",
               wd[tmInfo.tm_wday % 7], tmInfo.tm_mday, mo[tmInfo.tm_mon % 12]);
      lv_label_set_text(idleDateLbl, buf);
    }
  } else {
    lv_label_set_text(idleClockLbl, "--:--");  // NTP ainda nao sincronizou
    if (idleDateLbl) lv_label_set_text(idleDateLbl, "sincronizando...");
  }

  // Glow do relogio + pilula da fase seguem a cor da fase atual.
  uint32_t pc = phaseColor(FASE);
  if (idlePhaseLbl) {
    if (FASE[0]) {
      if (semana > 0 && totalSem > 0)
        snprintf(buf, sizeof(buf), "%s \xC2\xB7 Sem %d/%d", FASE, semana, totalSem);
      else
        snprintf(buf, sizeof(buf), "%s", FASE);
      lv_label_set_text(idlePhaseLbl, buf);
      lv_obj_set_style_text_color(idlePhaseLbl, lv_color_hex(pc), 0);
      lv_obj_set_style_bg_color(idlePhaseLbl, lv_color_hex(pc), 0);
      lv_obj_clear_flag(idlePhaseLbl, LV_OBJ_FLAG_HIDDEN);
      lv_obj_align(idlePhaseLbl, LV_ALIGN_TOP_RIGHT, -sw(14), sh(11));
    } else {
      lv_obj_add_flag(idlePhaseLbl, LV_OBJ_FLAG_HIDDEN);
    }
  }

  // Metricas + dot de status por metrica (verde=ideal, ambar=fora). Faixas
  // generosas (so' um glance — o alerta real vem do server).
  int okCount = 0, totalM = 0;
  auto upd = [&](lv_obj_t *lbl, lv_obj_t *dot, float val, const char *fmt, bool ok) {
    if (!lbl) return;
    if (isnan(val)) {
      lv_label_set_text(lbl, "--");
      if (dot) lv_obj_set_style_bg_color(dot, lv_color_hex(COL_DIM), 0);
      return;
    }
    char b[16];
    snprintf(b, sizeof(b), fmt, val);
    lv_label_set_text(lbl, b);
    if (dot) lv_obj_set_style_bg_color(dot, lv_color_hex(ok ? COL_PRIMARY : COL_AMBER), 0);
    totalM++; if (ok) okCount++;
  };
  upd(idleTempLbl, idleTempDot, tempC, "%.1f\xC2\xB0", !isnan(tempC) && tempC >= 18.0f && tempC <= 30.0f);
  upd(idleRhLbl,   idleRhDot,   rh,    "%.0f%%",       !isnan(rh)    && rh    >= 40.0f && rh    <= 75.0f);
  upd(idleVpdLbl,  idleVpdDot,  vpd,   "%.2f",         !isnan(vpd)   && vpd   >= 0.8f  && vpd   <= 1.5f);

  // Veredito em linguagem natural (inspirado no Modo Simples do app).
  if (idleStatusLbl) {
    uint32_t sc; const char *st;
    if (totalM == 0)            { sc = COL_DIM;     st = "conectando..."; }
    else if (okCount == totalM) { sc = COL_PRIMARY; st = "tudo certo"; }
    else                        { sc = COL_AMBER;   st = "precisa de atencao"; }
    lv_label_set_text(idleStatusLbl, st);
    lv_obj_set_style_text_color(idleStatusLbl, lv_color_hex(sc), 0);
    lv_obj_set_style_bg_color(idleStatusLbl, lv_color_hex(sc), 0);
    lv_obj_align(idleStatusLbl, LV_ALIGN_CENTER, 0, sh(28));
  }

  // Luz de alerta (painel): pulsa se ha alerta recente (SSE); expira por TTL
  // pra nao ficar acesa pra sempre. Cor por severidade. Sem texto.
  if (idleAlertIco) {
    bool show = g_alertActive && (time(nullptr) - g_alertSec < ALERT_LIGHT_TTL_SEC);
    if (g_alertActive && !show) g_alertActive = false;  // expirou
    if (show) {
      lv_obj_set_style_image_recolor(idleAlertIco, lv_color_hex(g_alertColor), 0);
      lv_obj_set_style_shadow_color(idleAlertIco, lv_color_hex(g_alertColor), 0);
      lv_obj_clear_flag(idleAlertIco, LV_OBJ_FLAG_HIDDEN);
    } else {
      lv_obj_add_flag(idleAlertIco, LV_OBJ_FLAG_HIDDEN);
    }
  }
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
  // Titulo em FONT_BODY (era FONT_TITLE 24px — grande demais p/ o header,
  // feedback Joao "elementos grandes"; mais perto do mock aprovado).
  lblTitle = makeLabel(tab, TENT_NAME, COL_TEXT, FONT_BODY, LV_ALIGN_TOP_LEFT, sw(8), sh(12));
  lblSub = nullptr;  // legacy — semana/fase agora no card CICLO

  lv_obj_t *wifiIcon = lv_image_create(tab);
  lv_image_set_src(wifiIcon, wifiOk ? &ic_wifi : &ic_wifi_off);
  lv_obj_set_style_image_recolor(wifiIcon, lv_color_hex(wifiOk ? COL_PRIMARY : COL_DIM), 0);
  lv_obj_set_style_image_recolor_opa(wifiIcon, LV_OPA_COVER, 0);
  shrinkIcon(wifiIcon, 140);
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
  shrinkIcon(btnCfg, 140);
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
  shrinkIcon(refreshIcon, 140);
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

  // ── LivePill (DS): dot verde pulsante + "ao vivo" — espelha a pilula
  // "( ● )" do app, sinaliza dado fresco. Fica a esquerda do cluster de
  // icones. Visibilidade gated por wifiOk (refreshHomeValues): mostrar
  // "ao vivo" pulsando offline seria mentira.
  livePill = lv_obj_create(tab);
  lv_obj_remove_style_all(livePill);
  lv_obj_set_size(livePill, sw(78), sh(20));
  lv_obj_align(livePill, LV_ALIGN_TOP_RIGHT, -sw(124), sh(9));
  lv_obj_clear_flag(livePill, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_bg_color(livePill, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_bg_opa(livePill, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(livePill, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_border_width(livePill, 1, 0);
  lv_obj_set_style_border_color(livePill, lv_color_hex(COL_BORDER), 0);
  {
    lv_obj_t *liveDot = lv_obj_create(livePill);
    lv_obj_remove_style_all(liveDot);
    lv_obj_set_size(liveDot, sw(8), sw(8));
    lv_obj_align(liveDot, LV_ALIGN_LEFT_MID, sw(8), 0);
    lv_obj_set_style_radius(liveDot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(liveDot, lv_color_hex(COL_PRIMARY), 0);
    lv_obj_set_style_bg_opa(liveDot, LV_OPA_COVER, 0);
    lv_obj_set_style_shadow_color(liveDot, lv_color_hex(COL_PRIMARY), 0);
    lv_obj_set_style_shadow_width(liveDot, sw(6), 0);
    // Pulse infinito no halo (shadow_opa 0->70) — regiao minuscula, custo de
    // redraw desprezivel (mesmo helper do bloom/ring-pulse de alertas).
    startBreathe(liveDot, LV_OPA_0, LV_OPA_70, 1600);

    lv_obj_t *liveLbl = lv_label_create(livePill);
    lv_label_set_text(liveLbl, "ao vivo");
    lv_obj_set_style_text_color(liveLbl, lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_text_font(liveLbl, FONT_CAPTION, 0);
    lv_obj_align(liveLbl, LV_ALIGN_LEFT_MID, sw(20), 0);
  }
  lv_obj_add_flag(livePill, LV_OBJ_FLAG_HIDDEN);  // refreshHomeValues mostra qdo wifiOk

  // ── Accent de fase (DS): linha 3px sob o header, cor = phaseColor(FASE).
  // Espelha a borda-esquerda colorida do TentCard. Cor + visibilidade reais
  // setadas em refreshHomeValues (oculta enquanto FASE vazia, sem fetch).
  phaseAccent = lv_obj_create(tab);
  lv_obj_remove_style_all(phaseAccent);
  lv_obj_set_size(phaseAccent, SCREEN_W - sw(16), sh(3));
  lv_obj_align(phaseAccent, LV_ALIGN_TOP_MID, 0, sh(43));
  lv_obj_set_style_radius(phaseAccent, sh(2), 0);
  lv_obj_set_style_bg_color(phaseAccent, lv_color_hex(phaseColor(FASE)), 0);
  lv_obj_set_style_bg_opa(phaseAccent, LV_OPA_COVER, 0);
  lv_obj_add_flag(phaseAccent, LV_OBJ_FLAG_HIDDEN);

  // Single-face redesign: sem botao flip. Tap no arc cicla TEMP/pH/EC/FLORACAO.
  // Mini-cards UMID/VPD/PPFD ficam sempre visiveis a direita.

  // Corpo: arc grande a esquerda + mini-cards a direita.
  // bodyY mais baixo (era sh42): da' respiro pro header+accent nao ficarem
  // "colados" e encolhe um tico o arc/cards (feedback Joao: elementos grandes).
  int bodyY = sh(52);
  int bodyH = TAB_H - bodyY - sh(4);
  int halfW = SCREEN_W / 2;

  int arcSize = (bodyH < halfW - sw(8)) ? bodyH : halfW - sw(8);
  arcSize = arcSize * 88 / 100;  // ~12% menor: mais respiro em volta (feedback Joao)
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
                          lv_obj_t **sparkOut, lv_chart_series_t **serOut,
                          lv_obj_t **badgeOut = nullptr) -> lv_obj_t* {
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
    shrinkIcon(ico, 140);
    lv_obj_align(ico, LV_ALIGN_TOP_LEFT, 0, sh(2));

    lv_obj_t *lb = lv_label_create(c);
    lv_label_set_text(lb, label);
    lv_obj_set_style_text_color(lb, lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_text_font(lb, FONT_CAPTION, 0);
    lv_obj_align(lb, LV_ALIGN_TOP_LEFT, iconW, sh(4));

    // Badge de freshness top-right — usa ic_wifi como dot indicator. Cor
    // muda conforme idade do sensor (verde live, amarelo lento, vermelho
    // offline). Atualizado em refreshHomeValues a cada fetch.
    lv_obj_t *wifi = lv_image_create(c);
    lv_image_set_src(wifi, &ic_wifi);
    lv_obj_set_style_image_recolor(wifi, lv_color_hex(wifiOk ? COL_PRIMARY : COL_DIM), 0);
    lv_obj_set_style_image_recolor_opa(wifi, LV_OPA_COVER, 0);
    lv_obj_set_style_transform_zoom(wifi, 128, 0);   // ~50% (16->8px)
    lv_obj_align(wifi, LV_ALIGN_TOP_RIGHT, 0, sh(2));
    if (badgeOut) *badgeOut = wifi;
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
  lblRh   = makeMiniCard(homeFaceA, 0,                     "UMIDADE", "--", COL_CYN,     &ic_droplet,   &sparkRh,   &serRhS,  &badgeRh);
  lblVpd  = makeMiniCard(homeFaceA, cardH + cardGap,       "VPD",     "--", COL_PRIMARY, &ic_activity,  &sparkVpd,  &serVpdS, &badgeVpd);

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

    // Barra de progresso da fase — finissima (3px) no rodape do card. Mostra
    // semana atual / totalSem visualmente em adicao ao texto "Sem X/Y".
    // Cor = phase. Bar bg = mesma cor com OPA_30 (track dim).
    cycleProgress = lv_bar_create(c);
    lv_obj_set_size(cycleProgress, cardW - sw(16), sh(3));
    lv_obj_align(cycleProgress, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_bar_set_range(cycleProgress, 0, 100);
    lv_bar_set_value(cycleProgress, 0, LV_ANIM_OFF);
    lv_obj_set_style_radius(cycleProgress, sh(2), 0);
    lv_obj_set_style_radius(cycleProgress, sh(2), LV_PART_INDICATOR);
    lv_obj_set_style_bg_color(cycleProgress, lv_color_hex(phaseColor(FASE)), 0);
    lv_obj_set_style_bg_opa(cycleProgress, LV_OPA_30, 0);
    lv_obj_set_style_bg_color(cycleProgress, lv_color_hex(phaseColor(FASE)), LV_PART_INDICATOR);
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
  // Inicializa sparklines com LV_CHART_POINT_NONE (skip render) ate' chegar
  // dado real do fetch. Sem isso, NaN cast pra int32_t da' garbage que
  // renderiza spike maluco no chart.
  for (int i = 0; i < 20; i++) {
    lv_chart_set_next_value(sparkRh,  serRhS,  LV_CHART_POINT_NONE);
    lv_chart_set_next_value(sparkVpd, serVpdS, LV_CHART_POINT_NONE);
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
  // Helper inline: mostra valor float ou "--" se NaN. Arc fica em 0 nesses
  // casos pra nao desenhar a barra com valor estranho.
  switch (arcMode) {
    case 0: { // TEMP
      lv_label_set_text(lblArcHdr, "TEMP");
      lv_label_set_text(lblArcUnit, "\xC2\xB0""C");
      if (isnan(tempC)) {
        lv_label_set_text(lblTemp, "--");
        lv_arc_set_range(arcTemp, 0, 40);
        lv_arc_set_value(arcTemp, 0);
        col = COL_DIM;
      } else {
        snprintf(buf, sizeof(buf), "%.1f", tempC);
        lv_label_set_text(lblTemp, buf);
        lv_arc_set_range(arcTemp, 0, 40);
        lv_arc_set_value(arcTemp, (int)tempC);
        col = tempColor(tempC);
      }
      break;
    }
    case 1: { // pH
      lv_label_set_text(lblArcHdr, "pH");
      lv_label_set_text(lblArcUnit, "");
      if (isnan(phv)) {
        lv_label_set_text(lblTemp, "--");
        lv_arc_set_range(arcTemp, 0, 140);
        lv_arc_set_value(arcTemp, 0);
        col = COL_DIM;
      } else {
        snprintf(buf, sizeof(buf), "%.1f", phv);
        lv_label_set_text(lblTemp, buf);
        lv_arc_set_range(arcTemp, 0, 140);
        lv_arc_set_value(arcTemp, (int)(phv * 10));
        col = COL_PRP;
      }
      break;
    }
    case 2: { // EC
      lv_label_set_text(lblArcHdr, "EC");
      lv_label_set_text(lblArcUnit, "mS/cm");
      if (isnan(ecv)) {
        lv_label_set_text(lblTemp, "--");
        lv_arc_set_range(arcTemp, 0, 40);
        lv_arc_set_value(arcTemp, 0);
        col = COL_DIM;
      } else {
        snprintf(buf, sizeof(buf), "%.1f", ecv);
        lv_label_set_text(lblTemp, buf);
        lv_arc_set_range(arcTemp, 0, 40);  // EC * 10 (0-4.0 mS/cm)
        lv_arc_set_value(arcTemp, (int)(ecv * 10));
        col = COL_AMBER;
      }
      break;
    }
    case 3: { // FASE
      // Sem fase ainda? Mostra placeholder e nao quebra a logica
      if (FASE[0] == '\0') {
        lv_label_set_text(lblArcHdr, "FASE");
        lv_label_set_text(lblArcUnit, "");
        lv_label_set_text(lblTemp, "--");
        lv_arc_set_range(arcTemp, 0, 16);
        lv_arc_set_value(arcTemp, 0);
        col = COL_DIM;
      } else {
        lv_label_set_text(lblArcHdr, FASE);
        if (semana > 0 && totalSem > 0) {
          snprintf(buf, sizeof(buf), "Sem %d/%d", semana, totalSem);
          lv_label_set_text(lblArcUnit, buf);
          char vbuf[8]; snprintf(vbuf, sizeof(vbuf), "%d", semana);
          lv_label_set_text(lblTemp, vbuf);
          lv_arc_set_range(arcTemp, 0, totalSem);
          lv_arc_set_value(arcTemp, semana);
        } else {
          // Fase sem ciclo numerico (MAINTENANCE/DRYING/CURING) — em vez de
          // em-dash "—" gigante que parecia tela quebrada, mostra um icone
          // descritivo + texto explicativo. User claramente reportou "fica
          // sem nada" — agora comunica "fase ativa sem ciclo numerico".
          lv_label_set_text(lblArcUnit, "sem semanas");
          // Checkmark unicode (U+2713) = fase ativa, esta tudo OK
          lv_label_set_text(lblTemp, "\xE2\x9C\x93");
          lv_arc_set_range(arcTemp, 0, 100);
          lv_arc_set_value(arcTemp, 100);  // anel cheio = fase em andamento
        }
        col = phaseColor(FASE);
      }
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

  // Header: nome da estufa OU "—" se ainda nao recebeu fetch (TENT_NAME vazio).
  // Sem demo data — usuario ve claramente que nao ta conectado.
  if (lblTitle) {
    lv_label_set_text(lblTitle, TENT_NAME[0] ? TENT_NAME : "\xE2\x80\x94");  // em-dash
  }

  // Atualiza icone wifi conforme estado atual — sem isso, o icone pegava
  // wifiOk so' no buildHome (boot) e nunca mais mudava. Quando wifi conecta
  // depois (boot offline -> conecta) ficava mostrando 'off' eternamente.
  if (lblWifi) {
    lv_image_set_src(lblWifi, wifiOk ? &ic_wifi : &ic_wifi_off);
    lv_obj_set_style_image_recolor(lblWifi,
      lv_color_hex(wifiOk ? COL_PRIMARY : COL_DIM), 0);
  }
  // LivePill: visivel so' quando online (espelha o estado do icone wifi).
  if (livePill) {
    if (wifiOk) lv_obj_clear_flag(livePill, LV_OBJ_FLAG_HIDDEN);
    else        lv_obj_add_flag(livePill, LV_OBJ_FLAG_HIDDEN);
  }

  // Arc principal: re-renderiza no modo atual com valores frescos
  updateArcMode();

  // Mini-cards laterais. Valor fica branco fixo (DS).
  // NaN = sem dado real ainda — mostra "--" pra deixar claro que nao tem
  // info do servidor (vs valor demo que confundia user offline).
  if (isnan(rh)) lv_label_set_text(lblRh, "--");
  else { snprintf(buf, sizeof(buf), "%.0f%%", rh); lv_label_set_text(lblRh, buf); }

  if (lblVpd) {
    if (isnan(vpd)) lv_label_set_text(lblVpd, "--");
    else { snprintf(buf, sizeof(buf), "%.2f", vpd); lv_label_set_text(lblVpd, buf); }
  }

  // Card CICLO — "Sem X/Y" + badge fase. Quando semana=0 (estufa de
  // MANUTENCAO/DRYING — sem ciclo VEGA/FLORA), esconde a contagem e mostra
  // so' o badge da fase. Quando FASE vazia (sem fetch ainda), mostra "—".
  if (lblCycleVal) {
    if (semana > 0 && totalSem > 0) {
      snprintf(buf, sizeof(buf), "Sem %d/%d", semana, totalSem);
    } else if (FASE[0] == '\0') {
      strcpy(buf, "\xE2\x80\x94");  // em-dash quando nao conectado
    } else {
      buf[0] = '\0';  // sem ciclo — badge fase fica sozinho
    }
    lv_label_set_text(lblCycleVal, buf);
  }
  if (lblCycleBadge) {
    // Badge so' aparece se ja' temos FASE (do fetch). Antes ficava
    // "FLORACAO" hardcoded mesmo offline — agora oculta.
    if (FASE[0]) {
      lv_obj_clear_flag(lblCycleBadge, LV_OBJ_FLAG_HIDDEN);
      uint32_t pc = phaseColor(FASE);
      // Accent de fase no header acompanha a cor da fase atual.
      if (phaseAccent) {
        lv_obj_set_style_bg_color(phaseAccent, lv_color_hex(pc), 0);
        lv_obj_clear_flag(phaseAccent, LV_OBJ_FLAG_HIDDEN);
      }
      lv_label_set_text(lblCycleBadge, FASE);
      lv_obj_set_style_text_color(lblCycleBadge, lv_color_hex(pc), 0);
      lv_obj_set_style_bg_color(lblCycleBadge, lv_color_hex(pc), 0);
      // Re-tinta o card inteiro na cor da fase atual (gradient top)
      if (cardCycle) tintCard(cardCycle, pc, 50);
      // Barra de progresso: percent da fase concluido. Clamp 0-100.
      if (cycleProgress) {
        int pct = 0;
        if (totalSem > 0 && semana > 0) {
          pct = (semana * 100) / totalSem;
          if (pct > 100) pct = 100;
        }
        lv_obj_set_style_bg_color(cycleProgress, lv_color_hex(pc), 0);
        lv_obj_set_style_bg_color(cycleProgress, lv_color_hex(pc), LV_PART_INDICATOR);
        lv_bar_set_value(cycleProgress, pct, LV_ANIM_ON);
        if (semana <= 0 || totalSem <= 0) lv_obj_add_flag(cycleProgress, LV_OBJ_FLAG_HIDDEN);
        else lv_obj_clear_flag(cycleProgress, LV_OBJ_FLAG_HIDDEN);
      }
    } else {
      // Sem fase ainda — oculta badge + barra + accent
      lv_obj_add_flag(lblCycleBadge, LV_OBJ_FLAG_HIDDEN);
      if (cycleProgress) lv_obj_add_flag(cycleProgress, LV_OBJ_FLAG_HIDDEN);
      if (phaseAccent) lv_obj_add_flag(phaseAccent, LV_OBJ_FLAG_HIDDEN);
    }
  }

  // Badges de freshness dos cards UMID/VPD — colore conforme idade do
  // sensor Tuya. Se WiFi offline, fica DIM cinza (sem dado novo possivel).
  uint32_t freshC = wifiOk ? freshnessColor(sensorAgeSec) : COL_DIM;
  if (badgeRh)  lv_obj_set_style_image_recolor(badgeRh,  lv_color_hex(freshC), 0);
  if (badgeVpd) lv_obj_set_style_image_recolor(badgeVpd, lv_color_hex(freshC), 0);
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

  // Pulse das sparklines so' faz sentido com valor base real — se rh/vpd
  // sao NaN (sem fetch ainda), pula. Cast NaN -> int32 e' UB; alem disso
  // ja' inicializamos como LV_CHART_POINT_NONE, entao chart fica vazio.
  if (sparkRh && serRhS && !isnan(rh)) {
    lv_chart_set_next_value(sparkRh, serRhS, (int32_t)(rh + wave * 1.5f + jitter));
    autoscaleSpark(sparkRh, serRhS);
  }
  if (sparkVpd && serVpdS && !isnan(vpd)) {
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
  uint8_t  levelCount;      // 0 = sem nivel (so' on/off); N = N niveis (slider)
  uint8_t  levelValue;      // nivel atual 1..N (posicao do slider)
} ItemStorage;
static ItemStorage items[SCENES_MAX];
static int sceneCount = 0;  // mantem nome legado p/ minimizar diff
// Refs aos botoes pra updates pontuais (toggle visual sem rebuild full)
static lv_obj_t *itemBtns[SCENES_MAX]  = {nullptr};
static lv_obj_t *itemIcons[SCENES_MAX] = {nullptr};
// Label de contador regressivo (M:SS) — visivel so' enquanto a cena executa.

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
//   device : OTIMISTA — inverte items[idx].state + paintDeviceState na hora do
//            toque (resposta instantânea). O "pisca acende-apaga" de antes era
//            culpa da re-consulta do server (devolvia state stale 500ms depois);
//            essa re-consulta foi REMOVIDA (server devolve o desejado na hora),
//            então o setDeviceState que volta confirma o otimista sem piscar.
//            O poll de /scenes reconcilia com a Tuya real se algo divergir.
// Forward decl — definida apos sceneClickCb
static void sceneActivePulse(int idx);

// ── Confirmação de cena ───────────────────────────────────────────────────────
// Modal full-screen no layer top que pergunta "Iniciar X?" antes de disparar uma
// cena. Resolve dois problemas reportados pelo João: (1) clique que "não vai na
// 1a vez" e (2) duplo-clique disparando a cena 2x. A cena SÓ dispara no "Sim".
// Vive no lv_layer_top → fica por cima do grid e some ao escolher.
static lv_obj_t *confirmOverlay = nullptr;

static void confirmClose() {
  if (confirmOverlay) { lv_obj_del(confirmOverlay); confirmOverlay = nullptr; }
}

// Dispara a cena de fato (chamado no "Sim") — POSTa no app + abre o countdown.
static void sceneDoTrigger(int idx) {
  if (idx < 0 || idx >= sceneCount) return;
  if (onSceneTrigger) onSceneTrigger(idx);
  sceneActivePulse(idx);
}

static void confirmYesCb(lv_event_t *e) {
  int idx = (int)(intptr_t)lv_event_get_user_data(e);
  confirmClose();
  sceneDoTrigger(idx);
}

static void sceneConfirm(int idx) {
  if (idx < 0 || idx >= sceneCount) return;
  confirmClose();  // fecha modal anterior se houver (defesa contra duplo-clique)

  confirmOverlay = lv_obj_create(lv_layer_top());
  lv_obj_remove_style_all(confirmOverlay);
  lv_obj_set_size(confirmOverlay, SCREEN_W, SCREEN_H);
  lv_obj_set_style_bg_color(confirmOverlay, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(confirmOverlay, LV_OPA_COVER, 0);
  lv_obj_clear_flag(confirmOverlay, LV_OBJ_FLAG_SCROLLABLE);

  // Pergunta (centro-acima)
  lv_obj_t *q = lv_label_create(confirmOverlay);
  char buf[80];
  snprintf(buf, sizeof(buf), "Iniciar\n%s?", items[idx].name);
  lv_label_set_text(q, buf);
  lv_label_set_long_mode(q, LV_LABEL_LONG_WRAP);
  lv_obj_set_width(q, SCREEN_W - sw(40));
  lv_obj_set_style_text_align(q, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_style_text_color(q, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_text_font(q, FONT_TITLE, 0);
  lv_obj_align(q, LV_ALIGN_CENTER, 0, -sh(45));

  const lv_coord_t bw = (SCREEN_W - sw(60)) / 2;
  const lv_coord_t bh = sh(54);

  // Botão "Não" (esquerda, neutro)
  lv_obj_t *no = lv_obj_create(confirmOverlay);
  lv_obj_remove_style_all(no);
  lv_obj_set_size(no, bw, bh);
  lv_obj_align(no, LV_ALIGN_CENTER, -(bw / 2 + sw(8)), sh(40));
  lv_obj_set_style_bg_color(no, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_bg_opa(no, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(no, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_border_width(no, 1, 0);
  lv_obj_set_style_radius(no, RADIUS_LG, 0);
  lv_obj_clear_flag(no, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_add_flag(no, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(no, [](lv_event_t *) { confirmClose(); }, LV_EVENT_CLICKED, NULL);
  lv_obj_t *noL = lv_label_create(no);
  lv_label_set_text(noL, "Nao");
  lv_obj_center(noL);
  lv_obj_set_style_text_color(noL, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_text_font(noL, FONT_TITLE, 0);

  // Botão "Sim" (direita, primary)
  lv_obj_t *yes = lv_obj_create(confirmOverlay);
  lv_obj_remove_style_all(yes);
  lv_obj_set_size(yes, bw, bh);
  lv_obj_align(yes, LV_ALIGN_CENTER, (bw / 2 + sw(8)), sh(40));
  lv_obj_set_style_bg_color(yes, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_bg_opa(yes, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(yes, RADIUS_LG, 0);
  lv_obj_clear_flag(yes, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_add_flag(yes, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(yes, confirmYesCb, LV_EVENT_CLICKED, (void *)(intptr_t)idx);
  lv_obj_t *yesL = lv_label_create(yes);
  lv_label_set_text(yesL, "Sim");
  lv_obj_center(yesL);
  lv_obj_set_style_text_color(yesL, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_text_font(yesL, FONT_TITLE, 0);
}

// ── Overlay de NÍVEL (controlador de potência, ex: exaustor) ──────────────────
// Tela cheia (como a rega/confirm). Slider GRANDE 1..N + número + On/Off +
// Fechar. Resolve o slider apertado do card: aqui o slider é grande e nao
// briga com o clique do card. Vive no lv_layer_top.
static lv_obj_t *levelOverlay    = nullptr;
static lv_obj_t *levelNumLabel   = nullptr;
static int       levelOverlayIdx = -1;

static lv_obj_t *levelPwBtn   = nullptr;  // botao On/Off do overlay (estado visual)
static lv_obj_t *levelPwLabel = nullptr;

static void levelOverlayClose() {
  // delete ASYNC (fora do callback): deletar de dentro do toque do botao trava
  // a UI (mesmo bug do screensaver). Defer pra depois do processamento do evento.
  if (levelOverlay) { lv_obj_delete_async(levelOverlay); levelOverlay = nullptr; }
  levelNumLabel = nullptr;
  levelPwBtn = nullptr; levelPwLabel = nullptr;
  levelOverlayIdx = -1;
}

// Pinta o botao On/Off com o estado atual (Ligado=verde / Desligado=neutro).
static void paintLevelPw() {
  if (!levelPwBtn || !levelPwLabel || levelOverlayIdx < 0 || levelOverlayIdx >= SCENES_MAX) return;
  bool on = items[levelOverlayIdx].state;
  lv_obj_set_style_bg_color(levelPwBtn, lv_color_hex(on ? COL_PRIMARY : COL_CARD), 0);
  lv_label_set_text(levelPwLabel, on ? "Ligado" : "Desligado");
  lv_obj_set_style_text_color(levelPwLabel, lv_color_hex(on ? COL_BG : COL_TEXT), 0);
}

// Slider do overlay: número AO VIVO no arraste (VALUE_CHANGED) + POST no soltar
// (RELEASED). Os dois eventos evitam que um toque "perdido" deixe sem comando.
static void levelOverlaySliderCb(lv_event_t *e) {
  lv_obj_t *sl = (lv_obj_t *)lv_event_get_target(e);
  lv_event_code_t code = lv_event_get_code(e);
  int idx = levelOverlayIdx;
  if (idx < 0 || idx >= SCENES_MAX) return;
  int val = (int)lv_slider_get_value(sl);
  if (levelNumLabel) {
    char nb[16];
    if (items[idx].levelCount > 10) snprintf(nb, sizeof(nb), "%d%%", val);
    else                            snprintf(nb, sizeof(nb), "Nivel %d", val);
    lv_label_set_text(levelNumLabel, nb);
  }
  if (code == LV_EVENT_RELEASED) {
    items[idx].levelValue = (uint8_t)val;
    printf("[ui] level overlay idx=%d -> %d/%d (POST)\n", idx, val, items[idx].levelCount);
    if (onDeviceLevel) onDeviceLevel(idx, val);
  }
}

static void openLevelOverlay(int idx) {
  if (idx < 0 || idx >= sceneCount) return;
  levelOverlayClose();
  levelOverlayIdx = idx;
  printf("[ui] openLevel idx=%d cnt=%d val=%d\n", idx, items[idx].levelCount, items[idx].levelValue);
  uint8_t cnt = items[idx].levelCount;
  uint8_t cur = items[idx].levelValue < 1 ? 1 : items[idx].levelValue;

  levelOverlay = lv_obj_create(lv_layer_top());
  lv_obj_remove_style_all(levelOverlay);
  lv_obj_set_size(levelOverlay, SCREEN_W, SCREEN_H);
  lv_obj_set_style_bg_color(levelOverlay, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(levelOverlay, LV_OPA_COVER, 0);
  lv_obj_clear_flag(levelOverlay, LV_OBJ_FLAG_SCROLLABLE);

  // Título (nome do device)
  lv_obj_t *title = lv_label_create(levelOverlay);
  lv_label_set_text(title, items[idx].name);
  lv_obj_set_style_text_color(title, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_text_font(title, FONT_TITLE, 0);
  lv_obj_align(title, LV_ALIGN_TOP_MID, 0, sh(16));

  // Número do nível (grande, verde). >10 = controle em % (ex 1-100); senão presets.
  bool pct = (cnt > 10);
  levelNumLabel = lv_label_create(levelOverlay);
  char nb[16];
  if (pct) snprintf(nb, sizeof(nb), "%d%%", cur);
  else     snprintf(nb, sizeof(nb), "Nivel %d", cur);
  lv_label_set_text(levelNumLabel, nb);
  lv_obj_set_style_text_color(levelNumLabel, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_text_font(levelNumLabel, FONT_TITLE, 0);
  lv_obj_align(levelNumLabel, LV_ALIGN_CENTER, 0, -sh(34));

  // Slider GRANDE 1..N (knob folgado p/ pegar facil)
  lv_obj_t *sl = lv_slider_create(levelOverlay);
  lv_slider_set_range(sl, 1, cnt);
  lv_slider_set_value(sl, cur, LV_ANIM_OFF);
  lv_obj_set_width(sl, SCREEN_W - sw(64));
  lv_obj_set_height(sl, sh(14));
  lv_obj_align(sl, LV_ALIGN_CENTER, 0, sh(4));
  lv_obj_set_style_bg_color(sl, lv_color_hex(COL_BORDER),  LV_PART_MAIN);
  lv_obj_set_style_bg_color(sl, lv_color_hex(COL_PRIMARY), LV_PART_INDICATOR);
  lv_obj_set_style_bg_color(sl, lv_color_hex(COL_PRIMARY), LV_PART_KNOB);
  lv_obj_set_style_pad_all(sl, sh(8), LV_PART_KNOB);
  lv_obj_add_event_cb(sl, levelOverlaySliderCb, LV_EVENT_VALUE_CHANGED, NULL);
  lv_obj_add_event_cb(sl, levelOverlaySliderCb, LV_EVENT_RELEASED, NULL);

  // Labels min/max (1 ... N)
  lv_obj_t *lmin = lv_label_create(levelOverlay);
  lv_label_set_text(lmin, "1");
  lv_obj_set_style_text_color(lmin, lv_color_hex(COL_DIM), 0);
  lv_obj_align_to(lmin, sl, LV_ALIGN_OUT_LEFT_MID, -sw(8), 0);
  lv_obj_t *lmax = lv_label_create(levelOverlay);
  char mb[6]; snprintf(mb, sizeof(mb), "%d", cnt);
  lv_label_set_text(lmax, mb);
  lv_obj_set_style_text_color(lmax, lv_color_hex(COL_DIM), 0);
  lv_obj_align_to(lmax, sl, LV_ALIGN_OUT_RIGHT_MID, sw(8), 0);

  const lv_coord_t bw = (SCREEN_W - sw(56)) / 2;
  const lv_coord_t bh = sh(46);

  // On/Off (esquerda) — MOSTRA o estado (Ligado=verde / Desligado=neutro) e
  // toggla no tap (atualiza na hora + manda via onSceneTrigger).
  lv_obj_t *pw = lv_obj_create(levelOverlay);
  lv_obj_remove_style_all(pw);
  lv_obj_set_size(pw, bw, bh);
  lv_obj_align(pw, LV_ALIGN_BOTTOM_LEFT, sw(16), -sh(16));
  lv_obj_set_style_bg_opa(pw, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(pw, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_border_width(pw, 1, 0);
  lv_obj_set_style_radius(pw, RADIUS_LG, 0);
  lv_obj_clear_flag(pw, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_add_flag(pw, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(pw, [](lv_event_t *) {
    int i = levelOverlayIdx;
    if (i >= 0 && i < SCENES_MAX) { items[i].state = !items[i].state; paintLevelPw(); if (onSceneTrigger) onSceneTrigger(i); }
  }, LV_EVENT_CLICKED, NULL);
  levelPwBtn   = pw;
  levelPwLabel = lv_label_create(pw);
  lv_obj_center(levelPwLabel);
  paintLevelPw();   // estado atual: Ligado/Desligado + cor

  // Fechar (direita, primary)
  lv_obj_t *cl = lv_obj_create(levelOverlay);
  lv_obj_remove_style_all(cl);
  lv_obj_set_size(cl, bw, bh);
  lv_obj_align(cl, LV_ALIGN_BOTTOM_RIGHT, -sw(16), -sh(16));
  lv_obj_set_style_bg_color(cl, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_bg_opa(cl, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(cl, RADIUS_LG, 0);
  lv_obj_clear_flag(cl, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_add_flag(cl, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(cl, [](lv_event_t *) { levelOverlayClose(); }, LV_EVENT_CLICKED, NULL);
  lv_obj_t *clL = lv_label_create(cl);
  lv_label_set_text(clL, "Fechar");
  lv_obj_center(clL);
  lv_obj_set_style_text_color(clL, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_text_font(clL, FONT_TITLE, 0);
}

static void sceneClickCb(lv_event_t *e) {
  int idx = (int)(intptr_t)lv_event_get_user_data(e);
  if (idx < 0 || idx >= sceneCount) return;
  printf("[ui] item tap idx=%d type=%d (%s)\n",
         idx, items[idx].type, items[idx].name);

  // Refresh/sensor — leitura inofensiva, dispara imediato (sem confirmacao).
  // Animacao de rotacao no icone enquanto refresh roda; isRefreshing=true pra
  // refreshHomeValues mostrar toast "Atualizado" quando dados frescos chegarem.
  // App chama cultivoUI_stopItemSpin quando dados frescos chegarem.
  if (!strcmp(items[idx].iconHint, "refresh") ||
      !strcmp(items[idx].iconHint, "sensor")) {
    if (onSceneTrigger) onSceneTrigger(idx);
    isRefreshing = true;
    cultivoUI_startItemSpin(idx);
    return;
  }

  if (items[idx].type == 1 || items[idx].type == 2) {
    // Device com NÍVEL (controlador de potência): abre o overlay GRANDE de
    // controle (slider + on/off) em vez de só togglar no card.
    if (items[idx].levelCount > 0) { openLevelOverlay(idx); return; }
    // Device/automation — FEEDBACK OTIMISTA: inverte o state e pinta ON/OFF na
    // HORA do toque (a rede roda no fundo, no tapTask). O servidor agora devolve
    // o estado desejado imediatamente (sem re-consulta — removida no fix de cota),
    // então o cultivoUI_setDeviceState que volta BATE com o otimista → não pisca.
    // Se a Tuya não executou de fato, o próximo poll de /scenes corrige sozinho.
    // Resolve "parece travado / tenho que clicar de novo": resposta instantânea.
    items[idx].state = !items[idx].state;
    paintDeviceState(idx);
    if (onSceneTrigger) onSceneTrigger(idx);
    return;
  }

  // Scene (rega etc.) — pede confirmacao antes de disparar. So' dispara no
  // "Sim" (sceneDoTrigger), que entao chama onSceneTrigger + sceneActivePulse.
  sceneConfirm(idx);
}

static const uint32_t SCENE_ACTIVE_MS_DEFAULT = 5000;  // fallback se server nao enviou executionSec

// ── Overlay de countdown da cena ──────────────────────────────────────────────
// Tela dedicada que abre ao tocar uma cena com duração (ex: rega 240s). Vive no
// lv_layer_top, então SOBREVIVE ao rebuildSceneGrid (que roda no refresh de 30s
// e destruía o contador antigo do card — bug reportado pelo João). Enquanto
// aberto, o fetchScenes é pausado (cultivoUI_isCountdownActive). Contador grande
// M:SS + barra de progresso esvaziando. Fecha ao zerar ou no botão.
static lv_obj_t  *cdOverlay   = nullptr;
static lv_obj_t  *cdTimeLabel = nullptr;
static lv_obj_t  *cdBar       = nullptr;
static lv_timer_t *cdTimer    = nullptr;
static int32_t   cdSecsLeft   = 0;
static int32_t   cdSecsTotal  = 0;

static void cdClose() {
  if (cdTimer) { lv_timer_del(cdTimer); cdTimer = nullptr; }
  if (cdOverlay) { lv_obj_del(cdOverlay); cdOverlay = nullptr; }
  cdTimeLabel = nullptr; cdBar = nullptr;
  cdSecsLeft = cdSecsTotal = 0;
}

// Exposto pro main_lvgl: pausa o fetchScenes enquanto o countdown está na tela.
extern "C" bool cultivoUI_isCountdownActive(void) { return cdOverlay != nullptr; }
// Overlay de nível aberto → main pausa o fetchScenes (mesma defesa da rega:
// rebuildar o grid com o overlay aberto travava a UI).
extern "C" bool cultivoUI_isLevelOverlayActive(void) { return levelOverlay != nullptr; }

static void cdUpdateLabel() {
  if (cdTimeLabel) {
    char buf[8];
    snprintf(buf, sizeof(buf), "%d:%02d", cdSecsLeft / 60, cdSecsLeft % 60);
    lv_label_set_text(cdTimeLabel, buf);
  }
  if (cdBar && cdSecsTotal > 0) {
    lv_bar_set_value(cdBar, (cdSecsLeft * 100) / cdSecsTotal, LV_ANIM_ON);
  }
}

static void cdTickCb(lv_timer_t *) {
  cdSecsLeft--;
  if (cdSecsLeft <= 0) { cdClose(); return; }
  cdUpdateLabel();
}

static void sceneActivePulse(int idx) {
  if (idx < 0 || idx >= sceneCount) return;
  cdClose();  // fecha countdown anterior se houver

  uint32_t durSec = items[idx].executionSec > 0
                    ? (uint32_t)items[idx].executionSec
                    : (SCENE_ACTIVE_MS_DEFAULT / 1000);
  cdSecsTotal = cdSecsLeft = (int32_t)durSec;

  // Overlay full-screen no layer top (sobrevive a rebuilds do grid)
  cdOverlay = lv_obj_create(lv_layer_top());
  lv_obj_remove_style_all(cdOverlay);
  lv_obj_set_size(cdOverlay, SCREEN_W, SCREEN_H);
  lv_obj_set_style_bg_color(cdOverlay, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(cdOverlay, LV_OPA_COVER, 0);
  lv_obj_clear_flag(cdOverlay, LV_OBJ_FLAG_SCROLLABLE);

  // Nome da cena (topo)
  lv_obj_t *nm = lv_label_create(cdOverlay);
  lv_label_set_text(nm, items[idx].name);
  lv_label_set_long_mode(nm, LV_LABEL_LONG_DOT);
  lv_obj_set_width(nm, SCREEN_W - sw(40));
  lv_obj_set_style_text_color(nm, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_text_font(nm, FONT_TITLE, 0);
  lv_obj_set_style_text_align(nm, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_align(nm, LV_ALIGN_TOP_MID, 0, sh(40));

  // Contador grande (centro)
  cdTimeLabel = lv_label_create(cdOverlay);
  lv_obj_set_style_text_color(cdTimeLabel, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_text_font(cdTimeLabel, FONT_VALUE, 0);
  lv_obj_align(cdTimeLabel, LV_ALIGN_CENTER, 0, -sh(10));

  // Barra de progresso (abaixo do contador)
  cdBar = lv_bar_create(cdOverlay);
  lv_obj_set_size(cdBar, SCREEN_W - sw(80), sh(10));
  lv_obj_align(cdBar, LV_ALIGN_CENTER, 0, sh(40));
  lv_obj_set_style_bg_color(cdBar, lv_color_hex(COL_CARD), LV_PART_MAIN);
  lv_obj_set_style_bg_color(cdBar, lv_color_hex(COL_PRIMARY), LV_PART_INDICATOR);
  lv_obj_set_style_radius(cdBar, sh(5), LV_PART_MAIN);
  lv_obj_set_style_radius(cdBar, sh(5), LV_PART_INDICATOR);
  lv_bar_set_range(cdBar, 0, 100);
  lv_bar_set_value(cdBar, 100, LV_ANIM_OFF);

  // Botão fechar (rodapé) — toca em qualquer lugar do overlay fecha
  lv_obj_t *hint = lv_label_create(cdOverlay);
  lv_label_set_text(hint, "Toque para fechar");
  lv_obj_set_style_text_color(hint, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(hint, FONT_CAPTION, 0);
  lv_obj_align(hint, LV_ALIGN_BOTTOM_MID, 0, -sh(20));

  lv_obj_add_flag(cdOverlay, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(cdOverlay, [](lv_event_t *) { cdClose(); }, LV_EVENT_CLICKED, NULL);

  cdUpdateLabel();
  cdTimer = lv_timer_create(cdTickCb, 1000, NULL);
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

    bool hasLevel = (items[i].levelCount > 0);

    // Icone top (mais alto quando ha slider, p/ liberar espaco embaixo)
    lv_obj_t *ico = lv_image_create(btn);
    lv_image_set_src(ico, iconImg);
    lv_obj_set_style_image_recolor(ico, lv_color_hex(iconColor), 0);
    lv_obj_set_style_image_recolor_opa(ico, LV_OPA_COVER, 0);
    lv_obj_align(ico, LV_ALIGN_TOP_MID, 0, hasLevel ? sh(8) : sh(12));

    // Label nome — topo quando ha slider, embaixo no card normal
    lv_obj_t *lbl = lv_label_create(btn);
    lv_label_set_text(lbl, items[i].name);
    lv_label_set_long_mode(lbl, LV_LABEL_LONG_DOT);
    lv_obj_set_width(lbl, btnW - sw(8));
    lv_obj_set_style_text_color(lbl, lv_color_hex(COL_TEXT), 0);
    lv_obj_set_style_text_font(lbl, FONT_CAPTION, 0);
    lv_obj_set_style_text_align(lbl, LV_TEXT_ALIGN_CENTER, 0);
    if (hasLevel) lv_obj_align(lbl, LV_ALIGN_TOP_MID, 0, sh(36));
    else          lv_obj_align(lbl, LV_ALIGN_BOTTOM_MID, 0, -sh(4));

    // Indicador de nivel (READ-ONLY): barra mostrando o nivel atual. NAO e'
    // interativo -> tocar o card abre o overlay grande (openLevelOverlay).
    if (hasLevel) {
      uint8_t lvNow = items[i].levelValue < 1 ? 1 : items[i].levelValue;
      lv_obj_t *bar = lv_bar_create(btn);
      lv_bar_set_range(bar, 1, items[i].levelCount);
      lv_bar_set_value(bar, lvNow, LV_ANIM_OFF);
      lv_obj_set_width(bar, btnW - sw(16));
      lv_obj_set_height(bar, sh(6));
      lv_obj_align(bar, LV_ALIGN_BOTTOM_MID, 0, -sh(20));
      lv_obj_set_style_bg_color(bar, lv_color_hex(COL_BORDER),  LV_PART_MAIN);
      lv_obj_set_style_bg_color(bar, lv_color_hex(COL_PRIMARY), LV_PART_INDICATOR);

      // Numero do nivel (N/total)
      lv_obj_t *lnum = lv_label_create(btn);
      char nb[8];
      if (items[i].levelCount > 10) snprintf(nb, sizeof(nb), "%d%%", lvNow);
      else                          snprintf(nb, sizeof(nb), "%d/%d", lvNow, items[i].levelCount);
      lv_label_set_text(lnum, nb);
      lv_obj_set_style_text_color(lnum, lv_color_hex(COL_DIM), 0);
      lv_obj_set_style_text_font(lnum, FONT_CAPTION, 0);
      lv_obj_align(lnum, LV_ALIGN_BOTTOM_MID, 0, -sh(3));
    }

    // Salva refs + aplica estado on/off (so' efetivo em devices).
    // Contador de cena não vive mais no card (overlay dedicado sobrevive ao
    // rebuild do grid no refresh de 30s) — ver sceneActivePulse.
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

  // A ESTRUTURA mudou (count ou ids/tipos diferentes do grid atual)? Se NAO
  // mudou, atualiza os cards NO LUGAR em vez de destruir/recriar o grid. Isso
  // resolve o "clico varias vezes": antes, o refresh de 30s recriava todos os
  // botoes — um tap no meio disso era perdido (botao deletado embaixo do dedo)
  // e o feedback otimista era revertido. Comparacao feita ANTES de sobrescrever.
  bool sameStruct = (sceneTab != nullptr) && (count == sceneCount) && (count > 0)
                    && (itemBtns[0] != nullptr);
  if (sameStruct) {
    for (int i = 0; i < count; i++) {
      if (items[i].type != src[i].type || strcmp(items[i].id, src[i].id) != 0) {
        sameStruct = false; break;
      }
    }
  }

  sceneCount = count;
  for (int i = 0; i < count; i++) {
    copyStr(items[i].id,       sizeof(items[i].id),       src[i].id);
    copyStr(items[i].name,     sizeof(items[i].name),     src[i].name);
    copyStr(items[i].iconHint, sizeof(items[i].iconHint), src[i].iconHint);
    items[i].type         = src[i].type;
    items[i].state        = src[i].state;
    items[i].executionSec = src[i].executionSec;
    items[i].levelCount   = src[i].levelCount;
    items[i].levelValue   = src[i].levelValue;
  }
  // Limpa slots nao usados (evita render de lixo se shrink)
  for (int i = count; i < SCENES_MAX; i++) {
    items[i].id[0] = items[i].name[0] = items[i].iconHint[0] = '\0';
    items[i].type = 0; items[i].state = false; items[i].executionSec = 0;
    items[i].levelCount = 0; items[i].levelValue = 0;
  }
  printf("[ui] cultivoUI_applyItems count=%d inplace=%d\n", count, (int)sameStruct);

  if (sameStruct) {
    // Atualiza so' o estado dos devices (nao toca nos botoes -> taps preservados).
    for (int i = 0; i < count; i++) {
      if (items[i].type == 1 || items[i].type == 2) paintDeviceState(i);
    }
  } else {
    rebuildSceneGrid();
  }
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
// Tap-to-read: cursor vertical (lv_chart nativo — posiciona certo sozinho) +
// tooltip no topo com valor+tempo do ponto tocado. João pediu "clicar em cima
// pra ver a temperatura". applyHistData reseta quando os dados mudam.
static lv_chart_cursor_t *histCursor = nullptr;
static lv_obj_t *histCursorLbl = nullptr;
static lv_obj_t *histXAxisLbl = nullptr;  // "-24h ... agora"
static lv_obj_t *histPeriodLbl = nullptr; // "ultimas 24h" clicavel
static lv_chart_series_t *histSer = nullptr;
static int histMetric = 0;  // 0=temp, 1=rh, 2=ph, 3=ec
static int histPeriod = 0;  // 0=24h, 1=7d, 2=30d
static const char *PERIOD_LABELS[3] = { "ultimas 24h", "ultimos 7d", "ultimos 30d" };
static const char *PERIOD_XAXIS[3]  = {
  "-24h     -18h     -12h     -6h     agora",
  "-7d      -5d       -3d       -1d     hoje",
  "-30d    -23d    -15d    -7d    hoje"
};

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

  // Tap-to-read reseta quando os dados mudam: esconde o tooltip e leva o
  // cursor pro ponto mais recente (agora).
  if (histCursorLbl) lv_obj_add_flag(histCursorLbl, LV_OBJ_FLAG_HIDDEN);
  if (histCursor && histCount > 0)
    lv_chart_set_cursor_point(histChart, histCursor, histSer, HIST_POINTS - 1);

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
        // LV_SYMBOL_UP/DOWN sao glyphs FontAwesome em montserrat — Manrope
        // (FONT_CAPTION) renderiza como quadrado vazio. O sign do +/- delta
        // ja' indica direcao; deixamos so' isso pra zero risco de glyph faltando.
        if (m.decimals == 0) {
          fmt = "Agora %.0f%s  %+.0f  Min %.0f  Max %.0f";
          snprintf(buf, sizeof(buf), fmt, lastV, m.unit, delta, minV, maxV);
        } else {
          fmt = "Agora %.1f%s  %+.1f  Min %.1f  Max %.1f";
          snprintf(buf, sizeof(buf), fmt, lastV, m.unit, delta, minV, maxV);
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

// Tap-to-read: enquanto o dedo pressiona/arrasta sobre o chart, mostra o valor
// (e quando) do ponto mais proximo. lv_chart_get_pressed_point da o id sob o
// toque; o cursor nativo desenha a linha vertical no ponto; o tooltip no topo
// mostra "26.4°C · ha 6h" na cor da metrica.
static void histChartPressCb(lv_event_t *e) {
  (void)e;
  if (!histChart || !histSer || !histCursorLbl) return;
  uint32_t id = lv_chart_get_pressed_point(histChart);
  if (id == LV_CHART_POINT_NONE) return;
  int32_t *ys = lv_chart_get_y_array(histChart, histSer);
  if (!ys) return;
  int32_t raw = ys[id];
  if (raw == LV_CHART_POINT_NONE) return;  // slot vazio (sem dado naquele ponto)

  auto &m = HIST_METRICS[histMetric];
  float val = (float)raw / m.scale;

  // Tempo relativo: slot mais a direita (HIST_POINTS-1) = agora. Cada slot
  // cobre periodo/HIST_POINTS (24h->1h, 7d->7h, 30d->30h).
  int slotsAgo = (int)(HIST_POINTS - 1) - (int)id;
  int totalH   = (histPeriod == 0) ? 24 : (histPeriod == 1) ? 168 : 720;
  int hoursAgo = slotsAgo * (totalH / HIST_POINTS);
  char tbuf[16];
  if (slotsAgo <= 0)       snprintf(tbuf, sizeof(tbuf), "agora");
  else if (hoursAgo < 48)  snprintf(tbuf, sizeof(tbuf), "ha %dh", hoursAgo);
  else                     snprintf(tbuf, sizeof(tbuf), "ha %dd", hoursAgo / 24);

  char buf[48];
  snprintf(buf, sizeof(buf), "%.*f%s \xC2\xB7 %s", m.decimals, val, m.unit, tbuf);
  lv_label_set_text(histCursorLbl, buf);
  lv_obj_set_style_text_color(histCursorLbl, lv_color_hex(m.color), 0);
  lv_obj_clear_flag(histCursorLbl, LV_OBJ_FLAG_HIDDEN);

  if (histCursor) lv_chart_set_cursor_point(histChart, histCursor, histSer, id);
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
  // Period selector clicavel — cicla 24h -> 7d -> 30d. Tap dispara
  // onHistPeriod(idx) que refaz fetch. Style: dim como o original mas
  // clicavel; o tap atualiza o texto + xaxis labels.
  histPeriodLbl = lv_label_create(tab);
  lv_label_set_text(histPeriodLbl, PERIOD_LABELS[histPeriod]);
  lv_obj_set_style_text_color(histPeriodLbl, lv_color_hex(COL_PRIMARY), 0);  // primary pra indicar interatividade
  lv_obj_set_style_text_font(histPeriodLbl, FONT_CAPTION, 0);
  lv_obj_align(histPeriodLbl, LV_ALIGN_TOP_RIGHT, -sw(6), sh(8));
  lv_obj_add_flag(histPeriodLbl, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_ext_click_area(histPeriodLbl, sw(8));
  lv_obj_add_event_cb(histPeriodLbl, [](lv_event_t *e) {
    histPeriod = (histPeriod + 1) % 3;
    lv_label_set_text(histPeriodLbl, PERIOD_LABELS[histPeriod]);
    if (histXAxisLbl) lv_label_set_text(histXAxisLbl, PERIOD_XAXIS[histPeriod]);
    if (onHistPeriod) onHistPeriod(histPeriod);
  }, LV_EVENT_CLICKED, NULL);

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

  // Tap-to-read (handler histChartPressCb): cursor vertical sutil que segue o
  // toque + tooltip no topo com valor+tempo. Ambos ocultos ate' o 1o toque.
  histCursor = lv_chart_add_cursor(histChart, lv_color_hex(COL_DIM), LV_DIR_VER);
  histCursorLbl = lv_label_create(histChart);
  lv_label_set_text(histCursorLbl, "");
  lv_obj_set_style_text_font(histCursorLbl, FONT_CAPTION, 0);
  lv_obj_set_style_text_color(histCursorLbl, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_bg_color(histCursorLbl, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(histCursorLbl, LV_OPA_COVER, 0);
  lv_obj_set_style_pad_left(histCursorLbl, sw(6), 0);
  lv_obj_set_style_pad_right(histCursorLbl, sw(6), 0);
  lv_obj_set_style_pad_top(histCursorLbl, sh(2), 0);
  lv_obj_set_style_pad_bottom(histCursorLbl, sh(2), 0);
  lv_obj_set_style_radius(histCursorLbl, RADIUS_SM, 0);
  lv_obj_set_style_border_width(histCursorLbl, 1, 0);
  lv_obj_set_style_border_color(histCursorLbl, lv_color_hex(COL_BORDER), 0);
  lv_obj_align(histCursorLbl, LV_ALIGN_TOP_MID, 0, sh(3));
  lv_obj_add_flag(histCursorLbl, LV_OBJ_FLAG_HIDDEN);
  lv_obj_add_flag(histChart, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(histChart, histChartPressCb, LV_EVENT_PRESSING, NULL);

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
    shrinkIcon(ic, 150);
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
  uint32_t dueDate;   // epoch sec, 0 = sem data
  bool overdue;
} TaskStorage;
static TaskStorage tasks[TASKS_MAX];
static int taskCount = 0;
static lv_obj_t *tasksTab     = nullptr;
static lv_obj_t *tasksList    = nullptr;  // container scrollable
static lv_obj_t *tasksEmpty   = nullptr;  // empty state
static lv_obj_t *taskRows[TASKS_MAX] = {nullptr};
static lv_obj_t *taskChecks[TASKS_MAX] = {nullptr};
static lv_obj_t *taskLabels[TASKS_MAX] = {nullptr};
// Calendar mode: 0=lista (current week), 1=semana (7d ahead com day headers)
static int tasksRangeMode = 0;
static lv_obj_t *tasksRangeLbl = nullptr;

static CultivoTaskToggleFn onTaskToggle = nullptr;
extern "C" void cultivoUI_setTaskToggleHandler(CultivoTaskToggleFn cb) {
  onTaskToggle = cb;
}
static CultivoTasksRangeFn onTasksRange = nullptr;
extern "C" void cultivoUI_setTasksRangeHandler(CultivoTasksRangeFn cb) {
  onTasksRange = cb;
}

// Pinta row conforme done: ✓ verde sobre bg primary opa 20 + label dim
// strikethrough; OFF: ⬜ vazio + label COL_TEXT
// overdue: border vermelha + check vermelho (chama atencao)
static void paintTaskRow(int idx) {
  if (idx < 0 || idx >= TASKS_MAX) return;
  if (!taskRows[idx] || !taskChecks[idx] || !taskLabels[idx]) return;
  bool done = tasks[idx].done;
  bool overdue = tasks[idx].overdue && !done;
  if (done) {
    lv_image_set_src(taskChecks[idx], &ic_check_circle);
    lv_obj_set_style_image_recolor(taskChecks[idx], lv_color_hex(COL_PRIMARY), 0);
    lv_obj_set_style_text_color(taskLabels[idx], lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_text_decor(taskLabels[idx], LV_TEXT_DECOR_STRIKETHROUGH, 0);
    lv_obj_set_style_bg_opa(taskRows[idx], LV_OPA_10, 0);
    lv_obj_set_style_border_color(taskRows[idx], lv_color_hex(COL_BORDER), 0);
  } else if (overdue) {
    lv_image_set_src(taskChecks[idx], &ic_alert);
    lv_obj_set_style_image_recolor(taskChecks[idx], lv_color_hex(COL_RED), 0);
    lv_obj_set_style_text_color(taskLabels[idx], lv_color_hex(COL_TEXT), 0);
    lv_obj_set_style_text_decor(taskLabels[idx], LV_TEXT_DECOR_NONE, 0);
    lv_obj_set_style_bg_opa(taskRows[idx], LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(taskRows[idx], lv_color_hex(COL_RED), 0);
  } else {
    lv_image_set_src(taskChecks[idx], &ic_check_circle);
    lv_obj_set_style_image_recolor(taskChecks[idx], lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_text_color(taskLabels[idx], lv_color_hex(COL_TEXT), 0);
    lv_obj_set_style_text_decor(taskLabels[idx], LV_TEXT_DECOR_NONE, 0);
    lv_obj_set_style_bg_opa(taskRows[idx], LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(taskRows[idx], lv_color_hex(COL_BORDER), 0);
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
    // Em modo Semana, prefix com day-of-week ("seg 12/5") ou "ATRASADA"
    // pra dar contexto temporal. Em modo Lista, so' titulo simples.
    if (tasksRangeMode == 1 && tasks[i].dueDate > 0) {
      time_t t = (time_t)tasks[i].dueDate;
      struct tm tmInfo;
      char buf[96];
      if (localtime_r(&t, &tmInfo)) {
        static const char *DOW[] = {"dom","seg","ter","qua","qui","sex","sab"};
        if (tasks[i].overdue) {
          snprintf(buf, sizeof(buf), "[!] %s %d/%d  %s",
                   DOW[tmInfo.tm_wday], tmInfo.tm_mday, tmInfo.tm_mon + 1,
                   tasks[i].title);
        } else {
          snprintf(buf, sizeof(buf), "%s %d/%d  %s",
                   DOW[tmInfo.tm_wday], tmInfo.tm_mday, tmInfo.tm_mon + 1,
                   tasks[i].title);
        }
      } else {
        snprintf(buf, sizeof(buf), "%s", tasks[i].title);
      }
      lv_label_set_text(lbl, buf);
    } else {
      lv_label_set_text(lbl, tasks[i].title);
    }
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
    tasks[i].done    = items[i].done;
    tasks[i].dueDate = items[i].dueDate;
    tasks[i].overdue = items[i].overdue;
  }
  for (int i = count; i < TASKS_MAX; i++) {
    tasks[i].id = 0; tasks[i].title[0] = '\0'; tasks[i].done = false;
    tasks[i].dueDate = 0; tasks[i].overdue = false;
  }
  printf("[ui] applyTasks count=%d (mode=%s)\n", count, tasksRangeMode ? "semana" : "lista");
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

  // Toggle "lista" / "semana" clicavel na direita do header.
  // Lista = current week | Semana = current+next week + overdue (com day prefix)
  tasksRangeLbl = lv_label_create(tab);
  lv_label_set_text(tasksRangeLbl, tasksRangeMode ? "semana" : "lista");
  lv_obj_set_style_text_color(tasksRangeLbl, lv_color_hex(COL_PRIMARY), 0);
  lv_obj_set_style_text_font(tasksRangeLbl, FONT_CAPTION, 0);
  lv_obj_align(tasksRangeLbl, LV_ALIGN_TOP_RIGHT, -sw(6), sh(8));
  lv_obj_add_flag(tasksRangeLbl, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_ext_click_area(tasksRangeLbl, sw(8));
  lv_obj_add_event_cb(tasksRangeLbl, [](lv_event_t *e) {
    tasksRangeMode = (tasksRangeMode + 1) % 2;
    lv_label_set_text(tasksRangeLbl, tasksRangeMode ? "semana" : "lista");
    if (onTasksRange) onTasksRange(tasksRangeMode);
  }, LV_EVENT_CLICKED, NULL);

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
  // Strain info (vazio = sem strain). Exibido no detalhe da planta.
  char strainName[48];
  uint8_t strainVegaWeeks;
  uint8_t strainFloraWeeks;
  char strainOrigin[16];
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
static CultivoPhotoNavFn          onPhotoNav         = nullptr;
extern "C" void cultivoUI_setPlantPhotoRequestHandler(CultivoPlantPhotoRequestFn cb) {
  onPlantPhotoRequest = cb;
}
extern "C" void cultivoUI_setPlantDetailClosedHandler(CultivoPlantDetailClosedFn cb) {
  onPlantDetailClosed = cb;
}
extern "C" void cultivoUI_setPhotoNavHandler(CultivoPhotoNavFn cb) {
  onPhotoNav = cb;
}

// Timeline state pra mostrar "X/N" + ativar/desativar arrows
static int photoTimelineIdx   = 0;
static int photoTimelineTotal = 1;
static lv_obj_t *photoNavPrev = nullptr;
static lv_obj_t *photoNavNext = nullptr;
static lv_obj_t *photoNavInfo = nullptr;

extern "C" void cultivoUI_setPhotoTimelineInfo(int idx, int total) {
  photoTimelineIdx   = idx;
  photoTimelineTotal = total < 1 ? 1 : total;
  if (photoNavInfo) {
    if (photoTimelineTotal <= 1) {
      lv_label_set_text(photoNavInfo, "");
    } else {
      lv_label_set_text_fmt(photoNavInfo, "%d/%d", photoTimelineIdx + 1, photoTimelineTotal);
    }
  }
  // Esconde/mostra arrows: <- desabilitado se idx=0 (mais recente),
  // -> desabilitado se idx == total-1 (mais antiga).
  if (photoNavPrev) lv_obj_set_style_image_recolor(photoNavPrev,
    lv_color_hex(photoTimelineIdx > 0 ? COL_TEXT : COL_DIM), 0);
  if (photoNavNext) lv_obj_set_style_image_recolor(photoNavNext,
    lv_color_hex(photoTimelineIdx + 1 < photoTimelineTotal ? COL_TEXT : COL_DIM), 0);
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
    // Strain info — copy pra storage interno
    if (items[i].strainName) {
      strncpy(plants[i].strainName, items[i].strainName, sizeof(plants[i].strainName) - 1);
      plants[i].strainName[sizeof(plants[i].strainName) - 1] = '\0';
    } else { plants[i].strainName[0] = '\0'; }
    plants[i].strainVegaWeeks  = items[i].strainVegaWeeks;
    plants[i].strainFloraWeeks = items[i].strainFloraWeeks;
    if (items[i].strainOrigin) {
      strncpy(plants[i].strainOrigin, items[i].strainOrigin, sizeof(plants[i].strainOrigin) - 1);
      plants[i].strainOrigin[sizeof(plants[i].strainOrigin) - 1] = '\0';
    } else { plants[i].strainOrigin[0] = '\0'; }
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
    photoNavPrev = photoNavNext = photoNavInfo = nullptr;
  }
  // Reset timeline state pra nova planta (default: 1/1 ate' lista chegar)
  photoTimelineIdx = 0;
  photoTimelineTotal = 1;
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

  // Photo timeline arrows + counter. Posicionados nas bordas do image
  // container — < esquerda, > direita, "X/N" centro inferior.
  // Arrows DESABILITAM (cinza dim) quando nao tem prev/next.
  photoNavPrev = lv_label_create(plantDetailScreen);
  lv_label_set_text(photoNavPrev, LV_SYMBOL_LEFT);
  lv_obj_set_style_text_color(photoNavPrev, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(photoNavPrev, &lv_font_montserrat_24, 0);
  lv_obj_align(photoNavPrev, LV_ALIGN_LEFT_MID, sw(8), 0);
  lv_obj_add_flag(photoNavPrev, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_ext_click_area(photoNavPrev, sw(16));
  lv_obj_add_event_cb(photoNavPrev, [](lv_event_t *e) {
    // Prev = idx menor = foto mais recente. -1 = direcao "anterior" na lista.
    if (photoTimelineIdx > 0 && onPhotoNav) onPhotoNav(-1);
  }, LV_EVENT_CLICKED, NULL);

  photoNavNext = lv_label_create(plantDetailScreen);
  lv_label_set_text(photoNavNext, LV_SYMBOL_RIGHT);
  lv_obj_set_style_text_color(photoNavNext, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(photoNavNext, &lv_font_montserrat_24, 0);
  lv_obj_align(photoNavNext, LV_ALIGN_RIGHT_MID, -sw(8), 0);
  lv_obj_add_flag(photoNavNext, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_ext_click_area(photoNavNext, sw(16));
  lv_obj_add_event_cb(photoNavNext, [](lv_event_t *e) {
    if (photoTimelineIdx + 1 < photoTimelineTotal && onPhotoNav) onPhotoNav(+1);
  }, LV_EVENT_CLICKED, NULL);

  photoNavInfo = lv_label_create(plantDetailScreen);
  lv_label_set_text(photoNavInfo, "");
  lv_obj_set_style_text_color(photoNavInfo, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(photoNavInfo, FONT_CAPTION, 0);
  lv_obj_align(photoNavInfo, LV_ALIGN_BOTTOM_MID, 0, -sh(36));

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

  // Strain info — canto direito-baixo. Ex: "Northern Lights · 4/8sem · FEMINIZED"
  // Compacto (FONT_CAPTION) e cinza pra nao competir com status/data.
  if (plants[idx].strainName[0]) {
    lv_obj_t *lblStrain = lv_label_create(plantDetailScreen);
    char sbuf[96];
    if (plants[idx].strainVegaWeeks > 0 && plants[idx].strainFloraWeeks > 0) {
      snprintf(sbuf, sizeof(sbuf), "%s  %d/%dsem  %s",
               plants[idx].strainName,
               plants[idx].strainVegaWeeks, plants[idx].strainFloraWeeks,
               plants[idx].strainOrigin[0] ? plants[idx].strainOrigin : "");
    } else {
      snprintf(sbuf, sizeof(sbuf), "%s  %s",
               plants[idx].strainName,
               plants[idx].strainOrigin[0] ? plants[idx].strainOrigin : "");
    }
    lv_label_set_text(lblStrain, sbuf);
    lv_label_set_long_mode(lblStrain, LV_LABEL_LONG_DOT);
    lv_obj_set_width(lblStrain, sw(280));
    lv_obj_set_style_text_align(lblStrain, LV_TEXT_ALIGN_RIGHT, 0);
    lv_obj_set_style_text_color(lblStrain, lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_text_font(lblStrain, FONT_CAPTION, 0);
    lv_obj_align(lblStrain, LV_ALIGN_BOTTOM_RIGHT, -sw(12), -sh(8));
  }

  // Pede a foto ao app (so' se hasPhoto)
  if (plants[idx].hasPhoto && onPlantPhotoRequest) {
    onPlantPhotoRequest(plantDetailId);
  }
}

static void closePlantDetail() {
  if (plantDetailScreen) { lv_obj_del(plantDetailScreen); plantDetailScreen = nullptr; }
  plantDetailImage = plantDetailStatus = plantDetailDate = plantDetailName = nullptr;
  plantDetailLoad  = nullptr;
  photoNavPrev = photoNavNext = photoNavInfo = nullptr;
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

  // FAB quick-log removido: registros de rega/fertilizacao agora SO' via app
  // web/mobile. Display e' read-only — mais simples e foco no monitoramento.
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
