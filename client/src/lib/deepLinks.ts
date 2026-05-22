/**
 * deepLinks.ts — escuta deep links e navega pra rota interna.
 *
 * Esquemas suportados:
 *
 *   cloud.evapro.cultivo://plant/123      → /plants/123
 *   cloud.evapro.cultivo://tent/45        → /tent/45
 *   cloud.evapro.cultivo://oauth/callback → /settings/sensors (Tuya callback)
 *   cloud.evapro.cultivo://chat/12        → /chat/12
 *   https://app.cultivo.pro/scan/plant/N  → /plants/N (universal link)
 *
 * Como funciona:
 *  - App.tsx chama `initDeepLinks(navigate)` no boot
 *  - Capacitor App plugin emite `appUrlOpen` quando outro app/QR/notification
 *    abre o nosso esquema
 *  - Parser extrai a parte significativa e mapeia pra rota wouter
 *
 * O navigate é passado do React (via wouter `useLocation`) pra que a navegação
 * use o roteador interno em vez de full reload.
 */

import { isNative } from "./platform";

type Navigator = (path: string) => void;

/** Parser puro: converte URL externo em path interno. Exportado pra testes. */
export function parseDeepLink(url: string): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    // ─── Esquema custom: cloud.evapro.cultivo://X/Y ───────────────────
    if (parsed.protocol === "cloud.evapro.cultivo:") {
      // No scheme custom, "host" do URL.parse vira o primeiro segmento ("plant")
      // e "pathname" vira o resto ("/123").
      const segment = parsed.host || "";
      const rest = parsed.pathname || "";

      // Mapeia os esquemas que conhecemos
      if (segment === "plant" && rest) return `/plants${rest}`;
      if (segment === "tent" && rest) return `/tent${rest}`;
      if (segment === "chat" && rest) return `/chat${rest}`;
      if (segment === "oauth" && rest === "/callback") return "/settings/sensors";

      // Fallback: usa caminho cru (host vira a "rota raiz")
      const fallback = `/${segment}${rest}`;
      // Sanity check: nada estranho que possa abrir página inesperada
      if (/^[/a-zA-Z0-9-_]+$/.test(fallback)) return fallback;
      return null;
    }

    // ─── Universal link: https://app.cultivo.pro/scan/... ──────────────
    if (parsed.protocol === "https:" && parsed.hostname === "app.cultivo.pro") {
      if (parsed.pathname.startsWith("/scan/plant/")) {
        const id = parsed.pathname.replace("/scan/plant/", "");
        return `/plants/${id}`;
      }
      if (parsed.pathname.startsWith("/scan/tent/")) {
        const id = parsed.pathname.replace("/scan/tent/", "");
        return `/tent/${id}`;
      }
      // Qualquer outro path do app.cultivo.pro — usa cru
      return parsed.pathname;
    }
  } catch {
    // URL malformada — ignora
    return null;
  }

  return null;
}

let initialized = false;

/**
 * Registra o listener Capacitor `appUrlOpen` que dispara quando o app é
 * aberto via deep link (QR code, push notification, link clicked).
 *
 * Chamar uma vez no boot. Idempotente.
 *
 * @param navigate Função pra navegar (do wouter `useLocation()[1]`)
 */
export async function initDeepLinks(navigate: Navigator): Promise<void> {
  if (initialized) return;
  if (!isNative()) return;

  try {
    const { App } = await import("@capacitor/app");

    // Listener pra QUANDO O APP JÁ ESTÁ ABERTO e recebe um URL
    await App.addListener("appUrlOpen", (event) => {
      const path = parseDeepLink(event.url);
      if (path) {
        console.log(`[deepLinks] ${event.url} → ${path}`);
        navigate(path);
      } else {
        console.warn(`[deepLinks] URL não reconhecido: ${event.url}`);
      }
    });

    // Listener pra QUANDO O APP É ABERTO PELA PRIMEIRA VEZ via URL
    // (cold start) — getLaunchUrl retorna URL inicial se houver
    const launchUrl = await App.getLaunchUrl();
    if (launchUrl?.url) {
      const path = parseDeepLink(launchUrl.url);
      if (path) {
        console.log(`[deepLinks] launch ${launchUrl.url} → ${path}`);
        // Pequeno delay pra garantir que o router montou
        setTimeout(() => navigate(path), 100);
      }
    }

    initialized = true;
  } catch (err) {
    console.warn("[deepLinks] Falha ao registrar listener:", err);
  }
}
