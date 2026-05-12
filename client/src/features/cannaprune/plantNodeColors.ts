/**
 * plantNodeColors — Paleta e helpers visuais para PlantNodeMap
 *
 * Funções puras sem dependência de React.
 */

import { PlantGraphNode, resolveEdgeState } from '@/features/cannaprune/plantGraph';

// ── Paleta ────────────────────────────────────────────────────────────────────

export const NODE_COLOR = {
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

export const LST_RECOVERY_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

export function isLSTRecovered(n: PlantGraphNode): boolean {
  if (n.state !== 'lst' || !n.lstAppliedAt) return false;
  return Date.now() - new Date(n.lstAppliedAt).getTime() > LST_RECOVERY_MS;
}

// Tipo de renderização visual do nó
export type NodeVisual =
  | 'top'      // top ativo nativo → bola verde com ★
  | 'top-new'  // top ativo pós-topping → bola amarela com ★
  | 'top-fim'  // top ativo pós-fim → bola laranja com ★
  | 'circle';  // tudo o mais → círculo

export function getNodeVisual(n: PlantGraphNode, parentState?: PlantGraphNode['state']): NodeVisual {
  if (n.type === 'top' && n.state === 'active') {
    if (parentState === 'topped') return 'top-new';
    if (parentState === 'fimmed') return 'top-fim';
    return 'top';
  }
  return 'circle';
}

export function getCircleColor(n: PlantGraphNode) {
  if (n.state === 'topped')        return NODE_COLOR.topped;
  if (n.state === 'fimmed')        return NODE_COLOR.fimmed;
  if (n.state === 'lst')           return isLSTRecovered(n) ? NODE_COLOR.lstDone : NODE_COLOR.lst;
  if (n.state === 'super-cropped') return NODE_COLOR.sc;
  if (n.type  === 'root')          return NODE_COLOR.node; // raiz = círculo verde
  return NODE_COLOR.node;
}

export function getCircleLabel(n: PlantGraphNode): string {
  if (n.type === 'root')           return '↑';
  if (n.state === 'topped')        return '✂';
  if (n.state === 'fimmed')        return '~';
  if (n.state === 'lst')           return isLSTRecovered(n) ? String(n.nodeNumber) : '〰';
  if (n.state === 'super-cropped') return '↑';  // seta roxa = recovery
  return String(n.nodeNumber);
}

export function getEdgeColor(n: PlantGraphNode, isSelected: boolean): string {
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

export function getRadius(n: PlantGraphNode, compact = false): number {
  const base = n.type === 'root' ? 14 : n.type === 'top' ? 18 : 17;
  return compact ? Math.round(base * 0.72) : base;
}
