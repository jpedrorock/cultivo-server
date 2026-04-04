import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useTactileFeedback } from "@/hooks/useTactileFeedback";
import { Button } from "@/components/ui/button";
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
import { Plus, Sprout, Search, Filter, ChevronDown, ChevronRight, MoveRight, Loader2, Archive, Trash2, RotateCcw, MoreHorizontal, X, Leaf, Flower2, Wrench } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { getStatusColor, getStatusLabel } from "@/lib/plantUtils";
import { PlantCardSkeleton } from "@/components/PlantCardSkeleton";
import { useLocation } from "wouter";
import { PageTransition, StaggerList, ListItemAnimation } from "@/components/PageTransition";
import { LazyImage } from "@/components/LazyImage";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

const getFitnessScore = (status: string | null | undefined) => {
  if (!status) return null;
  const map: Record<string, { score: number; color: string }> = {
    HEALTHY:    { score: 95, color: "#4ade80" },
    RECOVERING: { score: 62, color: "#60a5fa" },
    STRESSED:   { score: 38, color: "#fbbf24" },
    SICK:       { score: 12, color: "#f87171" },
  };
  return map[status] ?? null;
};

export default function PlantsList() {
  const [, navigate] = useLocation();
  const haptic = useTactileFeedback();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ACTIVE" | "HARVESTED" | "DEAD" | "DISCARDED" | "AWAITING_DRYING" | undefined>();
  const [filterOpen, setFilterOpen] = useState(false);
  
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
      toast.success(`${data.movedCount} planta(s) movida(s) com sucesso!`);
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
      toast.success(`${data.count} muda(s) promovida(s) para planta com sucesso!`);
      setSelectedPlants(new Set());
    },
    onError: (error) => {
      toast.error(`Erro ao promover mudas: ${error.message}`);
    },
  });

  const bulkMove = trpc.plants.bulkMove.useMutation({
    onSuccess: (data) => {
      utils.plants.list.invalidate();
      toast.success(`${data.count} planta(s) movida(s) com sucesso!`);
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
      toast.success(`${data.count} planta(s) colhida(s) com sucesso!`);
      setSelectedPlants(new Set());
    },
    onError: (error) => {
      toast.error(`Erro ao colher plantas: ${error.message}`);
    },
  });

  const bulkDiscard = trpc.plants.bulkDiscard.useMutation({
    onSuccess: (data) => {
      utils.plants.list.invalidate();
      toast.success(`${data.count} planta(s) descartada(s) com sucesso!`);
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

  const [showTrash, setShowTrash] = useState(false);
  const [permanentDeleteDialog, setPermanentDeleteDialog] = useState<{ open: boolean; plant?: { id: number; name: string } }>({ open: false });
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkPromoteConfirm, setBulkPromoteConfirm] = useState(false);
  const [bulkHarvestConfirm, setBulkHarvestConfirm] = useState(false);
  const [bulkDiscardConfirm, setBulkDiscardConfirm] = useState(false);

  const bulkDelete = trpc.plants.bulkDelete.useMutation({
    onSuccess: (data) => {
      utils.plants.list.invalidate();
      utils.plants.listDeleted.invalidate();
      toast.success(`${data.count} planta(s) movida(s) para a lixeira!`);
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
      utils.plants.listDeleted.invalidate();
      toast.success("Planta movida para a lixeira!");
      setDeletePlantDialog({ open: false });
    },
    onError: (error) => {
      toast.error(`Erro ao excluir planta: ${error.message}`);
    },
  });

  const { data: deletedPlants } = trpc.plants.listDeleted.useQuery();

  const restorePlant = trpc.plants.restore.useMutation({
    onSuccess: () => {
      utils.plants.list.invalidate();
      utils.plants.listDeleted.invalidate();
      toast.success("Planta restaurada com sucesso!");
    },
    onError: (error) => toast.error(`Erro ao restaurar: ${error.message}`),
  });

  const permanentDeletePlant = trpc.plants.permanentDelete.useMutation({
    onSuccess: () => {
      utils.plants.listDeleted.invalidate();
      toast.success("Planta excluída permanentemente!");
      setPermanentDeleteDialog({ open: false });
    },
    onError: (error) => toast.error(`Erro ao excluir: ${error.message}`),
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="w-9 h-9">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => navigate("/plants/new")}>
                  <Plus className="w-4 h-4 mr-2" /> Adicionar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterOpen(o => !o)}>
                  <Filter className="w-4 h-4 mr-2" /> Filtro {(searchTerm || filterStatus) ? "•" : ""}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/plants/archive")}>
                  <Archive className="w-4 h-4 mr-2" /> Arquivo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8">
        {/* Filters — collapsible */}
        {filterOpen && (
          <div className="mb-4 rounded-2xl border border-primary/25 bg-card overflow-hidden p-3" style={{ background: 'linear-gradient(135deg, rgba(var(--primary)/0.05) 0%, rgba(0,0,0,0) 60%)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou código..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={filterStatus || ""}
                  onChange={(e) => setFilterStatus(e.target.value as any || undefined)}
                >
                  <option value="">Todos os status</option>
                  <option value="ACTIVE">Ativa</option>
                  <option value="AWAITING_DRYING">Aguardando Secagem</option>
                  <option value="HARVESTED">Colhida</option>
                  <option value="DEAD">Morta</option>
                  <option value="DISCARDED">Descartada</option>
                </select>
              </div>
          </div>
        )}

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
          <div className="space-y-3">
            {tents?.map((tent) => {
              const tentPlants = plantsByTent?.[tent.id] || [];
              if (tentPlants.length === 0) return null;

              const isExpanded = expandedTents.has(tent.id);
              const selectedInTent = tentPlants.filter((p: any) => selectedPlants.has(p.id)).length;

              // Tent category color
              const tentColor =
                tent.category === 'MAINTENANCE' ? { border: 'border-border/60', accent: 'text-blue-300', glow: 'rgba(59,130,246,0.12)', dot: 'bg-blue-400' }
                : tent.category === 'DRYING'    ? { border: 'border-border/60', accent: 'text-amber-300', glow: 'rgba(245,158,11,0.12)', dot: 'bg-amber-400' }
                : tent.category === 'FLORA'     ? { border: 'border-border/60', accent: 'text-purple-300', glow: 'rgba(168,85,247,0.12)', dot: 'bg-purple-400' }
                : tent.category === 'VEGA'      ? { border: 'border-border/60', accent: 'text-green-300', glow: 'rgba(34,197,94,0.12)', dot: 'bg-green-400' }
                :                                 { border: 'border-border/60', accent: 'text-emerald-300', glow: 'rgba(16,185,129,0.10)', dot: 'bg-emerald-400' };

              return (
                <div key={tent.id} className={`rounded-2xl border ${tentColor.border} bg-card overflow-hidden`}>
                  {/* Header — gradiente de fase igual às seções da calculadora */}
                  <div
                    className="flex items-center justify-between px-4 py-3 border-b border-border/40 cursor-pointer"
                    style={{ background: `linear-gradient(135deg, ${tentColor.glow} 0%, rgba(0,0,0,0) 100%)` }}
                    onClick={() => toggleTent(tent.id)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {isExpanded
                        ? <ChevronDown className={`w-4 h-4 shrink-0 ${tentColor.accent}`} />
                        : <ChevronRight className={`w-4 h-4 shrink-0 ${tentColor.accent}`} />
                      }
                      <span className={`w-2 h-2 rounded-full shrink-0 ${tentColor.dot}`} />
                      <span className="font-semibold text-foreground truncate">{tent.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {tentPlants.length} {tentPlants.length === 1 ? "planta" : "plantas"}
                      </span>
                      {selectedInTent > 0 && (
                        <span className={`text-xs font-semibold shrink-0 ${tentColor.accent}`}>
                          · {selectedInTent} selecionada{selectedInTent > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {isExpanded && tentPlants.length > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); tentPlants.every((p: any) => selectedPlants.has(p.id)) ? deselectAllInTent(tent.id) : selectAllInTent(tent.id); }}
                        className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg border border-border/40 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors`}
                      >
                        {tentPlants.every((p: any) => selectedPlants.has(p.id)) ? 'Desmarcar' : 'Selec. todas'}
                      </button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3">
                      <StaggerList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {tentPlants.map((plant: any) => {
                          const isSelected = selectedPlants.has(plant.id);
                          const fitness = getFitnessScore(plant.lastHealthStatus);

                          return (
                          <ListItemAnimation key={plant.id}>
                            {/* Card: foto direita + info esquerda */}
                            <div className={`rounded-2xl border overflow-hidden bg-card flex transition-all duration-200 ${
                              isSelected ? 'border-primary/50' : 'border-border/40'
                            }`}>

                              {/* Info à esquerda */}
                              <Link href={`/plants/${plant.id}`} className="flex-1 min-w-0 pl-3 pr-1 pt-3 pb-3 flex flex-col justify-start items-start gap-1.5">
                                {/* Nome + badge na mesma linha, ambos à esquerda */}
                                <div className="flex items-center gap-1.5 flex-wrap w-full">
                                  <p className="text-sm font-semibold text-foreground leading-tight">{plant.name}</p>
                                  <div className={`px-1.5 py-px rounded text-[10px] font-medium border ${getStatusColor(plant.status)}`}>
                                    {getStatusLabel(plant.status)}
                                  </div>
                                </div>
                                {/* Código + strain */}
                                <p className="text-[11px] text-muted-foreground/60 truncate w-full">
                                  {plant.code && <span className="font-mono">{plant.code} · </span>}
                                  {getStrainName(plant.strainId) || '—'}
                                </p>
                                {/* Fase + saúde */}
                                <div className="flex items-center gap-2 flex-wrap w-full">
                                  {(plant.cyclePhase && plant.cycleWeek) && (
                                    <span className={`text-[11px] font-medium flex items-center gap-0.5 ${plant.cyclePhase === 'VEGA' ? 'text-green-400' : 'text-purple-400'}`}>
                                      {plant.cyclePhase === 'VEGA' ? <Leaf className="w-3 h-3"/> : <Flower2 className="w-3 h-3"/>}
                                      {plant.cyclePhase === 'VEGA' ? 'Vega' : 'Flora'} S{plant.cycleWeek}
                                    </span>
                                  )}
                                  {fitness && (
                                    <span className="text-[11px] flex items-center gap-1" style={{ color: fitness.color }}>
                                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: fitness.color }}/>
                                      {plant.lastHealthStatus === "HEALTHY" ? "Saudável" : plant.lastHealthStatus === "STRESSED" ? "Estressada" : plant.lastHealthStatus === "SICK" ? "Doente" : "Recuperando"}
                                    </span>
                                  )}
                                </div>
                              </Link>

                              {/* Foto + ações à direita */}
                              <div className="w-[128px] shrink-0 border-l border-border/30 flex flex-col">
                                {/* Foto em aspect-ratio 3:4 (iPhone portrait) */}
                                <Link href={`/plants/${plant.id}`} className="block w-full" style={{ aspectRatio: '3/4' }}>
                                  <div className="w-full h-full bg-white/5">
                                    {plant.lastHealthPhotoUrl
                                      ? <img
                                          src={plant.lastHealthPhotoUrl.startsWith('/uploads/')
                                            ? `/api/upload/thumbnail?url=${encodeURIComponent(plant.lastHealthPhotoUrl)}&w=192&h=256&q=72`
                                            : plant.lastHealthPhotoUrl}
                                          alt={plant.name}
                                          width={128}
                                          height={171}
                                          className="w-full h-full object-cover"
                                          loading="lazy"
                                          decoding="async"
                                        />
                                      : <div className="w-full h-full flex items-center justify-center">
                                          <Sprout className="w-6 h-6 text-muted-foreground/20" />
                                        </div>
                                    }
                                  </div>
                                </Link>
                                {/* Ações: seleção | menu */}
                                <div className="flex border-t border-border/30 shrink-0">
                                  <button
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePlantSelection(plant.id); }}
                                    className={`flex-1 h-9 flex items-center justify-center transition-colors ${
                                      isSelected ? 'bg-primary/20 text-primary' : 'text-muted-foreground/40 hover:bg-white/5'
                                    }`}
                                  >
                                    {isSelected
                                      ? <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                      : <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none"><rect x="1.5" y="1.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/></svg>
                                    }
                                  </button>
                                  <div className="w-px bg-border/30" />
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button className="flex-1 h-9 flex items-center justify-center text-muted-foreground/40 hover:bg-white/5 transition-colors">
                                        <MoreHorizontal className="w-3.5 h-3.5" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-40">
                                      {plant.status === "ACTIVE" && (
                                        <DropdownMenuItem onClick={() => handleMovePlant(plant, tent.id)}>
                                          <MoveRight className="w-4 h-4 mr-2" /> Mover
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={() => setDeletePlantDialog({ open: true, plant: { id: plant.id, name: plant.name } })}
                                      >
                                        <Trash2 className="w-4 h-4 mr-2" /> Excluir
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            </div>
                          </ListItemAnimation>
                          );
                        })}
                      </StaggerList>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : filterStatus || searchTerm ? (
          <EmptyState
            icon={Sprout}
            title="Nenhuma planta encontrada"
            description={
              filterStatus && searchTerm
                ? `Nenhuma planta com status "${{ ACTIVE: 'Ativa', AWAITING_DRYING: 'Aguardando Secagem', HARVESTED: 'Colhida', DEAD: 'Morta', DISCARDED: 'Descartada' }[filterStatus]}" corresponde a "${searchTerm}".`
                : filterStatus
                ? `Nenhuma planta com status "${{ ACTIVE: 'Ativa', AWAITING_DRYING: 'Aguardando Secagem', HARVESTED: 'Colhida', DEAD: 'Morta', DISCARDED: 'Descartada' }[filterStatus]}" encontrada.`
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
      {/* ── Lixeira ── */}
      <div className="pb-12 mt-3 pt-3 border-t border-border/20">
        <div className="rounded-2xl border border-red-500/20 bg-card overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.05) 0%, rgba(0,0,0,0) 50%)' }}>
          {/* Header lixeira */}
          <div
            className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
            onClick={() => setShowTrash(!showTrash)}
          >
            {showTrash
              ? <ChevronDown className="w-4 h-4 text-red-400 shrink-0" />
              : <ChevronRight className="w-4 h-4 text-red-400 shrink-0" />
            }
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/25 flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-red-400" />
              </div>
              {(deletedPlants?.length ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
                  {deletedPlants!.length > 9 ? '9+' : deletedPlants!.length}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-bold text-foreground/80">Lixeira</span>
              <span className="text-xs text-muted-foreground ml-2">
                {(deletedPlants?.length ?? 0) === 0
                  ? '· vazia · ficam 30 dias'
                  : `· ${deletedPlants!.length} planta${deletedPlants!.length !== 1 ? 's' : ''}`}
              </span>
            </div>
          </div>

          {/* Lista expandida */}
          {showTrash && (
            <div className="px-3 pb-3 space-y-2">
              {(deletedPlants?.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-6 rounded-xl border border-dashed border-border/30 gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Sprout className="w-6 h-6 text-emerald-500/50" />
                  </div>
                  <div className="text-center space-y-0.5">
                    <p className="text-sm font-semibold text-foreground/70">Lixeira vazia</p>
                    <p className="text-xs text-muted-foreground/60 max-w-xs">
                      Plantas excluídas aparecem aqui por 30 dias.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {deletedPlants!.map((plant: any) => {
                    const deletedMs = Date.now() - new Date(plant.deletedAt).getTime();
                    const daysAgo = Math.floor(deletedMs / 86400000);
                    const daysLeft = Math.max(0, 30 - daysAgo);
                    const hoursLeft = Math.max(0, 720 - Math.floor(deletedMs / 3600000));
                    const expiryPct = Math.min((daysAgo / 30) * 100, 100);

                    const barColor = daysLeft <= 1 ? "#ef4444" : daysLeft <= 5 ? "#f59e0b" : daysLeft <= 10 ? "#eab308" : "#22c55e";
                    const timeLabel =
                      daysLeft === 0
                        ? hoursLeft <= 1 ? "< 1h restante" : `${hoursLeft}h restantes`
                        : daysLeft === 1 ? "1 dia restante"
                        : `${daysLeft} dias restantes`;
                    const deletedLabel =
                      daysAgo === 0 ? 'excluída hoje' : daysAgo === 1 ? 'excluída ontem' : `excluída há ${daysAgo} dias`;

                    return (
                      <div key={plant.id} className="rounded-xl border border-border/25 bg-card/60 overflow-hidden">
                        <div className="flex items-center gap-3 px-3 pt-3 pb-2.5">
                          <div className="w-10 h-10 rounded-lg border border-border/20 overflow-hidden bg-white/3 shrink-0 grayscale opacity-50 flex items-center justify-center">
                            {plant.photoUrl
                              ? <img src={plant.photoUrl} alt={plant.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                              : <Sprout className="w-5 h-5 text-muted-foreground" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <p className="text-sm font-bold text-foreground/60 truncate">{plant.name}</p>
                              {plant.code && <span className="text-[10px] font-mono text-muted-foreground/40 shrink-0">{plant.code}</span>}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[11px] text-muted-foreground/50 truncate">{getStrainName(plant.strainId) || 'Sem strain'}</span>
                              <span className="text-muted-foreground/25 text-[11px]">·</span>
                              <span className="text-[11px] text-muted-foreground/40 shrink-0">{deletedLabel}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => restorePlant.mutate({ plantId: plant.id })}
                              disabled={restorePlant.isPending}
                              className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 active:scale-95 transition-all disabled:opacity-50"
                            >
                              <RotateCcw className="w-3 h-3" />Restaurar
                            </button>
                            <button
                              onClick={() => setPermanentDeleteDialog({ open: true, plant: { id: plant.id, name: plant.name } })}
                              className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10 active:scale-95 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="px-3 pb-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wide font-medium">Expira em</span>
                            <span className="text-[10px] font-bold" style={{ color: barColor }}>{timeLabel}</span>
                          </div>
                          <div className="h-0.5 rounded-full bg-white/5 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${expiryPct}%`, background: barColor, boxShadow: `0 0 4px ${barColor}88` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-border/20 bg-white/[0.02]">
                    <button
                      className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                      onClick={() => deletedPlants!.forEach((p: any) => restorePlant.mutate({ plantId: p.id }))}
                      disabled={restorePlant.isPending}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />Restaurar tudo
                    </button>
                    <button
                      className="flex items-center gap-1.5 text-xs font-semibold text-red-400/60 hover:text-red-400 transition-colors"
                      onClick={() => setPermanentDeleteDialog({ open: true, plant: { id: -1, name: `todas as ${deletedPlants!.length} plantas da lixeira` } })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />Esvaziar lixeira
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      </main>

      {/* Permanent Delete Dialog */}
      <Dialog open={permanentDeleteDialog.open} onOpenChange={(open) => setPermanentDeleteDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir permanentemente</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <span className="font-semibold text-foreground">{permanentDeleteDialog.plant?.name}</span> permanentemente? Esta ação não pode ser desfeita e todos os dados da planta serão perdidos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermanentDeleteDialog({ open: false })}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={permanentDeletePlant.isPending}
              onClick={() => {
                if (!permanentDeleteDialog.plant) return;
                if (permanentDeleteDialog.plant.id === -1) {
                  // Esvaziar lixeira: deletar todas
                  deletedPlants?.forEach((p: any) => permanentDeletePlant.mutate({ plantId: p.id }));
                  setPermanentDeleteDialog({ open: false });
                } else {
                  permanentDeletePlant.mutate({ plantId: permanentDeleteDialog.plant.id });
                }
              }}
            >
              {permanentDeletePlant.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir permanentemente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Floating Action Bar for Bulk Operations — frosted glass */}
      {selectedPlants.size > 0 && (
        <div className="fixed bottom-24 left-4 right-4 z-[150] animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(14, 14, 16, 0.82)',
              backdropFilter: 'blur(32px) saturate(200%)',
              WebkitBackdropFilter: 'blur(32px) saturate(200%)',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                </div>
                <span className="text-xs font-semibold text-white/70 tracking-wide">
                  {selectedPlants.size} {selectedPlants.size === 1 ? 'planta selecionada' : 'plantas selecionadas'}
                </span>
              </div>
              <button
                onClick={() => setSelectedPlants(new Set())}
                className="w-5 h-5 rounded-full flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/8 transition-all active:scale-90"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* Actions — grid of cells with dividers */}
            <div className="flex" style={{ divideColor: 'rgba(255,255,255,0.05)' }}>
              {/* Promover (condicional) */}
              {filteredPlants?.filter(p => selectedPlants.has(p.id)).every(p => p.plantStage === "SEEDLING") && (
                <button
                  onClick={() => { haptic.confirm(); setBulkPromoteConfirm(true); }}
                  disabled={bulkPromote.isPending}
                  className="flex-1 flex flex-col items-center gap-1.5 px-2 py-3.5 transition-colors active:scale-95 disabled:opacity-40"
                  style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(16,185,129,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {bulkPromote.isPending ? <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" /> : <Sprout className="w-4 h-4 text-emerald-400" />}
                  <span className="text-[10px] font-medium text-white/45 leading-none">Promover</span>
                </button>
              )}

              {/* Mover */}
              <button
                onClick={() => { haptic.confirm(); setBatchMoveDialog(true); }}
                className="flex-1 flex flex-col items-center gap-1.5 px-2 py-3.5 transition-colors active:scale-95"
                style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <MoveRight className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] font-medium text-white/45 leading-none">Mover</span>
              </button>

              {/* Colher */}
              <button
                onClick={() => { haptic.destructive(); setBulkHarvestConfirm(true); }}
                disabled={bulkHarvest.isPending}
                className="flex-1 flex flex-col items-center gap-1.5 px-2 py-3.5 transition-colors active:scale-95 disabled:opacity-40"
                style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(245,158,11,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {bulkHarvest.isPending ? <Loader2 className="w-4 h-4 text-amber-400 animate-spin" /> : <Leaf className="w-4 h-4 text-amber-400" />}
                <span className="text-[10px] font-medium text-white/45 leading-none">Colher</span>
              </button>

              {/* Descartar */}
              <button
                onClick={() => { haptic.destructive(); setBulkDiscardConfirm(true); }}
                disabled={bulkDiscard.isPending}
                className="flex-1 flex flex-col items-center gap-1.5 px-2 py-3.5 transition-colors active:scale-95 disabled:opacity-40"
                style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(249,115,22,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {bulkDiscard.isPending ? <Loader2 className="w-4 h-4 text-orange-400 animate-spin" /> : <Trash2 className="w-4 h-4 text-orange-400/80" />}
                <span className="text-[10px] font-medium text-white/45 leading-none">Descartar</span>
              </button>

              {/* Excluir */}
              <button
                onClick={() => { haptic.destructive(); setBulkDeleteConfirm(true); }}
                disabled={bulkDelete.isPending}
                className="flex-1 flex flex-col items-center gap-1.5 px-2 py-3.5 transition-colors active:scale-95 disabled:opacity-40"
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {bulkDelete.isPending ? <Loader2 className="w-4 h-4 text-red-400 animate-spin" /> : <Trash2 className="w-4 h-4 text-red-400" />}
                <span className="text-[10px] font-medium text-white/45 leading-none">Excluir</span>
              </button>
            </div>
          </div>
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
              className="bg-gradient-to-br from-emerald-400 to-green-600 hover:from-emerald-500 hover:to-green-700 text-white border-0"
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
              <Leaf className="w-5 h-5" />
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
              className="bg-gradient-to-br from-emerald-400 to-green-600 hover:from-emerald-500 hover:to-green-700 text-white border-0"
              onClick={() => { bulkHarvest.mutate({ plantIds: Array.from(selectedPlants) }); setBulkHarvestConfirm(false); }}
              disabled={bulkHarvest.isPending}
            >
              {bulkHarvest.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Leaf className="w-4 h-4 mr-2" />}
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
