import { trpc } from "@/lib/trpc";

/**
 * Hook compartilhado para badges de navegação (alertas + fila de secagem).
 * - React Query deduplica as queries: BottomNav e Sidebar usam o mesmo cache.
 * - SEM polling por timer (pedido do João: pouquíssimas chamadas). Busca só
 *   ao montar e ao voltar o foco pro app. Alertas urgentes chegam por push,
 *   então o badge não precisa de poll contínuo.
 */
export function useNavBadges() {
  const { data: alertCount } = trpc.alerts.getNewCount.useQuery(
    {},
    { refetchOnWindowFocus: true, staleTime: 60_000 }
  );

  const { data: harvestQueuePlants } = trpc.harvestQueue.list.useQuery(undefined, {
    refetchOnWindowFocus: true,
    staleTime: 5 * 60_000,
  });

  return {
    alertCount: alertCount ?? 0,
    harvestQueueCount: harvestQueuePlants?.length ?? 0,
  };
}
