import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { useHomeModals } from "@/hooks/useHomeModals";
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
import { Loader2, Sprout, Droplets, Sun, ThermometerSun, Wind, BookOpen, CheckCircle2, CheckCircle, Calculator, Bell, Trash2, EyeOff, Eye, Wrench, Scissors, Flower2, Check, AlertTriangle, X, Zap, Clock, ArrowRight, PauseCircle, PlayCircle, MoreVertical, Monitor, ChevronRight, BarChart2, Leaf, RefreshCw } from "lucide-react";
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
  const [pendingLogsCount, setPendingLogsCount] = useState(0);
  const {
    cycleModalOpen, setCycleModalOpen,
    selectedTent, setSelectedTent,
    initiateModalOpen, setInitiateModalOpen,
    editModalOpen, setEditModalOpen,
    selectedCycle, setSelectedCycle,
    createTentModalOpen, setCreateTentModalOpen,
    deleteDialogOpen, setDeleteDialogOpen,
    tentToDelete, setTentToDelete,
    editTentDialogOpen, setEditTentDialogOpen,
    tentToEdit, setTentToEdit,
    showMoveAllPlants, setShowMoveAllPlants,
    targetTentId, setTargetTentId,
    deletePreviewTentId, setDeletePreviewTentId,
    finalizeCycleConfirm, setFinalizeCycleConfirm,
  } = useHomeModals();
  
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
        toast.success(`${synced} registro${synced > 1 ? 's' : ''} sincronizado${synced > 1 ? 's' : ''} com sucesso!`);
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
      toast.success(`${data.movedCount} planta(s) movida(s) com sucesso!`);
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
      utils.cycles.listActive.invalidate();
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
        ) : tents && tents.length === 0 ? (
          /* ── Onboarding Empty State ── */
          <div className="flex flex-col items-center py-10 px-4 max-w-md mx-auto">
            {/* Ícone central */}
            <div className="w-20 h-20 rounded-3xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center mb-6">
              <Sprout className="w-10 h-10 text-primary" />
            </div>

            <h2 className="text-xl font-bold text-foreground mb-1 text-center">Bem-vindo ao Cultivo</h2>
            <p className="text-sm text-muted-foreground text-center mb-8">
              Siga os passos abaixo para começar a monitorar seu cultivo.
            </p>

            {/* Passos */}
            <div className="w-full space-y-3 mb-8">
              {/* Passo 1 */}
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary-foreground">1</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Crie sua primeira estufa</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Defina nome, tamanho e categoria (Vega, Flora, Manutenção…)</p>
                </div>
              </div>

              {/* Passo 2 */}
              <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-muted-foreground/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-muted-foreground">2</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-muted-foreground">Adicione suas plantas</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">Cadastre mudas, clones ou plantas com strain e semana</p>
                </div>
              </div>

              {/* Passo 3 */}
              <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-muted-foreground/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-muted-foreground">3</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-muted-foreground">Registre os parâmetros diários</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">Temperatura, umidade, PPFD, pH, EC e rega — tudo num só lugar</p>
                </div>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={() => setCreateTentModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground font-semibold py-4 text-sm active:scale-[0.98] transition-transform shadow-lg shadow-primary/20"
            >
              <Sprout className="w-5 h-5" />
              Criar primeira estufa
            </button>
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

        {/* Botão nova estufa — abaixo dos cards em todas as telas (só quando já há estufas) */}
        {!isLoading && tents && tents.length > 0 && (
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
  const pts = values.map((v, i) =>
    `${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h * 0.8 - h * 0.1).toFixed(1)}`
  );
  const pathD = pts.reduce((acc, pt, i) => (i === 0 ? `M ${pt}` : `${acc} L ${pt}`), "");
  const uid = `ecg-${color.replace(/[^a-z0-9]/gi, "")}`;
  const dur = "3.5s";

  // Fórmula do rastro: todas as camadas terminam no mesmo ponto de varredura P.
  // Com pathLength="1": stroke-dasharray="L (1-L)" e values="L;-(1-L)"
  // garante que o traço de tamanho L sempre TERMINA em P para qualquer instante t.
  // O efeito: L grande = rastro largo e tênue, L pequeno = ponta fina e brilhante.

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible", opacity: 0.85 }}>
      <defs>
        <filter id={`${uid}-glow`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Traço de fundo — sempre visível, muito apagado (o "papel" do ECG) */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="1"
        strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.10" />

      {/* Rastro longo e tênue — 35% do path, termina no ponto de varredura */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.18"
        strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="0.35 0.65">
        <animate attributeName="stroke-dashoffset" values="0.35;-0.65" dur={dur} repeatCount="indefinite" calcMode="linear" />
      </path>

      {/* Rastro médio — 18% do path, mais brilhante */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.45"
        strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="0.18 0.82">
        <animate attributeName="stroke-dashoffset" values="0.18;-0.82" dur={dur} repeatCount="indefinite" calcMode="linear" />
      </path>

      {/* Rastro curto — 7% do path, quase total */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.80"
        strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="0.07 0.93">
        <animate attributeName="stroke-dashoffset" values="0.07;-0.93" dur={dur} repeatCount="indefinite" calcMode="linear" />
      </path>

      {/* Ponta brilhante — 2% com glow, a frente do scanner */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeOpacity="1"
        strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="0.02 0.98"
        filter={`url(#${uid}-glow)`}>
        <animate attributeName="stroke-dashoffset" values="0.02;-0.98" dur={dur} repeatCount="indefinite" calcMode="linear" />
      </path>

      {/* Ponto de luz na frente da varredura */}
      <circle r="2.2" fill={color} filter={`url(#${uid}-glow)`} opacity="0.95">
        <animateMotion path={pathD} dur={dur} repeatCount="indefinite" calcMode="linear" />
      </circle>
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

  const { data: streak } = trpc.dailyLogs.streak.useQuery(
    { tentId: tent.id },
    { staleTime: 5 * 60 * 1000 }
  );

  // Leitura do sensor SmartLife para badge automático
  const { data: sensorReading, refetch: refetchSensor } = trpc.tuya.getLatestReadingForTent.useQuery(
    { tentId: tent.id },
    { staleTime: 5 * 60 * 1000, retry: false }
  );
  // Badge "A" aparece sempre que o sensor estiver mapeado (hasSensor), independente de ter leitura
  const isSensorAuto = !!(sensorReading?.hasSensor);

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

  const readNow = trpc.tuya.readNow.useMutation({
    onSuccess: (data) => {
      // Atualiza o cache do sensor com os valores retornados direto (sem esperar refetch)
      utils.tuya.getLatestReadingForTent.setData(
        { tentId: tent.id },
        { hasSensor: true, isFresh: true, tempC: data.tempC, rhPct: data.rhPct, readAt: data.readAt }
      );
      utils.dailyLogs.getLatestByTent.invalidate({ tentId: tent.id });
      utils.dailyLogs.list.invalidate({ tentId: tent.id });
      toast.success(`Leitura: ${data.tempC?.toFixed(1)}°C · ${data.rhPct?.toFixed(0)}%`);
    },
    onError: (e) => toast.error(`Sensor: ${e.message}`),
  });

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
      <Card className="relative z-10 py-0 shadow-lg shadow-black/15 transition-all duration-200 ease-out active:scale-[0.99] overflow-hidden" data-tour="tent-card" style={{ backgroundColor: 'hsl(var(--card))' }}>
        {/* Fundo gradiente da fase */}
        {phaseBg !== 'none' && (
          <div className="pointer-events-none absolute inset-0 z-0" style={{ background: phaseBg }} />
        )}
        {/* Linha de acento no topo */}
        <div className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] z-20" style={{ background: `linear-gradient(90deg, ${phaseAccentColor}99 0%, ${phaseAccentColor}33 100%)` }} />
      <CardHeader className="relative z-10 px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Linha 1: nome + freshness badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-xl font-bold tracking-tight">{tent.name}</CardTitle>
              {(() => {
                if (!tent.lastReadingAt) return (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground">
                    <Clock className="w-3 h-3" /> Sem registros
                  </span>
                );
                const diffMs = Date.now() - tent.lastReadingAt;
                const diffH = Math.floor(diffMs / (1000 * 60 * 60));
                const diffMin = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                const timeText = diffH === 0 ? `há ${diffMin}min` : `há ${diffH}h`;
                const pill = diffH < 6
                  ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                  : diffH < 20
                  ? "border-amber-400/40 text-amber-400 bg-amber-500/10"
                  : "border-red-500/40 text-red-400 bg-red-500/10";
                return (
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${pill}`}>
                    <Clock className="w-3 h-3" />{timeText}
                  </span>
                );
              })()}
              {/* Streak badge */}
              {streak && streak.current > 0 && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${streak.todayDone ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' : 'border-emerald-400/30 text-emerald-400/60 bg-emerald-500/5'}`}>
                  <Leaf className="w-2.5 h-2.5" />{streak.current}d
                </span>
              )}
            </div>
            {/* Linha 2: dimensões */}
            <p className="text-xs text-muted-foreground mt-0.5">{tent.width}×{tent.depth}×{tent.height}cm</p>
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

        {/* Plant count chips — abaixo do header */}
        {(tent.plantCount > 0 || tent.seedlingCount > 0) && (
          <Link href={`/plants?tent=${tent.id}`}>
            <div className="flex items-center gap-2 mt-3">
              {tent.plantCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-border/60 bg-muted/40 text-foreground hover:bg-muted/70 transition-colors">
                  <Sprout className="w-3.5 h-3.5 text-primary" />
                  {tent.plantCount} {tent.plantCount === 1 ? 'planta' : 'plantas'}
                </span>
              )}
              {tent.seedlingCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-border/60 bg-muted/40 text-foreground hover:bg-muted/70 transition-colors">
                  <Scissors className="w-3.5 h-3.5 text-cyan-500" />
                  {tent.seedlingCount} {tent.seedlingCount === 1 ? 'muda' : 'mudas'}
                </span>
              )}
            </div>
          </Link>
        )}
      </CardHeader>

      <CardContent className="relative z-10 px-5 pb-5 pt-0">
        <div className="space-y-3">
          {/* Cycle Info — compacto, sem barra de progresso */}
          {cycle ? (
            <div
              onClick={() => navigate(`/tent/${tent.id}`)}
              className={`rounded-xl p-3.5 border cursor-pointer active:scale-[0.99] transition-all duration-150 ${
                tent.category === 'VEGA'        ? 'border-green-500/20'
                : tent.category === 'FLORA'     ? 'border-purple-500/20'
                : tent.category === 'DRYING'    ? 'border-amber-500/20'
                : 'border-blue-500/20'
              }`}
              style={{
                background:
                  tent.category === 'VEGA'
                    ? 'linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(34,197,94,0.04) 100%)'
                    : tent.category === 'FLORA'
                    ? 'linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(168,85,247,0.04) 100%)'
                    : tent.category === 'DRYING'
                    ? 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.04) 100%)'
                    : 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0.04) 100%)',
              }}
            >
              {/* Linha 1: fase | semana / clonagem */}
              <div className="flex justify-between items-center">
                <span className={`text-sm font-semibold flex items-center gap-1.5 ${
                  tent.category === 'VEGA'    ? 'text-green-400'
                  : tent.category === 'FLORA' ? 'text-purple-400'
                  : tent.category === 'DRYING'? 'text-amber-400'
                  : 'text-blue-400'
                }`}>
                  <PhaseIcon className="w-3.5 h-3.5" />
                  {tent.category === 'MAINTENANCE' ? 'Manutenção Perpétua' : 'Ciclo Ativo'}
                </span>
                <span className={`text-sm font-bold ${
                  tent.category === 'VEGA'    ? 'text-green-400'
                  : tent.category === 'FLORA' ? 'text-purple-400'
                  : tent.category === 'DRYING'? 'text-amber-400'
                  : 'text-blue-400'
                }`}>
                  {tent.category === 'MAINTENANCE'
                    ? (tent.lastCloningAt
                        ? (() => { const d = Math.floor((Date.now() - tent.lastCloningAt) / 86400000); return d === 0 ? 'Hoje' : d === 1 ? 'Ontem' : `Há ${d}d`; })()
                        : 'Sem clonagem')
                    : `Semana ${(() => {
                        const now = new Date(); const start = new Date(cycle.startDate);
                        if (isNaN(start.getTime())) return '?';
                        const fs = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;
                        if (fs && !isNaN(fs.getTime()) && now >= fs) return Math.max(1, Math.floor((now.getTime() - fs.getTime()) / 604800000) + 1);
                        return Math.max(1, Math.floor((now.getTime() - start.getTime()) / 604800000) + 1);
                      })()}`
                  }
                </span>
              </div>
              {/* Linha 2: label | data */}
              <div className="flex justify-between items-center mt-1.5">
                <span className="text-xs text-muted-foreground">
                  {tent.category === 'MAINTENANCE' ? 'Última Clonagem' : 'Iniciado em'}
                </span>
                <span className="text-xs font-medium text-foreground/70">
                  {tent.category === 'MAINTENANCE'
                    ? (tent.lastCloningAt ? new Date(tent.lastCloningAt).toLocaleDateString('pt-BR') : '—')
                    : new Date(cycle.startDate).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 bg-muted/20 p-3.5 text-center">
              <p className="text-sm text-muted-foreground">Nenhum ciclo ativo</p>
            </div>
          )}

          {/* KPI Metrics — 3 colunas: Temp · RH · PPFD */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/40">
            {/* Temperature */}
            <button
              type="button"
              disabled={!isSensorAuto || readNow.isPending}
              className={`flex flex-col items-center gap-1 py-3 px-1 rounded-xl border border-orange-500/20 bg-orange-500/[0.08] relative w-full ${isSensorAuto ? 'active:scale-95 transition-transform' : ''}`}
              onClick={isSensorAuto ? () => readNow.mutate({ tentId: tent.id }) : undefined}
            >
              <ThermometerSun className="w-3.5 h-3.5 text-orange-400" />
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Temp</p>
              <p className="text-xl font-bold tracking-tight leading-none text-foreground">
                {readNow.isPending
                  ? <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  : (() => {
                      const val = sensorReading?.isFresh && sensorReading.tempC != null
                        ? sensorReading.tempC
                        : latestLog?.tempC ? parseFloat(latestLog.tempC) : null;
                      return val != null
                        ? <AnimatedCounter value={val} decimals={1} suffix="°" />
                        : <span className="text-muted-foreground/40">--</span>;
                    })()
                }
              </p>
              <MiniSparkline values={sparkTemps} color="#f97316" />
              {isSensorAuto && (
                <span className="absolute top-1.5 right-1.5 text-[8px] font-bold text-cyan-400 bg-cyan-500/15 border border-cyan-500/30 rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">A</span>
              )}
            </button>
            {/* Humidity */}
            <button
              type="button"
              disabled={!isSensorAuto || readNow.isPending}
              className={`flex flex-col items-center gap-1 py-3 px-1 rounded-xl border border-teal-400/20 bg-teal-400/[0.08] relative w-full ${isSensorAuto ? 'active:scale-95 transition-transform' : ''}`}
              onClick={isSensorAuto ? () => readNow.mutate({ tentId: tent.id }) : undefined}
            >
              <Droplets className="w-3.5 h-3.5 text-teal-400" />
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">RH</p>
              <p className="text-xl font-bold tracking-tight leading-none text-foreground">
                {readNow.isPending
                  ? <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  : (() => {
                      const val = sensorReading?.isFresh && sensorReading.rhPct != null
                        ? sensorReading.rhPct
                        : latestLog?.rhPct ? parseFloat(latestLog.rhPct) : null;
                      return val != null
                        ? <AnimatedCounter value={val} decimals={0} suffix="%" />
                        : <span className="text-muted-foreground/40">--</span>;
                    })()
                }
              </p>
              <MiniSparkline values={sparkRh} color="#2dd4bf" />
              {isSensorAuto && (
                <span className="absolute top-1.5 right-1.5 text-[8px] font-bold text-cyan-400 bg-cyan-500/15 border border-cyan-500/30 rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">A</span>
              )}
            </button>
            {/* PPFD */}
            <div className="flex flex-col items-center gap-1 py-3 px-1 rounded-xl border border-yellow-500/20 bg-yellow-500/[0.08]">
              <Sun className="w-3.5 h-3.5 text-yellow-400" />
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">PPFD</p>
              <p className="text-xl font-bold tracking-tight leading-none text-foreground">
                {latestLog?.ppfd ? <AnimatedCounter value={latestLog.ppfd} /> : <span className="text-muted-foreground/40">--</span>}
              </p>
              {/* Linha de lâmpada — pulsa como luz aumentando e diminuindo */}
              <div className="h-[18px] flex items-center w-full px-1">
                <div className="ppfd-lamp-line w-full h-[2px] rounded-full" />
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
