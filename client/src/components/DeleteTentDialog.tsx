import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

interface Tent {
  id: number;
  name: string;
}

interface DeletePreview {
  canDelete: boolean;
  totalRecords: number;
  blockers: {
    activeCycles: number;
    plants: number;
  };
  willDelete: {
    cycles: number;
    recipes: number;
    dailyLogs: number;
    alerts: number;
    taskInstances: number;
    plantHistory: number;
  };
}

interface DeleteTentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Estufa que está prestes a ser deletada (null fecha o dialog). */
  tentToDelete: Tent | null;
  /** Todas as estufas — usadas no dropdown "mover plantas para…". */
  tents: Tent[] | undefined;
  /** Preview do que será cascateado pela exclusão. */
  deletePreview: DeletePreview | null | undefined;
  deletePreviewLoading: boolean;
  isDeleting: boolean;
  isMovingPlants: boolean;
  /** Chamado quando o usuário confirma a exclusão. */
  onConfirmDelete: () => void;
  /** Chamado quando o usuário pede pra mover todas as plantas pra outra estufa. */
  onMoveAllPlants: (toTentId: number) => void;
}

/**
 * Dialog de confirmação de exclusão de estufa.
 *
 * UX: mostra preview do que será cascateado (ciclos, logs, alertas, etc.)
 * e oferece atalho pra mover todas as plantas antes de excluir. Bloqueia
 * a exclusão se houver ciclos ativos ou plantas dentro (preview vem do
 * backend pré-computado).
 *
 * O painel "mover plantas" é state local — o pai só precisa lidar com
 * `open` e os dois callbacks.
 */
export function DeleteTentDialog({
  open,
  onOpenChange,
  tentToDelete,
  tents,
  deletePreview,
  deletePreviewLoading,
  isDeleting,
  isMovingPlants,
  onConfirmDelete,
  onMoveAllPlants,
}: DeleteTentDialogProps) {
  const [showMovePanel, setShowMovePanel] = useState(false);
  const [targetTentId, setTargetTentId] = useState<string>("");

  // Reset state quando o dialog fecha — evita lembrar do estado anterior
  // se o usuário abrir o dialog para outra estufa em seguida.
  useEffect(() => {
    if (!open) {
      setShowMovePanel(false);
      setTargetTentId("");
    }
  }, [open]);

  const handleMove = () => {
    if (!targetTentId) return;
    onMoveAllPlants(parseInt(targetTentId));
  };

  const cannotDelete = deletePreview != null && !deletePreview.canDelete;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir a estufa "{tentToDelete?.name}"?
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Delete Preview Section */}
        {deletePreviewLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Verificando dados...</span>
          </div>
        ) : deletePreview ? (
          <div className="space-y-3 py-3">
            {/* Blockers */}
            {!deletePreview.canDelete && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm font-medium text-destructive mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  Não é possível excluir:
                </p>
                <ul className="text-sm space-y-1 text-destructive/90">
                  {deletePreview.blockers.activeCycles > 0 && (
                    <li>• {deletePreview.blockers.activeCycles} ciclo(s) ativo(s) - finalize primeiro</li>
                  )}
                  {deletePreview.blockers.plants > 0 && (
                    <li>• {deletePreview.blockers.plants} planta(s) na estufa - mova ou finalize primeiro</li>
                  )}
                </ul>
              </div>
            )}

            {/* Preview do que será deletado */}
            {deletePreview.totalRecords > 0 && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium mb-2">Serão excluídos permanentemente:</p>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  {deletePreview.willDelete.cycles > 0 && (
                    <li>• {deletePreview.willDelete.cycles} ciclo(s) finalizado(s)</li>
                  )}
                  {deletePreview.willDelete.recipes > 0 && (
                    <li>• {deletePreview.willDelete.recipes} receita(s) nutricional(is)</li>
                  )}
                  {deletePreview.willDelete.dailyLogs > 0 && (
                    <li>• {deletePreview.willDelete.dailyLogs} registro(s) diário(s)</li>
                  )}
                  {deletePreview.willDelete.alerts > 0 && (
                    <li>• {deletePreview.willDelete.alerts} alerta(s)</li>
                  )}
                  {deletePreview.willDelete.taskInstances > 0 && (
                    <li>• {deletePreview.willDelete.taskInstances} tarefa(s)</li>
                  )}
                  {deletePreview.willDelete.plantHistory > 0 && (
                    <li>• {deletePreview.willDelete.plantHistory} registro(s) de movimentação</li>
                  )}
                </ul>
                <p className="text-xs text-muted-foreground mt-2 font-medium">
                  Total: {deletePreview.totalRecords} registro(s)
                  {deletePreview.totalRecords > 100 && (
                    <span className="inline-flex items-center gap-1 ml-1">
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                      Grande quantidade de dados!
                    </span>
                  )}
                </p>
              </div>
            )}

            {deletePreview.totalRecords === 0 && deletePreview.canDelete && (
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Estufa vazia, sem dados relacionados.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {/* Move All Plants Section */}
        {!showMovePanel ? (
          <div className="py-3">
            <Button
              variant="outline"
              onClick={() => setShowMovePanel(true)}
              className="w-full"
              disabled={isDeleting || isMovingPlants}
            >
              <span className="flex items-center gap-2">
                <ArrowRight className="w-4 h-4" />
                Mover Todas as Plantas Primeiro
              </span>
            </Button>
          </div>
        ) : (
          <div className="py-3 space-y-3 border-t border-b">
            <p className="text-sm font-medium">Mover plantas para:</p>
            <Select value={targetTentId} onValueChange={setTargetTentId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a estufa de destino" />
              </SelectTrigger>
              <SelectContent>
                {tents
                  ?.filter((t) => t.id !== tentToDelete?.id)
                  .map((tent) => (
                    <SelectItem key={tent.id} value={tent.id.toString()}>
                      {tent.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowMovePanel(false);
                  setTargetTentId("");
                }}
                disabled={isMovingPlants}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleMove}
                disabled={!targetTentId || isMovingPlants}
                className="flex-1"
              >
                {isMovingPlants ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Movendo...
                  </>
                ) : (
                  "Mover Agora"
                )}
              </Button>
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting || isMovingPlants}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirmDelete}
            disabled={isDeleting || isMovingPlants || cannotDelete}
            className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Excluindo...
              </>
            ) : (
              "Excluir Estufa"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
