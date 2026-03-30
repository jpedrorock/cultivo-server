import { trpc } from "@/lib/trpc";
import { History, ArrowRight, Home, Loader2 } from "lucide-react";

interface TentHistoryEntry {
  id: number;
  plantId: number;
  fromTentId: number | null;
  toTentId: number | null;
  movedAt: Date | string | number;
  reason: string | null;
  fromTentName: string | null;
  toTentName: string | null;
}

interface PlantTentHistoryTabProps {
  plantId: number;
}

export default function PlantTentHistoryTab({ plantId }: PlantTentHistoryTabProps) {
  const { data: history, isLoading } = trpc.plants.getTentHistory.useQuery({ plantId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card py-10 text-center">
        <History className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">Nenhuma transferência registrada</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Mova a planta para uma estufa diferente para ver o histórico
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-base font-semibold">Histórico de Transferências</h3>
        <span className="text-xs text-muted-foreground font-normal">
          ({history.length} registro{history.length !== 1 ? "s" : ""})
        </span>
      </div>

      <div className="relative ml-2 pl-4 border-l border-border/40 space-y-1">
        {history.map((entry: TentHistoryEntry, idx: number) => (
          <div key={idx} className="relative">
            {/* Timeline dot */}
            <span className="absolute -left-[21px] top-4 flex items-center justify-center w-4 h-4 rounded-full bg-card border border-border/60">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
            </span>

            <div className="rounded-2xl border border-border/40 bg-card px-4 py-3">
              {/* Date */}
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-2">
                {new Date(entry.movedAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>

              {/* Transfer row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border/40 bg-card/50 text-sm text-muted-foreground">
                  <Home className="w-3 h-3 shrink-0" />
                  {entry.fromTentName ?? "Desconhecida"}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-primary/30 bg-primary/10 text-sm text-primary font-medium">
                  <Home className="w-3 h-3 shrink-0" />
                  {entry.toTentName ?? "Desconhecida"}
                </span>
              </div>

              {/* Reason */}
              {entry.reason && (
                <p className="mt-2 text-xs text-muted-foreground/70 italic">
                  {entry.reason}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
