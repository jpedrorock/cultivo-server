import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Sprout, Flower2, Scissors, Wrench, ChevronLeft, ChevronRight, Leaf } from "lucide-react";

interface InitiateCycleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tentId: number;
  tentName: string;
}

type PhaseKey = "CLONING" | "MAINTENANCE" | "VEGA" | "FLORA";

const PHASES: {
  key: PhaseKey;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  maxWeeks: number;
}[] = [
  {
    key: "VEGA",
    label: "Vegetativa",
    icon: Sprout,
    color: "#4ade80",
    bg: "rgba(74,222,128,0.12)",
    border: "rgba(74,222,128,0.35)",
    maxWeeks: 6,
  },
  {
    key: "FLORA",
    label: "Floração",
    icon: Flower2,
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.12)",
    border: "rgba(167,139,250,0.35)",
    maxWeeks: 8,
  },
  {
    key: "CLONING",
    label: "Clonagem",
    icon: Scissors,
    color: "#38bdf8",
    bg: "rgba(56,189,248,0.12)",
    border: "rgba(56,189,248,0.35)",
    maxWeeks: 2,
  },
  {
    key: "MAINTENANCE",
    label: "Manutenção",
    icon: Wrench,
    color: "#60a5fa",
    bg: "rgba(96,165,250,0.12)",
    border: "rgba(96,165,250,0.35)",
    maxWeeks: 1,
  },
];

export function InitiateCycleModal({
  open,
  onOpenChange,
  tentId,
  tentName,
}: InitiateCycleModalProps) {
  const [phase, setPhase] = useState<PhaseKey>("VEGA");
  const [weekNumber, setWeekNumber] = useState(1);
  const [strainId, setStrainId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const utils = trpc.useUtils();
  const { data: strains } = trpc.strains.list.useQuery();
  const initiate = trpc.cycles.initiate.useMutation({
    onSuccess: () => {
      toast.success("Ciclo iniciado com sucesso!");
      utils.cycles.listActive.invalidate();
      utils.cycles.getByTent.invalidate();
      utils.tents.list.invalidate();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Erro ao iniciar ciclo: ${error.message}`);
    },
  });

  const activePhase = PHASES.find((p) => p.key === phase)!;

  const handlePhaseChange = (key: PhaseKey) => {
    setPhase(key);
    setWeekNumber(1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    initiate.mutate({
      tentId,
      strainId: strainId || null,
      startDate: new Date(startDate),
      phase,
      weekNumber,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[460px] p-0 overflow-hidden border-border/50">

        {/* Header com acento de cor da fase */}
        <div
          className="px-6 pt-6 pb-5"
          style={{
            background: `linear-gradient(135deg, ${activePhase.bg} 0%, transparent 70%)`,
            borderBottom: `1px solid ${activePhase.border}`,
          }}
        >
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: activePhase.bg, border: `1px solid ${activePhase.border}`, boxShadow: `0 0 12px ${activePhase.color}30` }}
              >
                <activePhase.icon className="w-5 h-5" style={{ color: activePhase.color }} />
              </div>
              <div>
                <DialogTitle className="text-base font-bold leading-tight">
                  Novo Ciclo
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{tentName}</p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-6">

            {/* Seletor de fase — cards clicáveis */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                Fase Inicial
              </p>
              <div className="grid grid-cols-2 gap-2">
                {PHASES.map((p) => {
                  const Icon = p.icon;
                  const isActive = phase === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => handlePhaseChange(p.key)}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all duration-150"
                      style={{
                        background: isActive ? p.bg : "transparent",
                        borderColor: isActive ? p.border : "color-mix(in oklch, var(--border) 50%, transparent)",
                        boxShadow: isActive ? `0 0 10px ${p.color}20` : "none",
                      }}
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: isActive ? p.bg : "color-mix(in oklch, var(--muted) 50%, transparent)" }}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color: isActive ? p.color : "var(--muted-foreground)" }} />
                      </div>
                      <span className={`text-sm font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                        {p.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Seletor de semana — +/- */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                Semana Atual
              </p>
              <div className="flex items-center justify-between bg-muted/30 rounded-xl border border-border/50 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setWeekNumber(Math.max(1, weekNumber - 1))}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30"
                  disabled={weekNumber <= 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums" style={{ color: activePhase.color }}>
                    {weekNumber}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    de {activePhase.maxWeeks} semanas
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWeekNumber(Math.min(activePhase.maxWeeks, weekNumber + 1))}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30"
                  disabled={weekNumber >= activePhase.maxWeeks}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Strain */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
                <Leaf className="w-3.5 h-3.5" />
                Strain <span className="normal-case font-normal">(opcional)</span>
              </p>
              <Select
                value={strainId?.toString() || "none"}
                onValueChange={(value) => setStrainId(value === "none" ? null : parseInt(value))}
              >
                <SelectTrigger className="bg-muted/30 border-border/50">
                  <SelectValue placeholder="Usar strains das plantas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Usar strains das plantas</SelectItem>
                  {strains?.map((strain) => (
                    <SelectItem key={strain.id} value={strain.id.toString()}>
                      {strain.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground/60">
                Sem seleção, os targets usam a média das strains ativas na estufa.
              </p>
            </div>

            {/* Data de referência */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                Data de Referência
              </p>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="bg-muted/30 border-border/50"
              />
              <p className="text-xs text-muted-foreground/60">
                O sistema calcula a data de início baseado na semana selecionada.
              </p>
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex flex-col gap-2">
            <Button
              type="submit"
              disabled={initiate.isPending}
              className="w-full h-11 text-sm font-semibold"
              style={{
                background: activePhase.color,
                color: "#000",
                boxShadow: `0 0 20px ${activePhase.color}40`,
              }}
            >
              {initiate.isPending ? "Iniciando..." : `Iniciar em ${activePhase.label}`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full h-9 text-sm text-muted-foreground"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>

      </DialogContent>
    </Dialog>
  );
}
