import { Undo2, Redo2, RotateCcw, Loader2 } from 'lucide-react';

function Chip({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm font-bold tabular-nums" style={{ color }}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export interface PlantNodeMapToolbarProps {
  stats: { tops: number; internodes: number; lst: number; superCropped: number };
  isSaving: boolean;
  isSaved: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
}

export function PlantNodeMapToolbar({
  stats, isSaving, isSaved, canUndo, canRedo, onUndo, onRedo, onReset,
}: PlantNodeMapToolbarProps) {
  return (
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
              onClick={onUndo} disabled={!canUndo}
              title="Desfazer (Ctrl+Z)"
              className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRedo} disabled={!canRedo}
              title="Refazer (Ctrl+Y)"
              className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <button onClick={onReset} title="Reiniciar" className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-red-500/20 hover:text-red-500 transition-colors">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
