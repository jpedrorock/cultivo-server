import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, FileText, Pencil, Trash2, Loader2, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface PlantObservationsTabProps {
  plantId: number;
}

export default function PlantObservationsTab({ plantId }: PlantObservationsTabProps) {
  const utils = trpc.useUtils();
  const [newObservation, setNewObservation] = useState("");
  const todayStr = new Date().toISOString().slice(0, 10);
  const [obsDate, setObsDate] = useState(todayStr);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  // Delete confirm state
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: observations } = trpc.plantObservations.list.useQuery({ plantId });

  const createObservation = trpc.plantObservations.create.useMutation({
    onSuccess: () => {
      toast.success("Observação adicionada!");
      setNewObservation("");
      utils.plantObservations.list.invalidate({ plantId });
    },
    onError: (e) => toast.error(`Erro ao salvar observação: ${e.message}`),
  });

  const updateObservation = trpc.plantObservations.update.useMutation({
    onSuccess: () => {
      toast.success("Observação atualizada!");
      setEditingId(null);
      utils.plantObservations.list.invalidate({ plantId });
    },
    onError: (e) => toast.error(`Erro ao atualizar observação: ${e.message}`),
  });

  const deleteObservation = trpc.plantObservations.delete.useMutation({
    onSuccess: () => {
      toast.success("Observação removida");
      setDeleteId(null);
      utils.plantObservations.list.invalidate({ plantId });
    },
    onError: (e) => toast.error(`Erro ao remover observação: ${e.message}`),
  });

  const handleSubmit = () => {
    if (!newObservation.trim()) return;
    createObservation.mutate({
      plantId,
      content: newObservation,
      observationDate: obsDate ? new Date(obsDate) : undefined,
    });
  };

  const handleEditStart = (obs: any) => {
    setEditingId(obs.id);
    setEditContent(obs.content);
  };

  const handleEditSave = () => {
    if (!editContent.trim() || editingId == null) return;
    updateObservation.mutate({ id: editingId, content: editContent });
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Add New Observation */}
      <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nova Observação
        </p>
        <Textarea
          placeholder="Digite sua observação sobre a planta..."
          value={newObservation}
          onChange={(e) => setNewObservation(e.target.value)}
          rows={3}
          className="resize-none"
        />
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
          <Input
            type="date"
            value={obsDate}
            onChange={(e) => setObsDate(e.target.value)}
            className="w-40 text-sm h-8"
          />
        </div>
        <Button
          onClick={handleSubmit}
          disabled={!newObservation.trim() || createObservation.isPending}
          size="sm"
        >
          {createObservation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Adicionar
        </Button>
      </div>

      {/* Observations List */}
      {observations && observations.length > 0 ? (
        <div className="space-y-2">
          {observations.map((obs: any) => (
            <div
              key={obs.id}
              className="rounded-2xl border border-border/40 bg-card overflow-hidden"
            >
              {editingId === obs.id ? (
                /* ── Edit mode ── */
                <div className="p-4 space-y-3">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className="resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleEditSave}
                      disabled={!editContent.trim() || updateObservation.isPending}
                    >
                      {updateObservation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                      Salvar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                      disabled={updateObservation.isPending}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                <>
                  <div className="flex items-center justify-between px-4 pt-3 pb-1">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
                      <FileText className="w-3 h-3" />
                      {new Date(obs.observationDate).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        onClick={() => handleEditStart(obs)}
                        title="Editar observação"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => setDeleteId(obs.id)}
                        title="Remover observação"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="px-4 pb-4">
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                      {obs.content}
                    </p>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border/40 bg-card py-12 text-center">
          <FileText className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma observação registrada ainda</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Use o campo acima para adicionar a primeira
          </p>
        </div>
      )}

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Remover observação?
            </DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleteObservation.isPending}
              onClick={() => {
                if (deleteId != null) deleteObservation.mutate({ id: deleteId });
              }}
            >
              {deleteObservation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
