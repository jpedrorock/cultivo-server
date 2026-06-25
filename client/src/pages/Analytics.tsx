import { useState } from "react";
import { BarChart3, TrendingUp, Columns3, Thermometer, Droplets } from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { AnalyticsCharts } from "@/components/AnalyticsCharts";
import { EmptyState } from "@/components/EmptyState";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const PHASE_LABEL: Record<string, string> = {
  VEGA: "Vegetativo",
  FLORA: "Floração",
  DRYING: "Secagem",
  MAINTENANCE: "Manutenção",
};

function avg(nums: number[]): number | null {
  const valid = nums.filter((n) => Number.isFinite(n));
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

/** Linha de comparação — busca os logs da própria estufa e calcula médias (7d). */
function CompareRow({ tent }: { tent: any }) {
  const { data: logs } = trpc.dailyLogs.list.useQuery({ tentId: tent.id });
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = (logs ?? []).filter((l: any) => new Date(l.logDate).getTime() >= cutoff);
  const avgTemp = avg(recent.map((l: any) => parseFloat(l.tempC)));
  const avgRh = avg(recent.map((l: any) => parseFloat(l.rhPct)));

  return (
    <tr className="border-b border-border/40">
      <td className="py-2.5 pr-3 font-medium text-foreground">{tent.name}</td>
      <td className="py-2.5 px-3 text-muted-foreground">{PHASE_LABEL[tent.category] ?? "—"}</td>
      <td className="py-2.5 px-3 tabular-nums text-right">{avgTemp != null ? `${avgTemp.toFixed(1)}°C` : "—"}</td>
      <td className="py-2.5 px-3 tabular-nums text-right">{avgRh != null ? `${avgRh.toFixed(0)}%` : "—"}</td>
      <td className="py-2.5 pl-3 tabular-nums text-right text-muted-foreground">{recent.length}</td>
    </tr>
  );
}

export default function Analytics() {
  const { data: tents } = trpc.tents.list.useQuery();
  const [tab, setTab] = useState<"trends" | "compare">("trends");
  const [selectedTentId, setSelectedTentId] = useState<number | null>(null);

  const tentList = tents ?? [];
  const activeTentId = selectedTentId ?? tentList[0]?.id ?? null;
  const { data: logs } = trpc.dailyLogs.list.useQuery(
    { tentId: activeTentId ?? 0 },
    { enabled: activeTentId != null }
  );

  return (
    <PageLayout
      header={
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-foreground">Analytics</h1>
              <p className="text-xs text-muted-foreground">Entenda seu cultivo — tendências e comparativos</p>
            </div>
          </div>
        </div>
      }
    >
      <main className="container mx-auto px-3 py-4 md:px-4 md:py-6 max-w-5xl">
        {tentList.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="Sem dados ainda"
            description="Crie uma estufa e registre leituras para ver tendências e comparativos do seu cultivo."
          />
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-2 mb-5">
              <button
                onClick={() => setTab("trends")}
                className={cn(
                  "flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border transition-colors",
                  tab === "trends" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <TrendingUp className="w-3.5 h-3.5" /> Tendências
              </button>
              <button
                onClick={() => setTab("compare")}
                className={cn(
                  "flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border transition-colors",
                  tab === "compare" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <Columns3 className="w-3.5 h-3.5" /> Comparativo
              </button>
            </div>

            {tab === "trends" ? (
              <div className="space-y-4">
                {/* Seletor de estufa */}
                {tentList.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {tentList.map((t: any) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTentId(t.id)}
                        className={cn(
                          "text-xs px-3 py-1.5 rounded-full border transition-colors",
                          activeTentId === t.id ? "bg-primary/10 text-primary border-primary/30" : "border-border text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
                {logs && logs.length > 0 ? (
                  <AnalyticsCharts logs={logs as any} />
                ) : (
                  <EmptyState
                    icon={TrendingUp}
                    title="Sem registros nesta estufa"
                    description="Registre leituras ambientais (temperatura, umidade, pH…) para ver os gráficos de tendência."
                  />
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-border/50 bg-card p-4 overflow-x-auto">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Médias dos últimos 7 dias
                </p>
                <table className="w-full text-sm min-w-[420px]">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="text-left font-medium pb-2 pr-3">Estufa</th>
                      <th className="text-left font-medium pb-2 px-3">Fase</th>
                      <th className="text-right font-medium pb-2 px-3"><Thermometer className="w-3.5 h-3.5 inline" /> Temp</th>
                      <th className="text-right font-medium pb-2 px-3"><Droplets className="w-3.5 h-3.5 inline" /> Umid.</th>
                      <th className="text-right font-medium pb-2 pl-3">Registros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tentList.map((t: any) => (
                      <CompareRow key={t.id} tent={t} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </PageLayout>
  );
}
