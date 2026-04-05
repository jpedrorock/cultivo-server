import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Scissors, ArrowRight, Sprout, Loader2 } from "lucide-react";
import { normalizeTechniqueName, TECHNIQUE_CONFIGS, type TechniqueId } from "@/features/training/techniqueConfigs";
import PlantNodeMap from "@/components/PlantNodeMap";

interface Props {
  plantId: number;
}

export default function PlantTrainingSummary({ plantId }: Props) {
  const [, navigate] = useLocation();
  const { data: logs = [], isLoading } = trpc.plantLST.list.useQuery({ plantId });
  const { data: stats } = trpc.plantLST.stats.useQuery({ plantId });

  const recentLogs = (logs as any[]).slice(0, 3);

  return (
    <div className="space-y-4 pb-24">
      {/* Mapa de nós compacto */}
      <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
            Mapa da planta
          </p>
          {(stats?.total ?? 0) > 0 && (
            <span className="text-[10px] text-muted-foreground">{stats?.total} sessões</span>
          )}
        </div>
        <PlantNodeMap plantId={plantId} compact />
      </div>

      {/* Últimas técnicas */}
      <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <h3 className="text-sm font-semibold">Histórico de Treinos</h3>
          {(logs as any[]).length > 0 && (
            <span className="text-xs text-muted-foreground">{(logs as any[]).length} registros</span>
          )}
        </div>

        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && (logs as any[]).length === 0 && (
          <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
            <Sprout className="w-8 h-8 opacity-30" />
            <p className="text-sm">Nenhum treinamento ainda</p>
          </div>
        )}

        {recentLogs.map((log: any) => {
          const techId = normalizeTechniqueName(log.technique);
          const cfg = techId ? TECHNIQUE_CONFIGS[techId as TechniqueId] : null;
          return (
            <div
              key={log.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-border/20 last:border-b-0"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: cfg?.color ?? "#6b7280" }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{log.technique}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(log.logDate), "dd/MM/yyyy", { locale: ptBR })}
                  {log.response && <> · {log.response}</>}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Botão ver tudo */}
      <button
        onClick={() => navigate(`/plants/${plantId}/training`)}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-primary/30 bg-primary/5 text-primary font-semibold text-sm active:scale-[0.98] transition-transform hover:bg-primary/10"
      >
        <Scissors className="w-4 h-4" />
        Ver todos os treinamentos
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
