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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface ReturnToMaintenanceModalProps {
  open: boolean;
  onClose: () => void;
  cycleId: number;
  cycleName: string;
}

export function ReturnToMaintenanceModal({ open, onClose, cycleId, cycleName }: ReturnToMaintenanceModalProps) {
  const [clonesProduced, setClonesProduced] = useState<string>("");
  const utils = trpc.useUtils();

  const transitionToMaintenance = trpc.cycles.transitionToMaintenance.useMutation({
    onSuccess: () => {
      toast.success("Retornado para manutenção!");
      utils.cycles.getActiveCyclesWithProgress.invalidate();
      utils.cycles.listActive.invalidate();
      setClonesProduced("");
      onClose();
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const handleSubmit = () => {
    const clones = clonesProduced ? parseInt(clonesProduced, 10) : undefined;
    
    if (clonesProduced && (isNaN(clones!) || clones! < 0)) {
      toast.error("Quantidade de clones inválida");
      return;
    }

    transitionToMaintenance.mutate({
      cycleId,
      clonesProduced: clones,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retornar para Manutenção</DialogTitle>
          <DialogDescription>
            Finalizar clonagem e retornar "{cycleName}" para manutenção
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="clonesProduced">Clones Produzidos (opcional)</Label>
            <Input
              id="clonesProduced"
              type="text"
              inputMode="numeric"
              placeholder="Ex: 10"
              value={clonesProduced}
              onChange={(e) => setClonesProduced(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Quantos clones foram produzidos nesta rodada de clonagem?
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            O ciclo de clonagem será finalizado e as plantas mãe retornarão para o estado de manutenção contínua.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={transitionToMaintenance.isPending}
          >
            {transitionToMaintenance.isPending ? "Processando..." : "Retornar para Manutenção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
