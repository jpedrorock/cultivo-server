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

// ─── Authenticated POST ───────────────────────────────────────────────────────

async function tuyaPost(
  pathAndQuery: string,
  body: object,
  accessId: string,
  accessSecret: string,
  accessToken: string,
  region: TuyaRegion
): Promise<any> {
  const t = Date.now().toString();
  const nonce = "";
  const bodyStr = JSON.stringify(body);
  const signature = buildSign(accessId, accessSecret, t, nonce, pathAndQuery, accessToken, "POST", bodyStr);

  const res = await fetch(`${BASE_URLS[region]}${pathAndQuery}`, {
    method: "POST",
    headers: {
      client_id: accessId,
      access_token: accessToken,
      sign: signature,
      t,
      sign_method: "HMAC-SHA256",
      nonce,
      "Content-Type": "application/json",
    },
    body: bodyStr,
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

/**
 * Tenta múltiplos endpoints para garantir que dispositivos SmartLife vinculados apareçam.
 * 1. /v1.0/iot-03/devices  → dispositivos do projeto (inclui SmartLife linkados)
 * 2. /v1.2/iot-03/devices  → versão mais nova
 * 3. /v1.0/users/{uid}/devices → fallback legado
 */
export async function listTuyaDevices(
  accessId: string,
  accessSecret: string,
  region: TuyaRegion
): Promise<TuyaDevice[]> {
  const { accessToken, uid } = await getToken(accessId, accessSecret, region);

  const SENSOR_CATS = ["wsdcg", "mcs", "zdkj", "wnykq", "hjjcy"];

  function parseDevices(result: any[]): TuyaDevice[] {
    return (result ?? []).map((d: any) => ({
      id: d.id ?? d.device_id ?? "",
      name: d.name ?? d.device_name ?? d.custom_name ?? "Sem nome",
      online: d.online ?? false,
      category: d.category ?? d.product_category ?? "",
    }));
  }

  // Endpoints tentados em ordem — loga tudo para diagnóstico
  const attempts: Array<{ label: string; path: string; extract: (r: any) => any[] }> = [
    // Smart Home Basic Service: busca todos dispositivos do projeto (página de 100)
    {
      label: "Smart Home /v1.0/devices",
      path: `/v1.0/devices?page_no=1&page_size=100`,
      extract: (r) => (Array.isArray(r) ? r : r?.devices ?? r?.list ?? []),
    },
    // Homes: busca casas do uid e depois dispositivos de cada casa
    // — tentativa indireta via iot-03
    {
      label: "IoT-03 /v1.0/iot-03/devices",
      path: `/v1.0/iot-03/devices?page_no=1&page_size=100`,
      extract: (r) => r?.devices ?? [],
    },
    {
      label: "IoT-03 /v1.2/iot-03/devices",
      path: `/v1.2/iot-03/devices?page_no=1&page_size=100`,
      extract: (r) => r?.devices ?? [],
    },
    // Legado: usuário do projeto (geralmente developer uid, pode não ter dispositivos SmartLife)
    {
      label: `Legacy /v1.0/users/${uid}/devices`,
      path: `/v1.0/users/${uid}/devices`,
      extract: (r) => (Array.isArray(r) ? r : r?.devices ?? r?.list ?? []),
    },
  ];

  for (const attempt of attempts) {
    try {
      const data = await tuyaGet(attempt.path, accessId, accessSecret, accessToken, region);
      const list = attempt.extract(data.result);
      console.log(`[Tuya] ${attempt.label}: success=${data.success} code=${data.code ?? "-"} msg="${data.msg ?? "-"}" count=${list?.length ?? 0}`);
      if (data.success && Array.isArray(list) && list.length > 0) {
        const devices = parseDevices(list);
        devices.sort((a, b) =>
          (SENSOR_CATS.includes(a.category) ? 0 : 1) - (SENSOR_CATS.includes(b.category) ? 0 : 1)
        );
        return devices;
      }
    } catch (e: any) {
      console.warn(`[Tuya] ${attempt.label} exception: ${e?.message}`);
    }
  }

  // Nenhum endpoint retornou dispositivos — retorna lista vazia (não lança erro)
  // O client já trata lista vazia mostrando o modo de entrada manual
  console.warn("[Tuya] Nenhum dispositivo encontrado em nenhum endpoint. Vincule sua conta SmartLife em iot.tuya.com → Devices → Link App Account.");
  return [];
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

// ─── Device control ───────────────────────────────────────────────────────────

export interface TuyaSwitchState {
  online: boolean;
  switchOn: boolean | null;   // null = dispositivo não expõe switch DP
  switchCode: string | null;  // "switch", "switch_1", etc.
}

const SWITCH_CODES = ["switch_1", "switch", "switch_led", "power", "led_switch"];

/**
 * Retorna o estado online + switch atual de um dispositivo controlável.
 */
export async function getTuyaDeviceSwitchState(
  deviceId: string,
  accessId: string,
  accessSecret: string,
  region: TuyaRegion
): Promise<TuyaSwitchState> {
  const { accessToken } = await getToken(accessId, accessSecret, region);

  // Busca info + status em paralelo
  const [devData, statusData] = await Promise.all([
    tuyaGet(`/v1.0/devices/${deviceId}`, accessId, accessSecret, accessToken, region),
    tuyaGet(`/v1.0/devices/${deviceId}/status`, accessId, accessSecret, accessToken, region),
  ]);

  const online = devData.success ? Boolean(devData.result?.online) : false;

  let switchOn: boolean | null = null;
  let switchCode: string | null = null;
  for (const s of (statusData.result ?? []) as { code: string; value: any }[]) {
    if (SWITCH_CODES.includes(s.code) && switchCode === null) {
      switchCode = s.code;
      switchOn = Boolean(s.value);
    }
  }

  return { online, switchOn, switchCode };
}

/**
 * Liga ou desliga um dispositivo via DP command.
 */
export async function controlTuyaDevice(
  deviceId: string,
  switchCode: string,
  value: boolean,
  accessId: string,
  accessSecret: string,
  region: TuyaRegion
): Promise<{ success: boolean; msg?: string }> {
  const { accessToken } = await getToken(accessId, accessSecret, region);
  const path = `/v1.0/devices/${deviceId}/commands`;
  const body = { commands: [{ code: switchCode, value }] };
  const data = await tuyaPost(path, body, accessId, accessSecret, accessToken, region);
  return { success: Boolean(data.success), msg: data.msg };
}

// ─── SmartLife homes & scenes ─────────────────────────────────────────────────

export interface TuyaHome {
  homeId: number;
  name: string;
}

export interface TuyaScene {
  sceneId: string;
  name: string;
  homeId: number;
  homeName: string;
}

/**
 * Lista as "casas" da conta SmartLife do usuário.
 * Smart Home Basic Service: GET /v1.0/users/{uid}/homes
 * Fallback: /v2.0/homes?uid={uid} (Industry Basic Service)
 */
export async function listTuyaHomes(
  accessId: string,
  accessSecret: string,
  region: TuyaRegion
): Promise<TuyaHome[]> {
  const { accessToken, uid } = await getToken(accessId, accessSecret, region);

  // Tenta primeiro buscar usuários SmartLife vinculados ao projeto
  // (após "Link App Account" no portal Tuya, o uid do app user é diferente do developer uid)
  let userUid = uid;
  try {
    const usersData = await tuyaGet(
      `/v1.0/users?page_no=1&page_size=20`,
      accessId, accessSecret, accessToken, region
    );
    if (usersData.success) {
      const list = usersData.result?.list ?? usersData.result ?? [];
      if (Array.isArray(list) && list.length > 0) {
        userUid = list[0].uid ?? uid;
        console.log(`[Tuya] listTuyaHomes: usando uid do usuário SmartLife vinculado: ${userUid}`);
      }
    }
  } catch {}

  // Endpoints em ordem de prioridade
  const attempts = [
    { path: `/v1.0/users/${userUid}/homes?page_no=1&page_size=20`, extract: (r: any) => Array.isArray(r) ? r : (r?.list ?? []) },
    { path: `/v2.0/homes?uid=${userUid}&page_no=1&page_size=20`, extract: (r: any) => Array.isArray(r) ? r : (r?.list ?? []) },
  ];

  let lastError = "";
  for (const { path, extract } of attempts) {
    try {
      const data = await tuyaGet(path, accessId, accessSecret, accessToken, region);
      console.log(`[Tuya] listTuyaHomes ${path}: success=${data.success} code=${data.code ?? "-"} msg="${data.msg ?? "-"}"`);
      if (data.success) {
        const list = extract(data.result);
        return (list as any[]).map((h: any) => ({
          homeId: h.home_id ?? h.id,
          name: h.name ?? h.home_name ?? "Casa",
        }));
      }
      lastError = `[${data.code}] ${data.msg ?? "erro desconhecido"}`;
    } catch (e: any) {
      lastError = e?.message ?? String(e);
    }
  }
  throw new Error(`listTuyaHomes: ${lastError}`);
}

/**
 * Lista cenas de uma casa.
 * Tenta v1.0 primeiro (compatível com [Deprecate]Smart Home Scene Linkage).
 */
export async function listTuyaScenes(
  homeId: number,
  accessId: string,
  accessSecret: string,
  region: TuyaRegion
): Promise<Omit<TuyaScene, "homeName">[]> {
  const { accessToken } = await getToken(accessId, accessSecret, region);

  const attempts = [
    `/v1.0/homes/${homeId}/scenes?page_no=1&page_size=50`,
    `/v2.0/homes/${homeId}/scenes?page_no=1&page_size=50`,
  ];

  let lastError = "";
  for (const path of attempts) {
    try {
      const data = await tuyaGet(path, accessId, accessSecret, accessToken, region);
      console.log(`[Tuya] listTuyaScenes ${path}: success=${data.success} code=${data.code ?? "-"} msg="${data.msg ?? "-"}"`);
      if (data.success) {
        const list = data.result?.list ?? (Array.isArray(data.result) ? data.result : []);
        return (list as any[]).map((s: any) => ({
          sceneId: s.scene_id ?? s.id,
          name: s.name ?? s.scene_name ?? "Cena",
          homeId,
        }));
      }
      lastError = `${data.msg ?? data.code}`;
    } catch (e: any) {
      lastError = e?.message ?? String(e);
    }
  }
  throw new Error(`listTuyaScenes: ${lastError}`);
}

/**
 * Dispara uma cena SmartLife.
 * Tenta v1.0 primeiro (compatível com [Deprecate]Smart Home Scene Linkage).
 */
export async function triggerTuyaScene(
  homeId: number,
  sceneId: string,
  accessId: string,
  accessSecret: string,
  region: TuyaRegion
): Promise<{ success: boolean; msg?: string }> {
  const { accessToken } = await getToken(accessId, accessSecret, region);

  const attempts = [
    `/v1.0/homes/${homeId}/scenes/${sceneId}/actions/trigger`,
    `/v2.0/homes/${homeId}/scenes/${sceneId}/actions/trigger`,
  ];

  for (const path of attempts) {
    try {
      const data = await tuyaPost(path, {}, accessId, accessSecret, accessToken, region);
      console.log(`[Tuya] triggerTuyaScene ${path}: success=${data.success} code=${data.code ?? "-"}`);
      if (data.success) return { success: true };
    } catch {}
  }
  return { success: false, msg: "Nenhum endpoint de trigger funcionou" };
}
