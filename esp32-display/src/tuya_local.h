#pragma once
// ════════════════════════════════════════════════════════════════════════════════
// tuya_local.h — controle local (LAN) de dispositivos Tuya a partir do ESP.
//
// Objetivo: ligar/desligar luz/exaustor INSTANTANEO (~0.2s) e SEM chamada a
// nuvem Tuya — o ESP fala direto com o device na WiFi (porta 6668, AES).
//
// Fluxo:
//   1. Descoberta: devices Tuya fazem broadcast UDP (6666 plaintext / 6667 AES
//      com chave global). Escutamos, deciframos e mapeamos devId -> {ip, versao}.
//   2. Controle: monta JSON {dps:{<dp>:bool}}, AES-ECB com a local_key do device,
//      enriquece no frame Tuya 3.3 (prefix 55AA / cmd 0x07 / crc32 / suffix AA55),
//      manda via TCP 6668.
//
// So' protocolo 3.3 por ora (mais comum). 3.4/3.1 e device sem IP descoberto ->
// tuyaLocalSet retorna false e o caller cai pro caminho da nuvem (nada quebra).
//
// Incluido APENAS por main_lvgl.cpp (firmware real). NAO entra no simulador.
// ════════════════════════════════════════════════════════════════════════════════
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <MD5Builder.h>
#include <ArduinoJson.h>
#include "mbedtls/aes.h"
#include <time.h>
#include <string.h>

#define TUYA_DISC_MAX 8
struct TuyaDisc {
  char     devId[26];
  char     ip[20];
  uint8_t  ver;        // versao minor do protocolo: 1, 3, 4, 5
  uint32_t lastSeen;
};
static TuyaDisc g_tuyaDisc[TUYA_DISC_MAX];
static int      g_tuyaDiscN = 0;
static WiFiUDP  g_tuyaUdp6667;
static WiFiUDP  g_tuyaUdp6666;
static uint8_t  g_tuyaUdpKey[16];
static bool     g_tuyaUdpKeyReady = false;
static bool     g_tuyaBegun = false;
static uint32_t g_tuyaSeq = 1;
static int      g_tuyaDiscDbgPkts = 0;  // loga os primeiros pacotes crus p/ debug
// KILL-SWITCH: controle local DESLIGADO por ora. A v0.5.28 (1a versao do Tuya
// local) causou reboot-loop na Estufa C (device de pouco heap) — o custo de
// memoria da descoberta (2 sockets UDP + JsonDocument por pacote) estourou.
// Com false, begin/set viram no-op -> device estavel + toggle usa a nuvem
// (comportamento da v0.5.27). Religar (true) quando o code estiver enxuto.
static bool     g_tuyaLocalEnabled = false;

// Chave global da descoberta UDP = md5("yGAdlopoPVldABfn") (fixa do protocolo).
static void tuyaUdpKeyInit() {
  if (g_tuyaUdpKeyReady) return;
  MD5Builder m; m.begin(); m.add("yGAdlopoPVldABfn"); m.calculate();
  m.getBytes(g_tuyaUdpKey);
  g_tuyaUdpKeyReady = true;
}

// AES-128-ECB (len multiplo de 16). encrypt=true cifra, false decifra.
static bool tuyaAesEcb(bool encrypt, const uint8_t *key, const uint8_t *in, size_t len, uint8_t *out) {
  if (len == 0 || len % 16 != 0) return false;
  mbedtls_aes_context a; mbedtls_aes_init(&a);
  int r = encrypt ? mbedtls_aes_setkey_enc(&a, key, 128) : mbedtls_aes_setkey_dec(&a, key, 128);
  if (r != 0) { mbedtls_aes_free(&a); return false; }
  for (size_t i = 0; i < len; i += 16)
    mbedtls_aes_crypt_ecb(&a, encrypt ? MBEDTLS_AES_ENCRYPT : MBEDTLS_AES_DECRYPT, in + i, out + i);
  mbedtls_aes_free(&a);
  return true;
}

// CRC32 IEEE (zlib) bitwise — frames sao pequenos, tabela nao compensa.
static uint32_t tuyaCrc32(const uint8_t *d, size_t n) {
  uint32_t c = 0xFFFFFFFFu;
  for (size_t i = 0; i < n; i++) {
    c ^= d[i];
    for (int k = 0; k < 8; k++) c = (c & 1) ? (c >> 1) ^ 0xEDB88420u : (c >> 1);
  }
  return ~c;
}

static void tuyaDiscUpsert(const char *devId, const char *ip, uint8_t ver) {
  for (int i = 0; i < g_tuyaDiscN; i++) {
    if (!strcmp(g_tuyaDisc[i].devId, devId)) {
      strncpy(g_tuyaDisc[i].ip, ip, sizeof(g_tuyaDisc[i].ip) - 1);
      g_tuyaDisc[i].ver = ver; g_tuyaDisc[i].lastSeen = millis();
      return;
    }
  }
  if (g_tuyaDiscN < TUYA_DISC_MAX) {
    TuyaDisc &d = g_tuyaDisc[g_tuyaDiscN++];
    strncpy(d.devId, devId, sizeof(d.devId) - 1); d.devId[sizeof(d.devId) - 1] = 0;
    strncpy(d.ip, ip, sizeof(d.ip) - 1);          d.ip[sizeof(d.ip) - 1] = 0;
    d.ver = ver; d.lastSeen = millis();
    Serial.printf("[tuya-local] DESCOBERTO id=%s ip=%s ver=3.%u  (total=%d)\n",
                  devId, ip, ver, g_tuyaDiscN);
  }
}

// Tenta extrair {gwId/devId, ip, version} de um pacote de discovery.
static void tuyaParseDiscovery(uint8_t *pkt, int n, bool encrypted) {
  if (n < 24) return;
  if (!(pkt[0] == 0x00 && pkt[1] == 0x00 && pkt[2] == 0x55 && pkt[3] == 0xAA)) {
    if (g_tuyaDiscDbgPkts < 4) { g_tuyaDiscDbgPkts++;
      Serial.printf("[tuya-local] disc pkt sem prefix 55AA (n=%d) b0=%02x%02x%02x%02x\n",
                    n, pkt[0], pkt[1], pkt[2], pkt[3]); }
    return;
  }
  char json[560];
  bool parsed = false;
  // O offset do payload varia (com/sem retcode). Tenta 20 e depois 16.
  const int offsets[2] = {20, 16};
  for (int oi = 0; oi < 2 && !parsed; oi++) {
    int start = offsets[oi];
    int plen  = (n - 8) - start;       // tira 8 bytes finais (crc4 + suffix4)
    if (plen <= 0) continue;
    if (encrypted) {
      if (plen % 16 != 0 || plen > 528) continue;
      uint8_t dec[528];
      if (!tuyaAesEcb(false, g_tuyaUdpKey, pkt + start, plen, dec)) continue;
      int pad = dec[plen - 1];
      int jl  = (pad > 0 && pad <= 16) ? plen - pad : plen;
      if (jl <= 0 || jl >= (int)sizeof(json)) continue;
      if (dec[0] != '{') continue;     // offset errado -> tenta o proximo
      memcpy(json, dec, jl); json[jl] = 0;
    } else {
      if (plen >= (int)sizeof(json) || pkt[start] != '{') continue;
      memcpy(json, pkt + start, plen); json[plen] = 0;
    }
    JsonDocument doc;
    if (deserializeJson(doc, json)) continue;
    const char *gw = doc["gwId"]  | (doc["devId"] | "");
    const char *ip = doc["ip"]    | "";
    const char *vs = doc["version"] | "3.3";
    uint8_t ver = (strlen(vs) >= 3) ? (uint8_t)(vs[2] - '0') : 3;
    if (gw && *gw && ip && *ip) { tuyaDiscUpsert(gw, ip, ver); parsed = true; }
  }
  if (!parsed && g_tuyaDiscDbgPkts < 4) { g_tuyaDiscDbgPkts++;
    Serial.printf("[tuya-local] disc parse falhou (n=%d enc=%d)\n", n, (int)encrypted);
  }
}

static void tuyaLocalBegin() {
  if (!g_tuyaLocalEnabled || g_tuyaBegun) return;  // kill-switch: no-op se desligado
  tuyaUdpKeyInit();
  bool a = g_tuyaUdp6667.begin(6667);
  bool b = g_tuyaUdp6666.begin(6666);
  g_tuyaBegun = true;
  Serial.printf("[tuya-local] descoberta UDP iniciada (6667=%d 6666=%d)\n", (int)a, (int)b);
}

// Pump da descoberta — chamar periodicamente (netTask). Drena os broadcasts.
static void tuyaLocalDiscoveryPump() {
  if (!g_tuyaBegun) return;
  uint8_t buf[600];
  int n;
  while ((n = g_tuyaUdp6667.parsePacket()) > 0) {
    int r = g_tuyaUdp6667.read(buf, sizeof(buf));
    if (r > 0) tuyaParseDiscovery(buf, r, true);
  }
  while ((n = g_tuyaUdp6666.parsePacket()) > 0) {
    int r = g_tuyaUdp6666.read(buf, sizeof(buf));
    if (r > 0) tuyaParseDiscovery(buf, r, false);
  }
}

static const TuyaDisc *tuyaFindDisc(const char *devId) {
  for (int i = 0; i < g_tuyaDiscN; i++)
    if (!strcmp(g_tuyaDisc[i].devId, devId)) return &g_tuyaDisc[i];
  return nullptr;
}

// dp code -> indice numerico p/ o protocolo local ("switch_1"->1, "switch"->1).
static int tuyaDpIndex(const char *dpCode) {
  if (!dpCode || !*dpCode) return 1;
  const char *us = strrchr(dpCode, '_');
  if (us && us[1] >= '1' && us[1] <= '9') return us[1] - '0';
  return 1;
}

// Liga/desliga local. true = device confirmou (ack); false -> caller usa nuvem.
static bool tuyaLocalSet(const char *devId, const char *localKey, const char *dpCode, bool on) {
  if (!g_tuyaLocalEnabled) return false;  // kill-switch: cai pra nuvem
  const TuyaDisc *d = tuyaFindDisc(devId);
  if (!d)            { Serial.printf("[tuya-local] %s sem IP -> nuvem\n", devId); return false; }
  if (d->ver != 3)   { Serial.printf("[tuya-local] %s ver=3.%u (so 3.3) -> nuvem\n", devId, d->ver); return false; }
  if (!localKey || strlen(localKey) != 16) { Serial.println("[tuya-local] localKey != 16 chars -> nuvem"); return false; }

  int dp = tuyaDpIndex(dpCode);
  char json[200];
  time_t t = time(nullptr);
  int jl = snprintf(json, sizeof(json),
    "{\"devId\":\"%s\",\"uid\":\"%s\",\"t\":\"%lu\",\"dps\":{\"%d\":%s}}",
    devId, devId, (unsigned long)t, dp, on ? "true" : "false");
  if (jl <= 0 || jl >= (int)sizeof(json)) return false;

  // PKCS7 pad
  size_t pad = 16 - ((size_t)jl % 16); if (pad == 0) pad = 16;
  size_t padded = (size_t)jl + pad;
  if (padded > 240) return false;
  uint8_t plain[240];
  memcpy(plain, json, jl);
  for (size_t i = 0; i < pad; i++) plain[jl + i] = (uint8_t)pad;
  uint8_t enc[240];
  if (!tuyaAesEcb(true, (const uint8_t *)localKey, plain, padded, enc)) return false;

  // payload 3.3 CONTROL = "3.3" + 12 zeros + AES(json)
  uint8_t payload[300];
  memcpy(payload, "3.3", 3); memset(payload + 3, 0, 12);
  memcpy(payload + 15, enc, padded);
  size_t payloadLen = 15 + padded;

  // frame: prefix(55AA) seq cmd(07) len payload crc(over prefix..payload) suffix(AA55)
  uint8_t frame[360]; size_t p = 0;
  frame[p++] = 0x00; frame[p++] = 0x00; frame[p++] = 0x55; frame[p++] = 0xAA;
  uint32_t seq = g_tuyaSeq++;
  frame[p++] = (seq >> 24) & 0xFF; frame[p++] = (seq >> 16) & 0xFF; frame[p++] = (seq >> 8) & 0xFF; frame[p++] = seq & 0xFF;
  frame[p++] = 0; frame[p++] = 0; frame[p++] = 0; frame[p++] = 0x07;     // CONTROL
  uint32_t lenField = payloadLen + 8;
  frame[p++] = (lenField >> 24) & 0xFF; frame[p++] = (lenField >> 16) & 0xFF; frame[p++] = (lenField >> 8) & 0xFF; frame[p++] = lenField & 0xFF;
  memcpy(frame + p, payload, payloadLen); p += payloadLen;
  uint32_t crc = tuyaCrc32(frame, p);
  frame[p++] = (crc >> 24) & 0xFF; frame[p++] = (crc >> 16) & 0xFF; frame[p++] = (crc >> 8) & 0xFF; frame[p++] = crc & 0xFF;
  frame[p++] = 0x00; frame[p++] = 0x00; frame[p++] = 0xAA; frame[p++] = 0x55;

  WiFiClient cli;
  Serial.printf("[tuya-local] -> %s:6668 dp=%d %s (%u bytes)\n", d->ip, dp, on ? "ON" : "OFF", (unsigned)p);
  if (!cli.connect(d->ip, 6668, 1200)) { Serial.println("[tuya-local] TCP connect falhou -> nuvem"); return false; }
  cli.write(frame, p);
  cli.flush();
  // espera ack (qualquer resposta = device recebeu/respondeu). Sem ack -> nuvem.
  uint32_t t0 = millis(); bool got = false;
  while (millis() - t0 < 900) {
    if (cli.available() > 0) { got = true; break; }
    delay(10);
  }
  cli.stop();
  Serial.printf("[tuya-local] %s ack=%s\n", got ? "OK" : "SEM-ACK", got ? "sim" : "nao");
  return got;  // so' considera sucesso com ack; senao o caller cai pra nuvem
}
