import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { PressButton } from "@/components/PressButton";
import { XCircle, Loader2 } from "lucide-react";

interface PlantDiscardModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plantName: string;
  onConfirm: (reason: string) => void;
  isPending: boolean;
}

export default function PlantDiscardModal({ open, onOpenChange, plantName, onConfirm, isPending }: PlantDiscardModalProps) {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    onConfirm(reason);
    setReason("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="w-5 h-5" />
            Descartar Planta
          </DialogTitle>
          <DialogDescription>
            Descartando <span className="font-semibold text-foreground">{plantName}</span>. Informe o motivo do descarte (opcional).
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <label className="text-sm font-medium text-foreground mb-2 block">Motivo do descarte</label>
          <textarea
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            rows={3}
            placeholder="Ex: doente, hermafrodita, baixa qualidade..."
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>
        <DialogFooter className="gap-2">
          <PressButton variant="outline" onClick={() => onOpenChange(false)}>Cancelar</PressButton>
          <PressButton variant="destructive" onClick={handleConfirm} disabled={isPending} pressIntensity="strong">
            {isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Descartando...</> : <><XCircle className="w-4 h-4 mr-2" />Confirmar Descarte</>}
          </PressButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
