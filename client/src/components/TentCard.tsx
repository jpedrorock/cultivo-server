import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertTriangle,
  ArrowRight,
  BarChart2,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardList,
  Clock,
  Droplets,
  Flower2,
  Leaf,
  Monitor,
  MoreVertical,
  RefreshCw,
  Scissors,
  Sprout,
  ThermometerSun,
  Trash2,
  Wifi,
  Wind,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { ListItemAnimation, AnimatedCounter } from "@/components/PageTransition";
import { SelectMotherPlantDialog } from "@/components/SelectMotherPlantDialog";
import { FinishCloningDialog } from "@/components/FinishCloningDialog";
import { PromotePhaseDialog } from "@/components/PromotePhaseDialog";
import { MoveToHarvestQueueDialog } from "@/components/MoveToHarvestQueueDialog";
import { PhaseConfirmDialog, type PhaseConfirmType } from "@/components/PhaseConfirmDialog";
import { MiniSparkline } from "@/components/MiniSparkline";


/**
 * Card de uma estufa na Home — renderiza estado, leitura ao vivo, sparklines,
 * menu de fase (Cloning/Vega/Flora/Drying), atalhos para log/detalhes/tarefas.
 * Recebe handlers do pai para abrir os modais correspondentes.
 */
export function TentCard({
  tent,
  cycle,
  PhaseIcon,
  onInitiateCycle,
  onEditCycle,
  onFinalizeCycle,
  onEditTent,
  onDeleteTent,
}: any) {
  const [, navigate] = useLocation();

  const [selectMotherOpen, setSelectMotherOpen] = useState(false);
  const [selectedMotherId, setSelectedMotherId] = useState<number | null>(null);
  const [selectedMotherName, setSelectedMotherName] = useState<string>("");
  const [selectedClonesCount] = useState<number>(10);
  const [finishCloningOpen, setFinishCloningOpen] = useState(false);
  const [promotePhaseOpen, setPromotePhaseOpen] = useState(false);
  const [harvestQueueOpen, setHarvestQueueOpen] = useState(false);

  // Mini-modal de confirmação de fase
  const [phaseConfirmOpen, setPhaseConfirmOpen] = useState(false);
  const [phaseConfirmType, setPhaseConfirmType] = useState<PhaseConfirmType>("FLORA");

  const openPhaseConfirm = (type: PhaseConfirmType) => {
    setPhaseConfirmType(type);
    setPhaseConfirmOpen(true);
  };

  const handlePhaseConfirmed = () => {
    setPhaseConfirmOpen(false);
    if (phaseConfirmType === "CLONING") {
      setSelectMotherOpen(true);
    } else {
      setPromotePhaseOpen(true);
    }
  };
  
  const { data: latestLog } = trpc.dailyLogs.getLatestByTent.useQuery(
    { tentId: tent.id }
  );

  const { data: sparklineData } = trpc.dailyLogs.sparkline.useQuery(
    { tentId: tent.id, days: 14 },
    { staleTime: 5 * 60 * 1000 }
  );

  // Tarefas desta estufa — Sheet de notas
  const [tasksSheetOpen, setTasksSheetOpen] = useState(false);
  const { data: allWeekTasks } = trpc.tasks.getCurrentWeekTasks.useQuery(
    undefined,
    { staleTime: 2 * 60 * 1000, enabled: tasksSheetOpen }
  );
  const tentTasksList = (allWeekTasks ?? []).filter(t => t.tentId === tent.id);
  const pendingCount = tentTasksList.filter(t => !t.isDone).length;
  const markTaskDone = trpc.tasks.markAsDone.useMutation({
    onSuccess: () => utils.tasks.getCurrentWeekTasks.invalidate(),
  });

  const { data: alertCount } = trpc.alerts.getNewCount.useQuery(
    { tentId: tent.id },
    { staleTime: 2 * 60 * 1000 }
  );
  const newAlerts = alertCount != null ? Number(alertCount) : 0;

  const { data: streak } = trpc.dailyLogs.streak.useQuery(
    { tentId: tent.id },
    { staleTime: 5 * 60 * 1000 }
  );

  // Leitura do sensor SmartLife para badge automático
  const { data: sensorReading } = trpc.tuya.getLatestReadingForTent.useQuery(
    { tentId: tent.id },
    { staleTime: 5 * 60 * 1000, retry: false }
  );
  // Badge "A" aparece sempre que o sensor estiver mapeado (hasSensor), independente de ter leitura
  const isSensorAuto = !!(sensorReading?.hasSensor);

  // VPD helper — Vapor Pressure Deficit em kPa
  const calcVpd = (tempC: number, rhPct: number) =>
    parseFloat((0.6108 * Math.exp(17.27 * tempC / (tempC + 237.3)) * (1 - rhPct / 100)).toFixed(2));

  // Sparkline: média diária dos últimos 14 dias (GROUP BY DATE) → variação real dia a dia
  const logTempsAsc = (sparklineData ?? []).map(r => r.tempC).filter((v): v is number => v !== null);
  const logRhAsc    = (sparklineData ?? []).map(r => r.rhPct).filter((v): v is number => v !== null);
  const logVpdAsc   = (sparklineData ?? [])
    .map(r => r.tempC != null && r.rhPct != null ? calcVpd(r.tempC, r.rhPct) : null)
    .filter((v): v is number => v !== null);

  // Injeta leitura ao vivo no final se diferir do último avg diário — garante ponto atual
  const liveTemp = (sensorReading?.tempC != null && sensorReading.hasSensor) ? sensorReading.tempC : null;
  const liveRh   = (sensorReading?.rhPct  != null && sensorReading.hasSensor) ? sensorReading.rhPct  : null;
  const liveVpd  = liveTemp != null && liveRh != null ? calcVpd(liveTemp, liveRh) : null;
  const lastLogTemp = logTempsAsc.at(-1) ?? null;
  const lastLogRh   = logRhAsc.at(-1) ?? null;
  const lastLogVpd  = logVpdAsc.at(-1) ?? null;
  const injectLive  = liveTemp !== null && (lastLogTemp === null || Math.abs(lastLogTemp - liveTemp) > 0.05);
  const sparkTemps  = useMemo(
    () => injectLive ? [...logTempsAsc, liveTemp] : logTempsAsc,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [injectLive, liveTemp, logTempsAsc.join(',')]
  );
  const sparkRh     = useMemo(
    () => injectLive && liveRh !== null ? [...logRhAsc, liveRh] : (lastLogRh === null && liveRh !== null ? [liveRh] : logRhAsc),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [injectLive, liveRh, lastLogRh, logRhAsc.join(',')]
  );
  const sparkVpd    = useMemo(
    () => injectLive && liveVpd !== null ? [...logVpdAsc, liveVpd] : (lastLogVpd === null && liveVpd !== null ? [liveVpd] : logVpdAsc),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [injectLive, liveVpd, lastLogVpd, logVpdAsc.join(',')]
  );

  // VPD atual para exibição no KPI
  const currentVpd = liveVpd ?? (lastLogVpd ?? null);

  // Função para determinar cor baseada no valor e target
  const _getValueColor = (value: number | null | undefined, min: string | number | null | undefined, max: string | number | null | undefined) => {
    if (!value || !min || !max) return "text-foreground";
    
    // Converter strings para números
    const minNum = typeof min === 'string' ? parseFloat(min) : min;
    const maxNum = typeof max === 'string' ? parseFloat(max) : max;
    
    if (isNaN(minNum) || isNaN(maxNum)) return "text-foreground";
    
    // Verde: dentro da faixa ideal
    if (value >= minNum && value <= maxNum) {
      return "text-green-600 font-bold";
    }
    
    // Amarelo: próximo (±10% de tolerância)
    const tolerance = 0.1;
    const lowerBound = minNum * (1 - tolerance);
    const upperBound = maxNum * (1 + tolerance);
    
    if (value >= lowerBound && value <= upperBound) {
      return "text-yellow-600 font-bold";
    }
    
    // Vermelho: fora da faixa
    return "text-red-600 font-bold";
  };

  // Função para determinar ícone de status
  const _getStatusIcon = (value: number | null | undefined, min: string | number | null | undefined, max: string | number | null | undefined) => {
    if (!value || !min || !max) return null;
    
    const minNum = typeof min === 'string' ? parseFloat(min) : min;
    const maxNum = typeof max === 'string' ? parseFloat(max) : max;
    
    if (isNaN(minNum) || isNaN(maxNum)) return null;
    
    // Verde: dentro da faixa ideal
    if (value >= minNum && value <= maxNum) {
      return <Check className="w-3 h-3 text-green-600 dark:text-green-400" />;
    }
    
    // Amarelo: próximo (±10% de tolerância)
    const tolerance = 0.1;
    const lowerBound = minNum * (1 - tolerance);
    const upperBound = maxNum * (1 + tolerance);
    
    if (value >= lowerBound && value <= upperBound) {
      return <AlertTriangle className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />;
    }
    
    // Vermelho: fora da faixa
    return <X className="w-3 h-3 text-red-600 dark:text-red-400" />;
  };

  const utils = trpc.useUtils();

  const readNow = trpc.tuya.readNow.useMutation({
    onSuccess: (data) => {
      // Atualiza o cache do sensor com os valores retornados direto (sem esperar refetch)
      utils.tuya.getLatestReadingForTent.setData(
        { tentId: tent.id },
        { hasSensor: true, isFresh: true, tempC: data.tempC, rhPct: data.rhPct, readAt: data.readAt }
      );
      utils.dailyLogs.getLatestByTent.invalidate({ tentId: tent.id });
      utils.dailyLogs.list.invalidate({ tentId: tent.id });
      toast.success(`Leitura: ${data.tempC?.toFixed(1)}°C · ${data.rhPct?.toFixed(0)}%`);
    },
    onError: (e) => toast.error(`Sensor: ${e.message}`),
  });

  const phaseAccentColor = !cycle ? '#6b7280' :
    tent.category === 'VEGA'   ? '#4ade80' :
    tent.category === 'FLORA'  ? '#a78bfa' :
    tent.category === 'DRYING' ? '#fbbf24' :
    '#60a5fa';

  // Fundo da fase — só no dark mode via data-theme check; no light ficamos flat
  const phaseBg = 'none';

  return (
    <ListItemAnimation>
      <div className="relative">
      {/* Badge de alertas — canto superior direito do card */}
      {newAlerts > 0 && (
        <Link href="/alerts" onClick={e => e.stopPropagation()}>
          <div
            title={`${newAlerts} alerta${newAlerts > 1 ? 's' : ''}`}
            className="absolute -top-3 right-2 z-30 min-w-[32px] h-[32px] px-2 rounded-full bg-red-500 text-white text-sm font-bold flex items-center justify-center shadow-lg shadow-red-900/50 animate-pulse"
          >
            {newAlerts > 9 ? '9+' : newAlerts}
          </div>
        </Link>
      )}
      <Card className="relative z-10 py-0 shadow-lg shadow-black/15 transition-all duration-200 ease-out active:scale-[0.99] overflow-hidden" data-tour="tent-card" style={{ backgroundColor: 'var(--card)' }}>
        {/* Fundo gradiente da fase */}
        {phaseBg !== 'none' && (
          <div className="pointer-events-none absolute inset-0 z-0" style={{ background: phaseBg }} />
        )}
        {/* Linha de acento no topo */}
        <div className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] z-20" style={{ background: `linear-gradient(90deg, ${phaseAccentColor}99 0%, ${phaseAccentColor}33 100%)` }} />
      <CardHeader className="relative z-10 px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Linha 1: nome + freshness badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-xl font-bold tracking-tight">{tent.name}</CardTitle>
              {(() => {
                if (!tent.lastReadingAt) return (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground">
                    <Clock className="w-3 h-3" /> Sem registros
                  </span>
                );
                const diffMs = Date.now() - tent.lastReadingAt;
                const diffH = Math.floor(diffMs / (1000 * 60 * 60));
                const diffMin = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                const timeText = diffH === 0 ? `há ${diffMin}min` : `há ${diffH}h`;
                const pill = diffH < 24 ? "pill-fresh" : diffH < 48 ? "pill-warning" : "pill-danger";
                return (
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${pill}`}>
                    <Clock className="w-3 h-3" />{timeText}
                  </span>
                );
              })()}
              {/* Streak badge */}
              {streak && streak.current > 0 && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${streak.todayDone ? 'pill-streak-done' : 'pill-streak-pending'}`}>
                  <Leaf className="w-2.5 h-2.5" />{streak.current}d
                </span>
              )}
            </div>
            {/* Linha 2: dimensões */}
            <p className="text-xs text-muted-foreground mt-0.5">{tent.width}×{tent.depth}×{tent.height}cm</p>
          </div>

          {/* Monitor — acesso rápido ao display da estufa */}
          <Link href={`/tent/${tent.id}/display`} onClick={e => e.stopPropagation()}>
            <button
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Modo Display"
            >
              <Monitor className="w-4 h-4" />
            </button>
          </Link>

          {/* ··· dropdown menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {!cycle ? (
                <>
                  <DropdownMenuItem className="py-3 text-base" onClick={() => onInitiateCycle(tent.id, tent.name)}>
                    <Sprout className="w-5 h-5 mr-3" />
                    Novo Ciclo
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="py-3 text-base" onClick={() => navigate(`/tent/${tent.id}`)}>
                    <ArrowRight className="w-5 h-5 mr-3" />
                    Ver Detalhes
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="py-3 text-base" onClick={() => onEditTent(tent)}>
                    <Wrench className="w-5 h-5 mr-3" />
                    Editar Estufa
                  </DropdownMenuItem>
                  <DropdownMenuItem className="py-3 text-base text-red-600 focus:text-red-600" onClick={() => onDeleteTent(tent.id, tent.name)}>
                    <Trash2 className="w-5 h-5 mr-3" />
                    Excluir Estufa
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem className="py-3 text-base" onClick={() => navigate(`/quick-log?tentId=${tent.id}`)}>
                    <Zap className="w-5 h-5 mr-3" />
                    Registrar
                  </DropdownMenuItem>
                  <DropdownMenuItem className="py-3 text-base" onClick={() => navigate(`/tent/${tent.id}`)}>
                    <ArrowRight className="w-5 h-5 mr-3" />
                    Ver Detalhes
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="py-3 text-base" onClick={() => onEditCycle(cycle, tent)}>
                    <Wrench className="w-5 h-5 mr-3" />
                    Editar Ciclo
                  </DropdownMenuItem>
                  {tent.category === "MAINTENANCE" && (
                    <DropdownMenuItem className="py-3 text-base" onClick={() => openPhaseConfirm("CLONING")}>
                      <Sprout className="w-5 h-5 mr-3 text-blue-500" />
                      Tirar Clones
                    </DropdownMenuItem>
                  )}
                  {tent.category === "VEGA" && (
                    <DropdownMenuItem className="py-3 text-base" onClick={() => openPhaseConfirm("FLORA")}>
                      <Flower2 className="w-5 h-5 mr-3 text-green-500" />
                      Avançar para Floração
                    </DropdownMenuItem>
                  )}
                  {tent.category === "FLORA" && (
                    <>
                      <DropdownMenuItem className="py-3 text-base" onClick={() => setHarvestQueueOpen(true)}>
                        <Wind className="w-5 h-5 mr-3 text-orange-500" />
                        Colher → Secagem
                      </DropdownMenuItem>
                      <DropdownMenuItem className="py-3 text-base" onClick={() => openPhaseConfirm("DRYING")}>
                        <Wind className="w-5 h-5 mr-3 text-amber-500" />
                        Ir direto para Secagem
                      </DropdownMenuItem>
                    </>
                  )}
                  {cycle.cloningStartDate && tent.category === "CLONING" && (
                    <DropdownMenuItem className="py-3 text-base" onClick={() => setFinishCloningOpen(true)}>
                      <ArrowRight className="w-5 h-5 mr-3 text-blue-500" />
                      Finalizar Clonagem
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="py-3 text-base text-red-600 focus:text-red-600" onClick={() => onFinalizeCycle(cycle.id, tent.name)}>
                    <X className="w-5 h-5 mr-3" />
                    Finalizar Ciclo
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Plant count chips — abaixo do header */}
        {(tent.plantCount > 0 || tent.seedlingCount > 0) && (
          <Link href={`/plants?tent=${tent.id}`}>
            <div className="flex items-center gap-2 mt-3">
              {tent.plantCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-border/60 bg-muted/40 text-foreground hover:bg-muted/70 transition-colors">
                  <Sprout className="w-3.5 h-3.5 text-primary" />
                  {tent.plantCount} {tent.plantCount === 1 ? 'planta' : 'plantas'}
                </span>
              )}
              {tent.seedlingCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-border/60 bg-muted/40 text-foreground hover:bg-muted/70 transition-colors">
                  <Scissors className="w-3.5 h-3.5 text-cyan-500" />
                  {tent.seedlingCount} {tent.seedlingCount === 1 ? 'muda' : 'mudas'}
                </span>
              )}
            </div>
          </Link>
        )}
      </CardHeader>

      <CardContent className="relative z-10 px-5 pb-5 pt-0">
        <div className="space-y-3">
          {/* Cycle Info — compacto, sem barra de progresso */}
          {cycle ? (
            <div
              onClick={() => navigate(`/tent/${tent.id}`)}
              className={`rounded-xl p-3.5 border cursor-pointer active:scale-[0.99] transition-all duration-150 ${
                tent.category === 'VEGA'        ? 'phase-card-vega'
                : tent.category === 'FLORA'     ? 'phase-card-flora'
                : tent.category === 'DRYING'    ? 'phase-card-drying'
                : 'phase-card-maintenance'
              }`}
            >
              {/* Linha 1: fase | semana / clonagem */}
              <div className="flex justify-between items-center">
                <span className={`text-sm font-semibold flex items-center gap-1.5 text-white dark:${
                  tent.category === 'VEGA'    ? 'text-green-400'
                  : tent.category === 'FLORA' ? 'text-purple-400'
                  : tent.category === 'DRYING'? 'text-amber-400'
                  : 'text-blue-400'
                }`}>
                  <PhaseIcon className="w-3.5 h-3.5" />
                  {tent.category === 'MAINTENANCE' ? 'Manutenção Perpétua' : 'Ciclo Ativo'}
                </span>
                <span className={`text-sm font-bold text-white dark:${
                  tent.category === 'VEGA'    ? 'text-green-400'
                  : tent.category === 'FLORA' ? 'text-purple-400'
                  : tent.category === 'DRYING'? 'text-amber-400'
                  : 'text-blue-400'
                }`}>
                  {tent.category === 'MAINTENANCE'
                    ? (tent.lastCloningAt
                        ? (() => { const d = Math.floor((Date.now() - tent.lastCloningAt) / 86400000); return d === 0 ? 'Hoje' : d === 1 ? 'Ontem' : `Há ${d}d`; })()
                        : 'Sem clonagem')
                    : `Semana ${(() => {
                        const now = new Date(); const start = new Date(cycle.startDate);
                        if (isNaN(start.getTime())) return '?';
                        const fs = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;
                        if (fs && !isNaN(fs.getTime()) && now >= fs) return Math.max(1, Math.floor((now.getTime() - fs.getTime()) / 604800000) + 1);
                        return Math.max(1, Math.floor((now.getTime() - start.getTime()) / 604800000) + 1);
                      })()}`
                  }
                </span>
              </div>
              {/* Linha 2: label | data */}
              <div className="flex justify-between items-center mt-1.5">
                <span className="text-xs text-white/70 dark:text-muted-foreground">
                  {tent.category === 'MAINTENANCE' ? 'Última Clonagem' : 'Iniciado em'}
                </span>
                <span className="text-xs font-medium text-white/90 dark:text-foreground/70">
                  {tent.category === 'MAINTENANCE'
                    ? (tent.lastCloningAt ? new Date(tent.lastCloningAt).toLocaleDateString('pt-BR') : '—')
                    : new Date(cycle.startDate).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 bg-muted/20 p-3.5 text-center">
              <p className="text-sm text-muted-foreground">Nenhum ciclo ativo</p>
            </div>
          )}

          {/* KPI Metrics — 3 colunas: Temp · RH · PPFD */}
          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border/60">
            {/* Temperature */}
            <button
              type="button"
              disabled={!isSensorAuto || readNow.isPending}
              className={`kpi-temp flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border border-orange-500/20 dark:border-orange-500/15 relative w-full ${isSensorAuto ? 'active:scale-95 transition-transform' : ''}`}
              onClick={isSensorAuto ? () => readNow.mutate({ tentId: tent.id }) : undefined}
            >
              <ThermometerSun className="w-4 h-4 text-orange-500 dark:text-orange-400 mb-0.5" />
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Temp</p>
              <div className="flex items-center gap-0.5">
                <p className="text-base font-bold tracking-tight leading-none text-foreground">
                  {readNow.isPending
                    ? <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                    : (() => {
                        const val = sensorReading?.isFresh && sensorReading.tempC != null ? sensorReading.tempC : latestLog?.tempC ? parseFloat(latestLog.tempC) : null;
                        return val != null ? <AnimatedCounter value={val} decimals={1} suffix="°" /> : <span className="text-muted-foreground/40">--</span>;
                      })()
                  }
                </p>
              </div>
              <MiniSparkline values={sparkTemps} color="#f97316" chartId={`t${tent.id}-temp`} />
              {isSensorAuto && (
                <span className="absolute top-1 right-1 text-muted-foreground/60 dark:text-cyan-400 opacity-80"><Wifi className="w-3 h-3" /></span>
              )}
            </button>
            {/* Humidity */}
            <button
              type="button"
              disabled={!isSensorAuto || readNow.isPending}
              className={`kpi-rh flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border border-cyan-500/20 dark:border-cyan-500/20 relative w-full ${isSensorAuto ? 'active:scale-95 transition-transform' : ''}`}
              onClick={isSensorAuto ? () => readNow.mutate({ tentId: tent.id }) : undefined}
            >
              <Droplets className="w-4 h-4 text-cyan-500 dark:text-cyan-400 mb-0.5" />
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">RH</p>
              <div className="flex items-center gap-0.5">
                <p className="text-base font-bold tracking-tight leading-none text-foreground">
                  {readNow.isPending
                    ? <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                    : (() => {
                        const val = sensorReading?.isFresh && sensorReading.rhPct != null ? sensorReading.rhPct : latestLog?.rhPct ? parseFloat(latestLog.rhPct) : null;
                        return val != null ? <AnimatedCounter value={val} decimals={0} suffix="%" /> : <span className="text-muted-foreground/40">--</span>;
                      })()
                  }
                </p>
              </div>
              <MiniSparkline values={sparkRh} color="#0891b2" chartId={`t${tent.id}-rh`} />
              {isSensorAuto && (
                <span className="absolute top-1 right-1 text-muted-foreground/60 dark:text-cyan-400 opacity-80"><Wifi className="w-3 h-3" /></span>
              )}
            </button>
            {/* VPD */}
            <button
              type="button"
              disabled={!isSensorAuto || readNow.isPending}
              className={`kpi-vpd flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border border-emerald-500/20 dark:border-emerald-500/20 relative w-full ${isSensorAuto ? 'active:scale-95 transition-transform' : ''}`}
              onClick={isSensorAuto ? () => readNow.mutate({ tentId: tent.id }) : undefined}
            >
              <Wind className="w-4 h-4 text-emerald-500 dark:text-emerald-400 mb-0.5" />
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">VPD</p>
              <div className="flex items-center gap-0.5">
                <p className="text-base font-bold tracking-tight leading-none text-foreground">
                  {readNow.isPending
                    ? <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                    : currentVpd != null
                      ? <AnimatedCounter value={currentVpd} decimals={2} suffix=" kPa" />
                      : <span className="text-muted-foreground/40">--</span>
                  }
                </p>
              </div>
              <MiniSparkline values={sparkVpd} color="#10b981" chartId={`t${tent.id}-vpd`} />
              {isSensorAuto && (
                <span className="absolute top-1 right-1 text-muted-foreground/60 dark:text-emerald-400 opacity-80"><Wifi className="w-3 h-3" /></span>
              )}
            </button>
          </div>

        </div>
      </CardContent>
      

      {/* Mini-modal de confirmação de fase */}
      <PhaseConfirmDialog
        open={phaseConfirmOpen}
        onOpenChange={setPhaseConfirmOpen}
        phase={phaseConfirmType}
        tentName={tent.name}
        onConfirm={handlePhaseConfirmed}
      />

      {/* Select Mother Plant Dialog */}
      <SelectMotherPlantDialog
        open={selectMotherOpen}
        onOpenChange={setSelectMotherOpen}
        tentId={tent.id}
        onMotherSelected={(plantId: number, plantName: string) => {
          // Salvar dados temporários
          setSelectedMotherId(plantId);
          setSelectedMotherName(plantName);
          setSelectMotherOpen(false);
          // Abrir FinishCloningDialog
          setFinishCloningOpen(true);
        }}
      />
      
      {/* Finish Cloning Dialog */}
      {cycle && (
        <FinishCloningDialog
          open={finishCloningOpen}
          onOpenChange={setFinishCloningOpen}
          cycleId={cycle.id}
          motherPlantId={selectedMotherId || 0}
          motherPlantName={selectedMotherName || "Planta Mãe"}
          clonesCount={selectedClonesCount}
        />
      )}
      
      {/* Promote Phase Dialog */}
      {cycle && (
        <PromotePhaseDialog
          open={promotePhaseOpen}
          onOpenChange={setPromotePhaseOpen}
          cycleId={cycle.id}
          tentId={cycle.tentId}
          currentPhase={cycle.floraStartDate ? "FLORA" : "VEGA"}
          currentTentName={tent.name}
        />
      )}

      {/* Harvest Queue Dialog */}
      {cycle && (
        <MoveToHarvestQueueDialog
          open={harvestQueueOpen}
          onOpenChange={setHarvestQueueOpen}
          cycleId={cycle.id}
          tentId={tent.id}
          tentName={tent.name}
        />
      )}
    </Card>

    {/* ── Acesso rápido à estufa ── */}
    {cycle && (
      <div className="mx-1 mt-1 flex gap-0 rounded-b-xl overflow-hidden border border-t-0 border-border/30">
        {/* Tarefas — abre Sheet de notas */}
        <button
          type="button"
          onClick={() => setTasksSheetOpen(true)}
          className="relative flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-muted/20 hover:bg-muted/40 active:scale-[0.98] transition-all duration-150 border-r border-border/30"
        >
          <ClipboardList className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Tarefas</span>
          {pendingCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-primary text-primary-foreground rounded-full text-[9px] font-bold flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </button>
        {/* Detalhes */}
        <Link href={`/tent/${tent.id}`} className="flex-1">
          <div className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-muted/20 hover:bg-muted/40 active:scale-[0.98] transition-all duration-150">
            <BarChart2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Detalhes</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          </div>
        </Link>
      </div>
    )}

    {/* Sheet de tarefas estilo nota */}
    <Sheet open={tasksSheetOpen} onOpenChange={setTasksSheetOpen}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto pb-safe">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="w-4 h-4 text-muted-foreground" />
            Tarefas da semana
            {tentTasksList.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                · {tentTasksList.filter(t => t.isDone).length}/{tentTasksList.length} concluídas
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {tentTasksList.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <ClipboardList className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">Nenhuma tarefa para esta semana</p>
            <p className="text-xs text-muted-foreground/60">Configure templates em Tarefas → Gerenciar</p>
          </div>
        ) : (
          <div className="space-y-2.5 pb-4">
            {tentTasksList.map((task, i) => {
              // rotação leve alternada para efeito sticky note
              const rot = i % 2 === 0 ? 'rotate-[-0.3deg]' : 'rotate-[0.3deg]';
              return (
                <button
                  key={task.id || task.title}
                  type="button"
                  disabled={task.isDone || task.id === 0}
                  onClick={() => { if (!task.isDone && task.id > 0) markTaskDone.mutate({ taskId: task.id }); }}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-xl border shadow-sm transition-all duration-200 active:scale-[0.98] ${rot} ${
                    task.isDone
                      ? 'bg-muted/40 border-border/30 opacity-60'
                      : 'bg-card border-border hover:border-border/80'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    {task.isDone
                      ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                      : <Circle className="w-5 h-5 text-muted-foreground/40" />
                    }
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug ${task.isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {task.title}
                    </p>
                    {task.description && (
                      <p className={`text-xs mt-0.5 leading-snug ${task.isDone ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                        {task.description}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>

      </div>
    </ListItemAnimation>
  );
}
