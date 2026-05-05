import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { PressButton } from "@/components/PressButton";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PlantEditModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plant: { id: number; name: string; code?: string | null; notes?: string | null };
  onSuccess: () => void;
}

export default function PlantEditModal({ open, onOpenChange, plant, onSuccess }: PlantEditModalProps) {
  const [form, setForm] = useState({ name: plant.name, code: plant.code ?? "", notes: plant.notes ?? "" });

  // Sync form when plant prop changes (re-opens with fresh data)
  const handleOpen = (v: boolean) => {
    if (v) setForm({ name: plant.name, code: plant.code ?? "", notes: plant.notes ?? "" });
    onOpenChange(v);
  };

  const updateMutation = trpc.plants.update.useMutation({
    onSuccess: () => {
      toast.success('Planta atualizada com sucesso!');
      onOpenChange(false);
      onSuccess();
    },
    onError: (e) => toast.error(`Erro ao atualizar planta: ${e.message}`),
  });

  const handleSave = () => {
    updateMutation.mutate({ id: plant.id, name: form.name, code: form.code || undefined, notes: form.notes || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Planta</DialogTitle>
          <DialogDescription>Atualize as informações da planta</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Nome *</Label>
            <Input id="edit-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nome da planta" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-code">Código</Label>
            <Input id="edit-code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Ex: NL-001" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notas</Label>
            <Textarea id="edit-notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Observações gerais sobre a planta" rows={4} />
          </div>
        </div>
        <DialogFooter>
          <PressButton variant="outline" onClick={() => onOpenChange(false)} disabled={updateMutation.isPending}>Cancelar</PressButton>
          <PressButton onClick={handleSave} disabled={!form.name || updateMutation.isPending} pressIntensity="medium">
            {updateMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar'}
          </PressButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
