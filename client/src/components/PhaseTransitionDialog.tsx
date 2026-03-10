import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Sprout, Flower2, Wind } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { HarvestConfirmationDialog } from "./HarvestConfirmationDialog";

interface PhaseTransitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: number;
  currentPhase: "MAINTENANCE" | "CLONING" | "VEGA" | "FLORA";
  tentId: number;
  tentName: string;
}

export function PhaseTransitionDialog({
  open,
  onOpenChange,
  cycleId,
  currentPhase,
  tentId,
  tentName,
}: PhaseTransitionDialogProps) {
  const utils = trpc.useUtils();

  // State for transition inputs
  const [transferPlants, setTransferPlants] = useState(false);
  const [targetTentId, setTargetTentId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [clonesProduced, setClonesProduced] = useState("");
  const [transitionDate, setTransitionDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  
  // State for harvest confirmation
  const [showHarvestConfirmation, setShowHarvestConfirmation] = useState(false);
  const [harvestWeight, setHarvestWeight] = useState<number | undefined>();
  const [harvestNotes, setHarvestNotes] = useState<string | undefined>();

  // Get available tents for selection (exclude current tent)
  const { data: tents } = trpc.tents.list.useQuery();
  const availableTents = tents?.filter((t) => t.id !== tentId) || [];

  // Mutations for each transition type
  const transitionToCloning = trpc.cycles.transitionToCloning.useMutation({
    onSuccess: () => {
      toast.success("Transição para clonagem iniciada com sucesso!");
      utils.cycles.getActiveCyclesWithProgress.invalidate();
      utils.tents.list.invalidate();
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Erro ao iniciar clonagem: ${error.message}`);
    },
  });

  const transitionToMaintenance = trpc.cycles.transitionToMaintenance.useMutation({
    onSuccess: () => {
      toast.success("Retornado para manutenção com sucesso!");
      utils.cycles.getActiveCyclesWithProgress.invalidate();
      utils.tents.list.invalidate();
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Erro ao retornar para manutenção: ${error.message}`);
    },
  });

  const transitionToFlora = trpc.cycles.transitionToFlora.useMutation({
    onSuccess: () => {
      toast.success("Floração iniciada com sucesso!");
      utils.cycles.getActiveCyclesWithProgress.invalidate();
      utils.tents.list.invalidate();
      utils.plants.list.invalidate();
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Erro ao iniciar floração: ${error.message}`);
    },
  });

  const transitionToDrying = trpc.cycles.transitionToDrying.useMutation({
    onSuccess: () => {
      toast.success("Secagem iniciada com sucesso!");
      utils.cycles.getActiveCyclesWithProgress.invalidate();
      utils.tents.list.invalidate();
      utils.plants.list.invalidate();
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Erro ao iniciar secagem: ${error.message}`);
    },
  });

  const resetForm = () => {
    setTransferPlants(false);
    setTargetTentId("");
    setNotes("");
    setClonesProduced("");
    setTransitionDate(new Date().toISOString().split("T")[0]);
  };

  const handleTransition = () => {
    if (!nextPhase) return;
    
    // If transitioning to DRYING (harvest), show confirmation dialog first
    if (nextPhase.value === "DRYING") {
      setShowHarvestConfirmation(true);
      return;
    }
    
    executeTransition();
  };
  
  const executeTransition = () => {
    if (!nextPhase) return;
    
    const targetTent = transferPlants && targetTentId ? parseInt(targetTentId) : undefined;

    switch (nextPhase.value) {
      case "CLONING":
        transitionToCloning.mutate({
          cycleId,
          cloningStartDate: new Date(transitionDate),
        });
        break;

      case "MAINTENANCE":
        transitionToMaintenance.mutate({
          cycleId,
          clonesProduced: clonesProduced ? parseInt(clonesProduced) : undefined,
          targetTentId: targetTentId ? parseInt(targetTentId) : undefined,
        });
        break;

      case "FLORA":
        transitionToFlora.mutate({
          cycleId,
          floraStartDate: new Date(transitionDate),
          targetTentId: targetTent,
        });
        break;

      case "DRYING":
        transitionToDrying.mutate({
          cycleId,
          dryingStartDate: new Date(transitionDate),
          harvestNotes: harvestNotes || notes,
          harvestWeight: harvestWeight,
          targetTentId: targetTent,
        });
        break;
    }
  };
  
  const handleHarvestConfirm = (data: { estimatedWeight?: number; notes?: string }) => {
    setHarvestWeight(data.estimatedWeight);
    setHarvestNotes(data.notes);
    setShowHarvestConfirmation(false);
    
    // Execute the transition after confirmation
    setTimeout(() => {
      executeTransition();
    }, 100);
  };

  // Determine next phase based on current phase
  const getNextPhase = () => {
    switch (currentPhase) {
      case "MAINTENANCE":
        return {
          label: "Clonagem",
          value: "CLONING",
          icon: Sprout,
          color: "text-blue-600",
          bgColor: "bg-blue-50 dark:bg-blue-950/20",
          description: "Iniciar processo de clonagem das plantas mãe",
        };
      case "CLONING":
        return {
          label: "Manutenção",
          value: "MAINTENANCE",
          icon: Sprout,
          color: "text-green-600",
          bgColor: "bg-green-50 dark:bg-green-950/20",
          description: "Retornar para fase de manutenção",
        };
      case "VEGA":
        return {
          label: "Floração",
          value: "FLORA",
          icon: Flower2,
          color: "text-purple-600",
          bgColor: "bg-purple-50 dark:bg-purple-950/20",
          description: "Avançar para fase de floração (12/12)",
        };
      case "FLORA":
        return {
          label: "Secagem",
          value: "DRYING",
          icon: Wind,
          color: "text-orange-600",
          bgColor: "bg-orange-50 dark:bg-orange-950/20",
          description: "Iniciar processo de secagem pós-colheita",
        };
      default:
        return null;
    }
  };

  const nextPhase = getNextPhase();

  if (!nextPhase) {
    return null;
  }

  const Icon = nextPhase.icon;
  const isLoading =
    transitionToCloning.isPending ||
    transitionToMaintenance.isPending ||
    transitionToFlora.isPending ||
    transitionToDrying.isPending;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Avançar Ciclo</DialogTitle>
          <DialogDescription className="text-base">
            {tentName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Next Phase Card */}
          <div className={`${nextPhase.bgColor} rounded-lg p-6 border-2 border-border`}>
            <div className="flex items-start gap-4">
              <div className={`${nextPhase.color} p-3 rounded-full bg-background/50`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold mb-1">
                  Próxima Fase: {nextPhase.label}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {nextPhase.description}
                </p>
              </div>
            </div>
          </div>

          {/* Date Input (for CLONING, FLORA, DRYING) */}
          {(currentPhase === "MAINTENANCE" || currentPhase === "VEGA" || currentPhase === "FLORA") && (
            <div className="space-y-2">
              <Label htmlFor="transitionDate">Data de Início</Label>
              <Input
                id="transitionDate"
                type="date"
                value={transitionDate}
                onChange={(e) => setTransitionDate(e.target.value)}
              />
            </div>
          )}

          {/* Clones Produced Input (for CLONING → MAINTENANCE) */}
          {currentPhase === "CLONING" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="clonesProduced">
                  Quantidade de Clones Produzidos
                </Label>
                <Input
                  id="clonesProduced"
                  type="text"
                  inputMode="numeric"
                  placeholder="Ex: 18"
                  value={clonesProduced}
                  onChange={(e) => setClonesProduced(e.target.value)}
                />
              </div>
              
              {/* Target Tent for Seedlings */}
              {clonesProduced && parseInt(clonesProduced) > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="seedlingTent">
                    Estufa Destino para as Mudas *
                  </Label>
                  <Select value={targetTentId} onValueChange={setTargetTentId}>
                    <SelectTrigger id="seedlingTent">
                      <SelectValue placeholder="Selecione a estufa" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTents.map((tent) => (
                        <SelectItem key={tent.id} value={tent.id.toString()}>
                          {tent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    As mudas serão criadas na estufa selecionada. A estufa mãe permanecerá apenas com as plantas mãe.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Notes Input (for FLORA → DRYING) */}
          {currentPhase === "FLORA" && (
            <div className="space-y-2">
              <Label htmlFor="notes">Notas de Colheita (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Ex: Peso estimado, observações sobre tricomas..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          )}

          {/* Transfer Plants Checkbox */}
          <div className="space-y-4 pt-2 border-t">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="transferPlants"
                checked={transferPlants}
                onCheckedChange={(checked) => {
                  setTransferPlants(checked as boolean);
                  if (!checked) setTargetTentId("");
                }}
              />
              <Label
                htmlFor="transferPlants"
                className="text-base font-medium cursor-pointer"
              >
                Transferir plantas para outra estufa
              </Label>
            </div>

            {transferPlants && (
              <div className="space-y-2 pl-7 animate-in slide-in-from-top-2">
                <Label htmlFor="targetTent">Estufa de Destino</Label>
                <Select value={targetTentId} onValueChange={setTargetTentId}>
                  <SelectTrigger id="targetTent">
                    <SelectValue placeholder="Selecione a estufa" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTents.map((tent) => (
                      <SelectItem key={tent.id} value={tent.id.toString()}>
                        {tent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {transferPlants && targetTentId
                    ? "O ciclo atual será encerrado nesta estufa e as plantas serão movidas."
                    : "As plantas permanecerão nesta estufa durante a próxima fase."}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleTransition}
            className="flex-1"
            disabled={
              isLoading || 
              (transferPlants && !targetTentId) ||
              (currentPhase === "CLONING" && !!clonesProduced && parseInt(clonesProduced) > 0 && !targetTentId)
            }
          >
            {isLoading ? (
              "Processando..."
            ) : (
              <>
                Avançar para {nextPhase.label}
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    
    {/* Harvest Confirmation Dialog */}
    <HarvestConfirmationDialog
      open={showHarvestConfirmation}
      onOpenChange={setShowHarvestConfirmation}
      onConfirm={handleHarvestConfirm}
      tentName={tentName}
    />
    </>
  );
}
