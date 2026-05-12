import { trpc } from "@/lib/trpc";
import { useMemo } from "react";
import { Link } from "wouter";
import { Plus, ThermometerSun, Droplets, Sun, Clock, CheckCircle2, AlertTriangle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { differenceInHours, differenceInDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageTransition, StaggerList, ListItemAnimation } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";

// ── helpers ──────────────────────────────────────────────────────────────────

function calcVPD(t: number, rh: number) {
  return parseFloat((0.6108 * Math.exp((17.27 * t) / (t + 237.3)) * (1 - rh / 100)).toFixed(2));
}

const tempColor  = (v: number) => v < 18 ? "text-blue-500" : v <= 28 ? "text-emerald-500" : v <= 32 ? "text-amber-500" : "text-red-500";
const rhColor    = (v: number) => v < 40 ? "text-red-500" : v <= 70 ? "text-emerald-500" : v <= 80 ? "text-amber-500" : "text-red-500";
const vpdColor   = (v: number) => v < 0.4 ? "text-blue-500" : v <= 0.8 ? "text-emerald-500" : v <= 1.2 ? "text-purple-500" : v <= 1.6 ? "text-amber-500" : "text-red-500";
const ppfdColor  = (v: number) => v < 200 ? "text-blue-500" : v <= 600 ? "text-emerald-500" : v <= 900 ? "text-amber-500" : "text-red-500";

function freshnessInfo(logDate: Date) {
  const h = differenceInHours(new Date(), logDate);
  const d = differenceInDays(new Date(), logDate);
  if (h < 24) return { label: h === 0 ? "Agora" : `${h}h atrás`, dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };
  if (d === 1) return { label: "Ontem", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" };
  return { label: `${d}d sem registro`, dot: "bg-red-500", text: "text-red-600 dark:text-red-400" };
}

// ── Card por estufa ───────────────────────────────────────────────────────────

function TentMorningCard({
  tent,
  log,
  cycle,
}: {
  tent: any;
  log: any | null;
  cycle: any | null;
}) {
  const temp = log?.tempC ? parseFloat(String(log.tempC)) : null;
  const rh   = log?.rhPct ? parseFloat(String(log.rhPct)) : null;
  const vpd  = temp !== null && rh !== null ? calcVPD(temp, rh) : null;
  const ppfd = log?.ppfd ? Number(log.ppfd) : null;
  const fresh = log ? freshnessInfo(new Date(log.logDate)) : null;

  const phaseLabel = !cycle ? "Sem ciclo"
    : tent.category === "MAINTENANCE" ? "Manutenção"
    : tent.category === "DRYING" ? "Secagem"
    : cycle.floraStartDate ? "Flora" : "Vega";

  const phaseColor = !cycle ? "bg-muted text-muted-foreground"
    : cycle.floraStartDate ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";

  const borderColor = !fresh ? "border-border"
    : fresh.dot === "bg-emerald-500" ? "border-emerald-500/30"
    : fresh.dot === "bg-amber-500" ? "border-amber-500/30"
    : "border-red-500/30";

  return (
    <Link href={`/tent/${tent.id}`}>
      <div className={`bg-card rounded-2xl border-2 ${borderColor} p-4 space-y-3 active:scale-[0.98] transition-transform`}>
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-base text-foreground leading-tight truncate">{tent.name}</h3>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${phaseColor}`}>{phaseLabel}</span>
              <span className="text-xs text-muted-foreground">{tent.width}×{tent.depth}×{tent.height}cm</span>
            </div>
          </div>
          <Link href={`/quick-log?tentId=${tent.id}`} onClick={e => e.stopPropagation()}>
            <Button size="sm" className="shrink-0 h-8 gap-1 text-xs rounded-xl">
              <Plus className="w-3.5 h-3.5" />
              Registrar
            </Button>
          </Link>
        </div>

        {/* Métricas */}
        {log ? (
          <div className="grid grid-cols-4 gap-2">
            {/* Temp */}
            <div className="flex flex-col items-center gap-0.5">
              <ThermometerSun className="w-3.5 h-3.5 text-orange-400 opacity-70" />
              <span className={`text-lg font-black tabular-nums leading-none ${temp !== null ? tempColor(temp) : "text-muted-foreground"}`}>
                {temp !== null ? `${temp.toFixed(1)}°` : "—"}
              </span>
              <span className="text-[9px] text-muted-foreground">Temp</span>
            </div>

            {/* RH */}
            <div className="flex flex-col items-center gap-0.5">
              <Droplets className="w-3.5 h-3.5 text-blue-400 opacity-70" />
              <span className={`text-lg font-black tabular-nums leading-none ${rh !== null ? rhColor(rh) : "text-muted-foreground"}`}>
                {rh !== null ? `${rh.toFixed(0)}%` : "—"}
              </span>
              <span className="text-[9px] text-muted-foreground">UR</span>
            </div>

            {/* VPD */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-bold text-muted-foreground opacity-70">VPD</span>
              <span className={`text-lg font-black tabular-nums leading-none ${vpd !== null ? vpdColor(vpd) : "text-muted-foreground"}`}>
                {vpd !== null ? vpd : "—"}
              </span>
              <span className="text-[9px] text-muted-foreground">kPa</span>
            </div>

            {/* PPFD */}
            <div className="flex flex-col items-center gap-0.5">
              <Sun className="w-3.5 h-3.5 text-yellow-400 opacity-70" />
              <span className={`text-lg font-black tabular-nums leading-none ${ppfd !== null ? ppfdColor(ppfd) : "text-muted-foreground"}`}>
                {ppfd !== null ? ppfd : "—"}
              </span>
              <span className="text-[9px] text-muted-foreground">µmol</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-3 text-muted-foreground text-sm">
            Sem registros ainda
          </div>
        )}

        {/* Rodapé — freshness */}
        {fresh && (
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${fresh.dot} shrink-0`} />
            <span className={`text-xs font-medium ${fresh.text}`}>{fresh.label}</span>
            {log?.logDate && (
              <span className="text-xs text-muted-foreground ml-auto">
                {format(new Date(log.logDate), "dd/MM HH:mm", { locale: ptBR })}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function MorningCheck() {
  const { data: tents = [], isLoading: tentsLoading } = trpc.tents.list.useQuery();

  const tentIds = useMemo(() => tents.map((t: any) => t.id), [tents]);

  // 1 query batch para todos os últimos logs (em vez de N queries)
  const { data: latestLogs = {} } = trpc.dailyLogs.latestByTents.useQuery(
    { tentIds },
    { enabled: tentIds.length > 0 }
  );

  // 1 query para todos os ciclos ativos
  const { data: activeCycles = [] } = trpc.cycles.listActive.useQuery();

  const cycleByTent = useMemo(() => {
    const map: Record<number, any> = {};
    for (const c of activeCycles) map[c.tentId] = c;
    return map;
  }, [activeCycles]);

  const isLoading = tentsLoading;

  const now = new Date();
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  // Contar estufas sem registro hoje
  const staleCount = useMemo(() => {
    return tents.filter((t: any) => {
      const log = latestLogs[t.id];
      if (!log) return true;
      return differenceInHours(new Date(), new Date(log.logDate)) >= 24;
    }).length;
  }, [tents, latestLogs]);

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28">

        <PageHeader
          backHref="/"
          title={
            <>
              <span className="truncate">Status</span>
              <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-base font-bold text-primary tabular-nums">{timeStr}</span>
            </>
          }
          subtitle={<span className="capitalize">{dateStr}</span>}
        />

        <main className="container py-4 max-w-2xl space-y-3">

          {/* Summary strip */}
          {!isLoading && tents.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-border">
              {staleCount === 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              )}
              <span className="text-sm font-medium text-foreground">
                {staleCount === 0
                  ? `${tents.length} ${tents.length === 1 ? "estufa" : "estufas"} atualizadas`
                  : `${staleCount} ${staleCount === 1 ? "estufa" : "estufas"} sem registro hoje`}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">toque para detalhes</span>
            </div>
          )}

          {/* Lista de estufas */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="bg-card rounded-2xl border border-border p-4 animate-pulse h-32" />
              ))}
            </div>
          ) : tents.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              Nenhuma estufa cadastrada
            </div>
          ) : (
            <StaggerList className="space-y-3">
              {tents.map((tent: any) => (
                <ListItemAnimation key={tent.id}>
                  <TentMorningCard
                    tent={tent}
                    log={latestLogs[tent.id] ?? null}
                    cycle={cycleByTent[tent.id] ?? null}
                  />
                </ListItemAnimation>
              ))}
            </StaggerList>
          )}
        </main>
      </div>
    </PageTransition>
  );
}
