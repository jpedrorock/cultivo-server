/**
 * PlantIsoView — Vista isométrica da planta (estilo SimCity)
 *
 * Projeção isométrica clássica (30°):
 *   screenX = (worldX - worldZ) * cos(30°)
 *   screenY = (worldX + worldZ) * sin(30°) - worldY
 *
 * - worldX, worldZ: posição horizontal (do layout radial)
 * - worldY: altura (profundidade na árvore)
 * - Vaso na base, planta crescendo para cima
 */

import { useEffect, useRef } from "react";
import type { PlantGraphNode } from "@/features/cannaprune/plantGraph";

// ── Cores (mesmas do PlantTopView para consistência) ──────────────────────────

const COLORS = {
  bg:        "#0a0a0f",
  potTop:    "#5c3317",
  potSide:   "#3d2008",
  potRim:    "#6e3d1c",
  ground:    "#1a1a22",
  stem:      "#4ade80",
  branch:    "#86efac",
  nodeActive:    "#22c55e",
  nodeLst:       "#8b5cf6",
  nodeTopped:    "#ef4444",
  nodeFimmed:    "#f97316",
  nodeSuper:     "#f97316",
  edgeActive:    "#4ade80",
  edgeLst:       "#a78bfa",
  edgeTopped:    "#f87171",
  edgeSuper:     "#fb923c",
  label:     "#e5e7eb",
};

// ── Projeção isométrica ───────────────────────────────────────────────────────

const ISO_COS = Math.cos(Math.PI / 6);   // cos(30°) ≈ 0.866
const ISO_SIN = Math.sin(Math.PI / 6);   // sin(30°) ≈ 0.500

function project(wx: number, wy: number, wz: number): { x: number; y: number } {
  return {
    x: (wx - wz) * ISO_COS,
    y: (wx + wz) * ISO_SIN - wy,
  };
}

// ── Layout: posição 3D para cada nó ───────────────────────────────────────────

interface World3D { wx: number; wy: number; wz: number; depth: number }

function computeWorldLayout(nodes: PlantGraphNode[]): Map<string, World3D> {
  const positions = new Map<string, World3D>();
  if (nodes.length === 0) return positions;

  // Mapas auxiliares
  const childMap = new Map<string, string[]>();
  const nodeById = new Map<string, PlantGraphNode>();
  for (const n of nodes) {
    nodeById.set(n.id, n);
    if (!childMap.has(n.id)) childMap.set(n.id, []);
    if (n.parentId) {
      const arr = childMap.get(n.parentId) ?? [];
      arr.push(n.id);
      childMap.set(n.parentId, arr);
    }
  }
  const root = nodes.find(n => n.parentId === null) ?? nodes[0];

  // Tamanho da subárvore (folhas) para distribuir setores angulares
  const sizeMap = new Map<string, number>();
  function calcSize(id: string): number {
    const kids = childMap.get(id) ?? [];
    const s = kids.length === 0 ? 1 : kids.reduce((a, c) => a + calcSize(c), 0);
    sizeMap.set(id, s);
    return s;
  }
  calcSize(root.id);

  // Constantes de layout 3D
  const BRANCH_R   = 55;   // raio horizontal por nível
  const HEIGHT     = 60;   // altura por nível
  const LST_BEND   = 35;   // LST empurra para fora horizontalmente

  // Atribui posições 3D recursivamente
  function assign(
    id: string, startA: number, endA: number, depth: number,
    parentR: number,
  ) {
    const node     = nodeById.get(id)!;
    const isRoot   = node.parentId === null;
    const midA     = (startA + endA) / 2;
    const baseR    = isRoot ? 0 : parentR + BRANCH_R;
    const r        = baseR + (node.state === 'lst' ? LST_BEND : 0);
    const wx       = r * Math.cos(midA);
    const wz       = r * Math.sin(midA);
    const wy       = depth * HEIGHT;
    positions.set(id, { wx, wy, wz, depth });

    const kids  = childMap.get(id) ?? [];
    const total = kids.reduce((s, k) => s + (sizeMap.get(k) ?? 1), 0);
    let curA    = startA;
    for (const kid of kids) {
      const frac = (sizeMap.get(kid) ?? 1) / total;
      const arc  = (endA - startA) * frac;
      assign(kid, curA, curA + arc, depth + 1, r);
      curA += arc;
    }
  }
  assign(root.id, -Math.PI / 2, Math.PI * 1.5, 0, 0);

  return positions;
}

// ── Estado do nó → cor ────────────────────────────────────────────────────────

function nodeColor(n: PlantGraphNode): string {
  switch (n.state) {
    case 'lst':           return COLORS.nodeLst;
    case 'topped':        return COLORS.nodeTopped;
    case 'fimmed':        return COLORS.nodeFimmed;
    case 'super-cropped': return COLORS.nodeSuper;
    default:              return COLORS.nodeActive;
  }
}

function edgeColor(child: PlantGraphNode): string {
  switch (child.state) {
    case 'lst':           return COLORS.edgeLst;
    case 'topped':        return COLORS.edgeTopped;
    case 'super-cropped': return COLORS.edgeSuper;
    default:              return COLORS.edgeActive;
  }
}

// ── Componente ────────────────────────────────────────────────────────────────

interface PlantIsoViewProps {
  nodes: PlantGraphNode[];
  size?: number;
}

export default function PlantIsoView({ nodes, size = 340 }: PlantIsoViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // High-DPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width  = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size * 0.62;     // câmera ligeiramente acima do centro

    const positions = computeWorldLayout(nodes);
    const world: { node: PlantGraphNode; pos: World3D }[] = nodes.map(n => ({
      node: n,
      pos:  positions.get(n.id) ?? { wx: 0, wy: 0, wz: 0, depth: 0 },
    }));
    // Ordenação correta por profundidade (Z-order isométrico):
    // pintar o que está "mais atrás" primeiro — wx + wz menor = mais atrás
    // mas mais alto (wy maior) também aparece "na frente"
    world.sort((a, b) => {
      const ka = a.pos.wx + a.pos.wz - a.pos.wy * 0.5;
      const kb = b.pos.wx + b.pos.wz - b.pos.wy * 0.5;
      return ka - kb;
    });

    // Para edges (do parente pra cada filho)
    const nodeById = new Map<string, PlantGraphNode>();
    for (const n of nodes) nodeById.set(n.id, n);

    function drawPot(t: number) {
      // Vaso isométrico (losango) na base
      const r = 32;
      const h = 22;
      // Vértices do top (losango isométrico)
      const tx = cx, ty = cy;
      const top = [
        { x: tx,             y: ty - r * ISO_SIN },   // back
        { x: tx + r * ISO_COS, y: ty },               // right
        { x: tx,             y: ty + r * ISO_SIN },   // front
        { x: tx - r * ISO_COS, y: ty },               // left
      ];
      // Lado direito
      ctx!.fillStyle = COLORS.potSide;
      ctx!.beginPath();
      ctx!.moveTo(top[1].x, top[1].y);
      ctx!.lineTo(top[2].x, top[2].y);
      ctx!.lineTo(top[2].x, top[2].y + h);
      ctx!.lineTo(top[1].x, top[1].y + h);
      ctx!.closePath();
      ctx!.fill();
      // Lado esquerdo (mais escuro)
      ctx!.fillStyle = "#2a1605";
      ctx!.beginPath();
      ctx!.moveTo(top[3].x, top[3].y);
      ctx!.lineTo(top[2].x, top[2].y);
      ctx!.lineTo(top[2].x, top[2].y + h);
      ctx!.lineTo(top[3].x, top[3].y + h);
      ctx!.closePath();
      ctx!.fill();
      // Borda da boca (rim)
      ctx!.strokeStyle = COLORS.potRim;
      ctx!.lineWidth = 2;
      ctx!.beginPath();
      ctx!.moveTo(top[0].x, top[0].y);
      for (let i = 1; i < top.length; i++) ctx!.lineTo(top[i].x, top[i].y);
      ctx!.closePath();
      ctx!.stroke();
      // Topo (terra)
      ctx!.fillStyle = COLORS.potTop;
      ctx!.beginPath();
      ctx!.moveTo(top[0].x, top[0].y);
      for (let i = 1; i < top.length; i++) ctx!.lineTo(top[i].x, top[i].y);
      ctx!.closePath();
      ctx!.fill();
    }

    function drawNode3D(node: PlantGraphNode, p: { x: number; y: number }, t: number) {
      if (node.parentId === null) return; // root é o vaso
      const isTop = node.type === 'top' && node.state === 'active';
      // Wind sway suave nos topos
      const sway = isTop ? Math.sin(t * 0.0008 + p.x * 0.05) * 1.5 : 0;
      const x = p.x + sway;
      const y = p.y;
      const r = isTop ? 11 : 8;
      const color = nodeColor(node);
      // Glow nos topos ativos
      if (isTop) {
        ctx!.shadowBlur  = 14;
        ctx!.shadowColor = color;
      }
      // Esfera com gradiente (luz vinda do top-left)
      const grad = ctx!.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.3, color);
      grad.addColorStop(1, "#000000");
      ctx!.fillStyle = grad;
      ctx!.beginPath();
      ctx!.arc(x, y, r, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.shadowBlur = 0;
      // Outline sutil
      ctx!.strokeStyle = "rgba(0,0,0,0.5)";
      ctx!.lineWidth = 1;
      ctx!.stroke();
      // Label do número de nó
      ctx!.fillStyle = COLORS.label;
      ctx!.font = "600 9px system-ui, sans-serif";
      ctx!.textAlign = "center";
      ctx!.textBaseline = "top";
      ctx!.fillText(`N${node.nodeNumber}`, x, y + r + 2);
    }

    function drawEdge(child: PlantGraphNode, parent: PlantGraphNode, t: number) {
      const cw = positions.get(child.id);
      const pw = positions.get(parent.id);
      if (!cw || !pw) return;
      const cp = project(cw.wx, cw.wy, cw.wz);
      const pp = project(pw.wx, pw.wy, pw.wz);
      const cs = { x: cx + cp.x, y: cy + cp.y };
      const ps = { x: cx + pp.x, y: cy + pp.y };
      // Linha curva (caule) com sway leve
      const sway = child.type === 'top' && child.state === 'active'
        ? Math.sin(t * 0.0008 + cs.x * 0.05) * 1.5
        : 0;
      const mx = (cs.x + ps.x) / 2 + sway * 0.5;
      const my = (cs.y + ps.y) / 2;
      ctx!.strokeStyle = edgeColor(child);
      ctx!.lineWidth = parent.parentId === null ? 4 : 2.5;
      ctx!.lineCap = "round";
      ctx!.beginPath();
      ctx!.moveTo(ps.x, ps.y);
      ctx!.quadraticCurveTo(mx, my, cs.x + sway, cs.y);
      ctx!.stroke();
    }

    function render(t: number) {
      // Limpa
      ctx!.clearRect(0, 0, size, size);
      // Fundo
      ctx!.fillStyle = COLORS.bg;
      ctx!.fillRect(0, 0, size, size);

      // Grid de chão (losango sutil)
      ctx!.strokeStyle = "rgba(255,255,255,0.04)";
      ctx!.lineWidth = 1;
      const gridSize = 30;
      const gridCount = 6;
      for (let i = -gridCount; i <= gridCount; i++) {
        const a1 = project(i * gridSize, 0, -gridCount * gridSize);
        const a2 = project(i * gridSize, 0,  gridCount * gridSize);
        ctx!.beginPath();
        ctx!.moveTo(cx + a1.x, cy + a1.y);
        ctx!.lineTo(cx + a2.x, cy + a2.y);
        ctx!.stroke();
        const b1 = project(-gridCount * gridSize, 0, i * gridSize);
        const b2 = project( gridCount * gridSize, 0, i * gridSize);
        ctx!.beginPath();
        ctx!.moveTo(cx + b1.x, cy + b1.y);
        ctx!.lineTo(cx + b2.x, cy + b2.y);
        ctx!.stroke();
      }

      // Vaso
      drawPot(t);

      // Desenha em ordem: edges primeiro, depois nós (mais natural)
      // Mas respeitando a Z-order: percorre nós ordenados e desenha (edge_pai → nó)
      for (const { node } of world) {
        if (!node.parentId) continue;
        const parent = nodeById.get(node.parentId);
        if (!parent) continue;
        drawEdge(node, parent, t);
      }
      for (const { node, pos } of world) {
        if (!node.parentId) continue;
        const p = project(pos.wx, pos.wy, pos.wz);
        drawNode3D(node, { x: cx + p.x, y: cy + p.y }, t);
      }

      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [nodes, size]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Vista isométrica da planta"
      style={{ display: "block", borderRadius: "12px" }}
    />
  );
}
