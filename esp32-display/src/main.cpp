#include <Arduino.h>
#include <Wire.h>

// ── Driver de display: Wokwi (ILI9341) ou hardware real (AXS15231B) ────────────
#ifdef REAL_HARDWARE
  // ESP32-S3 + JC4832W535 (480x320, AXS15231B). Verifique pinos no esquema.
  #include <Arduino_GFX_Library.h>
  #define TFT_CS    10
  #define TFT_DC     8
  #define TFT_RST   14
  #define TFT_SCK   12
  #define TFT_MOSI  11
  #define TFT_MISO  13
  #define TOUCH_SDA  4
  #define TOUCH_SCL  5
  #define FT_ADDR   0x38      // tente 0x3B se nao detectar toque
  static Arduino_DataBus *bus = nullptr;
  static Arduino_GFX     *gfx = nullptr;
  #define tft (*gfx)
#else
  // Wokwi: ESP32 + ILI9341 + FT6206
  #include <Adafruit_GFX.h>
  #include <Adafruit_ILI9341.h>
  #define TFT_DC     2
  #define TFT_CS    15
  #define TOUCH_SDA 21
  #define TOUCH_SCL 22
  #define FT_ADDR  0x38
  Adafruit_ILI9341 tft(TFT_CS, TFT_DC);
#endif

#include <Fonts/FreeSans9pt7b.h>
#include <Fonts/FreeSansBold12pt7b.h>
#include <Fonts/FreeSansBold24pt7b.h>

// ── WiFi + HTTP (Fase D) ───────────────────────────────────────────────────────
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ════════════════════════════════════════════════════════════════════════════════
// CONFIGURACAO — preencha antes de compilar
// ════════════════════════════════════════════════════════════════════════════════
#define WIFI_SSID    ""                                  // sua rede WiFi
#define WIFI_PASS    ""                                  // sua senha
#define SERVER_URL   "http://192.168.1.100:3000"         // URL do servidor cultivo
#define DEVICE_TOKEN ""                                  // token gerado em Configuracoes > Dispositivos
#define TENT_ID      1                                   // ID da estufa no banco
// ════════════════════════════════════════════════════════════════════════════════

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

// ── Dados (mock inicial, atualizados via WiFi quando configurado) ──────────────
char TENT[50] = "ESTUFA 1";
char FASE[20] = "FLORACAO";
float tempC = 24.5f, rh = 62.0f, vpd = 1.1f, ph = 6.2f, ec = 1.8f;
int semana = 4, totalSem = 16;
float litros = 1.0f;

// ── WiFi ───────────────────────────────────────────────────────────────────────
bool wifiOk = false;
unsigned long lastFetch = 0;
const unsigned long FETCH_INTERVAL = 30000;  // 30 s

// Prototipos WiFi (definidos no fim do arquivo)
void connectWifi();
bool fetchDisplayData();
void fetchTasks();
void postWatering(float l);
void postReading(float newPh, float newEc);
void postTaskComplete(int taskId);

// ── Estado da tela pH/EC ───────────────────────────────────────────────────────
char inputPh[8] = "";
char inputEc[8] = "";
int  activeField = 0;   // 0=pH, 1=EC

// ── Lista de tarefas (mock se sem WiFi, do servidor com WiFi) ──────────────────
struct Tarefa { char texto[80]; bool feito; int serverId; };
Tarefa tarefas[10];
int NUM_TAREFAS = 0;

void initMockTarefas() {
  const char* mock[] = {
    "Regar planta 1", "Medir pH da agua",
    "Verificar temperatura", "Trocar filtro", "Limpar reservatorio"
  };
  NUM_TAREFAS = 5;
  for (int i = 0; i < 5; i++) {
    strncpy(tarefas[i].texto, mock[i], 79);
    tarefas[i].texto[79] = '\0';
    tarefas[i].feito = false;
    tarefas[i].serverId = -1;
  }
}

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

// ── Indicador WiFi (canto superior direito) ────────────────────────────────────
void drawWifiDot() {
  tft.fillCircle(W - 10, 10, 5, wifiOk ? C_GRN : C_BORD);
}

// ── Tela HOME ──────────────────────────────────────────────────────────────────
void drawHome() {
  tft.fillRect(0, 0, W, NAV_Y, BLACK);
  char buf[24];

  // Cabecalho
  textL(6, 16, TENT, &FreeSansBold12pt7b, WHITE);
  snprintf(buf, sizeof(buf), "Sem %d/%d  %s", semana, totalSem, FASE);
  textL(6, 30, buf, &FreeSans9pt7b, C_PRP);
  drawWifiDot();

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

// ── Tela pH / EC (teclado numerico) ────────────────────────────────────────────
int PE_FIELD_W, PE_FIELD_H = 46, PE_FIELD_X = 8;
int PE_PH_Y, PE_EC_Y, PE_SAVE_Y, PE_SAVE_H = 30;
int PE_KEY_X0, PE_KEY_Y0, PE_KEY_W, PE_KEY_H, PE_KEY_GAP = 3;

const char* KEYS[12] = {"7","8","9","4","5","6","1","2","3",".","0","<"};

void drawField(int x, int y, int w, int h, const char* label, const char* value,
               uint16_t color, bool selected) {
  card(x, y, w, h);
  if (selected) tft.drawRoundRect(x, y, w, h, 6, color);
  textL(x + 6, y + 12, label, &FreeSans9pt7b, C_DIM);
  const char* v = (strlen(value) > 0) ? value : "---";
  textC(x + w / 2, y + h / 2 + 8, v, &FreeSansBold12pt7b, color);
}

void drawPhEc() {
  tft.fillRect(0, 0, W, NAV_Y, BLACK);
  textC(W / 2, 14, "MEDICAO pH / EC", &FreeSansBold12pt7b, WHITE);

  PE_FIELD_W = W / 2 - 12;
  PE_PH_Y    = 28;
  PE_EC_Y    = PE_PH_Y + PE_FIELD_H + 6;
  PE_SAVE_Y  = PE_EC_Y + PE_FIELD_H + 8;

  drawField(PE_FIELD_X, PE_PH_Y, PE_FIELD_W, PE_FIELD_H, "pH", inputPh, C_GRN, activeField == 0);
  drawField(PE_FIELD_X, PE_EC_Y, PE_FIELD_W, PE_FIELD_H, "EC mS/cm", inputEc, C_CYN, activeField == 1);

  card(PE_FIELD_X, PE_SAVE_Y, PE_FIELD_W, PE_SAVE_H, 0x0180);
  tft.drawRoundRect(PE_FIELD_X, PE_SAVE_Y, PE_FIELD_W, PE_SAVE_H, 6, C_GRN);
  textC(PE_FIELD_X + PE_FIELD_W / 2, PE_SAVE_Y + PE_SAVE_H / 2 + 5, "SALVAR",
        &FreeSansBold12pt7b, C_GRN);

  PE_KEY_X0 = W / 2 + 4;
  PE_KEY_Y0 = 28;
  int avail_w = W - PE_KEY_X0 - 8;
  int avail_h = NAV_Y - PE_KEY_Y0 - 8;
  PE_KEY_W = (avail_w - 2 * PE_KEY_GAP) / 3;
  PE_KEY_H = (avail_h - 3 * PE_KEY_GAP) / 4;

  for (int i = 0; i < 12; i++) {
    int col = i % 3, row = i / 3;
    int x = PE_KEY_X0 + col * (PE_KEY_W + PE_KEY_GAP);
    int y = PE_KEY_Y0 + row * (PE_KEY_H + PE_KEY_GAP);
    card(x, y, PE_KEY_W, PE_KEY_H, C_BORD);
    uint16_t col_txt = (i == 11) ? C_RED : WHITE;
    textC(x + PE_KEY_W / 2, y + PE_KEY_H / 2 + 6, KEYS[i], &FreeSansBold12pt7b, col_txt);
  }

  drawNav(S_PHEC);
}

void phEcAppend(char c) {
  char* target = (activeField == 0) ? inputPh : inputEc;
  int len = strlen(target);
  if (c == '<') {
    if (len > 0) target[len - 1] = '\0';
  } else if (c == '.') {
    if (len > 0 && len < 6 && !strchr(target, '.')) {
      target[len] = '.';
      target[len + 1] = '\0';
    }
  } else {
    if (len < 6) {
      target[len] = c;
      target[len + 1] = '\0';
    }
  }
}

void onPhEcTouch(int tx, int ty) {
  if (tx >= PE_FIELD_X && tx <= PE_FIELD_X + PE_FIELD_W) {
    if (ty >= PE_PH_Y && ty <= PE_PH_Y + PE_FIELD_H) { activeField = 0; drawPhEc(); return; }
    if (ty >= PE_EC_Y && ty <= PE_EC_Y + PE_FIELD_H) { activeField = 1; drawPhEc(); return; }
    if (ty >= PE_SAVE_Y && ty <= PE_SAVE_Y + PE_SAVE_H) {
      float newPh = atof(inputPh), newEc = atof(inputEc);
      if (strlen(inputPh)) ph = newPh;
      if (strlen(inputEc)) ec = newEc;
      postReading(newPh, newEc);
      tft.fillRect(0, 0, W, NAV_Y, BLACK);
      textC(W / 2, H / 3, "MEDICAO SALVA!", &FreeSansBold12pt7b, C_GRN);
      char buf[40];
      snprintf(buf, sizeof(buf), "pH %s  EC %s",
               strlen(inputPh) ? inputPh : "-",
               strlen(inputEc) ? inputEc : "-");
      textC(W / 2, H / 2, buf, &FreeSansBold12pt7b, C_CYN);
      drawNav(S_HOME);
      delay(1800);
      inputPh[0] = '\0'; inputEc[0] = '\0'; activeField = 0;
      telaAtual = S_HOME;
      drawHome();
      return;
    }
  }
  for (int i = 0; i < 12; i++) {
    int col = i % 3, row = i / 3;
    int x = PE_KEY_X0 + col * (PE_KEY_W + PE_KEY_GAP);
    int y = PE_KEY_Y0 + row * (PE_KEY_H + PE_KEY_GAP);
    if (tx >= x && tx <= x + PE_KEY_W && ty >= y && ty <= y + PE_KEY_H) {
      phEcAppend(KEYS[i][0]);
      drawPhEc();
      return;
    }
  }
}

// ── Tela TAREFAS (checklist) ───────────────────────────────────────────────────
int TK_ROW_H, TK_Y0 = 32;

void drawTarefas() {
  tft.fillRect(0, 0, W, NAV_Y, BLACK);
  textC(W / 2, 14, "TAREFAS DO DIA", &FreeSansBold12pt7b, WHITE);

  if (NUM_TAREFAS == 0) {
    textC(W / 2, H / 2, "Sem tarefas", &FreeSans9pt7b, C_DIM);
    drawNav(S_TAREFAS);
    return;
  }

  int avail = NAV_Y - TK_Y0 - 6;
  TK_ROW_H = avail / NUM_TAREFAS;

  int cbSize = 20;
  for (int i = 0; i < NUM_TAREFAS; i++) {
    int y = TK_Y0 + i * TK_ROW_H;
    if (i > 0) tft.drawFastHLine(8, y, W - 16, 0x1082);
    int cbY = y + (TK_ROW_H - cbSize) / 2;
    tft.drawRoundRect(10, cbY, cbSize, cbSize, 3, C_BORD);
    if (tarefas[i].feito) {
      tft.fillRoundRect(13, cbY + 3, cbSize - 6, cbSize - 6, 2, C_GRN);
    }
    uint16_t col = tarefas[i].feito ? C_DIM : WHITE;
    textL(10 + cbSize + 10, y + TK_ROW_H / 2 + 6, tarefas[i].texto, &FreeSans9pt7b, col);
  }

  drawNav(S_TAREFAS);
}

void onTarefasTouch(int tx, int ty) {
  for (int i = 0; i < NUM_TAREFAS; i++) {
    int y = TK_Y0 + i * TK_ROW_H;
    if (ty >= y && ty <= y + TK_ROW_H) {
      tarefas[i].feito = !tarefas[i].feito;
      if (tarefas[i].serverId > 0) postTaskComplete(tarefas[i].serverId);
      drawTarefas();
      return;
    }
  }
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
      case S_PHEC:    drawPhEc(); break;
      case S_TAREFAS: fetchTasks(); drawTarefas(); break;
    }
    return;
  }

  if (telaAtual == S_PHEC)    { onPhEcTouch(tx, ty);    return; }
  if (telaAtual == S_TAREFAS) { onTarefasTouch(tx, ty); return; }

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
      postWatering(litros);
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

#ifdef REAL_HARDWARE
  bus = new Arduino_HWSPI(TFT_DC, TFT_CS, TFT_SCK, TFT_MOSI, TFT_MISO);
  gfx = new Arduino_AXS15231B(bus, TFT_RST, 1 /* landscape */);
  gfx->begin();
#else
  tft.begin();
  tft.setRotation(1);          // landscape
#endif
  Wire.begin(TOUCH_SDA, TOUCH_SCL);
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

  initMockTarefas();
  connectWifi();
  if (wifiOk) {
    fetchDisplayData();
    fetchTasks();
    lastFetch = millis();
  }

  drawHome();
}

void loop() {
  // Atualizacao periodica via WiFi
  if (wifiOk && millis() - lastFetch >= FETCH_INTERVAL) {
    lastFetch = millis();
    if (fetchDisplayData() && telaAtual == S_HOME) drawHome();
  }

  int rx, ry;
  if (!ftLer(rx, ry)) return;

#ifdef REAL_HARDWARE
  // AXS15231B em landscape: coordenadas ja vem orientadas (verifique na pratica)
  int tx = rx, ty = ry;
#else
  // Wokwi ILI9341 rotation=1: FT6206 retorna portrait, mapeia para landscape
  int tx = map(ry, 0, 320, 0, W);
  int ty = map(rx, 0, 240, H, 0);
#endif

  onTouch(tx, ty);
  delay(180);                  // debounce
}

// ── WiFi + HTTP (Fase D) ───────────────────────────────────────────────────────
void connectWifi() {
  if (strlen(WIFI_SSID) == 0) { Serial.println("WiFi nao configurado (mock mode)"); return; }
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi");
  for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500); Serial.print('.');
  }
  wifiOk = (WiFi.status() == WL_CONNECTED);
  Serial.println(wifiOk ? " OK" : " FALHOU");
  if (wifiOk) Serial.println(WiFi.localIP());
}

bool fetchDisplayData() {
  if (!wifiOk) return false;
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/device/display/" + String(TENT_ID);
  http.begin(url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  int code = http.GET();
  if (code != 200) { http.end(); Serial.printf("display: %d\n", code); return false; }
  String body = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok) return false;

  if (!doc["tempC"].isNull())    tempC    = doc["tempC"].as<float>();
  if (!doc["rh"].isNull())       rh       = doc["rh"].as<float>();
  if (!doc["vpd"].isNull())      vpd      = doc["vpd"].as<float>();
  if (!doc["ph"].isNull())       ph       = doc["ph"].as<float>();
  if (!doc["ec"].isNull())       ec       = doc["ec"].as<float>();
  if (!doc["semana"].isNull())   semana   = doc["semana"].as<int>();
  if (!doc["totalSem"].isNull()) totalSem = doc["totalSem"].as<int>();
  const char* f = doc["fase"];      if (f) { strncpy(FASE, f, sizeof(FASE)-1); FASE[sizeof(FASE)-1]='\0'; }
  const char* t = doc["tentName"];  if (t) { strncpy(TENT, t, sizeof(TENT)-1); TENT[sizeof(TENT)-1]='\0'; }
  return true;
}

void fetchTasks() {
  if (!wifiOk) return;
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/device/tasks/" + String(TENT_ID);
  http.begin(url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  int code = http.GET();
  if (code != 200) { http.end(); Serial.printf("tasks: %d\n", code); return; }
  String body = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok) return;
  JsonArray arr = doc.as<JsonArray>();
  NUM_TAREFAS = 0;
  for (JsonObject t : arr) {
    if (NUM_TAREFAS >= 10) break;
    const char* tx = t["texto"] | "...";
    strncpy(tarefas[NUM_TAREFAS].texto, tx, 79);
    tarefas[NUM_TAREFAS].texto[79] = '\0';
    tarefas[NUM_TAREFAS].feito    = t["feito"] | false;
    tarefas[NUM_TAREFAS].serverId = t["id"]    | -1;
    NUM_TAREFAS++;
  }
}

void postWatering(float l) {
  if (!wifiOk) return;
  HTTPClient http;
  http.begin(String(SERVER_URL) + "/api/device/watering");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  String body = "{\"tentId\":" + String(TENT_ID) + ",\"litros\":" + String(l, 1) + "}";
  int code = http.POST(body);
  http.end();
  Serial.printf("postWatering: %d\n", code);
}

void postReading(float newPh, float newEc) {
  if (!wifiOk) return;
  HTTPClient http;
  http.begin(String(SERVER_URL) + "/api/device/readings");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  String body = "{\"tentId\":" + String(TENT_ID) +
                ",\"ph\":" + String(newPh, 1) +
                ",\"ec\":" + String(newEc, 2) + "}";
  int code = http.POST(body);
  http.end();
  Serial.printf("postReading: %d\n", code);
}

void postTaskComplete(int taskId) {
  if (!wifiOk || taskId <= 0) return;
  HTTPClient http;
  http.begin(String(SERVER_URL) + "/api/device/task-complete");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(5000);
  String body = "{\"taskId\":" + String(taskId) + "}";
  int code = http.POST(body);
  http.end();
  Serial.printf("postTaskComplete(%d): %d\n", taskId, code);
}
