/**
 * Sign in with Apple — wrapper sobre @capacitor-community/apple-sign-in
 *
 * Por que esse wrapper existe?
 *  - O plugin nativo só funciona em iOS Capacitor — no web/Android lança erro
 *  - Queremos uma API que retorna { success, error? } pra UI tratar de forma genérica
 *  - O servidor faz toda a validação crítica (JWKS) — esse arquivo só orquestra a UI
 *
 * Como o plugin retorna os dados:
 *  - identityToken: JWT assinado pela Apple — único campo que o backend confia
 *  - authorizationCode: opcional, usado se quisermos hit endpoint /auth/token (revogação)
 *  - fullName: SÓ vem no PRIMEIRO login do user nesse app (Apple não re-envia)
 *  - email: SÓ vem no PRIMEIRO login também
 *  - user: identifier estável (= sub no identityToken)
 *
 * Importante: plugin ainda NÃO está instalado.
 * Pra ativar:
 *   pnpm add @capacitor-community/apple-sign-in
 *   npx cap sync ios
 * Depois remover o stub abaixo e usar o import comentado.
 */

import { isIOS, isNative, apiUrl } from "./platform";

export type AppleSignInResult =
  | { success: true; token: string; user: { id: number; email: string; name: string | null; role: string } }
  | { success: false; pending: boolean; error: string };

/**
 * Detecta se Apple Sign In está disponível no contexto atual.
 * Hoje: só iOS native. Futuro: pode ser ampliado pra Apple Sign In JS no web.
 */
export function isAppleSignInAvailable(): boolean {
  return isNative() && isIOS();
}

/**
 * Dispara o prompt nativo da Apple e envia o resultado pro backend.
 *
 * Stub atual: retorna erro porque o plugin Capacitor ainda não foi instalado.
 * Quando rodar `pnpm add @capacitor-community/apple-sign-in` + `npx cap sync ios`,
 * descomentar o bloco "FUTURO" abaixo e remover o "STUB ATUAL".
 */
export async function signInWithApple(): Promise<AppleSignInResult> {
  if (!isAppleSignInAvailable()) {
    return { success: false, pending: false, error: "Sign in with Apple só está disponível no app iOS." };
  }

  // ===== STUB ATUAL — remover quando plugin instalado =====
  return {
    success: false,
    pending: false,
    error: "Sign in with Apple ainda não foi habilitado neste build. Instale o plugin Capacitor.",
  };
  // =========================================================

  // ===== FUTURO (após pnpm add @capacitor-community/apple-sign-in) =====
  /*
  try {
    const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");

    const result = await SignInWithApple.authorize({
      clientId: "cloud.evapro.cultivo", // mesmo bundle ID do app iOS
      redirectURI: "https://app.cultivo.pro/api/auth/apple", // tem que estar configurado no Apple Dev
      scopes: "email name",
      state: crypto.randomUUID(),
    });

    if (!result.response?.identityToken) {
      return { success: false, pending: false, error: "Apple não retornou identityToken." };
    }

    // POSTa pro backend pra validar e fazer login
    const { persistAuthToken } = await import("@/_core/hooks/useAuth");
    const res = await fetch(apiUrl("/api/auth/apple"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client": "capacitor",
      },
      body: JSON.stringify({
        identityToken: result.response.identityToken,
        authorizationCode: result.response.authorizationCode,
        fullName: {
          givenName: result.response.givenName ?? null,
          familyName: result.response.familyName ?? null,
        },
        email: result.response.email ?? null,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        pending: data.code === "PENDING_APPROVAL",
        error: data.error ?? "Falha ao autenticar com Apple.",
      };
    }

    await persistAuthToken(data.token);
    return { success: true, token: data.token, user: data.user };
  } catch (err: any) {
    // Apple plugin lança erro quando user cancela — tratar separadamente
    if (err?.code === "1001" || err?.error === "popup_closed_by_user") {
      return { success: false, pending: false, error: "Login cancelado." };
    }
    return { success: false, pending: false, error: err?.message ?? "Erro desconhecido no Apple Sign In." };
  }
  */
  // =========================================================
}
