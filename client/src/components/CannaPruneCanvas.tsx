/**
 * CannaPruneCanvas — Canvas2D interativo para treinamento de plantas
 *
 * Renderização via HTML5 Canvas com RAF loop:
 *   • Galhos curvos com gradiente de cor
 *   • Folhas cannabis com 7 pétalas
 *   • Animação de vento (sway sinusoidal por nó)
 *   • Partículas com velocidade + gravidade
 *   • Animação de crescimento em novos brotos
 *
 * Interações:
 *   • Tap → bottom-sheet com técnicas disponíveis
 *   • Drag (≥15px) → LST em tempo real
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  createInitialPlant,
  applyTopping,
  applyFimming,
  applySuperCropping,
  applyLST,
  applyDefoliation,
  applyLollipopping,
  getAvailableActions,
  getNodeLabel,
  tipOf,
  addBranchToNode,
  extendStem,
  type PlantNode,
  type TechniqueAction,
  type AnyAction,
} from "@/features/cannaprune/plantTree";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Scissors, Zap, Leaf, Layers, Anchor, Maximize2, Minimize2, Undo2, RotateCcw, GitBranch, ArrowUp } from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────────

/** Logical canvas dimensions matching the plant tree coordinate space */
const LOGICAL_W = 450;
const LOGICAL_H = 600;
const SAVE_DEBOUNCE_MS = 1500;
/** Max degrees of wind sway per branch */
const WIND_DEG = 3.2;
/** How fast wind oscillates */
const WIND_SPEED = 0.022;
/** Growth animation duration ms */
const GROW_DURATION = 650;

// ── Colour helpers ────────────────────────────────────────────────────────────

const BASE_COLOR: Record<string, string> = {
  "main-stem":   "#22c55e",
  "node":        "#16a34a",
  "top":         "#86efac",
  "side-branch": "#4ade80",
  "new-growth":  "#a7f3d0",
  "fan-leaf":    "#15803d",
};

const STATE_COLOR: Record<string, string | undefined> = {
  active:          undefined,        // use BASE_COLOR
  pruned:          "#6b7280",
  "super-cropped": "#c084fc",
  lst:             "#818cf8",
  removed:         "#1f2937",
};

function branchColor(node: PlantNode): string {
  return STATE_COLOR[node.state] ?? BASE_COLOR[node.type] ?? "#4ade80";
}

// ── Particle type ─────────────────────────────────────────────────────────────

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;   // 0-1, decreasing
  decay: number;
  r: number;
  color: string;
}

// ── Canvas drawing primitives ─────────────────────────────────────────────────

function rad(deg: number) { return (deg * Math.PI) / 180; }

/**
 * Draws the pot + soil at bottom-center.
 */
function drawPot(ctx: CanvasRenderingContext2D) {
  const cx = 225, baseY = 520;

  // Soil ellipse
  ctx.beginPath();
  ctx.ellipse(cx, baseY - 4, 56, 9, 0, 0, Math.PI * 2);
  const soilGrad = ctx.createLinearGradient(cx - 56, baseY, cx + 56, baseY);
  soilGrad.addColorStop(0, "#4e342e");
  soilGrad.addColorStop(0.5, "#6d4c41");
  soilGrad.addColorStop(1, "#4e342e");
  ctx.fillStyle = soilGrad;
  ctx.fill();

  // Pot trapezoid
  ctx.beginPath();
  ctx.moveTo(cx - 54, baseY);
  ctx.lineTo(cx - 38, baseY + 48);
  ctx.lineTo(cx + 38, baseY + 48);
  ctx.lineTo(cx + 54, baseY);
  ctx.closePath();
  const potGrad = ctx.createLinearGradient(cx - 54, 0, cx + 54, 0);
  potGrad.addColorStop(0, "#4e342e");
  potGrad.addColorStop(0.4, "#8d6e63");
  potGrad.addColorStop(0.6, "#8d6e63");
  potGrad.addColorStop(1, "#4e342e");
  ctx.fillStyle = potGrad;
  ctx.fill();
  ctx.strokeStyle = "#3e2723";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Pot rim highlight
  ctx.beginPath();
  ctx.moveTo(cx - 54, baseY);
  ctx.lineTo(cx + 54, baseY);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

/**
 * Draws a single branch as a quadratic-curved gradient line.
 * windDeg adds/subtracts from the angle for sway effect.
 */
function drawBranch(
  ctx: CanvasRenderingContext2D,
  node: PlantNode,
  parent: PlantNode,
  windDeg: number,
  isSelected: boolean,
) {
  if (node.state === "removed") return;

  const effectiveAngle = node.angle + windDeg;
  const tip = {
    x: node.x + node.length * Math.cos(rad(effectiveAngle)),
    y: node.y + node.length * Math.sin(rad(effectiveAngle)),
  };

  const color = branchColor(node);
  const alpha = node.state === "pruned" ? 0.3 : 1;
  const lw = node.width;

  // Subtle control point offset for a slight natural curve
  const ctrlX = (node.x + tip.x) / 2 + Math.sin(rad(effectiveAngle)) * 8;
  const ctrlY = (node.y + tip.y) / 2 - Math.cos(rad(effectiveAngle)) * 4;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (node.state === "pruned") ctx.setLineDash([6, 4]);

  // Gradient along branch direction
  const grad = ctx.createLinearGradient(node.x, node.y, tip.x, tip.y);
  grad.addColorStop(0, color + "bb");
  grad.addColorStop(1, color);
  ctx.strokeStyle = isSelected ? "#ffffff" : grad;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(node.x, node.y);
  ctx.quadraticCurveTo(ctrlX, ctrlY, tip.x, tip.y);
  ctx.stroke();

  if (isSelected) {
    // Glow layer
    ctx.shadowBlur = 14;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw + 1;
    ctx.beginPath();
    ctx.moveTo(node.x, node.y);
    ctx.quadraticCurveTo(ctrlX, ctrlY, tip.x, tip.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  if (node.state === "pruned") ctx.setLineDash([]);

  // LST tie-down indicator
  if (node.state === "lst") {
    ctx.strokeStyle = "#818cf888";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x + 12, tip.y + 18);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#818cf8";
    ctx.beginPath();
    ctx.arc(tip.x + 12, tip.y + 18, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Super-crop knuckle
  if (node.state === "super-cropped") {
    const mid = { x: (node.x + tip.x) / 2, y: (node.y + tip.y) / 2 };
    ctx.fillStyle = "#c084fc";
    ctx.beginPath();
    ctx.arc(mid.x, mid.y, lw * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draws a cannabis fan-leaf at the tip of a fan-leaf node.
 * 7 radiating "finger" spines.
 */
function drawFanLeaf(
  ctx: CanvasRenderingContext2D,
  node: PlantNode,
  windDeg: number,
  isSelected: boolean,
  growthT: number, // 0-1
) {
  if (node.state === "removed") return;

  // Work in radians for finger angles
  const effectiveAngleRad = rad(node.angle + windDeg);
  const tip = {
    x: node.x + node.length * Math.cos(effectiveAngleRad),
    y: node.y + node.length * Math.sin(effectiveAngleRad),
  };

  const size = 22 * growthT;
  if (size < 1) return;

  const leafColor = node.state === "pruned" ? "#4b5563" : (isSelected ? "#4ade80" : "#15803d");
  const alpha = node.state === "pruned" ? 0.15 : 0.88;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = leafColor;

  // 7 radial spines (~17° / 0.3 rad apart)
  for (let i = 0; i < 7; i++) {
    const fingerAngle = effectiveAngleRad + (i - 3) * 0.3;
    const len = size * (1 - Math.abs(i - 3) * 0.12);

    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(
      tip.x + Math.cos(fingerAngle) * len,
      tip.y + Math.sin(fingerAngle) * len,
    );
    ctx.lineTo(
      tip.x + Math.cos(fingerAngle + 0.18) * (len * 0.28),
      tip.y + Math.sin(fingerAngle + 0.18) * (len * 0.28),
    );
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draws an active top/new-growth node as a glowing dot.
 */
function drawTopDot(
  ctx: CanvasRenderingContext2D,
  node: PlantNode,
  windDeg: number,
  isSelected: boolean,
  growthT: number, // 0-1
) {
  const effectiveAngle = node.angle + windDeg;
  const tip = {
    x: node.x + node.length * Math.cos(rad(effectiveAngle)),
    y: node.y + node.length * Math.sin(rad(effectiveAngle)),
  };

  const r = Math.max(3, 7 * growthT);
  const color = BASE_COLOR[node.type] ?? "#86efac";

  ctx.save();
  ctx.globalAlpha = growthT;

  if (isSelected) {
    ctx.shadowBlur = 18;
    ctx.shadowColor = color;
  }

  // Fill
  ctx.fillStyle = isSelected ? "#ffffff" : color;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Border
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (isSelected) {
    ctx.shadowBlur = 0;
    // Dashed selection ring
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

// ── Technique metadata ─────────────────────────────────────────────────────────

const TECHNIQUE_META: Record<TechniqueAction, {
  label: string;
  icon: React.ElementType;
  color: string;
  desc: string;
}> = {
  topping:       { label: "Topping",        icon: Scissors, color: "#ef4444", desc: "Corta o topo → 2 novos brotos" },
  fim:           { label: "FIM",            icon: Scissors, color: "#f97316", desc: "Corte parcial → 3–4 brotos" },
  "super-crop":  { label: "Super Cropping", icon: Zap,      color: "#a855f7", desc: "Dobra o caule → estimula laterais" },
  lst:           { label: "LST",            icon: Anchor,   color: "#6366f1", desc: "Treina a direção do galho" },
  defoliation:   { label: "Defoliação",     icon: Leaf,     color: "#22c55e", desc: "Remove a folha fan" },
};

const EDITOR_META: Record<string, {
  label: string;
  icon: React.ElementType;
  color: string;
  desc: string;
}> = {
  "add-branch":  { label: "Adicionar Galho",  icon: GitBranch, color: "#10b981", desc: "Adiciona ramos laterais a este nó" },
  "extend-stem": { label: "Estender Caule",   icon: ArrowUp,   color: "#06b6d4", desc: "Continua o crescimento acima deste topo" },
};

// ── Particle helpers ───────────────────────────────────────────────────────────

function spawnParticles(
  store: Particle[],
  x: number,
  y: number,
  type: "cut" | "growth" | "sap",
) {
  const palettes = {
    cut:    ["#ef4444", "#f97316", "#fbbf24"],
    growth: ["#bbf7d0", "#86efac", "#4ade80"],
    sap:    ["#a3e635", "#84cc16", "#bef264"],
  };
  const palette = palettes[type];
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 3.5;
    store.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2.5,
      life: 0.85 + Math.random() * 0.15,
      decay: 0.022 + Math.random() * 0.018,
      r: 1.5 + Math.random() * 3,
      color: palette[Math.floor(Math.random() * palette.length)],
    });
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  plantId: number;
  height?: number;
  /** Se true, mostra botão de sair do fullscreen */
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  /** Chamado após cada técnica aplicada — para criar log automático */
  onTechniqueApplied?: (technique: string, nodeType: string) => void;
  /** Chamado após reset da estrutura. clearHistory=true → apagar histórico também */
  onResetStructure?: (clearHistory: boolean) => void;
}

const MAX_UNDO = 12;

export default function CannaPruneCanvas({ plantId, height = 380, fullscreen = false, onToggleFullscreen, onTechniqueApplied, onResetStructure }: Props) {
  // ── Refs (RAF-side mutable state) ──────────────────────────────────────────
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const rafRef       = useRef<number>(0);
  const tickRef      = useRef(0);
  const nodesRef     = useRef<PlantNode[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const birthRef     = useRef<Map<string, number>>(new Map());
  const selectedRef  = useRef<string | null>(null);
  const undoStack    = useRef<PlantNode[][]>([]);
  const saveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Evita que um refetch stale sobrescreva nodesRef após reset local */
  const skipRemoteRef = useRef(false);

  // Drag
  const dragRef = useRef<{
    nodeId: string;
    origAngle: number;
    origX: number;
    origY: number;
    startClientX: number;
    startClientY: number;
    hasDragged: boolean;
  } | null>(null);

  // ── tRPC ─────────────────────────────────────────────────────────────────
  const { data: savedStructure } = trpc.plantStructure.get.useQuery(
    { plantId },
    { enabled: !!plantId, refetchOnWindowFocus: false },
  );
  const saveMutation = trpc.plantStructure.save.useMutation({
    onError: () => toast.error("Erro ao salvar"),
  });

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const scheduleAutoSave = useCallback((nodes: PlantNode[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(
      () => saveMutation.mutate({ plantId, nodes }),
      SAVE_DEBOUNCE_MS,
    );
  }, [plantId, saveMutation]);

  // ── React state (UI overlays only) ────────────────────────────────────────
  const [sheetOpen,       setSheetOpen]       = useState(false);
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [isLoading,       setIsLoading]       = useState(true);
  const [canUndo,         setCanUndo]         = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  // ── Load structure ────────────────────────────────────────────────────────
  useEffect(() => {
    if (savedStructure === undefined) return;
    if (skipRemoteRef.current) {
      skipRemoteRef.current = false;
      return; // dados remotos obsoletos — ignora, já temos a estrutura nova
    }
    let nodes: PlantNode[] = savedStructure?.nodes?.length
      ? (savedStructure.nodes as PlantNode[])
      : createInitialPlant();

    nodes = nodes.map((n) => ({
      ...n,
      swayOffset: n.swayOffset ?? Math.random() * Math.PI * 2,
    }));

    nodesRef.current = nodes;
    setIsLoading(false);
  }, [savedStructure]);

  // Keep ref in sync with state
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);

  /** Save a snapshot before mutating nodesRef */
  function pushUndo() {
    const snapshot = nodesRef.current.map((n) => ({ ...n }));
    undoStack.current.push(snapshot);
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    setCanUndo(true);
  }

  function handleUndo() {
    const prev = undoStack.current.pop();
    if (!prev) return;
    nodesRef.current = prev;
    setCanUndo(undoStack.current.length > 0);
    setSelectedId(null);
    scheduleAutoSave(prev);
    toast.success("Desfeito ↩");
  }

  function handleReset(clearHistory: boolean) {
    skipRemoteRef.current = true; // ignora próximo refetch (pode trazer dados velhos)
    setResetDialogOpen(false);
    undoStack.current = [];
    setCanUndo(false);
    setSelectedId(null);

    const freshNodes = createInitialPlant().map((n) => ({
      ...n,
      swayOffset: Math.random() * Math.PI * 2,
    }));
    nodesRef.current = freshNodes;
    birthRef.current.clear();
    setIsLoading(false);
    scheduleAutoSave(freshNodes);

    onResetStructure?.(clearHistory);
    toast.success(clearHistory ? "Planta e histórico reiniciados 🌱" : "Planta reiniciada 🌱");
  }

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  // ── Canvas resize ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas!.parentElement?.clientWidth ?? 375;
      const cssH = height;
      canvas!.width  = Math.round(cssW * dpr);
      canvas!.height = Math.round(cssH * dpr);
      canvas!.style.width  = cssW + "px";
      canvas!.style.height = cssH + "px";
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [height]);

  // ── RAF loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      tickRef.current++;

      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();

      // HiDPI
      ctx.scale(dpr, dpr);

      // Plant coordinate transform: fill width, anchor pot at bottom
      const scale   = cssW / LOGICAL_W;
      const offsetY = cssH - LOGICAL_H * scale;
      ctx.translate(0, offsetY);
      ctx.scale(scale, scale);

      // ── Pot ──
      drawPot(ctx);

      const nodes    = nodesRef.current;
      const now      = Date.now();
      const sorted   = [...nodes].sort((a, b) => a.generation - b.generation);
      const selId    = selectedRef.current;

      // ── Branches + leaves ──
      for (const node of sorted) {
        if (node.state === "removed") continue;

        const parent = nodes.find((n) => n.id === node.parentId);
        if (!parent) continue;

        const isSelected = node.id === selId;
        const sway = node.type !== "main-stem" && node.type !== "node"
          ? Math.sin(tickRef.current * WIND_SPEED + (node.swayOffset ?? 0)) * WIND_DEG
          : 0;

        const born = birthRef.current.get(node.id);
        const growthT = born ? Math.min((now - born) / GROW_DURATION, 1) : 1;

        if (node.type === "fan-leaf") {
          // Draw the connecting stub first
          drawBranch(ctx, node, parent, sway, false);
          drawFanLeaf(ctx, node, sway, isSelected, growthT);
        } else {
          // Scale branch length for growth animation
          const displayNode = growthT < 1
            ? { ...node, length: node.length * growthT }
            : node;
          drawBranch(ctx, displayNode, parent, sway, isSelected);
        }
      }

      // ── Top dots (drawn above branches) ──
      for (const node of sorted) {
        if (node.state !== "active") continue;
        if (node.type !== "top" && node.type !== "new-growth") continue;

        const isSelected = node.id === selId;
        const born = birthRef.current.get(node.id);
        const growthT = born ? Math.min((now - born) / GROW_DURATION, 1) : 1;

        const sway = Math.sin(tickRef.current * WIND_SPEED + (node.swayOffset ?? 0)) * WIND_DEG;
        drawTopDot(ctx, node, sway, isSelected, growthT);
      }

      // ── Particles ──
      const alive: Particle[] = [];
      for (const p of particlesRef.current) {
        p.life -= p.decay;
        if (p.life <= 0) continue;

        p.x  += p.vx;
        p.y  += p.vy;
        p.vy += 0.18; // gravity

        ctx.save();
        ctx.globalAlpha = p.life * 0.9;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        alive.push(p);
      }
      particlesRef.current = alive;

      ctx.restore();

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // single mount

  // ── Hit detection ─────────────────────────────────────────────────────────

  function clientToLogical(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scale   = canvas.clientWidth / LOGICAL_W;
    const offsetY = canvas.clientHeight - LOGICAL_H * scale;
    return {
      lx: (clientX - rect.left) / scale,
      ly: (clientY - rect.top - offsetY) / scale,
    };
  }

  function hitNode(clientX: number, clientY: number): PlantNode | null {
    const pt = clientToLogical(clientX, clientY);
    if (!pt) return null;
    const { lx, ly } = pt;

    let best: PlantNode | null = null;
    let bestDist = Infinity;

    for (const node of nodesRef.current) {
      if (node.state === "removed") continue;
      const tip = tipOf(node);
      const dist = Math.hypot(tip.x - lx, tip.y - ly);
      const threshold = node.type === "fan-leaf" ? 30 : 24;
      if (dist < threshold && dist < bestDist) {
        bestDist = dist;
        best = node;
      }
    }
    return best;
  }

  // ── Pointer events ────────────────────────────────────────────────────────

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const node = hitNode(e.clientX, e.clientY);
    if (!node) {
      setSelectedId(null);
      return;
    }

    setSelectedId(node.id);

    dragRef.current = {
      nodeId: node.id,
      origAngle: node.angle,
      origX: node.x,
      origY: node.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
      hasDragged: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;

    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    const dist = Math.hypot(dx, dy);

    if (dist < 10) return;
    drag.hasDragged = true;

    const pt = clientToLogical(e.clientX, e.clientY);
    if (!pt) return;

    const newAngle = Math.atan2(pt.ly - drag.origY, pt.lx - drag.origX) * (180 / Math.PI);
    nodesRef.current = nodesRef.current.map((n) =>
      n.id === drag.nodeId ? { ...n, angle: newAngle } : n
    );
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    dragRef.current = null;

    if (!drag) return;

    if (!drag.hasDragged) {
      // Tap → open sheet
      setSheetOpen(true);
      return;
    }

    const node = nodesRef.current.find((n) => n.id === drag.nodeId);
    if (!node) return;

    const angleDelta = Math.abs(node.angle - drag.origAngle);
    if (angleDelta < 8) {
      // Tiny drag — treat as tap
      setSheetOpen(true);
      return;
    }

    // LST via drag!
    pushUndo();
    const tip = tipOf(node);
    spawnParticles(particlesRef.current, tip.x, tip.y, "sap");
    const lstNodes = nodesRef.current.map((n) =>
      n.id === drag.nodeId ? { ...n, state: "lst" as const, pruneType: "lst" } : n
    );
    nodesRef.current = lstNodes;
    scheduleAutoSave(lstNodes);
    onTechniqueApplied?.("LST", node.type);
    toast.success("LST aplicado! 🔗");
  }

  // ── Technique application ─────────────────────────────────────────────────

  function applyTechnique(action: AnyAction) {
    const nodeId = selectedRef.current;
    if (!nodeId) return;
    setSheetOpen(false);

    const target = nodesRef.current.find((n) => n.id === nodeId);
    if (!target) return;
    const tip = tipOf(target);

    // ── Editor actions (estrutura, sem log de técnica) ───────────────────────
    if (action === "add-branch" || action === "extend-stem") {
      pushUndo();
      const result = action === "add-branch"
        ? addBranchToNode(nodesRef.current, nodeId)
        : extendStem(nodesRef.current, nodeId);

      if (result.error) {
        undoStack.current.pop();
        setCanUndo(undoStack.current.length > 0);
        toast.error(result.error);
        return;
      }

      const oldIds = new Set(nodesRef.current.map((n) => n.id));
      const now = Date.now();
      result.nodes.forEach((n) => {
        if (!oldIds.has(n.id)) {
          birthRef.current.set(n.id, now);
          if (!n.swayOffset) n.swayOffset = Math.random() * Math.PI * 2;
        }
      });
      spawnParticles(particlesRef.current, tip.x, tip.y, "growth");
      nodesRef.current = result.nodes;
      setSelectedId(null);
      scheduleAutoSave(result.nodes);
      toast.success(action === "add-branch" ? "Galho adicionado 🌿" : "Caule estendido 🌱");
      return;
    }

    // ── Technique actions (com log) ──────────────────────────────────────────
    pushUndo();

    let result: { nodes: PlantNode[]; error?: string };
    let pType: "cut" | "growth" | "sap" = "cut";

    switch (action) {
      case "topping":     result = applyTopping(nodesRef.current, nodeId);       pType = "cut";    break;
      case "fim":         result = applyFimming(nodesRef.current, nodeId);       pType = "cut";    break;
      case "super-crop":  result = applySuperCropping(nodesRef.current, nodeId); pType = "sap";    break;
      case "lst":         result = applyLST(nodesRef.current, nodeId);           pType = "sap";    break;
      case "defoliation": result = applyDefoliation(nodesRef.current, nodeId);   pType = "growth"; break;
      default: return;
    }

    if (result.error) {
      undoStack.current.pop();
      setCanUndo(undoStack.current.length > 0);
      toast.error(result.error);
      return;
    }

    // Register birth times for new nodes & give them swayOffset
    const oldIds = new Set(nodesRef.current.map((n) => n.id));
    const now = Date.now();
    result.nodes.forEach((n) => {
      if (!oldIds.has(n.id)) {
        birthRef.current.set(n.id, now);
        if (!n.swayOffset) n.swayOffset = Math.random() * Math.PI * 2;
      }
    });

    spawnParticles(particlesRef.current, tip.x, tip.y, pType);
    nodesRef.current = result.nodes;
    setSelectedId(null);
    scheduleAutoSave(result.nodes);

    // Notify parent for log creation
    const techNames: Record<TechniqueAction, string> = {
      topping:       "Topping",
      fim:           "FIM",
      "super-crop":  "Super Cropping",
      lst:           "LST",
      defoliation:   "Defoliação",
    };
    onTechniqueApplied?.(techNames[action as TechniqueAction], target.type);
  }

  function handleLollipopping() {
    setSheetOpen(false);
    pushUndo();
    const result = applyLollipopping(nodesRef.current);
    if (result.removed === 0) {
      undoStack.current.pop(); // nothing changed, remove snapshot
      toast.info("Nada para remover no terço inferior");
      return;
    }
    nodesRef.current = result.nodes;
    scheduleAutoSave(result.nodes);
    onTechniqueApplied?.("Lollipopping", "lower");
    toast.success(`Lollipopping: ${result.removed} galhos removidos`);
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const selectedNode = selectedId
    ? nodesRef.current.find((n) => n.id === selectedId) ?? null
    : null;
  const availableActions      = selectedNode ? getAvailableActions(selectedNode) : [];
  const availableTechs        = availableActions.filter((a): a is TechniqueAction =>
    a !== "add-branch" && a !== "extend-stem"
  );
  const availableEditorActions = availableActions.filter(
    (a): a is "add-branch" | "extend-stem" => a === "add-branch" || a === "extend-stem"
  );

  return (
    <div className="relative w-full" style={{ height }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", touchAction: "none", cursor: "crosshair" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* Loading spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-xl">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Hint */}
      <p className="absolute bottom-1.5 left-3 text-[9px] text-muted-foreground/50 pointer-events-none select-none">
        Toque num nó • Arraste para LST
      </p>

      {/* Controls: undo + reset + fullscreen */}
      <div className="absolute top-2 right-2 flex gap-1.5">
        {canUndo && (
          <button
            onClick={handleUndo}
            className="w-7 h-7 rounded-lg bg-background/80 backdrop-blur border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            title="Desfazer"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => setResetDialogOpen(true)}
          className="w-7 h-7 rounded-lg bg-background/80 backdrop-blur border border-border/40 flex items-center justify-center text-muted-foreground hover:text-red-500 transition-colors"
          title="Reiniciar planta"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className="w-7 h-7 rounded-lg bg-background/80 backdrop-blur border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            title={fullscreen ? "Sair do sandbox" : "Modo sandbox"}
          >
            {fullscreen
              ? <Minimize2 className="w-3.5 h-3.5" />
              : <Maximize2 className="w-3.5 h-3.5" />
            }
          </button>
        )}
      </div>

      {/* ── Technique sheet ──────────────────────────────────────────────── */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(o) => { setSheetOpen(o); if (!o) setSelectedId(null); }}
      >
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-sm flex items-center gap-2">
              <Scissors className="w-4 h-4" />
              {selectedNode ? getNodeLabel(selectedNode) : "Técnicas"}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-2">
            {availableActions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma ação disponível para este nó
              </p>
            )}

            {/* ── Seção: Estrutura (editor) ─────────────────────────────── */}
            {availableEditorActions.length > 0 && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-1 pt-1">
                  Estrutura
                </p>
                {availableEditorActions.map((action) => {
                  const meta = EDITOR_META[action];
                  if (!meta) return null;
                  const Icon = meta.icon;
                  return (
                    <button
                      key={action}
                      onClick={() => applyTechnique(action)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/40 hover:border-border active:scale-[0.98] transition-all bg-card text-left"
                    >
                      <span
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: meta.color + "22" }}
                      >
                        <Icon className="w-4 h-4" style={{ color: meta.color }} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{meta.label}</p>
                        <p className="text-xs text-muted-foreground">{meta.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </>
            )}

            {/* ── Seção: Técnicas de treinamento ────────────────────────── */}
            {availableTechs.length > 0 && (
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-1 pt-1">
                Técnicas
              </p>
            )}

            {availableTechs.map((action) => {
              const meta = TECHNIQUE_META[action];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <button
                  key={action}
                  onClick={() => applyTechnique(action)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/40 hover:border-border active:scale-[0.98] transition-all bg-card text-left"
                >
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: meta.color + "22" }}
                  >
                    <Icon className="w-4 h-4" style={{ color: meta.color }} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{meta.label}</p>
                    <p className="text-xs text-muted-foreground">{meta.desc}</p>
                  </div>
                </button>
              );
            })}

            {/* Lollipopping — global, always available */}
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-1 pt-1">
              Global
            </p>
            <button
              onClick={handleLollipopping}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/40 hover:border-border active:scale-[0.98] transition-all bg-card text-left"
            >
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-red-500/10">
                <Layers className="w-4 h-4 text-red-500" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Lollipopping</p>
                <p className="text-xs text-muted-foreground">Remove crescimento abaixo do 1/3 inferior</p>
              </div>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Reset confirmation sheet ──────────────────────────────────────── */}
      <Sheet open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-sm flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-red-500" />
              Reiniciar planta
            </SheetTitle>
          </SheetHeader>
          <p className="text-sm text-muted-foreground mb-4">
            A estrutura atual será apagada e a planta voltará ao estado inicial. O que fazer com o histórico?
          </p>
          <div className="space-y-2">
            <button
              onClick={() => handleReset(false)}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/40 hover:border-border active:scale-[0.98] transition-all bg-card text-left"
            >
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/10">
                <Leaf className="w-4 h-4 text-emerald-500" />
              </span>
              <div>
                <p className="text-sm font-semibold">Manter histórico</p>
                <p className="text-xs text-muted-foreground">Reinicia a planta, mantém os logs de técnicas</p>
              </div>
            </button>
            <button
              onClick={() => handleReset(true)}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-red-500/20 hover:border-red-500/40 active:scale-[0.98] transition-all bg-card text-left"
            >
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-red-500/10">
                <RotateCcw className="w-4 h-4 text-red-500" />
              </span>
              <div>
                <p className="text-sm font-semibold text-red-500">Apagar tudo</p>
                <p className="text-xs text-muted-foreground">Reinicia a planta e apaga todo o histórico</p>
              </div>
            </button>
            <button
              onClick={() => setResetDialogOpen(false)}
              className="w-full p-3 rounded-xl border border-border/40 hover:border-border text-sm text-muted-foreground transition-all"
            >
              Cancelar
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
