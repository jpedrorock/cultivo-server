/**
 * PlantTopView.tsx — Top-down (bird's eye) radial view of a cannabis plant
 *
 * Renders a Canvas2D animated overview: vase at center, branches radiating outward.
 * Uses requestAnimationFrame for a subtle wind-sway effect on active tops.
 */

import { useRef, useEffect } from 'react';
import { PlantGraphNode } from '@/features/cannaprune/plantGraph';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlantTopViewProps {
  nodes: PlantGraphNode[];
  size?: number; // canvas width/height (default 340)
}

interface RadialPos {
  x: number;
  y: number;
  angle: number; // mid-angle used for sway direction
}

// ── Color maps ────────────────────────────────────────────────────────────────

function nodeColor(state: PlantGraphNode['state']): string {
  switch (state) {
    case 'active':       return '#22c55e';
    case 'lst':          return '#8b5cf6';
    case 'topped':       return '#ef4444';
    case 'fimmed':       return '#f97316';
    case 'super-cropped':return '#f97316';
    default:             return '#22c55e';
  }
}

function edgeColor(node: PlantGraphNode): string {
  switch (node.state) {
    case 'lst':          return '#a78bfa';
    case 'topped':       return '#f87171';
    case 'fimmed':       return '#f87171';
    case 'super-cropped':return '#fb923c';
    default:             return '#4ade80';
  }
}

// ── Radial layout ─────────────────────────────────────────────────────────────

const LEVEL_RADIUS = 70; // px per depth level
const LST_EXTRA    = 40; // extra radius for LST nodes

function computeRadialLayout(
  nodes: PlantGraphNode[],
  cx: number,
  cy: number,
): Map<string, RadialPos> {
  const posMap   = new Map<string, RadialPos>();
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

  const root = nodes.find(n => n.parentId === null);
  if (!root) return posMap;

  // Subtree leaf-count (min 1) — used to apportion angular sectors
  const sizeCache = new Map<string, number>();
  function subtreeSize(id: string): number {
    if (sizeCache.has(id)) return sizeCache.get(id)!;
    const kids = childMap.get(id) ?? [];
    const s = kids.length === 0 ? 1 : kids.reduce((acc, k) => acc + subtreeSize(k), 0);
    sizeCache.set(id, s);
    return s;
  }

  // Recursively assign polar positions
  function assign(id: string, startAngle: number, endAngle: number, depth: number) {
    const node  = nodeById.get(id)!;
    const r     = depth * LEVEL_RADIUS + (node.state === 'lst' ? LST_EXTRA : 0);
    const mid   = (startAngle + endAngle) / 2;

    posMap.set(id, {
      x: cx + r * Math.cos(mid),
      y: cy + r * Math.sin(mid),
      angle: mid,
    });

    const kids  = childMap.get(id) ?? [];
    const total = kids.reduce((acc, k) => acc + subtreeSize(k), 0);
    if (total === 0) return;

    let cur = startAngle;
    for (const kid of kids) {
      const arc = (subtreeSize(kid) / total) * (endAngle - startAngle);
      assign(kid, cur, cur + arc, depth + 1);
      cur += arc;
    }
  }

  // Start from top (-π/2), full circle
  assign(root.id, -Math.PI / 2, Math.PI * 1.5, 0);
  return posMap;
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawVase(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const grad = ctx.createRadialGradient(cx - 6, cy - 6, 4, cx, cy, 28);
  grad.addColorStop(0, '#5c3317');
  grad.addColorStop(1, '#3d2008');

  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Rim highlight
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawCanopyRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  maxR: number,
) {
  const r = maxR + 20;
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawBranch(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cx2: number,
  cy2: number,
  color: string,
) {
  // Quadratic bezier: control point is the midpoint pulled toward center
  const cpx = (px + cx2) / 2;
  const cpy = (py + cy2) / 2;

  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.quadraticCurveTo(cpx, cpy, cx2, cy2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  node: PlantGraphNode,
  swayX: number,
  swayY: number,
) {
  const isActiveTop = node.type === 'top' && node.state === 'active';
  const r           = isActiveTop ? 18 : 14;
  const color       = nodeColor(node.state);
  const nx          = x + swayX;
  const ny          = y + swayY;

  // Glow for active top nodes
  if (isActiveTop) {
    ctx.save();
    ctx.shadowColor  = color;
    ctx.shadowBlur   = 12;
    ctx.beginPath();
    ctx.arc(nx, ny, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(nx, ny, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Border
  ctx.beginPath();
  ctx.arc(nx, ny, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Label: N<nodeNumber> below the circle
  if (node.nodeNumber > 0) {
    ctx.font      = 'bold 10px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`N${node.nodeNumber}`, nx, ny + r + 3);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlantTopView({ nodes, size = 340 }: PlantTopViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width  = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;

    // Pre-compute layout (static; recomputed on nodes change)
    const posMap = computeRadialLayout(nodes, cx, cy);
    const nodeById = new Map<string, PlantGraphNode>();
    for (const n of nodes) nodeById.set(n.id, n);

    // Determine max radius for canopy ring
    let maxR = 0;
    posMap.forEach((pos, id) => {
      if (id === 'root') return;
      const dx = pos.x - cx;
      const dy = pos.y - cy;
      maxR = Math.max(maxR, Math.sqrt(dx * dx + dy * dy));
    });

    // Active top nodes for sway animation
    const activeTops = nodes.filter(
      n => n.type === 'top' && n.state === 'active' && n.parentId !== null,
    );

    let startTime = 0;

    function render(ts: number) {
      if (!startTime) startTime = ts;
      const t = (ts - startTime) / 1000; // seconds

      ctx!.clearRect(0, 0, size, size);

      // Background
      ctx!.fillStyle = '#0a0a0f';
      ctx!.fillRect(0, 0, size, size);

      // Canopy ring (behind everything)
      if (maxR > 0) drawCanopyRing(ctx!, cx, cy, maxR);

      // Draw branches first (under nodes)
      for (const n of nodes) {
        if (!n.parentId) continue; // root has no parent edge
        const pos    = posMap.get(n.id);
        const parent = nodeById.get(n.parentId);
        const pPos   = parent ? posMap.get(parent.id) : undefined;
        if (!pos || !pPos) continue;

        // Compute sway for child node if it's an active top
        const isActiveTop = n.type === 'top' && n.state === 'active';
        const idx         = activeTops.indexOf(n);
        const swayX       = isActiveTop && idx >= 0
          ? Math.sin(t * 0.8 + idx * 1.2) * 3
          : 0;
        const swayY       = isActiveTop && idx >= 0
          ? Math.cos(t * 0.8 + idx * 1.2) * 1.5
          : 0;

        drawBranch(
          ctx!,
          pPos.x, pPos.y,
          pos.x + swayX, pos.y + swayY,
          edgeColor(n),
        );
      }

      // Vase/pot at center
      drawVase(ctx!, cx, cy);

      // Draw nodes
      for (const n of nodes) {
        if (n.parentId === null) continue; // skip root — vase represents it
        const pos = posMap.get(n.id);
        if (!pos) continue;

        const isActiveTop = n.type === 'top' && n.state === 'active';
        const idx         = activeTops.indexOf(n);
        const swayX       = isActiveTop && idx >= 0
          ? Math.sin(t * 0.8 + idx * 1.2) * 3
          : 0;
        const swayY       = isActiveTop && idx >= 0
          ? Math.cos(t * 0.8 + idx * 1.2) * 1.5
          : 0;

        drawNode(ctx!, pos.x, pos.y, n, swayX, swayY);
      }

      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [nodes, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block' }}
      aria-label="Top-down view of plant node layout"
    />
  );
}
