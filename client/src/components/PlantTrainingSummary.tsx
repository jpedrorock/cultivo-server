import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Sprout, Loader2, Maximize2, X, Save, LayoutGrid, Boxes,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "sonner";
import { normalizeTechniqueName, TECHNIQUE_CONFIGS, type TechniqueId } from "@/features/training/techniqueConfigs";
import PlantNodeMap from "@/components/PlantNodeMap";
import type { PlantGraphNode } from "@/features/cannaprune/plantGraph";

interface Props {
  plantId: number;
}

export default function PlantTrainingSummary({ plantId }: Props) {
  const [, navigate] = useLocation();
  const { data: logs = [], isLoading, refetch } = trpc.plantLST.list.useQuery({ plantId });
  trpc.plantLST.stats.useQuery({ plantId });
  const utils = trpc.useUtils();

  // ── Sandbox ───────────────────────────────────────────────────────────────
  const [sandboxOpen,       setSandboxOpen]       = useState(false);
  const [exitConfirmOpen,   setExitConfirmOpen]   = useState(false);
  const [sessionTechniques, setSessionTechniques] = useState<{ technique: string; nodeLabel: string }[]>([]);
  const cancelSaveRef  = useRef(false);
  const nodeSnapshotRef = useRef<PlantGraphNode[]>([]);

  const createMutation = trpc.plantLST.create.useMutation({
    onSuccess: () => {
      refetch();
      utils.plantLST.stats.invalidate({ plantId });
      utils.plantLST.list.invalidate({ plantId });
    },
    onError: (e) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  const clearLogsMutation = trpc.plantLST.clearLogs.useMutation({
    onSuccess: () => {
      refetch();
      utils.plantLST.stats.invalidate({ plantId });
    },
  });

  function openSandbox() {
    cancelSaveRef.current = false;
    setSessionTechniques([]);
    setSandboxOpen(true);
  }

  function handleSandboxClose() {
    if (sessionTechniques.length > 0) {
      setExitConfirmOpen(true);
    } else {
      setSandboxOpen(false);
    }
  }

  function handleSaveSession() {
    setExitConfirmOpen(false);
    const snapshot = nodeSnapshotRef.current.length > 0
      ? JSON.stringify(nodeSnapshotRef.current)
      : undefined;
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
    setSandboxOpen(false);
  }

  function handleDiscardSession() {
    cancelSaveRef.current = true;
    setExitConfirmOpen(false);
    setSessionTechniques([]);
    setSandboxOpen(false);
    setTimeout(() => { cancelSaveRef.current = false; }, 500);
  }

  function handleTechniqueApplied(technique: string, nodeLabel: string) {
    setSessionTechniques(prev => [...prev, { technique, nodeLabel }]);
  }

  function handleResetStructure(clearHistory: boolean) {
    if (clearHistory) clearLogsMutation.mutate({ plantId });
  }

  const recentLogs = (logs as any[]).slice(0, 3);

  return (
    <div className="space-y-4 pb-24">

      {/* ── Sandbox overlay ───────────────────────────────────────────────── */}
      {sandboxOpen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
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
              <h2 className="font-semibold text-base leading-tight">Editor de treinamento</h2>
            </div>
            {sessionTechniques.length > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                {sessionTechniques.length} ação{sessionTechniques.length > 1 ? 'ões' : ''}
              </span>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <PlantNodeMap
              plantId={plantId}
              cancelSaveRef={cancelSaveRef}
              nodeSnapshotRef={nodeSnapshotRef}
              onTechniqueApplied={handleTechniqueApplied}
              onResetStructure={handleResetStructure}
            />
          </div>
        </div>
      )}

      {/* ── Exit confirm sheet ────────────────────────────────────────────── */}
      <Sheet open={exitConfirmOpen} onOpenChange={open => { if (!open) setExitConfirmOpen(false); }}>
        <SheetContent side="bottom" className="rounded-t-2xl" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
          <div className="mb-4">
            <p className="text-sm font-semibold mb-1">Sessão de edição</p>
            <p className="text-xs text-muted-foreground">
              {sessionTechniques.length} técnica{sessionTechniques.length !== 1 ? 's' : ''} aplicada{sessionTechniques.length !== 1 ? 's' : ''} nesta sessão
            </p>
          </div>
          <div className="space-y-1 mb-5 max-h-40 overflow-y-auto">
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
                  <span className="text-xs text-muted-foreground">×{labels.length}</span>
                </div>
              );
            })}
          </div>
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

      {/* ── Mapa de nós compacto ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
            Mapa da planta
          </p>
          <button
            onClick={openSandbox}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Abrir editor 2D rápido"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <PlantNodeMap plantId={plantId} compact onCompactTap={openSandbox} />
        <div className="grid grid-cols-2 gap-px border-t border-border/20 bg-border/20">
          <button
            onClick={() => navigate(`/plants/${plantId}/training?sandbox=1&view=top`)}
            className="py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 bg-card hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Editar 2D
          </button>
          <button
            onClick={() => navigate(`/plants/${plantId}/training?sandbox=1&view=3d`)}
            className="py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 bg-card hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 transition-colors"
          >
            <Boxes className="w-3.5 h-3.5" />
            Editar 3D
          </button>
        </div>
      </div>

      {/* ── Histórico recente ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <h3 className="text-sm font-semibold">Histórico de Treinos</h3>
          {(logs as any[]).length > 0 && (
            <span className="text-xs text-muted-foreground">{(logs as any[]).length} registros</span>
          )}
        </div>

        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && (logs as any[]).length === 0 && (
          <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
            <Sprout className="w-8 h-8 opacity-30" />
            <p className="text-sm">Nenhum treinamento ainda</p>
          </div>
        )}

        {recentLogs.map((log: any) => {
          const techId = normalizeTechniqueName(log.technique);
          const cfg = techId ? TECHNIQUE_CONFIGS[techId as TechniqueId] : null;
          return (
            <div
              key={log.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-border/20 last:border-b-0"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: cfg?.color ?? "#6b7280" }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{log.technique}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(log.logDate), "dd/MM/yyyy", { locale: ptBR })}
                  {log.response && <> · {log.response}</>}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
