/**
 * sentry.ts — wrapper sobre @sentry/capacitor (que internamente usa @sentry/react)
 *
 * Inicialização opcional via env:
 *   VITE_SENTRY_DSN="https://xxx@yyy.ingest.sentry.io/zzz"
 *
 * Se a env var não estiver setada, todas as funções são no-op.
 * Isso permite que dev local rode sem precisar configurar nada.
 *
 * Por que @sentry/capacitor (e não só @sentry/react)?
 *  - Em iOS/Android, intercepta também crashes NATIVOS (não só JS)
 *  - Stack trace de chamadas Capacitor plugin → backend nativo
 *  - Em web, age igual ao @sentry/react puro
 *
 * Quando criar a conta:
 *  1. https://sentry.io → free tier (5k errors/month)
 *  2. Create project: Capacitor (iOS) + Capacitor (Android) + React (web)
 *  3. Copiar DSN, colocar em VITE_SENTRY_DSN
 *  4. Pronto — passa a capturar crashes + JS errors automaticamente
 */

import { isNative, isIOS, isAndroid } from "./platform";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || dsn.trim().length === 0) {
    // Sem DSN configurado — pula. Modo dev local sem conta Sentry.
    return;
  }

  const environment = (import.meta.env.MODE as string) || "production";
  const release = (import.meta.env.VITE_APP_VERSION as string | undefined) || "unknown";

  // Lazy import — evita custo no bundle se DSN não setada
  import("@sentry/capacitor").then((Sentry) => {
    import("@sentry/react").then((SentryReact) => {
      try {
        // @sentry/capacitor 4.x usa @sentry/core 10.43 internamente
        // e @sentry/react 10.53 usa core 10.53 — versões "compatíveis"
        // funcionalmente, mas TypeScript bate em tipos internos (Integration[],
        // Client<>) que diferem entre versões. Cast pra any é PRAGMÁTICO:
        // o runtime funciona, só o type system é stricter que precisa.
        // Remover quando @sentry/capacitor alinhar major version.
        const init = SentryReact.init as unknown as Parameters<typeof Sentry.init>[1];
        Sentry.init(
          {
            dsn,
            environment,
            release,
            // Sample rate: 100% pra capturar TUDO.
            sampleRate: 1.0,
            // Performance / tracing: 10% — só pra ter dados sem pagar caro
            tracesSampleRate: 0.1,
            // Aviso útil em dev mas spammy em prod
            debug: false,
            // Tags estáticas pra todos eventos
            initialScope: {
              tags: {
                platform: isNative() ? (isIOS() ? "ios" : isAndroid() ? "android" : "native") : "web",
              },
            },
            // Filtra erros que NÃO valem reportar (ruído)
            beforeSend(event) {
              const msg = event.exception?.values?.[0]?.value ?? "";
              if (msg.includes("NetworkError")) return null;
              if (msg.includes("Load failed")) return null;
              if (msg.includes("Failed to fetch dynamically imported")) return null;
              return event;
            },
          },
          init
        );
        initialized = true;
        if (import.meta.env.DEV) console.log("[sentry] inicializado", { env: environment, release });
      } catch (err) {
        console.warn("[sentry] init falhou:", err);
      }
    });
  }).catch((err) => {
    console.warn("[sentry] dynamic import falhou:", err);
  });
}

/**
 * Captura uma exception manualmente. Use em catch blocks importantes.
 *
 * ```ts
 * try { await mutation.mutateAsync(...); }
 * catch (err) {
 *   captureException(err, { extra: { plantId, action: 'save' } });
 *   throw err;
 * }
 * ```
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) {
    // Sem Sentry inicializado → loga no console pra ter feedback em dev
    if (import.meta.env.DEV) console.error("[captureException] (sentry off)", err, context);
    return;
  }
  import("@sentry/capacitor").then((Sentry) => {
    try {
      Sentry.captureException(err, { extra: context });
    } catch {
      /* falha silenciosa */
    }
  }).catch(() => {});
}

/**
 * Marca um user ID nos eventos pra agrupar crashes por usuário no dashboard.
 * Não loga email/PII — só o ID numérico.
 */
export function setSentryUser(userId: number | null): void {
  if (!initialized) return;
  import("@sentry/capacitor").then((Sentry) => {
    try {
      if (userId === null) {
        Sentry.setUser(null);
      } else {
        Sentry.setUser({ id: String(userId) });
      }
    } catch {
      /* no-op */
    }
  }).catch(() => {});
}

/**
 * Adiciona um breadcrumb pra contextualizar erros futuros.
 * Útil pra rastrear sequência de ações antes de um crash.
 */
export function addSentryBreadcrumb(message: string, data?: Record<string, unknown>): void {
  if (!initialized) return;
  import("@sentry/capacitor").then((Sentry) => {
    try {
      Sentry.addBreadcrumb({ message, data, level: "info" });
    } catch {
      /* no-op */
    }
  }).catch(() => {});
}
