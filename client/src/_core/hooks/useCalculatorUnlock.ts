import { useCallback, useEffect, useState } from "react";
import { Preferences } from "@capacitor/preferences";
import { isNative } from "@/lib/platform";
import { REWARDED_UNLOCK_HOURS } from "@/lib/ads";

const STORAGE_PREFIX = "calc_unlock_";

async function readUnlock(id: string): Promise<number | null> {
  if (!isNative()) {
    const v = localStorage.getItem(STORAGE_PREFIX + id);
    return v ? Number(v) : null;
  }
  const { value } = await Preferences.get({ key: STORAGE_PREFIX + id });
  return value ? Number(value) : null;
}

async function writeUnlock(id: string, expiresAt: number): Promise<void> {
  if (!isNative()) {
    localStorage.setItem(STORAGE_PREFIX + id, String(expiresAt));
    return;
  }
  await Preferences.set({ key: STORAGE_PREFIX + id, value: String(expiresAt) });
}

/**
 * Hook pra gerenciar "unlock temporário via rewarded ad" de uma calculadora Pro.
 *
 * Uso:
 *   const { unlocked, expiresAt, grantUnlock } = useCalculatorUnlock("nutrients");
 *   if (!unlocked) abrirRewardedModal(() => grantUnlock());
 */
export function useCalculatorUnlock(id: string) {
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const stored = await readUnlock(id);
    if (stored && stored > Date.now()) {
      setExpiresAt(stored);
    } else {
      setExpiresAt(null);
    }
    setLoaded(true);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const grantUnlock = useCallback(async () => {
    const expires = Date.now() + REWARDED_UNLOCK_HOURS * 60 * 60 * 1000;
    await writeUnlock(id, expires);
    setExpiresAt(expires);
  }, [id]);

  const unlocked = expiresAt !== null && expiresAt > Date.now();

  return {
    unlocked,
    expiresAt: unlocked ? new Date(expiresAt!) : null,
    grantUnlock,
    loaded,
  };
}
