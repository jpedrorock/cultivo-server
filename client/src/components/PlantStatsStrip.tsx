interface PlantStatsStripProps {
  daysOld: number;
  phaseLabel: string;
  cycleWeek?: number | null;
  tentName?: string | null;
  plantCode?: string | null;
  hasCyclePhase: boolean;
}

export default function PlantStatsStrip({ daysOld, phaseLabel, cycleWeek, tentName, plantCode, hasCyclePhase }: PlantStatsStripProps) {
  return (
    <div className="divide-y divide-border/50">
      {/* Idade */}
      <div className="px-5 py-3.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold text-foreground tabular-nums leading-none">{daysOld}</span>
          <span className="text-sm text-muted-foreground">dias</span>
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mt-1">IDADE</p>
      </div>

      {/* Fase */}
      {hasCyclePhase && (
        <div className="px-5 py-3.5">
          <p className="text-xl font-bold text-foreground leading-none">
            {phaseLabel}{cycleWeek ? ` · S${cycleWeek}` : ''}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mt-1">FASE</p>
        </div>
      )}

      {/* Estufa */}
      {tentName && (
        <div className="px-5 py-3.5">
          <p className="text-xl font-bold text-foreground leading-none">{tentName}</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mt-1">
            ESTUFA{plantCode ? ` · #${plantCode}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
