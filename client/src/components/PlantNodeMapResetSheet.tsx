import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RotateCcw, Leaf, Maximize2 } from 'lucide-react';

export interface PlantNodeMapResetSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRestoreSnapshot: () => void;
  onClearAll: () => void;
  onAutoLayout: () => void;
}

export function PlantNodeMapResetSheet({
  open, onOpenChange, onRestoreSnapshot, onClearAll, onAutoLayout,
}: PlantNodeMapResetSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8">
        <SheetHeader className="mb-3">
          <SheetTitle className="text-sm flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-red-500" /> Reiniciar planta
          </SheetTitle>
        </SheetHeader>
        <p className="text-sm text-muted-foreground mb-4">
          A estrutura será apagada e a planta volta ao estado inicial.
        </p>
        <div className="space-y-2">
          {/* Restaurar ao último salvamento (master snapshot) */}
          <button onClick={onRestoreSnapshot} className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/40 hover:border-border bg-card text-left active:scale-[0.98] transition-all">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/10">
              <Leaf className="w-4 h-4 text-emerald-500" />
            </span>
            <div>
              <p className="text-sm font-semibold">Manter histórico</p>
              <p className="text-xs text-muted-foreground">Volta ao último salvamento, mantém os logs</p>
            </div>
          </button>
          {/* Apagar tudo: volta à planta inicial + apaga logs */}
          <button onClick={onClearAll} className="w-full flex items-center gap-3 p-3 rounded-xl border border-red-500/20 hover:border-red-500/40 bg-card text-left active:scale-[0.98] transition-all">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-red-500/10">
              <RotateCcw className="w-4 h-4 text-red-500" />
            </span>
            <div>
              <p className="text-sm font-semibold text-red-500">Apagar tudo</p>
              <p className="text-xs text-muted-foreground">Recomeça da raiz e apaga o histórico</p>
            </div>
          </button>
          <button
            onClick={onAutoLayout}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/40 hover:border-border bg-card text-left active:scale-[0.98] transition-all"
          >
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-muted">
              <Maximize2 className="w-4 h-4 text-muted-foreground" />
            </span>
            <div>
              <p className="text-sm font-semibold">Auto-layout</p>
              <p className="text-xs text-muted-foreground">Remove posições manuais dos nós</p>
            </div>
          </button>
          <button onClick={() => onOpenChange(false)} className="w-full p-3 rounded-xl border border-border/40 text-sm text-muted-foreground transition-all hover:border-border">
            Cancelar
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
