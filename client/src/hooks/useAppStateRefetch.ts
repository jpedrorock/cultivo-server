/**
 * useAppStateRefetch — escuta evento "voltou do background" e invalida queries.
 *
 * Em mobile, o user pode ficar minutos/horas com o app em segundo plano
 * (push notification, app switcher, etc). Ao voltar, os dados podem estar
 * stale: tarefas geradas, ciclos atualizados, plano expirou, etc.
 *
 * Plugins usados:
 *  - @capacitor/app — appStateChange ({ isActive: boolean })
 *
 * No web, usamos document.visibilitychange como fallback.
 *
 * Estratégia de invalidação:
 *  - Não invalida TUDO (pode causar muitas requests)
 *  - Invalida queries "voláteis": tents, cycles, alerts, tasks, plants, usePlan
 *  - Queries "estáveis" (strains, weeklyTargets) mantêm cache
 *
 * Hook é usado UMA VEZ no AuthenticatedAppInner pra ter listener global.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isNative } from "@/lib/platform";

// Lista de routers tRPC que devem revalidar ao voltar do background.
// Adicionar aqui novos routers que precisam de dados frescos.
const VOLATILE_QUERY_KEYS = [
  "tents",
  "cycles",
  "alerts",
  "tasks",
  "plants",
  "subscription",
];

export function useAppStateRefetch() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let lastBackgroundAt: number | null = null;

    const refetchVolatile = () => {
      // Só refetch se ficou MAIS DE 30s em background — evita request spam
      // quando user só puxa notification center e fecha em seguida.
      if (lastBackgroundAt && Date.now() - lastBackgroundAt < 30_000) return;
      VOLATILE_QUERY_KEYS.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: [[key]], exact: false });
      });
    };

    if (isNative()) {
      (async () => {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            refetchVolatile();
            lastBackgroundAt = null;
          } else {
            lastBackgroundAt = Date.now();
          }
        });
        cleanup = () => {
          handle.remove().catch(() => {});
        };
      })().catch(() => {});
    } else {
      const onVisibility = () => {
        if (document.visibilityState === "visible") {
          refetchVolatile();
          lastBackgroundAt = null;
        } else {
          lastBackgroundAt = Date.now();
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      cleanup = () => document.removeEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cleanup?.();
    };
  }, [queryClient]);
}
