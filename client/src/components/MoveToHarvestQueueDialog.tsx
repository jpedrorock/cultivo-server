import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Wind, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MoveToHarvestQueueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: number;
  tentName: string;
  onSuccess?: () => void;
}

export function MoveToHarvestQueueDialog({
  open,
  onOpenChange,
  cycleId,
  tentName,
  onSuccess,
}: MoveToHarvestQueueDialogProps) {
  const utils = trpc.useUtils();
  const [harvestNotes, setHarvestNotes] = useState("");
  const [harvestWeight, setHarvestWeight] = useState("");

  const moveToQueueMutation = trpc.harvestQueue.moveToQueue.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      onOpenChange(false);
      setHarvestNotes("");
      setHarvestWeight("");
      // Atualizar todas as queries relevantes
      utils.harvestQueue.list.refetch();
      utils.tents.list.refetch();
      utils.cycles.listActive.refetch();
      utils.cycles.getActiveCyclesWithProgress.refetch();
      utils.plants.list.refetch();
      onSuccess?.();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleConfirm = () => {
    moveToQueueMutation.mutate({
      cycleId,
      harvestNotes: harvestNotes || undefined,
      harvestWeight: harvestWeight ? parseFloat(harvestWeight) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          {/* Bloco colorido */}
          <div className="rounded-xl p-4 mb-2 flex items-center gap-3 bg-orange-500/10 border border-orange-500/30 dark:bg-orange-500/15 dark:border-orange-500/35">
            <div className="p-2 rounded-full bg-background/60 text-orange-600 dark:text-orange-400">
              <Wind className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-sm text-orange-600 dark:text-orange-400">
                Colher e Aguardar Secagem
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{tentName}</p>
            </div>
          </div>
          <DialogTitle className="text-lg">Colher plantas?</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            As plantas serão colhidas e movidas para a área{" "}
            <strong>Aguardando Secagem</strong>. A estufa ficará vazia e
            disponível para receber novas plantas da Vega.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="harvest-weight">
              Peso estimado da colheita (g) — opcional
            </Label>
            <Input
              id="harvest-weight"
              type="number"
              min="0"
              step="0.1"
              placeholder="Ex: 450"
              value={harvestWeight}
              onChange={(e) => setHarvestWeight(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="harvest-notes">Observações — opcional</Label>
            <Textarea
              id="harvest-notes"
              placeholder="Ex: Tricomas âmbar, colheita no ponto ideal..."
              value={harvestNotes}
              onChange={(e) => setHarvestNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Resumo do que vai acontecer */}
          <div className="rounded-lg bg-muted p-3 space-y-1">
            <p className="text-sm font-medium">O que vai acontecer:</p>
            <ul className="text-sm text-muted-foreground space-y-0.5">
              <li>• Todas as plantas ativas serão colhidas</li>
              <li>• Elas irão para "Aguardando Secagem" (sem estufa)</li>
              <li>• O ciclo atual será finalizado</li>
              <li>• A estufa <strong>{tentName}</strong> ficará vazia e disponível</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={moveToQueueMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={moveToQueueMutation.isPending}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {moveToQueueMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Colher e Aguardar Secagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
