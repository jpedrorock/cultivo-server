import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { WeatherWidget } from "@/components/WeatherWidget";
import { AlertsWidget } from "@/components/AlertsWidget";
import { CyclesDashboard } from "@/components/CyclesDashboard";
import { TentChartWidget } from "@/components/TentChartWidget";
import StartCycleModal from "@/components/StartCycleModal";
import { InitiateCycleModal } from "@/components/InitiateCycleModal";
import { EditCycleModal } from "@/components/EditCycleModal";
import { CreateTentModal } from "@/components/CreateTentModal";
import { EditTentDialog } from "@/components/EditTentDialog";

import { SelectMotherPlantDialog } from "@/components/SelectMotherPlantDialog";
import { FinishCloningDialog } from "@/components/FinishCloningDialog";
import { PromotePhaseDialog } from "@/components/PromotePhaseDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedButton } from "@/components/AnimatedButton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Loader2, Sprout, Droplets, Sun, ThermometerSun, Wind, BookOpen, CheckCircle2, Calculator, Bell, Trash2, EyeOff, Eye, Wrench, Scissors, Flower2, Check, AlertTriangle, X, Zap, Clock, ArrowRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { startMissingReadingsMonitor, getNotificationPermission } from "@/lib/notifications";
import PullToRefresh from "react-simple-pull-to-refresh";
import { PageTransition, StaggerList, ListItemAnimation, CardAnimation } from "@/components/PageTransition";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { TentCardSkeleton } from "@/components/TentCardSkeleton";


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
  
  const { data: deletePreview, isLoading: deletePreviewLoading } = trpc.tents.getDeletePreview.useQuery(
    { id: deletePreviewTentId! },
    { enabled: deletePreviewTentId !== null }
  );

  
  const { data: tents, isLoading } = trpc.tents.list.useQuery();
  const { data: activeCycles } = trpc.cycles.listActive.useQuery();

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
    if (confirm(`Tem certeza que deseja finalizar o ciclo da ${tentName}?`)) {
      finalizeCycle.mutate({ cycleId });
    }
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const getTentCycle = (tentId: number) => {
    return activeCycles?.find((c) => c.tentId === tentId);
  };

  const getPhaseInfo = (category: string, cycle: any) => {
    if (!cycle) {
      return { phase: "Inativo", color: "bg-muted0", icon: Wind };
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
        <header className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="container py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <Sprout className="w-8 h-8 text-primary" />
                App Cultivo
              </h1>
              <p className="text-muted-foreground mt-1">Gerenciamento de Estufas</p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/quick-log" className="!hidden md:!inline-block">
                <Button size="lg" className="gap-2">
                  <Zap className="w-5 h-5" />
                  Registro Rápido
                </Button>
              </Link>
              <Badge variant="outline" className="px-3 py-1.5 text-sm">
                <Droplets className="w-4 h-4 mr-2" />
                Sistema Ativo
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8">
        {/* Tents Grid */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">Estufas</h2>
          <AnimatedButton onClick={() => setCreateTentModalOpen(true)} className="gap-2">
            <Sprout className="w-4 h-4" />
            Criar Nova Estufa
          </AnimatedButton>
        </div>

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

        {/* Weather Widget */}
        <div className="mt-8">
          <WeatherWidget />
        </div>

        {/* Alerts Widget */}
        <div className="mt-8">
          <AlertsWidget />
        </div>

        {/* Cycles Dashboard */}
        <div className="mt-8">
          <CyclesDashboard />
        </div>

        {/* Weekly Summary Section */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold text-foreground mb-6">Resumo Semanal</h2>
          <div className="space-y-6">
            {tents?.filter(tent => getTentCycle(tent.id)).map((tent) => {
              const cycle = getTentCycle(tent.id);
              return (
                <div key={tent.id}>
                  <TentChartWidgetWrapper tentId={tent.id} tentName={tent.name} />
                </div>
              );
            })}
          </div>
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
                  <p className="text-sm font-medium text-destructive mb-2">⚠️ Não é possível excluir:
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
                    {deletePreview.totalRecords > 100 && " ⚠️ Grande quantidade de dados!"}
                  </p>
                </div>
              )}
              
              {deletePreview.totalRecords === 0 && deletePreview.canDelete && (
                <div className="p-3 bg-muted/30 rounded-md">
                  <p className="text-sm text-muted-foreground">✅ Estufa vazia, sem dados relacionados.</p>
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
                🚚 Mover Todas as Plantas Primeiro
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
        </div>
      </PullToRefresh>
    </PageTransition>
  );
}

// Wrapper component to fetch weekly data
function TentChartWidgetWrapper({ tentId, tentName }: { tentId: number; tentName: string }) {
  const { data: weeklyData = [], isLoading } = trpc.dailyLogs.getWeeklyData.useQuery({ tentId });
  
  if (isLoading) return null;
  
  return <TentChartWidget tentId={tentId.toString()} tentName={tentName} data={weeklyData} />;
}

// Separate component for Tent Card with Tasks
function TentCard({ tent, cycle, phaseInfo, PhaseIcon, onStartCycle, onStartFlora, onInitiateCycle, onEditCycle, onFinalizeCycle, onEditTent, onDeleteTent }: any) {
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());

  const [selectMotherOpen, setSelectMotherOpen] = useState(false);
  const [selectedMotherId, setSelectedMotherId] = useState<number | null>(null);
  const [selectedMotherName, setSelectedMotherName] = useState<string>("");
  const [selectedClonesCount, setSelectedClonesCount] = useState<number>(10);
  const [finishCloningOpen, setFinishCloningOpen] = useState(false);
  const [promotePhaseOpen, setPromotePhaseOpen] = useState(false);
  
  const { data: tasks, isLoading: tasksLoading } = trpc.tasks.getTasksByTent.useQuery(
    { tentId: tent.id },
    { enabled: !!cycle } // Only fetch if there's an active cycle
  );
  
  const { data: latestLog } = trpc.dailyLogs.getLatestByTent.useQuery(
    { tentId: tent.id }
  );
  
  // Buscar targets ideais - usa média das strains das plantas na estufa
  const currentWeek = cycle ? (() => {
    const now = new Date();
    const start = new Date(cycle.startDate);
    const floraStart = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;
    
    if (floraStart && now >= floraStart) {
      return Math.floor((now.getTime() - floraStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    }
    return Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  })() : null;
  
  const currentPhase = cycle ? (cycle.floraStartDate ? "FLORA" : "VEGA") : null;
  
  const { data: targets } = trpc.weeklyTargets.getTargetsByTent.useQuery(
    { tentId: tent.id, phase: currentPhase! as any, weekNumber: currentWeek! },
    { enabled: !!cycle && !!currentPhase && !!currentWeek }
  );
  
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

  return (
    <ListItemAnimation>
      <Card className="bg-card/90 backdrop-blur-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl flex items-center gap-2 flex-wrap">
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
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <div className="space-y-5">
          {/* Cycle Info */}
          {cycle ? (
            <div 
              className="bg-primary/10 rounded-lg p-4 space-y-2"
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-foreground">Ciclo Ativo</span>
                <span className="text-sm font-semibold text-primary">
                  Semana {(() => {
                    const now = new Date();
                    const start = new Date(cycle.startDate);
                    const floraStart = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;
                    
                    if (floraStart && now >= floraStart) {
                      return Math.floor((now.getTime() - floraStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
                    }
                    return Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
                  })()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Semana Atual</span>
                <span className="text-xs font-medium text-foreground">
                  {(() => {
                    const now = new Date();
                    const start = new Date(cycle.startDate);
                    const floraStart = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;
                    
                    // Calcular a data de início da semana atual
                    let weekStart;
                    if (floraStart && now >= floraStart) {
                      const weeksSinceFlora = Math.floor((now.getTime() - floraStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
                      weekStart = new Date(floraStart.getTime() + (weeksSinceFlora * 7 * 24 * 60 * 60 * 1000));
                    } else {
                      const weeksSinceStart = Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
                      weekStart = new Date(start.getTime() + (weeksSinceStart * 7 * 24 * 60 * 60 * 1000));
                    }
                    
                    return weekStart.toLocaleDateString("pt-BR");
                  })()}
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-muted rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground">Nenhum ciclo ativo</p>
            </div>
          )}

          {/* Weekly Tasks */}
          {cycle && (
            <div className="space-y-2">
              <div className="w-full flex items-center justify-between hover:bg-muted/50 rounded p-2 transition-colors">
                <button
                  onClick={() => setTasksExpanded(!tasksExpanded)}
                  className="flex-1 flex items-center gap-2 text-left"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <h4 className="text-sm font-semibold text-foreground">
                    Tarefas da Semana
                  </h4>
                </button>
                <div className="flex items-center gap-3">
                  {tasks && tasks.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHideCompleted(!hideCompleted);
                      }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title={hideCompleted ? "Mostrar concluídas" : "Ocultar concluídas"}
                    >
                      {hideCompleted ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  )}
                  {totalTasks > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {completedTasks}/{totalTasks}
                    </Badge>
                  )}
                  <button
                    onClick={() => setTasksExpanded(!tasksExpanded)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {tasksExpanded ? "▲" : "▼"}
                  </button>
                </div>
              </div>

              {tasksExpanded && (
                tasksLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  </div>
                ) : tasks && tasks.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {tasks.filter((task) => hideCompleted ? !task.isDone : true).map((task) => (
                      <div
                        key={task.id}
                        className="flex items-start gap-2 p-2 rounded hover:bg-muted"
                      >
                        <Checkbox
                          id={`task-${task.id}`}
                          checked={task.isDone}
                          onCheckedChange={() => handleToggleTask(task.id, task.isDone)}
                          className="mt-0.5"
                        />
                        <label
                          htmlFor={`task-${task.id}`}
                          className={`text-sm cursor-pointer flex-1 ${
                            task.isDone ? "line-through text-muted-foreground" : "text-foreground"
                          }`}
                        >
                          {task.title}
                        </label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Nenhuma tarefa para esta semana
                  </p>
                )
              )}
            </div>
          )}

          {/* Latest Readings */}
          {targets?._isAverage && (
            <div className="pt-3 pb-1">
              <p className="text-xs text-center text-muted-foreground bg-accent/30 rounded px-2 py-1">
                📊 Parâmetros médios ({targets._strainCount} strains)
              </p>
            </div>
          )}
          <div className="grid grid-cols-4 gap-3 pt-5 border-t">
            <div className="text-center">
              <ThermometerSun className="w-5 h-5 mx-auto text-orange-500 mb-1" />
              <p className="text-xs text-muted-foreground">Temp</p>
              <div className="flex items-center justify-center gap-1">
                <p className={`text-sm font-semibold ${
                  latestLog?.tempC 
                    ? getValueColor(parseFloat(latestLog.tempC), targets?.tempMin, targets?.tempMax)
                    : "text-foreground"
                }`}>
                  {latestLog?.tempC ? `${latestLog.tempC}°C` : "--°C"}
                </p>
                {latestLog?.tempC && getStatusIcon(parseFloat(latestLog.tempC), targets?.tempMin, targets?.tempMax)}
              </div>
            </div>
            <div className="text-center">
              <Droplets className="w-5 h-5 mx-auto text-blue-500 mb-1" />
              <p className="text-xs text-muted-foreground">RH</p>
              <div className="flex items-center justify-center gap-1">
                <p className={`text-sm font-semibold ${
                  latestLog?.rhPct 
                    ? getValueColor(parseFloat(latestLog.rhPct), targets?.rhMin, targets?.rhMax)
                    : "text-foreground"
                }`}>
                  {latestLog?.rhPct ? `${latestLog.rhPct}%` : "--%"}
                </p>
                {latestLog?.rhPct && getStatusIcon(parseFloat(latestLog.rhPct), targets?.rhMin, targets?.rhMax)}
              </div>
            </div>
            <div className="text-center">
              <Sun className="w-5 h-5 mx-auto text-yellow-500 dark:text-yellow-400 mb-1" />
              <p className="text-xs text-muted-foreground">PPFD</p>
              <div className="flex items-center justify-center gap-1">
                <p className={`text-sm font-semibold ${
                  latestLog?.ppfd 
                    ? getValueColor(latestLog.ppfd, targets?.ppfdMin, targets?.ppfdMax)
                    : "text-foreground"
                }`}>
                  {latestLog?.ppfd || "--"}
                </p>
                {latestLog?.ppfd && getStatusIcon(latestLog.ppfd, targets?.ppfdMin, targets?.ppfdMax)}
              </div>
            </div>
            <div className="text-center">
              <Clock className="w-5 h-5 mx-auto text-purple-500 mb-1" />
              <p className="text-xs text-muted-foreground">Foto</p>
              <p className="text-sm font-semibold text-foreground">
                {cycle?.floraStartDate ? "12/12" : "18/6"}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-5">
            <div key={`actions-primary-${tent.id}`} className="flex gap-2">
              {!cycle ? (
                <Button
                  onClick={() => onInitiateCycle(tent.id, tent.name)}
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Novo Ciclo
                </Button>
              ) : (
                <Link 
                  href={`/quick-log?tentId=${tent.id}`}
                  className="flex-1 inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                >
                  Registrar
                </Link>
              )}
              <Link 
                href={`/tent/${tent.id}`}
                className="flex-1 inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
              >
                Ver Detalhes
              </Link>
            </div>
            {cycle && (
              <>
                <div key={`actions-secondary-${tent.id}`} className="flex gap-2">
                  <Button
                    onClick={() => onEditCycle(cycle, tent)}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    Editar Ciclo
                  </Button>
                </div>
                
                {/* Botões de ação baseados na fase */}
                
                {/* Botão "Tirar Clones" para MANUTENÇÃO */}
                {cycle && tent.category === "MAINTENANCE" && (
                  <Button
                    onClick={() => setSelectMotherOpen(true)}
                    variant="default"
                    size="sm"
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <Sprout className="w-4 h-4 mr-2" />
                    Tirar Clones
                  </Button>
                )}
                
                {/* Botão "Avançar Fase" - apenas para fases lineares */}
                {cycle && tent.category !== "MAINTENANCE" && (
                  <Button
                    onClick={() => {
                      // CLONING → FinishCloningDialog
                      if (cycle.cloningStartDate) {
                        setFinishCloningOpen(true);
                      }
                      // VEGA → PromotePhaseDialog (Flora)
                      else if (!cycle.floraStartDate && tent.category === "VEGA") {
                        setPromotePhaseOpen(true);
                      }
                      // FLORA → PromotePhaseDialog (Secagem)
                      else if (cycle.floraStartDate) {
                        setPromotePhaseOpen(true);
                      }
                    }}
                    variant="default"
                    size="sm"
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Avançar Fase
                  </Button>
                )}
                <Button
                  onClick={() => onFinalizeCycle(cycle.id, tent.name)}
                  variant="ghost"
                  size="sm"
                  className="w-full text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300"
                >
                  Finalizar Ciclo
                </Button>
              </>
            )}
            {!cycle && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => onEditTent(tent)}
                  variant="outline"
                  size="sm"
                  className="border-gray-500 text-gray-600 hover:bg-gray-50 dark:border-gray-400 dark:text-gray-300 dark:hover:bg-gray-800 flex items-center justify-center gap-2"
                >
                  <Wrench className="w-4 h-4" />
                  Editar
                </Button>
                <Button
                  onClick={() => onDeleteTent(tent.id, tent.name)}
                  variant="outline"
                  size="sm"
                  className="border-red-500 text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-950 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
      

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
    </Card>
    </ListItemAnimation>
  );
}
