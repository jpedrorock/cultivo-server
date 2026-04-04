import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Sprout } from "lucide-react";
import { toast } from "sonner";

interface MoveTentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plantId: number;
  plantName: string;
  currentTentId: number;
  onSuccess: () => void;
}

export default function MoveTentModal({
  open,
  onOpenChange,
  plantId,
  plantName,
  currentTentId,
  onSuccess,
}: MoveTentModalProps) {
  const [selectedTentId, setSelectedTentId] = useState<number | null>(null);

  // Buscar todas as estufas
  const { data: tents, isLoading } = trpc.tents.list.useQuery(undefined, {
    enabled: open,
  });

  // Buscar ciclos ativos
  const { data: cycles } = trpc.cycles.listActive.useQuery(undefined, {
    enabled: open,
  });

  // Mutation para mover planta
  const moveMutation = trpc.plants.moveTent.useMutation({
    onSuccess: () => {
      const targetTent = tents?.find((t) => t.id === selectedTentId);
      toast.success(`Planta movida para ${targetTent?.name} com sucesso!`);
      onSuccess();
      onOpenChange(false);
      setSelectedTentId(null);
    },
    onError: (error) => {
      toast.error(`Erro ao mover planta: ${error.message}`);
    },
  });

  const handleMove = () => {
    if (!selectedTentId) {
      toast.error("Selecione uma estufa de destino");
      return;
    }

    if (selectedTentId === currentTentId) {
      toast.error("A planta já está nesta estufa");
      return;
    }

    moveMutation.mutate({
      plantId,
      toTentId: selectedTentId,
      reason: "Movimentação manual",
    });
  };

  // Mapear ciclos por tentId
  const cyclesByTent = cycles?.reduce((acc, cycle) => {
    acc[cycle.tentId] = cycle;
    return acc;
  }, {} as Record<number, any>) || {};

  // Calcular fase e semana de cada estufa
  const getTentPhaseInfo = (tentId: number) => {
    const cycle = cyclesByTent[tentId];
    if (!cycle) return { phase: "Sem ciclo", week: null };

    const now = new Date();
    const startDate = new Date(cycle.startDate);
    const floraStartDate = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;

    if (floraStartDate && now >= floraStartDate) {
      const daysInFlora = Math.floor((now.getTime() - floraStartDate.getTime()) / (1000 * 60 * 60 * 24));
      const week = Math.floor(daysInFlora / 7) + 1;
      return { phase: "Flora", week };
    } else {
      const daysInVega = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const week = Math.floor(daysInVega / 7) + 1;
      return { phase: "Vega", week };
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Mover Planta para Outra Estufa</DialogTitle>
          <DialogDescription>
            Selecione a estufa de destino para <strong>{plantName}</strong>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            Carregando estufas...
          </div>
        ) : (
          <div className="grid gap-3 py-4">
            {tents?.map((tent) => {
              const { phase, week } = getTentPhaseInfo(tent.id);
              const isCurrent = tent.id === currentTentId;
              const isSelected = tent.id === selectedTentId;

              return (
                <Card
                  key={tent.id}
                  className={`cursor-pointer transition-all ${
                    isSelected
                      ? "ring-2 ring-primary"
                      : isCurrent
                      ? "bg-muted/50"
                      : "hover:bg-accent"
                  }`}
                  onClick={() => !isCurrent && setSelectedTentId(tent.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-primary/10 p-2">
                          <Sprout className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{tent.name}</h4>
                            {isCurrent && (
                              <Badge variant="secondary">Atual</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {phase}
                            {week && ` - Semana ${week}`}
                          </p>
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="h-6 w-6 text-primary" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setSelectedTentId(null);
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleMove}
            disabled={!selectedTentId || moveMutation.isPending}
          >
            {moveMutation.isPending ? "Movendo..." : "Confirmar Movimentação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
