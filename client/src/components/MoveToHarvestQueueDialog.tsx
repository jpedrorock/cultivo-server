import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Wind, Loader2, ChevronRight, CheckCircle2, Circle, Scale, FileText, Leaf, FlaskConical, Scissors, Sprout } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { differenceInWeeks } from "date-fns";

interface MoveToHarvestQueueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: number;
  tentId: number;
  tentName: string;
  onSuccess?: () => void;
}

const CHECKLIST_ITEMS = [
  { id: "trichomes", icon: FlaskConical, label: "Tricomas âmbar verificados" },
  { id: "flush",     icon: Leaf,         label: "Flush (água pura) concluído" },
  { id: "tools",     icon: Scissors,     label: "Ferramentas esterilizadas" },
  { id: "space",     icon: Wind,         label: "Espaço de processamento pronto" },
];

export function MoveToHarvestQueueDialog({
  open,
  onOpenChange,
  cycleId,
  tentId,
  tentName,
  onSuccess,
}: MoveToHarvestQueueDialogProps) {
  const utils = trpc.useUtils();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [harvestWeight, setHarvestWeight] = useState("");
  const [harvestNotes, setHarvestNotes] = useState("");

  const { data: cycle } = trpc.cycles.getByTent.useQuery(
    { tentId },
    { enabled: open }
  );
  const { data: allPlants } = trpc.plants.list.useQuery(
    { status: "ACTIVE" },
    { enabled: open }
  );
  const tentPlants = allPlants?.filter((p: any) => p.currentTentId === tentId) ?? [];
  const floraWeeks = cycle?.floraStartDate
    ? differenceInWeeks(new Date(), new Date(cycle.floraStartDate))
    : null;

  const moveToQueueMutation = trpc.harvestQueue.moveToQueue.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      handleClose();
      utils.harvestQueue.list.refetch();
      utils.tents.list.refetch();
      utils.cycles.listActive.refetch();
      utils.cycles.getActiveCyclesWithProgress.refetch();
      utils.plants.list.refetch();
      onSuccess?.();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep(1);
      setChecked(new Set());
      setHarvestWeight("");
      setHarvestNotes("");
    }, 300);
  };

  const toggleCheck = (id: string) =>
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleConfirm = () => {
    moveToQueueMutation.mutate({
      cycleId,
      harvestNotes: harvestNotes || undefined,
      harvestWeight: harvestWeight ? parseFloat(harvestWeight) : undefined,
    });
  };

  const StepDots = () => (
    <div className="flex items-center justify-center gap-2 mb-1">
      {([1, 2, 3] as const).map(s => (
        <div
          key={s}
          className={`rounded-full transition-all duration-300 ${
            s === step
              ? "w-5 h-1.5 bg-amber-400"
              : s < step
              ? "w-1.5 h-1.5 bg-amber-400/50"
              : "w-1.5 h-1.5 bg-white/15"
          }`}
        />
      ))}
    </div>
  );

  const STEP_TITLES = ["Preparação", "Dados da Colheita", "Confirmar"];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader className="pb-1">
          <StepDots />
          <DialogTitle className="text-base text-center">
            Modo Colheita · {STEP_TITLES[step - 1]}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: Preparação ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="rounded-xl p-4 flex items-center gap-3 bg-amber-500/10 border border-amber-500/25">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <Wind className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">{tentName}</p>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  <span className="text-xs text-amber-400 font-medium">
                    🌿 {tentPlants.length} planta{tentPlants.length !== 1 ? "s" : ""}
                  </span>
                  {floraWeeks !== null && (
                    <span className="text-xs text-muted-foreground">Flora S{floraWeeks}</span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-foreground mb-3">Antes de colher, verifique:</p>
              <div className="space-y-2">
                {CHECKLIST_ITEMS.map(({ id, icon: Icon, label }) => {
                  const done = checked.has(id);
                  return (
                    <button
                      key={id}
                      onClick={() => toggleCheck(id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all active:scale-[0.98] ${
                        done
                          ? "border-amber-500/40 bg-amber-500/8 text-foreground"
                          : "border-border/40 bg-card hover:bg-white/3 text-muted-foreground"
                      }`}
                    >
                      {done
                        ? <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                        : <Circle className="w-4 h-4 shrink-0 opacity-40" />
                      }
                      <Icon className="w-3.5 h-3.5 shrink-0 opacity-60" />
                      <span className="text-sm">{label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground/50 mt-2 text-center">Opcional — apenas lembretes</p>
            </div>

            <Button
              className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold"
              onClick={() => setStep(2)}
            >
              Tudo pronto!
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* ── Step 2: Dados da Colheita ──────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Registrar dados</p>
              <p className="text-xs text-muted-foreground">Opcional — ajuda a comparar ciclos futuros</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="harvest-weight" className="flex items-center gap-2 text-sm">
                  <Scale className="w-3.5 h-3.5 text-amber-400" />
                  Peso úmido total (g)
                </Label>
                <Input
                  id="harvest-weight"
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 450"
                  value={harvestWeight}
                  onChange={(e) => setHarvestWeight(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="harvest-notes" className="flex items-center gap-2 text-sm">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  Observações
                </Label>
                <Textarea
                  id="harvest-notes"
                  placeholder="Ex: Tricomas âmbar na maioria, aroma intenso..."
                  value={harvestNotes}
                  onChange={(e) => setHarvestNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Voltar
              </Button>
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold"
                onClick={() => setStep(3)}
              >
                Continuar
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Confirmação ────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="rounded-xl border border-border/40 bg-card divide-y divide-border/30 overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Estufa</span>
                <span className="text-sm font-semibold">{tentName}</span>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plantas</span>
                <span className="text-sm font-semibold">
                  {tentPlants.length} planta{tentPlants.length !== 1 ? "s" : ""}
                </span>
              </div>
              {harvestWeight && (
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Peso úmido</span>
                  <span className="text-sm font-semibold">{harvestWeight}g</span>
                </div>
              )}
              {harvestNotes && (
                <div className="px-4 py-3">
                  <span className="text-sm text-muted-foreground block mb-1">Observações</span>
                  <span className="text-sm">{harvestNotes}</span>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-amber-500/6 border border-amber-500/20 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">O que vai acontecer</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-start gap-2">
                  <Sprout className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400/60" />
                  Plantas → <strong className="text-foreground ml-1">Aguardando Secagem</strong>
                </li>
                <li className="flex items-start gap-2">
                  <Wind className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400/60" />
                  Ciclo atual <strong className="text-foreground ml-1">finalizado</strong>
                </li>
                <li className="flex items-start gap-2">
                  <Leaf className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400/60" />
                  <strong className="text-foreground">{tentName}</strong>
                  <span className="ml-1">disponível para novo ciclo</span>
                </li>
              </ul>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(2)}
                disabled={moveToQueueMutation.isPending}
              >
                Voltar
              </Button>
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold"
                onClick={handleConfirm}
                disabled={moveToQueueMutation.isPending}
              >
                {moveToQueueMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Colhendo...
                  </>
                ) : (
                  <>
                    <Wind className="w-4 h-4 mr-1.5" />
                    Confirmar Colheita
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
