import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card className="mt-4">
        <CardContent className="py-10 text-center">
          <History className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground text-sm">Nenhuma transferência registrada para esta planta.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          Histórico de Transferências
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative border-l border-border ml-3 space-y-6">
          {history.map((entry: TentHistoryEntry, idx: number) => (
            <li key={idx} className="ml-6">
              {/* dot */}
              <span className="absolute -left-2 flex items-center justify-center w-4 h-4 rounded-full bg-primary/20 border border-primary/40">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              </span>

              {/* date */}
              <p className="text-xs text-muted-foreground mb-1">
                {new Date(entry.movedAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>

              {/* transfer row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-sm font-medium">
                  <Home className="w-3 h-3 text-muted-foreground" />
                  {entry.fromTentName ?? "Desconhecida"}
                </span>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-sm font-medium border border-primary/20">
                  <Home className="w-3 h-3" />
                  {entry.toTentName ?? "Desconhecida"}
                </span>
              </div>

              {/* reason */}
              {entry.reason && (
                <p className="mt-1 text-xs text-muted-foreground italic">
                  Motivo: {entry.reason}
                </p>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
