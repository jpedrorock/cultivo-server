/**
 * useOnboardingTour — gerencia o flag "tour de boas-vindas concluído".
 *
 * Diferente do OnboardingWizard:
 *  - Wizard = setup técnico (criar primeira estufa/strain/planta)
 *  - Tour = apresentação visual das features (4 slides marketing-style)
 *
 * Storage:
 *  - Capacitor Preferences (iOS Keychain-backed, Android EncryptedSharedPreferences)
 *  - O plugin tem fallback automático pra localStorage no web, então funciona
 *    em qualquer plataforma sem código extra.
 *
 * Versão v1 no key: se mudarmos os slides depois (v2 com novos features),
 * basta incrementar pra re-disparar pra todo mundo.
 */

import { Preferences } from "@capacitor/preferences";
import { useEffect, useState } from "react";
import { isNative } from "@/lib/platform";

const KEY = "cultivo_onboarding_tour_done_v1";

export async function isTourDone(): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    return value === "1";
  } catch {
    // Preferences indisponível (improvável) → assume true pra não bloquear UX
    return true;
  }
}

export async function markTourDone(): Promise<void> {
  try {
    await Preferences.set({ key: KEY, value: "1" });
  } catch {
    // Falha silenciosa — pior caso: tour aparece de novo no próximo launch
  }
}

export async function resetTour(): Promise<void> {
  try {
    await Preferences.remove({ key: KEY });
  } catch {
    /* idem */
  }
}

/**
 * Hook reativo pro tour. Lê o flag async no mount e expõe controles.
 *
 * @param options.onlyOnNative se true, nunca mostra em web (default true).
 *   Como o app web já está rodando em produção com users existentes, mostrar
 *   o tour pra eles seria intrusivo. Mantemos só pra primeiro launch nativo.
 */
export function useOnboardingTour(options: { onlyOnNative?: boolean } = {}) {
  const { onlyOnNative = true } = options;
  const [shouldShow, setShouldShow] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (onlyOnNative && !isNative()) {
      setChecked(true);
      setShouldShow(false);
      return;
    }
    isTourDone().then((done) => {
      if (cancelled) return;
      setShouldShow(!done);
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [onlyOnNative]);

  const complete = async () => {
    await markTourDone();
    setShouldShow(false);
  };

  const reset = async () => {
    await resetTour();
    setShouldShow(true);
  };

  return { shouldShow, checked, complete, reset };
}
