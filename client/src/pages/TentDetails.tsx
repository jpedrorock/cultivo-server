import { useState, useMemo } from "react";
import { getStatusColor, getStatusLabel } from "@/lib/plantUtils";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ThermometerSun, Droplets, Sun, ArrowLeft, Calendar, FileDown, Plus, Leaf, Heart, Flower2, Wind, Trash2, AlertTriangle, Pencil, Share2, Printer, MoreVertical, Clock, Zap, TestTube, Sprout, Monitor, QrCode, Percent, FlaskConical, Wifi, WifiOff, ToggleLeft, ToggleRight, ChevronDown, RefreshCw, Settings } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TentIcon } from "@/components/TentIcon";
import { Link, useParams, useLocation } from "wouter";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Bar, Line } from "recharts";
import { format, subDays, differenceInHours, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageTransition } from "@/components/PageTransition";
import { PhaseConfirmDialog, type PhaseConfirmType } from "@/components/PhaseConfirmDialog";
import { SelectMotherPlantDialog } from "@/components/SelectMotherPlantDialog";
import { FinishCloningDialog } from "@/components/FinishCloningDialog";
import { PromotePhaseDialog } from "@/components/PromotePhaseDialog";
import { EditTentDialog } from "@/components/EditTentDialog";
import { EditLogDialog } from "@/components/EditLogDialog";
import { MoveToHarvestQueueDialog } from "@/components/MoveToHarvestQueueDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ─── Sensor SmartLife por estufa ─────────────────────────────────────────────

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)  return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function TentSensorCard({ tentId }: { tentId: number }) {
  const utils = trpc.useUtils();
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: tuyaConfig } = trpc.tuya.getConfig.useQuery();
  const { data: mapping, refetch: refetchMapping } = trpc.tuya.getMappings.useQuery();
  const { data: reading, refetch: refetchReading } = trpc.tuya.getLatestReadingForTent.useQuery(
    { tentId },
    { refetchInterval: 60_000 }
  );
  const { data: devices = [], isLoading: devicesLoading } = trpc.tuya.listDevices.useQuery(
    undefined,
    { enabled: pickerOpen }
  );

  const tentMapping = mapping?.find(m => m.tentId === tentId);

  const saveMappings = trpc.tuya.saveMappings.useMutation({
    onSuccess: () => { refetchMapping(); refetchReading(); setPickerOpen(false); toast.success('Sensor vinculado!'); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const readNow = trpc.tuya.readNow.useMutation({
    onSuccess: () => { refetchReading(); toast.success('Leitura atualizada!'); },
    onError: (e) => toast.error(`Sensor: ${e.message}`),
  });

  const handleSelectDevice = (deviceId: string, deviceName: string) => {
    const others = (mapping ?? []).filter(m => m.tentId !== tentId);
    saveMappings.mutate([
      ...others,
      { tentId, deviceId, deviceName, enabled: true },
    ]);
  };

  const handleToggle = () => {
    if (!tentMapping) return;
    const others = (mapping ?? []).filter(m => m.tentId !== tentId);
    saveMappings.mutate([
      ...others,
      { ...tentMapping, enabled: !tentMapping.enabled },
    ]);
  };

  const handleRemove = () => {
    const others = (mapping ?? []).filter(m => m.tentId !== tentId);
    saveMappings.mutate(others);
  };

  // Sem credenciais Tuya configuradas
  if (!tuyaConfig) {
    return (
      <div className="mb-4 rounded-2xl border border-dashed border-border px-4 py-3 flex items-center gap-3 bg-card/50">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Wifi className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Sensor de ambiente</p>
          <p className="text-[11px] text-muted-foreground">Configure as credenciais SmartLife para ativar</p>
        </div>
        <Link href="/settings/sensors">
          <button className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground font-medium transition-colors flex items-center gap-1">
            <Settings className="w-3 h-3" /> Configurar
          </button>
        </Link>
      </div>
    );
  }

  // Com credenciais mas sem sensor mapeado
  if (!tentMapping) {
    return (
      <div className="mb-4">
        {!pickerOpen ? (
          <button
            onClick={() => setPickerOpen(true)}
            className="w-full rounded-2xl border border-dashed border-border px-4 py-3 flex items-center gap-3 bg-card/50 hover:bg-muted/40 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Wifi className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Vincular sensor SmartLife</p>
              <p className="text-[11px] text-muted-foreground">Temperatura e umidade automáticos</p>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <p className="text-sm font-semibold">Escolher sensor</p>
              <button onClick={() => setPickerOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
            </div>
            {devicesLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" /> Buscando dispositivos...
              </div>
            ) : devices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum dispositivo encontrado</p>
            ) : (
              <div className="divide-y divide-border/50 max-h-56 overflow-y-auto">
                {(devices as any[]).map((dev: any) => (
                  <button
                    key={dev.id}
                    onClick={() => handleSelectDevice(dev.id, dev.name)}
                    disabled={saveMappings.isPending}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${dev.online ? 'bg-emerald-500/15' : 'bg-muted'}`}>
                      {dev.online ? <Wifi className="w-4 h-4 text-emerald-500" /> : <WifiOff className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{dev.name}</p>
                      <p className="text-[10px] text-muted-foreground">{dev.online ? 'Online' : 'Offline'}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Com sensor mapeado — mostra status
  const isEnabled = tentMapping.enabled;
  const hasReading = reading && reading.tempC != null;

  return (
    <div className={`mb-4 rounded-2xl border px-4 py-3 flex items-center gap-3 transition-colors ${
      isEnabled && hasReading
        ? 'bg-emerald-500/5 border-emerald-500/20'
        : 'bg-card/50 border-border'
    }`}>
      {/* Ícone */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
        isEnabled && hasReading ? 'bg-emerald-500/15' : 'bg-muted'
      }`}>
        {isEnabled && hasReading
          ? <Wifi className="w-5 h-5 text-emerald-500" />
          : <WifiOff className="w-5 h-5 text-muted-foreground" />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground truncate">{tentMapping.deviceName}</p>
          {isEnabled && hasReading && reading.isFresh && (
            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-white font-bold">AO VIVO</span>
          )}
        </div>
        {isEnabled && hasReading ? (
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-foreground font-medium flex items-center gap-1">
              <ThermometerSun className="w-3 h-3 text-orange-400" />
              {reading.tempC}°C
            </span>
            <span className="text-xs text-foreground font-medium flex items-center gap-1">
              <Droplets className="w-3 h-3 text-blue-400" />
              {reading.rhPct}%
            </span>
            <span className="text-[10px] text-muted-foreground">{timeAgo(reading.readAt)}</span>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {!isEnabled ? 'Leitura automática desativada' : 'Aguardando primeira leitura...'}
          </p>
        )}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2 shrink-0">
        {isEnabled && (
          <button
            onClick={() => readNow.mutate({ tentId })}
            disabled={readNow.isPending}
            className="w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors disabled:opacity-40"
            title="Atualizar agora"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${readNow.isPending ? 'animate-spin' : ''}`} />
          </button>
        )}
        <button
          onClick={handleToggle}
          disabled={saveMappings.isPending}
          title={isEnabled ? 'Desativar sensor' : 'Ativar sensor'}
        >
          {isEnabled
            ? <ToggleRight className="w-8 h-8 text-emerald-500" />
            : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
        </button>
        <button
          onClick={handleRemove}
          disabled={saveMappings.isPending}
          className="w-8 h-8 rounded-lg hover:bg-red-500/10 flex items-center justify-center transition-colors"
          title="Remover sensor"
        >
          <WifiOff className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
        </button>
      </div>
    </div>
  );
}

export default function TentDetails() {
  const { id } = useParams<{ id: string }>();
  const tentId = parseInt(id || "0");

  const [dateRange, setDateRange] = useState(7); // 7, 14, 30 days

  // Estados dos modais de fase
  const [phaseConfirmOpen, setPhaseConfirmOpen] = useState(false);
  const [phaseConfirmType, setPhaseConfirmType] = useState<PhaseConfirmType>("FLORA");
  const [selectMotherOpen, setSelectMotherOpen] = useState(false);
  const [selectedMotherId, setSelectedMotherId] = useState<number | null>(null);
  const [selectedMotherName, setSelectedMotherName] = useState<string>("");
  const [selectedClonesCount] = useState<number>(10);
  const [finishCloningOpen, setFinishCloningOpen] = useState(false);
  const [promotePhaseOpen, setPromotePhaseOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editTentOpen, setEditTentOpen] = useState(false);
  const [harvestQueueOpen, setHarvestQueueOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [editLogOpen, setEditLogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<any>(null);
  const [deletingLogId, setDeletingLogId] = useState<number | null>(null);
  const [showAutoLogs, setShowAutoLogs] = useState(false);

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

  const utils = trpc.useUtils();
  const { data: tent, isLoading: tentLoading } = trpc.tents.getById.useQuery({ id: tentId });
  const [, navigate] = useLocation();

  const deleteMutation = trpc.tents.delete.useMutation({
    onSuccess: () => {
      toast.success("Estufa excluída com sucesso!");
      navigate("/");
    },
    onError: (error) => {
      toast.error(`Erro ao excluir: ${error.message}`);
    },
  });

  const handleDeleteConfirmed = () => {
    deleteMutation.mutate({ id: tentId });
  };

  const deleteLogMutation = trpc.dailyLogs.delete.useMutation({
    onSuccess: () => {
      utils.dailyLogs.list.invalidate({ tentId });
      setDeletingLogId(null);
      toast.success("Registro excluído!");
    },
    onError: (error) => {
      toast.error(`Erro ao excluir: ${error.message}`);
      setDeletingLogId(null);
    },
  });

  const handleDeleteLog = (logId: number) => {
    setDeletingLogId(logId);
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) deleteLogMutation.mutate({ id: logId });
    }, 5000);
    toast.info("Registro será excluído em 5 segundos", {
      duration: 5000,
      action: {
        label: "Desfazer",
        onClick: () => {
          cancelled = true;
          clearTimeout(timeoutId);
          setDeletingLogId(null);
          toast.success("Exclusão cancelada!");
        },
      },
    });
  };
  const { data: cycle } = trpc.cycles.getByTent.useQuery({ tentId });

  // Fase e semana atuais para buscar targets
  const currentPhase = cycle ? (cycle.floraStartDate ? "FLORA" : "VEGA") : null;
  const currentWeek = cycle ? (() => {
    const now = new Date();
    const start = new Date(cycle.startDate);
    if (isNaN(start.getTime())) return 1;
    const floraStart = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;
    if (floraStart && !isNaN(floraStart.getTime()) && now >= floraStart) {
      return Math.max(1, Math.floor((now.getTime() - floraStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
    }
    return Math.max(1, Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
  })() : null;

  const { data: weekTargets } = trpc.weeklyTargets.getTargetsByTent.useQuery(
    { tentId, phase: currentPhase! as any, weekNumber: currentWeek! },
    { enabled: !!cycle && !!currentPhase && !!currentWeek }
  );

  // Memoize dates to prevent infinite re-renders
  const dateFilter = useMemo(() => {
    const now = new Date();
    return {
      startDate: subDays(now, dateRange),
      endDate: now,
    };
  }, [dateRange]);

  const { data: logs, isLoading: logsLoading, isError: logsError } = trpc.dailyLogs.list.useQuery({
    tentId,
  });

  // Plants — loaded at page level so the PDF export has access
  const { data: tentPlants } = trpc.plants.list.useQuery({ tentId });

  // Filter logs by dateRange client-side for charts/averages (must be before conditional returns — Rules of Hooks)
  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter((log) => new Date(log.logDate) >= dateFilter.startDate);
  }, [logs, dateFilter.startDate]);

  // History tab logs — additionally filter out AUTO entries when showAutoLogs is false
  const historyLogs = useMemo(() => {
    if (!logs) return [];
    if (showAutoLogs) return logs;
    // Usa apenas o campo source — evitar ocultar logs manuais sem pH/EC/PPFD
    return logs.filter((log: any) => log.source !== 'AUTO');
  }, [logs, showAutoLogs]);

  if (tentLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!tent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Estufa não encontrada</p>
            <Button asChild className="mt-4">
              <Link href="/">Voltar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getPhaseInfo = () => {
    if (!cycle) {
      return { phase: "Inativo", color: "bg-muted" };
    }

    if (tent.category === "MAINTENANCE") {
      return { phase: "Manutenção", color: "bg-blue-500" };
    }

    if (cycle.floraStartDate) {
      return { phase: "Floração", color: "bg-purple-500" };
    }

    return { phase: "Vegetativa", color: "bg-primary/100" };
  };

  const phaseInfo = getPhaseInfo();

  const handlePrint = () => {
    const phase = getPhaseInfo().phase;
    const startStr = cycle ? format(new Date(cycle.startDate), "dd/MM/yyyy", { locale: ptBR }) : '—';
    const generatedAt = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    const exportLogs = filteredLogs.slice().reverse(); // ASC para a tabela

    // ── Estatísticas por parâmetro ────────────────────────────────────────
    const stat = (vals: number[]) => vals.length === 0
      ? { avg: '—', min: '—', max: '—' }
      : {
          avg: (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1),
          min: Math.min(...vals).toFixed(1),
          max: Math.max(...vals).toFixed(1),
        };

    const notNull = (v: number | null): v is number => v !== null;
    const temps  = exportLogs.map(l => l.tempC != null ? parseFloat(l.tempC)  : null).filter(notNull);
    const rhs    = exportLogs.map(l => l.rhPct  != null ? parseFloat(l.rhPct)  : null).filter(notNull);
    const ppfds  = exportLogs.map(l => l.ppfd   != null ? l.ppfd               : null).filter(notNull);
    const phs    = exportLogs.map(l => l.ph     != null ? parseFloat(l.ph)     : null).filter(notNull);
    const ecs    = exportLogs.map(l => l.ec     != null ? parseFloat(l.ec)     : null).filter(notNull);

    const sTemp  = stat(temps);
    const sRh    = stat(rhs);
    const sPpfd  = stat(ppfds);
    const sPh    = stat(phs);
    const sEc    = stat(ecs);

    // ── Plantas ───────────────────────────────────────────────────────────
    const plantRows = (tentPlants ?? []).map((p: any) => `
      <tr>
        <td>${p.name}</td>
        <td>${p.code ?? '—'}</td>
        <td>${p.plantStage ?? '—'}</td>
        <td>${p.cycleWeek != null ? `Sem ${p.cycleWeek}` : '—'}</td>
        <td>${p.status ?? '—'}</td>
      </tr>
    `).join('');

    // ── Linhas de log ─────────────────────────────────────────────────────
    const logRows = exportLogs.map((l: any) => `
      <tr>
        <td>${format(new Date(l.logDate), "dd/MM/yy HH:mm", { locale: ptBR })}</td>
        <td>${l.turn === 'AM' ? 'AM' : 'PM'}</td>
        <td>${l.tempC ?? '—'}</td>
        <td>${l.rhPct ?? '—'}</td>
        <td>${l.ppfd ?? '—'}</td>
        <td>${l.ph ?? '—'}</td>
        <td>${l.ec ?? '—'}</td>
        <td>${l.wateringVolume ? `${l.wateringVolume}ml` : '—'}</td>
        <td>${l.runoffPercentage ? `${parseFloat(l.runoffPercentage).toFixed(0)}%` : '—'}</td>
      </tr>
    `).join('');

    const statCard = (label: string, s: ReturnType<typeof stat>, unit: string) => `
      <div class="stat-card">
        <div class="stat-label">${label}</div>
        <div class="stat-avg">${s.avg}${s.avg !== '—' ? unit : ''}</div>
        <div class="stat-minmax">
          ${s.min !== '—' ? `<span>↓ ${s.min}${unit}</span><span>↑ ${s.max}${unit}</span>` : '<span style="color:#bbb">sem dados</span>'}
        </div>
      </div>`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório — ${tent.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; background: #fff; padding: 32px; font-size: 13px; }
    /* Header */
    .header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 20px; }
    .header-left h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
    .header-left .sub { color: #666; font-size: 12px; margin-top: 4px; }
    .header-right { text-align: right; font-size: 11px; color: #888; line-height: 1.6; }
    .phase-badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; background: #f3f4f6; color: #374151; }
    /* Stat cards */
    .stat-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 24px; }
    .stat-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
    .stat-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
    .stat-avg { font-size: 20px; font-weight: 700; color: #111; margin-bottom: 4px; }
    .stat-minmax { font-size: 10px; color: #6b7280; display: flex; justify-content: space-between; }
    /* Section */
    h2 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #374151; margin: 20px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    /* Tables */
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #f9fafb; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
    td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; color: #374151; }
    tr:nth-child(even) td { background: #fafafa; }
    /* Cycle info */
    .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .info-cell { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
    .info-cell .lbl { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
    .info-cell .val { font-size: 14px; font-weight: 600; margin-top: 2px; }
    /* Footer */
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #bbb; display: flex; justify-content: space-between; }
    @media print {
      body { padding: 16px; }
      .no-break { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <h1>🌱 ${tent.name}</h1>
      <div class="sub">${tent.width}×${tent.depth}×${tent.height}cm &nbsp;·&nbsp; ${tent.powerW ? tent.powerW + 'W' : ''}</div>
    </div>
    <div class="header-right">
      <div><span class="phase-badge">${phase}</span></div>
      <div style="margin-top:6px">Gerado em ${generatedAt}</div>
      <div>Período: últimos ${dateRange} dias</div>
    </div>
  </div>

  <!-- Cycle info -->
  ${cycle ? `
  <div class="info-grid">
    <div class="info-cell"><div class="lbl">Início do Ciclo</div><div class="val">${startStr}</div></div>
    <div class="info-cell"><div class="lbl">Dias de Ciclo</div><div class="val">${Math.floor((Date.now() - new Date(cycle.startDate).getTime()) / 86400000)}</div></div>
    <div class="info-cell"><div class="lbl">Status</div><div class="val">${cycle.status === 'ACTIVE' ? 'Ativo' : 'Finalizado'}</div></div>
    <div class="info-cell"><div class="lbl">Registros no período</div><div class="val">${exportLogs.length}</div></div>
  </div>` : ''}

  <!-- Stats -->
  <h2>Médias do período (${dateRange} dias)</h2>
  <div class="stat-grid">
    ${statCard('Temperatura', sTemp, '°C')}
    ${statCard('Umidade', sRh, '%')}
    ${statCard('PPFD', sPpfd, '')}
    ${statCard('pH', sPh, '')}
    ${statCard('EC', sEc, ' mS')}
  </div>

  <!-- Plants -->
  ${(tentPlants ?? []).length > 0 ? `
  <h2>Plantas (${tentPlants!.length})</h2>
  <table class="no-break">
    <thead><tr><th>Nome</th><th>Código</th><th>Estágio</th><th>Semana</th><th>Status</th></tr></thead>
    <tbody>${plantRows}</tbody>
  </table>` : ''}

  <!-- Logs table -->
  <h2>Registros diários (${exportLogs.length})</h2>
  <table>
    <thead>
      <tr>
        <th>Data/Hora</th><th>Turno</th><th>Temp °C</th><th>UR %</th>
        <th>PPFD</th><th>pH</th><th>EC</th><th>Rega</th><th>Runoff</th>
      </tr>
    </thead>
    <tbody>${logRows}</tbody>
  </table>

  <div class="footer">
    <span>App Cultivo &nbsp;·&nbsp; ${window.location.origin}</span>
    <span>${tent.name} &nbsp;·&nbsp; ${phase} &nbsp;·&nbsp; ${generatedAt}</span>
  </div>

  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) { toast.error('Permita pop-ups para exportar o relatório'); return; }
    win.document.write(html);
    win.document.close();
  };

  const handleExportCSV = () => {
    const exportLogs = filteredLogs.slice().reverse(); // ASC — mais antigo primeiro
    const header = "Data,Turno,Temp°C,UR%,PPFD,pH,EC,Rega(ml),Runoff%";
    const rows = exportLogs.map((l: any) => [
      format(new Date(l.logDate), "dd/MM/yyyy HH:mm", { locale: ptBR }),
      l.turn ?? "",
      l.tempC ?? "",
      l.rhPct ?? "",
      l.ppfd ?? "",
      l.ph ?? "",
      l.ec ?? "",
      l.wateringVolume ?? "",
      l.runoffPercentage ? parseFloat(l.runoffPercentage).toFixed(1) : "",
    ].join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tent.name.replace(/\s+/g, "_")}_logs_${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  const handleShare = async () => {
    const phase = phaseInfo.phase;
    const lastLog = logs?.[0];
    const lines: string[] = [
      `🌱 ${tent.name} — ${phase}`,
    ];
    if (cycle) {
      const start = format(new Date(cycle.startDate), "dd/MM/yyyy", { locale: ptBR });
      lines.push(`📅 Ciclo iniciado em ${start}`);
    }
    if (lastLog) {
      const logDate = format(new Date(lastLog.logDate), "dd/MM HH:mm", { locale: ptBR });
      lines.push(`\n📊 Último registro (${logDate}):`);
      if (lastLog.tempC) lines.push(`🌡️ Temperatura: ${lastLog.tempC}°C`);
      if (lastLog.rhPct) lines.push(`💧 Umidade: ${lastLog.rhPct}%`);
      if (lastLog.ppfd) lines.push(`☀️ PPFD: ${lastLog.ppfd} µmol/m²/s`);
      if (lastLog.ph) lines.push(`🧪 pH: ${lastLog.ph}`);
      if (lastLog.ec) lines.push(`⚡ EC: ${lastLog.ec} mS/cm`);
    }
    if (avgTemp !== '--') lines.push(`\n📈 Médias (${dateRange} dias): Temp ${avgTemp}°C | UR ${avgRh}% | PPFD ${avgPpfd}`);
    lines.push(`\n🔗 App Cultivo — cultivo.x.andy.plus`);

    const text = lines.join('\n');

    if (navigator.share) {
      try {
        await navigator.share({
          title: `App Cultivo — ${tent.name}`,
          text,
        });
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          toast.error('Erro ao compartilhar');
        }
      }
    } else {
      // Fallback: copiar para clipboard
      try {
        await navigator.clipboard.writeText(text);
        toast.success('Copiado para a área de transferência!');
      } catch {
        toast.error('Compartilhamento não suportado neste navegador');
      }
    }
  };

  // Pulsing dot at the last data point — "live data" feel
  const PulsingDot = ({ cx, cy, color }: { cx?: number; cy?: number; color: string }) => {
    if (cx == null || cy == null) return null;
    return (
      <g>
        <circle cx={cx} cy={cy} r={4} fill={color} opacity={0.9} />
        <circle cx={cx} cy={cy} r={4} fill="none" stroke={color} strokeWidth={2} opacity={0.6}>
          <animate attributeName="r" values="4;11;4" dur="2.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0;0.6" dur="2.5s" repeatCount="indefinite" />
        </circle>
      </g>
    );
  };

  // Prepare chart data (filtered by period, ASC: oldest → newest = left → right)
  const chartData = filteredLogs.slice().reverse().map((log) => ({
    date: format(new Date(log.logDate), "dd/MM", { locale: ptBR }),
    fullDate: format(new Date(log.logDate), "dd/MM/yyyy HH:mm", { locale: ptBR }),
    turn: log.turn,
    temp: log.tempC ? parseFloat(log.tempC) : null,
    rh: log.rhPct ? parseFloat(log.rhPct) : null,
    ppfd: log.ppfd || null,
    ph: log.ph ? parseFloat(log.ph) : null,
    ec: log.ec ? parseFloat(log.ec) : null,
    watering: log.wateringVolume || null,
  }));

  // L4 — apenas logs com watering registrado (para o gráfico de correlação)
  const wateringChartData = chartData.filter(d => d.watering !== null);

  // Calculate averages (filtered by period) — usando só logs com valor para evitar NaN
  const logsWithTemp  = filteredLogs.filter(l => l.tempC);
  const logsWithRh    = filteredLogs.filter(l => l.rhPct);
  const logsWithPpfd  = filteredLogs.filter(l => l.ppfd);
  const avgTemp = logsWithTemp.length
    ? (logsWithTemp.reduce((sum, log) => sum + parseFloat(log.tempC!), 0) / logsWithTemp.length).toFixed(1)
    : "--";
  const avgRh = logsWithRh.length
    ? (logsWithRh.reduce((sum, log) => sum + parseFloat(log.rhPct!), 0) / logsWithRh.length).toFixed(1)
    : "--";
  const avgPpfd = logsWithPpfd.length
    ? Math.round(logsWithPpfd.reduce((sum, log) => sum + (log.ppfd ?? 0), 0) / logsWithPpfd.length)
    : "--";

  return (
    <PageTransition>
        <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
        <div className="container py-4 md:py-6">
          <div className="flex items-center gap-3">
            {/* Voltar */}
            <Button asChild variant="ghost" size="icon" className="shrink-0">
              <Link href="/">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>

            {/* Ícone + Título */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
                <TentIcon className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-bold text-foreground truncate">{tent.name}</h1>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-muted-foreground">
                    {tent.category} • {tent.width}×{tent.depth}×{tent.height}cm
                  </p>
                  {/* Freshness badge — último registro */}
                  {logs && logs.length > 0 && (() => {
                    const lastLogDate = new Date(logs[0].logDate);
                    const hoursAgo = differenceInHours(new Date(), lastLogDate);
                    const daysAgo = differenceInDays(new Date(), lastLogDate);
                    if (hoursAgo < 24) return (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                        {hoursAgo === 0 ? 'Agora' : `${hoursAgo}h atrás`}
                      </span>
                    );
                    if (daysAgo === 1) return (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                        Ontem
                      </span>
                    );
                    return (
                      <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                        {daysAgo}d sem registro
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="flex items-center gap-2 shrink-0 print-hide">
              <Badge className={`${phaseInfo.color} text-white border-0 text-xs hidden sm:inline-flex`}>{phaseInfo.phase}</Badge>
              {/* QR + Monitor — só desktop */}
              <div className="hidden sm:flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setQrModalOpen(true)} title="QR Code para log rápido">
                  <QrCode className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => navigate(`/tent/${tentId}/display`)} title="Modo Display">
                  <Monitor className="w-4 h-4" />
                </Button>
              </div>
              <div className="hidden sm:block">
                <Button asChild size="sm" className="gap-1.5">
                  <Link href={`/tent/${tentId}/log`}>
                    <Plus className="w-4 h-4" />
                    Novo Registro
                  </Link>
                </Button>
              </div>
              {/* Dropdown de ações secundárias */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {/* Mobile-only: Novo Registro + QR + Monitor */}
                  <DropdownMenuItem asChild className="sm:hidden">
                    <Link href={`/tent/${tentId}/log`} className="flex items-center gap-2 cursor-pointer">
                      <Plus className="w-4 h-4" />
                      Novo Registro
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setQrModalOpen(true)} className="gap-2 sm:hidden">
                    <QrCode className="w-4 h-4" />
                    QR Code
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/tent/${tentId}/display`)} className="gap-2 sm:hidden">
                    <Monitor className="w-4 h-4" />
                    Modo Display
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="sm:hidden" />
                  <DropdownMenuItem onClick={() => setEditTentOpen(true)} className="gap-2">
                    <Pencil className="w-4 h-4" />
                    Editar Estufa
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShare} className="gap-2">
                    <Share2 className="w-4 h-4" />
                    Compartilhar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handlePrint} className="gap-2">
                    <FileDown className="w-4 h-4" />
                    Exportar Relatório PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportCSV} className="gap-2">
                    <FileDown className="w-4 h-4 text-emerald-500" />
                    Exportar CSV
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="gap-2 text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir Estufa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6 max-w-7xl space-y-6">

        {/* ── Stat cards do ÚLTIMO registro ── */}
        {(() => {
          const last = logs?.[0];
          type StatCard = { label: string; value: string; unit: string; icon: React.ReactNode; ok: boolean | null };
          const stats: StatCard[] = [
            {
              label: "Temperatura",
              value: last?.tempC ? parseFloat(last.tempC).toFixed(1) : "—",
              unit: "°C",
              icon: <ThermometerSun className="w-4 h-4 text-orange-500" />,
              ok: last?.tempC ? (parseFloat(last.tempC) >= 20 && parseFloat(last.tempC) <= 28) : null,
            },
            {
              label: "Umidade",
              value: last?.rhPct ? parseFloat(last.rhPct).toFixed(0) : "—",
              unit: "%",
              icon: <Droplets className="w-4 h-4 text-teal-400" />,
              ok: last?.rhPct ? (parseFloat(last.rhPct) >= 40 && parseFloat(last.rhPct) <= 70) : null,
            },
            {
              label: "PPFD",
              value: last?.ppfd ? String(last.ppfd) : "—",
              unit: "µmol",
              icon: <Sun className="w-4 h-4 text-yellow-500" />,
              ok: last?.ppfd ? (last.ppfd >= 400 && last.ppfd <= 900) : null,
            },
            {
              label: "pH",
              value: last?.ph ? parseFloat(last.ph).toFixed(1) : "—",
              unit: "",
              icon: <TestTube className="w-4 h-4 text-purple-500" />,
              ok: last?.ph ? (parseFloat(last.ph) >= 5.8 && parseFloat(last.ph) <= 6.5) : null,
            },
            {
              label: "EC",
              value: last?.ec ? parseFloat(last.ec).toFixed(1) : "—",
              unit: "mS",
              icon: <Zap className="w-4 h-4 text-emerald-500" />,
              ok: last?.ec ? (parseFloat(last.ec) >= 1.0 && parseFloat(last.ec) <= 2.5) : null,
            },
            {
              label: "Rega",
              value: last?.wateringVolume ? String(last.wateringVolume) : "—",
              unit: "ml",
              icon: <Droplets className="w-4 h-4 text-cyan-400" />,
              ok: null,
            },
            {
              label: "Runoff",
              value: last?.runoffPercentage ? `${parseFloat(last.runoffPercentage).toFixed(0)}%` : "—",
              unit: "",
              icon: <Percent className="w-4 h-4 text-emerald-400" />,
              ok: last?.runoffPercentage ? (parseFloat(last.runoffPercentage) >= 10 && parseFloat(last.runoffPercentage) <= 30) : null,
            },
            {
              label: "Fotoperíodo",
              value: (weekTargets as any)?.photoperiod ?? "—",
              unit: "",
              icon: <Sun className="w-4 h-4 text-amber-400" />,
              ok: null,
            },
          ];
          return (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Último registro
                  {last && (
                    <span className="text-xs text-muted-foreground/70 ml-1">
                      {format(new Date(last.logDate), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  )}
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-8 gap-2">
                {stats.map((s) => (
                  <div
                    key={s.label}
                    className={`rounded-xl border p-3 flex flex-col gap-1 ${
                      s.ok === null
                        ? "bg-muted/40 border-border"
                        : s.ok
                        ? "bg-emerald-500/5 border-emerald-500/20"
                        : "bg-red-500/5 border-red-500/20"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {s.icon}
                      <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
                    </div>
                    <p className={`text-xl font-bold leading-none ${
                      s.ok === null ? "text-muted-foreground" : s.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                    }`}>
                      {s.value}
                      {s.unit && <span className="text-xs font-normal ml-0.5 text-muted-foreground">{s.unit}</span>}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── Progress bar do ciclo ── */}
        {cycle && tent.category !== 'MAINTENANCE' && (() => {
          const startDate = new Date(cycle.startDate);
          const floraStart = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;
          const totalDays = Math.floor((Date.now() - startDate.getTime()) / (24 * 60 * 60 * 1000));
          const weekNum = Math.floor(totalDays / 7) + 1;

          // Estima total de semanas: vega ≈ 8, flora ≈ 8
          const vegaWeeks = 8;
          const floraWeeks = 8;
          const isFlora = !!floraStart;
          const totalEstWeeks = vegaWeeks + floraWeeks;
          const progressPct = Math.min((weekNum / totalEstWeeks) * 100, 100);

          const phases = [
            { label: "Clonagem", range: "Sem 1-2", active: !isFlora && weekNum <= 2 },
            { label: "Vega", range: "Sem 3-8", active: !isFlora && weekNum > 2 },
            { label: "Flora", range: "Sem 9-16", active: isFlora },
            { label: "Colheita", range: "", active: false },
          ];

          return (
            <Card className="bg-card/90">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-foreground">
                    Semana <span className="text-primary text-base">{weekNum}</span>
                    <span className="text-muted-foreground font-normal"> / ~{totalEstWeeks} estimadas</span>
                  </p>
                  <span className="text-xs text-muted-foreground">{Math.round(progressPct)}%</span>
                </div>
                {/* Barra */}
                <div className="h-2 rounded-full bg-muted overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                {/* Marcadores de fase */}
                <div className="grid grid-cols-4 gap-1">
                  {phases.map((p) => (
                    <div key={p.label} className="flex flex-col items-center gap-0.5">
                      <div className={`w-2 h-2 rounded-full ${p.active ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                      <span className={`text-[10px] font-medium text-center leading-tight ${p.active ? 'text-primary' : 'text-muted-foreground/60'}`}>
                        {p.label}
                      </span>
                      {p.range && <span className="text-[9px] text-muted-foreground/40">{p.range}</span>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Cycle Info */}
        {cycle && (
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden mb-6">
            {/* Grid de métricas */}
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border/40">
              <div className="px-4 py-3">
                <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-1">
                  {tent?.category === 'MAINTENANCE' ? 'Última Clonagem' : 'Ciclo Ativo'}
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {tent?.category === 'MAINTENANCE'
                    ? ((tent as any).lastCloningAt
                        ? (() => {
                            const days = Math.floor((Date.now() - (tent as any).lastCloningAt) / (24 * 60 * 60 * 1000));
                            if (days === 0) return 'Hoje';
                            if (days === 1) return 'Ontem';
                            return `Há ${days} dias`;
                          })()
                        : 'Nenhuma')
                    : `Semana ${Math.floor((Date.now() - new Date(cycle.startDate).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1}`
                  }
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-1">Início</p>
                <p className="text-sm font-semibold text-foreground">
                  {new Date(cycle.startDate).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-1">Dias</p>
                <p className="text-sm font-semibold text-foreground">
                  {Math.floor((Date.now() - new Date(cycle.startDate).getTime()) / (24 * 60 * 60 * 1000))} dias
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-1">Status</p>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md border ${
                  cycle.status === 'ACTIVE'
                    ? 'bg-green-500/15 border-green-500/30 text-green-400'
                    : cycle.status === 'FINISHED'
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                    : 'bg-muted/40 border-border/40 text-muted-foreground'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    cycle.status === 'ACTIVE' ? 'bg-green-400' : cycle.status === 'FINISHED' ? 'bg-amber-400' : 'bg-muted-foreground'
                  }`} />
                  {cycle.status === 'ACTIVE' ? 'Ativo' : cycle.status === 'FINISHED' ? 'Finalizado' : cycle.status}
                </span>
              </div>
            </div>

            {/* Botões de avanço de fase */}
            {tent && (
              <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-border/40">
                {tent.category === "MAINTENANCE" && (
                  <button
                    onClick={() => openPhaseConfirm("CLONING")}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 active:scale-95 transition-all"
                  >
                    <Sprout className="w-3.5 h-3.5" />
                    Tirar Clones
                  </button>
                )}
                {tent.category === "VEGA" && (
                  <button
                    onClick={() => openPhaseConfirm("FLORA")}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-purple-500/15 border border-purple-500/30 text-purple-400 hover:bg-purple-500/25 active:scale-95 transition-all"
                  >
                    <Flower2 className="w-3.5 h-3.5" />
                    Avançar para Floração
                  </button>
                )}
                {tent.category === "FLORA" && (
                  <>
                    <button
                      onClick={() => setHarvestQueueOpen(true)}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 active:scale-95 transition-all"
                    >
                      <Wind className="w-3.5 h-3.5" />
                      Colher → Secagem
                    </button>
                    <button
                      onClick={() => openPhaseConfirm("DRYING")}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold border border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5 active:scale-95 transition-all"
                    >
                      <Wind className="w-3.5 h-3.5" />
                      Ir direto para Secagem
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Modais de fase */}
        {tent && (
          <>
            <PhaseConfirmDialog
              open={phaseConfirmOpen}
              onOpenChange={setPhaseConfirmOpen}
              phase={phaseConfirmType}
              tentName={tent.name}
              onConfirm={handlePhaseConfirmed}
            />
            <SelectMotherPlantDialog
              open={selectMotherOpen}
              onOpenChange={setSelectMotherOpen}
              tentId={tentId}
              onMotherSelected={(plantId: number, plantName: string) => {
                setSelectedMotherId(plantId);
                setSelectedMotherName(plantName);
                setSelectMotherOpen(false);
                setFinishCloningOpen(true);
              }}
            />
            {cycle && (
              <>
                <FinishCloningDialog
                  open={finishCloningOpen}
                  onOpenChange={setFinishCloningOpen}
                  cycleId={cycle.id}
                  motherPlantId={selectedMotherId || 0}
                  motherPlantName={selectedMotherName || "Planta Mãe"}
                  clonesCount={selectedClonesCount}
                />
                <PromotePhaseDialog
                  open={promotePhaseOpen}
                  onOpenChange={setPromotePhaseOpen}
                  cycleId={cycle.id}
                  currentPhase={cycle.floraStartDate ? "FLORA" : "VEGA"}
                  currentTentName={tent.name}
                />
                <MoveToHarvestQueueDialog
                  open={harvestQueueOpen}
                  onOpenChange={setHarvestQueueOpen}
                  cycleId={cycle.id}
                  tentName={tent.name}
                />
              </>
            )}
          </>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Temperatura */}
          <Card className="bg-card/90 backdrop-blur-sm overflow-hidden" style={{ borderLeft: "3px solid #f97316" }}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <ThermometerSun className="w-4 h-4 text-orange-500" />
                    Temperatura Média
                  </p>
                  <p className="text-3xl font-bold text-foreground">{avgTemp}°C</p>
                  <p className="text-xs text-muted-foreground mt-1">Últimos {dateRange} dias</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-orange-500/10 ring-1 ring-orange-500/30 flex items-center justify-center"
                     style={{ boxShadow: "0 0 12px rgba(249,115,22,0.25)" }}>
                  <ThermometerSun className="w-6 h-6 text-orange-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Umidade */}
          <Card className="bg-card/90 backdrop-blur-sm overflow-hidden" style={{ borderLeft: "3px solid #2dd4bf" }}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-teal-400" />
                    Umidade Média
                  </p>
                  <p className="text-3xl font-bold text-foreground">{avgRh}%</p>
                  <p className="text-xs text-muted-foreground mt-1">Últimos {dateRange} dias</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-teal-400/10 ring-1 ring-teal-400/30 flex items-center justify-center"
                     style={{ boxShadow: "0 0 12px rgba(45,212,191,0.25)" }}>
                  <Droplets className="w-6 h-6 text-teal-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* PPFD */}
          <Card className="bg-card/90 backdrop-blur-sm overflow-hidden" style={{ borderLeft: "3px solid #facc15" }}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Sun className="w-4 h-4 text-yellow-400" />
                    PPFD Médio
                  </p>
                  <p className="text-3xl font-bold text-foreground">{avgPpfd}</p>
                  <p className="text-xs text-muted-foreground mt-1">Últimos {dateRange} dias</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-yellow-400/10 ring-1 ring-yellow-400/30 flex items-center justify-center"
                     style={{ boxShadow: "0 0 12px rgba(250,204,21,0.25)" }}>
                  <Sun className="w-6 h-6 text-yellow-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sensor SmartLife */}
        <TentSensorCard tentId={tentId} />

        {/* Date Range Selector */}
        <div className="flex items-center gap-3 mb-6">
          <Calendar className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Período:</span>
          <div className="flex gap-2">
            <Button
              variant={dateRange === 7 ? "default" : "outline"}
              size="sm"
              onClick={() => setDateRange(7)}
            >
              7 dias
            </Button>
            <Button
              variant={dateRange === 14 ? "default" : "outline"}
              size="sm"
              onClick={() => setDateRange(14)}
            >
              14 dias
            </Button>
            <Button
              variant={dateRange === 30 ? "default" : "outline"}
              size="sm"
              onClick={() => setDateRange(30)}
            >
              30 dias
            </Button>
          </div>
        </div>

        {/* Charts and History */}
        <Tabs defaultValue="plants" className="space-y-6" id="charts-container">
          <TabsList className="bg-card/90 backdrop-blur-sm">
            <TabsTrigger value="plants">
              <Leaf className="w-4 h-4 mr-1.5" />
              Plantas
            </TabsTrigger>
            <TabsTrigger value="charts">Gráficos</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="plants">
            <TentPlantsTab tentId={tentId} tentName={tent.name} />
          </TabsContent>

          <TabsContent value="charts" className="space-y-6">
            {logsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : chartData.length === 0 ? (
              <Card className="bg-card/90 backdrop-blur-sm">
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">Nenhum registro encontrado para este período</p>
                  <Button asChild className="mt-4">
                    <Link href={`/tent/${tentId}/log`}>Criar Primeiro Registro</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Temperature Chart */}
                <Card className="bg-card/90 backdrop-blur-sm relative overflow-hidden group/chart">
                  {/* Pulsing glow — subtle "live data" feel */}
                  <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover/chart:opacity-100 transition-opacity duration-500" style={{ boxShadow: '0 0 0 1px rgba(249,115,22,0.15) inset' }} />
                  <div className="chart-glow-line pointer-events-none absolute bottom-0 left-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-orange-500/50 to-transparent" />
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ThermometerSun className="w-5 h-5 text-orange-500" />
                      Temperatura
                    </CardTitle>
                    <CardDescription>Evolução em °C ao longo do tempo</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="gradTemp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#f97316" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" />
                        <XAxis dataKey="date" stroke="currentColor" className="opacity-40 text-xs" />
                        <YAxis stroke="currentColor" className="opacity-40 text-xs" domain={[15, 35]} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "13px" }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="temp"
                          stroke="#f97316"
                          strokeWidth={2.5}
                          fill="url(#gradTemp)"
                          dot={(props: any) => {
                            const isLast = props.index === chartData.filter(d => d.temp != null).length - 1;
                            if (!isLast) return <circle key={props.key} cx={props.cx} cy={props.cy} r={2.5} fill="#f97316" opacity={0.5} />;
                            return <PulsingDot key={props.key} cx={props.cx} cy={props.cy} color="#f97316" />;
                          }}
                          activeDot={{ r: 5, fill: "#f97316" }}
                          name="Temperatura (°C)"
                          animationDuration={800}
                          animationEasing="ease-out"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Humidity Chart */}
                <Card className="bg-card/90 backdrop-blur-sm relative overflow-hidden group/chart">
                  <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover/chart:opacity-100 transition-opacity duration-500" style={{ boxShadow: '0 0 0 1px rgba(59,130,246,0.15) inset' }} />
                  <div className="chart-glow-line-delayed pointer-events-none absolute bottom-0 left-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Droplets className="w-5 h-5 text-blue-500" />
                      Umidade Relativa
                    </CardTitle>
                    <CardDescription>Evolução em % ao longo do tempo</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="gradRh" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" />
                        <XAxis dataKey="date" stroke="currentColor" className="opacity-40 text-xs" />
                        <YAxis stroke="currentColor" className="opacity-40 text-xs" domain={[30, 90]} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "13px" }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="rh"
                          stroke="#3b82f6"
                          strokeWidth={2.5}
                          fill="url(#gradRh)"
                          dot={(props: any) => {
                            const isLast = props.index === chartData.filter(d => d.rh != null).length - 1;
                            if (!isLast) return <circle key={props.key} cx={props.cx} cy={props.cy} r={2.5} fill="#3b82f6" opacity={0.5} />;
                            return <PulsingDot key={props.key} cx={props.cx} cy={props.cy} color="#3b82f6" />;
                          }}
                          activeDot={{ r: 5, fill: "#3b82f6" }}
                          name="Umidade (%)"
                          animationDuration={800}
                          animationEasing="ease-out"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* PPFD Chart */}
                <Card className="bg-card/90 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sun className="w-5 h-5 text-yellow-500" />
                      PPFD
                    </CardTitle>
                    <CardDescription>Evolução em µmol/m²/s ao longo do tempo</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="gradPpfd" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#eab308" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" />
                        <XAxis dataKey="date" stroke="currentColor" className="opacity-40 text-xs" />
                        <YAxis stroke="currentColor" className="opacity-40 text-xs" domain={[0, 1200]} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "13px" }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="ppfd"
                          stroke="#eab308"
                          strokeWidth={2.5}
                          fill="url(#gradPpfd)"
                          dot={(props: any) => {
                            const isLast = props.index === chartData.filter(d => d.ppfd != null).length - 1;
                            if (!isLast) return <circle key={props.key} cx={props.cx} cy={props.cy} r={2.5} fill="#eab308" opacity={0.5} />;
                            return <PulsingDot key={props.key} cx={props.cx} cy={props.cy} color="#eab308" />;
                          }}
                          activeDot={{ r: 5, fill: "#eab308" }}
                          name="PPFD (µmol/m²/s)"
                          animationDuration={800}
                          animationEasing="ease-out"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* pH Chart */}
                {chartData.some(d => d.ph !== null) && (
                  <Card className="bg-card/90 backdrop-blur-sm relative overflow-hidden group/chart">
                    <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover/chart:opacity-100 transition-opacity duration-500" style={{ boxShadow: '0 0 0 1px rgba(168,85,247,0.15) inset' }} />
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FlaskConical className="w-5 h-5 text-purple-500" />
                        pH
                      </CardTitle>
                      <CardDescription>Evolução do pH ao longo do tempo (ideal: 5.8 – 6.5)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="gradPh" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" />
                          <XAxis dataKey="date" stroke="currentColor" className="opacity-40 text-xs" />
                          <YAxis stroke="currentColor" className="opacity-40 text-xs" domain={[4.5, 8]} tickCount={8} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "13px" }}
                            labelStyle={{ color: "hsl(var(--foreground))" }}
                          />
                          <Area
                            type="monotone"
                            dataKey="ph"
                            stroke="#a855f7"
                            strokeWidth={2.5}
                            fill="url(#gradPh)"
                            dot={(props: any) => {
                              const isLast = props.index === chartData.filter(d => d.ph != null).length - 1;
                              if (!isLast) return <circle key={props.key} cx={props.cx} cy={props.cy} r={2.5} fill="#a855f7" opacity={0.5} />;
                              return <PulsingDot key={props.key} cx={props.cx} cy={props.cy} color="#a855f7" />;
                            }}
                            activeDot={{ r: 5, fill: "#a855f7" }}
                            name="pH"
                            connectNulls
                            animationDuration={800}
                            animationEasing="ease-out"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* EC Chart */}
                {chartData.some(d => d.ec !== null) && (
                  <Card className="bg-card/90 backdrop-blur-sm relative overflow-hidden group/chart">
                    <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover/chart:opacity-100 transition-opacity duration-500" style={{ boxShadow: '0 0 0 1px rgba(16,185,129,0.15) inset' }} />
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-emerald-500" />
                        EC
                      </CardTitle>
                      <CardDescription>Evolução da condutividade elétrica em mS/cm (ideal: 1.0 – 2.5)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="gradEc" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="#10b981" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" />
                          <XAxis dataKey="date" stroke="currentColor" className="opacity-40 text-xs" />
                          <YAxis stroke="currentColor" className="opacity-40 text-xs" domain={[0, 4]} tickCount={9} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "13px" }}
                            labelStyle={{ color: "hsl(var(--foreground))" }}
                          />
                          <Area
                            type="monotone"
                            dataKey="ec"
                            stroke="#10b981"
                            strokeWidth={2.5}
                            fill="url(#gradEc)"
                            dot={(props: any) => {
                              const isLast = props.index === chartData.filter(d => d.ec != null).length - 1;
                              if (!isLast) return <circle key={props.key} cx={props.cx} cy={props.cy} r={2.5} fill="#10b981" opacity={0.5} />;
                              return <PulsingDot key={props.key} cx={props.cx} cy={props.cy} color="#10b981" />;
                            }}
                            activeDot={{ r: 5, fill: "#10b981" }}
                            name="EC (mS/cm)"
                            connectNulls
                            animationDuration={800}
                            animationEasing="ease-out"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* L4 — Correlação Rega × Umidade */}
                {wateringChartData.length >= 2 && (
                  <Card className="bg-card/90 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Droplets className="w-4 h-4 text-teal-500" />
                        Correlação Rega × Umidade
                      </CardTitle>
                      <CardDescription className="text-xs">Volume regado (barras) vs umidade relativa (linha)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <ComposedChart data={wateringChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gradWatering" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.8} />
                              <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.3} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.06} />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }} tickLine={false} axisLine={false} />
                          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }} tickLine={false} axisLine={false} unit="ml" width={48} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }} tickLine={false} axisLine={false} unit="%" width={36} domain={[0, 100]} />
                          <Tooltip
                            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                            formatter={(value: any, name: any) => name === "Rega" ? [`${value} ml`, name] : [`${value}%`, name]}
                          />
                          <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                          <Bar yAxisId="left" dataKey="watering" name="Rega" fill="url(#gradWatering)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                          <Line yAxisId="right" type="monotone" dataKey="rh" name="Umidade %" stroke="#3b82f6" strokeWidth={2}
                            dot={(props: any) => {
                              const isLast = props.index === wateringChartData.length - 1;
                              if (!isLast) return <circle key={props.key} cx={props.cx} cy={props.cy} r={2.5} fill="#3b82f6" opacity={0.5} />;
                              return <PulsingDot key={props.key} cx={props.cx} cy={props.cy} color="#3b82f6" />;
                            }}
                            activeDot={{ r: 5 }} connectNulls />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="history">
            {logsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : logsError ? (
              <Card className="bg-card/90 backdrop-blur-sm">
                <CardContent className="p-12 text-center">
                  <p className="text-destructive font-medium mb-2">Erro ao carregar registros</p>
                  <p className="text-sm text-muted-foreground">Tente recarregar a página.</p>
                </CardContent>
              </Card>
            ) : logs && logs.length > 0 ? (
              <div className="space-y-2">
                {/* Toggle button for auto logs */}
                <div className="flex justify-end pb-1">
                  <button
                    onClick={() => setShowAutoLogs(v => !v)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${showAutoLogs ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-500' : 'border-border text-muted-foreground'}`}
                  >
                    {showAutoLogs ? '● Automáticos visíveis' : '○ Ocultar automáticos'}
                  </button>
                </div>

                {historyLogs.map((log: any) => {
                  const isAuto = log.source === 'AUTO' || (!log.ph && !log.ec && !log.ppfd && !log.wateringVolume);

                  if (isAuto) {
                    // Compact row for AUTO entries
                    return (
                      <div
                        key={log.id}
                        className={`rounded-xl border border-border/20 bg-card/60 px-4 py-2.5 flex items-center gap-3 transition-opacity ${deletingLogId === log.id ? "opacity-40" : ""}`}
                      >
                        <span className="text-xs text-muted-foreground/50 tabular-nums shrink-0">
                          {format(new Date(log.logDate), "HH:mm", { locale: ptBR })}
                        </span>
                        <span className="text-xs text-muted-foreground/50 capitalize shrink-0">
                          {format(new Date(log.logDate), "EEE, dd MMM", { locale: ptBR })}
                        </span>
                        {log.tempC && (
                          <span className="flex items-center gap-1 text-xs text-foreground/60">
                            <ThermometerSun className="w-3 h-3 text-orange-400 shrink-0" />
                            {log.tempC}°C
                          </span>
                        )}
                        {log.rhPct && (
                          <span className="flex items-center gap-1 text-xs text-foreground/60">
                            <Droplets className="w-3 h-3 text-blue-400 shrink-0" />
                            {log.rhPct}%
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/15 border border-cyan-500/30 rounded-full px-1.5 py-0.5 ml-auto">A</span>
                      </div>
                    );
                  }

                  // Full card for MANUAL entries
                  return (
                  <div
                    key={log.id}
                    className={`rounded-2xl border border-border/40 bg-card overflow-hidden transition-opacity ${deletingLogId === log.id ? "opacity-40" : ""}`}
                  >
                    {/* Header — data full width */}
                    <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
                      <span className="text-xs font-semibold text-foreground/70 capitalize">
                        {format(new Date(log.logDate), "EEE, dd MMM", { locale: ptBR })}
                      </span>
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded leading-none ${
                        log.turn === "AM"
                          ? "bg-amber-500/10 text-amber-400/70"
                          : "bg-indigo-500/10 text-indigo-400/70"
                      }`}>
                        {log.turn === "AM" ? "AM" : "PM"}
                      </span>
                      <div className="flex-1" />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground/40 hover:text-foreground"
                        onClick={() => { setEditingLog({ ...log, tentName: tent?.name }); setEditLogOpen(true); }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground/40 hover:text-destructive"
                        disabled={deletingLogId === log.id}
                        onClick={() => handleDeleteLog(log.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {/* Módulos — 2 linhas de 3 */}
                    <div className="mx-4 mb-4 rounded-xl border border-border/20 overflow-hidden">

                      {/* Linha 1 — Temp · Humidade · PPFD */}
                      <div className="grid grid-cols-3 divide-x divide-border/20 bg-white/[0.015]">
                        <div className="px-3 py-3 flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider leading-none">Temp</span>
                          <span className="flex items-center gap-1 text-sm font-medium text-foreground/80 leading-none">
                            <ThermometerSun className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                            {log.tempC ? `${log.tempC}°C` : <span className="text-muted-foreground/20">—</span>}
                          </span>
                        </div>
                        <div className="px-3 py-3 flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider leading-none">Humidade</span>
                          <span className="flex items-center gap-1 text-sm font-medium text-foreground/80 leading-none">
                            <Droplets className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            {log.rhPct ? `${log.rhPct}%` : <span className="text-muted-foreground/20">—</span>}
                          </span>
                        </div>
                        <div className="px-3 py-3 flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider leading-none">PPFD</span>
                          <span className="flex items-center gap-1 text-sm font-medium text-foreground/80 leading-none">
                            <Sun className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                            {log.ppfd ? `${log.ppfd} µmol` : <span className="text-muted-foreground/20">—</span>}
                          </span>
                        </div>
                      </div>

                      <div className="h-px bg-border/20" />

                      {/* Linha 2 — pH · EC · Runoff */}
                      <div className="grid grid-cols-3 divide-x divide-border/20">
                        <div className="px-3 py-3 flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider leading-none">pH</span>
                          <span className="flex items-center gap-1 text-sm font-medium text-foreground/80 leading-none">
                            <FlaskConical className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                            {log.ph ? `${log.ph}` : <span className="text-muted-foreground/20">—</span>}
                          </span>
                        </div>
                        <div className="px-3 py-3 flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider leading-none">EC</span>
                          <span className="flex items-center gap-1 text-sm font-medium text-foreground/80 leading-none">
                            <Zap className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                            {log.ec ? `${log.ec}` : <span className="text-muted-foreground/20">—</span>}
                          </span>
                        </div>
                        <div className="px-3 py-3 flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider leading-none">Runoff</span>
                          <span className="flex items-center gap-1 text-sm font-medium text-foreground/80 leading-none">
                            <Droplets className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            {log.runoffPercentage
                              ? `${log.runoffPercentage}%`
                              : log.runoffCollected
                              ? `${log.runoffCollected}ml`
                              : <span className="text-muted-foreground/20">—</span>}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    {log.notes && (
                      <p className="text-[11px] text-muted-foreground/40 italic px-4 pb-3 -mt-1 truncate">
                        {log.notes}
                      </p>
                    )}
                  </div>
                  );
                })}
              </div>
            ) : (
              <Card className="bg-card/90 backdrop-blur-sm">
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground font-medium mb-1">Nenhum registro encontrado</p>
                  <p className="text-sm text-muted-foreground mb-4">Comece registrando as condições da estufa diariamente.</p>
                  <Button asChild>
                    <Link href={`/tent/${tentId}/log`}>Criar Primeiro Registro</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Dialog de edição da estufa */}
      <EditTentDialog
        tent={tent}
        open={editTentOpen}
        onOpenChange={setEditTentOpen}
        onSuccess={() => utils.tents.getById.invalidate({ id: tentId })}
      />

      <EditLogDialog
        log={editingLog}
        open={editLogOpen}
        onOpenChange={setEditLogOpen}
        onSuccess={() => utils.dailyLogs.list.invalidate({ tentId })}
      />

      {/* Dialog de confirmação de exclusão da estufa */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <DialogTitle className="text-lg">Excluir Estufa</DialogTitle>
            </div>
            <DialogDescription className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir a estufa{" "}
              <span className="font-semibold text-foreground">{tent.name}</span>? Esta ação é irreversível e removerá todos os ciclos, registros, alertas e histórico associados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirmed}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Excluindo...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" />Excluir Estufa</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── QR Code Modal (D2) ── */}
      <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2">
              <QrCode className="w-5 h-5" />
              QR Code — {tent.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Escaneie para abrir o registro rápido desta estufa
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="p-3 bg-white rounded-2xl shadow-sm">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(`${window.location.origin}/quick-log?tentId=${tentId}`)}`}
                alt={`QR Code para ${tent.name}`}
                width={220}
                height={220}
                className="rounded-lg"
              />
            </div>
            <p className="text-xs text-muted-foreground break-all">
              {window.location.origin}/quick-log?tentId={tentId}
            </p>
            <Button variant="outline" size="sm" onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/quick-log?tentId=${tentId}`);
              toast.success("Link copiado!");
            }}>
              Copiar link
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
    </PageTransition>
  );
}

// Componente para aba de plantas da estufa
function TentPlantsTab({ tentId, tentName }: { tentId: number; tentName: string }) {
  const { data: plants, isLoading } = trpc.plants.list.useQuery({ tentId });
  const { data: strains } = trpc.strains.list.useQuery();

  const getStrainName = (strainId: number) => {
    return strains?.find((s) => s.id === strainId)?.name || "--";
  };

  // getStatusColor e getStatusLabel importados de @/lib/plantUtils

  const getHealthIcon = (status?: string) => {
    switch (status) {
      case "HEALTHY": return <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0 inline-block"/>;
      case "STRESSED": return <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0 inline-block"/>;
      case "SICK": return <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 inline-block"/>;
      case "RECOVERING": return <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0 inline-block"/>;
      default: return <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30 shrink-0 inline-block"/>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!plants || plants.length === 0) {
    return (
      <Card className="bg-card/90 backdrop-blur-sm">
        <CardContent className="p-12 text-center">
          <Leaf className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">Nenhuma planta nesta estufa</p>
          <p className="text-muted-foreground mb-4">Adicione plantas para acompanhar o crescimento</p>
          <Button asChild>
            <Link href="/plants/new">
              <Plus className="w-4 h-4 mr-2" />
              Nova Planta
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {plants.length} {plants.length === 1 ? "planta" : "plantas"} em {tentName}
        </p>
        <Button asChild size="sm">
          <Link href="/plants/new">
            <Plus className="w-4 h-4 mr-2" />
            Nova Planta
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plants.map((plant: any) => (
          <Link key={plant.id} href={`/plants/${plant.id}`}>
            <Card className="bg-card/90 backdrop-blur-sm hover:shadow-lg hover:border-primary/50 transition-all duration-300 cursor-pointer h-full">
              {/* Foto da planta */}
              {plant.lastHealthPhoto && (
                <div className="aspect-[4/3] overflow-hidden rounded-t-lg">
                  <img
                    src={plant.lastHealthPhoto}
                    alt={plant.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <CardHeader className={plant.lastHealthPhoto ? "pt-3" : ""}>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{plant.name}</CardTitle>
                    {plant.code && (
                      <CardDescription className="text-sm font-mono">{plant.code}</CardDescription>
                    )}
                  </div>
                  <div className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(plant.status)}`}>
                    {getStatusLabel(plant.status)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Sprout className="w-4 h-4" />
                  <span>{getStrainName(plant.strainId)}</span>
                </div>
                {plant.lastHealthStatus && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{getHealthIcon(plant.lastHealthStatus)}</span>
                    <span>Saúde: {plant.lastHealthStatus === "HEALTHY" ? "Saudável" : plant.lastHealthStatus === "STRESSED" ? "Estressada" : plant.lastHealthStatus === "SICK" ? "Doente" : plant.lastHealthStatus === "RECOVERING" ? "Recuperando" : "--"}</span>
                  </div>
                )}
                {plant.cyclePhase && (
                  <div className="flex items-center gap-2 text-sm">
                    <Leaf className="w-4 h-4 text-primary" />
                    <span className="text-primary font-medium">{plant.cyclePhase}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
