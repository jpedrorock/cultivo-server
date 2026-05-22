/**
 * NetworkStatusBanner — pílula no topo do app que aparece quando rede muda.
 *
 * Diferente do OfflineBanner existente:
 *  - OfflineBanner: inline em páginas específicas, mostra logs pendentes
 *  - NetworkStatusBanner: GLOBAL no App.tsx, só feedback de conexão
 *
 * Design:
 *  - Pílula flutuante no topo (respeitando safe-area)
 *  - Amber quando offline, verde por 2s ao reconectar, esconde depois
 *  - Não tem botão de fechar — é estado, não ação
 *
 * Usado pra dar feedback visual imediato — sem confiar só no navigator.onLine
 * (que mente em WKWebView iOS).
 */

import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

export function NetworkStatusBanner() {
  const { connected } = useNetworkStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  // Transição offline → online → mostra "Conexão restaurada" por 2s
  useEffect(() => {
    if (!connected) {
      setWasOffline(true);
      return;
    }
    if (wasOffline) {
      setShowReconnected(true);
      const t = setTimeout(() => {
        setShowReconnected(false);
        setWasOffline(false);
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [connected, wasOffline]);

  if (connected && !showReconnected) return null;

  const offline = !connected;

  return (
    <div
      className="fixed left-0 right-0 z-[90] flex justify-center pointer-events-none"
      style={{
        top: "env(safe-area-inset-top, 0px)",
      }}
      role="status"
      aria-live="polite"
    >
      <div
        className={`mt-1 mx-3 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300 ${
          offline
            ? "bg-amber-500/95 text-amber-950"
            : "bg-emerald-500/95 text-emerald-950"
        }`}
      >
        {offline ? (
          <>
            <WifiOff className="w-3.5 h-3.5" />
            Sem conexão
          </>
        ) : (
          <>
            <Wifi className="w-3.5 h-3.5" />
            Conexão restaurada
          </>
        )}
      </div>
    </div>
  );
}
