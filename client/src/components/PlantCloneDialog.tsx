import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useTactileFeedback } from "@/hooks/useTactileFeedback";

interface PlantCloneDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plantId: number;
  plantName: string;
}

export default function PlantCloneDialog({ open, onOpenChange, plantId, plantName }: PlantCloneDialogProps) {
  const [nameInput, setNameInput] = useState(`${plantName} (Clone)`);
  const haptic = useTactileFeedback();
  const utils = trpc.useUtils();

  const cloneMutation = trpc.plants.clone.useMutation({
    onSuccess: (data) => {
      haptic.confirm();
      toast.success(`Clone "${data.name}" criado!`);
      onOpenChange(false);
      utils.plants.list.invalidate();
    },
    onError: (e) => toast.error(`Erro ao clonar: ${e.message}`),
  });

  const handleCreate = () => cloneMutation.mutate({ plantId, name: nameInput });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clonar Planta</DialogTitle>
          <DialogDescription>Cria uma nova muda com a mesma strain e estufa de "{plantName}".</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label>Nome do clone</Label>
          <Input
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            placeholder="Ex: Northern Lights (Clone)"
            onKeyDown={e => e.key === "Enter" && handleCreate()}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={cloneMutation.isPending || !nameInput.trim()}>
            {cloneMutation.isPending ? "Clonando..." : "Criar Clone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
