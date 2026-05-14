import { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useTactileFeedback } from "@/hooks/useTactileFeedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Sprout, Search, Filter, ChevronDown, ChevronRight, MoveRight, Loader2, Archive, Trash2, RotateCcw, MoreHorizontal, X, Leaf, Check } from "lucide-react";
import { useSidebar } from "@/contexts/SidebarContext";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PlantCardSkeleton } from "@/components/PlantCardSkeleton";
import { useLocation } from "wouter";
import { PageTransition, StaggerList, ListItemAnimation } from "@/components/PageTransition";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

type DialogState =
  | { type: 'movePlant'; plant: any; fromTentId: number; targetTentId?: number }
  | { type: 'batchMove'; targetTentId?: number }
  | { type: 'deletePlant'; plant: { id: number; name: string } }
  | { type: 'permanentDelete'; plant: { id: number; name: string } }
  | { type: 'bulkDelete' }
  | { type: 'bulkPromote' }
  | { type: 'bulkHarvest' }
  | { type: 'bulkDiscard' };

export default function PlantsList() {
  const { collapsed } = useSidebar();
  const [, navigate] = useLocation();
  const haptic = useTactileFeedback();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ACTIVE" | "HARVESTED" | "DEAD" | "DISCARDED" | "AWAITING_DRYING" | undefined>();
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "phase" | "age" | "health">("name");
  
  // Ler query param ?tent=ID para auto-expandir estufa
  const tentParam = new URLSearchParams(window.location.search).get('tent');
  const [expandedTents, setExpandedTents] = useState<Set<number>>(
    tentParam ? new Set([parseInt(tentParam)]) : new Set()
  );
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [selectedPlants, setSelectedPlants] = useState<Set<number>>(new Set());

  const { data: plants, isLoading, isError, refetch } = trpc.plants.list.useQuery({
    status: filterStatus,
  });

  const { data: tents } = trpc.tents.list.useQuery();
  const { data: strains } = trpc.strains.list.useQuery();

  // Expande todos os grupos na primeira carga — deve vir APÓS declaração de tents
  const expandedInitRef = useRef(false);
  useEffect(() => {
    if (expandedInitRef.current || !tents?.length) return;
    expandedInitRef.current = true;
    if (!tentParam) setExpandedTents(new Set(tents.map(t => t.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tents]);

  // Hold-to-select: pressionar e segurar 400ms ativa seleção
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startHold = (plantId: number) => {
    holdTimerRef.current = setTimeout(() => {
      togglePlantSelection(plantId);
      (navigator as any).vibrate?.(40);
      holdTimerRef.current = null;
    }, 400);
  };
  const cancelHold = () => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
  };

  const utils = trpc.useUtils();
  const moveMultiplePlants = trpc.plants.moveSelectedPlants.useMutation({
    onSuccess: (data) => {
      utils.plants.list.invalidate();
      toast.success(`${data.movedCount} planta(s) movida(s) com sucesso!`);
      setDialog(null);
      setSelectedPlants(new Set());
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
      setDialog(null);
      setSelectedPlants(new Set());
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

  const [showTrash, setShowTrash] = useState(false);

  const bulkDelete = trpc.plants.bulkDelete.useMutation({
    onSuccess: (data) => {
      utils.plants.list.invalidate();
      utils.plants.listDeleted.invalidate();
      toast.success(`${data.count} planta(s) movida(s) para a lixeira!`);
      setSelectedPlants(new Set());
      setDialog(null);
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
      setDialog(null);
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
      setDialog(null);
    },
    onError: (error) => toast.error(`Erro ao excluir: ${error.message}`),
  });

  const movePlant = trpc.plants.moveTent.useMutation({
    onSuccess: () => {
      utils.plants.list.invalidate();
      toast.success("Planta movida com sucesso!");
      setDialog(null);
    },
    onError: (error) => {
      toast.error(`Erro ao mover planta: ${error.message}`);
    },
  });

  const healthOrder: Record<string, number> = { HEALTHY: 0, RECOVERING: 1, STRESSED: 2, SICK: 3 };
  const phaseOrder: Record<string, number> = { FLORA: 0, VEGA: 1, CLONING: 2, SEEDLING: 3, MAINTENANCE: 4 };

  const filteredPlants = useMemo(() => {
    const filtered = plants?.filter((plant: any) =>
      plant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plant.code?.toLowerCase().includes(searchTerm.toLowerCase())
    ) ?? [];
    return [...filtered].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "pt-BR");
      if (sortBy === "phase") return (phaseOrder[a.cyclePhase ?? ""] ?? 99) - (phaseOrder[b.cyclePhase ?? ""] ?? 99);
      if (sortBy === "age") return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
      if (sortBy === "health") return (healthOrder[a.lastHealthStatus ?? ""] ?? 99) - (healthOrder[b.lastHealthStatus ?? ""] ?? 99);
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plants, searchTerm, sortBy]);

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
    const targetTentId = dialog?.type === 'batchMove' ? dialog.targetTentId : undefined;
    if (!targetTentId || selectedPlants.size === 0) {
      toast.error("Selecione uma estufa de destino");
      return;
    }
    bulkMove.mutate({
      plantIds: Array.from(selectedPlants),
      targetTentId,
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
    setDialog({ type: 'movePlant', plant, fromTentId });
  };

  const confirmMovePlant = () => {
    if (dialog?.type !== 'movePlant' || !dialog.targetTentId) return;
    movePlant.mutate({
      plantId: dialog.plant.id,
      toTentId: dialog.targetTentId,
      reason: "Mudança de fase/estufa",
    });
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
      {/* Header — fixed para funcionar dentro do scroll do iOS */}
      <header className={cn("bg-card border-b border-border fixed top-0 left-0 right-0 z-40 pt-safe transition-[left] duration-200 ease-in-out", collapsed ? "lg:left-16" : "lg:left-64")}>
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg">
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

      {/* Spacer = header height (py-4=32px + h-12=48px = 80px) + safe area */}
      <div aria-hidden="true" className="pt-safe" style={{ paddingBottom: '80px' }} />

      {/* Main Content */}
      <main className="container py-4">
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
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:col-span-2"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                >
                  <option value="name">Ordenar por: Nome (A–Z)</option>
                  <option value="phase">Ordenar por: Fase (Flora → Vega)</option>
                  <option value="age">Ordenar por: Idade (mais velhas primeiro)</option>
                  <option value="health">Ordenar por: Saúde (melhor → pior)</option>
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
              <PlantCardSkeleton key={`skeleton-plant-${i}`} />
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

              // Card bg para thumbnails no collapsed
              const tentCardBg =
                tent.category === 'FLORA'       ? '#581c87' :
                tent.category === 'DRYING'      ? '#78350f' :
                tent.category === 'MAINTENANCE' ? '#1e3a8a' :
                '#14532d';

              return (
                <div key={tent.id} className="space-y-2">
                  {/* Header da estufa — linha simples, sem box */}
                  <div
                    className="flex items-center justify-between px-1 cursor-pointer select-none"
                    onClick={() => toggleTent(tent.id)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isExpanded
                        ? <ChevronDown className={`w-4 h-4 shrink-0 ${tentColor.accent}`} />
                        : <ChevronRight className={`w-4 h-4 shrink-0 ${tentColor.accent}`} />
                      }
                      <span className={`w-2 h-2 rounded-full shrink-0 ${tentColor.dot}`} />
                      <span className="font-bold text-foreground truncate">{tent.name}</span>
                      <span className="text-xs text-muted-foreground/70 shrink-0">
                        {tentPlants.length} {tentPlants.length === 1 ? "planta" : "plantas"}
                      </span>
                      {selectedInTent > 0 && (
                        <span className={`text-xs font-bold shrink-0 ${tentColor.accent}`}>
                          · {selectedInTent} ✓
                        </span>
                      )}
                    </div>
                    {isExpanded && tentPlants.length > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); tentPlants.every((p: any) => selectedPlants.has(p.id)) ? deselectAllInTent(tent.id) : selectAllInTent(tent.id); }}
                        className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {tentPlants.every((p: any) => selectedPlants.has(p.id)) ? 'Desmarcar' : 'Selec. todas'}
                      </button>
                    )}
                  </div>

                  {/* Thumbnails das plantas quando recolhido — preview visual sem expandir */}
                  {!isExpanded && tentPlants.length > 0 && (
                    <div className="flex gap-2 pl-7 pb-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {tentPlants.slice(0, 7).map((p: any) => {
                        const letter = (p.name ?? '?')[0].toUpperCase();
                        const thumbUrl = p.lastHealthPhotoUrl
                          ? (p.lastHealthPhotoUrl.startsWith('/uploads/')
                              ? `/api/upload/thumbnail?url=${encodeURIComponent(p.lastHealthPhotoUrl)}&w=96&h=96&q=45`
                              : p.lastHealthPhotoUrl)
                          : null;
                        return (
                          <Link key={p.id} href={`/plants/${p.id}`} onClick={e => e.stopPropagation()}>
                            <div
                              className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border-2 border-border/20 active:scale-95 transition-transform"
                              style={{ background: tentCardBg }}
                            >
                              {thumbUrl ? (
                                <img src={thumbUrl} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white/50 text-sm font-bold">
                                  {letter}
                                </div>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                      {tentPlants.length > 7 && (
                        <div
                          className="w-12 h-12 rounded-xl border-2 border-border/20 flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0"
                          style={{ background: `${tentCardBg}60` }}
                        >
                          +{tentPlants.length - 7}
                        </div>
                      )}
                    </div>
                  )}

                  {isExpanded && (
                    <div>
                      <StaggerList className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
                        {tentPlants.map((plant: any) => {
                          const isSelected = selectedPlants.has(plant.id);

                          // Cor de fundo do card baseada na categoria da estufa
                          const cardBg =
                            tent.category === 'FLORA'       ? '#581c87' :  // purple-900
                            tent.category === 'DRYING'      ? '#78350f' :  // amber-900
                            tent.category === 'MAINTENANCE' ? '#1e3a8a' :  // blue-900
                            '#14532d';                                      // green-900 (VEGA / default)

                          // Badge de saúde
                          const healthBadge =
                            plant.lastHealthStatus === 'HEALTHY'    ? { icon: '✓', bg: 'rgba(74,222,128,0.22)', color: '#4ade80' } :
                            plant.lastHealthStatus === 'STRESSED'   ? { icon: '!', bg: 'rgba(251,191,36,0.25)', color: '#fbbf24' } :
                            plant.lastHealthStatus === 'SICK'       ? { icon: '✕', bg: 'rgba(248,113,113,0.25)', color: '#f87171' } :
                            plant.lastHealthStatus === 'RECOVERING' ? { icon: '↻', bg: 'rgba(96,165,250,0.25)', color: '#60a5fa' } :
                            null;

                          // Label de fase/semana
                          const phaseLabel =
                            plant.plantStage === 'SEEDLING'      ? 'Muda' :
                            plant.cyclePhase === 'FLORA' && plant.cycleWeek ? `Flora · S${plant.cycleWeek}` :
                            plant.cyclePhase === 'VEGA'  && plant.cycleWeek ? `Vega · S${plant.cycleWeek}`  :
                            getStrainName(plant.strainId) || '—';

                          const thumbUrl = plant.lastHealthPhotoUrl
                            ? (plant.lastHealthPhotoUrl.startsWith('/uploads/')
                                ? `/api/upload/thumbnail?url=${encodeURIComponent(plant.lastHealthPhotoUrl)}&w=220&h=300&q=55`
                                : plant.lastHealthPhotoUrl)
                            : null;

                          return (
                          <ListItemAnimation key={plant.id}>
                            <div
                              className={`rounded-2xl overflow-hidden relative aspect-[3/4] transition-all duration-200 ${
                                isSelected ? 'ring-2 ring-white/50 ring-offset-2 ring-offset-background scale-[0.96]' : ''
                              }`}
                              style={{ background: cardBg }}
                              onPointerDown={() => startHold(plant.id)}
                              onPointerUp={cancelHold}
                              onPointerLeave={cancelHold}
                              onContextMenu={e => e.preventDefault()}
                            >
                              {/* Badge saúde / toggle seleção — canto superior esquerdo */}
                              <button
                                onClick={e => { e.preventDefault(); e.stopPropagation(); togglePlantSelection(plant.id); }}
                                className="absolute top-2 left-2 z-30 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all active:scale-90 shadow-sm"
                                style={isSelected
                                  ? { background: 'var(--primary)', color: '#fff' }
                                  : healthBadge
                                  ? { background: healthBadge.bg, color: healthBadge.color }
                                  : { background: 'rgba(0,0,0,0.30)', color: 'rgba(255,255,255,0.55)' }
                                }
                              >
                                {isSelected
                                  ? <Check className="w-3.5 h-3.5" />
                                  : healthBadge
                                  ? <span className="leading-none">{healthBadge.icon}</span>
                                  : <Sprout className="w-3 h-3" />
                                }
                              </button>

                              {/* Menu 3 pontos — canto superior direito */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    onClick={e => { e.preventDefault(); e.stopPropagation(); }}
                                    className="absolute top-2 right-2 z-30 w-7 h-7 rounded-full bg-black/30 flex items-center justify-center text-white/70 hover:bg-black/50 hover:text-white transition-colors"
                                  >
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
                                    onClick={() => setDialog({ type: 'deletePlant', plant: { id: plant.id, name: plant.name } })}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" /> Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>

                              {/* Link cobre todo o card — foto + gradient + info */}
                              <Link href={`/plants/${plant.id}`} className="absolute inset-0 z-10">
                                {/* Foto full-card */}
                                {thumbUrl ? (
                                  <img
                                    src={thumbUrl}
                                    alt={plant.name}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Sprout className="w-14 h-14 text-white/15" />
                                  </div>
                                )}

                                {/* Gradient fade no bottom para legibilidade do texto */}
                                <div
                                  className="absolute inset-x-0 bottom-0 pointer-events-none"
                                  style={{ height: '55%', background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.25) 55%, transparent 100%)' }}
                                />

                                {/* Nome + fase sobrepostos */}
                                <div className="absolute inset-x-0 bottom-0 px-3 pb-3">
                                  <p className="text-white font-bold text-sm leading-tight truncate drop-shadow">{plant.name}</p>
                                  <p className="text-white/70 text-xs mt-0.5 uppercase tracking-wider truncate drop-shadow">{phaseLabel}</p>
                                </div>
                              </Link>

                              {/* Overlay de seleção */}
                              {isSelected && (
                                <div className="absolute inset-0 bg-primary/20 pointer-events-none rounded-2xl z-20" />
                              )}
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
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-xs font-bold text-white flex items-center justify-center">
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
                              ? <img
                                  src={plant.photoUrl.startsWith('/uploads/')
                                    ? `/api/upload/thumbnail?url=${encodeURIComponent(plant.photoUrl)}&w=80&h=80&q=60`
                                    : plant.photoUrl}
                                  alt={plant.name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />
                              : <Sprout className="w-5 h-5 text-muted-foreground" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <p className="text-sm font-bold text-foreground/60 truncate">{plant.name}</p>
                              {plant.code && <span className="text-xs font-mono text-muted-foreground/40 shrink-0">{plant.code}</span>}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-muted-foreground/50 truncate">{getStrainName(plant.strainId) || 'Sem strain'}</span>
                              <span className="text-muted-foreground/25 text-xs">·</span>
                              <span className="text-xs text-muted-foreground/40 shrink-0">{deletedLabel}</span>
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
                              onClick={() => setDialog({ type: 'permanentDelete', plant: { id: plant.id, name: plant.name } })}
                              className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10 active:scale-95 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="px-3 pb-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground/40 uppercase tracking-wide font-medium">Expira em</span>
                            <span className="text-xs font-bold" style={{ color: barColor }}>{timeLabel}</span>
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
                      onClick={() => setDialog({ type: 'permanentDelete', plant: { id: -1, name: `todas as ${deletedPlants!.length} plantas da lixeira` } })}
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
      <Dialog open={dialog?.type === 'permanentDelete'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir permanentemente</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir{" "}
              <span className="font-semibold text-foreground">
                {dialog?.type === 'permanentDelete' ? dialog.plant.name : ''}
              </span>{" "}
              permanentemente? Esta ação não pode ser desfeita e todos os dados da planta serão perdidos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={permanentDeletePlant.isPending}
              onClick={() => {
                if (dialog?.type !== 'permanentDelete') return;
                if (dialog.plant.id === -1) {
                  deletedPlants?.forEach((p: any) => permanentDeletePlant.mutate({ plantId: p.id }));
                  setDialog(null);
                } else {
                  permanentDeletePlant.mutate({ plantId: dialog.plant.id });
                }
              }}
            >
              {permanentDeletePlant.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir permanentemente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Plant Dialog */}
      <Dialog open={dialog?.type === 'movePlant'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mover Planta</DialogTitle>
            <DialogDescription>
              Selecione a estufa de destino para{" "}
              {dialog?.type === 'movePlant' ? dialog.plant?.name : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Estufa Atual</Label>
              <Input
                value={dialog?.type === 'movePlant' ? getTentName(dialog.fromTentId) : ''}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetTent">Estufa de Destino</Label>
              <select
                id="targetTent"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={dialog?.type === 'movePlant' ? (dialog.targetTentId ?? '') : ''}
                onChange={(e) => {
                  if (dialog?.type !== 'movePlant') return;
                  setDialog({ ...dialog, targetTentId: e.target.value ? Number(e.target.value) : undefined });
                }}
              >
                <option value="">Selecione uma estufa</option>
                {tents
                  ?.filter((t) => dialog?.type !== 'movePlant' || t.id !== dialog.fromTentId)
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
              onClick={() => setDialog(null)}
              disabled={movePlant.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmMovePlant}
              disabled={dialog?.type !== 'movePlant' || !dialog.targetTentId || movePlant.isPending}
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
      <Dialog open={dialog?.type === 'batchMove'} onOpenChange={(open) => !open && setDialog(null)}>
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
                value={dialog?.type === 'batchMove' ? (dialog.targetTentId?.toString() ?? '') : ''}
                onValueChange={(value) => {
                  if (dialog?.type !== 'batchMove') return;
                  setDialog({ ...dialog, targetTentId: value ? Number(value) : undefined });
                }}
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
              onClick={() => setDialog(null)}
              disabled={moveMultiplePlants.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleBatchMove}
              disabled={dialog?.type !== 'batchMove' || !dialog.targetTentId || moveMultiplePlants.isPending}
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
            <div className="flex">
              {/* Promover (condicional) */}
              {filteredPlants?.filter(p => selectedPlants.has(p.id)).every(p => p.plantStage === "SEEDLING") && (
                <button
                  onClick={() => { haptic.confirm(); setDialog({ type: 'bulkPromote' }); }}
                  disabled={bulkPromote.isPending}
                  className="flex-1 flex flex-col items-center gap-1.5 px-2 py-3.5 transition-colors active:scale-95 disabled:opacity-40"
                  style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(16,185,129,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {bulkPromote.isPending ? <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" /> : <Sprout className="w-4 h-4 text-emerald-400" />}
                  <span className="text-xs font-medium text-white/45 leading-none">Promover</span>
                </button>
              )}

              {/* Mover */}
              <button
                onClick={() => { haptic.confirm(); setDialog({ type: 'batchMove' }); }}
                className="flex-1 flex flex-col items-center gap-1.5 px-2 py-3.5 transition-colors active:scale-95"
                style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <MoveRight className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-medium text-white/45 leading-none">Mover</span>
              </button>

              {/* Colher */}
              <button
                onClick={() => { haptic.destructive(); setDialog({ type: 'bulkHarvest' }); }}
                disabled={bulkHarvest.isPending}
                className="flex-1 flex flex-col items-center gap-1.5 px-2 py-3.5 transition-colors active:scale-95 disabled:opacity-40"
                style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(245,158,11,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {bulkHarvest.isPending ? <Loader2 className="w-4 h-4 text-amber-400 animate-spin" /> : <Leaf className="w-4 h-4 text-amber-400" />}
                <span className="text-xs font-medium text-white/45 leading-none">Colher</span>
              </button>

              {/* Descartar */}
              <button
                onClick={() => { haptic.destructive(); setDialog({ type: 'bulkDiscard' }); }}
                disabled={bulkDiscard.isPending}
                className="flex-1 flex flex-col items-center gap-1.5 px-2 py-3.5 transition-colors active:scale-95 disabled:opacity-40"
                style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(249,115,22,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {bulkDiscard.isPending ? <Loader2 className="w-4 h-4 text-orange-400 animate-spin" /> : <Trash2 className="w-4 h-4 text-orange-400/80" />}
                <span className="text-xs font-medium text-white/45 leading-none">Descartar</span>
              </button>

              {/* Excluir */}
              <button
                onClick={() => { haptic.destructive(); setDialog({ type: 'bulkDelete' }); }}
                disabled={bulkDelete.isPending}
                className="flex-1 flex flex-col items-center gap-1.5 px-2 py-3.5 transition-colors active:scale-95 disabled:opacity-40"
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {bulkDelete.isPending ? <Loader2 className="w-4 h-4 text-red-400 animate-spin" /> : <Trash2 className="w-4 h-4 text-red-400" />}
                <span className="text-xs font-medium text-white/45 leading-none">Excluir</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirm Dialog */}
      <Dialog open={dialog?.type === 'bulkDelete'} onOpenChange={(open) => !open && setDialog(null)}>
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
              onClick={() => setDialog(null)}
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
        open={dialog?.type === 'deletePlant'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Excluir Planta"
        description={
          <>
            Tem certeza que deseja excluir permanentemente{" "}
            <span className="font-semibold text-foreground">
              {dialog?.type === 'deletePlant' ? dialog.plant.name : ''}
            </span>?
            Esta ação não pode ser desfeita e removerá todos os registros, fotos e histórico associados.
          </>
        }
        onConfirm={() => {
          if (dialog?.type === 'deletePlant') {
            deletePlant.mutate({ plantId: dialog.plant.id });
          }
        }}
        isPending={deletePlant.isPending}
      />

      {/* Bulk Promote Confirm Dialog */}
      <Dialog open={dialog?.type === 'bulkPromote'} onOpenChange={(open) => !open && setDialog(null)}>
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
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90 border-0"
              onClick={() => { bulkPromote.mutate({ plantIds: Array.from(selectedPlants) }); setDialog(null); }}
              disabled={bulkPromote.isPending}
            >
              {bulkPromote.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sprout className="w-4 h-4 mr-2" />}
              Promover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Harvest Confirm Dialog */}
      <Dialog open={dialog?.type === 'bulkHarvest'} onOpenChange={(open) => !open && setDialog(null)}>
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
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90 border-0"
              onClick={() => { bulkHarvest.mutate({ plantIds: Array.from(selectedPlants) }); setDialog(null); }}
              disabled={bulkHarvest.isPending}
            >
              {bulkHarvest.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Leaf className="w-4 h-4 mr-2" />}
              Confirmar Colheita
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Discard Confirm Dialog */}
      <Dialog open={dialog?.type === 'bulkDiscard'} onOpenChange={(open) => !open && setDialog(null)}>
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
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => { bulkDiscard.mutate({ plantIds: Array.from(selectedPlants) }); setDialog(null); }}
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
