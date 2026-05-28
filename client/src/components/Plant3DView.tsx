/**
 * Plant3DView — Editor 3D real (Three.js vanilla)
 *
 * Usa Three.js diretamente (sem react-three-fiber para evitar problemas
 * de React duplicado em Vite). React apenas gerencia o lifecycle do canvas.
 *
 * - Cena 3D rotacionável com OrbitControls
 * - Vaso, terra, caule e galhos em 3D
 * - Click num nó → menu de ações
 * - Save automático após cada técnica (mesma rota do PlantNodeMap)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  PlantGraphNode, GraphAction,
  applyTopping, applyFIM, applyLST, applySuperCrop,
  growPlant, addLateralBranch, insertNodeBefore, removeSubtree,
  getAvailableActions, createInitialGraph,
} from "@/features/cannaprune/plantGraph";
import {
  Scissors, Zap, Leaf, ArrowUp, GitBranch, GitMerge, Trash2, X,
  ZoomIn, ZoomOut, Maximize2, RotateCcw,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const COLOR = {
  active:        "#22c55e",
  lst:           "#8b5cf6",
  topped:        "#ef4444",
  fimmed:        "#f97316",
  superCropped:  "#fb923c",
  branch:        "#86efac",
  branchLst:     "#a78bfa",
  pot:           "#5c3317",
  potDark:       "#3d2008",
  ground:        "#1a1a22",
  bg:            "#0a0a0f",
};

function nodeColor(n: PlantGraphNode): string {
  switch (n.state) {
    case 'lst':           return COLOR.lst;
    case 'topped':        return COLOR.topped;
    case 'fimmed':        return COLOR.fimmed;
    case 'super-cropped': return COLOR.superCropped;
    default:              return COLOR.active;
  }
}

// ── Recursos Three.js compartilhados (criados uma vez, nunca descartados) ─────
// Evita criar/descartar centenas de geometrias e materiais a cada setNodes.

const R_INNER = 0.018;
const R_TOP   = 0.025;

/** Geometrias fixas (forma não muda entre nós) */
const GEO = {
  nodeInner: new THREE.SphereGeometry(R_INNER, 24, 24),
  nodeTop:   new THREE.SphereGeometry(R_TOP,   24, 24),
  bud:       new THREE.ConeGeometry(R_TOP * 0.7, R_TOP * 1.4, 12),
  ringInner: new THREE.RingGeometry(R_INNER * 1.5, R_INNER * 1.7, 32),
  ringTop:   new THREE.RingGeometry(R_TOP   * 1.5, R_TOP   * 1.7, 32),
};

/** Materiais compartilhados (cor não varia entre instâncias do mesmo tipo) */
const MAT = {
  nodeActive:  new THREE.MeshStandardMaterial({ color: COLOR.active,       emissive: COLOR.active,       emissiveIntensity: 0.18, roughness: 0.4 }),
  nodeTop:     new THREE.MeshStandardMaterial({ color: COLOR.active,       emissive: COLOR.active,       emissiveIntensity: 0.35, roughness: 0.4 }),
  nodeLst:     new THREE.MeshStandardMaterial({ color: COLOR.lst,          emissive: COLOR.lst,          emissiveIntensity: 0.18, roughness: 0.4 }),
  nodeTopped:  new THREE.MeshStandardMaterial({ color: COLOR.topped,       emissive: COLOR.topped,       emissiveIntensity: 0.18, roughness: 0.4 }),
  nodeFimmed:  new THREE.MeshStandardMaterial({ color: COLOR.fimmed,       emissive: COLOR.fimmed,       emissiveIntensity: 0.18, roughness: 0.4 }),
  nodeSc:      new THREE.MeshStandardMaterial({ color: COLOR.superCropped, emissive: COLOR.superCropped, emissiveIntensity: 0.18, roughness: 0.4 }),
  branchAct:   new THREE.MeshStandardMaterial({ color: COLOR.branch,    roughness: 0.6 }),
  branchLst:   new THREE.MeshStandardMaterial({ color: COLOR.branchLst, roughness: 0.6 }),
  hitbox:      new THREE.MeshBasicMaterial({ visible: false, transparent: true, opacity: 0 }),
  bud:         new THREE.MeshStandardMaterial({ color: "#a3e635", emissive: "#65a30d", emissiveIntensity: 0.3, roughness: 0.6 }),
  ring:        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
};

function getNodeMat(n: PlantGraphNode, isTop: boolean): THREE.MeshStandardMaterial {
  if (isTop) return MAT.nodeTop;
  switch (n.state) {
    case 'lst':           return MAT.nodeLst;
    case 'topped':        return MAT.nodeTopped;
    case 'fimmed':        return MAT.nodeFimmed;
    case 'super-cropped': return MAT.nodeSc;
    default:              return MAT.nodeActive;
  }
}

// ── Layout 3D radial ──────────────────────────────────────────────────────────

interface Pos3D { x: number; y: number; z: number }

function computeLayout3D(nodes: PlantGraphNode[], startY = 0.4): Map<string, Pos3D> {
  const positions = new Map<string, Pos3D>();
  if (nodes.length === 0) return positions;

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

  const sizeMap = new Map<string, number>();
  function calcSize(id: string): number {
    const kids = childMap.get(id) ?? [];
    const s = kids.length === 0 ? 1 : kids.reduce((a, c) => a + calcSize(c), 0);
    sizeMap.set(id, s);
    return s;
  }
  calcSize(root.id);

  // Escala realista: 1 unidade = ~1 metro
  // Cannabis típico: internódio 3-8cm, espalhamento 5-15cm por galho lateral
  const RADIUS_PER_LEVEL = 0.10;   // 10cm de spread por nível
  const HEIGHT_PER_LEVEL = 0.08;   // 8cm por internódio
  const LST_BEND         = 0.06;   // LST puxa 6cm para fora

  function assign(id: string, startA: number, endA: number, depth: number, parentR: number) {
    const node    = nodeById.get(id)!;
    const isRoot  = node.parentId === null;
    const midA    = (startA + endA) / 2;
    const baseR   = isRoot ? 0 : parentR + RADIUS_PER_LEVEL;
    const r       = baseR + (node.state === 'lst' ? LST_BEND : 0);
    positions.set(id, {
      x: r * Math.cos(midA),
      y: depth * HEIGHT_PER_LEVEL + startY,
      z: r * Math.sin(midA),
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

  // Override com posições manuais (pos3D) — drag do user em 3D
  for (const n of nodes) {
    if (n.pos3D) positions.set(n.id, { x: n.pos3D.x, y: n.pos3D.y, z: n.pos3D.z });
  }

  return positions;
}

// ── Menu de ações (HTML overlay) ─────────────────────────────────────────────

const ACTION_META: Partial<Record<GraphAction, { label: string; Icon: any; color: string; shortDesc: string }>> = {
  topping:      { label: 'Topping',       Icon: Scissors,  color: '#ef4444', shortDesc: 'corta + 2 topos novos' },
  fim:          { label: 'FIM',           Icon: Scissors,  color: '#f97316', shortDesc: 'até 4 brotos' },
  lst:          { label: 'LST',           Icon: Leaf,      color: '#8b5cf6', shortDesc: 'inclina galho' },
  'super-crop': { label: 'Super Crop',    Icon: Zap,       color: '#fb923c', shortDesc: 'esmaga estrutura' },
  grow:         { label: 'Crescer',       Icon: ArrowUp,   color: '#22c55e', shortDesc: 'estende' },
  'add-branch': { label: 'Galho lateral', Icon: GitBranch, color: '#22c55e', shortDesc: 'novo topo' },
  'add-before': { label: 'Inserir nó',    Icon: GitMerge,  color: '#60a5fa', shortDesc: 'entre este e o pai' },
};

interface MenuProps {
  node:     PlantGraphNode;
  actions:  GraphAction[];
  onClose:  () => void;
  onAction: (a: GraphAction) => void;
}

function ActionMenu({ node, actions, onClose, onAction }: MenuProps) {
  const main = actions.filter(a => a !== 'remove');
  const hasRemove = actions.includes('remove');
  return (
    <>
      <div className="fixed inset-0 z-[199]" onClick={onClose} />
      <div className="fixed z-[200] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[240px]"
        onClick={e => e.stopPropagation()}>
        <div className="bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: nodeColor(node) }} />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-bold">N{node.nodeNumber}</span>
              <span className="text-xs text-muted-foreground ml-1.5">{node.type === 'top' && node.state === 'active' ? '★ top bud' : node.state}</span>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="py-1.5">
            {main.map(action => {
              const meta = ACTION_META[action];
              if (!meta) return null;
              const Icon = meta.Icon;
              return (
                <button key={action} onClick={() => onAction(action)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 active:bg-muted transition-colors">
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: meta.color + '22' }}>
                    <Icon className="w-4 h-4" style={{ color: meta.color }} />
                  </span>
                  <div>
                    <span className="text-sm font-semibold block leading-tight">{meta.label}</span>
                    <span className="text-xs text-muted-foreground">{meta.shortDesc}</span>
                  </div>
                </button>
              );
            })}
            {hasRemove && (
              <>
                <div className="h-px bg-border/30 mx-4 my-1" />
                <button onClick={() => onAction('remove')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-red-500/10 active:bg-red-500/20 transition-colors">
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
          </div>
        </div>
      </div>
    </>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Plant3DViewProps {
  plantId?:           number;
  /** Altura em px. Se omitido, preenche 100% do contêiner pai. */
  height?:            number;
  /** Tamanho do vaso em litros (default 5L) */
  potSizeL?:          number;
  onTechniqueApplied?: (technique: string, nodeLabel: string) => void;
}

export default function Plant3DView({
  plantId, height, potSizeL = 5, onTechniqueApplied,
}: Plant3DViewProps) {
  const mountRef     = useRef<HTMLDivElement>(null);
  const [nodes,           setNodes]           = useState<PlantGraphNode[]>([]);
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // Refs Three.js (acessíveis no callback de click)
  const sceneRef       = useRef<THREE.Scene | null>(null);
  const cameraRef      = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef    = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef    = useRef<OrbitControls | null>(null);
  const nodeMeshesRef    = useRef<Map<string, THREE.Mesh>>(new Map());
  const branchMeshesRef  = useRef<Map<string, THREE.Mesh>>(new Map());
  const bendHandleRef    = useRef<THREE.Mesh | null>(null);
  const groupRef         = useRef<THREE.Group | null>(null);
  const vaseGroupRef   = useRef<THREE.Group | null>(null);
  const raycasterRef   = useRef<THREE.Raycaster>(new THREE.Raycaster());
  // Refs para callbacks de commit (sem stale closure)
  const nodeDragCommitRef   = useRef<((id: string, pos: { x: number; y: number; z: number }) => void) | null>(null);
  const branchBendCommitRef = useRef<((nodeId: string, bend: { x: number; y: number; z: number } | null) => void) | null>(null);

  // Persistência
  const utils = trpc.useUtils();
  const { data: saved } = trpc.plantStructure.get.useQuery(
    { plantId: plantId! },
    { enabled: !!plantId, refetchOnWindowFocus: false },
  );
  const saveMutation = trpc.plantStructure.save.useMutation({
    onSuccess: () => { if (plantId) utils.plantStructure.get.invalidate({ plantId }); },
    onError:   () => toast.error("Erro ao salvar"),
  });

  // Carrega do DB
  const didFitRef = useRef(false);
  useEffect(() => {
    if (saved === undefined) return;
    const raw = saved?.nodes as PlantGraphNode[] | undefined;
    setNodes(raw && raw.length > 0 ? raw : createInitialGraph());
  }, [saved]);

  // Quando potSizeL muda → libera auto-fit para enquadrar com o novo vaso
  useEffect(() => { didFitRef.current = false; }, [potSizeL]);

  // Auto-fit no primeiro carregamento e ao trocar potSizeL (depois que cena+nós prontos)
  useEffect(() => {
    if (didFitRef.current) return;
    if (nodes.length === 0 || !cameraRef.current || !controlsRef.current) return;
    // Pequeno delay para garantir que o vaso foi reconstruído
    const t = setTimeout(() => {
      fitToPlant();
      didFitRef.current = true;
    }, 120);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, potSizeL]);

  // Topo do solo varia com o tamanho do vaso (mesma fórmula do useEffect do vaso)
  const potHeight = 0.36 * Math.cbrt(potSizeL / 5);
  const positions = useMemo(() => computeLayout3D(nodes, potHeight + 0.04), [nodes, potHeight]);

  // Setup inicial da cena Three.js (uma vez)
  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const w = mount.clientWidth;
    const h = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLOR.bg);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.05, 50);
    camera.position.set(0.7, 0.6, 0.7);
    camera.lookAt(0, 0.4, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const dl1 = new THREE.DirectionalLight(0xffffff, 1.0);
    dl1.position.set(1, 2, 0.8);
    dl1.castShadow = true;
    dl1.shadow.mapSize.set(1024, 1024);
    dl1.shadow.camera.left   = -1.2;
    dl1.shadow.camera.right  =  1.2;
    dl1.shadow.camera.top    =  1.2;
    dl1.shadow.camera.bottom = -1.2;
    dl1.shadow.camera.near   = 0.05;
    dl1.shadow.camera.far    = 5;
    dl1.shadow.bias          = -0.0005;
    scene.add(dl1);
    const dl2 = new THREE.DirectionalLight(0xffffff, 0.35);
    dl2.position.set(-0.8, 1.5, -1);
    scene.add(dl2);

    // Chão
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3, 64),
      new THREE.MeshStandardMaterial({ color: COLOR.ground, roughness: 1.0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.userData.isGround = true;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid
    const grid = new THREE.GridHelper(6, 12, 0x2a2a35, 0x1a1a22);
    grid.position.y = 0.001;
    scene.add(grid);

    // Grupo do vaso (recriado quando o tamanho muda)
    const vaseGroup = new THREE.Group();
    scene.add(vaseGroup);
    vaseGroupRef.current = vaseGroup;

    // Grupo dos nós/galhos (limpável)
    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    // Controles
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 0.4;
    controls.maxDistance = 3;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.target.set(0, 0.4, 0);
    controlsRef.current = controls;

    // Pointer handlers (click + drag de nó OU bend de galho)
    type DragKind = 'node' | 'bend';
    let dragState: {
      kind: DragKind; id: string; mesh: THREE.Mesh;
      startScreen: { x: number; y: number };
      moved: boolean; dragOffset: THREE.Vector3;
      // Para bend: extremos do galho para calcular offset relativo
      from?: THREE.Vector3; to?: THREE.Vector3;
    } | null = null;
    const dragPlane = new THREE.Plane();
    const intersect = new THREE.Vector3();
    const camDir    = new THREE.Vector3();

    function getMouse(ev: PointerEvent): THREE.Vector2 {
      const rect = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
    }

    function onPointerDown(ev: PointerEvent) {
      if (ev.button !== 0) return;
      const mouse = getMouse(ev);
      raycasterRef.current.setFromCamera(mouse, camera);

      // 1) Nós (drag para mover)
      const nodeMeshes = Array.from(nodeMeshesRef.current.values());
      const nodeHits = raycasterRef.current.intersectObjects(nodeMeshes, false);
      if (nodeHits.length > 0) {
        const mesh = nodeHits[0].object as THREE.Mesh;
        const id = mesh.userData.nodeId as string;
        camera.getWorldDirection(camDir);
        dragPlane.setFromNormalAndCoplanarPoint(camDir, mesh.position);
        raycasterRef.current.ray.intersectPlane(dragPlane, intersect);
        const offset = new THREE.Vector3().subVectors(mesh.position, intersect);
        dragState = {
          kind: 'node', id, mesh,
          startScreen: { x: ev.clientX, y: ev.clientY },
          moved: false, dragOffset: offset,
        };
        controls.enabled = false;
        renderer.domElement.setPointerCapture(ev.pointerId);
        ev.stopPropagation();
        return;
      }

      // 2) Galhos (drag para curvar — pega o midpoint do bezier e segue o cursor)
      const branchMeshes = Array.from(branchMeshesRef.current.values());
      const branchHits = raycasterRef.current.intersectObjects(branchMeshes, false);
      if (branchHits.length > 0) {
        const hitbox = branchHits[0].object as THREE.Mesh;
        const nodeId = hitbox.userData.nodeId as string;
        const fromV  = hitbox.userData.fromPos as THREE.Vector3;
        const toV    = hitbox.userData.toPos   as THREE.Vector3;
        if (!fromV || !toV) return;
        // Midpoint inicial = ponto médio do hitbox no espaço (já com bend se houver)
        // Usamos o ponto de hit como aproximação inicial do midpoint
        const hitPoint = branchHits[0].point;
        const midPos = hitPoint.clone();
        camera.getWorldDirection(camDir);
        dragPlane.setFromNormalAndCoplanarPoint(camDir, midPos);
        raycasterRef.current.ray.intersectPlane(dragPlane, intersect);
        const offset = new THREE.Vector3().subVectors(midPos, intersect);
        const ghost = new THREE.Mesh();
        ghost.position.copy(midPos);
        dragState = {
          kind: 'bend', id: nodeId, mesh: ghost,
          startScreen: { x: ev.clientX, y: ev.clientY },
          moved: false, dragOffset: offset,
          from: fromV.clone(), to: toV.clone(),
        };
        controls.enabled = false;
        renderer.domElement.setPointerCapture(ev.pointerId);
        ev.stopPropagation();
        return;
      }
    }

    function onPointerMove(ev: PointerEvent) {
      if (!dragState) return;
      ev.stopPropagation();
      const dx = ev.clientX - dragState.startScreen.x;
      const dy = ev.clientY - dragState.startScreen.y;
      if (!dragState.moved && Math.hypot(dx, dy) > 4) dragState.moved = true;
      if (!dragState.moved) return;
      const mouse = getMouse(ev);
      raycasterRef.current.setFromCamera(mouse, camera);
      if (!raycasterRef.current.ray.intersectPlane(dragPlane, intersect)) return;
      const newPos = new THREE.Vector3().addVectors(intersect, dragState.dragOffset);
      dragState.mesh.position.copy(newPos);

      if (dragState.kind === 'bend' && dragState.from && dragState.to) {
        // Reconstrói visual + hitbox com o novo midpoint (live preview)
        const hitbox = branchMeshesRef.current.get(dragState.id);
        const visualBranch = hitbox?.userData.visualBranch as THREE.Mesh | undefined;
        if (hitbox && visualBranch) {
          const curve = new THREE.QuadraticBezierCurve3(dragState.from, newPos, dragState.to);
          // Visual fino
          const visRadius = (visualBranch.geometry as THREE.TubeGeometry).parameters?.radius ?? 0.01;
          visualBranch.geometry.dispose();
          visualBranch.geometry = new THREE.TubeGeometry(curve, 16, visRadius, 8, false);
          // Hitbox grosso
          const hitRadius = (hitbox.geometry as THREE.TubeGeometry).parameters?.radius ?? 0.025;
          hitbox.geometry.dispose();
          hitbox.geometry = new THREE.TubeGeometry(curve, 16, hitRadius, 6, false);
        }
      }
    }

    function onPointerUp(ev: PointerEvent) {
      if (!dragState) {
        // Sem drag em curso — verifica clique em galho ou no chão
        const mouse = getMouse(ev);
        raycasterRef.current.setFromCamera(mouse, camera);
        // Galho?
        const branchHits = raycasterRef.current.intersectObjects(
          Array.from(branchMeshesRef.current.values()), false,
        );
        if (branchHits.length > 0) {
          const id = branchHits[0].object.userData.nodeId as string;
          setSelectedBranchId(prev => prev === id ? null : id);
          setSelectedId(null);
          return;
        }
        // Nada hit → deseleciona tudo
        setSelectedId(null);
        setSelectedBranchId(null);
        return;
      }
      const ds = dragState;
      dragState = null;
      controls.enabled = true;
      renderer.domElement.releasePointerCapture(ev.pointerId);
      ev.stopPropagation();

      if (ds.kind === 'node') {
        if (ds.moved) {
          const final = ds.mesh.position;
          nodeDragCommitRef.current?.(ds.id, { x: final.x, y: final.y, z: final.z });
        } else {
          setSelectedId(ds.id);
          setSelectedBranchId(null);
        }
      } else if (ds.kind === 'bend') {
        if (ds.moved && ds.from && ds.to) {
          // Calcula bend = posição final do handle - midpoint reto
          const straightMid = new THREE.Vector3().addVectors(ds.from, ds.to).multiplyScalar(0.5);
          const bend = new THREE.Vector3().subVectors(ds.mesh.position, straightMid);
          branchBendCommitRef.current?.(ds.id, { x: bend.x, y: bend.y, z: bend.z });
        }
      }
    }

    // Capture: true → nosso handler fira ANTES do OrbitControls
    renderer.domElement.addEventListener("pointerdown", onPointerDown, { capture: true });
    renderer.domElement.addEventListener("pointermove", onPointerMove, { capture: true });
    renderer.domElement.addEventListener("pointerup",   onPointerUp,   { capture: true });
    renderer.domElement.addEventListener("pointercancel", onPointerUp, { capture: true });

    // RAF loop
    let raf = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    // Resize
    function onResize() {
      const newW = mount.clientWidth;
      const newH = mount.clientHeight;
      renderer.setSize(newW, newH);
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown, { capture: true } as any);
      renderer.domElement.removeEventListener("pointermove", onPointerMove, { capture: true } as any);
      renderer.domElement.removeEventListener("pointerup",   onPointerUp,   { capture: true } as any);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp, { capture: true } as any);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      rendererRef.current = null;
      groupRef.current = null;
    };
  }, []);

  // Reconstrói o vaso quando o tamanho (litros) muda
  useEffect(() => {
    const vg = vaseGroupRef.current;
    if (!vg) return;

    // Limpa vaso anterior
    while (vg.children.length > 0) {
      const obj = vg.children[0];
      vg.remove(obj);
      if ((obj as any).geometry) (obj as any).geometry.dispose();
      if ((obj as any).material) (obj as any).material.dispose();
    }

    // Escala baseada no volume — ref: 5L → r=0.32, h=0.36
    // V ∝ r²·h ∝ r³ → fator linear = (V / 5)^(1/3)
    const baseR = 0.32, baseH = 0.36;
    const scale = Math.cbrt(potSizeL / 5);
    const r     = baseR * scale;
    const rTop  = r;
    const rBot  = r * 0.75;
    const h     = baseH * scale;

    // Corpo do vaso
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBot, h, 24),
      new THREE.MeshStandardMaterial({ color: COLOR.potDark, roughness: 0.85 }),
    );
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    vg.add(body);

    // Borda
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(rTop, 0.018 * scale, 12, 32),
      new THREE.MeshStandardMaterial({ color: "#6e3d1c", roughness: 0.8 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = h;
    vg.add(rim);

    // Solo
    const soil = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop * 0.94, rTop * 0.94, 0.035 * scale, 24),
      new THREE.MeshStandardMaterial({ color: "#3a2410", roughness: 1.0 }),
    );
    soil.position.y = h - 0.005;
    soil.receiveShadow = true;
    vg.add(soil);

    // Pedrinhas no solo
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + (i * 0.7 % 1);
      const dist  = (i % 5) * 0.05 * scale;
      const stone = new THREE.Mesh(
        new THREE.SphereGeometry((0.012 + (i % 3) * 0.004) * scale, 6, 6),
        new THREE.MeshStandardMaterial({ color: ["#5a4a3a", "#6b5544", "#3a2e22"][i % 3], roughness: 0.95 }),
      );
      stone.position.set(dist * Math.cos(angle), h + 0.018 * scale, dist * Math.sin(angle));
      vg.add(stone);
    }
  }, [potSizeL]);

  // Atualiza nós/galhos quando nodes, selectedId ou selectedBranchId mudam
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // Limpa refs de meshes antes de recriar
    nodeMeshesRef.current.clear();
    branchMeshesRef.current.clear();
    bendHandleRef.current = null;

    // Limpa grupo anterior — só descarta TubeGeometry (gerada por curva, única por galho);
    // geometrias e materiais compartilhados (GEO/MAT) são NUNCA descartados aqui.
    while (group.children.length > 0) {
      const obj = group.children[0] as THREE.Mesh;
      group.remove(obj);
      if (obj.geometry instanceof THREE.TubeGeometry) obj.geometry.dispose();
    }

    const nodeById = new Map<string, PlantGraphNode>();
    for (const n of nodes) nodeById.set(n.id, n);

    // ── Espessura do caule por nó (regra de Da Vinci) ───────────────────────
    // Cada folha (topo) carrega "1 unidade" → espessura = sqrt(área total)
    // Quanto mais filhos um galho sustenta, mais grosso fica.
    const TIP_THICKNESS  = 0.005;  // 5mm na ponta (galho fino)
    const TRUNK_BOOST    = 1.8;    // caule principal ganha um boost extra
    const childMap2 = new Map<string, string[]>();
    for (const n of nodes) {
      if (!childMap2.has(n.id)) childMap2.set(n.id, []);
      if (n.parentId) {
        const arr = childMap2.get(n.parentId) ?? [];
        arr.push(n.id);
        childMap2.set(n.parentId, arr);
      }
    }
    const subtreeTips = new Map<string, number>();
    function countTips(id: string): number {
      const kids = childMap2.get(id) ?? [];
      const c = kids.length === 0 ? 1 : kids.reduce((a, k) => a + countTips(k), 0);
      subtreeTips.set(id, c);
      return c;
    }
    for (const n of nodes) if (!subtreeTips.has(n.id)) countTips(n.id);
    function thicknessFor(node: PlantGraphNode): number {
      const tips = subtreeTips.get(node.id) ?? 1;
      const isTrunk = node.parentId === 'root';
      // Lei de Da Vinci: área transversal proporcional ao nº de pontas → raio ∝ sqrt(tips)
      const t = TIP_THICKNESS * Math.sqrt(tips);
      return isTrunk ? t * TRUNK_BOOST : t;
    }

    // Galhos curvos via TubeGeometry + QuadraticBezierCurve3
    for (const node of nodes) {
      if (!node.parentId) continue;
      const parent = nodeById.get(node.parentId);
      const from   = parent ? positions.get(parent.id) : positions.get('root');
      const to     = positions.get(node.id);
      if (!from || !to) continue;

      const fromV = new THREE.Vector3(from.x, from.y, from.z);
      const toV   = new THREE.Vector3(to.x, to.y, to.z);
      const _len   = fromV.distanceTo(toV);

      // Espessura média (TubeGeometry usa raio uniforme — variação fica entre galhos diferentes)
      const baseThickness = thicknessFor(node);
      const tubeRadius    = Math.max(TIP_THICKNESS, baseThickness * 0.88);

      // Ponto de controle: midpoint reto + offset salvo (branchBend) se houver
      // Sem branchBend → control point no midpoint → tubo reto.
      const mid = new THREE.Vector3().addVectors(fromV, toV).multiplyScalar(0.5);
      if (node.branchBend) {
        mid.x += node.branchBend.x;
        mid.y += node.branchBend.y;
        mid.z += node.branchBend.z;
      }

      const curve = new THREE.QuadraticBezierCurve3(fromV, mid, toV);
      const branch = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 16, tubeRadius, 8, false),
        node.state === 'lst' ? MAT.branchLst : MAT.branchAct,  // material compartilhado
      );
      branch.name = 'branch';
      branch.userData.nodeId = node.id;
      branch.castShadow = true;
      group.add(branch);

      // Hitbox invisível MAIS GROSSO ao redor do galho — facilita raycast/click
      const hitRadius = Math.max(0.022, tubeRadius * 3.5);   // mínimo 2.2cm para click
      const hitbox = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 16, hitRadius, 6, false),
        MAT.hitbox,  // material compartilhado
      );
      hitbox.userData.nodeId = node.id;
      hitbox.name = 'branchHitbox';
      // Guarda from/to/bend no userData para o handler aceder (sem stale closure)
      hitbox.userData.fromPos = fromV.clone();
      hitbox.userData.toPos   = toV.clone();
      hitbox.userData.visualBranch = branch;
      group.add(hitbox);
      branchMeshesRef.current.set(node.id, hitbox);
    }

    // Nós (esferas)
    for (const node of nodes) {
      if (node.parentId === null) continue; // raiz é o vaso
      const pos = positions.get(node.id);
      if (!pos) continue;
      const isTop  = node.type === 'top' && node.state === 'active';
      // Geometria e material compartilhados — zero alocação GPU por nó
      const mesh = new THREE.Mesh(
        isTop ? GEO.nodeTop : GEO.nodeInner,
        getNodeMat(node, isTop),
      );
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.userData.nodeId = node.id;
      mesh.castShadow = true;
      group.add(mesh);
      nodeMeshesRef.current.set(node.id, mesh);

      // Bud (cone) acima dos topos ativos — visual de flor
      if (isTop) {
        const bud = new THREE.Mesh(GEO.bud, MAT.bud);
        bud.position.set(pos.x, pos.y + R_TOP * 1.3, pos.z);
        bud.castShadow = true;
        group.add(bud);
      }

      // Halo de seleção
      if (selectedId === node.id) {
        const ring = new THREE.Mesh(
          isTop ? GEO.ringTop : GEO.ringInner,
          MAT.ring,
        );
        ring.position.copy(mesh.position);
        ring.lookAt(cameraRef.current?.position ?? new THREE.Vector3(0, 1, 0));
        group.add(ring);
      }
    }

    // Galhos também projetam sombra
    group.traverse(obj => {
      if ((obj as THREE.Mesh).isMesh && obj.name === 'branch') {
        obj.castShadow = true;
      }
    });
  }, [nodes, positions, selectedId, selectedBranchId]);

  const selectedNode = selectedId ? nodes.find(n => n.id === selectedId) ?? null : null;
  const availableActions = useMemo(() => {
    if (!selectedNode) return [];
    const hasChildren = nodes.some(n => n.parentId === selectedNode.id);
    return getAvailableActions(selectedNode, hasChildren);
  }, [selectedNode, nodes]);

  // Callback de commit do drag de nó — atualiza pos3D e salva
  nodeDragCommitRef.current = (id: string, pos: { x: number; y: number; z: number }) => {
    setNodes(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, pos3D: pos } : n);
      if (plantId) saveMutation.mutate({ plantId, nodes: updated });
      return updated;
    });
  };

  // Callback de commit do drag de bend — atualiza branchBend e salva
  branchBendCommitRef.current = (nodeId: string, bend: { x: number; y: number; z: number } | null) => {
    setNodes(prev => {
      const updated = prev.map(n => {
        if (n.id !== nodeId) return n;
        if (bend === null) {
          const { branchBend: _branchBend, ...rest } = n;
          return rest as PlantGraphNode;
        }
        return { ...n, branchBend: bend };
      });
      if (plantId) saveMutation.mutate({ plantId, nodes: updated });
      return updated;
    });
  };

  // ── Controles de câmera ─────────────────────────────────────────────────────

  function dolly(factor: number) {
    const cam = cameraRef.current, ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    const dir = new THREE.Vector3().subVectors(cam.position, ctrl.target);
    const newDist = Math.max(ctrl.minDistance, Math.min(ctrl.maxDistance, dir.length() * factor));
    dir.setLength(newDist);
    cam.position.copy(ctrl.target).add(dir);
    ctrl.update();
  }

  function resetCamera() {
    const cam = cameraRef.current, ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    cam.position.set(0.7, 0.6, 0.7);
    ctrl.target.set(0, 0.4, 0);
    ctrl.update();
  }

  function resetPositions() {
    setResetConfirmOpen(true);
  }

  function doResetPositions() {
    setNodes(prev => {
      const updated = prev.map(n => {
        const { pos3D: _pos3D, ...rest } = n;
        return rest as PlantGraphNode;
      });
      if (plantId) saveMutation.mutate({ plantId, nodes: updated });
      return updated;
    });
    didFitRef.current = false; // permite auto-fit novamente
    toast.success("Posições resetadas");
  }

  function fitToPlant() {
    const cam = cameraRef.current, ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    // Bounding box: vaso (raio escala com potSizeL) + nós (se existirem)
    const box = new THREE.Box3();
    const potR = 0.32 * Math.cbrt(potSizeL / 5);
    box.expandByPoint(new THREE.Vector3(-potR, 0,       -potR));
    box.expandByPoint(new THREE.Vector3( potR, potHeight, potR));
    positions.forEach(p => box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z)));
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    // Diagonal horizontal (X/Z) para enquadrar largura, e altura
    const horiz  = Math.sqrt(size.x * size.x + size.z * size.z);
    const maxDim = Math.max(horiz, size.y, 0.4);
    const fov    = (cam.fov * Math.PI) / 180;
    const dist   = Math.max((maxDim / 2 / Math.tan(fov / 2)) * 1.4, ctrl.minDistance);
    // Posiciona câmera num ângulo padrão (frente, ligeiramente acima)
    const dir = new THREE.Vector3(1, 0.7, 1).normalize();
    cam.position.copy(center).add(dir.multiplyScalar(dist));
    ctrl.target.copy(center);
    ctrl.update();
  }

  function applyAction(action: GraphAction) {
    const nodeId = selectedId;
    setSelectedId(null);
    if (!nodeId) return;

    if (action === 'remove') {
      const res = removeSubtree(nodes, nodeId);
      if (res.error) { toast.error(res.error); return; }
      setNodes(res.nodes);
      if (plantId) saveMutation.mutate({ plantId, nodes: res.nodes });
      toast.success('Nó removido');
      return;
    }

    let res: { nodes: PlantGraphNode[]; newIds: string[]; error?: string };
    switch (action) {
      case 'topping':    res = applyTopping(nodes, nodeId);     break;
      case 'fim':        res = applyFIM(nodes, nodeId);         break;
      case 'lst':        res = applyLST(nodes, nodeId);         break;
      case 'super-crop': res = applySuperCrop(nodes, nodeId);   break;
      case 'grow':       res = growPlant(nodes, nodeId);        break;
      case 'add-branch': res = addLateralBranch(nodes, nodeId); break;
      case 'add-before': res = insertNodeBefore(nodes, nodeId); break;
      default: return;
    }
    if (res.error) { toast.error(res.error); return; }

    const selNode = nodes.find(n => n.id === nodeId);
    setNodes(res.nodes);
    if (plantId) saveMutation.mutate({ plantId, nodes: res.nodes });

    const labels: Partial<Record<GraphAction, string>> = {
      topping: 'Topping', fim: 'FIM', lst: 'LST',
      'super-crop': 'Super Cropping', grow: 'Crescimento',
      'add-branch': 'Galho lateral', 'add-before': 'Nó inserido',
    };
    if (labels[action]) onTechniqueApplied?.(labels[action]!, selNode ? `N${selNode.nodeNumber}` : '');
    toast.success(labels[action] ?? action);
  }

  return (
    <div className="relative w-full" style={height ? { height: `${height}px` } : { height: '100%' }}>
      <div ref={mountRef} className="w-full h-full" style={{ borderRadius: 12, overflow: "hidden" }} />

      {/* Controles de câmera (overlay no canto inferior direito) */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5 z-10">
        <button
          onClick={() => dolly(0.8)}
          className="w-9 h-9 rounded-lg bg-card/80 backdrop-blur border border-border/60 hover:bg-card flex items-center justify-center text-foreground/80 hover:text-foreground transition-colors shadow-md"
          title="Aproximar (zoom in)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={fitToPlant}
          className="w-9 h-9 rounded-lg bg-card/80 backdrop-blur border border-border/60 hover:bg-card flex items-center justify-center text-foreground/80 hover:text-foreground transition-colors shadow-md"
          title="Enquadrar planta"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => dolly(1.25)}
          className="w-9 h-9 rounded-lg bg-card/80 backdrop-blur border border-border/60 hover:bg-card flex items-center justify-center text-foreground/80 hover:text-foreground transition-colors shadow-md"
          title="Afastar (zoom out)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={resetCamera}
          className="w-9 h-9 rounded-lg bg-card/80 backdrop-blur border border-border/60 hover:bg-card flex items-center justify-center text-foreground/80 hover:text-foreground transition-colors shadow-md"
          title="Resetar câmera"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={resetPositions}
          className="w-9 h-9 rounded-lg bg-card/80 backdrop-blur border border-border/60 hover:bg-card flex items-center justify-center text-red-400/90 hover:text-red-300 transition-colors shadow-md"
          title="Resetar posições dos nós (limpa drags)"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {selectedNode && (
        <ActionMenu
          node={selectedNode}
          actions={availableActions}
          onClose={() => setSelectedId(null)}
          onAction={applyAction}
        />
      )}

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar posições?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove todos os ajustes manuais de posição e volta ao layout automático.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doResetPositions}>Resetar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
