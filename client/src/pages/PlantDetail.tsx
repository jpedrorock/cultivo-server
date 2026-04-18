import { useState, lazy, Suspense } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { ErrorState } from "@/components/ErrorState";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { PressButton } from "@/components/PressButton";
import { PressDropdownMenuItem } from "@/components/PressDropdownMenuItem";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

// Tabs carregadas sob demanda para reduzir bundle inicial de PlantDetail
const PlantHealthTab       = lazy(() => import("@/components/PlantHealthTab"));
const PlantEnvironmentTab  = lazy(() => import("@/components/PlantEnvironmentTab"));
const PlantObservationsTab = lazy(() => import("@/components/PlantObservationsTab"));
const PlantArchiveTab      = lazy(() => import("@/components/PlantArchiveTab"));
const PlantTrichomesTab    = lazy(() => import("@/components/PlantTrichomesTab"));
const PlantLSTTab          = lazy(() => import("@/components/PlantLSTTab"));
const PlantTrainingSummary = lazy(() => import("@/components/PlantTrainingSummary"));
const PlantPhotosTab       = lazy(() => import("@/components/PlantPhotosTab"));

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
  const [moveTentModalOpen, setMoveTentModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", code: "", notes: "" });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [transplantConfirmOpen, setTransplantConfirmOpen] = useState(false);
  const [harvestModalOpen, setHarvestModalOpen] = useState(false);
  const [harvestNotes, setHarvestNotes] = useState("");
  const [discardModalOpen, setDiscardModalOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState("");
  const [cloneDialog, setCloneDialog] = useState(false);
  const [cloneNameInput, setCloneNameInput] = useState("");
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

  // Mutations para ações
  const transplantMutation = trpc.plants.transplantToFlora.useMutation({
    onSuccess: (data) => {
      toast.success(`Planta transplantada para ${data.tentName} com sucesso!`);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao transplantar: ${error.message}`);
    },
  });
  
  const archiveMutation = trpc.plants.archive.useMutation({
    onSuccess: (_, variables) => {
      const message = variables.status === 'HARVESTED'
        ? 'Planta marcada como colhida e arquivada!'
        : 'Planta descartada e arquivada!';
      toast.success(message);
      setLocation('/plants');
    },
    onError: (error) => {
      toast.error(`Erro ao arquivar planta: ${error.message}`);
    },
  });
  
  const deleteMutation = trpc.plants.deletePermanently.useMutation({
    onSuccess: () => {
      toast.success('Planta excluída permanentemente!');
      setLocation('/plants');
    },
    onError: (error) => {
      toast.error(`Erro ao excluir planta: ${error.message}`);
    },
  });

  const promoteToPlantMutation = trpc.plants.promoteToPlant.useMutation({
    onSuccess: () => {
      toast.success('🌱 Muda promovida para planta com sucesso!');
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao promover muda: ${error.message}`);
    },
  });

  const updateMutation = trpc.plants.update.useMutation({
    onSuccess: () => {
      toast.success('Planta atualizada com sucesso!');
      setEditModalOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar planta: ${error.message}`);
    },
  });

  const utils = trpc.useUtils();
  const clonePlantMutation = trpc.plants.clone.useMutation({
    onSuccess: (data) => {
      haptic.confirm();
      toast.success(`Clone "${data.name}" criado!`);
      setCloneDialog(false);
      utils.plants.list.invalidate();
    },
    onError: (e) => toast.error(`Erro ao clonar: ${e.message}`),
  });

  // Handlers
  const handleTransplantToFlora = () => {
    haptic.warning();
    setTransplantConfirmOpen(true);
  };
  
  const handleHarvest = () => {
    haptic.confirm();
    setHarvestNotes("");
    setHarvestModalOpen(true);
  };

  const confirmHarvest = () => {
    haptic.confirm();
    archiveMutation.mutate({ 
      plantId, 
      status: 'HARVESTED',
      finishReason: harvestNotes || undefined
    });
    setHarvestModalOpen(false);
  };
  
  const handleDelete = () => {
    haptic.destructive();
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    haptic.destructive();
    if (plant) deleteMutation.mutate({ plantId: plant.id });
  };
  
  const handleDiscard = () => {
    haptic.destructive();
    setDiscardReason("");
    setDiscardModalOpen(true);
  };

  const confirmDiscard = () => {
    haptic.destructive();
    archiveMutation.mutate({ 
      plantId, 
      status: 'DISCARDED',
      finishReason: discardReason || undefined
    });
    setDiscardModalOpen(false);
  };

  const handlePromoteToPlant = () => {
    if (!plant) return;
    haptic.confirm();
    promoteToPlantMutation.mutate({ plantId: plant.id });
  };

  const handleExportPDF = () => {
    if (!plant) return;
    const generatedAt = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

    const healthRows = (healthLogs ?? []).slice(0, 50).map((l: any) => `
      <tr>
        <td>${new Date(l.logDate ?? l.createdAt).toLocaleDateString("pt-BR")}</td>
        <td>${l.symptoms ?? '—'}</td>
        <td>${l.treatment ?? '—'}</td>
        <td>${l.notes ?? '—'}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Planta — ${plant.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; padding: 32px; font-size: 13px; }
    .header { border-bottom: 2px solid #111; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    .header h1 { font-size: 22px; font-weight: 700; }
    .header .sub { font-size: 12px; color: #666; margin-top: 4px; }
    .header-right { font-size: 11px; color: #888; text-align: right; line-height: 1.7; }
    .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .info-cell { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
    .info-cell .lbl { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
    .info-cell .val { font-size: 14px; font-weight: 600; margin-top: 3px; }
    h2 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #374151; margin: 20px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #f9fafb; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
    td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; color: #374151; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #bbb; display: flex; justify-content: space-between; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>🌿 ${plant.name}</h1>
      <div class="sub">${plant.code ? `Código: ${plant.code}` : ''} ${strain ? `· Strain: ${strain.name}` : ''}</div>
    </div>
    <div class="header-right">
      <div>${tent ? `Estufa: ${tent.name}` : ''}</div>
      <div>Gerado em ${generatedAt}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-cell"><div class="lbl">Estágio</div><div class="val">${plant.plantStage === 'PLANT' ? 'Planta' : plant.plantStage === 'SEEDLING' ? 'Muda' : plant.plantStage}</div></div>
    <div class="info-cell"><div class="lbl">Semana do Ciclo</div><div class="val">${plant.cycleWeek != null ? `Semana ${plant.cycleWeek}` : '—'}</div></div>
    <div class="info-cell"><div class="lbl">Status</div><div class="val">${plant.status ?? '—'}</div></div>
    <div class="info-cell"><div class="lbl">Observações de Saúde</div><div class="val">${(healthLogs ?? []).length}</div></div>
  </div>

  ${(healthLogs ?? []).length > 0 ? `
  <h2>Histórico de Saúde (últimos ${Math.min((healthLogs ?? []).length, 50)})</h2>
  <table>
    <thead><tr><th>Data</th><th>Sintomas</th><th>Tratamento</th><th>Notas</th></tr></thead>
    <tbody>${healthRows}</tbody>
  </table>` : ''}

  <div class="footer">
    <span>App Cultivo &nbsp;·&nbsp; ${window.location.origin}</span>
    <span>${plant.name} &nbsp;·&nbsp; ${generatedAt}</span>
  </div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) { toast.error('Permita pop-ups para exportar'); return; }
    win.document.write(html);
    win.document.close();
  };

  const handleEditClick = () => {
    haptic.tap();
    if (plant) {
      setEditForm({
        name: plant.name,
        code: plant.code || "",
        notes: plant.notes || "",
      });
      setEditModalOpen(true);
    }
  };

  const handleEditSave = () => {
    haptic.confirm();
    updateMutation.mutate({
      id: plantId,
      name: editForm.name,
      code: editForm.code || undefined,
      notes: editForm.notes || undefined,
    });
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-foreground mb-2">Planta não encontrada</p>
          <Button variant="outline" asChild>
            <Link href="/plants">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // Hero config — always-dark background so photo "floats" on colored canvas
  const heroColor =
    plant.cyclePhase === 'FLORA' || tent?.category === 'FLORA' ? '#581c87' :
    tent?.category === 'DRYING'      ? '#78350f' :
    tent?.category === 'MAINTENANCE' ? '#1e3a8a' :
    '#14532d'; // VEGA or default/seedling

  const phaseLabel =
    plant.cyclePhase === 'FLORA' || tent?.category === 'FLORA' ? 'Flora' :
    plant.cyclePhase === 'VEGA'  || tent?.category === 'VEGA'  ? 'Vega'  :
    tent?.category === 'DRYING'      ? 'Secagem'    :
    tent?.category === 'MAINTENANCE' ? 'Manutenção' :
    plant.plantStage === 'SEEDLING'  ? 'Muda'       : 'Vega';

  const daysOld = Math.floor(
    (Date.now() - new Date(plant.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  const isPlant = plant.plantStage === "PLANT";

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">

        {/* ── Hero: foto full-bleed com nome sobreposto ── */}
        <div
          className="relative w-full overflow-hidden"
          style={{
            background: heroColor,
            height: 'calc(300px + env(safe-area-inset-top, 0px))',
          }}
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
            className="absolute left-4 z-30 w-10 h-10 rounded-full flex items-center justify-center transition-opacity active:opacity-70"
            style={{
              top: 'calc(1rem + env(safe-area-inset-top, 0px))',
              background: 'rgba(0,0,0,0.32)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>

          {/* Floating action buttons — top right */}
          <div
            className="absolute right-4 z-30 flex items-center gap-2"
            style={{ top: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
          >
            <button
              onClick={handleEditClick}
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
                <PressDropdownMenuItem onClick={() => { setCloneNameInput(`${plant?.name} (Clone)`); setCloneDialog(true); }}>
                  <GitFork className="w-4 h-4 mr-2" />
                  Clonar Planta
                </PressDropdownMenuItem>
                <PressDropdownMenuItem onClick={() => { haptic.tap(); setQrDialog(true); }}>
                  <QrCode className="w-4 h-4 mr-2" />
                  Etiqueta QR Code
                </PressDropdownMenuItem>
                <PressDropdownMenuItem onClick={() => { haptic.tap(); handleExportPDF(); }}>
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

        {/* ── Stats: IDADE · FASE · ESTUFA ── */}
        <div className="divide-y divide-border/50">
          {/* Idade */}
          <div className="px-5 py-3.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-foreground tabular-nums leading-none">{daysOld}</span>
              <span className="text-sm text-muted-foreground">dias</span>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mt-1">IDADE</p>
          </div>

          {/* Fase */}
          {(plant.cyclePhase || tent?.category) && (
            <div className="px-5 py-3.5">
              <p className="text-xl font-bold text-foreground leading-none">
                {phaseLabel}{plant.cycleWeek ? ` · S${plant.cycleWeek}` : ''}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mt-1">FASE</p>
            </div>
          )}

          {/* Estufa */}
          {tent?.name && (
            <div className="px-5 py-3.5">
              <p className="text-xl font-bold text-foreground leading-none">{tent.name}</p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mt-1">
                ESTUFA{plant.code ? ` · #${plant.code}` : ''}
              </p>
            </div>
          )}
        </div>

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
                <TabsTrigger value="health" className="flex flex-col items-center gap-0.5 py-2 px-4 text-[11px]">
                  <Heart className="w-3.5 h-3.5" />
                  Saúde
                </TabsTrigger>
                <TabsTrigger value="environment" className="flex flex-col items-center gap-0.5 py-2 px-4 text-[11px]">
                  <Thermometer className="w-3.5 h-3.5" />
                  Ambiente
                </TabsTrigger>
                {isPlant && (
                  <TabsTrigger value="cultivation" className="flex flex-col items-center gap-0.5 py-2 px-4 text-[11px]">
                    <Sprout className="w-3.5 h-3.5" />
                    Cultivo
                  </TabsTrigger>
                )}
                <TabsTrigger value="archive" className="flex flex-col items-center gap-0.5 py-2 px-4 text-[11px]">
                  <History className="w-3.5 h-3.5" />
                  Arquivo
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="health">
              <Suspense fallback={<TabSkeleton />}>
                <PlantHealthTab plantId={plantId} />
              </Suspense>
            </TabsContent>

            <TabsContent value="environment">
              <Suspense fallback={<TabSkeleton />}>
                <PlantEnvironmentTab plantId={plantId} />
              </Suspense>
            </TabsContent>

            {isPlant && (
              <TabsContent value="cultivation">
                <Tabs defaultValue="observations" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 mb-3 h-auto p-1">
                    <TabsTrigger value="observations" className="flex flex-col items-center gap-0.5 py-2 text-[11px]">
                      <FileText className="w-3.5 h-3.5" />
                      Obs.
                    </TabsTrigger>
                    <TabsTrigger value="lst" className="flex flex-col items-center gap-0.5 py-2 text-[11px]">
                      <Scissors className="w-3.5 h-3.5" />
                      Treino
                    </TabsTrigger>
                    <TabsTrigger value="trichomes" className="flex flex-col items-center gap-0.5 py-2 text-[11px]">
                      <Sparkles className="w-3.5 h-3.5" />
                      Tricomas
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="observations">
                    <Suspense fallback={<TabSkeleton />}>
                      <PlantObservationsTab plantId={plantId} />
                    </Suspense>
                  </TabsContent>
                  <TabsContent value="lst">
                    <Suspense fallback={<TabSkeleton />}>
                      <PlantTrainingSummary plantId={plantId} />
                    </Suspense>
                  </TabsContent>
                  <TabsContent value="trichomes">
                    <Suspense fallback={<TabSkeleton />}>
                      <PlantTrichomesTab plantId={plantId} />
                    </Suspense>
                  </TabsContent>
                </Tabs>
              </TabsContent>
            )}

            <TabsContent value="archive">
              <Suspense fallback={<TabSkeleton />}>
                <PlantArchiveTab plantId={plantId} plantName={plant?.name ?? "Planta"} />
              </Suspense>
            </TabsContent>
          </Tabs>
        </main>
      
      {/* Modal de Mover Estufa */}
      <MoveTentModal
        open={moveTentModalOpen}
        onOpenChange={setMoveTentModalOpen}
        plantId={plantId}
        plantName={plant?.name || ""}
        currentTentId={plant?.currentTentId || 0}
        onSuccess={refetch}
      />

      {/* Modal de Editar Planta */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Planta</DialogTitle>
            <DialogDescription>
              Atualize as informações da planta
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome *</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Nome da planta"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-code">Código</Label>
              <Input
                id="edit-code"
                value={editForm.code}
                onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                placeholder="Ex: NL-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notas</Label>
              <Textarea
                id="edit-notes"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Observações gerais sobre a planta"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <PressButton
              variant="outline"
              onClick={() => setEditModalOpen(false)}
              disabled={updateMutation.isPending}
            >
              Cancelar
            </PressButton>
            <PressButton
              onClick={handleEditSave}
              disabled={!editForm.name || updateMutation.isPending}
              pressIntensity="medium"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </PressButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
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
        onConfirm={confirmDelete}
        isPending={deleteMutation.isPending}
      />

      {/* Transplant Confirm Dialog */}
      <Dialog open={transplantConfirmOpen} onOpenChange={setTransplantConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-600">
              <MoveRight className="w-5 h-5" />
              Transplantar para Flora
            </DialogTitle>
            <DialogDescription>
              Deseja transplantar{" "}
              <span className="font-semibold text-foreground">{plant.name}</span>{" "}
              para a estufa de Flora? A planta será movida automaticamente para a estufa de Floração configurada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <PressButton variant="outline" onClick={() => setTransplantConfirmOpen(false)}>
              Cancelar
            </PressButton>
            <PressButton
              className="bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600 text-white border-0"
              pressIntensity="medium"
              onClick={() => {
                haptic.warning();
                transplantMutation.mutate({ plantId });
                setTransplantConfirmOpen(false);
              }}
            >
              <MoveRight className="w-4 h-4 mr-2" />
              Transplantar
            </PressButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Harvest Modal */}
      <Dialog open={harvestModalOpen} onOpenChange={setHarvestModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Scissors className="w-5 h-5" />
              Registrar Colheita
            </DialogTitle>
            <DialogDescription>
              Colhendo{" "}
              <span className="font-semibold text-foreground">{plant.name}</span>.
              Adicione notas sobre a colheita (opcional).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-foreground mb-2 block">
              Notas da colheita (ex: peso, qualidade)
            </label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              rows={3}
              placeholder="Ex: 45g, qualidade excelente, terpenos intensos..."
              value={harvestNotes}
              onChange={(e) => setHarvestNotes(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <PressButton variant="outline" onClick={() => setHarvestModalOpen(false)}>
              Cancelar
            </PressButton>
            <PressButton
              className="bg-primary text-primary-foreground hover:bg-primary/90 border-0"
              onClick={confirmHarvest}
              disabled={archiveMutation.isPending}
              pressIntensity="medium"
            >
              {archiveMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Colhendo...</>
              ) : (
                <><Scissors className="w-4 h-4 mr-2" />Confirmar Colheita</>
              )}
            </PressButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard Modal */}
      <Dialog open={discardModalOpen} onOpenChange={setDiscardModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" />
              Descartar Planta
            </DialogTitle>
            <DialogDescription>
              Descartando{" "}
              <span className="font-semibold text-foreground">{plant.name}</span>.
              Informe o motivo do descarte (opcional).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-foreground mb-2 block">
              Motivo do descarte
            </label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              rows={3}
              placeholder="Ex: doente, hermafrodita, baixa qualidade..."
              value={discardReason}
              onChange={(e) => setDiscardReason(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <PressButton variant="outline" onClick={() => setDiscardModalOpen(false)}>
              Cancelar
            </PressButton>
            <PressButton
              variant="destructive"
              onClick={confirmDiscard}
              disabled={archiveMutation.isPending}
              pressIntensity="strong"
            >
              {archiveMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Descartando...</>
              ) : (
                <><XCircle className="w-4 h-4 mr-2" />Confirmar Descarte</>
              )}
            </PressButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone Plant Dialog */}
      <Dialog open={cloneDialog} onOpenChange={setCloneDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clonar Planta</DialogTitle>
            <DialogDescription>
              Cria uma nova muda com a mesma strain e estufa de "{plant?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Nome do clone</Label>
            <Input
              value={cloneNameInput}
              onChange={(e) => setCloneNameInput(e.target.value)}
              placeholder="Ex: Northern Lights (Clone)"
              onKeyDown={(e) => e.key === "Enter" && clonePlantMutation.mutate({ plantId: plant!.id, name: cloneNameInput })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => clonePlantMutation.mutate({ plantId: plant!.id, name: cloneNameInput })}
              disabled={clonePlantMutation.isPending || !cloneNameInput.trim()}
            >
              {clonePlantMutation.isPending ? "Clonando..." : "Criar Clone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={qrDialog} onOpenChange={setQrDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-4 h-4" />
              Etiqueta QR Code
            </DialogTitle>
            <DialogDescription>
              Escaneie para abrir {plant.name} diretamente no app.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {/* QR gerado via api.qrserver.com — sem dependência */}
            <div className="rounded-2xl overflow-hidden border border-border p-3 bg-white">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`${window.location.origin}/plants/${plantId}`)}&bgcolor=ffffff&color=111111&margin=4`}
                alt={`QR Code — ${plant.name}`}
                width={180}
                height={180}
                className="block"
              />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">{plant.name}</p>
              {plant.code && <p className="text-xs text-muted-foreground">{plant.code}</p>}
              <p className="text-[10px] text-muted-foreground/60 mt-1">/plants/{plantId}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="w-full gap-2" onClick={() => {
              // Abre janela de impressão só com o QR
              const win = window.open('', '_blank', 'width=400,height=500');
              if (!win) return;
              win.document.write(`
                <html><head><title>QR — ${plant.name}</title>
                <style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;background:#fff}
                img{border:1px solid #eee;padding:12px;border-radius:12px}
                p{margin:6px 0;font-size:14px;color:#111}small{color:#999;font-size:11px}</style></head>
                <body>
                  <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`${window.location.origin}/plants/${plantId}`)}&bgcolor=ffffff&color=111111&margin=4" />
                  <p><strong>${plant.name}</strong></p>
                  ${plant.code ? `<small>${plant.code}</small>` : ''}
                  <script>window.onload=()=>{window.print();window.close()}<\/script>
                </body></html>
              `);
              win.document.close();
            }}>
              <Download className="w-4 h-4" />
              Imprimir Etiqueta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
