import { Purchases, type PurchasesOffering, type PurchasesPackage, LOG_LEVEL } from "@revenuecat/purchases-capacitor";
import { isNative, isIOS, isAndroid } from "./platform";

let initialized = false;

function getApiKey(): string | null {
  const iosKey = import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined;
  const androidKey = import.meta.env.VITE_REVENUECAT_ANDROID_KEY as string | undefined;
  if (isIOS()) return iosKey ?? null;
  if (isAndroid()) return androidKey ?? null;
  return null;
}

export async function initRevenueCat(userId: number | string): Promise<boolean> {
  if (!isNative()) return false;
  if (initialized) return true;

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[RC] VITE_REVENUECAT_*_KEY não configurada — paywall em modo placeholder");
    return false;
  }

  try {
    await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
    await Purchases.configure({
      apiKey,
      appUserID: String(userId),
    });
    initialized = true;
    return true;
  } catch (err) {
    console.error("[RC] Falha ao inicializar:", err);
    return false;
  }
}

export async function isInitialized(): Promise<boolean> {
  return initialized;
}

export async function logoutRevenueCat(): Promise<void> {
  if (!initialized) return;
  try {
    await Purchases.logOut();
  } catch (err) {
    console.warn("[RC] Falha ao logout:", err);
  }
  initialized = false;
}

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!initialized) return null;
  try {
    const { current } = await Purchases.getOfferings();
    return current ?? null;
  } catch (err) {
    console.error("[RC] getOfferings falhou:", err);
    return null;
  }
}

export async function purchase(pkg: PurchasesPackage): Promise<{ success: boolean; cancelled?: boolean; error?: string }> {
  if (!initialized) return { success: false, error: "RC not initialized" };
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    const hasPro = "pro" in (customerInfo.entitlements?.active ?? {});
    return { success: hasPro };
  } catch (err: any) {
    if (err?.userCancelled) return { success: false, cancelled: true };
    return { success: false, error: err?.message ?? String(err) };
  }
}

export async function restorePurchases(): Promise<{ success: boolean; isPro: boolean; error?: string }> {
  if (!initialized) return { success: false, isPro: false, error: "RC not initialized" };
  try {
    const customerInfo = await Purchases.restorePurchases();
    const hasPro = "pro" in (customerInfo.customerInfo.entitlements?.active ?? {});
    return { success: true, isPro: hasPro };
  } catch (err: any) {
    return { success: false, isPro: false, error: err?.message ?? String(err) };
  }
}
