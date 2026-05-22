/**
 * appTrackingTransparency.ts — wrapper sobre App Tracking Transparency (iOS 14.5+)
 *
 * O que é:
 *  - Apple exige permissão EXPLÍCITA antes de usar IDFA (identifier for advertisers)
 *    pra ads personalizados. Sem prompt ATT, AdMob personalized = bloqueado.
 *
 * Status atual:
 *  - Plugin `@capacitor-community/app-tracking-transparency` ainda NÃO instalado
 *    (vai ser instalado quando comprar Apple Developer + AdMob real)
 *  - Wrapper aqui retorna "denied" por default → AdMob recebe `npa=1` (não-personalized)
 *  - Quando ativar AdMob real, descomentar a parte que chama o plugin
 *
 * Como ativar (quando comprar Apple Dev + criar AdMob):
 *   1. pnpm add @capacitor-community/app-tracking-transparency
 *   2. npx cap sync ios
 *   3. Adicionar ao Info.plist:
 *      NSUserTrackingUsageDescription = "Cultivo usa identificadores anônimos
 *        para mostrar anúncios mais relevantes."
 *   4. Remover bloco STUB ATUAL abaixo
 *   5. Chamar requestTrackingAuthorization() ANTES de inicializar AdMob
 *
 * Fluxo correto:
 *   1. App boot → AdMob init com `npa=1` por default
 *   2. User toca em CTA que dispara ATT prompt (ex: "Ver anúncios relevantes")
 *   3. Se granted → reinicializa AdMob sem `npa`
 *   4. Se denied/restricted → continua com `npa=1` (anúncios genéricos)
 */

import { isNative, isIOS } from "./platform";

export type ATTStatus =
  | "authorized"     // user permitiu — pode usar IDFA + personalized ads
  | "denied"         // user negou — só ads genéricos (npa=1)
  | "notDetermined"  // ainda não pediu — chamar requestTrackingAuthorization
  | "restricted";    // restrição parental ou MDM — só ads genéricos

/**
 * Detecta se ATT é aplicável no contexto atual.
 *  - iOS 14.5+: aplicável
 *  - Android, web, iOS < 14.5: não aplicável (sempre "authorized" implícito)
 *
 * Cuidado: detectar iOS version dentro do app exige plugin separado ou parser
 * de userAgent. Por simplicidade, retornamos true pra qualquer iOS native.
 */
export function isATTApplicable(): boolean {
  return isNative() && isIOS();
}

/**
 * Verifica o status atual sem mostrar prompt.
 *
 * STUB ATUAL: retorna "denied" sempre (pq plugin não instalado).
 * Isso força AdMob a usar `npa=1` — anúncios genéricos.
 */
export async function getTrackingStatus(): Promise<ATTStatus> {
  if (!isATTApplicable()) return "authorized";

  // ===== STUB ATUAL — remover quando plugin instalado =====
  return "denied";
  // =========================================================

  // ===== FUTURO (após pnpm add @capacitor-community/app-tracking-transparency) =====
  /*
  try {
    const { AppTrackingTransparency } = await import("@capacitor-community/app-tracking-transparency");
    const result = await AppTrackingTransparency.getStatus();
    return result.status as ATTStatus;
  } catch {
    return "denied";
  }
  */
  // =========================================================
}

/**
 * Mostra o prompt ATT do iOS. Só funciona uma vez por instalação —
 * depois disso, o user precisa ir em Ajustes manualmente pra mudar.
 *
 * STUB ATUAL: retorna "denied" sem mostrar nada (pq plugin não instalado).
 */
export async function requestTrackingAuthorization(): Promise<ATTStatus> {
  if (!isATTApplicable()) return "authorized";

  // ===== STUB ATUAL =====
  console.log("[ATT] STUB — prompt não mostrado. Instalar plugin pra ativar.");
  return "denied";
  // =========================================================

  // ===== FUTURO =====
  /*
  try {
    const { AppTrackingTransparency } = await import("@capacitor-community/app-tracking-transparency");
    const result = await AppTrackingTransparency.requestPermission();
    return result.status as ATTStatus;
  } catch (err) {
    console.warn("[ATT] request falhou:", err);
    return "denied";
  }
  */
  // =========================================================
}

/**
 * Helper pra AdMob: deve usar anúncios não-personalizados (npa=1)?
 * Retorna true se ATT foi negado OU se ainda não foi pedido (Apple exige).
 */
export async function shouldUseNonPersonalizedAds(): Promise<boolean> {
  const status = await getTrackingStatus();
  return status !== "authorized";
}
