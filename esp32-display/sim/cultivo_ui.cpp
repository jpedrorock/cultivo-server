// ════════════════════════════════════════════════════════════════════════════════
// cultivo_ui.cpp — UI completa para o simulador SDL2
//
// Porte focado do main_lvgl.cpp (ESP32) sem nada de Arduino/WiFi/HTTP.
// Dados de sensores sao mockados e variam via timer (lv_timer) pra o
// comportamento visual ficar parecido com o firmware real.
//
// Resolucao alvo: 480x320 (mesmo do display JC4832W535 real).
// Tipografia: usamos as fontes "reais" (Manrope bold 40/24, sb 18/14) — as
// Wokwi-compactas ficam sem uso aqui.
//
// Pra trazer uma mudanca visual daqui pro firmware real, copie a funcao
// buildX()/refreshX() relevante e cole em main_lvgl.cpp (a assinatura e a
// logica das funcoes sao identicas).
// ════════════════════════════════════════════════════════════════════════════════

#include "lvgl.h"
#include "cultivo_icons.h"
#include "fonts/cultivo_fonts.h"
#include "cultivo_ui.h"

#include <cstdio>
#include <cstring>
#include <cmath>
#include <cstdlib>

// ════════════════════════════════════════════════════════════════════════════════
// Constantes de tela / fonte (equivalem a hal_platform.h no firmware real)
// ════════════════════════════════════════════════════════════════════════════════
static const int SCREEN_W = 480;
static const int SCREEN_H = 320;
static const int TABBAR_H = 54;
static const int TAB_H    = SCREEN_H - TABBAR_H;

#define FONT_VALUE   (&manrope_bold_40)
#define FONT_TITLE   (&manrope_bold_24)
#define FONT_BODY    (&manrope_sb_18)
#define FONT_CAPTION (&manrope_sb_14)

// Escala relativa ao design Wokwi 320x240 (mesma semantica do firmware)
static inline int sw(int v) { return (v * SCREEN_W) / 320; }
static inline int sh(int v) { return (v * SCREEN_H) / 240; }
// ss() = menor dos dois — pra elementos quadrados (botoes circulares, icones).
// Sem isso, sw(40)+sh(40) vira 60x53 num 480x320 (nao-quadrado).
static inline int ss(int v) { return sw(v) < sh(v) ? sw(v) : sh(v); }

// Grid de layout compartilhado — evita magic numbers em cada screen
static const int HEADER_H    = 34;    // altura padrao do header (icone+titulo)
static const int GUTTER      = 8;     // margem lateral padrao (sw scale)
static const int CARD_RADIUS = 10;    // raio padrao de cards
static const int TOUCH_MIN   = 32;    // altura minima de botao clicavel

// ════════════════════════════════════════════════════════════════════════════════
// Paleta (identica ao main_lvgl.cpp — espelha DisplayMode.tsx)
// ════════════════════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════════════════════════
// Estado mockado — sensores variam via lv_timer pra simular leituras ao vivo
// ════════════════════════════════════════════════════════════════════════════════
static char TENT_NAME[50] = "ESTUFA 1";
static char FASE[20]      = "FLORACAO";
static float tempC = 24.5f, rh = 62.0f, vpd = 1.1f, phv = 6.2f, ecv = 1.8f;
static int   semana = 4, totalSem = 16;
static bool  wifiOk = true;   // sim: sempre "conectado"
static int   currentPpfd = 430;
static int   targetPpfd  = 450;
static int   luxMode     = 0;  // 0=PPFD, 1=LUX
static const int LUX_PER_PPFD = 54;
static const int STEP_PPFD    = 25;

// ════════════════════════════════════════════════════════════════════════════════
// Widgets compartilhados entre screens (idem main_lvgl.cpp)
// ════════════════════════════════════════════════════════════════════════════════
static lv_obj_t *contentArea;
static lv_obj_t *screenHome, *screenLux, *screenPhEc, *screenTarefa, *screenGrafic;
static lv_obj_t *navbar;
static lv_obj_t *navIcons[5];
static int activeScreen = 0;
static const uint32_t NAV_COLORS[5] = { COL_GRN, COL_YEL, COL_PRP, 0xFBBF24, COL_CYN };
static const lv_image_dsc_t *NAV_ICONS_IMG[5] = {
  &ic_home, &ic_lightbulb, &ic_flask, &ic_tasks, &ic_activity
};

static lv_obj_t *lblTitle, *lblSub, *lblWifi;
static lv_obj_t *lblTemp, *lblRh, *lblVpd, *lblPpfd;
static lv_obj_t *lblCiclo, *ciclBar;       // strip de ciclo (fase + semana)
static lv_obj_t *arcTemp;
static lv_obj_t *sparkRh, *sparkVpd, *sparkPpfd;
static lv_chart_series_t *serRhS, *serVpdS, *serPpfdS;
static lv_timer_t *pulseTimer = nullptr;
static lv_timer_t *mockTimer  = nullptr;

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
  lv_obj_set_style_bg_color(tab, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_opa(tab, LV_OPA_COVER, 0);

  // Header: icone + titulo + sub + wifi + gear
  lv_obj_t *hdrIcon = lv_image_create(tab);
  lv_image_set_src(hdrIcon, &ic_sprout);
  lv_obj_set_style_image_recolor(hdrIcon, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_image_recolor_opa(hdrIcon, LV_OPA_COVER, 0);
  lv_obj_align(hdrIcon, LV_ALIGN_TOP_LEFT, sw(4), sh(2));

  lblTitle = makeLabel(tab, TENT_NAME, COL_TEXT, FONT_TITLE, LV_ALIGN_TOP_LEFT, sw(38), sh(4));

  char subBuf[48];
  snprintf(subBuf, sizeof(subBuf), "Sem %d/%d  %s", semana, totalSem, FASE);
  lblSub = makeLabel(tab, subBuf, COL_PRP, FONT_CAPTION, LV_ALIGN_TOP_LEFT, sw(38), sh(22));

  lv_obj_t *wifiIcon = lv_image_create(tab);
  lv_image_set_src(wifiIcon, wifiOk ? &ic_wifi : &ic_wifi_off);
  lv_obj_set_style_image_recolor(wifiIcon, lv_color_hex(wifiOk ? COL_GRN : COL_DIM), 0);
  lv_obj_set_style_image_recolor_opa(wifiIcon, LV_OPA_COVER, 0);
  lv_obj_align(wifiIcon, LV_ALIGN_TOP_RIGHT, -sw(4), sh(4));
  lblWifi = wifiIcon;

  // Gear — no sim nao faz nada (modal nao foi portado)
  lv_obj_t *btnCfg = lv_label_create(tab);
  lv_label_set_text(btnCfg, LV_SYMBOL_SETTINGS);
  lv_obj_set_style_text_color(btnCfg, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(btnCfg, &lv_font_montserrat_14, 0);
  lv_obj_align(btnCfg, LV_ALIGN_TOP_RIGHT, -sw(36), sh(6));

  // Corpo: arc grande a esquerda + coluna de mini-cards a direita.
  // Reservamos stripH + gap no rodape pro strip de ciclo (fase/semana).
  int stripH = sh(26);
  int stripGap = sh(4);
  int bodyY = sh(42);
  int bodyH = TAB_H - bodyY - stripH - stripGap - sh(4);
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
  lv_obj_clear_flag(arcTemp, LV_OBJ_FLAG_CLICKABLE);
  // Remove o fundo retangular e borda padrao do lv_arc — queremos so o anel
  lv_obj_set_style_bg_opa(arcTemp, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(arcTemp, 0, 0);
  lv_obj_set_style_pad_all(arcTemp, 0, 0);
  lv_obj_set_style_arc_width(arcTemp, sw(8),  LV_PART_MAIN);
  lv_obj_set_style_arc_color(arcTemp, lv_color_hex(0x1F2937), LV_PART_MAIN);
  lv_obj_set_style_arc_opa(arcTemp, LV_OPA_80, LV_PART_MAIN);
  lv_obj_set_style_arc_width(arcTemp, sw(10), LV_PART_INDICATOR);
  lv_obj_set_style_arc_color(arcTemp, lv_color_hex(COL_GRN), LV_PART_INDICATOR);

  lv_obj_t *lblTempHdr = lv_label_create(arcTemp);
  lv_label_set_text(lblTempHdr, "TEMP");
  lv_obj_set_style_text_color(lblTempHdr, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(lblTempHdr, FONT_CAPTION, 0);
  lv_obj_align(lblTempHdr, LV_ALIGN_CENTER, 0, -arcSize / 4);

  lblTemp = lv_label_create(arcTemp);
  lv_label_set_text(lblTemp, "--");
  lv_obj_set_style_text_color(lblTemp, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_text_font(lblTemp, FONT_VALUE, 0);
  lv_obj_align(lblTemp, LV_ALIGN_CENTER, 0, 0);
  applyBloom(lblTemp, COL_GRN);
  lv_obj_set_style_shadow_color(arcTemp, lv_color_hex(COL_GRN), LV_PART_INDICATOR);
  lv_obj_set_style_shadow_width(arcTemp, 16, LV_PART_INDICATOR);
  lv_obj_set_style_shadow_opa(arcTemp, LV_OPA_60, LV_PART_INDICATOR);

  lv_obj_t *lblTempUnit = lv_label_create(arcTemp);
  lv_label_set_text(lblTempUnit, "°C");
  lv_obj_set_style_text_color(lblTempUnit, lv_color_hex(COL_DIM), 0);
  lv_obj_set_style_text_font(lblTempUnit, FONT_CAPTION, 0);
  lv_obj_align(lblTempUnit, LV_ALIGN_CENTER, 0, arcSize / 4);

  // 3 mini-cards a direita
  int rightX = halfW + sw(2);
  int cardW = SCREEN_W - rightX - sw(4);
  int cardGap = sh(4);
  int cardH = (bodyH - 2 * cardGap) / 3;

  auto makeMiniCard = [&](int yOffset, const char *label, const char *initVal,
                          uint32_t color, const lv_image_dsc_t *icon,
                          lv_obj_t **sparkOut, lv_chart_series_t **serOut,
                          uint32_t pulseDelayMs) -> lv_obj_t* {
    lv_obj_t *c = makeCard(tab, rightX, bodyY + yOffset, cardW, cardH);
    lv_obj_set_style_pad_all(c, sw(4), 0);
    // Ring-pulse defasado: 3 cards a 2800ms com offsets distribuidos no
    // periodo ficam visivelmente fora de fase e a tela "respira" em vez
    // de piscar junto.
    applyRingPulse(c, color, 2800, pulseDelayMs);

    lv_obj_t *ico = lv_image_create(c);
    lv_image_set_src(ico, icon);
    lv_obj_set_style_image_recolor(ico, lv_color_hex(color), 0);
    lv_obj_set_style_image_recolor_opa(ico, LV_OPA_COVER, 0);
    lv_obj_align(ico, LV_ALIGN_LEFT_MID, 0, 0);

    lv_obj_t *lb = lv_label_create(c);
    lv_label_set_text(lb, label);
    lv_obj_set_style_text_color(lb, lv_color_hex(COL_DIM), 0);
    lv_obj_set_style_text_font(lb, FONT_CAPTION, 0);
    lv_obj_align(lb, LV_ALIGN_TOP_RIGHT, 0, 0);

    int chartW = cardW - sw(44);
    int chartH = sh(14);
    lv_obj_t *ch = lv_chart_create(c);
    lv_obj_set_size(ch, chartW, chartH);
    lv_obj_align(ch, LV_ALIGN_RIGHT_MID, 0, -sh(1));
    lv_chart_set_type(ch, LV_CHART_TYPE_LINE);
    lv_chart_set_point_count(ch, 20);
    lv_chart_set_div_line_count(ch, 0, 0);
    lv_obj_set_style_bg_color(ch, lv_color_hex(color), 0);
    lv_obj_set_style_bg_opa(ch, LV_OPA_10, 0);
    lv_obj_set_style_radius(ch, 4, 0);
    lv_obj_set_style_border_width(ch, 0, 0);
    lv_obj_set_style_width(ch,  0, LV_PART_INDICATOR);
    lv_obj_set_style_height(ch, 0, LV_PART_INDICATOR);
    lv_obj_set_style_line_width(ch, sw(2), LV_PART_ITEMS);
    lv_obj_set_style_line_color(ch, lv_color_hex(color), LV_PART_ITEMS);
    lv_obj_set_style_pad_all(ch, 0, 0);
    *serOut = lv_chart_add_series(ch, lv_color_hex(color), LV_CHART_AXIS_PRIMARY_Y);
    *sparkOut = ch;

    lv_obj_t *v = lv_label_create(c);
    lv_label_set_text(v, initVal);
    lv_obj_set_style_text_color(v, lv_color_hex(color), 0);
    lv_obj_set_style_text_font(v, FONT_TITLE, 0);
    lv_obj_align(v, LV_ALIGN_BOTTOM_RIGHT, 0, sh(2));
    applyBloom(v, color);
    return v;
  };

  lblRh   = makeMiniCard(0,                     "UMIDADE", "--", COL_CYN, &ic_droplet,    &sparkRh,   &serRhS,     0);
  lblVpd  = makeMiniCard(cardH + cardGap,       "VPD",     "--", COL_RED, &ic_droplets,   &sparkVpd,  &serVpdS,  933);
  lblPpfd = makeMiniCard((cardH + cardGap) * 2, "PPFD",    "--", COL_YEL, &ic_lightbulb,  &sparkPpfd, &serPpfdS,1866);

  lv_chart_set_range(sparkRh,   LV_CHART_AXIS_PRIMARY_Y, 0, 100);
  lv_chart_set_range(sparkVpd,  LV_CHART_AXIS_PRIMARY_Y, 0, 30);     // VPD * 10 (0-3.0 kPa)
  lv_chart_set_range(sparkPpfd, LV_CHART_AXIS_PRIMARY_Y, 0, 1500);
  for (int i = 0; i < 20; i++) {
    lv_chart_set_next_value(sparkRh,   serRhS,   (int32_t)rh);
    lv_chart_set_next_value(sparkVpd,  serVpdS,  (int32_t)(vpd * 10));
    lv_chart_set_next_value(sparkPpfd, serPpfdS, (int32_t)currentPpfd);
  }

  // ═══ Strip de ciclo (fase + semana + barra) no rodape ═══
  int stripY = bodyY + bodyH + stripGap;
  lv_obj_t *strip = makeCard(tab, sw(4), stripY, SCREEN_W - sw(8), stripH);
  lv_obj_set_style_pad_hor(strip, sw(8), 0);
  lv_obj_set_style_pad_ver(strip, 0, 0);
  lv_obj_clear_flag(strip, LV_OBJ_FLAG_SCROLLABLE);

  // Pill colorida com FASE (ex: VEGA / FLORACAO)
  lv_obj_t *phasePill = lv_obj_create(strip);
  lv_obj_set_size(phasePill, sw(48), sh(16));
  lv_obj_align(phasePill, LV_ALIGN_LEFT_MID, 0, 0);
  lv_obj_set_style_bg_color(phasePill, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_bg_opa(phasePill, LV_OPA_30, 0);
  lv_obj_set_style_border_color(phasePill, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_border_width(phasePill, 1, 0);
  lv_obj_set_style_radius(phasePill, sh(8), 0);
  lv_obj_set_style_pad_all(phasePill, 0, 0);
  lv_obj_clear_flag(phasePill, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_t *phaseLbl = lv_label_create(phasePill);
  lv_label_set_text(phaseLbl, FASE);
  lv_obj_set_style_text_color(phaseLbl, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_text_font(phaseLbl, FONT_CAPTION, 0);
  lv_obj_center(phaseLbl);

  // "Sem 12 / ~16"
  char ciclBuf[32];
  snprintf(ciclBuf, sizeof(ciclBuf), "Sem %d / ~%d", semana, totalSem);
  lblCiclo = makeLabel(strip, ciclBuf, COL_TEXT, FONT_BODY,
                       LV_ALIGN_LEFT_MID, sw(56), 0);

  // "~N restantes" a direita
  char restBuf[24];
  int rest = (totalSem > semana) ? (totalSem - semana) : 0;
  snprintf(restBuf, sizeof(restBuf), "~%d restantes", rest);
  makeLabel(strip, restBuf, COL_DIM, FONT_CAPTION,
            LV_ALIGN_RIGHT_MID, 0, 0);

  // Barra de progresso do ciclo — linha fina alinhada no rodape do strip
  ciclBar = lv_bar_create(strip);
  lv_obj_set_size(ciclBar, SCREEN_W - sw(24), sh(3));
  lv_obj_align(ciclBar, LV_ALIGN_BOTTOM_MID, 0, -sh(2));
  lv_bar_set_range(ciclBar, 0, totalSem > 0 ? totalSem : 1);
  lv_bar_set_value(ciclBar, semana, LV_ANIM_OFF);
  lv_obj_set_style_bg_color(ciclBar, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_bg_opa(ciclBar, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(ciclBar, sh(2), 0);
  lv_obj_set_style_bg_color(ciclBar, lv_color_hex(COL_GRN), LV_PART_INDICATOR);
  lv_obj_set_style_radius(ciclBar, sh(2), LV_PART_INDICATOR);
}

static void refreshHomeValues() {
  char buf[24];
  snprintf(buf, sizeof(buf), "%.1f", tempC);
  lv_label_set_text(lblTemp, buf);
  lv_obj_set_style_text_color(lblTemp, lv_color_hex(cTemp(tempC)), 0);
  if (arcTemp) lv_arc_set_value(arcTemp, (int)tempC);

  snprintf(buf, sizeof(buf), "%.0f%%", rh);
  lv_label_set_text(lblRh, buf);
  lv_obj_set_style_text_color(lblRh, lv_color_hex(cRH(rh)), 0);

  // VPD calculado via Tetens (0.6108 * e^(17.27T/(T+237.3)) * (1-RH/100)).
  // Mantem paridade com a conta do web app; alimenta o mock timer.
  if (lblVpd) {
    snprintf(buf, sizeof(buf), "%.2f", vpd);
    lv_label_set_text(lblVpd, buf);
  }

  if (lblPpfd) {
    snprintf(buf, sizeof(buf), "%d", currentPpfd);
    lv_label_set_text(lblPpfd, buf);
  }
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
  }
  if (sparkVpd && serVpdS) {
    lv_chart_set_next_value(sparkVpd, serVpdS, (int32_t)((vpd + wave * 0.03f) * 10));
  }
  if (sparkPpfd && serPpfdS) {
    lv_chart_set_next_value(sparkPpfd, serPpfdS, (int32_t)(currentPpfd + wave * 12));
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
  printf("[sim] lux salvo: %d PPFD\n", targetPpfd);
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
  applyBloom(lblLuxValue, COL_GRN);

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
    applyBloom(v, color);
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
    printf("[sim] pH/EC salvo: pH=%.1f EC=%.1f\n", phv, ecv);
  }, LV_EVENT_CLICKED, NULL);
  makeLabel(btnSave, "SALVAR", COL_TEXT, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  refreshPhEcDisplay();
}

// ════════════════════════════════════════════════════════════════════════════════
// Tela Tarefas — lista com checkbox + texto, mockada
// ════════════════════════════════════════════════════════════════════════════════
struct SimTarefa { const char *texto; bool feito; };
static SimTarefa simTarefas[] = {
  {"Regar plantas da area 1",     true},
  {"Trocar solucao nutriente",    false},
  {"Verificar pH da reserva",     true},
  {"Podar folhas baixas",         false},
  {"Calibrar sensor de EC",       false},
  {"Checar temperatura noturna",  true},
};
static lv_obj_t *lblTarefaCount = nullptr;

static void updateTarefaCount() {
  if (!lblTarefaCount) return;
  int feitas = 0;
  int total = sizeof(simTarefas) / sizeof(simTarefas[0]);
  for (int i = 0; i < total; i++) if (simTarefas[i].feito) feitas++;
  char buf[16];
  snprintf(buf, sizeof(buf), "%d / %d", feitas, total);
  lv_label_set_text(lblTarefaCount, buf);
}

static void tarefaToggleCb(lv_event_t *e) {
  int idx = (int)(intptr_t)lv_event_get_user_data(e);
  simTarefas[idx].feito = !simTarefas[idx].feito;
  lv_obj_t *row = (lv_obj_t*)lv_event_get_target(e);
  lv_obj_t *chk = lv_obj_get_child(row, 0);
  lv_obj_t *txt = lv_obj_get_child(row, 1);
  lv_label_set_text(chk, simTarefas[idx].feito ? LV_SYMBOL_OK : LV_SYMBOL_MINUS);
  lv_obj_set_style_text_color(chk,
    lv_color_hex(simTarefas[idx].feito ? COL_GRN : COL_DIM), 0);
  lv_obj_set_style_text_color(txt,
    lv_color_hex(simTarefas[idx].feito ? COL_DIM : COL_TEXT), 0);
  // contraste melhor: linha feita tem bg mais escuro (nao so texto dim)
  lv_obj_set_style_bg_opa(row, simTarefas[idx].feito ? LV_OPA_40 : LV_OPA_COVER, 0);
  updateTarefaCount();
}

static void buildTarefas(lv_obj_t *tab) {
  lv_obj_set_style_pad_all(tab, 0, 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_bg_color(tab, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_opa(tab, LV_OPA_COVER, 0);

  lv_obj_t *hdrIcon = lv_image_create(tab);
  lv_image_set_src(hdrIcon, &ic_tasks);
  lv_obj_set_style_image_recolor(hdrIcon, lv_color_hex(COL_YEL), 0);
  lv_obj_set_style_image_recolor_opa(hdrIcon, LV_OPA_COVER, 0);
  lv_obj_align(hdrIcon, LV_ALIGN_TOP_LEFT, sw(4), sh(2));
  makeLabel(tab, "TAREFAS", COL_TEXT, FONT_TITLE, LV_ALIGN_TOP_LEFT, sw(38), sh(4));

  // Contador de tarefas no header direito
  int feitas = 0;
  int total = sizeof(simTarefas) / sizeof(simTarefas[0]);
  for (int i = 0; i < total; i++) if (simTarefas[i].feito) feitas++;
  char cntBuf[16];
  snprintf(cntBuf, sizeof(cntBuf), "%d / %d", feitas, total);
  lblTarefaCount = makeLabel(tab, cntBuf, COL_YEL, FONT_CAPTION, LV_ALIGN_TOP_RIGHT, -sw(6), sh(6));

  lv_obj_t *list = lv_obj_create(tab);
  lv_obj_set_size(list, SCREEN_W - sw(12), TAB_H - sh(34));
  lv_obj_align(list, LV_ALIGN_TOP_MID, 0, sh(28));
  lv_obj_set_style_bg_opa(list, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(list, 0, 0);
  lv_obj_set_style_pad_all(list, sw(2), 0);
  lv_obj_set_flex_flow(list, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(list, sh(6), 0);

  for (int i = 0; i < total; i++) {
    lv_obj_t *row = lv_obj_create(list);
    lv_obj_set_width(row, lv_pct(100));
    lv_obj_set_height(row, sh(34));  // >= 44px @ 480x320 p/ touch confortavel
    lv_obj_set_style_bg_color(row, lv_color_hex(COL_CARD), 0);
    lv_obj_set_style_bg_opa(row,
      simTarefas[i].feito ? LV_OPA_40 : LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(row, lv_color_hex(COL_BORDER), 0);
    lv_obj_set_style_border_width(row, 1, 0);
    lv_obj_set_style_radius(row, CARD_RADIUS, 0);
    lv_obj_set_style_pad_hor(row, sw(10), 0);
    lv_obj_set_style_pad_ver(row, 0, 0);
    lv_obj_clear_flag(row, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(row, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(row, tarefaToggleCb, LV_EVENT_CLICKED, (void*)(intptr_t)i);

    lv_obj_t *chk = lv_label_create(row);
    lv_label_set_text(chk, simTarefas[i].feito ? LV_SYMBOL_OK : LV_SYMBOL_MINUS);
    lv_obj_set_style_text_color(chk,
      lv_color_hex(simTarefas[i].feito ? COL_GRN : COL_DIM), 0);
    lv_obj_set_style_text_font(chk, &lv_font_montserrat_14, 0);
    lv_obj_align(chk, LV_ALIGN_LEFT_MID, 0, 0);

    lv_obj_t *txt = lv_label_create(row);
    lv_label_set_text(txt, simTarefas[i].texto);
    lv_obj_set_style_text_color(txt,
      lv_color_hex(simTarefas[i].feito ? COL_DIM : COL_TEXT), 0);
    lv_obj_set_style_text_font(txt, FONT_BODY, 0);
    lv_obj_align(txt, LV_ALIGN_LEFT_MID, sw(24), 0);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// Tela Historico — chart + botoes de metrica (temp/rh/ph/ec) e periodo
// ════════════════════════════════════════════════════════════════════════════════
static lv_obj_t *histChart = nullptr;
static lv_chart_series_t *histSer = nullptr;
static int histMetric = 0;  // 0=temp, 1=rh, 2=ph, 3=ec

static const struct {
  const char *name;
  uint32_t color;
  int ymin, ymax;
  float base, amp;
} HIST_METRICS[4] = {
  {"TEMP", COL_GRN, 15, 32,  24.0f, 3.0f},
  {"UMID", COL_CYN, 40, 85,  62.0f, 8.0f},
  {"pH",   COL_GRN, 40, 90,  62.0f, 5.0f},   // pH * 10
  {"EC",   COL_PRP,  0, 40,  18.0f, 4.0f},   // EC * 10
};

static void applyHistData() {
  if (!histChart || !histSer) return;
  auto &m = HIST_METRICS[histMetric];
  lv_chart_set_range(histChart, LV_CHART_AXIS_PRIMARY_Y, m.ymin, m.ymax);
  lv_obj_set_style_line_color(histChart, lv_color_hex(m.color), LV_PART_ITEMS);
  lv_obj_set_style_bg_color(histChart, lv_color_hex(m.color), LV_PART_INDICATOR);
  for (int i = 0; i < 24; i++) {
    float v = m.base + sinf(i * 0.35f + histMetric) * m.amp
              + ((rand() % 100) - 50) / 100.0f * m.amp * 0.3f;
    lv_chart_set_next_value(histChart, histSer, (int32_t)v);
  }
}

static lv_obj_t *histMetricBtns[4] = {nullptr};

static void histMetricCb(lv_event_t *e) {
  int idx = (int)(intptr_t)lv_event_get_user_data(e);
  histMetric = idx;
  for (int i = 0; i < 4; i++) {
    bool sel = (i == idx);
    lv_obj_set_style_bg_color(histMetricBtns[i],
      lv_color_hex(sel ? HIST_METRICS[i].color : COL_CARD), 0);
    lv_obj_set_style_border_color(histMetricBtns[i],
      lv_color_hex(sel ? HIST_METRICS[i].color : COL_BORDER), 0);
    lv_obj_t *lbl = lv_obj_get_child(histMetricBtns[i], 0);
    if (lbl) lv_obj_set_style_text_color(lbl,
      lv_color_hex(sel ? COL_TEXT : COL_DIM), 0);
  }
  applyHistData();
}

static void buildHistorico(lv_obj_t *tab) {
  lv_obj_set_style_pad_all(tab, 0, 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_bg_color(tab, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_opa(tab, LV_OPA_COVER, 0);

  lv_obj_t *hdrIcon = lv_image_create(tab);
  lv_image_set_src(hdrIcon, &ic_activity);
  lv_obj_set_style_image_recolor(hdrIcon, lv_color_hex(COL_CYN), 0);
  lv_obj_set_style_image_recolor_opa(hdrIcon, LV_OPA_COVER, 0);
  lv_obj_align(hdrIcon, LV_ALIGN_TOP_LEFT, sw(4), sh(2));
  makeLabel(tab, "HISTORICO", COL_TEXT, FONT_TITLE, LV_ALIGN_TOP_LEFT, sw(38), sh(4));
  makeLabel(tab, "ultimas 24h", COL_DIM, FONT_CAPTION, LV_ALIGN_TOP_RIGHT, -sw(6), sh(8));

  // Chart
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
  lv_obj_set_style_radius(histChart, 8, 0);
  lv_obj_set_style_line_color(histChart, lv_color_hex(COL_BORDER), LV_PART_MAIN);
  lv_obj_set_style_line_width(histChart, sw(2), LV_PART_ITEMS);
  lv_obj_set_style_width(histChart,  0, LV_PART_INDICATOR);
  lv_obj_set_style_height(histChart, 0, LV_PART_INDICATOR);
  lv_obj_set_style_pad_all(histChart, sw(6), 0);
  histSer = lv_chart_add_series(histChart, lv_color_hex(COL_GRN), LV_CHART_AXIS_PRIMARY_Y);

  // Botoes de metrica (bottom) — so o ativo acende; inativos ficam "neutros"
  // com border COL_BORDER e texto COL_DIM, senao todos parecem selecionados.
  int btnGap = sw(8);
  int btnW = (SCREEN_W - sw(16) - btnGap * 3) / 4;
  for (int i = 0; i < 4; i++) {
    bool sel = (i == 0);
    lv_obj_t *btn = lv_btn_create(tab);
    lv_obj_set_size(btn, btnW, btnH);
    lv_obj_align(btn, LV_ALIGN_BOTTOM_LEFT,
                 sw(8) + i * (btnW + btnGap), -sh(6));
    lv_obj_set_style_bg_color(btn,
      lv_color_hex(sel ? HIST_METRICS[i].color : COL_CARD), 0);
    lv_obj_set_style_border_color(btn,
      lv_color_hex(sel ? HIST_METRICS[i].color : COL_BORDER), 0);
    lv_obj_set_style_border_width(btn, 1, 0);
    lv_obj_set_style_radius(btn, sh(8), 0);
    lv_obj_set_style_shadow_width(btn, 0, 0);
    lv_obj_add_event_cb(btn, histMetricCb, LV_EVENT_CLICKED, (void*)(intptr_t)i);
    lv_obj_t *lbl = makeLabel(btn, HIST_METRICS[i].name,
                              sel ? COL_TEXT : COL_DIM,
                              FONT_CAPTION, LV_ALIGN_CENTER, 0, 0);
    (void)lbl;
    histMetricBtns[i] = btn;
  }

  applyHistData();
}

// ════════════════════════════════════════════════════════════════════════════════
// Navbar + troca de tela (fade) — identico ao main_lvgl.cpp
// ════════════════════════════════════════════════════════════════════════════════
static void navSetActive(int idx) {
  for (int i = 0; i < 5; i++) {
    bool sel = (i == idx);
    lv_obj_set_style_image_recolor(navIcons[i],
      lv_color_hex(sel ? NAV_COLORS[i] : COL_DIM), 0);
    lv_obj_set_style_image_recolor_opa(navIcons[i], LV_OPA_COVER, 0);
  }
}

static void switchScreen(int idx) {
  if (idx == activeScreen) return;
  lv_obj_t *screens[5] = {
    screenHome, screenLux, screenPhEc, screenTarefa, screenGrafic
  };
  if (idx < 0 || idx >= 5) return;

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
  lv_obj_set_style_bg_color(navbar, lv_color_hex(0x0A0F17), 0);
  lv_obj_set_style_bg_opa(navbar, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(navbar, lv_color_hex(COL_BORDER), 0);
  lv_obj_set_style_border_width(navbar, 1, 0);
  lv_obj_set_style_border_side(navbar, LV_BORDER_SIDE_TOP, 0);
  lv_obj_set_style_radius(navbar, 0, 0);
  lv_obj_set_style_pad_all(navbar, 0, 0);
  lv_obj_clear_flag(navbar, LV_OBJ_FLAG_SCROLLABLE);

  int btnW = SCREEN_W / 5;
  for (int i = 0; i < 5; i++) {
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

// ════════════════════════════════════════════════════════════════════════════════
// Timer de mock: varia tempC/rh/ph/ec em ondas senoidais — UI fica "viva"
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
  screenLux    = makeScreen();
  screenPhEc   = makeScreen();
  screenTarefa = makeScreen();
  screenGrafic = makeScreen();

  buildHome(screenHome);
  buildLux(screenLux);
  buildPhEc(screenPhEc);
  buildTarefas(screenTarefa);
  buildHistorico(screenGrafic);

  lv_obj_clear_flag(screenHome, LV_OBJ_FLAG_HIDDEN);
  buildNavbar(scr);

  refreshHomeValues();

  pulseTimer = lv_timer_create(pulseTimerCb, 300, NULL);
  mockTimer  = lv_timer_create(mockTimerCb,  500, NULL);
}
