import { useState } from "react";
import type React from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Calendar, Leaf, Sprout, ArrowRight, Scissors } from "lucide-react";
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
          // Determinar ícone, cor e badge baseado na fase
          let PhaseIcon = Sprout;
          let phaseColor = 'text-green-600 dark:text-green-400';
          let phaseBg = 'bg-green-500/10';
          let phaseBorder = 'border-green-500/30';
          let phaseProgressBg = 'bg-green-500/20';
          let phaseProgressBar = '';
          let phaseProgressStyle: React.CSSProperties = {
            background: 'linear-gradient(90deg, #34d399, #22c55e, #16a34a)',
            boxShadow: '0 0 8px rgba(34,197,94,0.7), 0 0 18px rgba(34,197,94,0.3)',
          };
          let phaseLabel = 'Vegetativa';

          if (cycle.phase === 'MAINTENANCE') {
            PhaseIcon = Leaf;
            phaseColor = 'text-blue-600 dark:text-blue-400';
            phaseBg = 'bg-blue-500/10';
            phaseBorder = 'border-blue-500/30';
            phaseProgressBg = 'bg-blue-500/20';
            phaseProgressStyle = {
              background: 'linear-gradient(90deg, #60a5fa, #3b82f6, #2563eb)',
              boxShadow: '0 0 8px rgba(59,130,246,0.7), 0 0 18px rgba(59,130,246,0.3)',
            };
            phaseLabel = 'Manutenção';
          } else if (cycle.phase === 'CLONING') {
            PhaseIcon = Scissors;
            phaseColor = 'text-cyan-600 dark:text-cyan-400';
            phaseBg = 'bg-cyan-500/10';
            phaseBorder = 'border-cyan-500/30';
            phaseProgressBg = 'bg-cyan-500/20';
            phaseProgressStyle = {
              background: 'linear-gradient(90deg, #2dd4bf, #06b6d4, #0891b2)',
              boxShadow: '0 0 8px rgba(6,182,212,0.7), 0 0 18px rgba(6,182,212,0.3)',
            };
            phaseLabel = 'Clonagem';
          } else if (cycle.phase === 'FLORA') {
            PhaseIcon = Leaf;
            phaseColor = 'text-purple-600 dark:text-purple-400';
            phaseBg = 'bg-purple-500/10';
            phaseBorder = 'border-purple-500/30';
            phaseProgressBg = 'bg-purple-500/20';
            phaseProgressStyle = {
              background: 'linear-gradient(90deg, #818cf8, #a78bfa, #c084fc, #a855f7)',
              boxShadow: '0 0 8px rgba(168,85,247,0.8), 0 0 20px rgba(139,92,246,0.4)',
            };
            phaseLabel = 'Floração';
          } else {
            // VEGA (padrão)
            phaseLabel = 'Vegetativa';
          }

          return (
            <Card key={cycle.id} className={`p-6 border-2 ${phaseBorder}`}>
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${phaseBg}`}>
                    <PhaseIcon className={`w-5 h-5 ${phaseColor}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{cycle.tentName}</h3>
                    <p className="text-sm text-muted-foreground">{cycle.strainName}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${phaseBg} ${phaseColor}`}>
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
                  <Progress value={cycle.progress} className={`h-2 ${phaseProgressBg}`} indicatorStyle={phaseProgressStyle} />
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
          );
        })}
      </div>

      {/* Phase transition moved to tent cards */}
    </div>
  );
}
