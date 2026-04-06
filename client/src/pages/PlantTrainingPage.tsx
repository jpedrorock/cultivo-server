import { useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  Scissors,
  Check,
  Loader2,
  Sprout,
  Trash2,
  Maximize2,
  X,
  Save,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import PlantNodeMap from "@/components/PlantNodeMap";
import {
  TECHNIQUE_CONFIGS,
  normalizeTechniqueName,
  type TechniqueId,
} from "@/features/training/techniqueConfigs";

// ── Vigor indicator ──────────────────────────────────────────────────────────
function VigorDots({ vigor }: { vigor: "low" | "medium" | "high" | null }) {
  const map = {
    low:    { dots: 1, color: "bg-red-500",     label: "Baixo" },
    medium: { dots: 2, color: "bg-yellow-500",  label: "Médio" },
    high:   { dots: 3, color: "bg-emerald-500", label: "Alto" },
  };
  if (!vigor) return <span className="text-xs text-muted-foreground">—</span>;
  const cfg = map[vigor];
  return (
    <span className="flex items-center gap-1">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`w-2 h-2 rounded-full ${n <= cfg.dots ? cfg.color : "bg-muted"}`}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-0.5">{cfg.label}</span>
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PlantTrainingPage() {
  const [, params]  = useRoute("/plants/:id/training");
  const [, navigate] = useLocation();
  const plantId = params?.id ? parseInt(params.id, 10) : null;

  // Confirm result state (inline on history item)
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [actualTops,   setActualTops]   = useState(0);
  const [vigor, setVigor] = useState<"low" | "medium" | "high">("medium");

  // Data
  const { data: plant } = trpc.plants.getById.useQuery(
    { id: plantId! },
    { enabled: !!plantId },
  );
  const { data: logs = [], isLoading, refetch } = trpc.plantLST.list.useQuery(
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
    },
  });
  const updateMutation = trpc.plantLST.update.useMutation({
    onSuccess: () => {
      toast.success("Resultado confirmado!");
      setConfirmingId(null);
      refetch();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
  const clearLogsMutation = trpc.plantLST.clearLogs.useMutation({
    onSuccess: () => {
      refetch();
      utils.plantLST.stats.invalidate({ plantId: plantId! });
    },
    onError: (e) => toast.error(`Erro ao apagar histórico: ${e.message}`),
  });
  const deleteLogMutation = trpc.plantLST.deleteLog.useMutation({
    onSuccess: () => {
      refetch();
      utils.plantLST.stats.invalidate({ plantId: plantId! });
      toast.success("Registro apagado");
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

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

  // ── Salvar sessão: cria os logs e fecha ───────────────────────────────────
  function handleSaveSession() {
    if (!plantId) return;
    setExitConfirmOpen(false);
    // Cria um log por técnica aplicada durante a sessão
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

  function handleConfirmResult(logId: number) {
    if (!plantId) return;
    updateMutation.mutate({
      id: logId,
      plantId,
      actualResult: {
        actualTops,
        vigor,
        confirmedAt: new Date().toISOString(),
      },
    });
  }

  const [mapFullscreen,    setMapFullscreen]    = useState(false);
  const [exitConfirmOpen,  setExitConfirmOpen]  = useState(false);
  // Técnicas aplicadas nesta sessão do sandbox
  const [sessionTechniques, setSessionTechniques] = useState<{ technique: string; nodeLabel: string }[]>([]);
  // Sinaliza ao PlantNodeMap para NÃO salvar no unmount (sessão descartada)
  const sandboxCancelRef = useRef(false);

  // Stats chips
  const topTechniques = Object.entries(stats?.byTechnique ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  if (!plantId) return null;

  // ── Normal view ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-24">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/40 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/plants/${plantId}`)}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-base leading-tight truncate">Treinamentos</h1>
          {plant?.name && (
            <p className="text-xs text-muted-foreground truncate">{plant.name}</p>
          )}
        </div>
      </header>

      <div className="px-4 pt-4 space-y-5">

        {/* ── Mapa de nós da planta ──────────────────────────────────────── */}
        <div className="rounded-2xl border border-border/40 bg-card overflow-visible">
          <div className="px-3 pt-3 pb-1 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Mapa da planta
            </p>
            <button
              onClick={openSandbox}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Abrir em tela cheia"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* Preview compacto (desmontado quando fullscreen estiver aberto) */}
          {!mapFullscreen && (
            <>
              <PlantNodeMap
                plantId={plantId}
                compact
                onTechniqueApplied={handleTechniqueApplied}
                onResetStructure={handleResetStructure}
              />
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
              {/* Badge de técnicas aplicadas na sessão */}
              {sessionTechniques.length > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                  {sessionTechniques.length} ação{sessionTechniques.length > 1 ? 'ões' : ''}
                </span>
              )}
            </div>
            {/* Canvas com pan/zoom — overflow:hidden é intencional */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <PlantNodeMap
                plantId={plantId}
                cancelSaveRef={sandboxCancelRef}
                onTechniqueApplied={handleTechniqueApplied}
                onResetStructure={handleResetStructure}
              />
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

        {/* ── Histórico ─────────────────────────────────────────────────── */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
            Histórico
          </p>

          {isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && logs.length === 0 && (
            <div className="flex flex-col items-center py-12 gap-3 text-muted-foreground">
              <Sprout className="w-10 h-10 opacity-30" />
              <p className="text-sm">Nenhum treinamento registrado</p>
              <p className="text-xs opacity-60">Aplique uma técnica na planta acima</p>
            </div>
          )}

          <Accordion type="single" collapsible className="space-y-2">
            {(logs as any[]).map((log) => {
              const techId  = normalizeTechniqueName(log.technique);
              const cfg     = techId ? TECHNIQUE_CONFIGS[techId] : null;
              const isConf  = confirmingId === log.id;
              const actual  = log.actualResult as {
                actualTops: number;
                vigor: "low" | "medium" | "high";
                confirmedAt: string;
              } | null;

              return (
                <AccordionItem
                  key={log.id}
                  id={`log-${log.id}`}
                  value={`log-${log.id}`}
                  className="border border-border/40 rounded-2xl px-4 overflow-hidden bg-card"
                >
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3 text-left w-full">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: cfg?.color ?? "#6b7280" }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">{log.technique}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(log.logDate), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                        </div>
                      </div>
                      {log.response && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                          {log.response}
                        </span>
                      )}
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="pb-4 pt-0 space-y-3">
                    {/* Apagar registro */}
                    <div className="flex justify-end">
                      <button
                        onClick={() => {
                          if (plantId) deleteLogMutation.mutate({ id: log.id, plantId });
                        }}
                        disabled={deleteLogMutation.isPending}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3 h-3" />
                        Apagar registro
                      </button>
                    </div>
                    {/* Fotos */}
                    {(log.beforePhotoUrl || log.afterPhotoUrl) && (
                      <div className="flex gap-2">
                        {log.beforePhotoUrl && (
                          <div className="flex-1 rounded-xl overflow-hidden aspect-square bg-muted/30">
                            <img src={log.beforePhotoUrl} alt="Antes" className="w-full h-full object-cover" loading="lazy" />
                            <p className="text-[9px] text-center text-muted-foreground py-0.5 bg-muted/40">Antes</p>
                          </div>
                        )}
                        {log.afterPhotoUrl && (
                          <div className="flex-1 rounded-xl overflow-hidden aspect-square bg-muted/30">
                            <img src={log.afterPhotoUrl} alt="Depois" className="w-full h-full object-cover" loading="lazy" />
                            <p className="text-[9px] text-center text-muted-foreground py-0.5 bg-muted/40">Depois</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Esperado */}
                    {log.techniqueConfig && (
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        {(log.techniqueConfig as any).expectedTops > 0 && (
                          <span>
                            Esperado:{" "}
                            <strong className="text-foreground">
                              {(log.techniqueConfig as any).expectedTops} tops
                            </strong>
                          </span>
                        )}
                        {(log.techniqueConfig as any).recoveryDays > 0 && (
                          <span>
                            Recuperação:{" "}
                            <strong className="text-foreground">
                              {(log.techniqueConfig as any).recoveryDays}d
                            </strong>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Resultado confirmado */}
                    {actual && !isConf && (
                      <div className="flex items-center gap-3 p-2.5 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        <div className="flex-1 text-xs space-y-0.5">
                          {actual.actualTops > 0 && (
                            <p>Real: <strong>{actual.actualTops} tops</strong></p>
                          )}
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">Vigor:</span>
                            <VigorDots vigor={actual.vigor} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Notas */}
                    {log.notes && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{log.notes}</p>
                    )}

                    {/* Confirmar resultado */}
                    {!actual && !isConf && (
                      <button
                        onClick={() => {
                          setConfirmingId(log.id);
                          setActualTops((log.techniqueConfig as any)?.expectedTops ?? 0);
                          setVigor("medium");
                        }}
                        className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Confirmar resultado real
                      </button>
                    )}

                    {isConf && (
                      <div className="space-y-3 p-3 rounded-xl bg-muted/40 border border-border/40">
                        <p className="text-xs font-semibold">Confirmar resultado</p>
                        {cfg && cfg.expectedTops > 0 && (
                          <div className="space-y-1">
                            <Label className="text-xs">Tops reais nascidos</Label>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={actualTops}
                              onChange={(e) => setActualTops(Number(e.target.value))}
                              className="w-full px-3 py-1.5 border rounded-lg bg-background text-sm"
                            />
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label className="text-xs">Vigor da recuperação</Label>
                          <div className="flex gap-2">
                            {(["low", "medium", "high"] as const).map((v) => (
                              <button
                                key={v}
                                onClick={() => setVigor(v)}
                                className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                                  vigor === v
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "border-border hover:border-foreground/30"
                                }`}
                              >
                                {v === "low" ? "Baixo" : v === "medium" ? "Médio" : "Alto"}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 text-xs"
                            disabled={updateMutation.isPending}
                            onClick={() => handleConfirmResult(log.id)}
                          >
                            {updateMutation.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <Check className="w-3 h-3 mr-1" />
                            )}
                            Confirmar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => setConfirmingId(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      </div>
    </div>
  );
}
