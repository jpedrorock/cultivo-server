/**
 * plantGraph.ts — Modelo de dados para o mapa de nós da planta
 *
 * A planta é representada como uma árvore de nós:
 *   root → internodes → tops
 *
 * Operações são imutáveis: cada função retorna um novo array de nós.
 */

export type GraphNodeType  = 'root' | 'internode' | 'top';
export type GraphNodeState = 'active' | 'topped' | 'fimmed' | 'lst' | 'super-cropped';
export type GraphTechnique = 'topping' | 'fim' | 'lst' | 'super-crop';
export type GraphAction    = 'topping' | 'fim' | 'lst' | 'super-crop' | 'grow' | 'add-branch' | 'add-before' | 'remove';

/** Estado visual da aresta (caule/galho) que conecta este nó ao pai */
export type EdgeState = 'active' | 'defoliated' | 'recovering';

export interface EdgeControl {
  dx1: number; dy1: number;  // cp1 offset from parent node center
  dx2: number; dy2: number;  // cp2 offset from child node center
}

export interface PlantGraphNode {
  id:         string;
  parentId:   string | null;
  type:       GraphNodeType;
  state:      GraphNodeState;
  nodeNumber: number;           // N1, N2… exibido na UI
  technique?:        GraphTechnique;   // técnica aplicada NESTE nó
  edgeCtrl?:         EdgeControl;
  edgeState?:        EdgeState;        // estado visual do caule/galho que chega neste nó
  edgeModifiedAt?:   string;           // ISO date — início do período de recuperação (5 dias azul)
  posX?:             number;           // posição livre no canvas
  posY?:             number;
  pos3D?:            { x: number; y: number; z: number }; // posição 3D world (vista 3D)
  /** Offset 3D do ponto de controle da curva do galho (deste nó até o pai). Se omitido = galho reto. */
  branchBend?:       { x: number; y: number; z: number };
  lstAppliedAt?:     string;           // ISO date — para fade roxo→verde após 7 dias
}

// ── ID helpers ────────────────────────────────────────────────────────────────

let _c = 0;
function uid(): string { return `g${++_c}-${Date.now().toString(36)}`; }

function maxNum(nodes: PlantGraphNode[]): number {
  return nodes.reduce((m, n) => Math.max(m, n.nodeNumber), 0);
}

// ── Estrutura inicial ─────────────────────────────────────────────────────────

export function createInitialGraph(): PlantGraphNode[] {
  // Raiz → N1 → N2 → N3(topo ★)
  // Ao fazer topping em N3: N3 vira ✂, nascem N4 e N5 como novos topos
  return [
    { id: 'root', parentId: null,   type: 'root',      state: 'active', nodeNumber: 0 },
    { id: 'n1',   parentId: 'root', type: 'internode', state: 'active', nodeNumber: 1 },
    { id: 'n2',   parentId: 'n1',   type: 'internode', state: 'active', nodeNumber: 2 },
    { id: 'n3',   parentId: 'n2',   type: 'top',       state: 'active', nodeNumber: 3 },
  ];
}

/** Detecta se um array de nós usa o formato antigo (PlantNode sem nodeNumber) */
export function isLegacyFormat(nodes: unknown[]): boolean {
  if (!nodes.length) return false;
  const first = nodes[0] as Record<string, unknown>;
  return first.nodeNumber === undefined || typeof first.angle === 'number';
}

// ── Tipo de retorno padrão ────────────────────────────────────────────────────

type OpResult = { nodes: PlantGraphNode[]; newIds: string[]; error?: string };

// ── Operações ─────────────────────────────────────────────────────────────────

export function applyTopping(nodes: PlantGraphNode[], id: string): OpResult {
  const t = nodes.find(n => n.id === id);
  if (!t)                   return { nodes, newIds: [], error: 'Nó não encontrado' };
  if (t.type === 'root')    return { nodes, newIds: [], error: 'Não é possível fazer Topping na raiz' };
  if (t.state !== 'active') return { nodes, newIds: [], error: 'Topping requer nó ativo' };

  // Corta a estrutura acima do ponto de topping (simula o corte físico da planta)
  const toRemove = new Set<string>();
  const collectSubtree = (nid: string) => {
    nodes.filter(n => n.parentId === nid).forEach(c => { toRemove.add(c.id); collectSubtree(c.id); });
  };
  collectSubtree(id);
  const baseNodes = nodes.filter(n => !toRemove.has(n.id));

  const m = maxNum(baseNodes);
  const [a, b] = [uid(), uid()];
  return {
    newIds: [a, b],
    nodes: [
      ...baseNodes.map(n => n.id === id
        ? { ...n, type: 'top' as GraphNodeType, state: 'topped' as GraphNodeState, technique: 'topping' as GraphTechnique }
        : n),
      { id: a, parentId: id, type: 'top' as GraphNodeType, state: 'active' as GraphNodeState, nodeNumber: m + 1 },
      { id: b, parentId: id, type: 'top' as GraphNodeType, state: 'active' as GraphNodeState, nodeNumber: m + 2 },
    ],
  };
}

export function applyFIM(nodes: PlantGraphNode[], id: string): OpResult {
  const t = nodes.find(n => n.id === id);
  if (!t)                   return { nodes, newIds: [], error: 'Nó não encontrado' };
  if (t.type !== 'top')     return { nodes, newIds: [], error: 'FIM só pode ser aplicado num topo ativo' };
  if (t.state !== 'active') return { nodes, newIds: [], error: 'Este topo já foi podado' };

  const m = maxNum(nodes);
  const ids = [uid(), uid(), uid(), uid()];
  return {
    newIds: ids,
    nodes: [
      ...nodes.map(n => n.id === id
        ? { ...n, state: 'fimmed' as GraphNodeState, technique: 'fim' as GraphTechnique }
        : n),
      ...ids.map((nid, i) => ({
        id: nid, parentId: id,
        type: 'top' as GraphNodeType, state: 'active' as GraphNodeState,
        nodeNumber: m + i + 1,
      })),
    ],
  };
}

export function applyLST(nodes: PlantGraphNode[], id: string): OpResult {
  const t = nodes.find(n => n.id === id);
  if (!t)                return { nodes, newIds: [], error: 'Nó não encontrado' };
  if (t.type === 'root') return { nodes, newIds: [], error: 'Não é possível aplicar LST na raiz' };
  return {
    newIds: [],
    nodes: nodes.map(n => n.id === id
      ? { ...n, state: 'lst' as GraphNodeState, technique: 'lst' as GraphTechnique,
          lstAppliedAt: new Date().toISOString() }
      : n),
  };
}

export function applySuperCrop(nodes: PlantGraphNode[], id: string): OpResult {
  const t = nodes.find(n => n.id === id);
  if (!t)                   return { nodes, newIds: [], error: 'Nó não encontrado' };
  if (t.type === 'root')    return { nodes, newIds: [], error: 'Não é possível aplicar Super Crop na raiz' };
  if (t.state !== 'active') return { nodes, newIds: [], error: 'Super Crop requer nó ativo' };

  // Remove toda a estrutura acima do ponto e cria 2 novos top buds (igual ao topping mas em roxo)
  const toRemove = new Set<string>();
  const collectSubtree = (nid: string) => {
    nodes.filter(n => n.parentId === nid).forEach(c => { toRemove.add(c.id); collectSubtree(c.id); });
  };
  collectSubtree(id);
  const baseNodes = nodes.filter(n => !toRemove.has(n.id));

  const m = maxNum(baseNodes);
  const [a, b] = [uid(), uid()];
  return {
    newIds: [a, b],
    nodes: [
      ...baseNodes.map(n => n.id === id
        ? { ...n, type: 'top' as GraphNodeType, state: 'super-cropped' as GraphNodeState, technique: 'super-crop' as GraphTechnique }
        : n),
      { id: a, parentId: id, type: 'top' as GraphNodeType, state: 'active' as GraphNodeState, nodeNumber: m + 1 },
      { id: b, parentId: id, type: 'top' as GraphNodeType, state: 'active' as GraphNodeState, nodeNumber: m + 2 },
    ],
  };
}

/** Cresce o nó: sem filhos → estende a haste; com filhos → ramifica lateralmente */
export function growPlant(nodes: PlantGraphNode[], id: string): OpResult {
  const t = nodes.find(n => n.id === id);
  if (!t)                   return { nodes, newIds: [], error: 'Nó não encontrado' };
  if (t.state !== 'active') return { nodes, newIds: [], error: 'Este nó não está ativo' };

  const hasChildren = nodes.some(n => n.parentId === id);
  const m        = maxNum(nodes);
  const newTopId = uid();

  if (!hasChildren) {
    // Top bud (sem filhos): converte em internode e adiciona novo topo acima
    return {
      newIds: [newTopId],
      nodes: [
        ...nodes.map(n => n.id === id ? { ...n, type: 'internode' as GraphNodeType } : n),
        { id: newTopId, parentId: id, type: 'top' as GraphNodeType, state: 'active' as GraphNodeState, nodeNumber: m + 1 },
      ],
    };
  } else {
    // Nó com filhos: ramifica — adiciona novo top bud lateral
    return {
      newIds: [newTopId],
      nodes: [...nodes, {
        id: newTopId, parentId: id,
        type: 'top' as GraphNodeType, state: 'active' as GraphNodeState,
        nodeNumber: m + 1,
      }],
    };
  }
}

/** Remove o nó e todos os seus descendentes */
/**
 * Insere um nó NO MEIO da aresta entre `childId` e seu pai.
 * - Cria um novo internódio entre eles
 * - O filho passa a ter o novo nó como pai
 * - Posições (posX/posY, pos3D) ficam no ponto médio entre pai e filho original
 */
export function insertNodeBefore(nodes: PlantGraphNode[], childId: string): OpResult {
  const child  = nodes.find(n => n.id === childId);
  if (!child)            return { nodes, newIds: [], error: 'Nó não encontrado' };
  if (!child.parentId)   return { nodes, newIds: [], error: 'Não é possível inserir antes da raiz' };
  const parent = nodes.find(n => n.id === child.parentId);
  if (!parent)           return { nodes, newIds: [], error: 'Pai não encontrado' };

  const m     = maxNum(nodes);
  const newId = uid();

  // Posição do novo nó = ponto médio entre pai e filho (se ambos tiverem)
  const midX  = (parent.posX !== undefined && child.posX !== undefined) ? (parent.posX + child.posX) / 2 : undefined;
  const midY  = (parent.posY !== undefined && child.posY !== undefined) ? (parent.posY + child.posY) / 2 : undefined;
  const mid3D = (parent.pos3D && child.pos3D) ? {
    x: (parent.pos3D.x + child.pos3D.x) / 2,
    y: (parent.pos3D.y + child.pos3D.y) / 2,
    z: (parent.pos3D.z + child.pos3D.z) / 2,
  } : undefined;

  const newNode: PlantGraphNode = {
    id:         newId,
    parentId:   parent.id,
    type:       'internode',
    state:      'active',
    nodeNumber: m + 1,
    posX:       midX,
    posY:       midY,
    pos3D:      mid3D,
  };

  return {
    newIds: [newId],
    nodes: [
      ...nodes.map(n => n.id === childId ? { ...n, parentId: newId } : n),
      newNode,
    ],
  };
}

/** Adiciona um galho lateral (novo topo) a partir de qualquer nó não-topo */
export function addLateralBranch(nodes: PlantGraphNode[], nodeId: string): OpResult {
  const t = nodes.find(n => n.id === nodeId);
  if (!t) return { nodes, newIds: [], error: 'Nó não encontrado' };
  if (t.type === 'top' && t.state === 'active') {
    return { nodes, newIds: [], error: 'Topo ativo: use Topping para dividir ou Crescer para estender' };
  }
  const m     = maxNum(nodes);
  const newId = uid();
  return {
    newIds: [newId],
    nodes: [...nodes, {
      id: newId, parentId: nodeId,
      type: 'top' as GraphNodeType, state: 'active' as GraphNodeState,
      nodeNumber: m + 1,
    }],
  };
}

export function removeSubtree(
  nodes: PlantGraphNode[], id: string,
): { nodes: PlantGraphNode[]; error?: string } {
  const t = nodes.find(n => n.id === id);
  if (!t)                return { nodes, error: 'Nó não encontrado' };
  if (t.type === 'root') return { nodes, error: 'Não é possível remover a raiz' };

  const toRemove = new Set<string>();
  function collect(nid: string) {
    toRemove.add(nid);
    nodes.filter(n => n.parentId === nid).forEach(c => collect(c.id));
  }
  collect(id);

  return { nodes: nodes.filter(n => !toRemove.has(n.id)) };
}

// ── Ações disponíveis por nó ──────────────────────────────────────────────────

export function getAvailableActions(node: PlantGraphNode, hasChildren: boolean): GraphAction[] {
  // Raiz: sem ações no menu
  if (node.type === 'root') return [];

  const acts: GraphAction[] = [];

  if (node.state === 'active') {
    if (!hasChildren) {
      // Top bud (último da cadeia, ★): Topping + Crescer
      acts.push('topping', 'grow');
    } else {
      // Nó com filhos à frente: Super Crop + Topping + Crescer
      acts.push('super-crop', 'topping', 'grow');
    }
  }

  // Inserir nó antes (entre este e o pai) — qualquer nó não-raiz
  acts.push('add-before');

  // Todos os nós (exceto raiz) têm Remover
  acts.push('remove');
  return acts;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface PlantStats {
  tops:        number;
  internodes:  number;
  lst:         number;
  superCropped: number;
}

export function getPlantStats(nodes: PlantGraphNode[]): PlantStats {
  return {
    tops:        nodes.filter(n => n.type === 'top' && n.state === 'active').length,
    internodes:  nodes.filter(n => n.type === 'internode').length,
    lst:         nodes.filter(n => n.state === 'lst').length,
    superCropped: nodes.filter(n => n.state === 'super-cropped').length,
  };
}

// ── Layout ────────────────────────────────────────────────────────────────────

export const NODE_R: Record<GraphNodeType, number> = {
  root:      18,
  internode: 21,
  top:       26,
};

const LEAF_W     = 72;   // largura mínima de um nó folha
const PAD_BOTTOM = 60;
const PAD_TOP    = 40;
const PAD_SIDE   = 36;
/** Pixels que um galho LST e todos os seus filhos deslocam horizontalmente */
const LST_LEAN   = 36;

export interface LayoutNode extends PlantGraphNode {
  x: number;
  y: number;
}

export function computeLayout(
  nodes:      PlantGraphNode[],
  svgWidth:   number,
  minHeight:  number,
  levelHeight = 88,   // px entre níveis — menor = mais compacto
): { layoutNodes: LayoutNode[]; svgHeight: number; svgActualWidth: number } {
  if (!nodes.length) return { layoutNodes: [], svgHeight: minHeight, svgActualWidth: svgWidth };

  // Mapa de filhos
  const childMap  = new Map<string, string[]>();
  const nodeById  = new Map<string, PlantGraphNode>();
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

  // Profundidade de cada nó (root = 0)
  const depthMap = new Map<string, number>();
  function calcDepth(id: string, d: number) {
    depthMap.set(id, d);
    (childMap.get(id) ?? []).forEach(c => calcDepth(c, d + 1));
  }
  calcDepth(root.id, 0);
  const maxDepth = Math.max(...[...depthMap.values()]);

  // Largura da subárvore (folha = LEAF_W)
  const wMap = new Map<string, number>();
  function calcW(id: string): number {
    const kids = childMap.get(id) ?? [];
    const w = kids.length ? kids.reduce((s, k) => s + calcW(k), 0) : LEAF_W;
    wMap.set(id, w);
    return w;
  }
  calcW(root.id);

  const treeW   = wMap.get(root.id) ?? svgWidth;
  const startX  = Math.max(PAD_SIDE, (svgWidth - treeW) / 2);
  const svgH0   = Math.max(minHeight, maxDepth * levelHeight + PAD_TOP + PAD_BOTTOM);

  const posMap = new Map<string, { x: number; y: number }>();

  // ── Passo 1: posições base (sem LST) ──────────────────────────────────────
  function assignPos(id: string, left: number, right: number) {
    const depth = depthMap.get(id) ?? 0;
    posMap.set(id, {
      x: (left + right) / 2,
      y: svgH0 - PAD_BOTTOM - depth * levelHeight,
    });
    const kids   = childMap.get(id) ?? [];
    const availW = right - left;
    let cur = left;
    for (const kid of kids) {
      const kw   = wMap.get(kid) ?? LEAF_W;
      const frac = kw / (wMap.get(id) ?? (availW || 1));
      assignPos(kid, cur, cur + frac * availW);
      cur += frac * availW;
    }
  }
  assignPos(root.id, startX, startX + treeW);

  // ── Passo 2: deslocamento LST em cascata ──────────────────────────────────
  // Cada nó com estado 'lst' empurra a si mesmo e todos os seus descendentes
  // LST_LEAN px para a direita (acumulativo se houver vários LST encadeados).
  function applyLSTLean(id: string, cumOffset: number) {
    const node      = nodeById.get(id)!;
    const ownOffset = node.state === 'lst' ? LST_LEAN : 0;
    const total     = cumOffset + ownOffset;
    if (total !== 0) {
      const p = posMap.get(id)!;
      posMap.set(id, { x: p.x + total, y: p.y });
    }
    (childMap.get(id) ?? []).forEach(kid => applyLSTLean(kid, total));
  }
  // Aplica a partir dos filhos da raiz (raiz não se move)
  (childMap.get(root.id) ?? []).forEach(kid => applyLSTLean(kid, 0));

  // ── Passo 3: recalcula bounds para não cortar nada ────────────────────────
  let minX = Infinity, maxX = -Infinity;
  for (const p of posMap.values()) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
  }
  // Se algum nó saiu pela esquerda, empurra tudo para a direita
  const shiftLeft = Math.max(0, PAD_SIDE - minX);
  if (shiftLeft > 0) {
    for (const [id, p] of posMap) posMap.set(id, { x: p.x + shiftLeft, y: p.y });
    maxX += shiftLeft;
  }
  const svgActualWidth = Math.max(svgWidth, maxX + PAD_SIDE);

  // ── Passo 4: posições livres (drag do usuário) sobrepõem o layout ───────────
  for (const n of nodes) {
    if (n.posX !== undefined && n.posY !== undefined) {
      posMap.set(n.id, { x: n.posX, y: n.posY });
    }
  }

  const layoutNodes: LayoutNode[] = nodes.map(n => {
    const pos = posMap.get(n.id) ?? { x: svgActualWidth / 2, y: svgH0 / 2 };
    return { ...n, x: pos.x, y: pos.y };
  });

  return { layoutNodes, svgHeight: svgH0, svgActualWidth };
}

// ── Layout radial (vista de cima) ─────────────────────────────────────────────

/**
 * Layout em vista de cima: raiz no centro, galhos irradiando para fora.
 * - Profundidade na árvore = raio (distância ao centro)
 * - Filhos partilham o setor angular do pai, proporcional ao tamanho da subárvore
 * - Nós LST recebem +40px de raio (puxados para fora)
 * - Posições manuais (posX/posY) sobrepõem o layout calculado
 */
export function computeRadialLayout(
  nodes:          PlantGraphNode[],
  svgWidth:       number,
  minHeight:      number,
  radiusPerLevel = 80,
): { layoutNodes: LayoutNode[]; svgHeight: number; svgActualWidth: number } {
  if (!nodes.length) return { layoutNodes: [], svgHeight: minHeight, svgActualWidth: svgWidth };

  const baseSize = Math.max(svgWidth, minHeight);
  const cx = baseSize / 2;
  const cy = baseSize / 2;

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

  // Posições radiais
  const posMap = new Map<string, { x: number; y: number }>();
  function assign(id: string, startA: number, endA: number, depth: number) {
    const node = nodeById.get(id)!;
    const midA = (startA + endA) / 2;
    const r    = depth * radiusPerLevel + (node.state === 'lst' ? 40 : 0);
    posMap.set(id, {
      x: cx + r * Math.cos(midA),
      y: cy + r * Math.sin(midA),
    });
    const kids  = childMap.get(id) ?? [];
    const total = kids.reduce((s, k) => s + (sizeMap.get(k) ?? 1), 0);
    let curA    = startA;
    for (const kid of kids) {
      const frac = (sizeMap.get(kid) ?? 1) / total;
      const arc  = (endA - startA) * frac;
      assign(kid, curA, curA + arc, depth + 1);
      curA += arc;
    }
  }
  assign(root.id, -Math.PI / 2, Math.PI * 1.5, 0);

  // Override com posições manuais (drag do usuário)
  for (const n of nodes) {
    if (n.posX !== undefined && n.posY !== undefined) {
      posMap.set(n.id, { x: n.posX, y: n.posY });
    }
  }

  // Bounds e shift para evitar cortes
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of posMap.values()) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const PAD    = 50;
  const shiftX = Math.max(0, PAD - minX);
  const shiftY = Math.max(0, PAD - minY);
  if (shiftX > 0 || shiftY > 0) {
    posMap.forEach((p, id) => posMap.set(id, { x: p.x + shiftX, y: p.y + shiftY }));
    maxX += shiftX; maxY += shiftY;
  }

  const svgActualWidth = Math.max(svgWidth, maxX + PAD);
  const svgHeight      = Math.max(minHeight, maxY + PAD);

  const layoutNodes: LayoutNode[] = nodes.map(n => {
    const pos = posMap.get(n.id) ?? { x: cx, y: cy };
    return { ...n, x: pos.x, y: pos.y };
  });

  return { layoutNodes, svgHeight, svgActualWidth };
}

// ── Layout isométrico ─────────────────────────────────────────────────────────

/**
 * Layout isométrico (vista 30°): planta cresce em altura + galhos irradiam horizontalmente.
 *
 * Mundo 3D:
 *   - worldX, worldZ: posição radial (mesma lógica do top-down)
 *   - worldY: altura (depth × levelHeight) — planta cresce para cima
 *
 * Projeção isométrica:
 *   screenX = (worldX - worldZ) × cos(30°)
 *   screenY = (worldX + worldZ) × sin(30°) - worldY
 *
 * Posições manuais (posX/posY) são em coordenadas de tela e sobrepõem a projeção.
 */
export function computeIsoLayout(
  nodes:           PlantGraphNode[],
  svgWidth:        number,
  minHeight:       number,
  radiusPerLevel = 70,
  heightPerLevel = 65,
): { layoutNodes: LayoutNode[]; svgHeight: number; svgActualWidth: number } {
  if (!nodes.length) return { layoutNodes: [], svgHeight: minHeight, svgActualWidth: svgWidth };

  const ISO_COS = Math.cos(Math.PI / 6);
  const ISO_SIN = Math.sin(Math.PI / 6);

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

  // Posições projetadas (centradas em 0,0 — vamos shift depois)
  const posMap = new Map<string, { x: number; y: number }>();

  function assign(
    id: string, startA: number, endA: number, depth: number, parentR: number,
  ) {
    const node    = nodeById.get(id)!;
    const isRoot  = node.parentId === null;
    const midA    = (startA + endA) / 2;
    const baseR   = isRoot ? 0 : parentR + radiusPerLevel;
    const r       = baseR + (node.state === 'lst' ? 35 : 0);
    const wx      = r * Math.cos(midA);
    const wz      = r * Math.sin(midA);
    const wy      = depth * heightPerLevel;
    posMap.set(id, {
      x: (wx - wz) * ISO_COS,
      y: (wx + wz) * ISO_SIN - wy,
    });

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

  // Override com posições manuais (drag do usuário) — em coords de tela
  for (const n of nodes) {
    if (n.posX !== undefined && n.posY !== undefined) {
      posMap.set(n.id, { x: n.posX, y: n.posY });
    }
  }

  // Bounds e shift para evitar cortes
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of posMap.values()) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const PAD    = 60;
  const shiftX = Math.max(PAD, PAD - minX);
  const shiftY = Math.max(PAD, PAD - minY);
  posMap.forEach((p, id) => posMap.set(id, { x: p.x + shiftX, y: p.y + shiftY }));
  const finalMaxX = maxX + shiftX;
  const finalMaxY = maxY + shiftY;

  const svgActualWidth = Math.max(svgWidth, finalMaxX + PAD);
  const svgHeight      = Math.max(minHeight, finalMaxY + PAD);

  const layoutNodes: LayoutNode[] = nodes.map(n => {
    const pos = posMap.get(n.id) ?? { x: svgActualWidth / 2, y: svgHeight / 2 };
    return { ...n, x: pos.x, y: pos.y };
  });

  return { layoutNodes, svgHeight, svgActualWidth };
}

// ── Helpers de estado de aresta ────────────────────────────────────────────────

export const EDGE_RECOVERY_MS  = 5 * 24 * 60 * 60 * 1000; // 5 dias azul

/** Resolve a cor visual atual de uma aresta dado seu estado e timestamp */
export function resolveEdgeState(n: PlantGraphNode): EdgeState {
  if (n.edgeState === 'defoliated') return 'defoliated';
  if (n.edgeState === 'recovering' && n.edgeModifiedAt) {
    const elapsed = Date.now() - new Date(n.edgeModifiedAt).getTime();
    if (elapsed < EDGE_RECOVERY_MS) return 'recovering';
    // Passou dos 5 dias — volta para active automaticamente
  }
  return 'active';
}

/** Marca aresta como em recuperação (após mover nó) */
export function setEdgeRecovering(
  nodes: PlantGraphNode[], id: string,
): PlantGraphNode[] {
  return nodes.map(n =>
    n.id === id
      ? { ...n, edgeState: 'recovering' as EdgeState, edgeModifiedAt: new Date().toISOString() }
      : n,
  );
}

/** Aplica desfolha na aresta */
export function setEdgeDefoliated(
  nodes: PlantGraphNode[], id: string,
): PlantGraphNode[] {
  return nodes.map(n =>
    n.id === id ? { ...n, edgeState: 'defoliated' as EdgeState, edgeModifiedAt: new Date().toISOString() } : n,
  );
}

/** Restaura aresta para active */
export function setEdgeActive(
  nodes: PlantGraphNode[], id: string,
): PlantGraphNode[] {
  return nodes.map(n =>
    n.id === id ? { ...n, edgeState: 'active' as EdgeState, edgeModifiedAt: undefined } : n,
  );
}
