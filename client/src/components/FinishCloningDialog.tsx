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
import { Loader2, Sprout } from "lucide-react";
import { toast } from "sonner";

interface FinishCloningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: number;
  motherPlantId: number;
  motherPlantName: string;
  clonesCount: number;
}

export function FinishCloningDialog({
  open,
  onOpenChange,
  cycleId,
  motherPlantId,
  motherPlantName,
  clonesCount,
}: FinishCloningDialogProps) {

  const [selectedTentId, setSelectedTentId] = useState<string>("");
  const [seedlingCount, setSeedlingCount] = useState<number>(clonesCount);
  const utils = trpc.useUtils();

  // Buscar estufas disponíveis (sem ciclo ativo)
  const { data: allTents } = trpc.tents.list.useQuery();
  const { data: activeCycles } = trpc.cycles.listActive.useQuery();

  // Filtrar estufas que não têm ciclo ativo
  const availableTents = allTents?.filter(
    (tent) => !activeCycles?.some((cycle) => cycle.tentId === tent.id)
  );

  const finishCloningMutation = trpc.cycles.finishCloning.useMutation({
    onSuccess: (data) => {
      toast.success(`Clonagem finalizada! ${data.seedlingsCreated} mudas criadas em ${data.targetTentName}`);
      onOpenChange(false);
      // Refetch cycles to update UI
      utils.cycles.getActiveCyclesWithProgress.refetch();
      utils.cycles.listActive.refetch();
      utils.plants.list.refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao finalizar clonagem: ${error.message}`);
    },
  });

  const handleFinish = () => {
    if (!selectedTentId) {
      toast.error("Selecione uma estufa destino para as mudas");
      return;
    }

    finishCloningMutation.mutate({
      cycleId,
      targetTentId: parseInt(selectedTentId),
      motherPlantId,
      clonesProduced: seedlingCount,
      seedlingCount,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sprout className="h-5 w-5 text-green-500" />
            Finalizar Clonagem
          </DialogTitle>
          <DialogDescription>
            Gerar {clonesCount} mudas de {motherPlantName} e transferir para outra estufa
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Número de Mudas</label>
            <input
              type="text"
              inputMode="numeric"
              value={seedlingCount}
              onChange={(e) => setSeedlingCount(parseInt(e.target.value.replace(/\D/g, '')) || 1)}
              className="w-full px-3 py-2 border rounded-md"
            />
            <p className="text-xs text-muted-foreground">
              Quantas mudas você deseja gerar (1-50)
            </p>
          </div>

          <div className="space-y-2">
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

          <div className="rounded-lg bg-muted p-4 space-y-2">
            <p className="text-sm font-medium">Resumo:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• {seedlingCount} mudas serão criadas</li>
              <li>• Mudas herdarão a genética de {motherPlantName}</li>
              <li>• Ciclo da estufa atual voltará para MANUTENÇÃO</li>
              <li>• Novo ciclo VEGETATIVO será criado na estufa destino</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={finishCloningMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleFinish}
            disabled={!selectedTentId || finishCloningMutation.isPending}
          >
            {finishCloningMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Gerar Mudas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
