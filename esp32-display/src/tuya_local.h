#pragma once
// ════════════════════════════════════════════════════════════════════════════════
// tuya_local.h — controle local (LAN) de dispositivos Tuya a partir do ESP.
//
// Liga/desliga luz/exaustor INSTANTANEO (~0.2s) e SEM chamada a nuvem Tuya: o
// ESP fala direto com o device na WiFi (porta 6668, AES). Fallback: o caller
// usa a nuvem se tuyaLocalSet() retornar false (nada quebra).
//
// VERSAO ENXUTA (pos reboot-loop da Estufa C, device de pouco heap):
//   - 1 socket UDP so' (6667). Nada de 6666.
//   - Parse do JSON de descoberta NA MAO (strstr) — ZERO alocacao de heap por
//     pacote (a versao anterior usava JsonDocument por broadcast e estourava).
//   - Buffers pequenos. So' protocolo 3.3 (resto -> nuvem).
//
// Incluido APENAS por main_lvgl.cpp (firmware real). NAO entra no simulador.
// ════════════════════════════════════════════════════════════════════════════════
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <MD5Builder.h>
#include "mbedtls/aes.h"
#include <time.h>
#include <string.h>

// DESLIGADO. Os devices do Joao sao Tuya 3.5 (frame 0x6699 + AES-GCM + handshake
// de session key via HMAC-SHA256) e este modulo so' implementa 3.3 (0x55AA +
// AES-ECB com a local_key direto) -> a descoberta descarta todo broadcast (prefixo
// nao bate) e o controle nao funcionaria. Alem disso, na Estufa C (piso de heap) o
// socket UDP + buffers fragmentam o heap e o handshake TLS do toggle-nuvem passa a
// falhar (HTTP -1). Religar SO depois de implementar 3.5 e SO em device de heap
// folgado (nunca a C). Ver memoria project-esp-tuya-local-and-heap-floor.
static bool     g_tuyaLocalEnabled = false;

#define TUYA_DISC_MAX 8
struct TuyaDisc {
  char     devId[26];
  char     ip[20];
  uint8_t  ver;        // versao minor: 1, 3, 4, 5
  uint32_t lastSeen;
};
static TuyaDisc g_tuyaDisc[TUYA_DISC_MAX];
static int      g_tuyaDiscN = 0;
static WiFiUDP  g_tuyaUdp;            // 1 socket so' (6667)
static uint8_t  g_tuyaUdpKey[16];
static bool     g_tuyaUdpKeyReady = false;
static bool     g_tuyaBegun = false;
static uint32_t g_tuyaSeq = 1;
static int      g_tuyaDbg = 0;        // loga primeiros pacotes p/ debug

static void tuyaUdpKeyInit() {
  if (g_tuyaUdpKeyReady) return;
  MD5Builder m; m.begin(); m.add("yGAdlopoPVldABfn"); m.calculate();
  m.getBytes(g_tuyaUdpKey);
  g_tuyaUdpKeyReady = true;
}

// AES-128-ECB (len multiplo de 16).
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

// CRC32 IEEE (zlib) bitwise.
static uint32_t tuyaCrc32(const uint8_t *d, size_t n) {
  uint32_t c = 0xFFFFFFFFu;
  for (size_t i = 0; i < n; i++) {
    c ^= d[i];
    for (int k = 0; k < 8; k++) c = (c & 1) ? (c >> 1) ^ 0xEDB88420u : (c >> 1);
  }
  return ~c;
}

// Extrai "key":"value" (string) do json -> out. Retorna len (0 se nao achou).
// SEM alocar heap — so strstr/memcpy.
static int tuyaJsonStr(const char *json, const char *key, char *out, int outCap) {
  char pat[20];
  int pl = snprintf(pat, sizeof(pat), "\"%s\"", key);
  if (pl <= 0 || pl >= (int)sizeof(pat)) return 0;
  const char *p = strstr(json, pat);
  if (!p) return 0;
  p = strchr(p + pl, ':');
  if (!p) return 0;
  p++;
  while (*p == ' ' || *p == '\t') p++;
  if (*p != '"') return 0;          // so' valores string
  p++;
  const char *e = strchr(p, '"');
  if (!e) return 0;
  int len = (int)(e - p);
  if (len >= outCap) len = outCap - 1;
  memcpy(out, p, len); out[len] = 0;
  return len;
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
    Serial.printf("[tuya-local] DESCOBERTO id=%s ip=%s ver=3.%u (total=%d, heap=%u)\n",
                  devId, ip, ver, g_tuyaDiscN, (unsigned)ESP.getFreeHeap());
  }
}

// Parse de um pacote de descoberta 6667 (AES global-key). Manual, sem heap.
static void tuyaParseDiscovery(uint8_t *pkt, int n) {
  if (n < 24) return;
  if (!(pkt[0] == 0x00 && pkt[1] == 0x00 && pkt[2] == 0x55 && pkt[3] == 0xAA)) return;
  static char json[400];
  const int offs[2] = {20, 16};            // com / sem retcode
  for (int oi = 0; oi < 2; oi++) {
    int start = offs[oi];
    int plen  = (n - 8) - start;           // tira crc(4)+suffix(4)
    if (plen <= 0 || plen % 16 != 0 || plen > 384) continue;
    static uint8_t dec[400];
    if (!tuyaAesEcb(false, g_tuyaUdpKey, pkt + start, plen, dec)) continue;
    int pad = dec[plen - 1];
    int jl  = (pad > 0 && pad <= 16) ? plen - pad : plen;
    if (jl <= 0 || jl >= (int)sizeof(json) || dec[0] != '{') continue;
    memcpy(json, dec, jl); json[jl] = 0;
    char gw[26] = {0}, ip[20] = {0}, ver[8] = {0};
    if (!tuyaJsonStr(json, "gwId", gw, sizeof(gw))) tuyaJsonStr(json, "devId", gw, sizeof(gw));
    tuyaJsonStr(json, "ip", ip, sizeof(ip));
    tuyaJsonStr(json, "version", ver, sizeof(ver));
    uint8_t v = (strlen(ver) >= 3) ? (uint8_t)(ver[2] - '0') : 3;
    if (gw[0] && ip[0]) { tuyaDiscUpsert(gw, ip, v); return; }
  }
  if (g_tuyaDbg < 4) { g_tuyaDbg++; Serial.printf("[tuya-local] disc parse falhou (n=%d)\n", n); }
}

static void tuyaLocalBegin() {
  if (!g_tuyaLocalEnabled || g_tuyaBegun) return;
  tuyaUdpKeyInit();
  bool a = g_tuyaUdp.begin(6667);
  g_tuyaBegun = true;
  Serial.printf("[tuya-local] descoberta UDP 6667 iniciada=%d (heap=%u)\n",
                (int)a, (unsigned)ESP.getFreeHeap());
}

static void tuyaLocalDiscoveryPump() {
  if (!g_tuyaBegun) return;
  static uint8_t buf[500];
  int n;
  while ((n = g_tuyaUdp.parsePacket()) > 0) {
    int r = g_tuyaUdp.read(buf, sizeof(buf));
    if (r > 0) tuyaParseDiscovery(buf, r);
  }
}

static const TuyaDisc *tuyaFindDisc(const char *devId) {
  for (int i = 0; i < g_tuyaDiscN; i++)
    if (!strcmp(g_tuyaDisc[i].devId, devId)) return &g_tuyaDisc[i];
  return nullptr;
}

static int tuyaDpIndex(const char *dpCode) {
  if (!dpCode || !*dpCode) return 1;
  const char *us = strrchr(dpCode, '_');
  if (us && us[1] >= '1' && us[1] <= '9') return us[1] - '0';
  return 1;
}

// Liga/desliga local. true = device confirmou (ack); false -> caller usa nuvem.
static bool tuyaLocalSet(const char *devId, const char *localKey, const char *dpCode, bool on) {
  if (!g_tuyaLocalEnabled) return false;
  const TuyaDisc *d = tuyaFindDisc(devId);
  if (!d)          { Serial.printf("[tuya-local] %s sem IP -> nuvem\n", devId); return false; }
  if (d->ver != 3) { Serial.printf("[tuya-local] %s ver=3.%u (so 3.3) -> nuvem\n", devId, d->ver); return false; }
  if (!localKey || strlen(localKey) != 16) { Serial.println("[tuya-local] localKey != 16 -> nuvem"); return false; }

  int dp = tuyaDpIndex(dpCode);
  char json[200];
  int jl = snprintf(json, sizeof(json),
    "{\"devId\":\"%s\",\"uid\":\"%s\",\"t\":\"%lu\",\"dps\":{\"%d\":%s}}",
    devId, devId, (unsigned long)time(nullptr), dp, on ? "true" : "false");
  if (jl <= 0 || jl >= (int)sizeof(json)) return false;

  size_t pad = 16 - ((size_t)jl % 16); if (pad == 0) pad = 16;
  size_t padded = (size_t)jl + pad;
  if (padded > 240) return false;
  uint8_t plain[240];
  memcpy(plain, json, jl);
  for (size_t i = 0; i < pad; i++) plain[jl + i] = (uint8_t)pad;
  uint8_t enc[240];
  if (!tuyaAesEcb(true, (const uint8_t *)localKey, plain, padded, enc)) return false;

  uint8_t payload[300];
  memcpy(payload, "3.3", 3); memset(payload + 3, 0, 12);
  memcpy(payload + 15, enc, padded);
  size_t payloadLen = 15 + padded;

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
  uint32_t t0 = millis(); bool got = false;
  while (millis() - t0 < 900) {
    if (cli.available() > 0) { got = true; break; }
    delay(10);
  }
  cli.stop();
  Serial.printf("[tuya-local] ack=%s\n", got ? "OK" : "nao");
  return got;
}
