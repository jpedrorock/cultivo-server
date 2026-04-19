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

// ── Layout ─────────────────────────────────────────────────────────────────────
#define W      320
#define H      240
#define NAV_Y  196
#define NAV_H  44
#define BTN_W  80

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
  tft.getTextBounds(s, 0, 100, &x1, &y1, &tw, &th);
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

  textL(6, 17, TENT, &FreeSansBold12pt7b, WHITE);
  snprintf(buf, sizeof(buf), "Sem %d/%d  %s", semana, totalSem, FASE);
  textL(6, 32, buf, &FreeSans9pt7b, C_PRP);

  const int R1Y = 38, R1H = 78;
  card(4, R1Y, 154, R1H);
  textL(12, R1Y + 14, "TEMP", &FreeSans9pt7b, C_DIM);
  dtostrf(tempC, 4, 1, buf); strcat(buf, "o");
  textC(81, R1Y + 56, buf, &FreeSansBold24pt7b, cTemp(tempC));

  card(162, R1Y, 154, R1H);
  textL(170, R1Y + 14, "UMIDADE", &FreeSans9pt7b, C_DIM);
  dtostrf(rh, 4, 0, buf); strcat(buf, "%");
  textC(239, R1Y + 56, buf, &FreeSansBold24pt7b, cRH(rh));

  const int R2Y = R1Y + R1H + 4, R2H = 52, CW = 100;
  card(4, R2Y, CW, R2H);
  textL(10, R2Y + 13, "VPD kPa", &FreeSans9pt7b, C_DIM);
  dtostrf(vpd, 3, 2, buf);
  textC(54, R2Y + 38, buf, &FreeSansBold12pt7b, cVPD(vpd));

  card(108, R2Y, CW, R2H);
  textL(114, R2Y + 13, "pH", &FreeSans9pt7b, C_DIM);
  dtostrf(ph, 3, 1, buf);
  textC(158, R2Y + 38, buf, &FreeSansBold12pt7b, C_GRN);

  card(212, R2Y, CW, R2H);
  textL(218, R2Y + 13, "EC mS/cm", &FreeSans9pt7b, C_DIM);
  dtostrf(ec, 3, 1, buf);
  textC(262, R2Y + 38, buf, &FreeSansBold12pt7b, C_CYN);

  int barY = R2Y + R2H + 5;
  tft.fillRoundRect(4, barY, 312, 5, 2, C_BORD);
  tft.fillRoundRect(4, barY, (int)((float)semana / totalSem * 312), 5, 2, C_PRP);

  drawNav(S_HOME);
}

// ── Tela REGUEI ────────────────────────────────────────────────────────────────
void drawReguei() {
  tft.fillRect(0, 0, W, NAV_Y, BLACK);
  char buf[24];

  textC(W / 2, 22, "REGA",                       &FreeSansBold12pt7b, WHITE);
  textC(W / 2, 42, "Quantos litros voce regou?", &FreeSans9pt7b,      C_DIM);

  card(80, 52, 160, 60);
  dtostrf(litros, 4, 1, buf); strcat(buf, " L");
  textC(160, 88, buf, &FreeSansBold24pt7b, C_CYN);

  card(20, 120, 65, 44, C_BORD);
  textC(52, 144, "-", &FreeSansBold24pt7b, C_RED);

  card(235, 120, 65, 44, C_BORD);
  textC(267, 144, "+", &FreeSansBold24pt7b, C_GRN);

  textC(W / 2, 144, "passo 0.5 L", &FreeSans9pt7b, C_DIM);

  card(90, 170, 140, 22, 0x0180);
  tft.drawRoundRect(90, 170, 140, 22, 6, C_GRN);
  textC(W / 2, 183, "SALVAR", &FreeSans9pt7b, C_GRN);

  drawNav(S_REGUEI);
}

// ── Placeholder (Fase C) ───────────────────────────────────────────────────────
void drawPlaceholder(const char* titulo, Tela s) {
  tft.fillRect(0, 0, W, NAV_Y, BLACK);
  textC(W / 2, 80,  titulo,        &FreeSansBold12pt7b, WHITE);
  textC(W / 2, 120, "Em breve...", &FreeSans9pt7b,      C_DIM);
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
    if (tx >= 20 && tx <= 85 && ty >= 120 && ty <= 164) {
      litros = max(0.5f, litros - 0.5f);
      drawReguei();
    } else if (tx >= 235 && tx <= 300 && ty >= 120 && ty <= 164) {
      litros = min(20.0f, litros + 0.5f);
      drawReguei();
    } else if (tx >= 90 && tx <= 230 && ty >= 170 && ty <= 192) {
      tft.fillRect(0, 0, W, NAV_Y, BLACK);
      textC(W / 2, 70, "REGA SALVA!", &FreeSansBold12pt7b, C_GRN);
      char buf[20]; dtostrf(litros, 4, 1, buf); strcat(buf, " L");
      textC(W / 2, 120, buf, &FreeSansBold24pt7b, C_CYN);
      textC(W / 2, 160, "voltando...", &FreeSans9pt7b, C_DIM);
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
  tft.setRotation(1);          // landscape 320x240
  tft.fillScreen(BLACK);
  Serial.println("Cultivo ESP32 pronto");
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
