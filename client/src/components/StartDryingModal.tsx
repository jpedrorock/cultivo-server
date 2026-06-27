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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HarvestCelebration } from "@/components/HarvestCelebration";
import { toast } from "sonner";

interface StartDryingModalProps {
  open: boolean;
  onClose: () => void;
  cycleId: number;
  cycleName: string;
}

export function StartDryingModal({ open, onClose, cycleId, cycleName }: StartDryingModalProps) {
  const [dryingStartDate, setDryingStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [targetTentId, setTargetTentId] = useState<string>("");
  const [harvestNotes, setHarvestNotes] = useState("");
  const [celebrating, setCelebrating] = useState(false);

  const { data: tents } = trpc.tents.list.useQuery();
  const utils = trpc.useUtils();

  const transitionToDrying = trpc.cycles.transitionToDrying.useMutation({
    onSuccess: (data) => {
      toast.success(`Colheita registrada! ${data.plantsHarvested} planta(s) colhida(s)`);
      utils.cycles.getActiveCyclesWithProgress.invalidate();
      utils.cycles.listActive.invalidate();
      utils.tents.list.invalidate();
      utils.plants.list.invalidate();
      utils.gamification.getProgress.invalidate();
      setCelebrating(true); // mostra a celebração da colheita em vez de fechar
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const handleSubmit = () => {
    transitionToDrying.mutate({
      cycleId,
      dryingStartDate: new Date(dryingStartDate),
      targetTentId: targetTentId ? parseInt(targetTentId) : undefined,
      harvestNotes: harvestNotes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        {celebrating ? (
          <HarvestCelebration cycleId={cycleId} fallbackName={cycleName} onDone={onClose} />
        ) : (
        <>
        <DialogHeader>
          <DialogTitle>Iniciar Secagem</DialogTitle>
          <DialogDescription>
            Finalizar ciclo de floração "{cycleName}" e iniciar secagem
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Data de início */}
          <div className="space-y-2">
            <Label htmlFor="dryingStartDate">Data da Colheita</Label>
            <Input
              id="dryingStartDate"
              type="date"
              value={dryingStartDate}
              onChange={(e) => setDryingStartDate(e.target.value)}
            />
          </div>

          {/* Notas de colheita */}
          <div className="space-y-2">
            <Label htmlFor="harvestNotes">
              Notas de Colheita (opcional)
            </Label>
            <Textarea
              id="harvestNotes"
              placeholder="Ex: Peso estimado, observações sobre tricomas, etc."
              value={harvestNotes}
              onChange={(e) => setHarvestNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Estufa de destino (opcional) */}
          <div className="space-y-2">
            <Label htmlFor="targetTent">
              Mover plantas para estufa de secagem? (opcional)
            </Label>
            <Select value={targetTentId} onValueChange={setTargetTentId}>
              <SelectTrigger>
                <SelectValue placeholder="Não mover (arquivar)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Não mover (arquivar)</SelectItem>
                {tents?.map((tent) => (
                  <SelectItem key={tent.id} value={tent.id.toString()}>
                    {tent.name} ({tent.category})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Se selecionado, cria ciclo de secagem e move plantas. Caso contrário, plantas são arquivadas.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={transitionToDrying.isPending}
          >
            {transitionToDrying.isPending ? "Processando..." : "Iniciar Secagem"}
          </Button>
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
