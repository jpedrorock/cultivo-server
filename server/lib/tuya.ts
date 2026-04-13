/**
 * Tuya / SmartLife Cloud API client
 *
 * Sign algorithm (v2.0 — obrigatório desde 2023):
 *
 *   str_to_sign = METHOD + "\n" + sha256(body) + "\n" + "" + "\n" + path_and_query
 *
 *   token req  → message = client_id + t + nonce + str_to_sign
 *   other req  → message = client_id + access_token + t + nonce + str_to_sign
 *
 *   sign = upper( hmac-sha256( message, secret ) )
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
  category: string;
}

export interface TuyaReading {
  tempC: number | null;
  rhPct: number | null;
}

// ─── Token cache ──────────────────────────────────────────────────────────────

interface TokenCache {
  accessToken: string;
  uid: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCache>();

// ─── Signing helpers ──────────────────────────────────────────────────────────

const SHA256_EMPTY = crypto.createHash("sha256").update("").digest("hex");

function hmacSha256(message: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("hex").toUpperCase();
}

/**
 * Monta a assinatura v2.0 do Tuya.
 * @param accessToken  undefined para a requisição de token
 * @param pathAndQuery ex: "/v1.0/token?grant_type=1"
 */
function buildSign(
  accessId: string,
  accessSecret: string,
  t: string,
  nonce: string,
  pathAndQuery: string,
  accessToken?: string,
  method = "GET",
  body = ""
): string {
  const contentHash = body
    ? crypto.createHash("sha256").update(body).digest("hex")
    : SHA256_EMPTY;

  const strToSign = [method, contentHash, "", pathAndQuery].join("\n");

  const message = accessToken
    ? `${accessId}${accessToken}${t}${nonce}${strToSign}`
    : `${accessId}${t}${nonce}${strToSign}`;

  return hmacSha256(message, accessSecret);
}

// ─── Token request ────────────────────────────────────────────────────────────

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
  const nonce = "";
  const pathAndQuery = "/v1.0/token?grant_type=1";
  const signature = buildSign(accessId, accessSecret, t, nonce, pathAndQuery);

  const res = await fetch(`${BASE_URLS[region]}${pathAndQuery}`, {
    headers: {
      client_id: accessId,
      sign: signature,
      t,
      sign_method: "HMAC-SHA256",
      nonce,
    },
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(`Tuya auth error: ${data.msg ?? data.code}`);
  }

  const result = data.result;
  tokenCache.set(accessId, {
    accessToken: result.access_token,
    uid: result.uid,
    expiresAt: Date.now() + result.expire_time * 1000,
  });
  return { accessToken: result.access_token, uid: result.uid };
}

// ─── Authenticated GET ────────────────────────────────────────────────────────

async function tuyaGet(
  pathAndQuery: string,
  accessId: string,
  accessSecret: string,
  accessToken: string,
  region: TuyaRegion
): Promise<any> {
  const t = Date.now().toString();
  const nonce = "";
  const signature = buildSign(accessId, accessSecret, t, nonce, pathAndQuery, accessToken);

  const res = await fetch(`${BASE_URLS[region]}${pathAndQuery}`, {
    headers: {
      client_id: accessId,
      access_token: accessToken,
      sign: signature,
      t,
      sign_method: "HMAC-SHA256",
      nonce,
    },
  });
  return res.json();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function testTuyaConnection(
  accessId: string,
  accessSecret: string,
  region: TuyaRegion
): Promise<{ ok: boolean; error?: string; uid?: string }> {
  try {
    tokenCache.delete(accessId); // força novo token no teste
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

  const data = await tuyaGet(
    `/v1.0/users/${uid}/devices`,
    accessId,
    accessSecret,
    accessToken,
    region
  );

  if (!data.success) {
    throw new Error(`Tuya listDevices: ${data.msg ?? data.code}`);
  }

  const SENSOR_CATS = ["wsdcg", "mcs", "zdkj", "wnykq", "hjjcy"];
  const devices: TuyaDevice[] = (data.result ?? []).map((d: any) => ({
    id: d.id,
    name: d.name,
    online: d.online ?? false,
    category: d.category ?? "",
  }));

  // Sensores de temp/umidade primeiro
  devices.sort((a, b) =>
    (SENSOR_CATS.includes(a.category) ? 0 : 1) - (SENSOR_CATS.includes(b.category) ? 0 : 1)
  );

  return devices;
}

/**
 * Lê temperatura e umidade.
 * Tuya envia temperatura como inteiro ×10 (235 = 23.5 °C) na maioria dos sensores.
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
    throw new Error(`Tuya device status: ${data.msg ?? data.code}`);
  }

  const TEMP_CODES = ["va_temperature", "temp_current", "temperature", "temp_indoor"];
  const HUM_CODES  = ["va_humidity", "humidity_value", "humidity", "hum_indoor"];

  let rawTemp: number | null = null;
  let rawHum:  number | null = null;

  for (const s of (data.result ?? []) as { code: string; value: any }[]) {
    if (TEMP_CODES.includes(s.code) && rawTemp === null) rawTemp = Number(s.value);
    if (HUM_CODES.includes(s.code)  && rawHum  === null) rawHum  = Number(s.value);
  }

  return {
    tempC: rawTemp !== null ? (rawTemp > 100 ? rawTemp / 10 : rawTemp) : null,
    rhPct: rawHum  !== null ? (rawHum  > 100 ? rawHum  / 10 : rawHum)  : null,
  };
}
