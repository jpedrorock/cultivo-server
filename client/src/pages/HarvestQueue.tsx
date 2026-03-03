import { useState } from "react";
import { trpc } from "@/lib/trpc";
import type { Plant } from "../../../drizzle/schema";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Wind,
  Leaf,
  ArrowRight,
  Loader2,
  PackageOpen,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export default function HarvestQueue() {
  const utils = trpc.useUtils();

  // Dados
  const { data: queuePlants, isLoading } = trpc.harvestQueue.list.useQuery();
  const { data: allTents } = trpc.tents.list.useQuery();
  const { data: activeCycles } = trpc.cycles.listActive.useQuery();

  // Estado do modal "Mover para Secagem"
  const [moveToDryingOpen, setMoveToDryingOpen] = useState(false);
  const [selectedTentId, setSelectedTentId] = useState<string>("");
  const [selectedPlantIds, setSelectedPlantIds] = useState<number[]>([]);
  const [selectAll, setSelectAll] = useState(true);

  // Estado do modal "Descartar"
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState("");
  const [discardPlantIds, setDiscardPlantIds] = useState<number[]>([]);

  // Estufas disponíveis (sem ciclo ativo)
  const availableTents = allTents?.filter(
    (tent) => !activeCycles?.some((cycle) => cycle.tentId === tent.id)
  );

  // Mutations
  const moveToDryingMutation = trpc.harvestQueue.moveToDrying.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setMoveToDryingOpen(false);
      setSelectedTentId("");
      setSelectedPlantIds([]);
      utils.harvestQueue.list.refetch();
      utils.tents.list.refetch();
      utils.cycles.listActive.refetch();
      utils.cycles.getActiveCyclesWithProgress.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const discardMutation = trpc.harvestQueue.discard.useMutation({
    onSuccess: () => {
      toast.success("Plantas descartadas.");
      setDiscardOpen(false);
      setDiscardReason("");
      setDiscardPlantIds([]);
      utils.harvestQueue.list.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleMoveToDrying = () => {
    if (!selectedTentId) {
      toast.error("Selecione uma estufa destino");
      return;
    }
    moveToDryingMutation.mutate({
      targetTentId: parseInt(selectedTentId),
      plantIds: selectAll ? undefined : selectedPlantIds,
    });
  };

  const handleDiscard = () => {
    if (discardPlantIds.length === 0) return;
    discardMutation.mutate({
      plantIds: discardPlantIds,
      reason: discardReason || "Descartada da fila de secagem",
    });
  };

  const openDiscardModal = (plantIds: number[]) => {
    setDiscardPlantIds(plantIds);
    setDiscardOpen(true);
  };

  const openMoveToDrying = () => {
    setSelectAll(true);
    setSelectedPlantIds(queuePlants?.map((p: Plant) => p.id) || []);
    setMoveToDryingOpen(true);
  };

  const togglePlantSelection = (plantId: number) => {
    setSelectedPlantIds((prev) =>
      prev.includes(plantId)
        ? prev.filter((id) => id !== plantId)
        : [...prev, plantId]
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const plantCount = queuePlants?.length || 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-100 dark:bg-orange-900/30">
              <Wind className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Aguardando Secagem
              </h1>
              <p className="text-sm text-muted-foreground">
                {plantCount === 0
                  ? "Nenhuma planta aguardando"
                  : `${plantCount} planta${plantCount !== 1 ? "s" : ""} aguardando uma estufa livre`}
              </p>
            </div>
          </div>
          {plantCount > 0 && (
            <Badge
              variant="outline"
              className="border-orange-300 text-orange-700 dark:text-orange-400 text-sm px-3 py-1"
            >
              {plantCount}
            </Badge>
          )}
        </div>

        {/* Empty state */}
        {plantCount === 0 && (
          <Card className="border-dashed border-2 border-muted">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <PackageOpen className="w-12 h-12 text-muted-foreground/40" />
              <div className="text-center">
                <p className="font-medium text-muted-foreground">
                  Nenhuma planta aguardando secagem
                </p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Quando você colher plantas de uma estufa em Floração, elas
                  aparecerão aqui.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Plantas na fila */}
        {plantCount > 0 && (
          <>
            {/* Ação principal */}
            <Card className="bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
                      Estufa livre? Inicie a secagem!
                    </p>
                    <p className="text-xs text-orange-700/70 dark:text-orange-400/70 mt-0.5">
                      Quando uma estufa ficar vazia, mova as plantas para lá e
                      inicie o ciclo de secagem.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={openMoveToDrying}
                    className="bg-orange-600 hover:bg-orange-700 text-white shrink-0"
                  >
                    <ArrowRight className="w-4 h-4 mr-1" />
                    Mover para Secagem
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Lista de plantas */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Leaf className="w-4 h-4 text-green-600" />
                  Plantas na Fila
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {queuePlants?.map((plant: Plant) => (
                  <div
                    key={plant.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <Leaf className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{plant.name}</p>
                        {plant.harvestQueueAt && (
                          <p className="text-xs text-muted-foreground">
                            Colhida em{" "}
                            {format(
                              new Date(plant.harvestQueueAt),
                              "dd/MM/yyyy 'às' HH:mm",
                              { locale: ptBR }
                            )}
                          </p>
                        )}
                        {plant.harvestQueueNotes && (
                          <p className="text-xs text-muted-foreground italic mt-0.5">
                            "{plant.harvestQueueNotes}"
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => openDiscardModal([plant.id])}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Fluxo explicativo */}
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  Ciclo Perpétuo
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                  <span className="px-2 py-1 rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">
                    Flora colhida
                  </span>
                  <ArrowRight className="w-3 h-3 shrink-0" />
                  <span className="px-2 py-1 rounded-md bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-medium">
                    Aguardando Secagem
                  </span>
                  <ArrowRight className="w-3 h-3 shrink-0" />
                  <span className="px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium">
                    Flora recebe Vega
                  </span>
                  <ArrowRight className="w-3 h-3 shrink-0" />
                  <span className="px-2 py-1 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-medium">
                    Vega vira Secagem
                  </span>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Modal: Mover para Secagem */}
      <Dialog open={moveToDryingOpen} onOpenChange={setMoveToDryingOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wind className="w-5 h-5 text-orange-500" />
              Mover para Secagem
            </DialogTitle>
            <DialogDescription>
              Selecione a estufa que vai receber as plantas para secagem. Ela
              deve estar vazia (sem ciclo ativo).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Seleção de plantas */}
            <div className="space-y-2">
              <Label>Plantas a mover</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all"
                  checked={selectAll}
                  onCheckedChange={(checked) => {
                    setSelectAll(!!checked);
                    if (checked) {
                      setSelectedPlantIds(queuePlants?.map((p: Plant) => p.id) || []);
                    } else {
                      setSelectedPlantIds([]);
                    }
                  }}
                />
                <label htmlFor="select-all" className="text-sm cursor-pointer">
                  Todas ({plantCount} plantas)
                </label>
              </div>
              {!selectAll && (
                <div className="space-y-1 pl-6 max-h-40 overflow-y-auto">
                  {queuePlants?.map((plant: Plant) => (
                    <div key={plant.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`plant-${plant.id}`}
                        checked={selectedPlantIds.includes(plant.id)}
                        onCheckedChange={() => togglePlantSelection(plant.id)}
                      />
                      <label
                        htmlFor={`plant-${plant.id}`}
                        className="text-sm cursor-pointer"
                      >
                        {plant.name}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Seleção de estufa */}
            <div className="space-y-2">
              <Label>Estufa destino</Label>
              <Select value={selectedTentId} onValueChange={setSelectedTentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma estufa vazia" />
                </SelectTrigger>
                <SelectContent>
                  {availableTents && availableTents.length > 0 ? (
                    availableTents.map((tent) => (
                      <SelectItem key={tent.id} value={tent.id.toString()}>
                        {tent.name} ({tent.category})
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      Nenhuma estufa vazia disponível
                    </div>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Apenas estufas sem ciclo ativo são exibidas
              </p>
            </div>

            {/* Resumo */}
            <div className="rounded-lg bg-muted p-3 space-y-1">
              <p className="text-sm font-medium">O que vai acontecer:</p>
              <ul className="text-sm text-muted-foreground space-y-0.5">
                <li>
                  •{" "}
                  {selectAll ? `Todas as ${plantCount}` : selectedPlantIds.length}{" "}
                  planta(s) serão movidas para a estufa selecionada
                </li>
                <li>• A estufa selecionada será configurada como DRYING</li>
                <li>• Um novo ciclo de secagem será criado automaticamente</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMoveToDryingOpen(false)}
              disabled={moveToDryingMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleMoveToDrying}
              disabled={
                moveToDryingMutation.isPending ||
                !selectedTentId ||
                (!selectAll && selectedPlantIds.length === 0)
              }
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {moveToDryingMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Iniciar Secagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Descartar */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Descartar Planta(s)
            </DialogTitle>
            <DialogDescription>
              As plantas serão marcadas como descartadas. Esta ação não pode ser
              desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Motivo (opcional)</Label>
              <Textarea
                placeholder="Ex: Perda por mofo, qualidade insuficiente..."
                value={discardReason}
                onChange={(e) => setDiscardReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDiscardOpen(false)}
              disabled={discardMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDiscard}
              disabled={discardMutation.isPending}
            >
              {discardMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
