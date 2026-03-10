import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DailyLog {
  id: number;
  tentId: number;
  logDate: Date;
  turn: string | null;
  tempC: string | null;
  rhPct: string | null;
  ppfd: number | null;
  ph: string | null;
  ec: string | null;
  notes: string | null;
  tentName: string | null;
}

interface EditLogDialogProps {
  log: DailyLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditLogDialog({ log, open, onOpenChange, onSuccess }: EditLogDialogProps) {
  const [tempC, setTempC] = useState("");
  const [rhPct, setRhPct] = useState("");
  const [ppfd, setPpfd] = useState("");
  const [ph, setPh] = useState("");
  const [ec, setEc] = useState("");
  const [notes, setNotes] = useState("");

  const updateMutation = trpc.dailyLogs.update.useMutation({
    onSuccess: () => {
      toast.success("Registro atualizado com sucesso!");
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  // Pre-fill form when log changes
  useEffect(() => {
    if (log) {
      setTempC(log.tempC || "");
      setRhPct(log.rhPct || "");
      setPpfd(log.ppfd?.toString() || "");
      setPh(log.ph || "");
      setEc(log.ec || "");
      setNotes(log.notes || "");
    }
  }, [log]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!log) return;

    updateMutation.mutate({
      id: log.id,
      tempC: tempC || undefined,
      rhPct: rhPct || undefined,
      ppfd: ppfd ? parseFloat(ppfd) : undefined,
      ph: ph || undefined,
      ec: ec || undefined,
      notes: notes || undefined,
    });
  };

  if (!log) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Registro</DialogTitle>
          <DialogDescription>
            {log.tentName} - {new Date(log.logDate).toLocaleDateString("pt-BR")} ({log.turn})
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Temperature */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="tempC" className="text-right">
                Temp (°C)
              </Label>
              <Input
                id="tempC"
                type="text"
                value={tempC}
                onChange={(e) => setTempC(e.target.value)}
                className="col-span-3"
                placeholder="Ex: 26.5"
              />
            </div>

            {/* Humidity */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="rhPct" className="text-right">
                RH (%)
              </Label>
              <Input
                id="rhPct"
                type="text"
                value={rhPct}
                onChange={(e) => setRhPct(e.target.value)}
                className="col-span-3"
                placeholder="Ex: 65"
              />
            </div>

            {/* PPFD */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="ppfd" className="text-right">
                PPFD
              </Label>
              <Input
                id="ppfd"
                type="text"
                inputMode="numeric"
                value={ppfd}
                onChange={(e) => setPpfd(e.target.value)}
                className="col-span-3"
                placeholder="Ex: 800"
              />
            </div>

            {/* pH */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="ph" className="text-right">
                pH
              </Label>
              <Input
                id="ph"
                type="text"
                value={ph}
                onChange={(e) => setPh(e.target.value)}
                className="col-span-3"
                placeholder="Ex: 6.2"
              />
            </div>

            {/* EC */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="ec" className="text-right">
                EC
              </Label>
              <Input
                id="ec"
                type="text"
                value={ec}
                onChange={(e) => setEc(e.target.value)}
                className="col-span-3"
                placeholder="Ex: 1.8"
              />
            </div>

            {/* Notes */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="notes" className="text-right">
                Observações
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="col-span-3"
                placeholder="Observações adicionais..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateMutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
