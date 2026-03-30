import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Thermometer,
  Droplets,
  Sun,
  FlaskConical,
  Zap,
  Loader2,
  ChevronDown,
  ChevronUp,
  Download,
  Home,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface PlantEnvironmentTabProps {
  plantId: number;
}

function formatVal(val: string | number | null | undefined, suffix: string) {
  if (val === null || val === undefined) return null;
  return `${val}${suffix}`;
}

// Célula de dado: label em cima, ícone + valor embaixo
function Cell({
  icon: Icon,
  label,
  value,
  iconColor,
  children,
}: {
  icon?: any;
  label: string;
  value?: string | null;
  iconColor?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider leading-none">
        {label}
      </span>
      {children ?? (
        value ? (
          <span className="flex items-center gap-1 text-sm font-medium text-foreground/80 leading-none">
            {Icon && <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />}
            {value}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground/20 leading-none">—</span>
        )
      )}
    </div>
  );
}

const healthConfig: Record<string, { label: string; color: string; dot: string }> = {
  HEALTHY:    { label: "Saudável",    color: "text-green-400",  dot: "bg-green-400" },
  STRESSED:   { label: "Estressada",  color: "text-amber-400",  dot: "bg-amber-400" },
  SICK:       { label: "Doente",      color: "text-red-400",    dot: "bg-red-400" },
  RECOVERING: { label: "Recuperando", color: "text-blue-400",   dot: "bg-blue-400" },
};

function LogRow({
  log,
  isEven,
  healthStatus,
}: {
  log: any;
  isEven: boolean;
  healthStatus: string | null;
}) {
  const date = new Date(log.logDate);
  const dateStr = date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const isAM = log.turn === "AM";
  const health = healthStatus ? healthConfig[healthStatus] : null;

  return (
    <div className={`border-b border-border/[0.12] last:border-0 ${isEven ? "bg-white/[0.02]" : ""}`}>

      {/* Header — data full width */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <span className="text-xs font-semibold text-foreground/70 capitalize">{dateStr}</span>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded leading-none ${
          isAM
            ? "bg-amber-500/10 text-amber-400/70"
            : "bg-indigo-500/10 text-indigo-400/70"
        }`}>
          {isAM ? "AM" : "PM"}
        </span>
        {log.notes && (
          <span className="text-[11px] text-muted-foreground/35 italic truncate flex-1 ml-1">
            {log.notes}
          </span>
        )}
      </div>

      {/* Dados em 2 linhas de 3 colunas */}
      <div className="mx-4 mb-4 rounded-xl border border-border/20 overflow-hidden">

        {/* Linha 1 — Temp · Humidade · Saúde */}
        <div className="grid grid-cols-3 divide-x divide-border/20 bg-white/[0.015]">
          <div className="px-3 py-3">
            <Cell
              icon={Thermometer}
              label="Temp"
              value={formatVal(log.tempC, "°C")}
              iconColor="text-orange-400"
            />
          </div>
          <div className="px-3 py-3">
            <Cell
              icon={Droplets}
              label="Humidade"
              value={formatVal(log.rhPct, "%")}
              iconColor="text-blue-400"
            />
          </div>
          <div className="px-3 py-3">
            <Cell label="Saúde">
              {health ? (
                <span className={`flex items-center gap-1 text-sm font-medium leading-none ${health.color}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${health.dot}`} />
                  {health.label}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground/20 leading-none">—</span>
              )}
            </Cell>
          </div>
        </div>

        {/* Divisor entre linhas */}
        <div className="h-px bg-border/20" />

        {/* Linha 2 — PPFD · pH · EC */}
        <div className="grid grid-cols-3 divide-x divide-border/20">
          <div className="px-3 py-3">
            <Cell
              icon={Sun}
              label="PPFD"
              value={log.ppfd ? `${log.ppfd} µmol` : null}
              iconColor="text-yellow-400"
            />
          </div>
          <div className="px-3 py-3">
            <Cell
              icon={FlaskConical}
              label="pH"
              value={formatVal(log.ph, "")}
              iconColor="text-teal-400"
            />
          </div>
          <div className="px-3 py-3">
            <Cell
              icon={Zap}
              label="EC"
              value={formatVal(log.ec, "")}
              iconColor="text-violet-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PeriodCard({
  period,
  index,
  defaultOpen,
  healthMap,
}: {
  period: any;
  index: number;
  defaultOpen: boolean;
  healthMap: Record<string, string>;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const phaseColors = [
    { border: "border-green-500/25",  glow: "rgba(34,197,94,0.07)",   header: "text-green-400",  dot: "bg-green-400" },
    { border: "border-purple-500/25", glow: "rgba(168,85,247,0.07)",  header: "text-purple-400", dot: "bg-purple-400" },
    { border: "border-amber-500/25",  glow: "rgba(245,158,11,0.07)",  header: "text-amber-400",  dot: "bg-amber-400" },
    { border: "border-blue-500/25",   glow: "rgba(59,130,246,0.07)",  header: "text-blue-400",   dot: "bg-blue-400" },
  ];
  const color = phaseColors[index % phaseColors.length];

  const start = new Date(period.start);
  const end = period.end ? new Date(period.end) : null;
  const startStr = start.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const endStr = end
    ? end.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    : "hoje";

  const logsWithTemp = period.logs.filter((l: any) => l.tempC);
  const avgTemp = logsWithTemp.length
    ? (logsWithTemp.reduce((s: number, l: any) => s + parseFloat(l.tempC), 0) / logsWithTemp.length).toFixed(1)
    : null;
  const logsWithRh = period.logs.filter((l: any) => l.rhPct);
  const avgRh = logsWithRh.length
    ? Math.round(logsWithRh.reduce((s: number, l: any) => s + parseFloat(l.rhPct), 0) / logsWithRh.length)
    : null;

  return (
    <div
      className={`rounded-2xl border ${color.border} bg-card overflow-hidden`}
      style={{ background: `linear-gradient(135deg, ${color.glow} 0%, hsl(var(--card)) 50%)` }}
    >
      {/* Header colapsável */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${color.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Home className={`w-3.5 h-3.5 shrink-0 ${color.header}`} />
            <p className={`text-sm font-semibold truncate ${color.header}`}>{period.tentName}</p>
          </div>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
            {startStr} → {endStr}
            <span className="mx-1.5">·</span>
            {period.daysInTent} dia{period.daysInTent !== 1 ? "s" : ""}
            <span className="mx-1.5">·</span>
            {period.logCount} registro{period.logCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2 shrink-0 text-[11px] text-muted-foreground/50 font-medium">
          {avgTemp && <span>{avgTemp}°</span>}
          {avgRh && <span>{avgRh}%</span>}
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground/40 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground/40 shrink-0" />
        }
      </button>

      {/* Logs */}
      {open && (
        <div className="border-t border-border/20">
          {period.logs.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground/50">Nenhum registro ambiental neste período</p>
            </div>
          ) : (
            period.logs.map((log: any, i: number) => {
              const dateKey = new Date(log.logDate).toISOString().slice(0, 10);
              return (
                <LogRow
                  key={`${log.id}-${log.turn}`}
                  log={log}
                  isEven={i % 2 === 0}
                  healthStatus={healthMap[dateKey] ?? null}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function PlantEnvironmentTab({ plantId }: PlantEnvironmentTabProps) {
  const { data: periods, isLoading, isError } = trpc.plants.getEnvironmentHistory.useQuery({ plantId });
  const { data: healthLogs } = trpc.plantHealth.list.useQuery({ plantId });

  // Mapa dateKey (YYYY-MM-DD) → healthStatus mais recente do dia
  const healthMap: Record<string, string> = {};
  if (healthLogs) {
    for (const h of healthLogs as any[]) {
      const key = new Date(h.logDate).toISOString().slice(0, 10);
      if (!healthMap[key]) healthMap[key] = h.healthStatus;
    }
  }

  const handleExport = () => {
    if (!periods) return;
    let txt = `HISTÓRICO AMBIENTAL DA PLANTA\nGerado em: ${new Date().toLocaleDateString("pt-BR")}\n${"=".repeat(50)}\n\n`;
    periods.forEach((period: any, i: number) => {
      const start = new Date(period.start).toLocaleDateString("pt-BR");
      const end = period.end ? new Date(period.end).toLocaleDateString("pt-BR") : "hoje";
      txt += `PERÍODO ${i + 1}: ${period.tentName}\n${start} → ${end} (${period.daysInTent} dias)\n${"-".repeat(40)}\n`;
      txt += `Data        Turn  Temp    RH     PPFD       pH    EC    Saúde\n`;
      period.logs.forEach((log: any) => {
        const dateKey = new Date(log.logDate).toISOString().slice(0, 10);
        const health = healthMap[dateKey] ? healthConfig[healthMap[dateKey]]?.label ?? "—" : "—";
        const row = [
          new Date(log.logDate).toLocaleDateString("pt-BR").padEnd(11),
          log.turn.padEnd(5),
          (log.tempC ? `${log.tempC}°C` : "—").padEnd(7),
          (log.rhPct ? `${log.rhPct}%` : "—").padEnd(6),
          (log.ppfd ? `${log.ppfd}µmol` : "—").padEnd(10),
          (log.ph || "—").toString().padEnd(5),
          (log.ec || "—").toString().padEnd(5),
          health,
        ].join("  ");
        txt += row + "\n";
      });
      txt += "\n";
    });
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-ambiental-planta-${plantId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card py-10 text-center">
        <p className="text-sm text-muted-foreground">Erro ao carregar histórico ambiental</p>
      </div>
    );
  }

  const totalLogs = periods?.reduce((s: number, p: any) => s + p.logCount, 0) ?? 0;

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Thermometer className="w-4 h-4" />
            Ambiente por Estufa
          </h3>
          {totalLogs > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {periods?.length} período{(periods?.length ?? 0) !== 1 ? "s" : ""} · {totalLogs} registros
            </p>
          )}
        </div>
        {totalLogs > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" />
            Exportar
          </Button>
        )}
      </div>

      {!periods || periods.length === 0 ? (
        <div className="rounded-2xl border border-border/40 bg-card py-10 text-center">
          <Thermometer className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum histórico ambiental</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Registre dados na estufa para ver o ambiente aqui
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {periods.map((period: any, i: number) => (
            <PeriodCard
              key={`${period.tentId}-${period.start}`}
              period={period}
              index={i}
              defaultOpen={i === periods.length - 1}
              healthMap={healthMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}
