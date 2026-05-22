/**
 * Sistema de ads (AdMob) — mock por enquanto.
 *
 * Quando @capacitor-community/admob for plugado, este arquivo passa a chamar
 * AdMob.showBanner, AdMob.showRewarded etc. A interface dos componentes
 * (<AdBanner>, useRewarded) não muda.
 *
 * Estratégia decidida (memória project_ads_strategy):
 * - Banner persistente em telas-chave (Home, detalhes de estufa, settings)
 * - Rewarded 15s pra desbloquear calculadora Pro por 24h
 * - SEM interstitial
 * - Tudo no-op no plano Pro
 */
import { isNative } from "./platform";

/** Duração do "vídeo" no mock — quando plugar AdMob real, troca por evento ad-completed */
export const REWARDED_DURATION_MS = 15_000;

/** Tempo de unlock após assistir o rewarded */
export const REWARDED_UNLOCK_HOURS = 24;

export type AdsInitStatus = "uninitialized" | "ready" | "no-key" | "error";

let initStatus: AdsInitStatus = "uninitialized";

export function getAdsStatus(): AdsInitStatus {
  return initStatus;
}

export async function initializeAds(): Promise<void> {
  if (initStatus !== "uninitialized") return;

  if (!isNative()) {
    initStatus = "no-key"; // no web, ads ficam em modo placeholder
    return;
  }

  // TODO: quando plugar @capacitor-community/admob:
  //   const appId = isIOS() ? import.meta.env.VITE_ADMOB_IOS_APP_ID : VITE_ADMOB_ANDROID_APP_ID;
  //   if (!appId) { initStatus = "no-key"; return; }
  //   await AdMob.initialize({ requestTrackingAuthorization: true, ... });
  //   initStatus = "ready";

  initStatus = "no-key"; // mock: pretende que está em modo placeholder
}

/** Mock — quando AdMob plugar, exibe banner real e retorna função de hide */
export function showMockBanner(): { hide: () => void } {
  return { hide: () => {} };
}

/**
 * Mock do rewarded ad. Resolve com `true` se o usuário "assistiu" até o fim.
 * Quando AdMob plugar:
 *   await AdMob.prepareRewardVideoAd({ adId: REWARDED_AD_ID });
 *   const { rewarded } = await AdMob.showRewardVideoAd();
 */
export async function showMockRewardedAd(): Promise<boolean> {
  // A UI dispara o timer e resolve a Promise — este helper é só placeholder
  return true;
}
