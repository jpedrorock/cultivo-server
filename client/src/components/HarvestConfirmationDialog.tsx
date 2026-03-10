import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Scissors, Camera, Droplets, Eye, FileText, Scale } from "lucide-react";

interface HarvestConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { estimatedWeight?: number; notes?: string }) => void;
  tentName: string;
}

export function HarvestConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  tentName,
}: HarvestConfirmationDialogProps) {
  const [trichomsChecked, setTrichomsChecked] = useState(false);
  const [weightRecorded, setWeightRecorded] = useState(false);
  const [photosTaken, setPhotosTaken] = useState(false);
  const [flushComplete, setFlushComplete] = useState(false);
  const [notesAdded, setNotesAdded] = useState(false);
  
  const [estimatedWeight, setEstimatedWeight] = useState("");
  const [harvestNotes, setHarvestNotes] = useState("");

  const allChecked = trichomsChecked && weightRecorded && photosTaken && flushComplete && notesAdded;

  const handleConfirm = () => {
    onConfirm({
      estimatedWeight: estimatedWeight ? parseFloat(estimatedWeight) : undefined,
      notes: harvestNotes || undefined,
    });
    
    // Reset form
    setTrichomsChecked(false);
    setWeightRecorded(false);
    setPhotosTaken(false);
    setFlushComplete(false);
    setNotesAdded(false);
    setEstimatedWeight("");
    setHarvestNotes("");
  };

  const handleCancel = () => {
    onOpenChange(false);
    // Reset form
    setTrichomsChecked(false);
    setWeightRecorded(false);
    setPhotosTaken(false);
    setFlushComplete(false);
    setNotesAdded(false);
    setEstimatedWeight("");
    setHarvestNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Scissors className="w-6 h-6 text-primary" />
            Confirmação de Colheita
          </DialogTitle>
          <DialogDescription>
            Estufa: <span className="font-semibold text-foreground">{tentName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Validation Checklist */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Checklist de Validação</h4>
            
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <Checkbox
                  id="trichoms"
                  checked={trichomsChecked}
                  onCheckedChange={(checked) => setTrichomsChecked(checked as boolean)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="trichoms" className="flex items-center gap-2 cursor-pointer">
                    <Eye className="w-4 h-4 text-amber-600" />
                    <span>Tricomas verificados (âmbar/leitoso)</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Confirme que os tricomas estão no ponto ideal para colheita
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <Checkbox
                  id="weight"
                  checked={weightRecorded}
                  onCheckedChange={(checked) => setWeightRecorded(checked as boolean)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="weight" className="flex items-center gap-2 cursor-pointer">
                    <Scale className="w-4 h-4 text-blue-600" />
                    <span>Peso estimado registrado</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Registre uma estimativa do peso fresco antes da secagem
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <Checkbox
                  id="photos"
                  checked={photosTaken}
                  onCheckedChange={(checked) => setPhotosTaken(checked as boolean)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="photos" className="flex items-center gap-2 cursor-pointer">
                    <Camera className="w-4 h-4 text-purple-600" />
                    <span>Fotos tiradas</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Documente o estado das plantas antes da colheita
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <Checkbox
                  id="flush"
                  checked={flushComplete}
                  onCheckedChange={(checked) => setFlushComplete(checked as boolean)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="flush" className="flex items-center gap-2 cursor-pointer">
                    <Droplets className="w-4 h-4 text-cyan-600" />
                    <span>Flush completo (última rega só com água)</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Confirme que o flush foi realizado nos últimos 7-14 dias
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <Checkbox
                  id="notes"
                  checked={notesAdded}
                  onCheckedChange={(checked) => setNotesAdded(checked as boolean)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="notes" className="flex items-center gap-2 cursor-pointer">
                    <FileText className="w-4 h-4 text-green-600" />
                    <span>Notas de colheita adicionadas</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Adicione observações importantes sobre a colheita
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Optional Fields */}
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label htmlFor="estimatedWeight" className="text-sm font-medium">
                Peso Estimado (gramas) - Opcional
              </Label>
              <Input
                id="estimatedWeight"
                type="text"
                inputMode="decimal"
                placeholder="Ex: 450"
                value={estimatedWeight}
                onChange={(e) => setEstimatedWeight(e.target.value)}
                min="0"
                step="0.1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="harvestNotes" className="text-sm font-medium">
                Notas de Colheita - Opcional
              </Label>
              <Textarea
                id="harvestNotes"
                placeholder="Ex: Colheita realizada às 8h. Plantas apresentavam ótimo aspecto, tricomas 70% âmbar. Aroma intenso de frutas cítricas..."
                value={harvestNotes}
                onChange={(e) => setHarvestNotes(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!allChecked}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Scissors className="w-4 h-4 mr-2" />
            Confirmar Colheita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
