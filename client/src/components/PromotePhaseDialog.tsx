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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface PromotePhaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: number;
  tentId: number;
  currentPhase: "VEGA" | "FLORA";
  currentTentName: string;
}

export function PromotePhaseDialog({
  open,
  onOpenChange,
  cycleId,
  tentId,
  currentPhase,
  currentTentName,
}: PromotePhaseDialogProps) {
  const [moveToTent, setMoveToTent] = useState<boolean>(false);
  const [selectedTentId, setSelectedTentId] = useState<string>("");
  const utils = trpc.useUtils();

  // Determinar fase destino
  const targetPhase = currentPhase === "VEGA" ? "FLORA" : "DRYING";

  // Buscar estufas disponíveis (sem ciclo ativo)
  const { data: allTents } = trpc.tents.list.useQuery();
  const { data: activeCycles } = trpc.cycles.listActive.useQuery();

  // Filtrar estufas que não têm ciclo ativo
  const availableTents = allTents?.filter(
    (tent) => !activeCycles?.some((cycle) => cycle.tentId === tent.id)
  );

  const promotePhaseMutation = trpc.cycles.promotePhase.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      onOpenChange(false);
      // Invalida todos os dados dependentes da fase
      utils.cycles.getActiveCyclesWithProgress.invalidate();
      utils.cycles.listActive.invalidate();
      utils.tents.getById.invalidate({ id: tentId });
      utils.tents.list.invalidate();
      utils.alerts.list.invalidate();
      if (data.movedPlants) {
        utils.plants.list.invalidate();
      }
    },
    onError: (error) => {
      toast.error(`Erro ao promover fase: ${error.message}`);
    },
  });

  const handlePromote = () => {
    if (moveToTent && !selectedTentId) {
      toast.error("Selecione uma estufa destino");
      return;
    }

    promotePhaseMutation.mutate({
      cycleId,
      targetPhase,
      moveToTent,
      targetTentId: selectedTentId ? parseInt(selectedTentId) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-blue-500" />
            Promover para {targetPhase === "FLORA" ? "Floração" : "Secagem"}
          </DialogTitle>
          <DialogDescription>
            Avançar o ciclo de {currentPhase === "VEGA" ? "Vegetativa" : "Floração"} para {targetPhase === "FLORA" ? "Floração" : "Secagem"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup
            value={moveToTent ? "move" : "stay"}
            onValueChange={(value) => setMoveToTent(value === "move")}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="stay" id="stay" />
              <Label htmlFor="stay" className="font-normal cursor-pointer">
                Manter na estufa atual ({currentTentName})
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="move" id="move" />
              <Label htmlFor="move" className="font-normal cursor-pointer">
                Mover para outra estufa
              </Label>
            </div>
          </RadioGroup>

          {moveToTent && (
            <div className="space-y-2 pl-6">
              <label className="text-sm font-medium">Estufa Destino</label>
              <Select value={selectedTentId} onValueChange={setSelectedTentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma estufa vazia" />
                </SelectTrigger>
                <SelectContent>
                  {availableTents && availableTents.length > 0 ? (
                    availableTents.map((tent) => (
                      <SelectItem key={tent.id} value={tent.id.toString()}>
                        {tent.name} ({tent.category})
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-sm text-muted-foreground">
                      Nenhuma estufa disponível. Finalize um ciclo primeiro.
                    </div>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Apenas estufas sem ciclo ativo são exibidas
              </p>
            </div>
          )}

          <div className="rounded-lg bg-muted p-4 space-y-2">
            <p className="text-sm font-medium">O que vai acontecer:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              {moveToTent ? (
                <>
                  <li>• Todas as plantas serão movidas para a estufa destino</li>
                  <li>• Novo ciclo de {targetPhase} será criado na estufa destino</li>
                  <li>• Ciclo atual será finalizado</li>
                  <li>• Estufa atual ({currentTentName}) ficará vazia</li>
                </>
              ) : (
                <>
                  <li>• Ciclo avançará para fase {targetPhase}</li>
                  <li>• Plantas permanecerão na {currentTentName}</li>
                  <li>• Data de início da {targetPhase} será registrada</li>
                </>
              )}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={promotePhaseMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handlePromote}
            disabled={promotePhaseMutation.isPending}
          >
            {promotePhaseMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Promover para {targetPhase === "FLORA" ? "Floração" : "Secagem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
