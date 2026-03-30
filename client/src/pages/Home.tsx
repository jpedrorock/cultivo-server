import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { WeatherWidget } from "@/components/WeatherWidget";
import StartCycleModal from "@/components/StartCycleModal";
import { InitiateCycleModal } from "@/components/InitiateCycleModal";
import { EditCycleModal } from "@/components/EditCycleModal";
import { CreateTentModal } from "@/components/CreateTentModal";
import { EditTentDialog } from "@/components/EditTentDialog";

import { SelectMotherPlantDialog } from "@/components/SelectMotherPlantDialog";
import { FinishCloningDialog } from "@/components/FinishCloningDialog";
import { PromotePhaseDialog } from "@/components/PromotePhaseDialog";
import { MoveToHarvestQueueDialog } from "@/components/MoveToHarvestQueueDialog";
import { PhaseConfirmDialog, type PhaseConfirmType } from "@/components/PhaseConfirmDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedButton } from "@/components/AnimatedButton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Sprout, Droplets, Sun, ThermometerSun, Wind, BookOpen, CheckCircle2, CheckCircle, Calculator, Bell, Trash2, EyeOff, Eye, Wrench, Scissors, Flower2, Check, AlertTriangle, X, Zap, Clock, ArrowRight, PauseCircle, PlayCircle, MoreVertical, Monitor, ChevronRight, BarChart2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { startMissingReadingsMonitor, getNotificationPermission } from "@/lib/notifications";
import PullToRefresh from "react-simple-pull-to-refresh";
import { countPendingLogs, syncPendingLogs, onConnectionRestored } from "@/lib/offlineStorage";
import { PageTransition, StaggerList, ListItemAnimation, CardAnimation, AnimatedCounter } from "@/components/PageTransition";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { TentCardSkeleton } from "@/components/TentCardSkeleton";
import { ErrorState } from "@/components/ErrorState";


export default function Home() {
  const [, setLocation] = useLocation();
  const [cycleModalOpen, setCycleModalOpen] = useState(false);
  const [selectedTent, setSelectedTent] = useState<{ id: number; name: string } | null>(null);
  const [initiateModalOpen, setInitiateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<any>(null);
  const [createTentModalOpen, setCreateTentModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tentToDelete, setTentToDelete] = useState<{ id: number; name: string } | null>(null);
  const [editTentDialogOpen, setEditTentDialogOpen] = useState(false);
  const [tentToEdit, setTentToEdit] = useState<any>(null);
  const [showMoveAllPlants, setShowMoveAllPlants] = useState(false);
  const [targetTentId, setTargetTentId] = useState<string>("");
  const [deletePreviewTentId, setDeletePreviewTentId] = useState<number | null>(null);
  const [pendingLogsCount, setPendingLogsCount] = useState(0);
  const [finalizeCycleConfirm, setFinalizeCycleConfirm] = useState<{ open: boolean; cycleId: number | null; tentName: string }>({
    open: false, cycleId: null, tentName: ""
  });
  
  const { data: deletePreview, isLoading: deletePreviewLoading } = trpc.tents.getDeletePreview.useQuery(
    { id: deletePreviewTentId! },
    { enabled: deletePreviewTentId !== null }
  );

  
  const { data: tents, isLoading, isError, refetch } = trpc.tents.list.useQuery();
  const { data: activeCycles } = trpc.cycles.listActive.useQuery();
  const { data: notifSettings, refetch: refetchNotifSettings } = trpc.alerts.getNotificationSettings.useQuery();
  const systemPaused = notifSettings?.systemPaused ?? false;
  const toggleSystemPaused = trpc.alerts.toggleSystemPaused.useMutation({
    onSuccess: (data) => {
      refetchNotifSettings();
      toast.success(data.systemPaused ? "Sistema pausado — alertas desativados" : "Sistema ativo — alertas retomados");
    },
    onError: () => toast.error("Erro ao alterar estado do sistema"),
  });

  // Offline sync — contar pendentes e sincronizar ao reconectar
  const createLogMutation = trpc.dailyLogs.create.useMutation();
  useEffect(() => {
    // Contar ao montar
    countPendingLogs().then(setPendingLogsCount);

    // Quando voltar a internet → sincronizar automaticamente
    const unsubscribe = onConnectionRestored(async () => {
      const count = await countPendingLogs();
      if (count === 0) return;
      toast("🔄 Conexão restaurada — sincronizando registros...", { duration: 3000 });
      const synced = await syncPendingLogs(async (log) => {
        await createLogMutation.mutateAsync({
          tentId: log.tentId,
          logDate: log.logDate instanceof Date ? log.logDate : new Date(log.logDate),
          turn: log.turn,
          tempC: log.tempC || undefined,
          rhPct: log.rhPct || undefined,
          wateringVolume: log.wateringVolume,
          runoffCollected: log.runoffCollected,
          ph: log.ph || undefined,
          ec: log.ec || undefined,
          ppfd: log.ppfd,
        });
      });
      const remaining = await countPendingLogs();
      setPendingLogsCount(remaining);
      if (synced > 0) {
        toast.success(`✅ ${synced} registro${synced > 1 ? 's' : ''} sincronizado${synced > 1 ? 's' : ''} com sucesso!`);
      }
    });

    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start missing readings monitor when component mounts
  useEffect(() => {
    // Only start monitor if notifications are enabled
    const config = localStorage.getItem('notificationConfig');
    if (!config) return;

    try {
      const parsed = JSON.parse(config);
      const alertsEnabled = parsed.alertsEnabled;
      const permission = getNotificationPermission();

      if (alertsEnabled && permission === 'granted') {
        // Function to fetch tents data for monitoring
        const getTentsData = async () => {
          if (!tents) return [];
          return tents.map(tent => ({
            id: tent.id,
            name: tent.name,
            lastReadingAt: tent.lastReadingAt || null,
          }));
        };

        // Start monitoring
        const cleanup = startMissingReadingsMonitor(getTentsData);
        return cleanup; // Cleanup on unmount
      }
    } catch (e) {
      console.error('Error starting missing readings monitor:', e);
    }
  }, [tents]);

  const handleStartCycle = (tentId: number, tentName: string) => {
    setSelectedTent({ id: tentId, name: tentName });
    setCycleModalOpen(true);
  };

  const moveAllPlants = trpc.plants.moveAllPlants.useMutation({
    onSuccess: (data) => {
      toast.success(`✅ ${data.movedCount} planta(s) movida(s) com sucesso!`);
      utils.plants.list.invalidate();
      utils.tents.list.invalidate();
      setShowMoveAllPlants(false);
      setTargetTentId("");
    },
    onError: (error) => {
      toast.error(`Erro ao mover plantas: ${error.message}`);
    },
  });

  const deleteTent = trpc.tents.delete.useMutation({
    onSuccess: () => {
      utils.tents.list.invalidate();
      toast.success("Estufa excluída com sucesso!");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleDeleteTent = (tentId: number, tentName: string) => {
    setTentToDelete({ id: tentId, name: tentName });
    setDeletePreviewTentId(tentId); // Trigger preview query
    setDeleteDialogOpen(true);
  };

  const handleMoveAllPlants = () => {
    if (!tentToDelete || !targetTentId) {
      toast.error("Selecione uma estufa de destino");
      return;
    }
    
    moveAllPlants.mutate({
      fromTentId: tentToDelete.id,
      toTentId: parseInt(targetTentId),
      reason: "Movimentação antes de excluir estufa",
    });
  };

  const confirmDeleteTent = () => {
    if (tentToDelete) {
      const tent = tentToDelete;
      setDeleteDialogOpen(false);
      setTentToDelete(null);
      setShowMoveAllPlants(false);
      setTargetTentId("");
      
      let timeoutId: NodeJS.Timeout | null = null;
      
      // Show toast with undo button
      toast.info(`Estufa "${tent.name}" será excluída em 5 segundos`, {
        duration: 5000,
        action: {
          label: "Desfazer",
          onClick: () => {
            if (timeoutId) clearTimeout(timeoutId);
            toast.success("Exclusão cancelada!");
          },
        },
      });
      
      // Schedule deletion after 5 seconds
      timeoutId = setTimeout(() => {
        deleteTent.mutate({ id: tent.id });
      }, 5000);
    }
  };

  const utils = trpc.useUtils();

  // Prefetch plants.list para cada estufa com plantas — assim a navegação tent→plantas é instantânea
  useEffect(() => {
    if (!tents || tents.length === 0) return;
    const tentsWithPlants = tents.filter((t: any) => (t.plantCount ?? t.plants?.length ?? 1) > 0);
    if (tentsWithPlants.length === 0) return;
    // Usar requestIdleCallback para não competir com o paint inicial
    const schedule = (fn: () => void) =>
      "requestIdleCallback" in window
        ? requestIdleCallback(fn, { timeout: 5000 })
        : setTimeout(fn, 1000);
    schedule(() => {
      tentsWithPlants.forEach((tent: any) => {
        utils.plants.list.prefetch({ tentId: tent.id });
      });
    });
  }, [tents, utils.plants.list]);

  // Pull-to-refresh handler
  const handleRefresh = async () => {
    await Promise.all([
      utils.tents.list.invalidate(),
      utils.cycles.listActive.invalidate(),
      utils.cycles.getActiveCyclesWithProgress.invalidate(),
    ]);
  };

  const startFlora = trpc.cycles.transitionToFlora.useMutation({
    onSuccess: () => {
      utils.cycles.listActive.invalidate();
      utils.tents.list.invalidate();
    },
  });

  const handleStartFlora = (cycleId: number, tentName: string) => {
    startFlora.mutate(
      {
        cycleId,
        floraStartDate: new Date(),
      },
      {
        onSuccess: () => {
          toast.success(`Fase de floração iniciada na ${tentName}!`);
        },
        onError: (error) => {
          toast.error(`Erro ao iniciar floração: ${error.message}`);
        },
      }
    );
  };

  const finalizeCycle = trpc.cycles.finalize.useMutation({
    onSuccess: () => {
      toast.success("Ciclo finalizado com sucesso!");
      utils.cycles.listActive.invalidate();
      utils.cycles.getByTent.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao finalizar ciclo: ${error.message}`);
    },
  });

  const handleFinalizeCycle = (cycleId: number, tentName: string) => {
    setFinalizeCycleConfirm({ open: true, cycleId, tentName });
  };

  const handleInitiateCycle = (tentId: number, tentName: string) => {
    setSelectedTent({ id: tentId, name: tentName });
    setInitiateModalOpen(true);
  };

  const handleEditCycle = (cycle: any, tent: any) => {
    setSelectedCycle(cycle);
    setSelectedTent({ id: tent.id, name: tent.name });
    setEditModalOpen(true);
  };

  const handleEditTent = (tent: any) => {
    setTentToEdit(tent);
    setEditTentDialogOpen(true);
  };



  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'n',
      ctrl: true,
      description: 'Criar Nova Estufa',
      action: () => {
        setCreateTentModalOpen(true);
        toast.success('Atalho acionado: Criar Nova Estufa');
      },
    },
    {
      key: 'h',
      ctrl: true,
      description: 'Ir para Histórico',
      action: () => {
        setLocation('/history');
        toast.success('Atalho acionado: Histórico');
      },
    },
    {
      key: 'c',
      ctrl: true,
      description: 'Ir para Calculadoras',
      action: () => {
        setLocation('/calculators');
        toast.success('Atalho acionado: Calculadoras');
      },
    },
  ]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
          <div className="container py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-primary/15 rounded-xl flex items-center justify-center ring-1 ring-primary/20 shadow-sm flex-shrink-0">
                  <Sprout className="w-4.5 h-4.5 text-primary" strokeWidth={2} />
                </div>
                <h1 className="text-base sm:text-xl font-bold text-foreground leading-tight">Cultivo</h1>
              </div>
            </div>
          </div>
        </header>
        <main className="container py-8">
          <div className="mb-6 flex items-center justify-between">
            <div className="h-8 w-24 bg-muted rounded animate-pulse" />
            <div className="h-9 w-36 bg-muted rounded animate-pulse" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <TentCardSkeleton key={i} />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (isError) {
    return <ErrorState fullPage onRetry={refetch} />;
  }

  const getTentCycle = (tentId: number) => {
    return activeCycles?.find((c) => c.tentId === tentId);
  };

  const getPhaseInfo = (category: string, cycle: any) => {
    if (!cycle) {
      return { phase: "Inativo", color: "bg-muted", icon: Wind };
    }

    if (category === "MAINTENANCE") {
      return {
        phase: "Manutenção",
        color: "bg-blue-500 dark:bg-blue-600",
        icon: Wrench,
      };
    }

    if (category === "DRYING") {
      return {
        phase: "Secagem",
        color: "bg-yellow-800 dark:bg-yellow-700",
        icon: Wind,
      };
    }

    // Check actual cycle phase, not just tent category
    if (cycle.floraStartDate) {
      return {
        phase: "Floração",
        color: "bg-purple-500 dark:bg-purple-600",
        icon: Flower2,
      };
    }

    // If cycle is active but no floraStartDate, it's vegetative
    return {
      phase: "Vegetativa",
        color: "bg-green-500 dark:bg-green-600",
      icon: Sprout,
    };
  };

  return (
    <PageTransition>
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
        <div className="container py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-primary/15 rounded-xl flex items-center justify-center ring-1 ring-primary/20 shadow-sm flex-shrink-0">
                <Sprout className="w-4.5 h-4.5 text-primary" strokeWidth={2} />
              </div>
              <h1 className="text-base sm:text-xl font-bold text-foreground leading-tight">Cultivo</h1>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/quick-log" className="!hidden md:!inline-block">
                <Button size="lg" className="gap-2">
                  <Zap className="w-5 h-5" />
                  Registro Rápido
                </Button>
              </Link>
              <button
                onClick={() => toggleSystemPaused.mutate()}
                disabled={toggleSystemPaused.isPending}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95 ${
                  systemPaused
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "border-primary/40 bg-primary/5 text-primary"
                }`}
                title={systemPaused ? "Sistema pausado — clique para retomar" : "Sistema ativo — clique para pausar"}
              >
                {toggleSystemPaused.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : systemPaused ? (
                  <PauseCircle className="w-4 h-4" />
                ) : (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                )}
                {systemPaused ? "Sistema Pausado" : "Sistema Ativo"}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Banner de registros offline pendentes */}
      {pendingLogsCount > 0 && (
        <div className="container pt-4">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400">
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
            <span className="text-sm font-medium">
              {pendingLogsCount} registro{pendingLogsCount > 1 ? 's' : ''} salvo{pendingLogsCount > 1 ? 's' : ''} offline — aguardando conexão para sincronizar
            </span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container py-4">
        {/* Tents Grid */}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <TentCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <StaggerList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tents?.map((tent) => {
            const cycle = getTentCycle(tent.id);
            const phaseInfo = getPhaseInfo(tent.category, cycle);
            const PhaseIcon = phaseInfo.icon;

            return (
              <TentCard
                key={tent.id}
                tent={tent}
                cycle={cycle}
                phaseInfo={phaseInfo}
                PhaseIcon={PhaseIcon}
                onStartCycle={handleStartCycle}
                onStartFlora={handleStartFlora}
                onInitiateCycle={handleInitiateCycle}
                onEditCycle={handleEditCycle}
                onFinalizeCycle={handleFinalizeCycle}
                onEditTent={handleEditTent}
                onDeleteTent={handleDeleteTent}
              />
            );
            })}
          </StaggerList>
        )}

        {/* Botão nova estufa — abaixo dos cards em todas as telas */}
        {!isLoading && (
          <button
            onClick={() => setCreateTentModalOpen(true)}
            className="w-full mt-4 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all duration-200 py-4"
            data-tour="create-tent-button"
          >
            <Sprout className="w-5 h-5" />
            <span className="text-sm font-medium">Nova Estufa</span>
          </button>
        )}

        {/* Weather Widget */}
        <div className="mt-8">
          <WeatherWidget />
        </div>




      </main>

      {/* Start Cycle Modal */}
      {selectedTent && (
        <StartCycleModal
          tentId={selectedTent.id}
          tentName={selectedTent.name}
          open={cycleModalOpen}
          onOpenChange={setCycleModalOpen}
        />
      )}

      {/* Initiate Cycle Modal */}
      {selectedTent && (
        <InitiateCycleModal
          open={initiateModalOpen}
          onOpenChange={setInitiateModalOpen}
          tentId={selectedTent.id}
          tentName={selectedTent.name}
        />
      )}

      {/* Edit Cycle Modal */}
      {selectedTent && selectedCycle && (
        <EditCycleModal
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          cycleId={selectedCycle.id}
          tentId={selectedTent.id}
          tentName={selectedTent.name}
          currentStartDate={selectedCycle.startDate}
          currentFloraStartDate={selectedCycle.floraStartDate}
          currentStrainId={selectedCycle.strainId}
        />
      )}

      {/* Create Tent Modal */}
      <CreateTentModal
        open={createTentModalOpen}
        onOpenChange={setCreateTentModalOpen}
      />

      {/* Edit Tent Dialog */}
      <EditTentDialog
        tent={tentToEdit}
        open={editTentDialogOpen}
        onOpenChange={setEditTentDialogOpen}
        onSuccess={() => {
          utils.tents.list.invalidate();
          utils.cycles.listActive.invalidate();
        }}
      />

      {/* Delete Tent Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) {
          setShowMoveAllPlants(false);
          setTargetTentId("");
          setDeletePreviewTentId(null);
        }
      }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a estufa "{tentToDelete?.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {/* Delete Preview Section */}
          {deletePreviewLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Verificando dados...</span>
            </div>
          ) : deletePreview ? (
            <div className="space-y-3 py-3">
              {/* Blockers */}
              {!deletePreview.canDelete && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="text-sm font-medium text-destructive mb-2 flex items-center gap-1"><AlertTriangle className="w-4 h-4"/>Não é possível excluir:
                  </p>
                  <ul className="text-sm space-y-1 text-destructive/90">
                    {deletePreview.blockers.activeCycles > 0 && (
                      <li>• {deletePreview.blockers.activeCycles} ciclo(s) ativo(s) - finalize primeiro</li>
                    )}
                    {deletePreview.blockers.plants > 0 && (
                      <li>• {deletePreview.blockers.plants} planta(s) na estufa - mova ou finalize primeiro</li>
                    )}
                  </ul>
                </div>
              )}
              
              {/* Preview of what will be deleted */}
              {deletePreview.totalRecords > 0 && (
                <div className="p-3 bg-muted/50 rounded-md">
                  <p className="text-sm font-medium mb-2">Serão excluídos permanentemente:</p>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    {deletePreview.willDelete.cycles > 0 && (
                      <li>• {deletePreview.willDelete.cycles} ciclo(s) finalizado(s)</li>
                    )}
                    {deletePreview.willDelete.recipes > 0 && (
                      <li>• {deletePreview.willDelete.recipes} receita(s) nutricional(is)</li>
                    )}
                    {deletePreview.willDelete.dailyLogs > 0 && (
                      <li>• {deletePreview.willDelete.dailyLogs} registro(s) diário(s)</li>
                    )}
                    {deletePreview.willDelete.alerts > 0 && (
                      <li>• {deletePreview.willDelete.alerts} alerta(s)</li>
                    )}
                    {deletePreview.willDelete.taskInstances > 0 && (
                      <li>• {deletePreview.willDelete.taskInstances} tarefa(s)</li>
                    )}
                    {deletePreview.willDelete.plantHistory > 0 && (
                      <li>• {deletePreview.willDelete.plantHistory} registro(s) de movimentação</li>
                    )}
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2 font-medium">
                    Total: {deletePreview.totalRecords} registro(s)
                    {deletePreview.totalRecords > 100 && <span className="inline-flex items-center gap-1 ml-1"><AlertTriangle className="w-3 h-3 text-amber-400"/>Grande quantidade de dados!</span>}
                  </p>
                </div>
              )}
              
              {deletePreview.totalRecords === 0 && deletePreview.canDelete && (
                <div className="p-3 bg-muted/30 rounded-md">
                  <p className="text-sm text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-green-500"/>Estufa vazia, sem dados relacionados.</p>
                </div>
              )}
            </div>
          ) : null}
          
          {/* Move All Plants Section */}
          {!showMoveAllPlants ? (
            <div className="py-3">
              <Button
                variant="outline"
                onClick={() => setShowMoveAllPlants(true)}
                className="w-full"
                disabled={deleteTent.isPending || moveAllPlants.isPending}
              >
                <span className="flex items-center gap-2"><ArrowRight className="w-4 h-4"/>Mover Todas as Plantas Primeiro</span>
              </Button>
            </div>
          ) : (
            <div className="py-3 space-y-3 border-t border-b">
              <p className="text-sm font-medium">Mover plantas para:</p>
              <Select value={targetTentId} onValueChange={setTargetTentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a estufa de destino" />
                </SelectTrigger>
                <SelectContent>
                  {tents?.filter(t => t.id !== tentToDelete?.id).map(tent => (
                    <SelectItem key={tent.id} value={tent.id.toString()}>
                      {tent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowMoveAllPlants(false);
                    setTargetTentId("");
                  }}
                  disabled={moveAllPlants.isPending}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleMoveAllPlants}
                  disabled={!targetTentId || moveAllPlants.isPending}
                  className="flex-1"
                >
                  {moveAllPlants.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Movendo...
                    </>
                  ) : (
                    "Mover Agora"
                  )}
                </Button>
              </div>
            </div>
          )}
          
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTent.isPending || moveAllPlants.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteTent}
              disabled={deleteTent.isPending || moveAllPlants.isPending || (deletePreview && !deletePreview.canDelete)}
              className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
            >
              {deleteTent.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir Estufa"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Finalizar Ciclo Confirm Dialog */}
      <Dialog open={finalizeCycleConfirm.open} onOpenChange={(open) => !open && setFinalizeCycleConfirm({ open: false, cycleId: null, tentName: "" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <CheckCircle className="w-5 h-5" />
              Finalizar Ciclo
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja finalizar o ciclo da{" "}
              <span className="font-semibold text-foreground">{finalizeCycleConfirm.tentName}</span>?
              Esta ação encerrará o ciclo ativo e não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFinalizeCycleConfirm({ open: false, cycleId: null, tentName: "" })}>
              Cancelar
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                if (finalizeCycleConfirm.cycleId) {
                  finalizeCycle.mutate({ cycleId: finalizeCycleConfirm.cycleId });
                  setFinalizeCycleConfirm({ open: false, cycleId: null, tentName: "" });
                }
              }}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Finalizar Ciclo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </div>
      </PullToRefresh>
    </PageTransition>
  );
}


function MiniSparkline({ values, color, w = 60, h = 20 }: { values: number[]; color: string; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h * 0.8 - h * 0.1).toFixed(1)}`);
  const [lx, ly] = pts[pts.length - 1].split(",").map(Number);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-60">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2" fill={color} />
    </svg>
  );
}

// Separate component for Tent Card with Tasks
function TentCard({ tent, cycle, phaseInfo, PhaseIcon, onStartCycle, onStartFlora, onInitiateCycle, onEditCycle, onFinalizeCycle, onEditTent, onDeleteTent }: any) {
  const [, navigate] = useLocation();
  const [tasksOpen, setTasksOpen] = useState(false);         // painel inteiro aberto/fechado
  const [tasksExpanded, setTasksExpanded] = useState(true);  // semana expandida quando painel aberto
  const [hideCompleted, setHideCompleted] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());

  const [selectMotherOpen, setSelectMotherOpen] = useState(false);
  const [selectedMotherId, setSelectedMotherId] = useState<number | null>(null);
  const [selectedMotherName, setSelectedMotherName] = useState<string>("");
  const [selectedClonesCount, setSelectedClonesCount] = useState<number>(10);
  const [finishCloningOpen, setFinishCloningOpen] = useState(false);
  const [promotePhaseOpen, setPromotePhaseOpen] = useState(false);
  const [harvestQueueOpen, setHarvestQueueOpen] = useState(false);

  // Mini-modal de confirmação de fase
  const [phaseConfirmOpen, setPhaseConfirmOpen] = useState(false);
  const [phaseConfirmType, setPhaseConfirmType] = useState<PhaseConfirmType>("FLORA");

  const openPhaseConfirm = (type: PhaseConfirmType) => {
    setPhaseConfirmType(type);
    setPhaseConfirmOpen(true);
  };

  const handlePhaseConfirmed = () => {
    setPhaseConfirmOpen(false);
    if (phaseConfirmType === "CLONING") {
      setSelectMotherOpen(true);
    } else {
      setPromotePhaseOpen(true);
    }
  };
  
  const { data: tasks, isLoading: tasksLoading } = trpc.tasks.getTasksByTent.useQuery(
    { tentId: tent.id },
    { enabled: !!cycle } // Only fetch if there's an active cycle
  );
  
  const { data: latestLog } = trpc.dailyLogs.getLatestByTent.useQuery(
    { tentId: tent.id }
  );

  const { data: recentLogs } = trpc.dailyLogs.list.useQuery(
    { tentId: tent.id, limit: 7 },
    { staleTime: 5 * 60 * 1000 }
  );
  const sparkTemps    = [...(recentLogs ?? [])].reverse().map(l => l.tempC ? parseFloat(String(l.tempC)) : null).filter((v): v is number => v !== null);
  const sparkRh       = [...(recentLogs ?? [])].reverse().map(l => l.rhPct  ? parseFloat(String(l.rhPct))  : null).filter((v): v is number => v !== null);

  // Buscar targets ideais - usa média das strains das plantas na estufa
  const currentWeek = cycle ? (() => {
    const now = new Date();
    const start = new Date(cycle.startDate);
    if (isNaN(start.getTime())) return null;
    const floraStart = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;
    if (floraStart && !isNaN(floraStart.getTime()) && now >= floraStart) {
      return Math.max(1, Math.floor((now.getTime() - floraStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
    }
    return Math.max(1, Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
  })() : null;
  
  const currentPhase = cycle ? (cycle.floraStartDate ? "FLORA" : "VEGA") : null;
  
  const { data: targets } = trpc.weeklyTargets.getTargetsByTent.useQuery(
    { tentId: tent.id, phase: currentPhase! as any, weekNumber: currentWeek! },
    { enabled: !!cycle && !!currentPhase && !!currentWeek }
  );

  const { data: alertCount } = trpc.alerts.getNewCount.useQuery(
    { tentId: tent.id },
    { staleTime: 2 * 60 * 1000 }
  );
  const markAllSeen = trpc.alerts.markAllAsSeen.useMutation();
  const newAlerts = alertCount != null ? Number(alertCount) : 0;
  
  // Função para determinar cor baseada no valor e target
  const getValueColor = (value: number | null | undefined, min: string | number | null | undefined, max: string | number | null | undefined) => {
    if (!value || !min || !max) return "text-foreground";
    
    // Converter strings para números
    const minNum = typeof min === 'string' ? parseFloat(min) : min;
    const maxNum = typeof max === 'string' ? parseFloat(max) : max;
    
    if (isNaN(minNum) || isNaN(maxNum)) return "text-foreground";
    
    // Verde: dentro da faixa ideal
    if (value >= minNum && value <= maxNum) {
      return "text-green-600 font-bold";
    }
    
    // Amarelo: próximo (±10% de tolerância)
    const tolerance = 0.1;
    const lowerBound = minNum * (1 - tolerance);
    const upperBound = maxNum * (1 + tolerance);
    
    if (value >= lowerBound && value <= upperBound) {
      return "text-yellow-600 font-bold";
    }
    
    // Vermelho: fora da faixa
    return "text-red-600 font-bold";
  };

  // Função para determinar ícone de status
  const getStatusIcon = (value: number | null | undefined, min: string | number | null | undefined, max: string | number | null | undefined) => {
    if (!value || !min || !max) return null;
    
    const minNum = typeof min === 'string' ? parseFloat(min) : min;
    const maxNum = typeof max === 'string' ? parseFloat(max) : max;
    
    if (isNaN(minNum) || isNaN(maxNum)) return null;
    
    // Verde: dentro da faixa ideal
    if (value >= minNum && value <= maxNum) {
      return <Check className="w-3 h-3 text-green-600 dark:text-green-400" />;
    }
    
    // Amarelo: próximo (±10% de tolerância)
    const tolerance = 0.1;
    const lowerBound = minNum * (1 - tolerance);
    const upperBound = maxNum * (1 + tolerance);
    
    if (value >= lowerBound && value <= upperBound) {
      return <AlertTriangle className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />;
    }
    
    // Vermelho: fora da faixa
    return <X className="w-3 h-3 text-red-600 dark:text-red-400" />;
  };

  const utils = trpc.useUtils();
  const toggleTask = trpc.tasks.toggleTask.useMutation({
    onSuccess: () => {
      utils.tasks.getTasksByTent.invalidate({ tentId: tent.id });
      toast.success("Tarefa atualizada!");
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar tarefa: ${error.message}`);
    },
  });

  const handleToggleTask = (taskId: number, currentIsDone: boolean) => {
    toggleTask.mutate({ taskId });
    
    // Se a tarefa está sendo marcada como concluída, colapsa automaticamente após 500ms
    if (!currentIsDone) {
      setTimeout(() => {
        setExpandedTasks(prev => {
          const newSet = new Set(prev);
          newSet.delete(taskId);
          return newSet;
        });
      }, 500);
    } else {
      // Se está sendo desmarcada, expande automaticamente
      setExpandedTasks(prev => new Set(prev).add(taskId));
    }
  };

  const completedTasks = tasks?.filter((t) => t.isDone).length || 0;
  const totalTasks = tasks?.length || 0;

  // Registros de hoje para tarefas diárias
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayLogs = (recentLogs ?? []).filter(l => new Date(l.logDate) >= todayStart);
  const morningDone = todayLogs.length >= 1;
  const afternoonDone = todayLogs.length >= 2;

  const phaseAccentColor = !cycle ? '#6b7280' :
    tent.category === 'VEGA'   ? '#4ade80' :
    tent.category === 'FLORA'  ? '#a78bfa' :
    tent.category === 'DRYING' ? '#fbbf24' :
    '#60a5fa';

  const phaseBg = !cycle ? 'none' :
    tent.category === 'VEGA'
      ? 'linear-gradient(160deg, rgba(74,222,128,0.07) 0%, transparent 50%)'
      : tent.category === 'FLORA'
      ? 'linear-gradient(160deg, rgba(167,139,250,0.08) 0%, transparent 50%)'
      : tent.category === 'DRYING'
      ? 'linear-gradient(160deg, rgba(251,191,36,0.07) 0%, transparent 50%)'
      : 'linear-gradient(160deg, rgba(96,165,250,0.07) 0%, transparent 50%)';

  return (
    <ListItemAnimation>
      <div className="relative">
      {/* Badge de alertas — canto superior direito do card */}
      {newAlerts > 0 && (
        <Link href="/alerts" onClick={e => e.stopPropagation()}>
          <div
            title={`${newAlerts} alerta${newAlerts > 1 ? 's' : ''}`}
            className="absolute -top-3 right-2 z-30 min-w-[32px] h-[32px] px-2 rounded-full bg-red-500 text-white text-sm font-bold flex items-center justify-center shadow-lg shadow-red-900/50 animate-pulse"
          >
            {newAlerts > 9 ? '9+' : newAlerts}
          </div>
        </Link>
      )}
      <Card className="backdrop-blur-sm relative z-10 shadow-xl shadow-black/20 transition-all duration-200 ease-out hover:-translate-y-0.5 group overflow-hidden" data-tour="tent-card" style={{ borderLeft: `3px solid ${phaseAccentColor}`, background: phaseBg, backgroundColor: 'hsl(var(--card) / 0.92)' }} onMouseEnter={e => { if (cycle) e.currentTarget.style.boxShadow = `0 20px 40px -12px ${phaseAccentColor}40, 0 8px 16px -8px ${phaseAccentColor}20`; }} onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
      <CardHeader className="pl-8">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
              {tent.name}
              <Badge 
                className={`${phaseInfo.color} text-white border-0`}
              >
                <PhaseIcon className="w-3 h-3 mr-1" />
                {phaseInfo.phase}
              </Badge>
              {(() => {
                if (!tent.lastReadingAt) {
                  return (
                    <Badge variant="outline" className="text-gray-500 border-gray-300">
                      <Clock className="w-3 h-3 mr-1" />
                      Sem registros
                    </Badge>
                  );
                }
                const now = Date.now();
                const diffMs = now - tent.lastReadingAt;
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                
                let badgeColor = "bg-green-500/10 text-green-700 border-green-300 dark:bg-green-500/20 dark:text-green-400 dark:border-green-600";
                let timeText = "";
                
                // Smart time-based colors: green <6h, yellow 6-20h, red >20h
                if (diffHours === 0) {
                  timeText = `há ${diffMinutes}min`;
                  badgeColor = "bg-green-500/10 text-green-700 border-green-300 dark:bg-green-500/20 dark:text-green-400 dark:border-green-600";
                } else if (diffHours < 6) {
                  timeText = `há ${diffHours}h`;
                  badgeColor = "bg-green-500/10 text-green-700 border-green-300 dark:bg-green-500/20 dark:text-green-400 dark:border-green-600";
                } else if (diffHours < 20) {
                  timeText = `há ${diffHours}h`;
                  badgeColor = "bg-yellow-500/10 text-yellow-700 border-yellow-300 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-600";
                } else {
                  timeText = `há ${diffHours}h`;
                  badgeColor = "bg-red-500/10 text-red-700 border-red-300 dark:bg-red-500/20 dark:text-red-400 dark:border-red-600";
                }
                
                return (
                  <Badge variant="outline" className={badgeColor}>
                    <Clock className="w-3 h-3 mr-1" />
                    {timeText}
                  </Badge>
                );
              })()}
            </CardTitle>
            <CardDescription className="mt-2 space-y-1">
              <div className="flex items-center gap-3">
                <span>{tent.category === 'MAINTENANCE' ? 'Manutenção' : tent.category === 'VEGA' ? 'Vegetativa' : tent.category === 'FLORA' ? 'Floração' : 'Secagem'} • {tent.width}×{tent.depth}×{tent.height}cm</span>
                {(tent.plantCount !== undefined || tent.seedlingCount !== undefined) && (
                  <Link href={`/plants?tent=${tent.id}`}>
                    <div className="flex items-center gap-2">
                      {tent.plantCount > 0 && (
                        <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-primary/10 hover:border-primary/50 transition-colors">
                          <Sprout className="w-3 h-3" />
                          {tent.plantCount} {tent.plantCount === 1 ? 'planta' : 'plantas'}
                        </Badge>
                      )}
                      {tent.seedlingCount > 0 && (
                        <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-cyan-10 hover:border-cyan-50 transition-colors bg-cyan-50/50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-700 dark:hover:bg-cyan-900/50">
                          <Scissors className="w-3 h-3" />
                          {tent.seedlingCount} {tent.seedlingCount === 1 ? 'muda' : 'mudas'}
                        </Badge>
                      )}
                    </div>
                  </Link>
                )}
              </div>
              {tent.tentStrains && tent.tentStrains.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {tent.tentStrains.map((s: any) => (
                    <Badge key={s.id} variant="secondary" className="text-xs px-2 py-0">
                      {s.name}
                    </Badge>
                  ))}
                  {tent.tentStrains.length > 1 && (
                    <span className="text-xs text-muted-foreground italic">(média)</span>
                  )}
                </div>
              )}
            </CardDescription>
          </div>

          {/* Monitor — acesso rápido ao display da estufa */}
          <Link href={`/tent/${tent.id}/display`} onClick={e => e.stopPropagation()}>
            <button
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Modo Display"
            >
              <Monitor className="w-4 h-4" />
            </button>
          </Link>

          {/* ··· dropdown menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {!cycle ? (
                <>
                  <DropdownMenuItem onClick={() => onInitiateCycle(tent.id, tent.name)}>
                    <Sprout className="w-4 h-4 mr-2" />
                    Novo Ciclo
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate(`/tent/${tent.id}`)}>
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Ver Detalhes
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onEditTent(tent)}>
                    <Wrench className="w-4 h-4 mr-2" />
                    Editar Estufa
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDeleteTent(tent.id, tent.name)} className="text-red-600 focus:text-red-600">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir Estufa
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => navigate(`/quick-log?tentId=${tent.id}`)}>
                    <Zap className="w-4 h-4 mr-2" />
                    Registrar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/tent/${tent.id}`)}>
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Ver Detalhes
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onEditCycle(cycle, tent)}>
                    <Wrench className="w-4 h-4 mr-2" />
                    Editar Ciclo
                  </DropdownMenuItem>
                  {tent.category === "MAINTENANCE" && (
                    <DropdownMenuItem onClick={() => openPhaseConfirm("CLONING")}>
                      <Sprout className="w-4 h-4 mr-2 text-blue-500" />
                      Tirar Clones
                    </DropdownMenuItem>
                  )}
                  {tent.category === "VEGA" && (
                    <DropdownMenuItem onClick={() => openPhaseConfirm("FLORA")}>
                      <Flower2 className="w-4 h-4 mr-2 text-green-500" />
                      Avançar para Floração
                    </DropdownMenuItem>
                  )}
                  {tent.category === "FLORA" && (
                    <>
                      <DropdownMenuItem onClick={() => setHarvestQueueOpen(true)}>
                        <Wind className="w-4 h-4 mr-2 text-orange-500" />
                        Colher → Aguardando Secagem
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openPhaseConfirm("DRYING")}>
                        <Wind className="w-4 h-4 mr-2 text-amber-500" />
                        Ir direto para Secagem
                      </DropdownMenuItem>
                    </>
                  )}
                  {cycle.cloningStartDate && tent.category === "CLONING" && (
                    <DropdownMenuItem onClick={() => setFinishCloningOpen(true)}>
                      <ArrowRight className="w-4 h-4 mr-2 text-blue-500" />
                      Finalizar Clonagem
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onFinalizeCycle(cycle.id, tent.name)} className="text-red-600 focus:text-red-600">
                    <X className="w-4 h-4 mr-2" />
                    Finalizar Ciclo
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="pl-8 pr-6 pb-6 pt-0">
        <div className="space-y-5">
          {/* Cycle Info */}
          {cycle ? (
            <div
              onClick={() => navigate(`/tent/${tent.id}`)}
              className={`rounded-lg p-4 space-y-2 border cursor-pointer hover:brightness-110 transition-all duration-150 ${
                tent.category === 'VEGA'
                  ? 'border-green-500/20 dark:border-green-500/15'
                  : tent.category === 'FLORA'
                  ? 'border-purple-500/20 dark:border-purple-500/15'
                  : tent.category === 'DRYING'
                  ? 'border-amber-500/20 dark:border-amber-500/15'
                  : 'border-blue-500/20 dark:border-blue-500/15'
              }`}
              style={{
                background:
                  tent.category === 'VEGA'
                    ? 'linear-gradient(135deg, rgba(34,197,94,0.22) 0%, rgba(16,185,129,0.10) 60%, rgba(34,197,94,0.03) 100%)'
                    : tent.category === 'FLORA'
                    ? 'linear-gradient(135deg, rgba(168,85,247,0.24) 0%, rgba(139,92,246,0.11) 60%, rgba(168,85,247,0.03) 100%)'
                    : tent.category === 'DRYING'
                    ? 'linear-gradient(135deg, rgba(245,158,11,0.22) 0%, rgba(234,179,8,0.10) 60%, rgba(245,158,11,0.03) 100%)'
                    : 'linear-gradient(135deg, rgba(59,130,246,0.22) 0%, rgba(99,102,241,0.10) 60%, rgba(59,130,246,0.03) 100%)',
              }}
            >
              <div className="flex justify-between items-center">
                <span className={`text-sm font-semibold flex items-center gap-1.5 ${
                  tent.category === 'VEGA' ? 'text-green-700 dark:text-green-400'
                  : tent.category === 'FLORA' ? 'text-purple-700 dark:text-purple-400'
                  : tent.category === 'DRYING' ? 'text-amber-700 dark:text-amber-400'
                  : 'text-blue-700 dark:text-blue-400'
                }`}>
                  <PhaseIcon className="w-3.5 h-3.5" />
                  {tent.category === 'MAINTENANCE' ? 'Manutenção Perpétua' : 'Ciclo Ativo'}
                </span>
                {tent.category === 'MAINTENANCE' ? (
                  <span className="text-sm font-bold text-blue-700 dark:text-blue-400">
                    {tent.lastCloningAt
                      ? (() => {
                          const days = Math.floor((Date.now() - tent.lastCloningAt) / (24 * 60 * 60 * 1000));
                          if (days === 0) return 'Hoje';
                          if (days === 1) return 'Ontem';
                          return `Há ${days} dias`;
                        })()
                      : 'Sem clonagem'}
                  </span>
                ) : (
                  <span className={`text-sm font-bold ${
                    tent.category === 'VEGA' ? 'text-green-700 dark:text-green-400'
                    : tent.category === 'FLORA' ? 'text-purple-700 dark:text-purple-400'
                    : tent.category === 'DRYING' ? 'text-amber-700 dark:text-amber-400'
                    : 'text-blue-700 dark:text-blue-400'
                  }`}>
                    Semana {(() => {
                      const now = new Date();
                      const start = new Date(cycle.startDate);
                      if (isNaN(start.getTime())) return '?';
                      const floraStart = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;
                      if (floraStart && !isNaN(floraStart.getTime()) && now >= floraStart) {
                        return Math.max(1, Math.floor((now.getTime() - floraStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
                      }
                      return Math.max(1, Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
                    })()}
                  </span>
                )}
              </div>
              <div className="flex justify-between items-center">
                {tent.category === 'MAINTENANCE' ? (
                  <>
                    <span className="text-xs text-muted-foreground">Última Clonagem</span>
                    <span className="text-xs font-medium text-foreground">
                      {tent.lastCloningAt
                        ? new Date(tent.lastCloningAt).toLocaleDateString('pt-BR')
                        : '—'}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-muted-foreground">Semana Atual</span>
                    <span className="text-xs font-medium text-foreground">
                      {(() => {
                        const now = new Date();
                        const start = new Date(cycle.startDate);
                        if (isNaN(start.getTime())) return '—';
                        const floraStart = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;
                        let weekStart;
                        if (floraStart && !isNaN(floraStart.getTime()) && now >= floraStart) {
                          const weeksSinceFlora = Math.floor((now.getTime() - floraStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
                          weekStart = new Date(floraStart.getTime() + (weeksSinceFlora * 7 * 24 * 60 * 60 * 1000));
                        } else {
                          const weeksSinceStart = Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
                          weekStart = new Date(start.getTime() + (weeksSinceStart * 7 * 24 * 60 * 60 * 1000));
                        }
                        return weekStart.toLocaleDateString('pt-BR');
                      })()}
                    </span>
                  </>
                )}
              </div>

              {/* ── Barra de progresso do ciclo ── */}
              {tent.category !== 'MAINTENANCE' && (() => {
                const now = new Date();
                const start = new Date(cycle.startDate);
                if (isNaN(start.getTime())) return null;
                const floraStart = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;
                const isFlora = !!(floraStart && !isNaN(floraStart.getTime()) && now >= floraStart);
                const weekNum = isFlora
                  ? Math.max(1, Math.floor((now.getTime() - floraStart!.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1)
                  : Math.max(1, Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
                const totalEstWeeks = 16; // ~8 vega + 8 flora
                const totalWeekNum = isFlora
                  ? Math.floor((floraStart!.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + weekNum
                  : weekNum;
                const pct = Math.min((totalWeekNum / totalEstWeeks) * 100, 100);
                const barColor =
                  tent.category === 'VEGA'   ? '#4ade80' :
                  tent.category === 'FLORA'  ? '#a78bfa' :
                  tent.category === 'DRYING' ? '#fbbf24' : '#60a5fa';
                return (
                  <div className="pt-1 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <div className="flex gap-2">
                        {['Vega','Flora','Colheita'].map((label, i) => {
                          const active = i === 0 && !isFlora || i === 1 && isFlora;
                          return (
                            <span key={label} className={`text-[10px] font-medium ${active ? '' : 'text-muted-foreground/50'}`}
                                  style={active ? { color: barColor } : {}}>
                              {label}
                            </span>
                          );
                        })}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{Math.round(pct)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/20 dark:bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: barColor, boxShadow: `0 0 6px ${barColor}80` }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="bg-muted rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground">Nenhum ciclo ativo</p>
            </div>
          )}

          {/* Latest Readings */}
          {targets?._isAverage && (
            <div className="pt-3 pb-1">
              <p className="text-xs text-center text-muted-foreground bg-accent/30 rounded px-2 py-1">
                <span className="inline-flex items-center gap-1"><BarChart2 className="w-3.5 h-3.5 text-blue-400"/>Parâmetros médios ({targets._strainCount} strains)</span>
              </p>
            </div>
          )}
          {/* KPI Metrics — 3 colunas: Temp · RH · PPFD */}
          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border/60">
            {/* Temperature */}
            <div className="flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border border-orange-500/15" style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.18) 0%, rgba(234,88,12,0.08) 60%, rgba(249,115,22,0.02) 100%)' }}>
              <ThermometerSun className="w-4 h-4 text-orange-500 mb-0.5" />
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Temp</p>
              <div className="flex items-center gap-0.5">
                <p className={`text-base font-bold tracking-tight leading-none ${
                  latestLog?.tempC
                    ? getValueColor(parseFloat(latestLog.tempC), targets?.tempMin, targets?.tempMax)
                    : "text-foreground"
                }`}>
                  {latestLog?.tempC ? <AnimatedCounter value={parseFloat(latestLog.tempC)} decimals={1} suffix="°" /> : "--"}
                </p>
                {latestLog?.tempC && getStatusIcon(parseFloat(latestLog.tempC), targets?.tempMin, targets?.tempMax)}
              </div>
              <MiniSparkline values={sparkTemps} color="#f97316" />
            </div>
            {/* Humidity */}
            <div className="flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border border-teal-400/20" style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.15) 0%, rgba(20,184,166,0.07) 60%, rgba(45,212,191,0.02) 100%)' }}>
              <Droplets className="w-4 h-4 text-teal-400 mb-0.5" />
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">RH</p>
              <div className="flex items-center gap-0.5">
                <p className={`text-base font-bold tracking-tight leading-none ${
                  latestLog?.rhPct
                    ? getValueColor(parseFloat(latestLog.rhPct), targets?.rhMin, targets?.rhMax)
                    : "text-foreground"
                }`}>
                  {latestLog?.rhPct ? <AnimatedCounter value={parseFloat(latestLog.rhPct)} decimals={0} suffix="%" /> : "--"}
                </p>
                {latestLog?.rhPct && getStatusIcon(parseFloat(latestLog.rhPct), targets?.rhMin, targets?.rhMax)}
              </div>
              <MiniSparkline values={sparkRh} color="#2dd4bf" />
            </div>
            {/* PPFD */}
            <div className="flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border border-yellow-500/15" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.18) 0%, rgba(202,138,4,0.08) 60%, rgba(234,179,8,0.02) 100%)' }}>
              <Sun className="w-4 h-4 text-yellow-500 dark:text-yellow-400 mb-0.5" />
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">PPFD</p>
              <div className="flex items-center gap-0.5">
                <p className={`text-base font-bold tracking-tight leading-none ${
                  latestLog?.ppfd
                    ? getValueColor(latestLog.ppfd, targets?.ppfdMin, targets?.ppfdMax)
                    : "text-foreground"
                }`}>
                  {latestLog?.ppfd ? <AnimatedCounter value={latestLog.ppfd} /> : "--"}
                </p>
                {latestLog?.ppfd && getStatusIcon(latestLog.ppfd, targets?.ppfdMin, targets?.ppfdMax)}
              </div>
            </div>
          </div>

        </div>
      </CardContent>
      

      {/* Mini-modal de confirmação de fase */}
      <PhaseConfirmDialog
        open={phaseConfirmOpen}
        onOpenChange={setPhaseConfirmOpen}
        phase={phaseConfirmType}
        tentName={tent.name}
        onConfirm={handlePhaseConfirmed}
      />

      {/* Select Mother Plant Dialog */}
      <SelectMotherPlantDialog
        open={selectMotherOpen}
        onOpenChange={setSelectMotherOpen}
        tentId={tent.id}
        onMotherSelected={(plantId: number, plantName: string) => {
          // Salvar dados temporários
          setSelectedMotherId(plantId);
          setSelectedMotherName(plantName);
          setSelectMotherOpen(false);
          // Abrir FinishCloningDialog
          setFinishCloningOpen(true);
        }}
      />
      
      {/* Finish Cloning Dialog */}
      {cycle && (
        <FinishCloningDialog
          open={finishCloningOpen}
          onOpenChange={setFinishCloningOpen}
          cycleId={cycle.id}
          motherPlantId={selectedMotherId || 0}
          motherPlantName={selectedMotherName || "Planta Mãe"}
          clonesCount={selectedClonesCount}
        />
      )}
      
      {/* Promote Phase Dialog */}
      {cycle && (
        <PromotePhaseDialog
          open={promotePhaseOpen}
          onOpenChange={setPromotePhaseOpen}
          cycleId={cycle.id}
          currentPhase={cycle.floraStartDate ? "FLORA" : "VEGA"}
          currentTentName={tent.name}
        />
      )}

      {/* Harvest Queue Dialog */}
      {cycle && (
        <MoveToHarvestQueueDialog
          open={harvestQueueOpen}
          onOpenChange={setHarvestQueueOpen}
          cycleId={cycle.id}
          tentName={tent.name}
        />
      )}
    </Card>

    {/* ── Tarefas — botão toggle + painel deslizante ── */}
    {cycle && (
      <div className="mx-1 mt-2">
        {/* Botão toggle — sempre visível, fino */}
        <button
          onClick={e => { e.stopPropagation(); setTasksOpen(!tasksOpen); }}
          className="w-full flex items-center justify-between px-5 py-3 rounded-b-xl bg-muted/20 border border-t-0 border-border/30 hover:bg-muted/40 transition-all duration-200"
        >
          <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Tarefas
            <span className="text-xs opacity-60 font-normal">
              {(morningDone ? 1 : 0) + (afternoonDone ? 1 : 0)}/2 hoje · {completedTasks}/{totalTasks} semana
            </span>
          </span>
          <span className={`text-muted-foreground transition-transform duration-300 ${tasksOpen ? "rotate-180" : ""}`}>
            <ArrowRight className="w-4 h-4 rotate-90" />
          </span>
        </button>

        {/* Painel expansível */}
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${tasksOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}>
          <div className="rounded-b-xl bg-muted/30 border border-t-0 border-border/40 divide-y divide-border/40">

            {/* Tarefas Diárias */}
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2 flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Diárias
              </p>
              <div className="space-y-1.5">
                {[
                  { label: "Registro Manhã", done: morningDone },
                  { label: "Registro Tarde", done: afternoonDone },
                ].map(({ label, done }) => (
                  <Link key={label} href={`/quick-log?tentId=${tent.id}`}>
                    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all duration-200 ${
                      done
                        ? "border-primary/30 bg-primary/5"
                        : "border-border/30 hover:border-primary/20 hover:bg-muted/30"
                    }`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
                        done
                          ? "border-primary bg-primary"
                          : "border-muted-foreground/30"
                      }`}
                        style={done ? { boxShadow: "0 0 8px rgba(74,222,128,0.5)" } : {}}
                      >
                        {done && <Check className="w-3 h-3 text-black" strokeWidth={3} />}
                      </div>
                      <span className={`text-[13px] font-semibold flex-1 transition-colors ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {label}
                      </span>
                      {!done && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />}
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Tarefas da Semana */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3" /> Semana
                </p>
                <div className="flex items-center gap-2">
                  {tasks && tasks.length > 0 && (
                    <button onClick={(e) => { e.stopPropagation(); setHideCompleted(!hideCompleted); }} className="text-muted-foreground hover:text-foreground transition-colors">
                      {hideCompleted ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  <Badge variant="outline" className="text-xs h-5">{completedTasks}/{totalTasks}</Badge>
                </div>
              </div>
              {tasksLoading ? (
                <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              ) : tasks && tasks.length > 0 ? (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {tasks.filter(t => hideCompleted ? !t.isDone : true).map((task) => (
                    <div
                      key={task.id}
                      onClick={(e) => { e.stopPropagation(); handleToggleTask(task.id, task.isDone); }}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 group ${
                        task.isDone ? "opacity-60" : "hover:bg-muted/30"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
                        task.isDone
                          ? "border-primary bg-primary"
                          : "border-muted-foreground/30 group-hover:border-primary/50"
                      }`}
                        style={task.isDone ? { boxShadow: "0 0 8px rgba(74,222,128,0.4)" } : {}}
                      >
                        {task.isDone && <Check className="w-3 h-3 text-black" strokeWidth={3} />}
                      </div>
                      <span className={`text-xs flex-1 ${task.isDone ? "line-through text-muted-foreground" : "text-foreground/90"}`}>
                        {task.title}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">Nenhuma tarefa esta semana</p>
              )}
            </div>

          </div>
        </div>
      </div>
    )}

      </div>
    </ListItemAnimation>
  );
}
