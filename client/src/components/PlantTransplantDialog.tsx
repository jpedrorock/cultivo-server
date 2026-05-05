import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { PressButton } from "@/components/PressButton";
import { MoveRight } from "lucide-react";

interface PlantTransplantDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plantName: string;
  onConfirm: () => void;
  isPending: boolean;
}

export default function PlantTransplantDialog({ open, onOpenChange, plantName, onConfirm, isPending }: PlantTransplantDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-purple-600">
            <MoveRight className="w-5 h-5" />
            Transplantar para Flora
          </DialogTitle>
          <DialogDescription>
            Deseja transplantar{" "}
            <span className="font-semibold text-foreground">{plantName}</span>{" "}
            para a estufa de Flora? A planta será movida automaticamente para a estufa de Floração configurada.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <PressButton variant="outline" onClick={() => onOpenChange(false)}>Cancelar</PressButton>
          <PressButton
            className="bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600 text-white border-0"
            pressIntensity="medium"
            onClick={onConfirm}
            disabled={isPending}
          >
            <MoveRight className="w-4 h-4 mr-2" />
            Transplantar
          </PressButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
