import { PlantGraphNode, resolveEdgeState } from '@/features/cannaprune/plantGraph';
import { X, Leaf, GitBranch, RotateCcw } from 'lucide-react';

export interface EdgeActionMenuProps {
  edgeNode: PlantGraphNode;
  onDefoliate: () => void;
  onRestore: () => void;
  onCurve: () => void;         // just close menu, keeps selectedEdgeId
  onResetCurve?: () => void;   // only shown if edgeNode.edgeCtrl exists
  onClose: () => void;
}

export function EdgeActionMenu({
  edgeNode, onDefoliate, onRestore, onCurve, onResetCurve, onClose,
}: EdgeActionMenuProps) {
  const es = resolveEdgeState(edgeNode);

  return (
    <>
      <div className="fixed inset-0 z-[199]"
        onClick={onClose} />
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
              onClick={onClose}
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
                onClick={onDefoliate}
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
                onClick={onRestore}
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
              onClick={onCurve}
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
            {onResetCurve && (
              <>
                <div className="h-px bg-border/30 mx-4 my-1" />
                <button
                  onClick={onResetCurve}
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
}
