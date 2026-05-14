import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sprout } from "lucide-react";
import { toast } from "sonner";

interface SelectMotherPlantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tentId: number;
  cycleId?: number; // Optional agora, pois pode ser chamado de MAINTENANCE
  onMotherSelected: (motherPlantId: number, motherPlantName: string) => void;
}

export function SelectMotherPlantDialog({
  open,
  onOpenChange,
  tentId,
  cycleId: _cycleId,
  onMotherSelected,
}: SelectMotherPlantDialogProps) {
  const [selectedMotherId, setSelectedMotherId] = useState<number | null>(null);
  const [selectedMotherName, setSelectedMotherName] = useState<string>("");

  // Buscar plantas-mãe disponíveis na estufa (status ACTIVE)
  const { data: motherPlants, isLoading } = trpc.plants.list.useQuery(
    { tentId, status: "ACTIVE" },
    { enabled: open }
  );

  const handleSelect = () => {
    if (!selectedMotherId) {
      toast.error("Selecione uma planta-mãe");
      return;
    }
    onMotherSelected(selectedMotherId, selectedMotherName);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Selecionar Planta-Mãe para Clonagem</DialogTitle>
          <DialogDescription>
            Escolha qual planta-mãe você vai clonar
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !motherPlants || motherPlants.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Sprout className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhuma planta-mãe encontrada nesta estufa</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Lista de plantas-mãe */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {motherPlants.map((plant: any) => (
                <button
                  key={plant.id}
                  onClick={() => {
                    setSelectedMotherId(plant.id);
                    setSelectedMotherName(plant.name || plant.strain || "Planta Mãe");
                  }}
                  className={`
                    relative p-4 rounded-lg border-2 transition-all text-left
                    ${
                      selectedMotherId === plant.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }
                  `}
                >
                  {/* Foto */}
                  {plant.lastHealthPhotoUrl ? (
                    <img
                      src={plant.lastHealthPhotoUrl}
                      alt={plant.name || plant.code}
                      className="w-full h-32 object-cover rounded-lg mb-2"
                    />
                  ) : (
                    <div className="w-full h-32 bg-muted rounded-lg mb-2 flex items-center justify-center">
                      <Sprout className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}

                  {/* Informações */}
                  <div className="space-y-1">
                    <div className="font-semibold">{plant.name || plant.code}</div>
                    <div className="flex items-center gap-2 text-sm">
                      {plant.lastHealthStatus && (
                        <span
                          className={`
                            inline-block px-2 py-0.5 rounded text-xs font-medium
                            ${
                              plant.lastHealthStatus === "HEALTHY"
                                ? "bg-green-500/20 text-green-700 dark:text-green-300"
                                : plant.lastHealthStatus === "WARNING"
                                ? "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300"
                                : "bg-red-500/20 text-red-700 dark:text-red-300"
                            }
                          `}
                        >
                          {plant.lastHealthStatus === "HEALTHY"
                            ? "Saudável"
                            : plant.lastHealthStatus === "WARNING"
                            ? "Atenção"
                            : "Doente"}
                        </span>
                      )}
                      {plant.cyclePhase && plant.cycleWeek && (
                        <span className="text-muted-foreground">
                          {plant.cyclePhase} S{plant.cycleWeek}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Indicador de seleção */}
                  {selectedMotherId === plant.id && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                      <svg
                        className="w-4 h-4 text-primary-foreground"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Botões */}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSelect} disabled={!selectedMotherId}>
                Confirmar Seleção
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
