import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sprout, ThermometerSun, Droplets, Sun, ArrowLeft, Save, Beaker, FlaskConical, Clock, Sunrise, Moon } from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { PageTransition } from "@/components/PageTransition";

export default function TentLog() {
  const { id } = useParams<{ id: string }>();
  const tentId = parseInt(id || "0");

  const { data: tent, isLoading: tentLoading } = trpc.tents.getById.useQuery({ id: tentId });
  const { data: cycle } = trpc.cycles.getByTent.useQuery({ tentId });

  const [turn, setTurn] = useState<"AM" | "PM">("AM");
  const [tempC, setTempC] = useState("");
  const [rhPct, setRhPct] = useState("");
  const [ppfd, setPpfd] = useState("400"); // Valor inicial realista: 400 μmol/m²/s
  const [ph, setPh] = useState("");
  const [ec, setEc] = useState("");
  const [wateringVolume, setWateringVolume] = useState("");
  const [runoffCollected, setRunoffCollected] = useState("");
  const [notes, setNotes] = useState("");

  // Função de validação em tempo real
  const getValidationState = (value: string, min?: number | string | null, max?: number | string | null): "valid" | "warning" | "invalid" | "neutral" => {
    if (!value || !min || !max) return "neutral";
    
    const numValue = parseFloat(value);
    const numMin = typeof min === "string" ? parseFloat(min) : min;
    const numMax = typeof max === "string" ? parseFloat(max) : max;
    
    if (isNaN(numValue) || isNaN(numMin) || isNaN(numMax)) return "neutral";
    
    // Verde: dentro da faixa ideal
    if (numValue >= numMin && numValue <= numMax) return "valid";
    
    // Amarelo: próximo da faixa (10% de tolerância)
    const range = numMax - numMin;
    const tolerance = range * 0.1;
    if (numValue >= numMin - tolerance && numValue <= numMax + tolerance) return "warning";
    
    // Vermelho: fora da faixa
    return "invalid";
  };

  // Calcular fase e semana atual
  const currentPhaseInfo = useMemo(() => {
    if (!cycle || !tent) return null;

    const now = new Date();
    const startDate = new Date(cycle.startDate);
    const floraStartDate = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;

    let phase: "VEGA" | "FLORA" | "MAINTENANCE" | "CLONING" = "VEGA";
    let weekNumber = 1;

    if (tent.category === "MAINTENANCE") {
      // Estufa A: Manutenção ou Clonagem (simplificado para MAINTENANCE)
      phase = "MAINTENANCE";
      weekNumber = 1;
    } else if (floraStartDate && now >= floraStartDate) {
      phase = "FLORA";
      const weeksSinceFlora = Math.floor((now.getTime() - floraStartDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
      weekNumber = Math.min(weeksSinceFlora + 1, 8);
    } else {
      phase = "VEGA";
      const weeksSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
      weekNumber = Math.min(weeksSinceStart + 1, 6);
    }

    return { phase, weekNumber };
  }, [cycle, tent]);

  // Buscar targets da semana atual - por strainId do ciclo ou média das strains das plantas
  const hasStrainId = !!cycle?.strainId;
  const { data: weeklyTargetsByStrain = [] } = trpc.weeklyTargets.getByStrain.useQuery(
    { strainId: cycle?.strainId || 0 },
    { enabled: hasStrainId }
  );
  
  const { data: targetsByTent } = trpc.weeklyTargets.getTargetsByTent.useQuery(
    { tentId: tentId!, phase: currentPhaseInfo?.phase as any, weekNumber: currentPhaseInfo?.weekNumber || 1 },
    { enabled: !hasStrainId && !!cycle && !!currentPhaseInfo }
  );

  const currentTargets = useMemo(() => {
    if (!currentPhaseInfo) return null;
    
    // Se ciclo tem strainId, buscar dos targets por strain
    if (hasStrainId && weeklyTargetsByStrain.length > 0) {
      return weeklyTargetsByStrain.find(
        (t: any) => t.phase === currentPhaseInfo.phase && t.weekNumber === currentPhaseInfo.weekNumber
      ) || null;
    }
    
    // Senão, usar targets calculados por tent (média das strains)
    return targetsByTent || null;
  }, [weeklyTargetsByStrain, targetsByTent, currentPhaseInfo, hasStrainId]);

  // Estados de validação
  const ppfdValidation = getValidationState(ppfd, currentTargets?.ppfdMin, currentTargets?.ppfdMax);
  const tempValidation = getValidationState(tempC, currentTargets?.tempMin, currentTargets?.tempMax);
  const rhValidation = getValidationState(rhPct, currentTargets?.rhMin, currentTargets?.rhMax);
  const phValidation = getValidationState(ph, currentTargets?.phMin, currentTargets?.phMax);
  const ecValidation = getValidationState(ec, currentTargets?.ecMin, currentTargets?.ecMax);
  
  // Calcular runoff percentage em tempo real
  const runoffPercentage = useMemo(() => {
    const watering = parseFloat(wateringVolume);
    const runoff = parseFloat(runoffCollected);
    if (!isNaN(watering) && !isNaN(runoff) && watering > 0) {
      return ((runoff / watering) * 100).toFixed(1);
    }
    return null;
  }, [wateringVolume, runoffCollected]);

  const { saveLog, pendingCount, isSyncing, syncNow, isLoading } = useOfflineSync();

  // Helper para classes de validação
  const getValidationClasses = (state: "valid" | "warning" | "invalid" | "neutral") => {
    switch (state) {
      case "valid":
        return "border-green-500 focus-visible:ring-green-500";
      case "warning":
        return "border-yellow-500 focus-visible:ring-yellow-500";
      case "invalid":
        return "border-red-500 focus-visible:ring-red-500";
      default:
        return "";
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!tempC && !rhPct && !ppfd) {
      toast.error("Preencha pelo menos um campo de medição");
      return;
    }

    try {
      const destination = await saveLog({
        tentId,
        logDate: new Date(),
        turn,
        tempC: tempC ? tempC : undefined,
        rhPct: rhPct ? rhPct : undefined,
        ppfd: ppfd ? parseInt(ppfd) : undefined,
        wateringVolume: wateringVolume ? parseInt(wateringVolume) : undefined,
        runoffCollected: runoffCollected ? parseInt(runoffCollected) : undefined,
        notes: notes || undefined,
      });
      if (destination === 'server') {
        toast.success("Registro salvo com sucesso!");
      }
      setTempC("");
      setRhPct("");
      setPpfd("400");
      setPh("");
      setEc("");
      setWateringVolume("");
      setRunoffCollected("");
      setNotes("");
    } catch (error: any) {
      toast.error(`Erro ao salvar: ${error?.message || 'Tente novamente'}`);
    }
  };

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 's',
      ctrl: true,
      description: 'Salvar Registro',
      action: () => {
        handleSubmit();
        toast.success('Atalho acionado: Salvar Registro');
      },
    },
  ]);

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
      return { phase: "Manutenção", color: "bg-blue-500 dark:bg-blue-600" };
    }

    if (tent.category === "DRYING") {
      return { phase: "Secagem", color: "bg-yellow-800 dark:bg-yellow-700" };
    }

    if (cycle.floraStartDate) {
      return { phase: "Floração", color: "bg-purple-500 dark:bg-purple-600" };
    }

    return { phase: "Vegetativa", color: "bg-green-500 dark:bg-green-600" };
  };

  const phaseInfo = getPhaseInfo();

  return (
    <PageTransition>
        <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="container py-6">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="icon">
              <Link href="/">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
                <Sprout className="w-7 h-7 text-primary" />
                Registro - {tent.name}
              </h1>
              <p className="text-muted-foreground mt-1">
                Tipo {tent.category} • {tent.width}×{tent.depth}×{tent.height}cm
              </p>
            </div>
            <Badge className={`${phaseInfo.color} text-white border-0`}>{phaseInfo.phase}</Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8 max-w-5xl">
        {/* Banner offline */}
        <OfflineBanner onSync={syncNow} isSyncing={isSyncing} className="mb-4" />

        {/* Cycle Info */}
        {cycle && currentPhaseInfo && (
          <Card className="bg-card/90 backdrop-blur-sm mb-6">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Ciclo Ativo</p>
                  <p className="text-lg font-semibold text-foreground">
                    Semana {currentPhaseInfo.weekNumber}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fase</p>
                  <p className="text-lg font-semibold text-foreground">{phaseInfo.phase}</p>
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
              </div>
            </CardContent>
          </Card>
        )}

        {/* Valores de Referência */}
        {currentTargets && (
          <Card className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950 dark:to-cyan-950 border-blue-500/20 mb-6">
            <CardHeader>
              <CardTitle className="text-green-900 dark:text-green-300">📊 Valores Ideais da Semana</CardTitle>
              <CardDescription className="text-green-700 dark:text-green-400">
                Targets de referência para comparação com suas medições
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-card/80 p-3 rounded-lg border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Sun className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    <p className="text-xs font-medium text-foreground">PPFD</p>
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {currentTargets.ppfdMin}-{currentTargets.ppfdMax}
                  </p>
                  <p className="text-xs text-muted-foreground">µmol/m²/s</p>
                </div>

                <div className="bg-card/80 p-3 rounded-lg border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <p className="text-xs font-medium text-foreground">Fotoperíodo</p>
                  </div>
                  <p className="text-sm font-bold text-foreground">{currentTargets.photoperiod}</p>
                  <p className="text-xs text-muted-foreground">Luz/Escuro</p>
                </div>

                <div className="bg-card/80 p-3 rounded-lg border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <ThermometerSun className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <p className="text-xs font-medium text-foreground">Temperatura</p>
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {currentTargets.tempMin}-{currentTargets.tempMax}
                  </p>
                  <p className="text-xs text-muted-foreground">°C</p>
                </div>

                <div className="bg-card/80 p-3 rounded-lg border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Droplets className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <p className="text-xs font-medium text-foreground">Umidade</p>
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {currentTargets.rhMin}-{currentTargets.rhMax}
                  </p>
                  <p className="text-xs text-muted-foreground">%</p>
                </div>

                <div className="bg-card/80 p-3 rounded-lg border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Beaker className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <p className="text-xs font-medium text-foreground">pH</p>
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {currentTargets.phMin}-{currentTargets.phMax}
                  </p>
                  <p className="text-xs text-muted-foreground">Ideal</p>
                </div>

                <div className="bg-card/80 p-3 rounded-lg border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <FlaskConical className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <p className="text-xs font-medium text-foreground">EC</p>
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {currentTargets.ecMin}-{currentTargets.ecMax}
                  </p>
                  <p className="text-xs text-muted-foreground">mS/cm</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Log Form */}
        <Card className="bg-card/90 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Novo Registro</CardTitle>
            <CardDescription>
              Registre as medições ambientais da estufa. Data:{" "}
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Turn Selection with Visual Indicator */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Período do Registro</Label>
                <div className="grid grid-cols-2 gap-4">
                  {/* AM Button */}
                  <button
                    type="button"
                    onClick={() => setTurn("AM")}
                    className={`relative overflow-hidden rounded-lg border-2 transition-all duration-300 ${
                      turn === "AM"
                        ? "border-yellow-400 bg-yellow-500/20 shadow-lg scale-105"
                        : "border-border bg-card hover:border-yellow-400/50 hover:shadow-md"
                    }`}
                  >
                    <div className="p-4 flex flex-col items-center gap-2">
                      <Sunrise className={`w-8 h-8 ${
                        turn === "AM" ? "text-yellow-500" : "text-gray-400"
                      }`} />
                      <div className="text-center">
                        <div className={`text-lg font-bold ${
                          turn === "AM" ? "text-yellow-700" : "text-muted-foreground"
                        }`}>AM</div>
                        <div className={`text-sm ${
                          turn === "AM" ? "text-yellow-600" : "text-muted-foreground"
                        }`}>Manhã</div>
                        <div className={`text-xs mt-1 ${
                          turn === "AM" ? "text-yellow-500" : "text-gray-400"
                        }`}>06:00 - 18:00</div>
                      </div>
                    </div>
                    {turn === "AM" && (
                      <div className="absolute top-2 right-2 w-3 h-3 bg-yellow-500/100 rounded-full animate-pulse" />
                    )}
                  </button>

                  {/* PM Button */}
                  <button
                    type="button"
                    onClick={() => setTurn("PM")}
                    className={`relative overflow-hidden rounded-lg border-2 transition-all duration-300 ${
                      turn === "PM"
                        ? "border-indigo-400 bg-indigo-500/20 shadow-lg scale-105"
                        : "border-border bg-card hover:border-indigo-400/50 hover:shadow-md"
                    }`}
                  >
                    <div className="p-4 flex flex-col items-center gap-2">
                      <Moon className={`w-8 h-8 ${
                        turn === "PM" ? "text-indigo-200" : "text-gray-400"
                      }`} />
                      <div className="text-center">
                        <div className={`text-lg font-bold ${
                          turn === "PM" ? "text-white" : "text-muted-foreground"
                        }`}>PM</div>
                        <div className={`text-sm ${
                          turn === "PM" ? "text-indigo-200" : "text-muted-foreground"
                        }`}>Noite</div>
                        <div className={`text-xs mt-1 ${
                          turn === "PM" ? "text-indigo-300" : "text-gray-400"
                        }`}>18:00 - 06:00</div>
                      </div>
                    </div>
                    {turn === "PM" && (
                      <div className="absolute top-2 right-2 w-3 h-3 bg-indigo-300 rounded-full animate-pulse" />
                    )}
                  </button>
                </div>
              </div>

              {/* Measurements Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* PPFD */}
                <div className="space-y-2">
                  <Label htmlFor="ppfd" className="flex items-center gap-2 justify-between">
                    <span className="flex items-center gap-2">
                      <Sun className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      PPFD (µmol/m²/s)
                    </span>
                    <span className="text-lg font-bold">{ppfd || '0'}</span>
                  </Label>
                  <input
                    id="ppfd"
                    type="range"
                    min="0"
                    max="1500"
                    step="10"
                    value={ppfd || '0'}
                    onChange={(e) => setPpfd(e.target.value)}
                    className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-600 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-orange-600 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0"
                  />
                  {currentTargets && (
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                      ✓ Ideal: {currentTargets.ppfdMin}-{currentTargets.ppfdMax}
                    </p>
                  )}
                </div>

                {/* Temperature */}
                <div className="space-y-2">
                  <Label htmlFor="temp" className="flex items-center gap-2">
                    <ThermometerSun className="w-4 h-4 text-red-600 dark:text-red-400" />
                    Temperatura (°C)
                  </Label>
                  <Input
                    id="temp"
                    type="text"
                    placeholder="Ex: 24.5"
                    value={tempC}
                    onChange={(e) => setTempC(e.target.value)}
                    className={`text-lg ${getValidationClasses(tempValidation)}`}
                  />
                  {currentTargets && (
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                      ✓ Ideal: {currentTargets.tempMin}-{currentTargets.tempMax}°C
                    </p>
                  )}
                </div>

                {/* Humidity */}
                <div className="space-y-2">
                  <Label htmlFor="rh" className="flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    Umidade Relativa (%)
                  </Label>
                  <Input
                    id="rh"
                    type="text"
                    placeholder="Ex: 65.0"
                    value={rhPct}
                    onChange={(e) => setRhPct(e.target.value)}
                    className={`text-lg ${getValidationClasses(rhValidation)}`}
                  />
                  {currentTargets && (
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                      ✓ Ideal: {currentTargets.rhMin}-{currentTargets.rhMax}%
                    </p>
                  )}
                </div>

                {/* pH */}
                <div className="space-y-2">
                  <Label htmlFor="ph" className="flex items-center gap-2">
                    <Beaker className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    pH
                  </Label>
                  <Input
                    id="ph"
                    type="text"
                    placeholder="Ex: 6.2"
                    value={ph}
                    onChange={(e) => setPh(e.target.value)}
                    className={`text-lg ${getValidationClasses(phValidation)}`}
                  />
                  {currentTargets && (
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                      ✓ Ideal: {currentTargets.phMin}-{currentTargets.phMax}
                    </p>
                  )}
                </div>

                {/* EC */}
                <div className="space-y-2">
                  <Label htmlFor="ec" className="flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    EC (mS/cm)
                  </Label>
                  <Input
                    id="ec"
                    type="text"
                    placeholder="Ex: 1.6"
                    value={ec}
                    onChange={(e) => setEc(e.target.value)}
                    className={`text-lg ${getValidationClasses(ecValidation)}`}
                  />
                  {currentTargets && (
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                      ✓ Ideal: {currentTargets.ecMin}-{currentTargets.ecMax}
                    </p>
                  )}
                </div>

                {/* Runoff Section */}
                <div className="col-span-2 border-t border-border pt-4 mt-2">
                  <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    Runoff (Drenagem)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Volume Regado */}
                    <div className="space-y-2">
                      <Label htmlFor="wateringVolume" className="text-sm">
                        Volume Regado (ml)
                      </Label>
                      <Input
                        id="wateringVolume"
                        type="text"
                        inputMode="numeric"
                        placeholder="Ex: 1000"
                        value={wateringVolume}
                        onChange={(e) => setWateringVolume(e.target.value)}
                        className="text-lg"
                        min="0"
                      />
                    </div>

                    {/* Runoff Coletado */}
                    <div className="space-y-2">
                      <Label htmlFor="runoffCollected" className="text-sm">
                        Runoff Coletado (ml)
                      </Label>
                      <Input
                        id="runoffCollected"
                        type="text"
                        inputMode="numeric"
                        placeholder="Ex: 200"
                        value={runoffCollected}
                        onChange={(e) => setRunoffCollected(e.target.value)}
                        className="text-lg"
                        min="0"
                      />
                    </div>

                    {/* Runoff Percentage (Calculado) */}
                    <div className="space-y-2">
                      <Label htmlFor="runoffPercentage" className="text-sm">
                        Runoff (%)
                      </Label>
                      <div className="h-10 px-3 py-2 bg-muted rounded-md border border-input flex items-center text-lg font-semibold">
                        {runoffPercentage ? `${runoffPercentage}%` : "--"}
                      </div>
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                        ✓ Ideal: 10-20%
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Observações (Opcional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Adicione observações sobre o estado das plantas, ajustes realizados, etc."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button type="submit" className="flex-1" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Salvar Registro
                    </>
                  )}
                </Button>
                <Button asChild type="button" variant="outline">
                  <Link href="/">Cancelar</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Quick Tips */}
        <Card className="mt-6 bg-green-500/10 backdrop-blur-sm border-green-200 dark:border-green-700">
          <CardContent className="p-6">
            <h3 className="font-semibold text-green-900 dark:text-green-300 mb-3">💡 Dicas de Medição</h3>
            <ul className="space-y-2 text-sm text-green-700 dark:text-green-400">
              <li>• Realize medições sempre nos mesmos horários para consistência</li>
              <li>• Aguarde alguns minutos após abrir a estufa para medições precisas</li>
              <li>• Compare seus valores com os ideais exibidos acima</li>
              <li>• Registre observações sobre mudanças no crescimento ou problemas</li>
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
    </PageTransition>
  );
}
