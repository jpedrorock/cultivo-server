import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Flower2, Sun, Moon, ArrowRight } from "lucide-react";
import { haptics } from "@/lib/haptics";

interface StartFloraModalProps {
  open: boolean;
  onClose: () => void;
  cycleId: number;
  cycleName: string;
}

export function StartFloraModal({ open, onClose, cycleId, cycleName }: StartFloraModalProps) {
  const [floraStartDate, setFloraStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [targetTentId, setTargetTentId] = useState<string>("");
  const [celebrating, setCelebrating] = useState(false);

  const { data: tents } = trpc.tents.list.useQuery();
  const utils = trpc.useUtils();

  const transitionToFlora = trpc.cycles.transitionToFlora.useMutation({
    onSuccess: () => {
      utils.cycles.getActiveCyclesWithProgress.invalidate();
      utils.cycles.listActive.invalidate();
      utils.tents.list.invalidate();
      haptics.success().catch(() => {});
      setCelebrating(true); // mostra a "passagem" veg→flora em vez de fechar
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const handleSubmit = () => {
    transitionToFlora.mutate({
      cycleId,
      floraStartDate: new Date(floraStartDate),
      targetTentId: targetTentId ? parseInt(targetTentId) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        {celebrating ? (
          <div className="text-center py-2">
            <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-fuchsia-500/20 to-purple-500/20 flex items-center justify-center">
              <Flower2 className="w-11 h-11 text-fuchsia-400" />
            </div>
            <h3 className="text-xl font-bold text-foreground mt-3">Floração iniciada! 🌸</h3>
            <p className="text-sm text-muted-foreground">{cycleName}</p>

            {/* A passagem do fotoperíodo — o coração do flip */}
            <div className="flex items-center justify-center gap-3 mt-5">
              <div className="flex flex-col items-center gap-1 rounded-xl border border-border/50 bg-muted/10 px-4 py-3 opacity-60">
                <Sun className="w-5 h-5 text-amber-400" />
                <span className="text-base font-bold text-foreground tabular-nums leading-none">18/6</span>
                <span className="text-[10px] text-muted-foreground">Vega</span>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="flex flex-col items-center gap-1 rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 px-4 py-3">
                <Moon className="w-5 h-5 text-fuchsia-400" />
                <span className="text-base font-bold text-foreground tabular-nums leading-none">12/12</span>
                <span className="text-[10px] text-fuchsia-400 font-medium">Floração</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-5">
              O fotoperíodo mudou pra 12/12 — as plantas vão começar a florir nas próximas semanas. 🌿
            </p>
            <DialogFooter className="mt-5">
              <Button onClick={onClose} className="w-full">Concluir</Button>
            </DialogFooter>
          </div>
        ) : (
        <>
        <DialogHeader>
          <DialogTitle>Iniciar Floração</DialogTitle>
          <DialogDescription>
            Marcar o ciclo "{cycleName}" como em floração
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Data de início */}
          <div className="space-y-2">
            <Label htmlFor="floraStartDate">Data de Início da Floração</Label>
            <Input
              id="floraStartDate"
              type="date"
              value={floraStartDate}
              onChange={(e) => setFloraStartDate(e.target.value)}
            />
          </div>

          {/* Estufa de destino (opcional) */}
          <div className="space-y-2">
            <Label htmlFor="targetTent">
              Mover plantas para estufa? (opcional)
            </Label>
            <Select value={targetTentId} onValueChange={setTargetTentId}>
              <SelectTrigger>
                <SelectValue placeholder="Manter na estufa atual" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Manter na estufa atual</SelectItem>
                {tents?.map((tent) => (
                  <SelectItem key={tent.id} value={tent.id.toString()}>
                    {tent.name} ({tent.category})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Se selecionado, todas as plantas serão movidas para a estufa escolhida
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={transitionToFlora.isPending}
          >
            {transitionToFlora.isPending ? "Processando..." : "Iniciar Floração"}
          </Button>
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
