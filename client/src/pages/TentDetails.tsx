import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Sprout, ThermometerSun, Droplets, Sun, ArrowLeft, Calendar, FileDown, Plus, Leaf, Heart, Flower2, Wind, Trash2, AlertTriangle, Pencil } from "lucide-react";
import { Link, useParams, useLocation } from "wouter";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Printer } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { PhaseConfirmDialog, type PhaseConfirmType } from "@/components/PhaseConfirmDialog";
import { SelectMotherPlantDialog } from "@/components/SelectMotherPlantDialog";
import { FinishCloningDialog } from "@/components/FinishCloningDialog";
import { PromotePhaseDialog } from "@/components/PromotePhaseDialog";
import { EditTentDialog } from "@/components/EditTentDialog";
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
      return { phase: "Inativo", color: "bg-muted0" };
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
      <header className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="container py-4 md:py-6">
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
            <div className="flex items-center gap-4">
              <Button asChild variant="ghost" size="icon">
                <Link href="/">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              </Button>
              <div className="flex-1">
                <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2 md:gap-3">
                  <Sprout className="w-6 h-6 md:w-7 md:h-7 text-primary" />
                  {tent.name}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Tipo {tent.category} • {tent.width}×{tent.depth}×{tent.height}cm
                </p>
              </div>
              <Badge className={`${phaseInfo.color} text-white border-0 text-xs md:text-sm`}>{phaseInfo.phase}</Badge>
            </div>
            <div className="flex gap-2 md:ml-auto">
              <Button
                variant="outline"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setEditTentOpen(true)}
                title="Editar estufa"
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                onClick={() => setDeleteConfirmOpen(true)}
                title="Excluir estufa"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button variant="outline" onClick={handlePrint} className="flex-1 md:flex-none">
                <Printer className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Imprimir</span>
              </Button>
              <Button asChild className="flex-1 md:flex-none">
                <Link href={`/tent/${tentId}/log`}>Novo Registro</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8 max-w-7xl">
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
                    <Button
                      onClick={() => openPhaseConfirm("DRYING")}
                      size="sm"
                      className="bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      <Wind className="w-4 h-4 mr-2" />
                      Avançar para Secagem
                    </Button>
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE": return "bg-green-500/10 text-green-600 border-green-500/30";
      case "HARVESTED": return "bg-blue-500/10 text-blue-600 border-blue-500/30";
      case "DEAD": return "bg-red-500/10 text-red-600 border-red-500/30";
      default: return "bg-gray-500/10 text-gray-600 border-gray-500/30";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ACTIVE": return "Ativa";
      case "HARVESTED": return "Colhida";
      case "DEAD": return "Morta";
      default: return status;
    }
  };

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
