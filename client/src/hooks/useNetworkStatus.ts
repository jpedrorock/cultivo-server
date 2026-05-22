/**
 * useNetworkStatus — detecta online/offline em todas as plataformas.
 *
 * Estratégia híbrida:
 *  - Native (iOS/Android): usa @capacitor/network — mais confiável, eventos
 *    do sistema operacional (transição WiFi↔4G é detectada na hora)
 *  - Web: navigator.onLine + listeners 'online'/'offline' do browser
 *
 * Retorna:
 *  - connected: boolean (false = offline)
 *  - connectionType: 'wifi' | 'cellular' | 'none' | 'unknown'
 *
 * Por que NÃO confiar só em navigator.onLine?
 *  - Em iOS WKWebView, navigator.onLine fica `true` mesmo sem rede real
 *  - Plugin nativo escuta NWPathMonitor (iOS) / ConnectivityManager (Android)
 *    que são reportes do kernel, infalíveis.
 */

import { useEffect, useState } from "react";
import { isNative } from "@/lib/platform";

export type ConnectionType = "wifi" | "cellular" | "none" | "unknown";

export interface NetworkStatus {
  connected: boolean;
  connectionType: ConnectionType;
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(() => {
    if (typeof navigator !== "undefined" && "onLine" in navigator) {
      return { connected: navigator.onLine, connectionType: "unknown" };
    }
    return { connected: true, connectionType: "unknown" };
  });

  useEffect(() => {
    let cleanup: (() => void) | null = null;

    if (isNative()) {
      // Native path — @capacitor/network
      (async () => {
        const { Network } = await import("@capacitor/network");

        // Estado inicial
        const initial = await Network.getStatus();
        setStatus({
          connected: initial.connected,
          connectionType: (initial.connectionType as ConnectionType) ?? "unknown",
        });

        // Listener de mudanças
        const handle = await Network.addListener("networkStatusChange", (state) => {
          setStatus({
            connected: state.connected,
            connectionType: (state.connectionType as ConnectionType) ?? "unknown",
          });
        });

        cleanup = () => {
          handle.remove().catch(() => {});
        };
      })().catch(() => {
        // Falha silenciosa — fallback pra navigator.onLine abaixo
      });
    } else {
      // Web path — navigator.onLine + listeners
      const onOnline = () => setStatus({ connected: true, connectionType: "unknown" });
      const onOffline = () => setStatus({ connected: false, connectionType: "none" });
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      cleanup = () => {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
      };
    }

    return () => {
      cleanup?.();
    };
  }, []);

  return status;
}
