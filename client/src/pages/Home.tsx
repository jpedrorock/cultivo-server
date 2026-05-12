import { trpc } from "@/lib/trpc";
import { useState, useEffect, useRef } from "react";
import { useSidebar } from "@/contexts/SidebarContext";
import { cn } from "@/lib/utils";
import { useHomeModals } from "@/hooks/useHomeModals";
import StartCycleModal from "@/components/StartCycleModal";
import { InitiateCycleModal } from "@/components/InitiateCycleModal";
import { EditCycleModal } from "@/components/EditCycleModal";
import { CreateTentModal } from "@/components/CreateTentModal";
import { EditTentDialog } from "@/components/EditTentDialog";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Sprout,
  Wind,
  CheckCircle,
  Bell,
  Wrench,
  Flower2,
  Zap,
  ArrowRight,
  PauseCircle,
  Menu,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { startMissingReadingsMonitor, getNotificationPermission } from "@/lib/notifications";
import PullToRefresh from "react-simple-pull-to-refresh";
import { countPendingLogs, syncPendingLogs, onConnectionRestored } from "@/lib/offlineStorage";
import { PageTransition, StaggerList } from "@/components/PageTransition";
import { ErrorState } from "@/components/ErrorState";
import { TentCardSkeleton } from "@/components/TentCardSkeleton";
import { EmptyOnboarding } from "@/components/EmptyOnboarding";
import { TodayMissionWidget } from "@/components/TodayMissionWidget";
import { HomeLoadingState } from "@/components/HomeLoadingState";
import { DeleteTentDialog } from "@/components/DeleteTentDialog";
import { TentCard } from "@/components/TentCard";


export default function Home() {
  const [, setLocation] = useLocation();
  const { collapsed, openSidebar } = useSidebar();
  const headerCls = cn(
    "bg-card border-b border-border fixed top-0 left-0 right-0 z-20 pt-safe transition-[left] duration-200 ease-in-out",
    // iPad (md < lg): sem deslocamento — sidebar é overlay
    // Desktop (lg+): desloca conforme estado collapsed
    collapsed ? "lg:left-16" : "lg:left-64",
  );
  const [pendingLogsCount, setPendingLogsCount] = useState(0);

  // utils DEVE ser declarado antes de qualquer mutation que o usa em callbacks
  const utils = trpc.useUtils();

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

  // Global unread alert count (all tents) — for the top banner
  const { data: globalAlertCount } = trpc.alerts.getNewCount.useQuery(
    {},
    { staleTime: 2 * 60 * 1000 }
  );
  const totalNewAlerts = globalAlertCount != null ? Number(globalAlertCount) : 0;
  const toggleSystemPaused = trpc.alerts.toggleSystemPaused.useMutation({
    onSuccess: (data) => {
      refetchNotifSettings();
      toast.success(data.systemPaused ? "Sistema pausado — alertas desativados" : "Sistema ativo — alertas retomados");
    },
    onError: () => toast.error("Erro ao alterar estado do sistema"),
  });

  // Offline sync — contar pendentes e sincronizar ao reconectar
  const createLogMutation = trpc.dailyLogs.create.useMutation();
  // Ref para evitar closure stale sobre mutateAsync
  const createLogMutateRef = useRef(createLogMutation.mutateAsync);
  useEffect(() => { createLogMutateRef.current = createLogMutation.mutateAsync; });

  // Expor mutate para o SW via postMessage (sw.js não tem cookies, delega para cá)
  useEffect(() => {
    (window as any).__cultivo_sync__ = {
      createLogMutate: (log: any) => createLogMutateRef.current(log),
    };
    return () => { delete (window as any).__cultivo_sync__; };
  }, []);

  useEffect(() => {
    // Contar ao montar
    countPendingLogs().then(setPendingLogsCount);

    // Quando voltar a internet → sincronizar automaticamente
    const unsubscribe = onConnectionRestored(async () => {
      const count = await countPendingLogs();
      if (count === 0) return;
      toast("🔄 Conexão restaurada — sincronizando registros...", { duration: 3000 });
      const synced = await syncPendingLogs(async (log) => {
        await createLogMutateRef.current({
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
    } catch {
      // silent — monitor not critical
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

  const confirmDeleteTent = () => {
    if (tentToDelete) {
      const tent = tentToDelete;
      setDeleteDialogOpen(false);
      setTentToDelete(null);


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
      action: () => { setCreateTentModalOpen(true); },
    },
    {
      key: 'h',
      ctrl: true,
      description: 'Ir para Histórico',
      action: () => { setLocation('/history'); },
    },
    {
      key: 'c',
      ctrl: true,
      description: 'Ir para Calculadoras',
      action: () => { setLocation('/calculators'); },
    },
  ]);

  if (isLoading) {
    return <HomeLoadingState headerCls={headerCls} />;
  }

  if (isError) {
    return <ErrorState fullPage onRetry={refetch} />;
  }

  const getTentCycle = (tentId: number) => {
    return activeCycles?.find((c: any) => c.tentId === tentId);
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
      <div className="min-h-screen bg-background">
        {/* Header — fixed para funcionar independente do PullToRefresh */}
        <header className={headerCls}>
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {/* Hamburguer — só no iPad (md < lg) */}
              <button
                className="sidebar-hamburger items-center justify-center w-9 h-9 rounded-xl hover:bg-primary/10 text-foreground/70 hover:text-primary transition-colors"
                onClick={openSidebar}
                aria-label="Abrir menu"
              >
                <Menu className="w-5 h-5" />
              </button>
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

      {/* Spacer = header height (py-4 = 32px + h-9 = 36px = 68px) + safe area */}
      <div aria-hidden="true" className="pt-safe" style={{ paddingBottom: '68px' }} />

      <PullToRefresh onRefresh={handleRefresh}>
        <div>
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

      {/* Banner de alertas novos */}
      {totalNewAlerts > 0 && !systemPaused && (
        <div className="container pt-4">
          <Link href="/alerts">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/15 transition-colors cursor-pointer">
              <Bell className="w-4 h-4 flex-shrink-0 animate-pulse" />
              <span className="text-sm font-medium flex-1">
                {totalNewAlerts === 1
                  ? "1 alerta novo — toque para ver"
                  : `${totalNewAlerts} alertas novos — toque para ver`}
              </span>
              <ArrowRight className="w-4 h-4 flex-shrink-0 opacity-60" />
            </div>
          </Link>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto max-w-7xl py-4">

        {/* Widget "Missão de hoje" — só renderiza se houver estufas */}
        {!isLoading && tents && tents.length > 0 && (
          <TodayMissionWidget
            tents={tents}
            totalNewAlerts={totalNewAlerts}
            hasActiveCycle={(tentId) => Boolean(getTentCycle(tentId))}
          />
        )}

        {/* Tents Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <TentCardSkeleton key={`skeleton-tent-${i}`} />
            ))}
          </div>
        ) : tents && tents.length === 0 ? (
          <EmptyOnboarding onCreateTent={() => setCreateTentModalOpen(true)} />
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
      <DeleteTentDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeletePreviewTentId(null);
        }}
        tentToDelete={tentToDelete}
        tents={tents}
        deletePreview={deletePreview}
        deletePreviewLoading={deletePreviewLoading}
        isDeleting={deleteTent.isPending}
        isMovingPlants={moveAllPlants.isPending}
        onConfirmDelete={confirmDeleteTent}
        onMoveAllPlants={(toTentId) => {
          if (!tentToDelete) return;
          moveAllPlants.mutate({
            fromTentId: tentToDelete.id,
            toTentId,
            reason: "Movimentação antes de excluir estufa",
          });
        }}
      />

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
      </div>
    </PageTransition>
  );
}

