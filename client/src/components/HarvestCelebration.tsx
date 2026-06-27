/**
 * HarvestCelebration — a "festa" da colheita (troféu de ouro + estatísticas do
 * ciclo). Reusada ao iniciar a Secagem (StartDryingModal) e ao Finalizar Ciclo
 * (Home). Renderiza dentro de um Dialog já aberto. Dados via cycles.harvestReport.
 */
import { trpc } from "@/lib/trpc";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TrophyIcon } from "@/components/TrophyIcon";
import { CalendarDays, ClipboardCheck, Target, Sprout } from "lucide-react";

interface HarvestCelebrationProps {
  cycleId: number;
  /** Nome de fallback se o report ainda não carregou (estufa/ciclo). */
  fallbackName?: string;
  onDone: () => void;
}

export function HarvestCelebration({ cycleId, fallbackName, onDone }: HarvestCelebrationProps) {
  const { data: report } = trpc.cycles.harvestReport.useQuery({ cycleId });

  const stats = [
    { Icon: CalendarDays, label: "Dias de cultivo", value: report ? `${report.days}` : "—" },
    { Icon: ClipboardCheck, label: "Registros", value: report ? `${report.logsCount}` : "—" },
    { Icon: Target, label: "Consistência", value: report ? `${report.pctLogged}%` : "—" },
    { Icon: Sprout, label: "Plantas", value: report ? `${report.plantCount}` : "—" },
  ];

  return (
    <div className="text-center py-2">
      <TrophyIcon tier="gold" size={76} className="mx-auto" />
      <h3 className="text-xl font-bold text-foreground mt-2">Colheita concluída! 🎉</h3>
      <p className="text-sm text-muted-foreground">{report?.strainName ?? fallbackName ?? ""}</p>
      <div className="grid grid-cols-2 gap-3 mt-5">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-0.5 rounded-xl border border-border/50 bg-muted/10 py-3">
            <s.Icon className="w-4 h-4 text-primary mb-0.5" />
            <span className="text-xl font-bold text-foreground tabular-nums leading-none">{s.value}</span>
            <span className="text-[11px] text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-4">Boa colheita, grower! 🌿 Veja seus troféus no Progresso.</p>
      <DialogFooter className="mt-5">
        <Button onClick={onDone} className="w-full">Concluir</Button>
      </DialogFooter>
    </div>
  );
}
