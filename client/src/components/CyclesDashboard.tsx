import type React from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { phaseColor, phaseColorAlpha, PHASE_LABELS, type Phase } from "@/lib/phaseColors";
import { Sprout, Leaf, Scissors, Droplets, Wind, Package, Calendar } from "lucide-react";
// PhaseTransitionDialog moved to tent cards

export function CyclesDashboard() {
  const { data: cycles, isLoading } = trpc.cycles.getActiveCyclesWithProgress.useQuery();
  // Phase transition moved to tent cards

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Ciclos Ativos</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map(i => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-4"></div>
              <div className="h-2 bg-muted rounded w-full mb-2"></div>
              <div className="h-3 bg-muted rounded w-1/2"></div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!cycles || cycles.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Ciclos Ativos</h2>
        <Card className="p-8 text-center text-muted-foreground">
          <Sprout className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Nenhum ciclo ativo no momento</p>
          <p className="text-sm mt-2">Inicie um novo ciclo para começar o cultivo</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Ciclos Ativos</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {cycles.map((cycle: any) => {
          const pc = phaseColor(cycle.phase as Phase);
          const pcAlpha10 = phaseColorAlpha(cycle.phase as Phase, 0.10);
          const phaseProgressStyle: React.CSSProperties = {
            background: pc,
            boxShadow: `0 0 8px ${phaseColorAlpha(cycle.phase as Phase, 0.65)}, 0 0 18px ${phaseColorAlpha(cycle.phase as Phase, 0.28)}`,
          };
          const gradientBorder = `linear-gradient(135deg, ${pc}, ${phaseColorAlpha(cycle.phase as Phase, 0.55)})`;
          const phaseLabel = PHASE_LABELS[cycle.phase as Phase] ?? cycle.phase;

          const PHASE_ICONS: Partial<Record<Phase, React.ElementType>> = {
            MAINTENANCE: Leaf,
            CLONING: Scissors,
            FLORA: Leaf,
            FLUSHING: Droplets,
            HARVEST: Scissors,
            DRYING: Wind,
            CURING: Package,
          };
          const PhaseIcon = PHASE_ICONS[cycle.phase as Phase] ?? Sprout;

          return (
            <div key={cycle.id} style={{ background: gradientBorder, padding: '1.5px', borderRadius: '0.75rem' }}>
            <Card className="p-6 border-0 rounded-[10px] bg-card">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: pcAlpha10 }}>
                    <PhaseIcon className="w-5 h-5" style={{ color: pc }} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{cycle.tentName}</h3>
                    <p className="text-sm text-muted-foreground">{cycle.strainName}</p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: pcAlpha10, color: pc }}>
                  {phaseLabel}
                </span>
              </div>

              {/* Progress */}
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">
                    {cycle.phase === 'MAINTENANCE' && 'Manutenção'}
                    {cycle.phase === 'CLONING' && `Clonagem - Semana ${cycle.currentWeek}`}
                    {(cycle.phase === 'VEGA' || cycle.phase === 'FLORA') && `Semana ${cycle.currentWeek} de ${cycle.totalWeeks}`}
                  </span>
                  {(cycle.phase === 'VEGA' || cycle.phase === 'FLORA') && (
                    <span className="text-muted-foreground">{cycle.progress}%</span>
                  )}
                </div>
                {(cycle.phase === 'VEGA' || cycle.phase === 'FLORA') && (
                  <Progress value={cycle.progress} className="h-2" indicatorStyle={phaseProgressStyle} />
                )}
              </div>

              {/* Harvest Date (apenas para VEGA/FLORA) ou Clones Produzidos (MAINTENANCE) */}
              {(cycle.phase === 'VEGA' || cycle.phase === 'FLORA') && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>
                    Colheita estimada:{" "}
                    <span className="font-medium text-foreground">
                      {new Date(cycle.estimatedHarvestDate).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </span>
                    {cycle.daysUntilHarvest > 0 && (
                      <span className="ml-1">
                        ({cycle.daysUntilHarvest} dias)
                      </span>
                    )}
                  </span>
                </div>
              )}
              {cycle.phase === 'MAINTENANCE' && cycle.clonesProduced && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Scissors className="w-4 h-4" />
                  <span>
                    Última clonagem:{" "}
                    <span className="font-medium text-foreground">
                      {cycle.clonesProduced} clones produzidos
                    </span>
                  </span>
                </div>
              )}


            </Card>
            </div>
          );
        })}
      </div>

      {/* Phase transition moved to tent cards */}
    </div>
  );
}
