import { LayoutNode, GraphAction } from '@/features/cannaprune/plantGraph';
import { NODE_COLOR, getCircleColor } from '@/features/cannaprune/plantNodeColors';
import { X, Trash2, Scissors, Leaf, ArrowUp, GitBranch, GitMerge, Zap } from 'lucide-react';

const ACTION_META: Partial<Record<GraphAction, {
  label: string; shortDesc: string; color: string;
  Icon: React.ElementType; destructive?: boolean; separator?: boolean;
}>> = {
  topping:      { label: 'Topping',    shortDesc: '→ 2 topos',       color: '#fbbf24', Icon: Scissors },
  fim:          { label: 'FIM',        shortDesc: '→ 3–4 brotos',    color: '#fb923c', Icon: Scissors },
  lst:          { label: 'LST',        shortDesc: 'inclina galho',   color: '#8b5cf6', Icon: Leaf     },
  grow:         { label: 'Crescer',    shortDesc: '+ nó acima',      color: '#4ade80', Icon: ArrowUp  },
  'add-branch': { label: '+ Galho',    shortDesc: 'ramo lateral',    color: '#34d399', Icon: GitBranch },
  'add-before': { label: 'Inserir nó', shortDesc: 'entre este e o pai', color: '#60a5fa', Icon: GitMerge },
  'super-crop': { label: 'Super Crop', shortDesc: '→ 2 topos',       color: '#c084fc', Icon: Zap      },
  remove:       { label: 'Remover',    shortDesc: 'nó + filhos',     color: '#f87171', Icon: Trash2,
                  destructive: true, separator: true },
};

export interface NodeActionMenuProps {
  selectedNode:     LayoutNode;
  availableActions: GraphAction[];
  onClose:   () => void;
  onAction:  (a: GraphAction) => void;
}

export function NodeActionMenu({
  selectedNode, availableActions, onClose, onAction,
}: NodeActionMenuProps) {
  const nodeColor = selectedNode.type === 'top' && selectedNode.state === 'active'
    ? NODE_COLOR.top.ring : getCircleColor(selectedNode).ring;
  const nodeLabel = selectedNode.type === 'root' ? 'Raiz' : `N${selectedNode.nodeNumber}`;
  const nodeDesc  = selectedNode.type === 'root'    ? '↑ caule'
    : selectedNode.type === 'top' && selectedNode.state === 'active' ? '★ top bud'
    : selectedNode.type === 'internode' ? 'nó'
    : selectedNode.state;

  const mainActions = availableActions.filter(a => a !== 'remove');
  const hasRemove   = availableActions.includes('remove');

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[199]" onClick={onClose} />

      {/* Card */}
      <div
        className="fixed z-[200] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[240px] pointer-events-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden">

          {/* Cabeçalho */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: nodeColor }} />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-bold">{nodeLabel}</span>
              <span className="text-xs text-muted-foreground ml-1.5">{nodeDesc}</span>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Ações flat */}
          <div className="py-1.5">
            {mainActions.map(action => {
              const meta = ACTION_META[action];
              if (!meta) return null;
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
            })}
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
          </div>

        </div>
      </div>
    </>
  );
}
