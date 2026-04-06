/**
 * PlantNodeMap — Editor geométrico de nós com pan / zoom
 *
 * - Só círculos e linhas (sem vaso, folhas ou decoração)
 * - Pan: arrastar com 1 dedo/mouse
 * - Zoom: pinch (2 dedos) ou scroll de mouse, botões +/−/fit
 * - Menu flutuante position:fixed — nunca cortado por overflow
 * - LST desloca o galho + TODOS os filhos (layout dependente)
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  PlantGraphNode, LayoutNode, GraphAction,
  createInitialGraph, isLegacyFormat,
  applyTopping, applyFIM, applyLST, applySuperCrop,
  growPlant, addLateralBranch, removeSubtree,
  getAvailableActions, getPlantStats, computeLayout,
  resolveEdgeState, setEdgeRecovering, setEdgeDefoliated, setEdgeActive,
} from "@/features/cannaprune/plantGraph";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Scissors, Zap, Anchor, Leaf, ArrowUp, GitBranch,
  Trash2, Undo2, Redo2, RotateCcw, Save, Loader2, X,
  ZoomIn, ZoomOut, Maximize2,
} from "lucide-react";

// ── Paleta ────────────────────────────────────────────────────────────────────

const NODE_COLOR = {
  root:        { ring: '#4ade80', bg: '#071209', text: '#4ade80' },
  node:        { ring: '#22c55e', bg: '#071209', text: '#86efac' },
  top:         { ring: '#4ade80', fill: '#0d2010' },    // triângulo ativo — verde
  topNew:      { ring: '#fbbf24', fill: '#1a1000' },    // pós-topping — amarelo
  topFimmed:   { ring: '#fb923c', fill: '#1a0c00' },    // pós-fim — laranja
  topped:      { ring: '#fbbf24', bg: '#140d00', text: '#fde68a' },
  fimmed:      { ring: '#fb923c', bg: '#140800', text: '#fed7aa' },
  lst:         { ring: '#818cf8', bg: '#0c0b1f', text: '#c7d2fe' },
  lstDone:     { ring: '#22c55e', bg: '#071209', text: '#86efac' }, // LST recuperado
  sc:          { ring: '#c084fc', bg: '#100a1f', text: '#e9d5ff' },
};

const LST_RECOVERY_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function isLSTRecovered(n: PlantGraphNode): boolean {
  if (n.state !== 'lst' || !n.lstAppliedAt) return false;
  return Date.now() - new Date(n.lstAppliedAt).getTime() > LST_RECOVERY_MS;
}

// Tipo de renderização visual do nó
type NodeVisual =
  | 'top'      // top ativo nativo → bola verde com ★
  | 'top-new'  // top ativo pós-topping → bola amarela com ★
  | 'top-fim'  // top ativo pós-fim → bola laranja com ★
  | 'circle';  // tudo o mais → círculo

function getNodeVisual(n: PlantGraphNode, parentState?: PlantGraphNode['state']): NodeVisual {
  if (n.type === 'top' && n.state === 'active') {
    if (parentState === 'topped') return 'top-new';
    if (parentState === 'fimmed') return 'top-fim';
    return 'top';
  }
  return 'circle';
}

function getCircleColor(n: PlantGraphNode) {
  if (n.state === 'topped')        return NODE_COLOR.topped;
  if (n.state === 'fimmed')        return NODE_COLOR.fimmed;
  if (n.state === 'lst')           return isLSTRecovered(n) ? NODE_COLOR.lstDone : NODE_COLOR.lst;
  if (n.state === 'super-cropped') return NODE_COLOR.sc;
  if (n.type  === 'root')          return NODE_COLOR.node; // raiz = círculo verde
  return NODE_COLOR.node;
}

function getCircleLabel(n: PlantGraphNode): string {
  if (n.type === 'root')           return '↑';
  if (n.state === 'topped')        return '✂';
  if (n.state === 'fimmed')        return '~';
  if (n.state === 'lst')           return isLSTRecovered(n) ? String(n.nodeNumber) : '〰';
  if (n.state === 'super-cropped') return '↑';  // seta roxa = recovery
  return String(n.nodeNumber);
}

function getEdgeColor(n: PlantGraphNode, isSelected: boolean): string {
  if (isSelected) return '#60a5fa';
  const es = resolveEdgeState(n);
  if (es === 'defoliated') return '#4b5563';   // cinza
  if (es === 'recovering') return '#3b82f6';   // azul recuperação
  if (n.state === 'topped')        return '#92400e';
  if (n.state === 'fimmed')        return '#9a3412';
  if (n.state === 'lst')           return '#3730a3';
  if (n.state === 'super-cropped') return '#6b21a8';
  return '#14532d';
}

function getRadius(n: PlantGraphNode, compact = false): number {
  const base = n.type === 'root' ? 14 : n.type === 'top' ? 18 : 17;
  return compact ? Math.round(base * 0.72) : base;
}

// ── Menu de ações ─────────────────────────────────────────────────────────────

const ACTION_META: Record<GraphAction, {
  label: string; shortDesc: string; color: string;
  Icon: React.ElementType; destructive?: boolean; separator?: boolean;
}> = {
  topping:      { label: 'Topping',    shortDesc: '→ 2 topos',       color: '#fbbf24', Icon: Scissors },
  fim:          { label: 'FIM',        shortDesc: '→ 3–4 brotos',    color: '#fb923c', Icon: Scissors },
  grow:         { label: 'Crescer',    shortDesc: '+ nó acima',      color: '#4ade80', Icon: ArrowUp  },
  'add-branch': { label: '+ Galho',   shortDesc: 'ramo lateral',    color: '#34d399', Icon: GitBranch },
  lst:          { label: 'LST',        shortDesc: 'inclina + filhos',color: '#818cf8', Icon: Anchor   },
  'super-crop': { label: 'Super Crop',shortDesc: 'dobra o caule',   color: '#c084fc', Icon: Zap      },
  remove:       { label: 'Remover',    shortDesc: 'nó + filhos',     color: '#f87171', Icon: Trash2,
                  destructive: true, separator: true },
};

const ACTION_ORDER: GraphAction[] = ['topping','fim','grow','add-branch','lst','super-crop','remove'];

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_UNDO          = 12;
const SVG_MIN_H         = 380;
const SVG_MIN_H_COMPACT = 220;

// ── Viewport (pan/zoom) ───────────────────────────────────────────────────────

interface VP { x: number; y: number; scale: number }
const DEFAULT_VP: VP = { x: 0, y: 0, scale: 1 };

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  plantId?:            number;
  compact?:            boolean;
  /** Nós estáticos para visualização de snapshot (sem DB, sem interação) */
  staticNodes?:        PlantGraphNode[];
  /** Ref populado pelo PlantNodeMap com os nós atuais (para capturar snapshot ao salvar) */
  nodeSnapshotRef?:    React.MutableRefObject<PlantGraphNode[]>;
  /** Se `current === true` ao desmontar, o save automático é cancelado (ex: usuário descartou a sessão) */
  cancelSaveRef?:      React.MutableRefObject<boolean>;
  onTechniqueApplied?: (technique: string, nodeLabel: string) => void;
  onResetStructure?:   (clearHistory: boolean) => void;
}

function Chip({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm font-bold tabular-nums" style={{ color }}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ── NodeActionMenu — componente de módulo (nunca recriado durante render) ─────
// Motivo: componentes definidos dentro de outro componente/IIFE recebem um
// tipo novo a cada render → React os desmonta imediatamente → conteúdo vazio.

interface NodeActionMenuProps {
  selectedNode:     LayoutNode;
  availableActions: GraphAction[];
  onClose:   () => void;
  onAction:  (a: GraphAction) => void;
}

const PODA_ACTIONS: GraphAction[] = ['topping', 'fim'];
const VEGA_ACTIONS: GraphAction[] = ['grow', 'lst', 'super-crop', 'add-branch'];

function NodeActionMenu({
  selectedNode, availableActions, onClose, onAction,
}: NodeActionMenuProps) {
  const [page, setPage] = useState<'main' | 'poda' | 'vega'>('main');

  const poda      = availableActions.filter(a => PODA_ACTIONS.includes(a));
  const vega      = availableActions.filter(a => VEGA_ACTIONS.includes(a));
  const hasRemove = availableActions.includes('remove');

  const nodeColor = selectedNode.type === 'top' && selectedNode.state === 'active'
    ? NODE_COLOR.top.ring : getCircleColor(selectedNode).ring;
  const nodeLabel = selectedNode.type === 'root' ? 'Raiz' : `N${selectedNode.nodeNumber}`;
  const nodeDesc  = selectedNode.type === 'root' ? '↑ caule'
    : selectedNode.type === 'top' && selectedNode.state === 'active' ? 'topo ▲'
    : selectedNode.type === 'internode' ? 'nó' : selectedNode.state;

  // Ações da subpágina atual
  const subActions = page === 'poda' ? poda : page === 'vega' ? vega : [];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[199]" onClick={onClose} />

      {/* Card */}
      <div
        className="fixed z-[200] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[260px] pointer-events-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden">

          {/* Cabeçalho */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20">
            {page !== 'main' ? (
              <button
                onClick={() => setPage('main')}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              >
                <span className="text-base leading-none">←</span>
              </button>
            ) : (
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: nodeColor }} />
            )}
            <div className="flex-1 min-w-0">
              <span className="text-sm font-bold">
                {page === 'main' ? nodeLabel : page === 'poda' ? '✂ Poda' : '🌿 Vega'}
              </span>
              {page === 'main' && (
                <span className="text-xs text-muted-foreground ml-1.5">{nodeDesc}</span>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Conteúdo — renderização direta sem slide/overflow */}
          <div className="py-1.5">
            {page === 'main' ? (
              <>
                {poda.length > 0 && (
                  <button
                    onClick={() => setPage('poda')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 active:bg-muted transition-colors"
                  >
                    <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/15">
                      <Scissors className="w-4 h-4 text-amber-400" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold block leading-tight">Poda</span>
                      <span className="text-xs text-muted-foreground truncate block">
                        {poda.map(a => ACTION_META[a].label).join(' · ')}
                      </span>
                    </div>
                    <span className="text-muted-foreground/40 text-base leading-none">›</span>
                  </button>
                )}
                {vega.length > 0 && (
                  <button
                    onClick={() => setPage('vega')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 active:bg-muted transition-colors"
                  >
                    <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/15">
                      <Leaf className="w-4 h-4 text-emerald-400" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold block leading-tight">Vega</span>
                      <span className="text-xs text-muted-foreground truncate block">
                        {vega.map(a => ACTION_META[a].label).join(' · ')}
                      </span>
                    </div>
                    <span className="text-muted-foreground/40 text-base leading-none">›</span>
                  </button>
                )}
                {hasRemove && (
                  <>
                    <div className="h-px bg-border/30 mx-4 my-1" />
                    <button
                      onClick={() => onAction('remove')}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-red-500/10 active:bg-red-500/20 transition-colors"
                    >
                      <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-red-500/10">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </span>
                      <div>
                        <span className="text-sm font-semibold text-red-400 block leading-tight">Remover</span>
                        <span className="text-xs text-muted-foreground">nó + filhos</span>
                      </div>
                    </button>
                  </>
                )}
              </>
            ) : (
              /* Subpágina: lista as ações direto */
              subActions.map(action => {
                const meta = ACTION_META[action];
                const Icon = meta.Icon;
                return (
                  <button
                    key={action}
                    onClick={() => onAction(action)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 active:bg-muted transition-colors"
                  >
                    <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: meta.color + '22' }}>
                      <Icon className="w-4 h-4" style={{ color: meta.color }} />
                    </span>
                    <div>
                      <span className="text-sm font-semibold block leading-tight">{meta.label}</span>
                      <span className="text-xs text-muted-foreground">{meta.shortDesc}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

        </div>
      </div>
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlantNodeMap({
  plantId, compact = false, staticNodes, nodeSnapshotRef,
  cancelSaveRef, onTechniqueApplied, onResetStructure,
}: Props) {
  // Modo estático: só renderiza o snapshot, sem DB, sem interação
  const isStatic = !!staticNodes;
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Histórico bidirecional (undo/redo) — usado dentro do sandbox
  const historyRef   = useRef<{ past: PlantGraphNode[][], future: PlantGraphNode[][] }>({ past: [], future: [] });
  // Snapshot tirado ao entrar no sandbox (para "Manter histórico")
  const masterSnapshotRef = useRef<PlantGraphNode[]>([]);
  // Ref sincronizado com nodes para uso em cleanup (save on exit)
  const nodesRef     = useRef<PlantGraphNode[]>([]);
  const skipRemote   = useRef(false);

  // Pan/zoom
  const [vp, setVP]          = useState<VP>(DEFAULT_VP);
  const gestureRef            = useRef<{
    ptrs: { id: number; x: number; y: number }[];
    moved: boolean;
  }>({ ptrs: [], moved: false });

  // Drag de nó individual
  const nodeGestureRef = useRef<{
    nodeId:    string;
    pointerId: number;
    startPX:   number;  // posição de tela no início do drag
    startPY:   number;
    origX:     number;  // posição canvas no início do drag
    origY:     number;
    moved:     boolean;
  } | null>(null);

  // Drag de handle de curva bezier
  const handleGestureRef = useRef<{
    edgeId:    string;   // id do nó filho (a aresta é parentId→id)
    handleNum: 1 | 2;   // handle 1 (perto do pai) ou 2 (perto do filho)
    pointerId: number;
    startPX:   number;
    startPY:   number;
    origDx:    number;
    origDy:    number;
  } | null>(null);

  // Ref com layoutNodes acessível dentro do useEffect de eventos nativos
  const layoutNodesRef = useRef<LayoutNode[]>([]);

  const [svgWidth,   setSvgWidth]   = useState(350);
  const [nodes,      setNodes]      = useState<PlantGraphNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [selectedEdgeId,  setSelectedEdgeId]  = useState<string | null>(null);
  const [edgeMenuOpen,    setEdgeMenuOpen]    = useState(false);
  const [resetOpen,  setResetOpen]  = useState(false);
  const [canUndo,    setCanUndo]    = useState(false);
  const [canRedo,    setCanRedo]    = useState(false);
  const [isLoading,  setIsLoading]  = useState(true);
  const [isSaving,   setIsSaving]   = useState(false);
  const [isSaved,    setIsSaved]    = useState(false);
  const savedTimer                  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── tRPC ───────────────────────────────────────────────────────────────────

  const { data: saved } = trpc.plantStructure.get.useQuery(
    { plantId },
    { enabled: !!plantId, refetchOnWindowFocus: false },
  );
  const saveMutation = trpc.plantStructure.save.useMutation({
    onSuccess: () => {
      setIsSaving(false);
      setIsSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setIsSaved(false), 2000);
    },
    onError: () => { setIsSaving(false); toast.error('Erro ao salvar'); },
  });

  // Mantido como no-op — o salvamento agora ocorre apenas ao sair do sandbox
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const scheduleAutoSave = useCallback((_ns: PlantGraphNode[]) => {}, []);

  const saveNow = useCallback((ns: PlantGraphNode[]) => {
    if (!plantId || isStatic) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setIsSaving(true);
    saveMutation.mutate({ plantId, nodes: ns });
  }, [plantId, isStatic, saveMutation]);

  useEffect(() => () => {
    if (saveTimer.current)  clearTimeout(saveTimer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  // ── Sincroniza nodesRef (acesso sem stale closure no cleanup) ───────────────
  nodesRef.current = nodes;

  // ── Salvar ao SAIR do sandbox (unmount do modo fullscreen) ──────────────────
  // Ref que aponta para a função de save mais recente (sem stale closure)
  const saveFnRef = useRef<() => void>(() => {});
  saveFnRef.current = () => {
    if (isStatic || compact || nodesRef.current.length === 0 || !plantId) return;
    if (cancelSaveRef?.current) return; // sessão descartada pelo pai
    saveMutation.mutate({ plantId, nodes: nodesRef.current });
  };
  useEffect(() => {
    if (compact) return;
    // Ao desmontar o modo fullscreen: salva silenciosamente
    return () => { saveFnRef.current(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  // ── Load ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Modo estático: usa o snapshot passado diretamente, sem DB
    if (isStatic) {
      setNodes(staticNodes!);
      setIsLoading(false);
      return;
    }
    if (saved === undefined) return;
    if (skipRemote.current) { skipRemote.current = false; return; }
    const raw = saved?.nodes as PlantGraphNode[] | undefined;
    const ns  = (raw?.length && !isLegacyFormat(raw)) ? raw : createInitialGraph();
    setNodes(ns);
    setIsLoading(false);
  }, [saved, isStatic, staticNodes]);

  // Sincroniza nodeSnapshotRef para que o pai possa capturar o estado atual
  if (nodeSnapshotRef) nodeSnapshotRef.current = nodes;

  // ── Resize (usado no modo compact) ──────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSvgWidth(el.clientWidth));
    ro.observe(el);
    setSvgWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // ── Layout ──────────────────────────────────────────────────────────────────

  const { layoutNodes, svgHeight, svgActualWidth } = useMemo(
    () => computeLayout(
      nodes, svgWidth,
      compact ? SVG_MIN_H_COMPACT : SVG_MIN_H,
      compact ? 50 : undefined,
    ),
    [nodes, svgWidth, compact],
  );

  const nodeMap = useMemo(() => {
    const m = new Map<string, LayoutNode>();
    layoutNodes.forEach(n => m.set(n.id, n));
    return m;
  }, [layoutNodes]);

  const stats = useMemo(() => getPlantStats(nodes), [nodes]);

  // Abre/fecha menu quando muda o nó selecionado
  useEffect(() => {
    setMenuOpen(!!selectedId);
  }, [selectedId]);

  // Refs sincronizadas para uso nos listeners nativos (sem stale closure)
  layoutNodesRef.current = layoutNodes;
  const vpRef              = useRef<VP>(DEFAULT_VP);
  vpRef.current            = vp;

  // ── Fit to view ──────────────────────────────────────────────────────────────

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el || layoutNodes.length === 0 || compact) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    if (!W || !H) return;
    const PAD = 64;
    const xs  = layoutNodes.map(n => n.x);
    const ys  = layoutNodes.map(n => n.y);
    const minX = Math.min(...xs) - 28;
    const maxX = Math.max(...xs) + 28;
    const minY = Math.min(...ys) - 28;
    const maxY = Math.max(...ys) + 28;
    const cW = (maxX - minX) || 1;
    const cH = (maxY - minY) || 1;
    const s  = Math.min((W - PAD * 2) / cW, (H - PAD * 2) / cH, 2.5);
    setVP({
      x: (W - cW * s) / 2 - minX * s,
      y: (H - cH * s) / 2 - minY * s,
      scale: s,
    });
  }, [layoutNodes, compact]);

  // Auto-fit + captura do master snapshot ao carregar no sandbox
  useEffect(() => {
    if (!isLoading && !compact && layoutNodes.length > 0) {
      requestAnimationFrame(fitToView);
      // Captura o estado atual como snapshot do "último salvamento master"
      masterSnapshotRef.current = nodes.map(n => ({ ...n }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, compact]);

  // ── Keyboard shortcuts: Ctrl+Z / Ctrl+Y ──────────────────────────────────────
  useEffect(() => {
    if (compact) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo(); }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  function zoomBy(factor: number) {
    const el = containerRef.current;
    if (!el) return;
    const cx = el.clientWidth  / 2;
    const cy = el.clientHeight / 2;
    setVP(v => {
      const ns = Math.max(0.15, Math.min(5, v.scale * factor));
      return { x: cx - (cx - v.x) * (ns / v.scale), y: cy - (cy - v.y) * (ns / v.scale), scale: ns };
    });
  }

  // ── Pan / Zoom event listeners ────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el || compact) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Element;

      // 1. Handle de bezier?
      const handleEl = target.closest('[data-handle]');
      if (handleEl) {
        const handleNum = Number(handleEl.getAttribute('data-handle')) as 1 | 2;
        const edgeId    = handleEl.getAttribute('data-edge-id')!;
        const child  = layoutNodesRef.current.find(n => n.id === edgeId)!;
        const parent = layoutNodesRef.current.find(n => n.id === child.parentId)!;
        if (child && parent) {
          const dy = child.y - parent.y;
          const t  = Math.abs(dy) * 0.45;
          const ctrl = (child as any).edgeCtrl ?? { dx1: 0, dy1: -t, dx2: 0, dy2: t };
          handleGestureRef.current = {
            edgeId, handleNum, pointerId: e.pointerId,
            startPX: e.clientX, startPY: e.clientY,
            origDx: handleNum === 1 ? ctrl.dx1 : ctrl.dx2,
            origDy: handleNum === 1 ? ctrl.dy1 : ctrl.dy2,
          };
        }
        return;
      }

      // 2. Nó?
      const nodeId = target.closest('[data-node-id]')?.getAttribute('data-node-id');
      if (nodeId) {
        const ln = layoutNodesRef.current.find(n => n.id === nodeId);
        if (ln) {
          setSelectedEdgeId(null);
          nodeGestureRef.current = {
            nodeId, pointerId: e.pointerId,
            startPX: e.clientX, startPY: e.clientY,
            origX: ln.x, origY: ln.y,
            moved: false,
          };
          return;
        }
      }

      // 3. Aresta (linha)? → abre menu de aresta
      const edgeIdAttr = target.closest('[data-edge-id]')?.getAttribute('data-edge-id');
      if (edgeIdAttr) {
        // se já estava selecionada, fecha o menu e deseleciona
        if (edgeIdAttr === selectedEdgeId) {
          setSelectedEdgeId(null);
          setEdgeMenuOpen(false);
        } else {
          setSelectedEdgeId(edgeIdAttr);
          setEdgeMenuOpen(true);
        }
        setSelectedId(null);
        setMenuOpen(false);
        return;
      }

      // 4. Canvas pan
      setSelectedEdgeId(null);
      setEdgeMenuOpen(false);
      gestureRef.current.ptrs.push({ id: e.pointerId, x: e.clientX, y: e.clientY });
      if (gestureRef.current.ptrs.length === 1) gestureRef.current.moved = false;
    }

    function onPointerMove(e: PointerEvent) {
      // ── Handle bezier ────────────────────────────────────────────────────────
      const hd = handleGestureRef.current;
      if (hd && hd.pointerId === e.pointerId) {
        const dxCanvas = (e.clientX - hd.startPX) / vpRef.current.scale;
        const dyCanvas = (e.clientY - hd.startPY) / vpRef.current.scale;
        setNodes(ns => ns.map(n => {
          if (n.id !== hd.edgeId) return n;
          const child  = layoutNodesRef.current.find(x => x.id === n.id)!;
          const parent = layoutNodesRef.current.find(x => x.id === n.parentId)!;
          const dy = child ? child.y - (parent?.y ?? 0) : 0;
          const t  = Math.abs(dy) * 0.45;
          const cur = (n as any).edgeCtrl ?? { dx1: 0, dy1: -t, dx2: 0, dy2: t };
          return {
            ...n,
            edgeCtrl: hd.handleNum === 1
              ? { ...cur, dx1: hd.origDx + dxCanvas, dy1: hd.origDy + dyCanvas }
              : { ...cur, dx2: hd.origDx + dxCanvas, dy2: hd.origDy + dyCanvas },
          };
        }));
        return;
      }

      // ── Drag de nó individual ───────────────────────────────────────────────
      const nd = nodeGestureRef.current;
      if (nd && nd.pointerId === e.pointerId) {
        const dxScreen = e.clientX - nd.startPX;
        const dyScreen = e.clientY - nd.startPY;
        if (!nd.moved && Math.hypot(dxScreen, dyScreen) > 5) {
          nd.moved = true;
          setSelectedId(null);
          setMenuOpen(false);
        }
        if (nd.moved) {
          // Converte delta de tela → delta de canvas usando vpRef (sem stale closure)
          const currentScale = vpRef.current.scale;
          const dxCanvas = dxScreen / currentScale;
          const dyCanvas = dyScreen / currentScale;
          setNodes(ns => ns.map(n =>
            n.id === nd.nodeId
              ? { ...n, posX: nd.origX + dxCanvas, posY: nd.origY + dyCanvas }
              : n,
          ));
        }
        return;
      }

      // ── Pan / pinch do canvas ───────────────────────────────────────────────
      const g   = gestureRef.current;
      const idx = g.ptrs.findIndex(p => p.id === e.pointerId);
      if (idx === -1) return;

      const prev = { ...g.ptrs[idx] };
      g.ptrs[idx] = { id: e.pointerId, x: e.clientX, y: e.clientY };

      if (g.ptrs.length === 1) {
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        if (!g.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
          g.moved = true;
          setSelectedId(null);
          setMenuOpen(false);
        }
        if (g.moved) setVP(v => ({ ...v, x: v.x + dx, y: v.y + dy }));

      } else if (g.ptrs.length === 2) {
        g.moved = true;
        const otherIdx = idx === 0 ? 1 : 0;
        const other    = g.ptrs[otherIdx];
        const oldDist  = Math.hypot(prev.x - other.x, prev.y - other.y);
        const newDist  = Math.hypot(g.ptrs[idx].x - other.x, g.ptrs[idx].y - other.y);
        if (oldDist < 1) return;
        const ratio = newDist / oldDist;
        const rect  = el.getBoundingClientRect();
        const cx    = (g.ptrs[0].x + g.ptrs[1].x) / 2 - rect.left;
        const cy    = (g.ptrs[0].y + g.ptrs[1].y) / 2 - rect.top;
        setVP(v => {
          const ns = Math.max(0.15, Math.min(5, v.scale * ratio));
          return { x: cx - (cx - v.x) * (ns / v.scale), y: cy - (cy - v.y) * (ns / v.scale), scale: ns };
        });
      }
    }

    function onPointerUp(e: PointerEvent) {
      // Handle bezier — sem auto-save, salva ao sair do sandbox
      if (handleGestureRef.current?.pointerId === e.pointerId) {
        handleGestureRef.current = null;
        return;
      }

      // Fim do drag de nó → marca aresta como recovering
      const nd = nodeGestureRef.current;
      if (nd && nd.pointerId === e.pointerId) {
        if (nd.moved) {
          // Marca a aresta do nó movido como recovering (linha azul por 5 dias)
          setNodes(ns => setEdgeRecovering(ns, nd.nodeId));
        }
        nodeGestureRef.current = null;
        return;
      }
      gestureRef.current.ptrs = gestureRef.current.ptrs.filter(p => p.id !== e.pointerId);
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect   = el.getBoundingClientRect();
      const cx     = e.clientX - rect.left;
      const cy     = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.13 : 1 / 1.13;
      setVP(v => {
        const ns = Math.max(0.15, Math.min(5, v.scale * factor));
        return { x: cx - (cx - v.x) * (ns / v.scale), y: cy - (cy - v.y) * (ns / v.scale), scale: ns };
      });
    }

    function onPointerCancel(e: PointerEvent) {
      handleGestureRef.current = null;
      nodeGestureRef.current = null;
      gestureRef.current.ptrs = gestureRef.current.ptrs.filter(p => p.id !== e.pointerId);
    }

    el.addEventListener('pointerdown',  onPointerDown);
    el.addEventListener('pointermove',  onPointerMove);
    el.addEventListener('pointerup',    onPointerUp);
    el.addEventListener('pointercancel',onPointerCancel);
    el.addEventListener('wheel',        onWheel, { passive: false });

    return () => {
      el.removeEventListener('pointerdown',  onPointerDown);
      el.removeEventListener('pointermove',  onPointerMove);
      el.removeEventListener('pointerup',    onPointerUp);
      el.removeEventListener('pointercancel',onPointerCancel);
      el.removeEventListener('wheel',        onWheel);
    };
  }, [compact]);

  // ── Undo / Redo / Reset ──────────────────────────────────────────────────────

  function clearHistory() {
    historyRef.current = { past: [], future: [] };
    setCanUndo(false);
    setCanRedo(false);
  }

  /** Empurra o estado ANTES da ação para o histórico e limpa o redo */
  function pushHistory(before: PlantGraphNode[]) {
    historyRef.current.past.push(before.map(n => ({ ...n })));
    historyRef.current.future = [];
    if (historyRef.current.past.length > MAX_UNDO) historyRef.current.past.shift();
    setCanUndo(true);
    setCanRedo(false);
  }

  function handleUndo() {
    const prev = historyRef.current.past.pop();
    if (!prev) return;
    // Empurra o estado atual para o futuro (redo)
    historyRef.current.future.unshift(nodes.map(n => ({ ...n })));
    setNodes(prev);
    setCanUndo(historyRef.current.past.length > 0);
    setCanRedo(true);
  }

  function handleRedo() {
    const next = historyRef.current.future.shift();
    if (!next) return;
    // Empurra o estado atual para o passado (undo)
    historyRef.current.past.push(nodes.map(n => ({ ...n })));
    setNodes(next);
    setCanRedo(historyRef.current.future.length > 0);
    setCanUndo(true);
  }

  /** "Manter histórico" — restaura o snapshot tirado ao entrar no sandbox */
  function handleRestoreSnapshot() {
    const snap = masterSnapshotRef.current;
    if (!snap.length) { toast.error('Nenhum snapshot disponível'); return; }
    skipRemote.current = true;
    clearHistory();
    setSelectedId(null);
    setMenuOpen(false);
    setResetOpen(false);
    setNodes(snap.map(n => ({ ...n })));
    toast.success('Estrutura restaurada ao estado anterior 🌱');
  }

  /** "Apagar tudo" — volta para planta nova e salva imediatamente */
  function handleClearAll(clearHistory_: boolean) {
    skipRemote.current = true;
    setResetOpen(false);
    clearHistory();
    setSelectedId(null);
    setMenuOpen(false);
    const fresh = createInitialGraph();
    setNodes(fresh);
    saveNow(fresh);
    onResetStructure?.(clearHistory_);
    toast.success(clearHistory_ ? 'Planta e histórico reiniciados 🌱' : 'Planta reiniciada 🌱');
  }

  // ── Apply action ─────────────────────────────────────────────────────────────

  function applyAction(action: GraphAction) {
    const nodeId = selectedId;
    setSelectedId(null);
    setMenuOpen(false);

    if (action === 'remove') {
      if (!nodeId) return;
      pushHistory(nodes);
      const res = removeSubtree(nodes, nodeId);
      if (res.error) {
        historyRef.current.past.pop();
        setCanUndo(historyRef.current.past.length > 0);
        toast.error(res.error);
        return;
      }
      setNodes(res.nodes);
      toast.success('Nó removido');
      return;
    }

    if (!nodeId) return;

    let res: { nodes: PlantGraphNode[]; newIds: string[]; error?: string };
    switch (action) {
      case 'topping':    res = applyTopping(nodes, nodeId);     break;
      case 'fim':        res = applyFIM(nodes, nodeId);         break;
      case 'lst':        res = applyLST(nodes, nodeId);         break;
      case 'super-crop': res = applySuperCrop(nodes, nodeId);   break;
      case 'grow':       res = growPlant(nodes, nodeId);        break;
      case 'add-branch': res = addLateralBranch(nodes, nodeId); break;
      default: return;
    }

    if (res.error) { toast.error(res.error); return; }

    pushHistory(nodes);
    const selNode = nodes.find(n => n.id === nodeId);
    setNodes(res.nodes);

    const techLabels: Partial<Record<GraphAction, string>> = {
      topping: 'Topping', fim: 'FIM', lst: 'LST',
      'super-crop': 'Super Cropping', grow: 'Crescimento', 'add-branch': 'Galho lateral',
    };
    if (techLabels[action]) onTechniqueApplied?.(techLabels[action]!, selNode ? `N${selNode.nodeNumber}` : '');

    const msgs: Partial<Record<GraphAction, string>> = {
      topping:      'Topping ✂ — estrutura acima cortada, 2 novos topos',
      fim:          'FIM ~ — até 4 brotos',
      lst:          '〰 LST — galho e filhos deslocados',
      'super-crop': '⚡ Super Cropping — caule dobrado (sem corte)',
      grow:         '🌱 Novo nó adicionado',
      'add-branch': '🌿 Galho lateral adicionado',
    };
    if (msgs[action]) toast.success(msgs[action]!);
  }

  // ── Edges ────────────────────────────────────────────────────────────────────

  const edges = useMemo(() => layoutNodes
    .filter(n => n.parentId && nodeMap.has(n.parentId))
    .map(n => {
      const parent = nodeMap.get(n.parentId!)!;
      const isSelected = n.id === selectedEdgeId;
      return {
        id:     n.id,
        node:   n,
        parent,
        color:  getEdgeColor(n, isSelected),
        dashed: n.state === 'lst',
        edgeState: resolveEdgeState(n),
      };
    }),
  [layoutNodes, nodeMap]);

  // ── Selected node ─────────────────────────────────────────────────────────────

  const selectedNode     = selectedId ? nodeMap.get(selectedId) ?? null : null;
  const availableActions = selectedNode
    ? ACTION_ORDER.filter(a => getAvailableActions(selectedNode).includes(a))
    : [];


  // ── Bezier helpers ────────────────────────────────────────────────────────────

  // Retorna controle efetivo da aresta (default = curva S suave)
  function getEdgeCtrl(child: LayoutNode, parent: LayoutNode): import('@/features/cannaprune/plantGraph').EdgeControl {
    if ((child as any).edgeCtrl) return (child as any).edgeCtrl;
    const dy = child.y - parent.y;
    const t  = Math.abs(dy) * 0.45;
    return { dx1: 0, dy1: -t, dx2: 0, dy2: t };
  }

  function bezierPath(parent: LayoutNode, child: LayoutNode): string {
    const c = getEdgeCtrl(child, parent);
    return `M ${parent.x} ${parent.y} C ${parent.x + c.dx1} ${parent.y + c.dy1} ${child.x + c.dx2} ${child.y + c.dy2} ${child.x} ${child.y}`;
  }

  // ── SVG content (shared between compact and pannable modes) ───────────────────

  function renderContent(strokeWidth: number) {
    return (
      <>
        {/* 1. Arestas bezier */}
        {edges.map(e => {
          const d          = bezierPath(e.parent, e.node);
          const isSelected = e.id === selectedEdgeId;
          const sw         = compact ? 1.5 : (isSelected ? 3 : e.edgeState === 'recovering' ? 2.5 : 2);
          return (
            <g key={`edge-${e.id}`}>
              {/* Glow azul para recovering */}
              {!compact && e.edgeState === 'recovering' && (
                <path d={d} fill="none" stroke="#3b82f6" strokeWidth={6} strokeLinecap="round" opacity={0.18} style={{ pointerEvents: 'none' }} />
              )}
              {/* Hit target invisível */}
              {!compact && (
                <path d={d} fill="none" stroke="transparent" strokeWidth={14}
                  data-edge-id={e.id}
                  style={{ cursor: 'pointer', pointerEvents: 'stroke' }} />
              )}
              {/* Linha visível */}
              <path
                d={d} fill="none"
                stroke={e.color}
                strokeWidth={sw}
                strokeDasharray={
                  e.edgeState === 'defoliated' ? '4 4'
                  : e.dashed ? '6 4'
                  : undefined
                }
                strokeLinecap="round"
                style={{ pointerEvents: 'none' }}
              />
              {/* Ponto indicador de seleção no meio da aresta */}
              {!compact && isSelected && (() => {
                const mx = (e.parent.x + e.node.x) / 2;
                const my = (e.parent.y + e.node.y) / 2;
                return <circle cx={mx} cy={my} r={4} fill="#60a5fa" opacity={0.8} style={{ pointerEvents: 'none' }} />;
              })()}
            </g>
          );
        })}

        {/* 1b. Handles da aresta selecionada */}
        {!compact && selectedEdgeId && (() => {
          const child  = layoutNodes.find(n => n.id === selectedEdgeId);
          const parent = child?.parentId ? layoutNodes.find(n => n.id === child.parentId) : null;
          if (!child || !parent) return null;
          const ctrl = getEdgeCtrl(child, parent);
          const cp1  = { x: parent.x + ctrl.dx1, y: parent.y + ctrl.dy1 };
          const cp2  = { x: child.x  + ctrl.dx2, y: child.y  + ctrl.dy2 };
          return (
            <>
              {/* Linhas tracejadas de âncora → handle */}
              <line x1={parent.x} y1={parent.y} x2={cp1.x} y2={cp1.y}
                stroke="#60a5fa" strokeWidth={0.8} strokeDasharray="3 2" opacity={0.45} style={{pointerEvents:'none'}} />
              <line x1={child.x}  y1={child.y}  x2={cp2.x} y2={cp2.y}
                stroke="#60a5fa" strokeWidth={0.8} strokeDasharray="3 2" opacity={0.45} style={{pointerEvents:'none'}} />
              {/* Handle 1 */}
              <circle cx={cp1.x} cy={cp1.y} r={5}
                fill="#1e40af" stroke="#93c5fd" strokeWidth={1.5}
                data-handle="1" data-edge-id={selectedEdgeId}
                style={{ cursor: 'move', pointerEvents: 'all' }} />
              {/* Handle 2 */}
              <circle cx={cp2.x} cy={cp2.y} r={5}
                fill="#1e40af" stroke="#93c5fd" strokeWidth={1.5}
                data-handle="2" data-edge-id={selectedEdgeId}
                style={{ cursor: 'move', pointerEvents: 'all' }} />
            </>
          );
        })()}

        {/* 2. Nós */}
        {layoutNodes.map(node => {
          const r          = getRadius(node, compact);
          const isSelected = node.id === selectedId;
          const parentNode = node.parentId ? nodeMap.get(node.parentId) : undefined;
          const visual     = getNodeVisual(node, parentNode?.state);
          const isTopBud = visual === 'top' || visual === 'top-new' || visual === 'top-fim';
          const sw       = isSelected ? 2.5 : strokeWidth;

          // Cores do top bud (bola com estrela)
          const topColor = visual === 'top-new' ? NODE_COLOR.topNew
                         : visual === 'top-fim' ? NODE_COLOR.topFimmed
                         : NODE_COLOR.top;

          // Círculo normal
          const cc  = getCircleColor(node);
          const lbl = getCircleLabel(node);
          const fs  = compact
            ? (lbl.length > 1 ? 7 : 9)
            : (lbl.length > 2 ? 9 : lbl.length > 1 ? 11 : 13);

          return (
            <g
              key={node.id}
              data-node-id={node.id}
              onClick={e => {
                e.stopPropagation();
                if (compact) return;
                if (gestureRef.current.moved) return;
                if (nodeGestureRef.current?.moved) return;
                if (selectedId === node.id) { setSelectedId(null); return; }
                setSelectedId(node.id);
              }}
              style={{ cursor: compact ? 'default' : 'move' }}
            >
              {isTopBud ? (
                <>
                  {/* Anel de seleção */}
                  {isSelected && (
                    <circle cx={node.x} cy={node.y} r={r + 5}
                      fill="none" stroke="#fff" strokeWidth={1.5} strokeOpacity={0.5} />
                  )}
                  {/* Bola do top bud */}
                  <circle
                    cx={node.x} cy={node.y} r={r}
                    fill={topColor.fill}
                    stroke={topColor.ring}
                    strokeWidth={sw}
                  />
                  {/* Estrela ★ */}
                  <text
                    x={node.x} y={node.y + 0.5}
                    textAnchor="middle" dominantBaseline="central"
                    fill={topColor.ring}
                    fontSize={Math.round(r * (compact ? 0.95 : 1.05))}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    ★
                  </text>
                  {/* Número lateral (modo full) */}
                  {!compact && (
                    <text
                      x={node.x + r + 3} y={node.y}
                      dominantBaseline="central"
                      fill={topColor.ring} fillOpacity={0.6} fontSize={8} fontWeight="600"
                      fontFamily="ui-monospace,'SF Mono',Menlo,monospace"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {node.nodeNumber}
                    </text>
                  )}
                </>
              ) : (
                <>
                  {/* Anel de seleção para círculo */}
                  {isSelected && (
                    <circle cx={node.x} cy={node.y} r={r + 5}
                      fill="none" stroke="#fff" strokeWidth={1.5} strokeOpacity={0.6} />
                  )}
                  {/* Círculo */}
                  <circle
                    cx={node.x} cy={node.y} r={r}
                    fill={cc.bg} stroke={cc.ring}
                    strokeWidth={sw}
                  />
                  {/* Label */}
                  <text
                    x={node.x} y={node.y}
                    textAnchor="middle" dominantBaseline="central"
                    fill={cc.text} fontSize={fs} fontWeight="700"
                    fontFamily="ui-monospace,'SF Mono',Menlo,monospace"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {lbl}
                  </text>
                  {/* Número lateral (modo full, não raiz) */}
                  {!compact && node.type !== 'root' && node.state !== 'super-cropped' && (
                    <text
                      x={node.x + r + 4} y={node.y}
                      dominantBaseline="central"
                      fill={cc.ring} fillOpacity={0.55} fontSize={8} fontWeight="600"
                      fontFamily="ui-monospace,'SF Mono',Menlo,monospace"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {node.nodeNumber}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full flex flex-col" style={{ height: compact ? 'auto' : '100%' }}>

      {/* ── Stats + controles ─────────────────────────────────────────────── */}
      {!compact && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30 shrink-0">
          <Chip value={stats.tops}       label="tops" color="#4ade80" />
          <div className="w-px h-3 bg-border/40" />
          <Chip value={stats.internodes} label="nós"  color="#86efac" />
          {stats.lst > 0 && (
            <><div className="w-px h-3 bg-border/40" /><Chip value={stats.lst} label="LST" color="#818cf8" /></>
          )}
          {stats.superCropped > 0 && (
            <><div className="w-px h-3 bg-border/40" /><Chip value={stats.superCropped} label="SC" color="#c084fc" /></>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {/* Indicador de save discreto */}
            <div className="w-6 h-6 flex items-center justify-center" title={isSaving ? 'Salvando…' : isSaved ? 'Salvo' : ''}>
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/50" />
              ) : isSaved ? (
                <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : null}
            </div>
            {(canUndo || canRedo) && (
              <div className="flex items-center gap-0.5">
                <button
                  onClick={handleUndo} disabled={!canUndo}
                  title="Desfazer (Ctrl+Z)"
                  className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleRedo} disabled={!canRedo}
                  title="Refazer (Ctrl+Y)"
                  className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <button onClick={() => setResetOpen(true)} title="Reiniciar" className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-red-500/20 hover:text-red-500 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Canvas ────────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="relative w-full"
        style={{
          flex:       compact ? undefined : '1 1 0',
          height:     compact ? SVG_MIN_H_COMPACT : undefined,
          overflow:   'hidden',
          touchAction:'none',
          cursor:     compact ? 'default' : 'grab',
          userSelect: 'none',
        }}
        onClick={() => { setSelectedId(null); setMenuOpen(false); }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center w-full h-full"
            style={{ minHeight: compact ? SVG_MIN_H_COMPACT : SVG_MIN_H }}>
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : compact ? (
          /* ── Compact: viewBox auto-fit — planta inteira sempre visível ── */
          (() => {
            const PAD = 20;
            const xs  = layoutNodes.map(n => n.x);
            const ys  = layoutNodes.map(n => n.y);
            const minX = (layoutNodes.length ? Math.min(...xs) : 0) - PAD;
            const minY = (layoutNodes.length ? Math.min(...ys) : 0) - PAD;
            const vbW  = (layoutNodes.length ? Math.max(...xs) - Math.min(...xs) : svgActualWidth) + PAD * 2;
            const vbH  = (layoutNodes.length ? Math.max(...ys) - Math.min(...ys) : svgHeight)      + PAD * 2;
            return (
              <svg
                width="100%"
                height={SVG_MIN_H_COMPACT}
                viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
                preserveAspectRatio="xMidYMid meet"
                style={{ display: 'block' }}
              >
                {renderContent(1.5)}
              </svg>
            );
          })()
        ) : (
          /* ── Full: SVG preenche container, conteúdo em <g transform> ── */
          <>
            <svg
              width="100%"
              height="100%"
              style={{ display: 'block', position: 'absolute', inset: 0 }}
            >
              {/* ── Grid de fundo ── */}
              <defs>
                <pattern id="grid-sm" width="24" height="24" patternUnits="userSpaceOnUse"
                  patternTransform={`translate(${vp.x % 24},${vp.y % 24}) scale(${vp.scale})`}>
                  <path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor"
                    strokeWidth={0.4} className="text-border/20" />
                </pattern>
                <pattern id="grid-lg" width="120" height="120" patternUnits="userSpaceOnUse"
                  patternTransform={`translate(${vp.x % 120},${vp.y % 120}) scale(${vp.scale})`}>
                  <rect width="120" height="120" fill="url(#grid-sm)" />
                  <path d="M 120 0 L 0 0 0 120" fill="none" stroke="currentColor"
                    strokeWidth={0.8} className="text-border/30" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid-lg)" />

              <g transform={`translate(${vp.x},${vp.y}) scale(${vp.scale})`}>
                {renderContent(2)}
              </g>
            </svg>

            {/* ── Controles de zoom (canto inferior direito) ── */}
            <div
              className="absolute bottom-4 right-4 flex flex-col gap-1 z-10"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => zoomBy(1.25)}
                title="Zoom in"
                className="w-8 h-8 rounded-lg bg-card border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted shadow-sm transition-colors"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={fitToView}
                title="Ajustar à tela"
                className="w-8 h-8 rounded-lg bg-card border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted shadow-sm transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => zoomBy(1 / 1.25)}
                title="Zoom out"
                className="w-8 h-8 rounded-lg bg-card border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted shadow-sm transition-colors"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* ── Dica ── */}
            <div className="absolute bottom-4 left-4 pointer-events-none select-none">
              <span className="text-[9px] text-muted-foreground/30">
                {selectedEdgeId && !edgeMenuOpen ? 'Arraste os handles · Clique na linha p/ menu' : 'Mova nós · Arraste o fundo · Pinch / Scroll'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Menu de ações (componente de módulo — sem IIFE) ── */}
      {selectedNode && menuOpen && !compact && (
        <NodeActionMenu
          selectedNode={selectedNode}
          availableActions={availableActions}
          onClose={() => { setSelectedId(null); setMenuOpen(false); }}
          onAction={applyAction}
        />
      )}

      {/* ── Menu de aresta (caule/galho) centralizado ── */}
      {selectedEdgeId && edgeMenuOpen && !compact && (() => {
        const edgeNode = nodeMap.get(selectedEdgeId);
        if (!edgeNode) return null;
        const es = resolveEdgeState(edgeNode);
        return (
          <>
            <div className="fixed inset-0 z-[199]"
              onClick={() => { setSelectedEdgeId(null); setEdgeMenuOpen(false); }} />
            <div
              className="fixed z-[200] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[240px] pointer-events-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: es === 'defoliated' ? '#6b7280' : es === 'recovering' ? '#3b82f6' : '#22c55e' }} />
                  <div className="flex-1">
                    <span className="text-sm font-bold">Caule</span>
                    <span className="text-xs text-muted-foreground ml-1.5">
                      {es === 'defoliated' ? '🍂 desfolhado'
                        : es === 'recovering' ? '💧 recuperando'
                        : '✅ ativo'}
                    </span>
                  </div>
                  <button
                    onClick={() => { setSelectedEdgeId(null); setEdgeMenuOpen(false); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* Ações */}
                <div className="py-1.5">
                  {/* Desfolha */}
                  {es !== 'defoliated' ? (
                    <button
                      onClick={() => {
                        pushHistory(nodes);
                        const ns = setEdgeDefoliated(nodes, selectedEdgeId);
                        setNodes(ns);
                        setEdgeMenuOpen(false);
                        toast.success('🍂 Desfolha aplicada — caule cinza');
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                    >
                      <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-zinc-500/15">
                        <Leaf className="w-4 h-4 text-zinc-400" />
                      </span>
                      <div>
                        <span className="text-sm font-semibold block">Desfolha</span>
                        <span className="text-xs text-muted-foreground">Caule fica cinza</span>
                      </div>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        pushHistory(nodes);
                        const ns = setEdgeActive(nodes, selectedEdgeId);
                        setNodes(ns);
                        setEdgeMenuOpen(false);
                        toast.success('✅ Caule restaurado');
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                    >
                      <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/15">
                        <Leaf className="w-4 h-4 text-emerald-400" />
                      </span>
                      <div>
                        <span className="text-sm font-semibold block">Restaurar</span>
                        <span className="text-xs text-muted-foreground">Remove desfolha</span>
                      </div>
                    </button>
                  )}

                  {/* Curvatura bezier */}
                  <button
                    onClick={() => {
                      setEdgeMenuOpen(false);
                      // mantém selectedEdgeId para mostrar os handles
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                  >
                    <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-blue-500/15">
                      <GitBranch className="w-4 h-4 text-blue-400" />
                    </span>
                    <div>
                      <span className="text-sm font-semibold block">Curvar linha</span>
                      <span className="text-xs text-muted-foreground">Arraste os handles</span>
                    </div>
                  </button>

                  {/* Resetar curva */}
                  {edgeNode.edgeCtrl && (
                    <>
                      <div className="h-px bg-border/30 mx-4 my-1" />
                      <button
                        onClick={() => {
                          pushHistory(nodes);
                          const ns = nodes.map(n => n.id === selectedEdgeId ? { ...n, edgeCtrl: undefined } : n);
                          setNodes(ns);
                          setSelectedEdgeId(null); setEdgeMenuOpen(false);
                          toast.success('↺ Curva resetada');
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors text-muted-foreground"
                      >
                        <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-muted">
                          <RotateCcw className="w-4 h-4" />
                        </span>
                        <div>
                          <span className="text-sm font-semibold block">Resetar curva</span>
                          <span className="text-xs text-muted-foreground">Volta ao padrão</span>
                        </div>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Sheet de reset ─────────────────────────────────────────────────── */}
      <Sheet open={resetOpen} onOpenChange={setResetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-sm flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-red-500" /> Reiniciar planta
            </SheetTitle>
          </SheetHeader>
          <p className="text-sm text-muted-foreground mb-4">
            A estrutura será apagada e a planta volta ao estado inicial.
          </p>
          <div className="space-y-2">
            {/* Restaurar ao último salvamento (master snapshot) */}
            <button onClick={handleRestoreSnapshot} className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/40 hover:border-border bg-card text-left active:scale-[0.98] transition-all">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/10">
                <Leaf className="w-4 h-4 text-emerald-500" />
              </span>
              <div>
                <p className="text-sm font-semibold">Manter histórico</p>
                <p className="text-xs text-muted-foreground">Volta ao último salvamento, mantém os logs</p>
              </div>
            </button>
            {/* Apagar tudo: volta à planta inicial + apaga logs */}
            <button onClick={() => handleClearAll(true)} className="w-full flex items-center gap-3 p-3 rounded-xl border border-red-500/20 hover:border-red-500/40 bg-card text-left active:scale-[0.98] transition-all">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-red-500/10">
                <RotateCcw className="w-4 h-4 text-red-500" />
              </span>
              <div>
                <p className="text-sm font-semibold text-red-500">Apagar tudo</p>
                <p className="text-xs text-muted-foreground">Recomeça da raiz e apaga o histórico</p>
              </div>
            </button>
            <button
              onClick={() => {
                skipRemote.current = true;
                setResetOpen(false);
                // Remove posições customizadas — volta ao layout automático
                const ns = nodes.map(({ posX: _px, posY: _py, ...n }) => n);
                setNodes(ns);
                saveNow(ns);
                requestAnimationFrame(fitToView);
                toast.success('Layout automático restaurado');
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/40 hover:border-border bg-card text-left active:scale-[0.98] transition-all"
            >
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-muted">
                <Maximize2 className="w-4 h-4 text-muted-foreground" />
              </span>
              <div>
                <p className="text-sm font-semibold">Auto-layout</p>
                <p className="text-xs text-muted-foreground">Remove posições manuais dos nós</p>
              </div>
            </button>
            <button onClick={() => setResetOpen(false)} className="w-full p-3 rounded-xl border border-border/40 text-sm text-muted-foreground transition-all hover:border-border">
              Cancelar
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
