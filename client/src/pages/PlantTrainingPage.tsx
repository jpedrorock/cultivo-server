import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Maximize2,
  X,
  Save,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Boxes,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import PlantNodeMap from "@/components/PlantNodeMap";
// Lazy: Three.js (~600KB) só carrega quando user abre a vista 3D
const Plant3DView = lazy(() => import("@/components/Plant3DView"));

const View3DFallback = () => (
  <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height: "100%", minHeight: 200 }}>
    Carregando 3D…
  </div>
);
import type { PlantGraphNode } from "@/features/cannaprune/plantGraph";
import {
  TECHNIQUE_CONFIGS,
  normalizeTechniqueName,
  type TechniqueId,
} from "@/features/training/techniqueConfigs";

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PlantTrainingPage() {
  const [, params]  = useRoute("/plants/:id/training");
  const [, navigate] = useLocation();
  const plantId = params?.id ? parseInt(params.id, 10) : null;

  // Data
  const { data: plant } = trpc.plants.getById.useQuery(
    { id: plantId! },
    { enabled: !!plantId },
  );
  const { data: logs = [], refetch } = trpc.plantLST.list.useQuery(
    { plantId: plantId! },
    { enabled: !!plantId },
  );
  const { data: stats } = trpc.plantLST.stats.useQuery(
    { plantId: plantId! },
    { enabled: !!plantId },
  );

  // Mutations
  const utils = trpc.useUtils();
  const createMutation = trpc.plantLST.create.useMutation({
    onSuccess: () => {
      refetch();
      utils.plantLST.stats.invalidate({ plantId: plantId! });
      utils.plantLST.list.invalidate({ plantId: plantId! });
    },
    onError: (e) => toast.error(`Erro ao salvar sessão: ${e.message}`),
  });
  const clearLogsMutation = trpc.plantLST.clearLogs.useMutation({
    onSuccess: () => {
      refetch();
      utils.plantLST.stats.invalidate({ plantId: plantId! });
    },
    onError: (e) => toast.error(`Erro ao apagar histórico: ${e.message}`),
  });
  // Auto-abre o sandbox se navegou com ?sandbox=1 (ex: via quick log)
  // ?view=3d ou ?view=2d (top) define a vista inicial
  const _qs = new URLSearchParams(window.location.search);
  const autoSandbox = _qs.get('sandbox') === '1';
  const initialView: 'top' | '3d' = _qs.get('view') === '3d' ? '3d' : 'top';
  const [mapFullscreen,    setMapFullscreen]    = useState(autoSandbox);
  const [viewMode,         setViewMode]         = useState<'top' | '3d'>(initialView);
  const [topViewNodes,     setTopViewNodes]     = useState<PlantGraphNode[]>([]);

  // ── Tamanho do vaso — agora persistido no banco (antes: localStorage) ───────
  const { data: plantStructure } = trpc.plantStructure.get.useQuery(
    { plantId: plantId! },
    { enabled: !!plantId, refetchOnWindowFocus: false },
  );
  const savePotSizeMutation = trpc.plantStructure.savePotSize.useMutation();
  const potSizeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [potSizeL, setPotSizeL] = useState<number>(5);
  // Sincroniza com valor do banco quando a query retorna
  useEffect(() => {
    if (plantStructure !== undefined) {
      setPotSizeL(plantStructure?.potSizeL ?? 5);
    }
  }, [plantStructure]);
  // Persiste no banco com debounce ao alterar
  function handlePotSizeChange(newVal: number) {
    setPotSizeL(newVal);
    if (potSizeSaveTimer.current) clearTimeout(potSizeSaveTimer.current);
    potSizeSaveTimer.current = setTimeout(() => {
      if (plantId) savePotSizeMutation.mutate({ plantId, potSizeL: newVal });
    }, 800);
  }
  const [exitConfirmOpen,  setExitConfirmOpen]  = useState(false);
  // Técnicas aplicadas nesta sessão do sandbox
  const [sessionTechniques, setSessionTechniques] = useState<{ technique: string; nodeLabel: string }[]>([]);
  // Sinaliza ao PlantNodeMap para NÃO salvar no unmount (sessão descartada)
  const sandboxCancelRef = useRef(false);
  // Ref para capturar snapshot dos nós ao salvar sessão
  const nodeSnapshotRef  = useRef<PlantGraphNode[]>([]);
  // Timeline / play
  const [timelineOpen,  setTimelineOpen]  = useState(false);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [isPlaying,     setIsPlaying]     = useState(false);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Chamado pelo PlantNodeMap quando a estrutura é reiniciada ────────────
  function handleResetStructure(clearHistory: boolean) {
    if (clearHistory && plantId) {
      clearLogsMutation.mutate({ plantId });
    }
  }

  // ── Chamado pelo PlantNodeMap quando uma técnica é aplicada ──────────────
  // Acumula localmente — os logs são criados em lote ao salvar a sessão
  function handleTechniqueApplied(technique: string, nodeLabel: string) {
    setSessionTechniques(prev => [...prev, { technique, nodeLabel }]);
  }

  // ── Abre o sandbox ────────────────────────────────────────────────────────
  function openSandbox() {
    sandboxCancelRef.current = false;
    setSessionTechniques([]);
    setMapFullscreen(true);
  }

  // ── Clique no X: mostra aviso se houve técnicas, senão fecha direto ───────
  function handleSandboxClose() {
    if (sessionTechniques.length > 0) {
      setExitConfirmOpen(true);
    } else {
      // Sem alterações — fecha e salva estrutura (posições, curvas, etc.)
      setMapFullscreen(false);
    }
  }

  // ── Salvar sessão: cria os logs (com snapshot) e fecha ───────────────────
  function handleSaveSession() {
    if (!plantId) return;
    setExitConfirmOpen(false);
    // Captura snapshot atual (nodeSnapshotRef é preenchido pelo PlantNodeMap a cada render)
    const snapshot = nodeSnapshotRef.current.length > 0
      ? JSON.stringify(nodeSnapshotRef.current)
      : undefined;
    // Cria um log por técnica aplicada, todos com o mesmo snapshot da sessão
    sessionTechniques.forEach(({ technique, nodeLabel }) => {
      const techId = normalizeTechniqueName(technique) as TechniqueId | null;
      const cfg    = techId ? TECHNIQUE_CONFIGS[techId] : null;
      createMutation.mutate({
        plantId,
        technique,
        nodePosition: nodeLabel,
        techniqueConfig: cfg
          ? { expectedTops: cfg.expectedTops, recoveryDays: cfg.recoveryDays }
          : undefined,
        snapshotJson: snapshot,
      });
    });
    setMapFullscreen(false); // PlantNodeMap salva estrutura no unmount
  }

  // ── Descartar: fecha sem salvar estrutura nem criar logs ──────────────────
  function handleDiscardSession() {
    sandboxCancelRef.current = true; // sinaliza ao PlantNodeMap para não salvar
    setExitConfirmOpen(false);
    setSessionTechniques([]);
    setMapFullscreen(false);
    // Reseta a flag após o unmount (pequeno delay)
    setTimeout(() => { sandboxCancelRef.current = false; }, 500);
  }

  // ── Timeline: snpshots únicos ordenados do mais antigo ao mais novo ──────
  const snapshots = (logs as any[])
    .filter(l => l.snapshotJson)
    .reduce<{ date: string; nodes: PlantGraphNode[]; technique: string }[]>((acc, l) => {
      // Deduplica: só adiciona se o snapshot for diferente do anterior
      const last = acc[acc.length - 1];
      if (!last || JSON.stringify(last.nodes) !== JSON.stringify(l.snapshotJson)) {
        acc.push({ date: l.logDate, nodes: l.snapshotJson, technique: l.technique });
      }
      return acc;
    }, [])
    .reverse(); // cronológico (antigo → novo)

  // Clamp timelineIndex so it never goes out-of-range when snapshots changes
  const safeTimelineIndex = Math.min(timelineIndex, Math.max(0, snapshots.length - 1));

  // Play automático
  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      return;
    }
    playTimerRef.current = setInterval(() => {
      setTimelineIndex(i => {
        if (i >= snapshots.length - 1) {
          setIsPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 1800);
    return () => { if (playTimerRef.current) clearInterval(playTimerRef.current); };
  }, [isPlaying, snapshots.length]);

  // Stats chips
  const topTechniques = Object.entries(stats?.byTechnique ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  if (!plantId) return null;

  // ── Normal view ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-24">

      <PageHeader
        backHref={`/plants/${plantId}`}
        title="Treinamentos"
        subtitle={plant?.name || undefined}
      />

      <div className="px-4 pt-4 space-y-5">

        {/* ── Mapa de nós da planta ──────────────────────────────────────── */}
        <div className="rounded-2xl border border-border/40 bg-card overflow-visible">
          <div className="px-3 pt-3 pb-1 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Mapa da planta
            </p>
            <div className="flex items-center gap-1">
              {/* Toggle único que cicla entre vistas (futuro: 3D, isométrica…) */}
              {(() => {
                const VIEWS = [
                  { id: 'top' as const, label: '2D',  icon: LayoutGrid },
                  { id: '3d'  as const, label: '3D',  icon: Boxes },
                ];
                const current = VIEWS.find(v => v.id === viewMode) ?? VIEWS[0];
                const next    = VIEWS[(VIEWS.indexOf(current) + 1) % VIEWS.length];
                const Icon    = current.icon;
                return (
                  <button
                    type="button"
                    onClick={() => setViewMode(next.id)}
                    className="h-7 px-2 rounded-lg flex items-center gap-1.5 text-[11px] font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                    title={`Trocar para ${next.label}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{current.label}</span>
                  </button>
                );
              })()}
              {viewMode === '3d' && (
                <div className="flex items-center gap-1 ml-1">
                  <input
                    type="number"
                    min="0.5" step="0.5" max="100"
                    value={potSizeL}
                    onChange={(e) => handlePotSizeChange(Math.max(0.5, parseFloat(e.target.value) || 5))}
                    className="w-12 h-7 px-1.5 text-[11px] font-medium bg-muted/50 border border-border/40 rounded-md text-center focus:outline-none focus:border-primary"
                    title="Tamanho do vaso (litros)"
                  />
                  <span className="text-[10px] text-muted-foreground">L</span>
                </div>
              )}
              <button
                onClick={openSandbox}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Abrir em tela cheia"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {/* Preview compacto (desmontado quando fullscreen estiver aberto) */}
          {!mapFullscreen && (
            <>
              {viewMode === 'top' && (
                <PlantNodeMap
                  plantId={plantId}
                  compact
                  viewMode="top"
                  onCompactTap={openSandbox}
                  onTechniqueApplied={handleTechniqueApplied}
                  onResetStructure={handleResetStructure}
                  nodeSnapshotRef={nodeSnapshotRef}
                />
              )}
              {viewMode === '3d' && (
                <Suspense fallback={<View3DFallback />}>
                  <Plant3DView
                    plantId={plantId}
                    height={360}
                    potSizeL={potSizeL}
                    onTechniqueApplied={handleTechniqueApplied}
                  />
                </Suspense>
              )}
              <button
                onClick={openSandbox}
                className="w-full py-2 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors flex items-center justify-center gap-1.5 border-t border-border/20"
              >
                <Maximize2 className="w-3 h-3" />
                Abrir editor completo
              </button>
            </>
          )}
          {/* Placeholder enquanto fullscreen está aberto */}
          {mapFullscreen && (
            <div
              className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground/40 cursor-pointer"
              onClick={() => setMapFullscreen(false)}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Editor aberto em tela cheia…
            </div>
          )}
        </div>

        {/* ── Fullscreen overlay ────────────────────────────────────────── */}
        {mapFullscreen && (
          <div className="fixed inset-0 z-50 bg-background flex flex-col">
            {/* Header fullscreen — respeita notch do iOS via safe-area-inset-top */}
            <div
              className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-background/95 backdrop-blur shrink-0"
              style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
            >
              <button
                onClick={handleSandboxClose}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-base leading-tight">Mapa da planta</h2>
                {plant?.name && (
                  <p className="text-xs text-muted-foreground truncate">{plant.name}</p>
                )}
              </div>
              {/* Toggle 2D/3D dentro do fullscreen */}
              <button
                onClick={() => setViewMode(viewMode === '3d' ? 'top' : '3d')}
                className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors shrink-0"
                title={`Trocar para ${viewMode === '3d' ? '2D' : '3D'}`}
              >
                {viewMode === '3d' ? <Boxes className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
                <span>{viewMode === '3d' ? '3D' : '2D'}</span>
              </button>
              {/* Badge de técnicas aplicadas na sessão */}
              {sessionTechniques.length > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                  {sessionTechniques.length} ação{sessionTechniques.length > 1 ? 'ões' : ''}
                </span>
              )}
            </div>
            {/* Canvas com pan/zoom — overflow:hidden é intencional */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {viewMode === '3d' ? (
                <Suspense fallback={<View3DFallback />}>
                  <Plant3DView
                    plantId={plantId}
                    potSizeL={potSizeL}
                    onTechniqueApplied={handleTechniqueApplied}
                  />
                </Suspense>
              ) : (
                <PlantNodeMap
                  plantId={plantId}
                  viewMode="top"
                  cancelSaveRef={sandboxCancelRef}
                  nodeSnapshotRef={nodeSnapshotRef}
                  onTechniqueApplied={handleTechniqueApplied}
                  onResetStructure={handleResetStructure}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Timeline de evolução ─────────────────────────────────────── */}
        {timelineOpen && snapshots.length > 0 && (
          <div
            className="fixed inset-0 z-50 bg-background flex flex-col"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-background/95 backdrop-blur shrink-0"
              style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
            >
              <button
                onClick={() => { setIsPlaying(false); setTimelineOpen(false); }}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-base leading-tight">Evolução da planta</h2>
                <p className="text-xs text-muted-foreground truncate">
                  {format(new Date(snapshots[safeTimelineIndex].date), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                  {' · '}
                  <span style={{ color: TECHNIQUE_CONFIGS[normalizeTechniqueName(snapshots[safeTimelineIndex].technique) as TechniqueId]?.color ?? '#6b7280' }}>
                    {snapshots[safeTimelineIndex].technique}
                  </span>
                </p>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {safeTimelineIndex + 1} / {snapshots.length}
              </span>
            </div>

            {/* Mapa da planta — snapshot estático */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <PlantNodeMap
                key={safeTimelineIndex}
                staticNodes={snapshots[safeTimelineIndex].nodes}
                compact={false}
                viewMode="top"
              />
            </div>

            {/* Controles inferiores */}
            <div
              className="shrink-0 border-t border-border/40 bg-background/95 backdrop-blur px-4 pt-3"
              style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
            >
              {/* Indicadores de passo */}
              <div className="flex items-center justify-center gap-1.5 mb-3">
                {snapshots.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setIsPlaying(false); setTimelineIndex(i); }}
                    className="transition-all duration-200"
                    style={{
                      width:  i === safeTimelineIndex ? 20 : 6,
                      height: 6,
                      borderRadius: 3,
                      background: i === safeTimelineIndex
                        ? (TECHNIQUE_CONFIGS[normalizeTechniqueName(snapshots[i].technique) as TechniqueId]?.color ?? 'hsl(var(--primary))')
                        : 'hsl(var(--muted))',
                    }}
                  />
                ))}
              </div>

              {/* Botões ◀ Play/Pause ▶ */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => { setIsPlaying(false); setTimelineIndex(i => Math.max(0, i - 1)); }}
                  disabled={safeTimelineIndex === 0}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-muted disabled:opacity-30 hover:bg-muted/80 active:scale-95 transition-all"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <button
                  onClick={() => {
                    if (safeTimelineIndex >= snapshots.length - 1) {
                      setTimelineIndex(0);
                      setIsPlaying(true);
                    } else {
                      setIsPlaying(p => !p);
                    }
                  }}
                  className="w-14 h-14 rounded-full flex items-center justify-center bg-primary text-primary-foreground shadow-lg active:scale-95 transition-all"
                >
                  {isPlaying
                    ? <Pause className="w-6 h-6" />
                    : <Play  className="w-6 h-6 fill-primary-foreground" />
                  }
                </button>

                <button
                  onClick={() => { setIsPlaying(false); setTimelineIndex(i => Math.min(snapshots.length - 1, i + 1)); }}
                  disabled={safeTimelineIndex === snapshots.length - 1}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-muted disabled:opacity-30 hover:bg-muted/80 active:scale-95 transition-all"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Confirmação de saída do sandbox ────────────────────────────── */}
        <Sheet open={exitConfirmOpen} onOpenChange={open => { if (!open) setExitConfirmOpen(false); }}>
          <SheetContent side="bottom" className="rounded-t-2xl pb-8" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
            {/* Resumo da sessão */}
            <div className="mb-4">
              <p className="text-sm font-semibold mb-1">Sessão de edição</p>
              <p className="text-xs text-muted-foreground">
                {sessionTechniques.length} técnica{sessionTechniques.length !== 1 ? 's' : ''} aplicada{sessionTechniques.length !== 1 ? 's' : ''} nesta sessão
              </p>
            </div>
            {/* Lista de técnicas */}
            <div className="space-y-1 mb-5 max-h-48 overflow-y-auto">
              {/* Agrupa por técnica */}
              {Object.entries(
                sessionTechniques.reduce<Record<string, string[]>>((acc, { technique, nodeLabel }) => {
                  if (!acc[technique]) acc[technique] = [];
                  if (nodeLabel) acc[technique].push(nodeLabel);
                  return acc;
                }, {}),
              ).map(([tech, labels]) => {
                const techId = normalizeTechniqueName(tech) as TechniqueId | null;
                const cfg    = techId ? TECHNIQUE_CONFIGS[techId] : null;
                return (
                  <div key={tech} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/40">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cfg?.color ?? '#6b7280' }} />
                    <span className="text-sm font-medium flex-1">{tech}</span>
                    <span className="text-xs text-muted-foreground">
                      ×{labels.length}{labels.length > 0 ? ` · ${labels.join(', ')}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Ações */}
            <div className="space-y-2">
              <button
                onClick={handleSaveSession}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm justify-center active:scale-[0.98] transition-all"
              >
                <Save className="w-4 h-4" />
                Salvar sessão e sair
              </button>
              <button
                onClick={handleDiscardSession}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/40 text-sm text-muted-foreground justify-center hover:border-border active:scale-[0.98] transition-all"
              >
                Descartar alterações
              </button>
            </div>
          </SheetContent>
        </Sheet>

        {/* ── Stats ─────────────────────────────────────────────────────── */}
        {(stats?.total ?? 0) > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border/40 bg-card px-3 py-2.5">
              <p className="text-2xl font-bold text-foreground">{stats?.total ?? 0}</p>
              <p className="text-xs text-muted-foreground">Sessões no total</p>
            </div>
            <div className="rounded-xl border border-border/40 bg-card px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground mb-1">Técnicas usadas</p>
              <div className="flex flex-wrap gap-1">
                {topTechniques.map(([tech, count]) => {
                  const cfg = TECHNIQUE_CONFIGS[normalizeTechniqueName(tech) as TechniqueId];
                  return (
                    <span
                      key={tech}
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: cfg?.color + "28", color: cfg?.color ?? "#666" }}
                    >
                      {tech} ×{count}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Ver evolução (quando há 2+ snapshots) ──────────────────────── */}
        {snapshots.length >= 2 && (
          <button
            onClick={() => { setTimelineIndex(0); setIsPlaying(false); setTimelineOpen(true); }}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 text-emerald-500 font-semibold text-sm active:scale-[0.98] transition-transform hover:bg-emerald-500/10"
          >
            <Play className="w-4 h-4 fill-emerald-500" />
            Ver evolução da planta
          </button>
        )}

      </div>
    </div>
  );
}
