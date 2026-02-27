import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedButton } from "@/components/AnimatedButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Sprout, Search, Filter, ChevronDown, ChevronRight, MoveRight, Loader2, Archive } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { PlantCardSkeleton } from "@/components/PlantCardSkeleton";
import { useLocation } from "wouter";
import { PageTransition, StaggerList, ListItemAnimation } from "@/components/PageTransition";
import { LazyImage } from "@/components/LazyImage";

export default function PlantsList() {
  const [, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ACTIVE" | "HARVESTED" | "DEAD" | "DISCARDED" | undefined>();
  
  // Ler query param ?tent=ID para auto-expandir estufa
  const tentParam = new URLSearchParams(window.location.search).get('tent');
  const [expandedTents, setExpandedTents] = useState<Set<number>>(
    tentParam ? new Set([parseInt(tentParam)]) : new Set()
  );
  const [movePlantDialog, setMovePlantDialog] = useState<{
    open: boolean;
    plant?: any;
    fromTentId?: number;
  }>({ open: false });
  const [targetTentId, setTargetTentId] = useState<number | undefined>();
  const [selectedPlants, setSelectedPlants] = useState<Set<number>>(new Set());
  const [batchMoveDialog, setBatchMoveDialog] = useState(false);
  const [batchTargetTentId, setBatchTargetTentId] = useState<number | undefined>();

  const { data: plants, isLoading } = trpc.plants.list.useQuery({
    status: filterStatus,
  });

  const { data: tents } = trpc.tents.list.useQuery();
  const { data: strains } = trpc.strains.list.useQuery();

  const utils = trpc.useUtils();
  const moveMultiplePlants = trpc.plants.moveSelectedPlants.useMutation({
    onSuccess: (data) => {
      utils.plants.list.invalidate();
      toast.success(`✅ ${data.movedCount} planta(s) movida(s) com sucesso!`);
      setBatchMoveDialog(false);
      setSelectedPlants(new Set());
      setBatchTargetTentId(undefined);
    },
    onError: (error) => {
      toast.error(`Erro ao mover plantas: ${error.message}`);
    },
  });

  const bulkPromote = trpc.plants.bulkPromote.useMutation({
    onSuccess: (data) => {
      utils.plants.list.invalidate();
      toast.success(`🌿 ${data.count} muda(s) promovida(s) para planta com sucesso!`);
      setSelectedPlants(new Set());
    },
    onError: (error) => {
      toast.error(`Erro ao promover mudas: ${error.message}`);
    },
  });

  const bulkMove = trpc.plants.bulkMove.useMutation({
    onSuccess: (data) => {
      utils.plants.list.invalidate();
      toast.success(`✅ ${data.count} planta(s) movida(s) com sucesso!`);
      setBatchMoveDialog(false);
      setSelectedPlants(new Set());
      setBatchTargetTentId(undefined);
    },
    onError: (error) => {
      toast.error(`Erro ao mover plantas: ${error.message}`);
    },
  });

  const bulkHarvest = trpc.plants.bulkHarvest.useMutation({
    onSuccess: (data) => {
      utils.plants.list.invalidate();
      toast.success(`✅ ${data.count} planta(s) colhida(s) com sucesso!`);
      setSelectedPlants(new Set());
    },
    onError: (error) => {
      toast.error(`Erro ao colher plantas: ${error.message}`);
    },
  });

  const bulkDiscard = trpc.plants.bulkDiscard.useMutation({
    onSuccess: (data) => {
      utils.plants.list.invalidate();
      toast.success(`✅ ${data.count} planta(s) descartada(s) com sucesso!`);
      setSelectedPlants(new Set());
    },
    onError: (error) => {
      toast.error(`Erro ao descartar plantas: ${error.message}`);
    },
  });

  const movePlant = trpc.plants.moveTent.useMutation({
    onSuccess: () => {
      utils.plants.list.invalidate();
      toast.success("Planta movida com sucesso!");
      setMovePlantDialog({ open: false });
      setTargetTentId(undefined);
    },
    onError: (error) => {
      toast.error(`Erro ao mover planta: ${error.message}`);
    },
  });

  const filteredPlants = plants?.filter((plant) =>
    plant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plant.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Agrupar plantas por estufa
  const plantsByTent = filteredPlants?.reduce((acc, plant) => {
    if (!acc[plant.currentTentId]) {
      acc[plant.currentTentId] = [];
    }
    acc[plant.currentTentId].push(plant);
    return acc;
  }, {} as Record<number, typeof plants>);

  const getStrainName = (strainId: number) => {
    return strains?.find((s) => s.id === strainId)?.name || "Unknown";
  };

  const getTentName = (tentId: number) => {
    return tents?.find((t) => t.id === tentId)?.name || "Unknown";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-500/10 text-green-600 border-green-500/30";
      case "HARVESTED":
        return "bg-blue-500/10 text-blue-600 border-blue-500/30";
      case "DEAD":
        return "bg-red-500/10 text-red-600 border-red-500/30";
      case "DISCARDED":
        return "bg-orange-500/10 text-orange-600 border-orange-500/30";
      default:
        return "bg-gray-500/10 text-gray-600 border-gray-500/30";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "Ativa";
      case "HARVESTED":
        return "Colhida";
      case "DEAD":
        return "Morta";
      case "DISCARDED":
        return "Descartada";
      default:
        return status;
    }
  };

  const togglePlantSelection = (plantId: number) => {
    setSelectedPlants(prev => {
      const newSet = new Set(prev);
      if (newSet.has(plantId)) {
        newSet.delete(plantId);
      } else {
        newSet.add(plantId);
      }
      return newSet;
    });
  };

  const selectAllInTent = (tentId: number) => {
    const tentPlants = plantsByTent?.[tentId] || [];
    setSelectedPlants(prev => {
      const newSet = new Set(prev);
      tentPlants.forEach((plant: any) => newSet.add(plant.id));
      return newSet;
    });
  };

  const deselectAllInTent = (tentId: number) => {
    const tentPlants = plantsByTent?.[tentId] || [];
    setSelectedPlants(prev => {
      const newSet = new Set(prev);
      tentPlants.forEach((plant: any) => newSet.delete(plant.id));
      return newSet;
    });
  };

  const handleBatchMove = () => {
    if (!batchTargetTentId || selectedPlants.size === 0) {
      toast.error("Selecione uma estufa de destino");
      return;
    }
    
    bulkMove.mutate({
      plantIds: Array.from(selectedPlants),
      targetTentId: batchTargetTentId,
    });
  };

  const toggleTent = (tentId: number) => {
    const newExpanded = new Set(expandedTents);
    if (newExpanded.has(tentId)) {
      newExpanded.delete(tentId);
    } else {
      newExpanded.add(tentId);
    }
    setExpandedTents(newExpanded);
  };

  const handleMovePlant = (plant: any, fromTentId: number) => {
    setMovePlantDialog({ open: true, plant, fromTentId });
    setTargetTentId(undefined);
  };

  const confirmMovePlant = () => {
    if (!movePlantDialog.plant || !targetTentId) return;

    movePlant.mutate({
      plantId: movePlantDialog.plant.id,
      toTentId: targetTentId,
      reason: "Mudança de fase/estufa",
    });
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="container py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
                <Sprout className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">Minhas Plantas</h1>
                <p className="text-sm text-muted-foreground">
                  {filteredPlants && (
                    <>
                      {filteredPlants.filter(p => p.plantStage === "PLANT").length} plantas • {filteredPlants.filter(p => p.plantStage === "SEEDLING").length} mudas
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href="/plants/archive">
                <Button variant="outline">
                  <Archive className="w-4 h-4 mr-2" />
                  Arquivo
                </Button>
              </Link>
              <Link href="/plants/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Planta
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8">
        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="search">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Nome ou código..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="filterStatus">Status</Label>
                <select
                  id="filterStatus"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={filterStatus || ""}
                  onChange={(e) => setFilterStatus(e.target.value as any || undefined)}
                >
                  <option value="">Todos</option>
                  <option value="ACTIVE">Ativa</option>
                  <option value="HARVESTED">Colhida</option>
                  <option value="DEAD">Morta</option>
                  <option value="DISCARDED">Descartada</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Plants Grouped by Tent */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <PlantCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredPlants && filteredPlants.length > 0 ? (
          <div className="space-y-4">
            {tents?.map((tent) => {
              const tentPlants = plantsByTent?.[tent.id] || [];
              if (tentPlants.length === 0) return null;

              const isExpanded = expandedTents.has(tent.id);

              return (
                <Card key={tent.id} className="overflow-hidden">
                  <CardHeader className="hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div 
                        className="flex items-center gap-3 flex-1 cursor-pointer"
                        onClick={() => toggleTent(tent.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        )}
                        <div>
                          <CardTitle className="text-xl">{tent.name}</CardTitle>
                          <CardDescription>
                            {tentPlants.length} {tentPlants.length === 1 ? "planta" : "plantas"}
                            {tentPlants.filter((p: any) => selectedPlants.has(p.id)).length > 0 && (
                              <span className="ml-2 text-primary font-medium">
                                ({tentPlants.filter((p: any) => selectedPlants.has(p.id)).length} selecionada{tentPlants.filter((p: any) => selectedPlants.has(p.id)).length > 1 ? 's' : ''})
                              </span>
                            )}
                          </CardDescription>
                        </div>
                      </div>
                      {isExpanded && tentPlants.length > 0 && (
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          {tentPlants.every((p: any) => selectedPlants.has(p.id)) ? (
                            <AnimatedButton
                              variant="outline"
                              size="sm"
                              onClick={() => deselectAllInTent(tent.id)}
                            >
                              Desmarcar Todas
                            </AnimatedButton>
                          ) : (
                            <AnimatedButton
                              variant="outline"
                              size="sm"
                              onClick={() => selectAllInTent(tent.id)}
                            >
                              Selecionar Todas
                            </AnimatedButton>
                          )}
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="pt-0">
                      <StaggerList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {tentPlants.map((plant: any) => (
                          <ListItemAnimation key={plant.id}>
                            <Card className={`border-2 transition-all duration-200 ease-out group cursor-pointer ${
                            selectedPlants.has(plant.id) 
                              ? "border-primary bg-primary/5 shadow-md shadow-primary/10" 
                              : "hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1 hover:scale-[1.01]"
                          }`}>
                            <CardHeader>
                              <div className="flex items-start justify-between gap-2">
                                <Checkbox
                                  checked={selectedPlants.has(plant.id)}
                                  onCheckedChange={() => togglePlantSelection(plant.id)}
                                  className="mt-1"
                                />
                                <Link href={`/plants/${plant.id}`} className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <CardTitle className="text-lg hover:text-primary transition-colors cursor-pointer">
                                      {plant.name}
                                    </CardTitle>
                                    {/* Badge de Muda vs Planta */}
                                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${
                                      plant.plantStage === "SEEDLING" 
                                        ? "bg-green-500/10 text-green-600 border-green-500/30" 
                                        : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                    }`}>
                                      {plant.plantStage === "SEEDLING" ? "🌱 Muda" : "🌿 Planta"}
                                    </span>
                                  </div>
                                  {plant.code && (
                                    <CardDescription className="text-sm font-mono">{plant.code}</CardDescription>
                                  )}
                                </Link>
                                <div className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(plant.status)}`}>
                                  {getStatusLabel(plant.status)}
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {/* Última foto da planta */}
                              {plant.lastHealthPhotoUrl && (
                                <LazyImage
                                  src={plant.lastHealthPhotoUrl}
                                  alt={plant.name}
                                  aspectRatio="3/4"
                                  className="w-full rounded-lg"
                                />
                              )}

                              {/* Indicadores visuais */}
                              <div className="flex flex-wrap gap-2">
                                {/* Fase do Ciclo */}
                                {plant.cyclePhase && plant.cycleWeek && (
                                  <div className={`px-2 py-1 rounded-md text-xs font-medium ${
                                    plant.cyclePhase === "VEGA" 
                                      ? "bg-green-500/10 text-green-600 border border-green-500/30" 
                                      : "bg-purple-500/10 text-purple-600 border border-purple-500/30"
                                  }`}>
                                    {plant.cyclePhase === "VEGA" ? "🌱" : "🌸"} {plant.cyclePhase === "VEGA" ? "Vega" : "Flora"} Semana {plant.cycleWeek}
                                  </div>
                                )}
                                {/* Saúde */}
                                {plant.lastHealthStatus && (
                                  <div className={`px-2 py-1 rounded-md text-xs font-medium ${
                                    plant.lastHealthStatus === "HEALTHY" ? "bg-green-500/10 text-green-600 border border-green-500/30" :
                                    plant.lastHealthStatus === "STRESSED" ? "bg-yellow-500/10 text-yellow-600 border border-yellow-500/30" :
                                    plant.lastHealthStatus === "SICK" ? "bg-red-500/10 text-red-600 border border-red-500/30" :
                                    "bg-blue-500/10 text-blue-600 border border-blue-500/30"
                                  }`}>
                                    {plant.lastHealthStatus === "HEALTHY" ? "💚 Saudável" :
                                     plant.lastHealthStatus === "STRESSED" ? "💛 Estressada" :
                                     plant.lastHealthStatus === "SICK" ? "❤️ Doente" :
                                     "💙 Recuperando"}
                                  </div>
                                )}
                              </div>

                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Strain:</span>
                                  <span className="font-medium">{getStrainName(plant.strainId)}</span>
                                </div>
                              </div>

                              {plant.status === "ACTIVE" && (
                                <AnimatedButton
                                  variant="outline"
                                  size="sm"
                                  className="w-full gap-2"
                                  onClick={() => handleMovePlant(plant, tent.id)}
                                >
                                  <MoveRight className="w-4 h-4" />
                                  Mover para outra estufa
                                </AnimatedButton>
                              )}
                            </CardContent>
                          </Card>
                          </ListItemAnimation>
                        ))}
                      </StaggerList>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Sprout}
            title="Nenhuma planta encontrada"
            description="Comece adicionando sua primeira planta para acompanhar o crescimento e desenvolvimento."
            actionLabel="Nova Planta"
            onAction={() => navigate("/plants/new")}
          />
        )}
      </main>

      {/* Move Plant Dialog */}
      <Dialog open={movePlantDialog.open} onOpenChange={(open) => setMovePlantDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mover Planta</DialogTitle>
            <DialogDescription>
              Selecione a estufa de destino para {movePlantDialog.plant?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Estufa Atual</Label>
              <Input
                value={getTentName(movePlantDialog.fromTentId || 0)}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetTent">Estufa de Destino</Label>
              <select
                id="targetTent"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={targetTentId || ""}
                onChange={(e) => setTargetTentId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">Selecione uma estufa</option>
                {tents
                  ?.filter((t) => t.id !== movePlantDialog.fromTentId)
                  .map((tent) => (
                    <option key={tent.id} value={tent.id}>
                      {tent.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMovePlantDialog({ open: false })}
              disabled={movePlant.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmMovePlant}
              disabled={!targetTentId || movePlant.isPending}
            >
              {movePlant.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Movendo...
                </>
              ) : (
                <>
                  <MoveRight className="w-4 h-4 mr-2" />
                  Mover Planta
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Move Dialog */}
      <Dialog open={batchMoveDialog} onOpenChange={setBatchMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mover Plantas Selecionadas</DialogTitle>
            <DialogDescription>
              Mover {selectedPlants.size} planta{selectedPlants.size > 1 ? 's' : ''} para outra estufa
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="batchTargetTent">Estufa de Destino</Label>
              <Select 
                value={batchTargetTentId?.toString() || ""} 
                onValueChange={(value) => setBatchTargetTentId(value ? Number(value) : undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma estufa" />
                </SelectTrigger>
                <SelectContent>
                  {tents?.map((tent) => (
                    <SelectItem key={tent.id} value={tent.id.toString()}>
                      {tent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBatchMoveDialog(false);
                setBatchTargetTentId(undefined);
              }}
              disabled={moveMultiplePlants.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleBatchMove}
              disabled={!batchTargetTentId || moveMultiplePlants.isPending}
            >
              {moveMultiplePlants.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Movendo...
                </>
              ) : (
                <>
                  <MoveRight className="w-4 h-4 mr-2" />
                  Mover {selectedPlants.size} Planta{selectedPlants.size > 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating Action Bar for Bulk Operations */}
      {selectedPlants.size > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 transform -translate-x-1/2 z-50 max-w-[95vw]">
          <Card className="shadow-2xl border-2">
            <CardContent className="p-3 md:p-4">
              <div className="flex flex-wrap items-center gap-2 md:gap-3 justify-center">
                <span className="text-sm font-medium text-muted-foreground">
                  {selectedPlants.size} planta{selectedPlants.size > 1 ? 's' : ''} selecionada{selectedPlants.size > 1 ? 's' : ''}
                </span>
                <div className="h-6 w-px bg-border" />
                
                {/* Promover (apenas se todas forem mudas) */}
                {filteredPlants?.filter(p => selectedPlants.has(p.id)).every(p => p.plantStage === "SEEDLING") && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs px-2 md:px-3"
                    onClick={() => {
                      if (confirm(`Promover ${selectedPlants.size} muda(s) para planta?`)) {
                        bulkPromote.mutate({ plantIds: Array.from(selectedPlants) });
                      }
                    }}
                    disabled={bulkPromote.isPending}
                  >
                    {bulkPromote.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sprout className="w-4 h-4 mr-2" />
                    )}
                    Promover
                  </Button>
                )}
                
                {/* Mover */}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs px-2 md:px-3"
                  onClick={() => setBatchMoveDialog(true)}
                >
                  <MoveRight className="w-4 h-4 mr-2" />
                  Mover
                </Button>
                
                {/* Colher */}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs px-2 md:px-3"
                  onClick={() => {
                    if (confirm(`Marcar ${selectedPlants.size} planta(s) como colhida(s)?`)) {
                      bulkHarvest.mutate({ plantIds: Array.from(selectedPlants) });
                    }
                  }}
                  disabled={bulkHarvest.isPending}
                >
                  {bulkHarvest.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <span className="mr-2">🌾</span>
                  )}
                  Colher
                </Button>
                
                {/* Descartar */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (confirm(`Descartar ${selectedPlants.size} planta(s)? Esta ação não pode ser desfeita.`)) {
                      bulkDiscard.mutate({ plantIds: Array.from(selectedPlants) });
                    }
                  }}
                  disabled={bulkDiscard.isPending}
                  className="text-destructive hover:text-destructive text-xs px-2 md:px-3"
                >
                  {bulkDiscard.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <span className="mr-2">🗑️</span>
                  )}
                  Descartar
                </Button>
                
                {/* Cancelar */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs px-2 md:px-3"
                  onClick={() => setSelectedPlants(new Set())}
                >
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
    </PageTransition>
  );
}
