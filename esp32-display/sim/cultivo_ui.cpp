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
static const int TABBAR_H = 44;
static const int TAB_H    = SCREEN_H - TABBAR_H;

#define FONT_VALUE   (&manrope_bold_40)
#define FONT_TITLE   (&manrope_bold_24)
#define FONT_BODY    (&manrope_sb_18)
#define FONT_CAPTION (&manrope_sb_14)

// Escala relativa ao design Wokwi 320x240 (mesma semantica do firmware)
static inline int sw(int v) { return (v * SCREEN_W) / 320; }
static inline int sh(int v) { return (v * SCREEN_H) / 240; }

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
static lv_obj_t *lblTemp, *lblRh, *lblPh, *lblEc;
static lv_obj_t *arcTemp;
static lv_obj_t *sparkRh, *sparkPh, *sparkEc;
static lv_chart_series_t *serRhS, *serPhS, *serEcS;
static lv_timer_t *pulseTimer = nullptr;
static lv_timer_t *mockTimer  = nullptr;

static lv_obj_t *lblLuxValue, *lblLuxUnit;
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

static void applyRingPulse(lv_obj_t *card, uint32_t color, uint32_t periodMs = 2800) {
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

  // Corpo: arc grande a esquerda + coluna de mini-cards a direita
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
  lv_obj_clear_flag(arcTemp, LV_OBJ_FLAG_CLICKABLE);
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
                          lv_obj_t **sparkOut, lv_chart_series_t **serOut) -> lv_obj_t* {
    lv_obj_t *c = makeCard(tab, rightX, bodyY + yOffset, cardW, cardH);
    lv_obj_set_style_pad_all(c, sw(4), 0);
    applyRingPulse(c, color);

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

  lblRh = makeMiniCard(0,                     "UMIDADE", "--", COL_CYN, &ic_droplet,   &sparkRh, &serRhS);
  lblPh = makeMiniCard(cardH + cardGap,       "pH",      "--", COL_GRN, &ic_beaker,    &sparkPh, &serPhS);
  lblEc = makeMiniCard((cardH + cardGap) * 2, "EC",      "--", COL_PRP, &ic_test_tube, &sparkEc, &serEcS);

  lv_chart_set_range(sparkRh, LV_CHART_AXIS_PRIMARY_Y, 0, 100);
  lv_chart_set_range(sparkPh, LV_CHART_AXIS_PRIMARY_Y, 40, 90);
  lv_chart_set_range(sparkEc, LV_CHART_AXIS_PRIMARY_Y, 0, 40);
  for (int i = 0; i < 20; i++) {
    lv_chart_set_next_value(sparkRh, serRhS, (int32_t)rh);
    lv_chart_set_next_value(sparkPh, serPhS, (int32_t)(phv * 10));
    lv_chart_set_next_value(sparkEc, serEcS, (int32_t)(ecv * 10));
  }
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

  snprintf(buf, sizeof(buf), "%.1f", phv);
  lv_label_set_text(lblPh, buf);

  snprintf(buf, sizeof(buf), "%.1f", ecv);
  lv_label_set_text(lblEc, buf);
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
  if (sparkPh && serPhS) {
    lv_chart_set_next_value(sparkPh, serPhS, (int32_t)((phv + wave * 0.05f) * 10));
  }
  if (sparkEc && serEcS) {
    lv_chart_set_next_value(sparkEc, serEcS, (int32_t)((ecv + wave * 0.03f) * 10));
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

  lv_obj_t *hdrIcon = lv_image_create(tab);
  lv_image_set_src(hdrIcon, &ic_lightbulb);
  lv_obj_set_style_image_recolor(hdrIcon, lv_color_hex(COL_YEL), 0);
  lv_obj_set_style_image_recolor_opa(hdrIcon, LV_OPA_COVER, 0);
  lv_obj_align(hdrIcon, LV_ALIGN_TOP_LEFT, sw(4), sh(2));

  makeLabel(tab, "LUX / PPFD", COL_TEXT, FONT_TITLE, LV_ALIGN_TOP_LEFT, sw(38), sh(4));

  // Toggle PPFD/LUX
  int toggleY = sh(4);
  btnModePpfd = lv_btn_create(tab);
  lv_obj_set_size(btnModePpfd, sw(60), sh(22));
  lv_obj_align(btnModePpfd, LV_ALIGN_TOP_RIGHT, -sw(66), toggleY);
  lv_obj_set_style_bg_color(btnModePpfd, lv_color_hex(COL_GRN), 0);
  lv_obj_add_event_cb(btnModePpfd, [](lv_event_t *e) {
    (void)e; luxMode = 0; refreshLuxDisplay();
  }, LV_EVENT_CLICKED, NULL);
  makeLabel(btnModePpfd, "PPFD", COL_TEXT, FONT_CAPTION, LV_ALIGN_CENTER, 0, 0);

  btnModeLux = lv_btn_create(tab);
  lv_obj_set_size(btnModeLux, sw(60), sh(22));
  lv_obj_align(btnModeLux, LV_ALIGN_TOP_RIGHT, -sw(4), toggleY);
  lv_obj_set_style_bg_color(btnModeLux, lv_color_hex(COL_CARD), 0);
  lv_obj_add_event_cb(btnModeLux, [](lv_event_t *e) {
    (void)e; luxMode = 1; refreshLuxDisplay();
  }, LV_EVENT_CLICKED, NULL);
  makeLabel(btnModeLux, "LUX", COL_TEXT, FONT_CAPTION, LV_ALIGN_CENTER, 0, 0);

  // Valor grande
  int valueY = sh(48);
  lblLuxValue = lv_label_create(tab);
  lv_label_set_text(lblLuxValue, "0");
  lv_obj_set_style_text_font(lblLuxValue, FONT_VALUE, 0);
  lv_obj_set_style_text_color(lblLuxValue, lv_color_hex(COL_GRN), 0);
  lv_obj_align(lblLuxValue, LV_ALIGN_TOP_MID, 0, valueY);
  applyBloom(lblLuxValue, COL_GRN);

  lblLuxUnit = lv_label_create(tab);
  lv_label_set_text(lblLuxUnit, "umol/s.m²");
  lv_obj_set_style_text_font(lblLuxUnit, FONT_CAPTION, 0);
  lv_obj_set_style_text_color(lblLuxUnit, lv_color_hex(COL_DIM), 0);
  lv_obj_align(lblLuxUnit, LV_ALIGN_TOP_MID, 0, valueY + sh(40));

  // Botoes - / +
  int ctlY = valueY + sh(60);
  int btnSize = sh(38);
  lv_obj_t *btnMinus = lv_btn_create(tab);
  lv_obj_set_size(btnMinus, btnSize, btnSize);
  lv_obj_align(btnMinus, LV_ALIGN_TOP_MID, -sw(60), ctlY);
  lv_obj_set_style_radius(btnMinus, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_color(btnMinus, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_border_color(btnMinus, lv_color_hex(COL_RED), 0);
  lv_obj_set_style_border_width(btnMinus, 2, 0);
  lv_obj_add_event_cb(btnMinus, luxStepCb, LV_EVENT_CLICKED,
                      (void*)(intptr_t)(-STEP_PPFD));
  makeLabel(btnMinus, "-", COL_RED, FONT_VALUE, LV_ALIGN_CENTER, 0, -sh(4));

  lv_obj_t *btnPlus = lv_btn_create(tab);
  lv_obj_set_size(btnPlus, btnSize, btnSize);
  lv_obj_align(btnPlus, LV_ALIGN_TOP_MID, sw(60), ctlY);
  lv_obj_set_style_radius(btnPlus, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_color(btnPlus, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_border_color(btnPlus, lv_color_hex(COL_GRN), 0);
  lv_obj_set_style_border_width(btnPlus, 2, 0);
  lv_obj_add_event_cb(btnPlus, luxStepCb, LV_EVENT_CLICKED,
                      (void*)(intptr_t)(+STEP_PPFD));
  makeLabel(btnPlus, "+", COL_GRN, FONT_VALUE, LV_ALIGN_CENTER, 0, -sh(4));

  // SALVAR
  lv_obj_t *btnSave = lv_btn_create(tab);
  lv_obj_set_size(btnSave, sw(120), sh(24));
  lv_obj_align(btnSave, LV_ALIGN_TOP_MID, 0, ctlY + btnSize + sh(6));
  lv_obj_set_style_bg_color(btnSave, lv_color_hex(COL_GRN), 0);
  applyBloom(btnSave, COL_GRN);
  lv_obj_add_event_cb(btnSave, luxSaveCb, LV_EVENT_CLICKED, NULL);
  makeLabel(btnSave, "SALVAR", COL_TEXT, FONT_BODY, LV_ALIGN_CENTER, 0, 0);

  refreshLuxDisplay();
}

// ════════════════════════════════════════════════════════════════════════════════
// Stubs das telas restantes (pH/EC, Tarefas, Grafico) — placeholder pra ter
// algo renderizavel e navegacao funcional. Portavel conforme evoluir.
// ════════════════════════════════════════════════════════════════════════════════
static void buildPlaceholder(lv_obj_t *tab, const char *titulo,
                              const lv_image_dsc_t *icon, uint32_t color,
                              const char *descricao) {
  lv_obj_set_style_pad_all(tab, 0, 0);
  lv_obj_clear_flag(tab, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_bg_color(tab, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_opa(tab, LV_OPA_COVER, 0);

  lv_obj_t *ico = lv_image_create(tab);
  lv_image_set_src(ico, icon);
  lv_obj_set_style_image_recolor(ico, lv_color_hex(color), 0);
  lv_obj_set_style_image_recolor_opa(ico, LV_OPA_COVER, 0);
  lv_obj_align(ico, LV_ALIGN_CENTER, 0, -sh(40));

  makeLabel(tab, titulo, color, FONT_TITLE, LV_ALIGN_CENTER, 0, -sh(5));
  makeLabel(tab, descricao, COL_DIM, FONT_CAPTION, LV_ALIGN_CENTER, 0, sh(20));
  makeLabel(tab, "(stub do simulador)", COL_DIM, FONT_CAPTION,
            LV_ALIGN_CENTER, 0, sh(42));
}

static void buildPhEc(lv_obj_t *tab) {
  buildPlaceholder(tab, "pH / EC", &ic_flask, COL_PRP,
                   "Entrada manual pelo teclado numerico");
}

static void buildTarefas(lv_obj_t *tab) {
  buildPlaceholder(tab, "Tarefas", &ic_tasks, COL_YEL,
                   "Lista de tarefas do ciclo");
}

static void buildHistorico(lv_obj_t *tab) {
  buildPlaceholder(tab, "Historico", &ic_activity, COL_CYN,
                   "Graficos de 24h / 7d / 30d");
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
  vpd   = 1.1f  + w2 * 0.15f;

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
