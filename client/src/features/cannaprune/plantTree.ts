// CannaPrune — Pure plant tree logic
// SVG viewBox: 0 0 450 600  |  Y increases downward
// Angle convention: degrees, 0=right, 90=down, 180=left, 270=up

export type NodeType  = 'main-stem' | 'node' | 'top' | 'side-branch' | 'fan-leaf' | 'new-growth';
export type NodeState = 'active' | 'pruned' | 'super-cropped' | 'lst' | 'removed';

export interface PlantNode {
  id: string;
  x: number;
  y: number;
  parentId: string | null;
  children: string[];          // ids of direct children
  type: NodeType;
  state: NodeState;
  generation: number;          // 0=main stem, 1=first branch level, etc.
  height: number;              // 0..1 normalised, used for lollipopping threshold
  angle: number;               // degrees, direction this branch travels FROM parent
  length: number;              // SVG px — distance from (x,y) to tip
  width: number;               // stroke width in SVG px
  pruneType?: string;
  swayOffset?: number;         // random phase offset for wind animation (radians)
}

// ── Coordinate helpers ────────────────────────────────────────────────────────

function rad(deg: number) { return (deg * Math.PI) / 180; }

/** Endpoint (tip) of a branch — where children attach */
export function tipOf(node: PlantNode): { x: number; y: number } {
  return {
    x: node.x + node.length * Math.cos(rad(node.angle)),
    y: node.y + node.length * Math.sin(rad(node.angle)),
  };
}

function clampCoord(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

let _counter = 0;
function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${++_counter}`;
}

// ── Initial plant structure ───────────────────────────────────────────────────
// ViewBox 450×600, pot at bottom-center
// Main stem: (225, 510) → (225, 190)  three nodes + main top
// Each node sprouts two side branches that each have a small top

export function createInitialPlant(): PlantNode[] {
  const nodes: PlantNode[] = [];

  function add(n: PlantNode) {
    nodes.push({ ...n, swayOffset: Math.random() * Math.PI * 2 });
  }

  // Stem base (invisible anchor)
  add({ id: 'stem',  x:225, y:510, parentId:null,    children:['node-1'],             type:'main-stem', state:'active', generation:0, height:0,    angle:270, length:80, width:6 });
  // 3 branching nodes on main stem
  add({ id: 'node-1', x:225, y:430, parentId:'stem',   children:['node-2','bl-1','br-1'], type:'node',      state:'active', generation:0, height:0.2,  angle:270, length:80, width:5.5 });
  add({ id: 'node-2', x:225, y:350, parentId:'node-1', children:['node-3','bl-2','br-2'], type:'node',      state:'active', generation:0, height:0.5,  angle:270, length:80, width:5 });
  add({ id: 'node-3', x:225, y:270, parentId:'node-2', children:['top-main','bl-3','br-3'], type:'node',    state:'active', generation:0, height:0.75, angle:270, length:80, width:4.5 });
  // Main top
  add({ id: 'top-main', x:225, y:190, parentId:'node-3', children:[], type:'top', state:'active', generation:1, height:1.0, angle:270, length:55, width:3 });

  // Helper: branch endpoint
  function branchTip(nx:number, ny:number, angle:number, len:number) {
    return { x: nx + len * Math.cos(rad(angle)), y: ny + len * Math.sin(rad(angle)) };
  }

  // Node 1 side branches (y=430) — angle 210° left, 330° right
  const bl1 = branchTip(225,430, 210, 72);
  add({ id:'bl-1', x:225, y:430, parentId:'node-1', children:['top-bl-1'], type:'side-branch', state:'active', generation:1, height:0.25, angle:210, length:72, width:3 });
  add({ id:'top-bl-1', x:bl1.x, y:bl1.y, parentId:'bl-1', children:[], type:'top', state:'active', generation:2, height:0.35, angle:210, length:35, width:2.2 });

  const br1 = branchTip(225,430, 330, 72);
  add({ id:'br-1', x:225, y:430, parentId:'node-1', children:['top-br-1'], type:'side-branch', state:'active', generation:1, height:0.25, angle:330, length:72, width:3 });
  add({ id:'top-br-1', x:br1.x, y:br1.y, parentId:'br-1', children:[], type:'top', state:'active', generation:2, height:0.35, angle:330, length:35, width:2.2 });

  // Node 2 side branches (y=350)
  const bl2 = branchTip(225,350, 213, 65);
  add({ id:'bl-2', x:225, y:350, parentId:'node-2', children:['top-bl-2'], type:'side-branch', state:'active', generation:1, height:0.52, angle:213, length:65, width:2.8 });
  add({ id:'top-bl-2', x:bl2.x, y:bl2.y, parentId:'bl-2', children:[], type:'top', state:'active', generation:2, height:0.62, angle:213, length:32, width:2 });

  const br2 = branchTip(225,350, 327, 65);
  add({ id:'br-2', x:225, y:350, parentId:'node-2', children:['top-br-2'], type:'side-branch', state:'active', generation:1, height:0.52, angle:327, length:65, width:2.8 });
  add({ id:'top-br-2', x:br2.x, y:br2.y, parentId:'br-2', children:[], type:'top', state:'active', generation:2, height:0.62, angle:327, length:32, width:2 });

  // Node 3 side branches (y=270)
  const bl3 = branchTip(225,270, 216, 58);
  add({ id:'bl-3', x:225, y:270, parentId:'node-3', children:['top-bl-3'], type:'side-branch', state:'active', generation:1, height:0.77, angle:216, length:58, width:2.5 });
  add({ id:'top-bl-3', x:bl3.x, y:bl3.y, parentId:'bl-3', children:[], type:'top', state:'active', generation:2, height:0.85, angle:216, length:28, width:1.8 });

  const br3 = branchTip(225,270, 324, 58);
  add({ id:'br-3', x:225, y:270, parentId:'node-3', children:['top-br-3'], type:'side-branch', state:'active', generation:1, height:0.77, angle:324, length:58, width:2.5 });
  add({ id:'top-br-3', x:br3.x, y:br3.y, parentId:'br-3', children:[], type:'top', state:'active', generation:2, height:0.85, angle:324, length:28, width:1.8 });

  return nodes;
}

// ── Immutable update helpers ─────────────────────────────────────────────────

function updateNode(nodes: PlantNode[], id: string, patch: Partial<PlantNode>): PlantNode[] {
  return nodes.map(n => (n.id === id ? { ...n, ...patch } : n));
}

/** After a parent node's x/y or angle changes, cascade new positions to all children recursively */
function propagatePositions(nodes: PlantNode[], parentId: string): PlantNode[] {
  const parent = nodes.find(n => n.id === parentId);
  if (!parent) return nodes;
  const tip = tipOf(parent);
  let result = nodes;
  for (const childId of parent.children) {
    const child = result.find(n => n.id === childId);
    if (!child) continue;
    // Reposition child at the tip of parent, keep same angle/length
    result = updateNode(result, childId, { x: tip.x, y: tip.y });
    // Recurse
    result = propagatePositions(result, childId);
  }
  return result;
}

// ── Technique execution (pure, return new PlantNode[]) ───────────────────────

const MAX_GENERATION = 6;

/**
 * TOPPING — corta o topo, cria 2 novos brotos em ±25° do ângulo atual
 */
export function applyTopping(nodes: PlantNode[], nodeId: string): { nodes: PlantNode[]; error?: string } {
  const target = nodes.find(n => n.id === nodeId);
  if (!target || target.state !== 'active') return { nodes, error: 'Nó não disponível' };
  if (target.generation >= MAX_GENERATION) return { nodes, error: 'Profundidade máxima atingida' };

  const tip = tipOf(target);
  const newLen = clampCoord(target.length * 0.8, 20, 120);
  const newWidth = Math.max(1.2, target.width * 0.75);
  const gen = target.generation + 1;

  const makeTop = (angle: number): PlantNode => ({
    id: uid('top'),
    x: clampCoord(tip.x, 10, 440),
    y: clampCoord(tip.y, 10, 590),
    parentId: nodeId,
    children: [],
    type: 'new-growth',
    state: 'active',
    generation: gen,
    height: Math.min(1, target.height + 0.1),
    angle,
    length: newLen,
    width: newWidth,
    pruneType: undefined,
  });

  const leftTop  = makeTop(target.angle - 25);
  const rightTop = makeTop(target.angle + 25);

  let result = updateNode(nodes, nodeId, {
    state: 'pruned',
    pruneType: 'topping',
    children: [...target.children, leftTop.id, rightTop.id],
  });
  result = [...result, leftTop, rightTop];

  return { nodes: result };
}

/**
 * FIMMING — corta parcialmente, cria 3 novos brotos em -30°, 0°, +30°
 */
export function applyFimming(nodes: PlantNode[], nodeId: string): { nodes: PlantNode[]; error?: string } {
  const target = nodes.find(n => n.id === nodeId);
  if (!target || target.state !== 'active') return { nodes, error: 'Nó não disponível' };
  if (target.generation >= MAX_GENERATION) return { nodes, error: 'Profundidade máxima atingida' };

  const tip = tipOf(target);
  const newLen = clampCoord(target.length * 0.7, 18, 110);
  const newWidth = Math.max(1.2, target.width * 0.7);
  const gen = target.generation + 1;

  const newTops = [-30, 0, 30].map(offset => ({
    id: uid('fim'),
    x: clampCoord(tip.x, 10, 440),
    y: clampCoord(tip.y, 10, 590),
    parentId: nodeId,
    children: [] as string[],
    type: 'new-growth' as NodeType,
    state: 'active' as NodeState,
    generation: gen,
    height: Math.min(1, target.height + 0.08),
    angle: target.angle + offset,
    length: newLen,
    width: newWidth,
  }));

  let result = updateNode(nodes, nodeId, {
    state: 'pruned',
    pruneType: 'fim',
    children: [...target.children, ...newTops.map(t => t.id)],
  });
  result = [...result, ...newTops];

  return { nodes: result };
}

/**
 * SUPER CROPPING — dobra o galho em direção horizontal, estado visual especial
 */
export function applySuperCropping(nodes: PlantNode[], nodeId: string): { nodes: PlantNode[]; error?: string } {
  const target = nodes.find(n => n.id === nodeId);
  if (!target || target.state !== 'active') return { nodes, error: 'Nó não disponível' };

  // Lerp angle toward 90° (downward-horizontal in SVG) by 50%
  const newAngle = target.angle + 0.5 * (90 - target.angle);

  let result = updateNode(nodes, nodeId, { angle: newAngle, state: 'super-cropped', pruneType: 'super_cropping' });
  result = propagatePositions(result, nodeId);

  return { nodes: result };
}

/**
 * LST — dobra o galho +35° (mais horizontal/pendente)
 */
export function applyLST(nodes: PlantNode[], nodeId: string): { nodes: PlantNode[]; error?: string } {
  const target = nodes.find(n => n.id === nodeId);
  if (!target || target.state !== 'active') return { nodes, error: 'Nó não disponível' };

  const newAngle = target.angle + 35;

  let result = updateNode(nodes, nodeId, { angle: newAngle, state: 'lst', pruneType: 'lst' });
  result = propagatePositions(result, nodeId);

  return { nodes: result };
}

/**
 * DEFOLIAÇÃO — remove uma folha (fan-leaf)
 */
export function applyDefoliation(nodes: PlantNode[], nodeId: string): { nodes: PlantNode[]; error?: string } {
  const target = nodes.find(n => n.id === nodeId);
  if (!target) return { nodes, error: 'Nó não encontrado' };

  return { nodes: updateNode(nodes, nodeId, { state: 'removed', pruneType: 'defoliation' }) };
}

/**
 * LOLLIPOPPING — remove todo crescimento abaixo do 1/3 inferior
 */
export function applyLollipopping(nodes: PlantNode[]): { nodes: PlantNode[]; removed: number } {
  const threshold = 0.33;
  let removed = 0;

  const result = nodes.map(n => {
    if (
      n.state !== 'active' ||
      n.height >= threshold ||
      n.type === 'main-stem' ||
      n.type === 'node'
    ) return n;
    removed++;
    return { ...n, state: 'removed' as NodeState, pruneType: 'lollipopping' };
  });

  return { nodes: result, removed };
}

// ── Available techniques per node ────────────────────────────────────────────

export type TechniqueAction = 'topping' | 'fim' | 'super-crop' | 'lst' | 'defoliation';
/** Editor actions — structural modifications */
export type EditorAction   = 'add-branch' | 'extend-stem';
export type AnyAction      = TechniqueAction | EditorAction;

export function getAvailableTechniques(node: PlantNode): TechniqueAction[] {
  if (node.state !== 'active') return [];
  if (node.type === 'top' || node.type === 'new-growth') return ['topping', 'fim', 'super-crop'];
  if (node.type === 'side-branch') return ['lst', 'super-crop'];
  if (node.type === 'fan-leaf') return ['defoliation'];
  return [];
}

/** All actions available on a node, including structural editor actions */
export function getAvailableActions(node: PlantNode): AnyAction[] {
  const techs = getAvailableTechniques(node);
  const editor: EditorAction[] = [];

  if (node.state === 'active') {
    if (node.type === 'node' || node.type === 'main-stem') {
      editor.push('add-branch');
    }
    if (node.type === 'top' || node.type === 'new-growth') {
      editor.push('extend-stem');
    }
  }

  return [...techs, ...editor];
}

// ── Editor: structural additions ─────────────────────────────────────────────

/**
 * ADD BRANCH — adds a pair of side branches to a node/stem segment.
 * If one side already exists, only the missing side is added.
 */
export function addBranchToNode(nodes: PlantNode[], nodeId: string): { nodes: PlantNode[]; error?: string } {
  const target = nodes.find(n => n.id === nodeId);
  if (!target) return { nodes, error: 'Nó não encontrado' };
  if (target.generation >= MAX_GENERATION) return { nodes, error: 'Profundidade máxima atingida' };

  const existingBranches = nodes.filter(n => n.parentId === nodeId && n.type === 'side-branch' && n.state !== 'removed');
  const hasLeft  = existingBranches.some(n => n.angle > 150 && n.angle < 270);
  const hasRight = existingBranches.some(n => n.angle > 270 || n.angle < 90 || (n.angle > 0 && n.angle < 90));

  const baseAngleLeft  = 210 + (target.generation * 2);
  const baseAngleRight = 330 - (target.generation * 2);

  const sides: { angle: number }[] = [];
  if (!hasLeft)  sides.push({ angle: baseAngleLeft });
  if (!hasRight) sides.push({ angle: baseAngleRight });
  if (sides.length === 0) return { nodes, error: 'Já existem galhos em ambos os lados' };

  const branchLen   = Math.max(30, Math.min(70, target.length * 0.85));
  const branchWidth = Math.max(1.5, target.width * 0.6);
  const topLen      = branchLen * 0.5;
  const topWidth    = Math.max(1.2, branchWidth * 0.75);

  let result = nodes;
  for (const { angle } of sides) {
    const branchId = uid('br');
    const topId    = uid('tp');

    const tipX = target.x + branchLen * Math.cos(rad(angle));
    const tipY = target.y + branchLen * Math.sin(rad(angle));

    const branch: PlantNode = {
      id: branchId, x: target.x, y: target.y,
      parentId: nodeId, children: [topId],
      type: 'side-branch', state: 'active',
      generation: target.generation + 1,
      height: Math.min(1, target.height + 0.05),
      angle, length: branchLen, width: branchWidth,
      swayOffset: Math.random() * Math.PI * 2,
    };
    const top: PlantNode = {
      id: topId, x: tipX, y: tipY,
      parentId: branchId, children: [],
      type: 'top', state: 'active',
      generation: target.generation + 2,
      height: Math.min(1, target.height + 0.08),
      angle, length: topLen, width: topWidth,
      swayOffset: Math.random() * Math.PI * 2,
    };

    result = [
      ...result.map(n => n.id === nodeId ? { ...n, children: [...n.children, branchId] } : n),
      branch, top,
    ];
  }

  return { nodes: result };
}

/**
 * EXTEND STEM — adds a new node segment + new top above an existing top/new-growth.
 * Used to make the plant taller manually.
 */
export function extendStem(nodes: PlantNode[], topNodeId: string): { nodes: PlantNode[]; error?: string } {
  const target = nodes.find(n => n.id === topNodeId);
  if (!target || target.state !== 'active') return { nodes, error: 'Nó não disponível' };
  if (target.generation >= MAX_GENERATION) return { nodes, error: 'Altura máxima atingida' };
  if (target.children.length > 0) return { nodes, error: 'Já existem galhos aqui — aplique Topping primeiro' };

  const tip = tipOf(target);
  const newNodeId = uid('node');
  const newTopId  = uid('top');
  const newLen    = Math.max(60, target.length);
  const newWidth  = Math.max(3.5, target.width + 0.5);

  const newNode: PlantNode = {
    id: newNodeId, x: tip.x, y: tip.y,
    parentId: topNodeId, children: [newTopId],
    type: 'node', state: 'active',
    generation: target.generation + 1,
    height: Math.min(1, target.height + 0.12),
    angle: 270, length: newLen, width: newWidth,
    swayOffset: Math.random() * Math.PI * 2,
  };

  const newTipX = tip.x + newLen * Math.cos(rad(270));
  const newTipY = tip.y + newLen * Math.sin(rad(270));

  const newTop: PlantNode = {
    id: newTopId, x: newTipX, y: newTipY,
    parentId: newNodeId, children: [],
    type: 'top', state: 'active',
    generation: target.generation + 2,
    height: Math.min(1, target.height + 0.18),
    angle: 270, length: Math.max(40, target.length * 0.7), width: Math.max(2, newWidth * 0.7),
    swayOffset: Math.random() * Math.PI * 2,
  };

  let result = nodes.map(n => n.id === topNodeId ? { ...n, children: [newNodeId] } : n);
  result = [...result, newNode, newTop];
  result = propagatePositions(result, newNodeId);

  return { nodes: result };
}

export function getNodeLabel(node: PlantNode): string {
  const labels: Record<NodeType, string> = {
    'main-stem':  'Caule Principal',
    'node':       'Nó de Ramificação',
    'top':        'Topo / Ápice',
    'side-branch':'Galho Lateral',
    'fan-leaf':   'Folha (Fan Leaf)',
    'new-growth': 'Novo Broto',
  };
  return labels[node.type] ?? node.type;
}
