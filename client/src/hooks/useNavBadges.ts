import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";

/**
 * Hook compartilhado para badges de navegação (alertas + fila de secagem).
 * - React Query deduplica as queries: BottomNav e Sidebar usam o mesmo cache.
 * - Polling pausado automaticamente quando a aba fica em segundo plano
 *   (Page Visibility API), economizando rede e bateria.
 */
export function useNavBadges() {
  const [isVisible, setIsVisible] = useState(() => document.visibilityState === "visible");

  useEffect(() => {
    const handler = () => setIsVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const refetchInterval = isVisible ? 30_000 : false;

  const { data: alertCount } = trpc.alerts.getNewCount.useQuery(
    {},
    { refetchInterval }
  );

  const { data: harvestQueuePlants } = trpc.harvestQueue.list.useQuery(undefined, {
    refetchInterval: isVisible ? 60_000 : false,
  });

  return {
    alertCount: alertCount ?? 0,
    harvestQueueCount: harvestQueuePlants?.length ?? 0,
  };
}
