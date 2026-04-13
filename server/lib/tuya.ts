/**
 * Tuya / SmartLife Cloud API client
 *
 * Documentação: https://developer.tuya.com/en/docs/cloud
 *
 * Sign algorithm (v1.0):
 *   token req  → HMAC-SHA256( client_id + t, secret )
 *   other req  → HMAC-SHA256( client_id + access_token + t, secret )
 */

import crypto from "crypto";

export type TuyaRegion = "eu" | "us" | "cn" | "in";

const BASE_URLS: Record<TuyaRegion, string> = {
  eu: "https://openapi.tuyaeu.com",
  us: "https://openapi.tuyaus.com",
  cn: "https://openapi.tuyacn.com",
  in: "https://openapi.tuyain.com",
};

export interface TuyaDevice {
  id: string;
  name: string;
  online: boolean;
  category: string; // "wsdcg" = temp+humidity sensor, etc.
}

export interface TuyaReading {
  tempC: number | null;
  rhPct: number | null;
}

// ─── Token cache (in-memory, per accessId) ───────────────────────────────────

interface TokenCache {
  accessToken: string;
  uid: string;
  expiresAt: number; // ms
}

const tokenCache = new Map<string, TokenCache>();

function sign(message: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("hex").toUpperCase();
}

async function getToken(
  accessId: string,
  accessSecret: string,
  region: TuyaRegion
): Promise<{ accessToken: string; uid: string }> {
  const cached = tokenCache.get(accessId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return { accessToken: cached.accessToken, uid: cached.uid };
  }

  const t = Date.now().toString();
  const message = `${accessId}${t}`;
  const signature = sign(message, accessSecret);

  const url = `${BASE_URLS[region]}/v1.0/token?grant_type=1`;
  const res = await fetch(url, {
    headers: {
      client_id: accessId,
      sign: signature,
      t,
      sign_method: "HMAC-SHA256",
      nonce: "",
    },
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(`Tuya auth error: ${data.msg ?? data.code}`);
  }

  const result = data.result;
  const cache: TokenCache = {
    accessToken: result.access_token,
    uid: result.uid,
    expiresAt: Date.now() + result.expire_time * 1000,
  };
  tokenCache.set(accessId, cache);
  return { accessToken: result.access_token, uid: result.uid };
}

async function tuyaGet(
  path: string,
  accessId: string,
  accessSecret: string,
  accessToken: string,
  region: TuyaRegion
): Promise<any> {
  const t = Date.now().toString();
  const message = `${accessId}${accessToken}${t}`;
  const signature = sign(message, accessSecret);

  const res = await fetch(`${BASE_URLS[region]}${path}`, {
    headers: {
      client_id: accessId,
      access_token: accessToken,
      sign: signature,
      t,
      sign_method: "HMAC-SHA256",
      nonce: "",
    },
  });
  return res.json();
}

// ─── Public helpers ───────────────────────────────────────────────────────────

export async function testTuyaConnection(
  accessId: string,
  accessSecret: string,
  region: TuyaRegion
): Promise<{ ok: boolean; error?: string; uid?: string }> {
  try {
    // Invalidar cache antes de testar
    tokenCache.delete(accessId);
    const { uid } = await getToken(accessId, accessSecret, region);
    return { ok: true, uid };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

export async function listTuyaDevices(
  accessId: string,
  accessSecret: string,
  region: TuyaRegion
): Promise<TuyaDevice[]> {
  const { accessToken, uid } = await getToken(accessId, accessSecret, region);

  // Lista todos os dispositivos do usuário
  const data = await tuyaGet(
    `/v1.0/users/${uid}/devices`,
    accessId,
    accessSecret,
    accessToken,
    region
  );

  if (!data.success) {
    throw new Error(`Tuya listDevices error: ${data.msg ?? data.code}`);
  }

  const devices: TuyaDevice[] = (data.result ?? []).map((d: any) => ({
    id: d.id,
    name: d.name,
    online: d.online ?? false,
    category: d.category ?? "",
  }));

  // Ordenar: sensores de temp/umidade primeiro (categorias comuns: wsdcg, mcs, zdkj)
  const SENSOR_CATS = ["wsdcg", "mcs", "zdkj", "wnykq", "hjjcy"];
  devices.sort((a, b) => {
    const aS = SENSOR_CATS.includes(a.category) ? 0 : 1;
    const bS = SENSOR_CATS.includes(b.category) ? 0 : 1;
    return aS - bS;
  });

  return devices;
}

/**
 * Lê temperatura e umidade do dispositivo.
 * Tuya retorna temperatura como inteiro ×10 (235 = 23.5°C) — normalizado aqui.
 */
export async function readTuyaDeviceStatus(
  deviceId: string,
  accessId: string,
  accessSecret: string,
  region: TuyaRegion
): Promise<TuyaReading> {
  const { accessToken } = await getToken(accessId, accessSecret, region);

  const data = await tuyaGet(
    `/v1.0/devices/${deviceId}/status`,
    accessId,
    accessSecret,
    accessToken,
    region
  );

  if (!data.success) {
    throw new Error(`Tuya status error: ${data.msg ?? data.code} (device: ${deviceId})`);
  }

  const statuses: { code: string; value: any }[] = data.result ?? [];

  // Codes conhecidos para temperatura
  const TEMP_CODES = ["va_temperature", "temp_current", "temperature", "temp_indoor"];
  // Codes conhecidos para umidade
  const HUM_CODES = ["va_humidity", "humidity_value", "humidity", "hum_indoor"];

  let rawTemp: number | null = null;
  let rawHum: number | null = null;

  for (const s of statuses) {
    if (TEMP_CODES.includes(s.code) && rawTemp === null) rawTemp = Number(s.value);
    if (HUM_CODES.includes(s.code) && rawHum === null) rawHum = Number(s.value);
  }

  // Tuya envia temperatura como inteiro ×10 na maioria dos sensores
  // Se o valor for > 100, provavelmente está em décimos de grau
  const tempC = rawTemp !== null
    ? rawTemp > 100 ? rawTemp / 10 : rawTemp
    : null;

  const rhPct = rawHum !== null
    ? rawHum > 100 ? rawHum / 10 : rawHum
    : null;

  return { tempC, rhPct };
}
