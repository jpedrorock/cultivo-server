import { useState, lazy, Suspense } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Sprout,
  FileText,
  Heart,
  Sparkles,
  Scissors,
  Edit,
  MoveRight,
  MoreVertical,
  Flower2,
  CheckCircle,
  Loader2,
  Trash2,
  XCircle,
  History,
  GitFork,
  Thermometer,
  QrCode,
  Download,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import MoveTentModal from "@/components/MoveTentModal";
import { toast } from "sonner";
import { PageTransition } from "@/components/PageTransition";
import { useTactileFeedback } from "@/hooks/useTactileFeedback";
import { PressDropdownMenuItem } from "@/components/PressDropdownMenuItem";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import ErrorBoundary from "@/components/ErrorBoundary";
import PlantEditModal from "@/components/PlantEditModal";
import PlantHarvestModal from "@/components/PlantHarvestModal";
import PlantDiscardModal from "@/components/PlantDiscardModal";
import PlantTransplantDialog from "@/components/PlantTransplantDialog";
import PlantCloneDialog from "@/components/PlantCloneDialog";
import PlantQrDialog from "@/components/PlantQrDialog";
import PlantStatsStrip from "@/components/PlantStatsStrip";
import { exportPlantPDF } from "@/utils/plantExportPDF";
import { phaseColor, phaseColorAlpha, PHASE_LABELS, type Phase } from "@/lib/phaseColors";

// Tabs carregadas sob demanda para reduzir bundle inicial de PlantDetail
const PlantHealthTab       = lazy(() => import("@/components/PlantHealthTab"));
const PlantEnvironmentTab  = lazy(() => import("@/components/PlantEnvironmentTab"));
const PlantObservationsTab = lazy(() => import("@/components/PlantObservationsTab"));
const PlantArchiveTab      = lazy(() => import("@/components/PlantArchiveTab"));
const PlantTrichomesTab    = lazy(() => import("@/components/PlantTrichomesTab"));
const PlantTrainingSummary = lazy(() => import("@/components/PlantTrainingSummary"));

// Skeleton mínimo exibido enquanto os componentes de tab carregam
function TabSkeleton() {
  return (
    <div className="space-y-3 pt-2 animate-pulse">
      <div className="h-24 rounded-xl bg-muted/60" />
      <div className="h-20 rounded-xl bg-muted/40" />
      <div className="h-20 rounded-xl bg-muted/40" />
    </div>
  );
}

export default function PlantDetail() {
  const [, params] = useRoute("/plants/:id");
  const [, setLocation] = useLocation();
  const plantId = params?.id ? parseInt(params.id) : 0;

  // Modal open state — form/data state lives inside each modal component
  const [moveTentModalOpen, setMoveTentModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [transplantConfirmOpen, setTransplantConfirmOpen] = useState(false);
  const [harvestModalOpen, setHarvestModalOpen] = useState(false);
  const [discardModalOpen, setDiscardModalOpen] = useState(false);
  const [cloneDialog, setCloneDialog] = useState(false);
  const [qrDialog, setQrDialog] = useState(false);
  const haptic = useTactileFeedback();

  const { data: plant, isLoading, isError, refetch } = trpc.plants.getById.useQuery(
    { id: plantId },
    { enabled: plantId > 0 }
  );
  const { data: strain } = trpc.strains.getById.useQuery(
    { id: plant?.strainId || 0 },
    { enabled: !!plant?.strainId }
  );
  const { data: tent } = trpc.tents.getById.useQuery(
    { id: plant?.currentTentId || 0 },
    { enabled: !!plant?.currentTentId }
  );
  const { data: healthLogs } = trpc.plantHealth.list.useQuery(
    { plantId },
    { enabled: plantId > 0 }
  );
  const lastPhoto = healthLogs?.find((l: any) => l.photoUrl)?.photoUrl ?? null;

  // Mutations
  const transplantMutation = trpc.plants.transplantToFlora.useMutation({
    onSuccess: (data) => {
      toast.success(`Planta transplantada para ${data.tentName} com sucesso!`);
      refetch();
    },
    onError: (e) => toast.error(`Erro ao transplantar: ${e.message}`),
  });

  const archiveMutation = trpc.plants.archive.useMutation({
    onSuccess: (_, variables) => {
      const message = variables.status === 'HARVESTED'
        ? 'Planta marcada como colhida e arquivada!'
        : 'Planta descartada e arquivada!';
      toast.success(message);
      setLocation('/plants');
    },
    onError: (e) => toast.error(`Erro ao arquivar planta: ${e.message}`),
  });

  const deleteMutation = trpc.plants.deletePermanently.useMutation({
    onSuccess: () => {
      toast.success('Planta excluída permanentemente!');
      setLocation('/plants');
    },
    onError: (e) => toast.error(`Erro ao excluir planta: ${e.message}`),
  });

  const promoteToPlantMutation = trpc.plants.promoteToPlant.useMutation({
    onSuccess: () => {
      toast.success('🌱 Muda promovida para planta com sucesso!');
      refetch();
    },
    onError: (e) => toast.error(`Erro ao promover muda: ${e.message}`),
  });

  // Handlers
  const handleTransplantToFlora = () => { haptic.warning(); setTransplantConfirmOpen(true); };
  const handleHarvest  = () => { haptic.confirm();      setHarvestModalOpen(true); };
  const handleDelete   = () => { haptic.destructive();  setDeleteConfirmOpen(true); };
  const handleDiscard  = () => { haptic.destructive();  setDiscardModalOpen(true); };
  const handlePromoteToPlant = () => {
    if (!plant) return;
    haptic.confirm();
    promoteToPlantMutation.mutate({ plantId: plant.id });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (isError) {
    return <ErrorState fullPage onRetry={refetch} />;
  }

  if (!plant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <EmptyState
          icon={Sprout}
          title="Planta não encontrada"
          description="Esta planta pode ter sido excluída ou movida pra lixeira. Volte pra ver as plantas ativas."
          action={{ label: "Ver minhas plantas", href: "/plants", variant: "outline" }}
          accent="neutral"
          className="w-full max-w-md"
        />
      </div>
    );
  }

  // Fase ativa via phaseColors.ts (centralizado)
  // Extraído em variável para evitar narrowing excessivo do TS na ternária longa
  const tentCat: string = tent?.category ?? '';
  const activePhase: Phase =
    plant.cyclePhase === 'FLORA' || tentCat === 'FLORA' ? 'FLORA'       :
    tentCat === 'DRYING'      ? 'DRYING'       :
    tentCat === 'CURING'      ? 'CURING'        :
    tentCat === 'MAINTENANCE' ? 'MAINTENANCE'   :
    tentCat === 'CLONING'     ? 'CLONING'       :
    tentCat === 'FLUSHING'    ? 'FLUSHING'      :
    tentCat === 'HARVEST'     ? 'HARVEST'       :
    plant.plantStage === 'SEEDLING'  ? 'SEEDLING'      : 'VEGA';

  // Hero config — always-dark so the photo "floats" on a colored canvas
  // Mantemos valores escuros para o hero (phase-aware, mas em tom 800/900)
  const heroColor =
    activePhase === 'FLORA'       ? '#3b0764' :  // violet-950 (era #581c87)
    activePhase === 'DRYING'      ? '#78350f' :  // amber-900
    activePhase === 'CURING'      ? '#713f12' :  // yellow-900
    activePhase === 'MAINTENANCE' ? '#1e1b4b' :  // indigo-950
    activePhase === 'CLONING'     ? '#052e16' :  // green-950
    activePhase === 'FLUSHING'    ? '#042f2e' :  // teal-950
    activePhase === 'HARVEST'     ? '#431407' :  // orange-950
    activePhase === 'SEEDLING'    ? '#052e16' :  // green-950
    '#052e16';                                   // VEGA: green-950

  const phaseLabel = PHASE_LABELS[activePhase];

  const daysOld = Math.floor(
    (Date.now() - new Date(plant.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  const isPlant = plant.plantStage === "PLANT";

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">

        {/* ── Hero: foto full-bleed com nome sobreposto ── */}
        <div
          className="relative w-full overflow-hidden h-hero-safe"
          style={{ background: heroColor }}
        >
          {/* Photo as full-bleed background */}
          {lastPhoto ? (
            <img
              src={lastPhoto}
              alt={plant.name}
              className="absolute inset-0 w-full h-full object-cover"
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          ) : (
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(255,255,255,0.08) 0%, transparent 70%)' }} />
          )}

          {/* Gradient fade da parte inferior — legibilidade do texto */}
          <div className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{ height: '55%', background: 'linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.35) 55%, transparent 100%)' }} />

          {/* Nome + strain no bottom da foto */}
          <div className="absolute inset-x-0 bottom-0 px-5 pb-5 z-10">
            <h1 className="text-2xl font-bold text-white leading-tight drop-shadow">{plant.name}</h1>
            {strain?.name && (
              <p className="text-sm text-white/70 mt-0.5 drop-shadow">{strain.name}</p>
            )}
          </div>

          {/* Floating back button — top left */}
          <button
            onClick={() => setLocation('/plants')}
            className="absolute left-4 top-safe-1rem z-30 w-10 h-10 rounded-full flex items-center justify-center transition-opacity active:opacity-70"
            style={{
              background: 'rgba(0,0,0,0.32)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>

          {/* Floating action buttons — top right */}
          <div className="absolute right-4 top-safe-1rem z-30 flex items-center gap-2">
            <button
              onClick={() => setEditModalOpen(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-opacity active:opacity-70"
              style={{ background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              <Edit className="w-4 h-4 text-white" />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-opacity active:opacity-70"
                  style={{ background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  <MoreVertical className="w-4 h-4 text-white" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} className="w-56">
                {plant.plantStage === "SEEDLING" && (
                  <PressDropdownMenuItem
                    onClick={handlePromoteToPlant}
                    disabled={promoteToPlantMutation.isPending}
                    pressIntensity="medium"
                    className="text-green-600"
                  >
                    {promoteToPlantMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Promovendo...</>
                    ) : (
                      <><Sprout className="w-4 h-4 mr-2" />Promover para Planta</>
                    )}
                  </PressDropdownMenuItem>
                )}
                {tent?.category === "VEGA" && plant.plantStage === "PLANT" && (
                  <PressDropdownMenuItem
                    onClick={handleTransplantToFlora}
                    disabled={transplantMutation.isPending}
                    pressIntensity="medium"
                  >
                    {transplantMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Transplantando...</>
                    ) : (
                      <><Flower2 className="w-4 h-4 mr-2" />Transplantar para Flora</>
                    )}
                  </PressDropdownMenuItem>
                )}
                <PressDropdownMenuItem onClick={() => { haptic.tap(); setMoveTentModalOpen(true); }}>
                  <MoveRight className="w-4 h-4 mr-2" />
                  Mover para Outra Estufa
                </PressDropdownMenuItem>
                <PressDropdownMenuItem onClick={() => setCloneDialog(true)}>
                  <GitFork className="w-4 h-4 mr-2" />
                  Clonar Planta
                </PressDropdownMenuItem>
                <PressDropdownMenuItem onClick={() => { haptic.tap(); setQrDialog(true); }}>
                  <QrCode className="w-4 h-4 mr-2" />
                  Etiqueta QR Code
                </PressDropdownMenuItem>
                <PressDropdownMenuItem onClick={() => {
                  haptic.tap();
                  const ok = exportPlantPDF({ plant, strain, tent, healthLogs: healthLogs ?? [] });
                  if (!ok) toast.error('Permita pop-ups para exportar');
                }}>
                  <Download className="w-4 h-4 mr-2" />
                  Exportar Relatório PDF
                </PressDropdownMenuItem>
                <DropdownMenuSeparator />
                <PressDropdownMenuItem
                  onClick={handleHarvest}
                  disabled={archiveMutation.isPending}
                  pressIntensity="medium"
                  className="text-green-600"
                >
                  {archiveMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Arquivando...</>
                  ) : (
                    <><CheckCircle className="w-4 h-4 mr-2" />Marcar como Colhida</>
                  )}
                </PressDropdownMenuItem>
                <PressDropdownMenuItem
                  onClick={handleDiscard}
                  disabled={archiveMutation.isPending}
                  pressIntensity="strong"
                  className="text-orange-600"
                >
                  {archiveMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Arquivando...</>
                  ) : (
                    <><XCircle className="w-4 h-4 mr-2" />Descartar Planta</>
                  )}
                </PressDropdownMenuItem>
                <DropdownMenuSeparator />
                <PressDropdownMenuItem
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  pressIntensity="strong"
                  className="text-red-600"
                >
                  {deleteMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Excluindo...</>
                  ) : (
                    <><Trash2 className="w-4 h-4 mr-2" />Excluir Planta</>
                  )}
                </PressDropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ── Content: stats + tabs (relative pra o phase tint funcionar) ── */}
        <div className="relative">
        {/* Phase-aware tint: radial glow sutil na cor da fase abaixo do hero */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-0"
          style={{
            height: '200px',
            background: `radial-gradient(ellipse 90% 80% at 50% -15%, ${phaseColorAlpha(activePhase, 0.18)} 0%, transparent 80%)`,
          }}
        />

        {/* ── Stats: IDADE · FASE · ESTUFA ── */}
        <PlantStatsStrip
          daysOld={daysOld}
          phaseLabel={phaseLabel}
          cycleWeek={plant.cycleWeek}
          tentName={tent?.name}
          plantCode={plant.code}
          hasCyclePhase={!!(plant.cyclePhase || tent?.category)}
        />

        {/* ── Tabs ─────────────────────────────────────────────── */}
        <main className="container py-4 pb-32 md:pb-8">
          {/* Notes strip — shown if plant has notes */}
          {plant.notes && (
            <div className="mb-3 px-3 py-2.5 rounded-xl border border-border/40 bg-muted/20">
              <p className="text-xs text-muted-foreground/70 leading-relaxed italic">{plant.notes}</p>
            </div>
          )}

          <Tabs defaultValue="health" className="w-full">
            <div className="overflow-x-auto -mx-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden mb-3">
              <TabsList className="inline-flex w-max min-w-full h-auto p-1 gap-0.5">
                <TabsTrigger value="health" className="flex flex-col items-center gap-0.5 py-2 px-4 text-xs">
                  <Heart className="w-3.5 h-3.5" />
                  Saúde
                </TabsTrigger>
                <TabsTrigger value="environment" className="flex flex-col items-center gap-0.5 py-2 px-4 text-xs">
                  <Thermometer className="w-3.5 h-3.5" />
                  Ambiente
                </TabsTrigger>
                {isPlant && (
                  <TabsTrigger value="cultivation" className="flex flex-col items-center gap-0.5 py-2 px-4 text-xs">
                    <Sprout className="w-3.5 h-3.5" />
                    Cultivo
                  </TabsTrigger>
                )}
                <TabsTrigger value="archive" className="flex flex-col items-center gap-0.5 py-2 px-4 text-xs">
                  <History className="w-3.5 h-3.5" />
                  Arquivo
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="health">
              <ErrorBoundary inline message="Erro ao carregar histórico de saúde.">
                <Suspense fallback={<TabSkeleton />}>
                  <PlantHealthTab plantId={plantId} />
                </Suspense>
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="environment">
              <ErrorBoundary inline message="Erro ao carregar dados de ambiente.">
                <Suspense fallback={<TabSkeleton />}>
                  <PlantEnvironmentTab plantId={plantId} />
                </Suspense>
              </ErrorBoundary>
            </TabsContent>

            {isPlant && (
              <TabsContent value="cultivation">
                <Tabs defaultValue="observations" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 mb-3 h-auto p-1">
                    <TabsTrigger value="observations" className="flex flex-col items-center gap-0.5 py-2 text-xs">
                      <FileText className="w-3.5 h-3.5" />
                      Obs.
                    </TabsTrigger>
                    <TabsTrigger value="lst" className="flex flex-col items-center gap-0.5 py-2 text-xs">
                      <Scissors className="w-3.5 h-3.5" />
                      Treino
                    </TabsTrigger>
                    <TabsTrigger value="trichomes" className="flex flex-col items-center gap-0.5 py-2 text-xs">
                      <Sparkles className="w-3.5 h-3.5" />
                      Tricomas
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="observations">
                    <ErrorBoundary inline message="Erro ao carregar observações.">
                      <Suspense fallback={<TabSkeleton />}>
                        <PlantObservationsTab plantId={plantId} />
                      </Suspense>
                    </ErrorBoundary>
                  </TabsContent>
                  <TabsContent value="lst">
                    <ErrorBoundary inline message="Erro ao carregar dados de treino.">
                      <Suspense fallback={<TabSkeleton />}>
                        <PlantTrainingSummary plantId={plantId} />
                      </Suspense>
                    </ErrorBoundary>
                  </TabsContent>
                  <TabsContent value="trichomes">
                    <ErrorBoundary inline message="Erro ao carregar análise de tricomas.">
                      <Suspense fallback={<TabSkeleton />}>
                        <PlantTrichomesTab plantId={plantId} />
                      </Suspense>
                    </ErrorBoundary>
                  </TabsContent>
                </Tabs>
              </TabsContent>
            )}

            <TabsContent value="archive">
              <ErrorBoundary inline message="Erro ao carregar arquivo da planta.">
                <Suspense fallback={<TabSkeleton />}>
                  <PlantArchiveTab plantId={plantId} plantName={plant?.name ?? "Planta"} />
                </Suspense>
              </ErrorBoundary>
            </TabsContent>
          </Tabs>
        </main>
        </div>{/* /relative content wrapper */}

        {/* ── Modals & Dialogs ── */}
        <MoveTentModal
          open={moveTentModalOpen}
          onOpenChange={setMoveTentModalOpen}
          plantId={plantId}
          plantName={plant?.name || ""}
          currentTentId={plant?.currentTentId || 0}
          onSuccess={refetch}
        />

        <PlantEditModal
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          plant={plant}
          onSuccess={refetch}
        />

        <DeleteConfirmDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Excluir Planta"
          description={
            <>
              Tem certeza que deseja excluir permanentemente{" "}
              <span className="font-semibold text-foreground">{plant.name}</span>?
              Esta ação não pode ser desfeita e removerá todos os registros, fotos e histórico associados.
              Use apenas para plantas cadastradas por engano.
            </>
          }
          onConfirm={() => { haptic.destructive(); if (plant) deleteMutation.mutate({ plantId: plant.id }); }}
          isPending={deleteMutation.isPending}
        />

        <PlantTransplantDialog
          open={transplantConfirmOpen}
          onOpenChange={setTransplantConfirmOpen}
          plantName={plant.name}
          onConfirm={() => {
            haptic.warning();
            transplantMutation.mutate({ plantId });
            setTransplantConfirmOpen(false);
          }}
          isPending={transplantMutation.isPending}
        />

        <PlantHarvestModal
          open={harvestModalOpen}
          onOpenChange={setHarvestModalOpen}
          plantName={plant.name}
          onConfirm={(notes) => {
            haptic.confirm();
            archiveMutation.mutate({ plantId, status: 'HARVESTED', finishReason: notes || undefined });
            setHarvestModalOpen(false);
          }}
          isPending={archiveMutation.isPending}
        />

        <PlantDiscardModal
          open={discardModalOpen}
          onOpenChange={setDiscardModalOpen}
          plantName={plant.name}
          onConfirm={(reason) => {
            haptic.destructive();
            archiveMutation.mutate({ plantId, status: 'DISCARDED', finishReason: reason || undefined });
            setDiscardModalOpen(false);
          }}
          isPending={archiveMutation.isPending}
        />

        <PlantCloneDialog
          open={cloneDialog}
          onOpenChange={setCloneDialog}
          plantId={plant.id}
          plantName={plant.name}
        />

        <PlantQrDialog
          open={qrDialog}
          onOpenChange={setQrDialog}
          plantId={plantId}
          plantName={plant.name}
          plantCode={plant.code}
        />
      </div>
    </PageTransition>
  );
}
