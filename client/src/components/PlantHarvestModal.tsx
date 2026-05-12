import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { PressButton } from "@/components/PressButton";
import { Scissors, Loader2 } from "lucide-react";

interface PlantHarvestModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plantName: string;
  onConfirm: (notes: string) => void;
  isPending: boolean;
}

export default function PlantHarvestModal({ open, onOpenChange, plantName, onConfirm, isPending }: PlantHarvestModalProps) {
  const [notes, setNotes] = useState("");

  const handleConfirm = () => {
    onConfirm(notes);
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-600">
            <Scissors className="w-5 h-5" />
            Registrar Colheita
          </DialogTitle>
          <DialogDescription>
            Colhendo <span className="font-semibold text-foreground">{plantName}</span>. Adicione notas sobre a colheita (opcional).
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <label className="text-sm font-medium text-foreground mb-2 block">Notas da colheita (ex: peso, qualidade)</label>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            rows={3}
            placeholder="Ex: 45g, qualidade excelente, terpenos intensos..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
        <DialogFooter className="gap-2">
          <PressButton variant="outline" onClick={() => onOpenChange(false)}>Cancelar</PressButton>
          <PressButton className="bg-primary text-primary-foreground hover:bg-primary/90 border-0" onClick={handleConfirm} disabled={isPending} pressIntensity="medium">
            {isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Colhendo...</> : <><Scissors className="w-4 h-4 mr-2" />Confirmar Colheita</>}
          </PressButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
