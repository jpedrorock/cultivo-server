/**
 * useCultivationMethod — lê o método de cultivo de uma estufa (Cultivo Orgânico Fase 1).
 *
 * Fonte de verdade: `tents.cultivationMethod` (schema). Como `tents.list` já é
 * carregada e cacheada em quase toda tela, este hook lê do cache (sem query nova)
 * e devolve o método com fallback "MINERAL" — o default seguro (app nasceu mineral).
 *
 * Uso:
 *   const method = useCultivationMethod(tentId);
 *   const isOrganic = method === "ORGANIC";
 *
 * Ver ORGANIC-IMPLEMENTATION-PLAN.md.
 */
import { trpc } from "@/lib/trpc";

export type CultivationMethod = "MINERAL" | "ORGANIC" | "COCO" | "HYDRO";

/** Métodos onde NÃO se mede EC/runoff de solução e o pH é só informativo. */
export function isSoilBasedMethod(method: CultivationMethod): boolean {
  return method === "ORGANIC";
}

/**
 * Retorna o método de cultivo da estufa `tentId`. Fallback "MINERAL" enquanto
 * carrega, se a estufa não existe, ou se `tentId` é null/undefined.
 */
export function useCultivationMethod(tentId: number | null | undefined): CultivationMethod {
  const { data: tents } = trpc.tents.list.useQuery(undefined, {
    staleTime: 60_000,
  });
  if (tentId == null || !tents) return "MINERAL";
  const tent = (tents as Array<{ id: number; cultivationMethod?: string | null }>).find(
    (t) => t.id === tentId,
  );
  return (tent?.cultivationMethod as CultivationMethod) ?? "MINERAL";
}

/**
 * Versão "alguma estufa é orgânica?" — pra telas sem tentId no escopo
 * (ex: CalculatorMenu). Útil pra decidir exibir avisos/cards orgânicos.
 */
export function useHasOrganicTent(): boolean {
  const { data: tents } = trpc.tents.list.useQuery(undefined, { staleTime: 60_000 });
  if (!tents) return false;
  return (tents as Array<{ cultivationMethod?: string | null }>).some(
    (t) => t.cultivationMethod === "ORGANIC",
  );
}
