import { useState, useMemo } from "react";
import { getStatusColor, getStatusLabel } from "@/lib/plantUtils";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ThermometerSun, Droplets, Sun, ArrowLeft, Calendar, FileDown, Plus, Leaf, Heart, Flower2, Wind, Trash2, AlertTriangle, Pencil, Share2, Printer, MoreVertical, Clock, Zap, TestTube, Sprout } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TentIcon } from "@/components/TentIcon";
import { Link, useParams, useLocation } from "wouter";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format, subDays, differenceInHours, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageTransition } from "@/components/PageTransition";
import { PhaseConfirmDialog, type PhaseConfirmType } from "@/components/PhaseConfirmDialog";
import { SelectMotherPlantDialog } from "@/components/SelectMotherPlantDialog";
import { FinishCloningDialog } from "@/components/FinishCloningDialog";
import { PromotePhaseDialog } from "@/components/PromotePhaseDialog";
import { EditTentDialog } from "@/components/EditTentDialog";
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
  const { data: cycle } = trpc.cycles.getByTent.useQuery({ tentId });
  
  // Memoize dates to prevent infinite re-renders
  const dateFilter = useMemo(() => {
    const now = new Date();
    return {
      startDate: subDays(now, dateRange),
      endDate: now,
    };
  }, [dateRange]);

  const { data: logs, isLoading: logsLoading } = trpc.dailyLogs.list.useQuery({
    tentId,
    ...dateFilter,
  });

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
      return { phase: "Manutenção", color: "bg-blue-500/100" };
    }

    if (cycle.floraStartDate) {
      return { phase: "Floração", color: "bg-purple-500" };
    }

    return { phase: "Vegetativa", color: "bg-primary/100" };
  };

  const phaseInfo = getPhaseInfo();

  const handlePrint = () => {
    window.print();
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

  // Prepare chart data
  const chartData = logs?.map((log) => ({
    date: format(new Date(log.logDate), "dd/MM", { locale: ptBR }),
    fullDate: format(new Date(log.logDate), "dd/MM/yyyy HH:mm", { locale: ptBR }),
    turn: log.turn,
    temp: log.tempC ? parseFloat(log.tempC) : null,
    rh: log.rhPct ? parseFloat(log.rhPct) : null,
    ppfd: log.ppfd || null,
  })) || [];

  // Calculate averages
  const avgTemp = logs?.length
    ? (logs.reduce((sum, log) => sum + (log.tempC ? parseFloat(log.tempC) : 0), 0) / logs.filter(l => l.tempC).length).toFixed(1)
    : "--";
  const avgRh = logs?.length
    ? (logs.reduce((sum, log) => sum + (log.rhPct ? parseFloat(log.rhPct) : 0), 0) / logs.filter(l => l.rhPct).length).toFixed(1)
    : "--";
  const avgPpfd = logs?.length
    ? Math.round(logs.reduce((sum, log) => sum + (log.ppfd || 0), 0) / logs.filter(l => l.ppfd).length)
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
              <Button asChild size="sm" className="hidden sm:flex gap-1.5">
                <Link href={`/tent/${tentId}/log`}>
                  <Plus className="w-4 h-4" />
                  Novo Registro
                </Link>
              </Button>
              {/* Dropdown de ações secundárias */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {/* "Novo Registro" só aparece no dropdown em mobile */}
                  <DropdownMenuItem asChild className="sm:hidden">
                    <Link href={`/tent/${tentId}/log`} className="flex items-center gap-2 cursor-pointer">
                      <Plus className="w-4 h-4" />
                      Novo Registro
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEditTentOpen(true)} className="gap-2">
                    <Pencil className="w-4 h-4" />
                    Editar Estufa
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShare} className="gap-2">
                    <Share2 className="w-4 h-4" />
                    Compartilhar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handlePrint} className="gap-2">
                    <Printer className="w-4 h-4" />
                    Imprimir
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
              icon: <Droplets className="w-4 h-4 text-blue-500" />,
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
              <div className="grid grid-cols-5 gap-2">
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
                      <span className="text-[10px] text-muted-foreground font-medium truncate">{s.label}</span>
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
          <Card className="bg-card/90 backdrop-blur-sm mb-6">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  {tent?.category === 'MAINTENANCE' ? (
                    <>
                      <p className="text-sm text-muted-foreground">Última Clonagem</p>
                      <p className="text-lg font-semibold text-foreground">
                        {(tent as any).lastCloningAt
                          ? (() => {
                              const days = Math.floor((Date.now() - (tent as any).lastCloningAt) / (24 * 60 * 60 * 1000));
                              if (days === 0) return 'Hoje';
                              if (days === 1) return 'Ontem';
                              return `Há ${days} dias`;
                            })()
                          : 'Nenhuma'}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">Ciclo Ativo</p>
                      <p className="text-lg font-semibold text-foreground">
                        Semana{" "}
                        {Math.floor(
                          (Date.now() - new Date(cycle.startDate).getTime()) / (7 * 24 * 60 * 60 * 1000)
                        ) + 1}
                      </p>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Data de Início</p>
                  <p className="text-lg font-semibold text-foreground">
                    {new Date(cycle.startDate).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Dias Decorridos</p>
                  <p className="text-lg font-semibold text-foreground">
                    {Math.floor((Date.now() - new Date(cycle.startDate).getTime()) / (24 * 60 * 60 * 1000))}{" "}
                    dias
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="text-lg font-semibold text-foreground">{cycle.status}</p>
                </div>
              </div>

              {/* Botões de avanço de fase */}
              {tent && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
                  {tent.category === "MAINTENANCE" && (
                    <Button
                      onClick={() => openPhaseConfirm("CLONING")}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Sprout className="w-4 h-4 mr-2" />
                      Tirar Clones
                    </Button>
                  )}
                  {tent.category === "VEGA" && (
                    <Button
                      onClick={() => openPhaseConfirm("FLORA")}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Flower2 className="w-4 h-4 mr-2" />
                      Avançar para Floração
                    </Button>
                  )}
                  {tent.category === "FLORA" && (
                    <>
                      <Button
                        onClick={() => setHarvestQueueOpen(true)}
                        size="sm"
                        className="bg-orange-500 hover:bg-orange-600 text-white"
                      >
                        <Wind className="w-4 h-4 mr-2" />
                        Colher → Aguardando Secagem
                      </Button>
                      <Button
                        onClick={() => openPhaseConfirm("DRYING")}
                        size="sm"
                        variant="outline"
                        className="border-orange-300 text-orange-700 hover:bg-orange-50"
                      >
                        <Wind className="w-4 h-4 mr-2" />
                        Ir direto para Secagem
                      </Button>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
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
          <Card className="bg-card/90 backdrop-blur-sm border-orange-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <ThermometerSun className="w-4 h-4 text-orange-600" />
                    Temperatura Média
                  </p>
                  <p className="text-3xl font-bold text-foreground">{avgTemp}°C</p>
                  <p className="text-xs text-muted-foreground mt-1">Últimos {dateRange} dias</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                  <ThermometerSun className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/90 backdrop-blur-sm border-blue-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-blue-600" />
                    Umidade Média
                  </p>
                  <p className="text-3xl font-bold text-foreground">{avgRh}%</p>
                  <p className="text-xs text-muted-foreground mt-1">Últimos {dateRange} dias</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Droplets className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/90 backdrop-blur-sm border-yellow-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Sun className="w-4 h-4 text-yellow-600" />
                    PPFD Médio
                  </p>
                  <p className="text-3xl font-bold text-foreground">{avgPpfd}</p>
                  <p className="text-xs text-muted-foreground mt-1">Últimos {dateRange} dias</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
                  <Sun className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

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
        <Tabs defaultValue="charts" className="space-y-6" id="charts-container">
          <TabsList className="bg-card/90 backdrop-blur-sm">
            <TabsTrigger value="charts">Gráficos</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="plants">Plantas</TabsTrigger>
          </TabsList>

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
                <Card className="bg-card/90 backdrop-blur-sm border-orange-100">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ThermometerSun className="w-5 h-5 text-orange-600" />
                      Evolução da Temperatura
                    </CardTitle>
                    <CardDescription>Temperatura em °C ao longo do tempo</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" stroke="#6b7280" />
                        <YAxis stroke="#6b7280" domain={[15, 30]} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "white",
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                          }}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="temp"
                          stroke="#ea580c"
                          strokeWidth={2}
                          dot={{ fill: "#ea580c", r: 4 }}
                          name="Temperatura (°C)"
                          animationDuration={800}
                          animationBegin={0}
                          animationEasing="ease-out"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Humidity Chart */}
                <Card className="bg-card/90 backdrop-blur-sm border-blue-100">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Droplets className="w-5 h-5 text-blue-600" />
                      Evolução da Umidade
                    </CardTitle>
                    <CardDescription>Umidade relativa em % ao longo do tempo</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" stroke="#6b7280" />
                        <YAxis stroke="#6b7280" domain={[40, 80]} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "white",
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                          }}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="rh"
                          stroke="#2563eb"
                          strokeWidth={2}
                          dot={{ fill: "#2563eb", r: 4 }}
                          name="Umidade (%)"
                          animationDuration={800}
                          animationBegin={0}
                          animationEasing="ease-out"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* PPFD Chart */}
                <Card className="bg-card/90 backdrop-blur-sm border-yellow-100">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sun className="w-5 h-5 text-yellow-600" />
                      Evolução do PPFD
                    </CardTitle>
                    <CardDescription>PPFD em µmol/m²/s ao longo do tempo</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" stroke="#6b7280" />
                        <YAxis stroke="#6b7280" domain={[200, 700]} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "white",
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                          }}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="ppfd"
                          stroke="#ca8a04"
                          strokeWidth={2}
                          dot={{ fill: "#ca8a04", r: 4 }}
                          name="PPFD (μmol/m²/s)"
                          animationDuration={800}
                          animationBegin={0}
                          animationEasing="ease-out"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="history">
            {logsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : logs && logs.length > 0 ? (
              <div className="space-y-4">
                {logs.map((log) => (
                  <Card key={log.id} className="bg-card/90 backdrop-blur-sm">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="font-semibold text-foreground">
                            {format(new Date(log.logDate), "EEEE, dd 'de' MMMM 'de' yyyy", {
                              locale: ptBR,
                            })}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(log.logDate), "HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                        <Badge variant={log.turn === "AM" ? "default" : "secondary"}>
                          {log.turn === "AM" ? "Manhã" : "Noite"}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="bg-orange-500/10 rounded-lg p-3">
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                            <ThermometerSun className="w-3 h-3" />
                            Temperatura
                          </p>
                          <p className="text-lg font-bold text-foreground">
                            {log.tempC ? `${log.tempC}°C` : "--"}
                          </p>
                        </div>
                        <div className="bg-blue-500/10 rounded-lg p-3">
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                            <Droplets className="w-3 h-3" />
                            Umidade
                          </p>
                          <p className="text-lg font-bold text-foreground">
                            {log.rhPct ? `${log.rhPct}%` : "--"}
                          </p>
                        </div>
                        <div className="bg-yellow-500/10 rounded-lg p-3">
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                            <Sun className="w-3 h-3" />
                            PPFD
                          </p>
                          <p className="text-lg font-bold text-foreground">
                            {log.ppfd || "--"}
                          </p>
                        </div>
                      </div>

                      {/* Runoff Section */}
                      {(log.wateringVolume || log.runoffCollected || log.runoffPercentage) && (
                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div className="bg-cyan-500/10 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                              <Droplets className="w-3 h-3" />
                              Volume Regado
                            </p>
                            <p className="text-lg font-bold text-foreground">
                              {log.wateringVolume ? `${log.wateringVolume}ml` : "--"}
                            </p>
                          </div>
                          <div className="bg-cyan-500/10 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                              <Droplets className="w-3 h-3" />
                              Runoff Coletado
                            </p>
                            <p className="text-lg font-bold text-foreground">
                              {log.runoffCollected ? `${log.runoffCollected}ml` : "--"}
                            </p>
                          </div>
                          <div className="bg-cyan-500/10 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                              <Droplets className="w-3 h-3" />
                              Runoff (%)
                            </p>
                            <p className="text-lg font-bold text-foreground">
                              {log.runoffPercentage ? `${log.runoffPercentage}%` : "--"}
                            </p>
                          </div>
                        </div>
                      )}

                      {log.notes && (
                        <div className="bg-muted rounded-lg p-3">
                          <p className="text-xs text-muted-foreground mb-1">Observações</p>
                          <p className="text-sm text-foreground">{log.notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-card/90 backdrop-blur-sm">
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">Nenhum registro encontrado para este período</p>
                  <Button asChild className="mt-4">
                    <Link href={`/tent/${tentId}/log`}>Criar Primeiro Registro</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          <TabsContent value="plants">
            <TentPlantsTab tentId={tentId} tentName={tent.name} />
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
      case "HEALTHY": return "🟢";
      case "STRESSED": return "🟡";
      case "SICK": return "🔴";
      case "RECOVERING": return "🟠";
      default: return "⚪";
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
