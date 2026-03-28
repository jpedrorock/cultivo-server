import { trpc } from "@/lib/trpc";
import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowLeft, Plus, ThermometerSun, Droplets, Sun, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { differenceInHours, differenceInDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageTransition } from "@/components/PageTransition";

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
  return { label: `${d} dias atrás`, dot: "bg-red-500", text: "text-red-600 dark:text-red-400" };
}

// ── Card por estufa ───────────────────────────────────────────────────────────

function TentMorningCard({ tent }: { tent: any }) {
  const { data: logs } = trpc.dailyLogs.list.useQuery({ tentId: tent.id, limit: 1 });
  const { data: cycle } = trpc.cycles.getByTent.useQuery({ tentId: tent.id });

  const log  = logs?.[0];
  const temp = log?.tempC ? parseFloat(String(log.tempC)) : null;
  const rh   = log?.rhPct ? parseFloat(String(log.rhPct)) : null;
  const vpd  = temp !== null && rh !== null ? calcVPD(temp, rh) : null;
  const ppfd = log?.ppfd ? Number(log.ppfd) : null;
  const fresh = log ? freshnessInfo(new Date(log.logDate)) : null;

  const phaseLabel = !cycle ? "Sem ciclo"
    : tent.category === "MAINTENANCE" ? "Manutenção"
    : tent.category === "DRYING" ? "Secagem"
    : cycle.floraStartDate ? `Flora` : `Vega`;

  const phaseColor = !cycle ? "bg-muted text-muted-foreground"
    : cycle.floraStartDate ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";

  const borderColor = !fresh ? "border-border"
    : fresh.dot === "bg-emerald-500" ? "border-emerald-500/30"
    : fresh.dot === "bg-amber-500" ? "border-amber-500/30"
    : "border-red-500/30";

  return (
    <div className={`bg-card rounded-2xl border-2 ${borderColor} p-4 space-y-3`}>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-base text-foreground leading-tight truncate">{tent.name}</h3>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${phaseColor}`}>{phaseLabel}</span>
            <span className="text-xs text-muted-foreground">{tent.width}×{tent.depth}×{tent.height}cm</span>
          </div>
        </div>
        <Link href={`/quick-log?tentId=${tent.id}`}>
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
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function MorningCheck() {
  const { data: tents = [], isLoading } = trpc.tents.list.useQuery();

  const now = new Date();
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28">

        {/* Header */}
        <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
          <div className="container py-4">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="icon" className="shrink-0">
                <Link href="/"><ArrowLeft className="w-5 h-5" /></Link>
              </Button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-foreground">Morning Check</h1>
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-base font-bold text-primary tabular-nums">{timeStr}</span>
                </div>
                <p className="text-xs text-muted-foreground capitalize">{dateStr}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="container py-4 max-w-2xl space-y-3">

          {/* Summary strip */}
          {!isLoading && tents.length > 0 && (
            <SummaryStrip tents={tents} />
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
            <div className="space-y-3">
              {tents.map((tent: any) => (
                <TentMorningCard key={tent.id} tent={tent} />
              ))}
            </div>
          )}
        </main>
      </div>
    </PageTransition>
  );
}

// ── Summary strip ─────────────────────────────────────────────────────────────

function SummaryStrip({ tents }: { tents: any[] }) {
  const count = tents.length;
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-border">
      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
      <span className="text-sm font-medium text-foreground">
        {count} {count === 1 ? "estufa" : "estufas"} para verificar
      </span>
      <span className="ml-auto text-xs text-muted-foreground">toque no cartão para detalhes</span>
    </div>
  );
}
