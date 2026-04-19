#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <Fonts/FreeSans9pt7b.h>
#include <Fonts/FreeSansBold12pt7b.h>
#include <Fonts/FreeSansBold24pt7b.h>

// ── Pinos ──────────────────────────────────────────────────────────────────────
#define TFT_DC 2
#define TFT_CS 15
#define FT_ADDR 0x38        // endereco I2C do FT6206 (touch)

Adafruit_ILI9341 tft(TFT_CS, TFT_DC);

// ── Cores RGB565 (espelha DisplayMode.tsx) ─────────────────────────────────────
#define BLACK  0x0000
#define WHITE  0xFFFF
#define C_CARD 0x1082
#define C_DIM  0x6B6D
#define C_BORD 0x2965
#define C_GRN  0x26EC   // #4ADE80
#define C_YEL  0xFE83   // #FBBF24
#define C_RED  0xFBEE   // #F87171
#define C_CYN  0x26F9   // #2DD4BF
#define C_PRP  0xA475   // #A78BFA
#define C_BLU  0x4B5F

// ── Layout (calculado dinamicamente a partir de tft.width()/height()) ──────────
int W = 320;
int H = 240;
int NAV_Y = 196;
int NAV_H = 44;
int BTN_W = 80;

// Posicoes derivadas (calculadas em setup apos conhecer W/H)
int HDR_H    = 34;   // altura do cabecalho
int R1_Y     = 38;   // inicio row 1
int R1_H     = 78;   // altura row 1 (TEMP + UMIDADE)
int R2_Y     = 120;  // inicio row 2
int R2_H     = 52;   // altura row 2 (VPD + pH + EC)
int BAR_Y    = 177;  // barra de progresso

// ── Telas ──────────────────────────────────────────────────────────────────────
enum Tela { S_HOME, S_REGUEI, S_PHEC, S_TAREFAS };
Tela telaAtual = S_HOME;

// ── Dados mock (substituidos por fetch WiFi na Fase D) ─────────────────────────
const char* TENT = "ESTUFA 1";
float tempC = 24.5f, rh = 62.0f, vpd = 1.1f, ph = 6.2f, ec = 1.8f;
const char* FASE = "FLORACAO";
int semana = 4, totalSem = 16;
float litros = 1.0f;

// ── Cores por valor ────────────────────────────────────────────────────────────
uint16_t cTemp(float t) { return (t < 18 || t > 32) ? C_RED : (t > 28) ? C_YEL : C_GRN; }
uint16_t cRH(float r)   { return (r < 40 || r > 80) ? C_RED : (r > 70) ? C_YEL : C_CYN; }
uint16_t cVPD(float v)  { return v < 0.4 ? C_BLU : v <= 0.8 ? C_GRN : v <= 1.2 ? C_PRP : v <= 1.6 ? C_YEL : C_RED; }

// ── Helpers de desenho ─────────────────────────────────────────────────────────
void card(int x, int y, int w, int h, uint16_t bg = C_CARD) {
  tft.fillRoundRect(x, y, w, h, 6, bg);
}

void textC(int cx, int cy, const char* s, const GFXfont* f, uint16_t col) {
  tft.setFont(f); tft.setTextColor(col, BLACK);
  int16_t x1, y1; uint16_t tw, th;
  tft.getTextBounds(s, 0, 0, &x1, &y1, &tw, &th);  // baseline em 0 (nao 100)
  tft.setCursor(cx - tw / 2 - x1, cy - th / 2 - y1);
  tft.print(s);
}

void textL(int x, int y, const char* s, const GFXfont* f, uint16_t col) {
  tft.setFont(f); tft.setTextColor(col, BLACK);
  tft.setCursor(x, y); tft.print(s);
}

// ── Touch via I2C direto (sem lib Adafruit_FT6206) ─────────────────────────────
bool ftLer(int &rx, int &ry) {
  Wire.beginTransmission(FT_ADDR);
  Wire.write(0x02);
  if (Wire.endTransmission(false) != 0) return false;
  Wire.requestFrom(FT_ADDR, 5);
  if (Wire.available() < 5) return false;
  uint8_t toques = Wire.read();
  uint8_t xh = Wire.read(), xl = Wire.read();
  uint8_t yh = Wire.read(), yl = Wire.read();
  if (toques == 0 || toques > 2) return false;
  rx = ((xh & 0x0F) << 8) | xl;
  ry = ((yh & 0x0F) << 8) | yl;
  return true;
}

// ── Barra de navegacao ─────────────────────────────────────────────────────────
const char*    NAV_NOMES[] = { "INICIO", "REGUEI", "pH/EC", "TAREFAS" };
const uint16_t NAV_CORES[] = { C_DIM, C_BLU, C_CYN, C_GRN };

void drawNav(Tela ativa) {
  tft.fillRect(0, NAV_Y, W, NAV_H, 0x0821);
  tft.drawFastHLine(0, NAV_Y, W, C_BORD);
  for (int i = 0; i < 4; i++) {
    int bx = i * BTN_W;
    bool sel = (i == (int)ativa);
    tft.fillRect(bx + 1, NAV_Y + 1, BTN_W - 2, NAV_H - 2, sel ? 0x2104 : BLACK);
    if (i > 0) tft.drawFastVLine(bx, NAV_Y + 1, NAV_H - 1, C_BORD);
    textC(bx + BTN_W / 2, NAV_Y + NAV_H / 2, NAV_NOMES[i],
          &FreeSans9pt7b, sel ? NAV_CORES[i] : C_DIM);
  }
}

// ── Tela HOME ──────────────────────────────────────────────────────────────────
void drawHome() {
  tft.fillRect(0, 0, W, NAV_Y, BLACK);
  char buf[24];

  // Cabecalho
  textL(6, 16, TENT, &FreeSansBold12pt7b, WHITE);
  snprintf(buf, sizeof(buf), "Sem %d/%d  %s", semana, totalSem, FASE);
  textL(6, 30, buf, &FreeSans9pt7b, C_PRP);

  // Row 1 — TEMP + UMIDADE (grandes)
  int c1w = (W - 12) / 2;               // 2 cards com 4px de margem cada
  card(4, R1_Y, c1w, R1_H);
  textL(12, R1_Y + 14, "TEMP", &FreeSans9pt7b, C_DIM);
  dtostrf(tempC, 4, 1, buf); strcat(buf, "o");
  textC(4 + c1w / 2, R1_Y + R1_H / 2 + 8, buf, &FreeSansBold24pt7b, cTemp(tempC));

  card(8 + c1w, R1_Y, c1w, R1_H);
  textL(16 + c1w, R1_Y + 14, "UMIDADE", &FreeSans9pt7b, C_DIM);
  dtostrf(rh, 4, 0, buf); strcat(buf, "%");
  textC(8 + c1w + c1w / 2, R1_Y + R1_H / 2 + 8, buf, &FreeSansBold24pt7b, cRH(rh));

  // Row 2 — VPD + pH + EC (medios)
  int c2w = (W - 16) / 3;               // 3 cards
  int x = 4;
  card(x, R2_Y, c2w, R2_H);
  textL(x + 6, R2_Y + 13, "VPD kPa", &FreeSans9pt7b, C_DIM);
  dtostrf(vpd, 3, 2, buf);
  textC(x + c2w / 2, R2_Y + R2_H / 2 + 8, buf, &FreeSansBold12pt7b, cVPD(vpd));

  x += c2w + 4;
  card(x, R2_Y, c2w, R2_H);
  textL(x + 6, R2_Y + 13, "pH", &FreeSans9pt7b, C_DIM);
  dtostrf(ph, 3, 1, buf);
  textC(x + c2w / 2, R2_Y + R2_H / 2 + 8, buf, &FreeSansBold12pt7b, C_GRN);

  x += c2w + 4;
  card(x, R2_Y, c2w, R2_H);
  textL(x + 6, R2_Y + 13, "EC mS/cm", &FreeSans9pt7b, C_DIM);
  dtostrf(ec, 3, 1, buf);
  textC(x + c2w / 2, R2_Y + R2_H / 2 + 8, buf, &FreeSansBold12pt7b, C_CYN);

  // Barra de progresso do ciclo
  tft.fillRoundRect(4, BAR_Y, W - 8, 5, 2, C_BORD);
  tft.fillRoundRect(4, BAR_Y, (int)((float)semana / totalSem * (W - 8)), 5, 2, C_PRP);

  drawNav(S_HOME);
}

// ── Zonas touch da tela REGUEI (calculadas em drawReguei, usadas em onTouch) ───
int RG_MINUS_X, RG_MINUS_Y, RG_MINUS_W = 65, RG_MINUS_H = 44;
int RG_PLUS_X,  RG_PLUS_Y;
int RG_SAVE_X,  RG_SAVE_Y,  RG_SAVE_W  = 140, RG_SAVE_H  = 24;

// ── Tela REGUEI ────────────────────────────────────────────────────────────────
void drawReguei() {
  tft.fillRect(0, 0, W, NAV_Y, BLACK);
  char buf[24];

  textC(W / 2, 20, "REGA",                       &FreeSansBold12pt7b, WHITE);
  textC(W / 2, 40, "Quantos litros voce regou?", &FreeSans9pt7b,      C_DIM);

  // Card com volume
  int volW = 160, volH = 58, volX = (W - volW) / 2, volY = 50;
  card(volX, volY, volW, volH);
  dtostrf(litros, 4, 1, buf); strcat(buf, " L");
  textC(W / 2, volY + volH / 2 + 6, buf, &FreeSansBold24pt7b, C_CYN);

  // Botoes - / +
  RG_MINUS_Y = volY + volH + 10;
  RG_MINUS_X = 16;
  RG_PLUS_X  = W - 16 - RG_MINUS_W;
  RG_PLUS_Y  = RG_MINUS_Y;

  card(RG_MINUS_X, RG_MINUS_Y, RG_MINUS_W, RG_MINUS_H, C_BORD);
  textC(RG_MINUS_X + RG_MINUS_W / 2, RG_MINUS_Y + RG_MINUS_H / 2 + 6, "-", &FreeSansBold24pt7b, C_RED);

  card(RG_PLUS_X, RG_PLUS_Y, RG_MINUS_W, RG_MINUS_H, C_BORD);
  textC(RG_PLUS_X + RG_MINUS_W / 2, RG_PLUS_Y + RG_MINUS_H / 2 + 6, "+", &FreeSansBold24pt7b, C_GRN);

  textC(W / 2, RG_MINUS_Y + RG_MINUS_H / 2, "passo 0.5 L", &FreeSans9pt7b, C_DIM);

  // Botao SALVAR
  RG_SAVE_X = (W - RG_SAVE_W) / 2;
  RG_SAVE_Y = NAV_Y - RG_SAVE_H - 4;
  card(RG_SAVE_X, RG_SAVE_Y, RG_SAVE_W, RG_SAVE_H, 0x0180);
  tft.drawRoundRect(RG_SAVE_X, RG_SAVE_Y, RG_SAVE_W, RG_SAVE_H, 6, C_GRN);
  textC(W / 2, RG_SAVE_Y + RG_SAVE_H / 2 + 4, "SALVAR", &FreeSans9pt7b, C_GRN);

  drawNav(S_REGUEI);
}

// ── Placeholder (Fase C) ───────────────────────────────────────────────────────
void drawPlaceholder(const char* titulo, Tela s) {
  tft.fillRect(0, 0, W, NAV_Y, BLACK);
  textC(W / 2, NAV_Y / 2 - 15, titulo,        &FreeSansBold12pt7b, WHITE);
  textC(W / 2, NAV_Y / 2 + 15, "Em breve...", &FreeSans9pt7b,      C_DIM);
  drawNav(s);
}

// ── Roteamento de toque ────────────────────────────────────────────────────────
void onTouch(int tx, int ty) {
  Serial.printf("touch screen(%d,%d)\n", tx, ty);

  if (ty >= NAV_Y) {
    int btn = tx / BTN_W;
    if (btn < 0 || btn > 3) return;
    Tela prox = (Tela)btn;
    if (prox == telaAtual) return;
    telaAtual = prox;
    switch (telaAtual) {
      case S_HOME:    drawHome(); break;
      case S_REGUEI:  litros = 1.0f; drawReguei(); break;
      case S_PHEC:    drawPlaceholder("pH / EC", S_PHEC); break;
      case S_TAREFAS: drawPlaceholder("TAREFAS", S_TAREFAS); break;
    }
    return;
  }

  if (telaAtual == S_REGUEI) {
    if (tx >= RG_MINUS_X && tx <= RG_MINUS_X + RG_MINUS_W &&
        ty >= RG_MINUS_Y && ty <= RG_MINUS_Y + RG_MINUS_H) {
      litros = max(0.5f, litros - 0.5f);
      drawReguei();
    } else if (tx >= RG_PLUS_X && tx <= RG_PLUS_X + RG_MINUS_W &&
               ty >= RG_PLUS_Y && ty <= RG_PLUS_Y + RG_MINUS_H) {
      litros = min(20.0f, litros + 0.5f);
      drawReguei();
    } else if (tx >= RG_SAVE_X && tx <= RG_SAVE_X + RG_SAVE_W &&
               ty >= RG_SAVE_Y && ty <= RG_SAVE_Y + RG_SAVE_H) {
      tft.fillRect(0, 0, W, NAV_Y, BLACK);
      textC(W / 2, H / 4,     "REGA SALVA!", &FreeSansBold12pt7b, C_GRN);
      char buf[20]; dtostrf(litros, 4, 1, buf); strcat(buf, " L");
      textC(W / 2, H / 2,     buf,           &FreeSansBold24pt7b, C_CYN);
      textC(W / 2, H * 3 / 4, "voltando...", &FreeSans9pt7b,      C_DIM);
      drawNav(S_HOME);
      delay(2000);
      telaAtual = S_HOME;
      drawHome();
    }
  }
}

// ── Arduino entry points ───────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);          // SDA=D21, SCL=D22
  tft.begin();
  tft.setRotation(1);          // landscape
  tft.fillScreen(BLACK);

  // Ajusta layout conforme dimensoes reais
  W = tft.width();
  H = tft.height();
  NAV_H  = max(36, H / 6);             // barra inferior ~1/6 da tela
  NAV_Y  = H - NAV_H;
  BTN_W  = W / 4;
  HDR_H  = 34;
  R1_Y   = HDR_H + 4;
  int contentH = NAV_Y - R1_Y - 12;    // espaco entre header e nav
  R1_H   = (int)(contentH * 0.52);
  R2_Y   = R1_Y + R1_H + 4;
  R2_H   = (int)(contentH * 0.36);
  BAR_Y  = R2_Y + R2_H + 4;

  Serial.printf("Display: %dx%d  NAV_Y=%d NAV_H=%d\n", W, H, NAV_Y, NAV_H);
  Serial.printf("R1_Y=%d R1_H=%d  R2_Y=%d R2_H=%d  BAR_Y=%d\n",
                R1_Y, R1_H, R2_Y, R2_H, BAR_Y);

  // Contorno de diagnostico (remover depois)
  tft.drawRect(0, 0, W, H, C_RED);

  drawHome();
}

void loop() {
  int rx, ry;
  if (!ftLer(rx, ry)) return;
  // Rotation=1 (landscape): mapeia coords portrait do FT6206 -> coords da tela
  int tx = map(ry, 0, 320, 0, W);
  int ty = map(rx, 0, 240, H, 0);
  onTouch(tx, ty);
  delay(180);                  // debounce
}
