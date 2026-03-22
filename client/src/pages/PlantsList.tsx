import { useState, useMemo } from "react";
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
import { Plus, Sprout, Search, Filter, ChevronDown, ChevronRight, MoveRight, Loader2, Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { getStatusColor, getStatusLabel } from "@/lib/plantUtils";
import { PlantCardSkeleton } from "@/components/PlantCardSkeleton";
import { useLocation } from "wouter";
import { PageTransition, StaggerList, ListItemAnimation } from "@/components/PageTransition";
import { LazyImage } from "@/components/LazyImage";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

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

  const { data: plants, isLoading, isError, refetch } = trpc.plants.list.useQuery({
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

  // Estado do dialog de confirmação de exclusão
  const [deletePlantDialog, setDeletePlantDialog] = useState<{
    open: boolean;
    plant?: { id: number; name: string };
  }>({ open: false });

  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkPromoteConfirm, setBulkPromoteConfirm] = useState(false);
  const [bulkHarvestConfirm, setBulkHarvestConfirm] = useState(false);
  const [bulkDiscardConfirm, setBulkDiscardConfirm] = useState(false);

  const bulkDelete = trpc.plants.bulkDelete.useMutation({
    onSuccess: (data) => {
      utils.plants.list.invalidate();
      toast.success(`🗑️ ${data.count} planta(s) excluída(s) com sucesso!`);
      setSelectedPlants(new Set());
      setBulkDeleteConfirm(false);
    },
    onError: (error) => {
      toast.error(`Erro ao excluir plantas: ${error.message}`);
    },
  });

  const deletePlant = trpc.plants.delete.useMutation({
    onSuccess: () => {
      utils.plants.list.invalidate();
      toast.success("🗑️ Planta excluída com sucesso!");
      setDeletePlantDialog({ open: false });
    },
    onError: (error) => {
      toast.error(`Erro ao excluir planta: ${error.message}`);
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

  const filteredPlants = useMemo(() =>
    plants?.filter((plant) =>
      plant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plant.code?.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [plants, searchTerm]
  );

  // Agrupar plantas por estufa
  const plantsByTent = useMemo(() =>
    filteredPlants?.reduce((acc, plant) => {
      if (!acc[plant.currentTentId]) {
        acc[plant.currentTentId] = [];
      }
      acc[plant.currentTentId].push(plant);
      return acc;
    }, {} as Record<number, typeof plants>),
    [filteredPlants]
  );

  const getStrainName = useMemo(() => {
    const map = new Map(strains?.map((s) => [s.id, s.name]));
    return (strainId: number) => map.get(strainId) || "Unknown";
  }, [strains]);

  const getTentName = useMemo(() => {
    const map = new Map(tents?.map((t) => [t.id, t.name]));
    return (tentId: number) => map.get(tentId) || "Unknown";
  }, [tents]);

  // getStatusColor e getStatusLabel importados de @/lib/plantUtils

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
      <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
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
                  <Archive className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Arquivo</span>
                </Button>
              </Link>
              <Link href="/plants/new">
                <Button>
                  <Plus className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Nova Planta</span>
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
        {isError ? (
          <ErrorState onRetry={refetch} />
        ) : isLoading ? (
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
                            <Card className={`border-2 transition-all duration-200 ease-out group cursor-pointer overflow-hidden ${
                            selectedPlants.has(plant.id) 
                              ? "border-primary bg-primary/5 shadow-md shadow-primary/10" 
                              : plant.cyclePhase === 'VEGA'
                                ? 'border-green-500/25 hover:border-green-500/50 hover:shadow-xl hover:shadow-green-500/10 hover:-translate-y-1 hover:scale-[1.01]'
                                : plant.cyclePhase === 'FLORA'
                                ? 'border-purple-500/25 hover:border-purple-500/50 hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-1 hover:scale-[1.01]'
                                : 'hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1 hover:scale-[1.01]'
                          }}`}>
                            <CardHeader className="pb-3">
                              {/* Linha 1: checkbox + nome + status */}
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={selectedPlants.has(plant.id)}
                                  onCheckedChange={() => togglePlantSelection(plant.id)}
                                />
                                <Link href={`/plants/${plant.id}`} className="flex-1 min-w-0">
                                  <CardTitle className="text-base leading-tight hover:text-primary transition-colors cursor-pointer truncate">
                                    {plant.name}
                                  </CardTitle>
                                </Link>
                                <div className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-medium border ${getStatusColor(plant.status)}`}>
                                  {getStatusLabel(plant.status)}
                                </div>
                              </div>
                              {/* Linha 2: código + tipo */}
                              <div className="flex items-center gap-2 mt-1 ml-6">
                                {plant.code && (
                                  <span className="text-xs font-mono text-muted-foreground">{plant.code}</span>
                                )}
                                {plant.code && <span className="text-muted-foreground/40 text-xs">·</span>}
                                <span className={`text-xs font-medium ${
                                  plant.plantStage === "SEEDLING" ? "text-green-500" : "text-emerald-500"
                                }`}>
                                  {plant.plantStage === "SEEDLING" ? "🌱 Muda" : "🌿 Planta"}
                                </span>
                              </div>
                            </CardHeader>

                            <CardContent className="space-y-3 pt-0">
                              {/* Foto */}
                              {plant.lastHealthPhotoUrl && (
                                <LazyImage
                                  src={plant.lastHealthPhotoUrl}
                                  alt={plant.name}
                                  aspectRatio="3/4"
                                  className="w-full rounded-lg"
                                />
                              )}

                              {/* Fase + Saúde — mesmo tamanho, mesma linha */}
                              <div className="flex items-center gap-2 flex-wrap">
                                {plant.cyclePhase && plant.cycleWeek && (
                                  <span className={`px-2 py-1 rounded-md text-xs font-semibold border ${
                                    plant.cyclePhase === 'VEGA'
                                      ? 'bg-green-500/10 border-green-500/25 text-green-400'
                                      : 'bg-purple-500/10 border-purple-500/25 text-purple-400'
                                  }`}>
                                    {plant.cyclePhase === 'VEGA' ? '🌱' : '🌸'} {plant.cyclePhase === 'VEGA' ? 'Vega' : 'Flora'} · Sem. {plant.cycleWeek}
                                  </span>
                                )}
                                {plant.lastHealthStatus && (
                                  <span className={`px-2 py-1 rounded-md text-xs font-medium border ${
                                    plant.lastHealthStatus === "HEALTHY" ? "bg-green-500/10 border-green-500/25 text-green-400" :
                                    plant.lastHealthStatus === "STRESSED" ? "bg-yellow-500/10 border-yellow-500/25 text-yellow-400" :
                                    plant.lastHealthStatus === "SICK" ? "bg-red-500/10 border-red-500/25 text-red-400" :
                                    "bg-blue-500/10 border-blue-500/25 text-blue-400"
                                  }`}>
                                    {plant.lastHealthStatus === "HEALTHY" ? "💚 Saudável" :
                                     plant.lastHealthStatus === "STRESSED" ? "💛 Estressada" :
                                     plant.lastHealthStatus === "SICK" ? "❤️ Doente" :
                                     "💙 Recuperando"}
                                  </span>
                                )}
                              </div>

                              {/* Strain inline */}
                              <p className="text-xs text-muted-foreground truncate">
                                🧬 {getStrainName(plant.strainId)}
                              </p>

                              {/* Ações */}
                              <div className="flex items-center gap-2 pt-1">
                                <Link
                                  href={`/plants/${plant.id}`}
                                  className="flex-1 inline-flex items-center justify-center rounded-md text-sm font-medium bg-gradient-to-br from-emerald-400 to-green-600 text-white h-8 px-3 shadow-[0_0_8px_rgba(74,222,128,0.2)] hover:shadow-[0_0_12px_rgba(74,222,128,0.35)] hover:scale-[1.02] active:scale-95 transition-all duration-150"
                                >
                                  Ver Planta
                                </Link>
                                {plant.status === "ACTIVE" && (
                                  <AnimatedButton
                                    variant="outline"
                                    size="icon-sm"
                                    className="hover:scale-[1.05] hover:border-primary/40 hover:bg-primary/10 hover:text-primary active:scale-95 transition-all duration-150"
                                    title="Mover planta"
                                    onClick={() => handleMovePlant(plant, tent.id)}
                                  >
                                    <MoveRight className="w-3.5 h-3.5" />
                                  </AnimatedButton>
                                )}
                                <AnimatedButton
                                  variant="outline"
                                  size="icon-sm"
                                  className="hover:scale-[1.05] hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-500 active:scale-95 transition-all duration-150"
                                  title="Excluir planta"
                                  onClick={() => setDeletePlantDialog({ open: true, plant: { id: plant.id, name: plant.name } })}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </AnimatedButton>
                              </div>
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
        ) : filterStatus || searchTerm ? (
          <EmptyState
            icon={Sprout}
            title="Nenhuma planta encontrada"
            description={
              filterStatus && searchTerm
                ? `Nenhuma planta com status "${{ ACTIVE: 'Ativa', HARVESTED: 'Colhida', DEAD: 'Morta', DISCARDED: 'Descartada' }[filterStatus]}" corresponde a "${searchTerm}".`
                : filterStatus
                ? `Nenhuma planta com status "${{ ACTIVE: 'Ativa', HARVESTED: 'Colhida', DEAD: 'Morta', DISCARDED: 'Descartada' }[filterStatus]}" encontrada.`
                : `Nenhuma planta corresponde a "${searchTerm}".`
            }
            actionLabel="Limpar filtros"
            onAction={() => { setFilterStatus(undefined); setSearchTerm(""); }}
          />
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
                    onClick={() => setBulkPromoteConfirm(true)}
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
                  onClick={() => setBulkHarvestConfirm(true)}
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
                  onClick={() => setBulkDiscardConfirm(true)}
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
                
                {/* Excluir permanentemente */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkDeleteConfirm(true)}
                  disabled={bulkDelete.isPending}
                  className="text-red-500 border-red-500/30 hover:bg-red-500/10 hover:border-red-500/50 text-xs px-2 md:px-3"
                >
                  {bulkDelete.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Excluir
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

      {/* Bulk Delete Confirm Dialog */}
      <Dialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Excluir {selectedPlants.size} Planta{selectedPlants.size > 1 ? 's' : ''}
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir permanentemente{" "}
              <span className="font-semibold text-foreground">{selectedPlants.size} planta{selectedPlants.size > 1 ? 's' : ''}</span>?
              Esta ação não pode ser desfeita e removerá todos os registros, fotos e histórico de cada planta.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setBulkDeleteConfirm(false)}
              disabled={bulkDelete.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => bulkDelete.mutate({ plantIds: Array.from(selectedPlants) })}
              disabled={bulkDelete.isPending}
            >
              {bulkDelete.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir {selectedPlants.size} Planta{selectedPlants.size > 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Plant Confirm Dialog */}
      <DeleteConfirmDialog
        open={deletePlantDialog.open}
        onOpenChange={(open) => setDeletePlantDialog({ open })}
        title="Excluir Planta"
        description={
          <>
            Tem certeza que deseja excluir permanentemente{" "}
            <span className="font-semibold text-foreground">{deletePlantDialog.plant?.name}</span>?
            Esta ação não pode ser desfeita e removerá todos os registros, fotos e histórico associados.
          </>
        }
        onConfirm={() => {
          if (deletePlantDialog.plant) {
            deletePlant.mutate({ plantId: deletePlantDialog.plant.id });
          }
        }}
        isPending={deletePlant.isPending}
      />

      {/* Bulk Promote Confirm Dialog */}
      <Dialog open={bulkPromoteConfirm} onOpenChange={setBulkPromoteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Sprout className="w-5 h-5" />
              Promover Mudas
            </DialogTitle>
            <DialogDescription>
              Promover{" "}
              <span className="font-semibold text-foreground">{selectedPlants.size} muda{selectedPlants.size > 1 ? 's' : ''}</span>{" "}
              para planta? Esta ação atualizará o estágio de todas as mudas selecionadas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkPromoteConfirm(false)}>Cancelar</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => { bulkPromote.mutate({ plantIds: Array.from(selectedPlants) }); setBulkPromoteConfirm(false); }}
              disabled={bulkPromote.isPending}
            >
              {bulkPromote.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sprout className="w-4 h-4 mr-2" />}
              Promover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Harvest Confirm Dialog */}
      <Dialog open={bulkHarvestConfirm} onOpenChange={setBulkHarvestConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <span className="text-lg">🌾</span>
              Colher Plantas
            </DialogTitle>
            <DialogDescription>
              Marcar{" "}
              <span className="font-semibold text-foreground">{selectedPlants.size} planta{selectedPlants.size > 1 ? 's' : ''}</span>{" "}
              como colhida{selectedPlants.size > 1 ? 's' : ''}? As plantas serão arquivadas com status Colhida.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkHarvestConfirm(false)}>Cancelar</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => { bulkHarvest.mutate({ plantIds: Array.from(selectedPlants) }); setBulkHarvestConfirm(false); }}
              disabled={bulkHarvest.isPending}
            >
              {bulkHarvest.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <span className="mr-2">🌾</span>}
              Confirmar Colheita
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Discard Confirm Dialog */}
      <Dialog open={bulkDiscardConfirm} onOpenChange={setBulkDiscardConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Descartar Plantas
            </DialogTitle>
            <DialogDescription>
              Descartar{" "}
              <span className="font-semibold text-foreground">{selectedPlants.size} planta{selectedPlants.size > 1 ? 's' : ''}</span>?{" "}
              As plantas serão arquivadas com status Descartada. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkDiscardConfirm(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => { bulkDiscard.mutate({ plantIds: Array.from(selectedPlants) }); setBulkDiscardConfirm(false); }}
              disabled={bulkDiscard.isPending}
            >
              {bulkDiscard.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Confirmar Descarte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </PageTransition>
  );
}
