import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { TentIcon } from "@/components/TentIcon";
import { RangeSlider } from "@/components/ui/range-slider";
import {
  Loader2, ThermometerSun, Droplets, Sun, ArrowLeft, Save,
  Beaker, FlaskConical, Clock, Sunrise, Moon, NotebookPen, Zap,
} from "lucide-react";
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
  const [ppfd, setPpfd] = useState(400);
  const [ph, setPh] = useState("");
  const [ec, setEc] = useState("");
  const [wateringVolume, setWateringVolume] = useState("");
  const [runoffCollected, setRunoffCollected] = useState("");
  const [notes, setNotes] = useState("");

  // Validação em tempo real
  const getValidationState = (
    value: string,
    min?: number | string | null,
    max?: number | string | null
  ): "valid" | "warning" | "invalid" | "neutral" => {
    if (!value || !min || !max) return "neutral";
    const numValue = parseFloat(value);
    const numMin = typeof min === "string" ? parseFloat(min) : min;
    const numMax = typeof max === "string" ? parseFloat(max) : max;
    if (isNaN(numValue) || isNaN(numMin) || isNaN(numMax)) return "neutral";
    if (numValue >= numMin && numValue <= numMax) return "valid";
    const range = numMax - numMin;
    const tolerance = range * 0.1;
    if (numValue >= numMin - tolerance && numValue <= numMax + tolerance) return "warning";
    return "invalid";
  };

  // Fase e semana atual
  const currentPhaseInfo = useMemo(() => {
    if (!cycle || !tent) return null;
    const now = new Date();
    const startDate = new Date(cycle.startDate);
    const floraStartDate = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;
    let phase: "VEGA" | "FLORA" | "MAINTENANCE" | "CLONING" = "VEGA";
    let weekNumber = 1;
    if (tent.category === "MAINTENANCE") {
      phase = "MAINTENANCE";
      weekNumber = 1;
    } else if (floraStartDate && now >= floraStartDate) {
      phase = "FLORA";
      weekNumber = Math.min(Math.floor((now.getTime() - floraStartDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1, 8);
    } else {
      phase = "VEGA";
      weekNumber = Math.min(Math.floor((now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1, 6);
    }
    return { phase, weekNumber };
  }, [cycle, tent]);

  // Targets da semana
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
    if (hasStrainId && weeklyTargetsByStrain.length > 0) {
      return weeklyTargetsByStrain.find(
        (t: any) => t.phase === currentPhaseInfo.phase && t.weekNumber === currentPhaseInfo.weekNumber
      ) || null;
    }
    return targetsByTent || null;
  }, [weeklyTargetsByStrain, targetsByTent, currentPhaseInfo, hasStrainId]);

  // Estados de validação
  const ppfdValidation = getValidationState(String(ppfd), currentTargets?.ppfdMin, currentTargets?.ppfdMax);
  const tempValidation  = getValidationState(tempC,  currentTargets?.tempMin,  currentTargets?.tempMax);
  const rhValidation    = getValidationState(rhPct,  currentTargets?.rhMin,   currentTargets?.rhMax);
  const phValidation    = getValidationState(ph,     currentTargets?.phMin,   currentTargets?.phMax);
  const ecValidation    = getValidationState(ec,     currentTargets?.ecMin,   currentTargets?.ecMax);

  // Runoff % calculado
  const runoffPercentage = useMemo(() => {
    const watering = parseFloat(wateringVolume);
    const runoff   = parseFloat(runoffCollected);
    if (!isNaN(watering) && !isNaN(runoff) && watering > 0) {
      return ((runoff / watering) * 100).toFixed(1);
    }
    return null;
  }, [wateringVolume, runoffCollected]);

  const { saveLog, pendingCount, isSyncing, syncNow, isLoading } = useOfflineSync();

  // Fase info (para badge)
  const getPhaseInfo = () => {
    if (!cycle) return { phase: "Inativo", color: "bg-muted" };
    if (tent?.category === "MAINTENANCE") return { phase: "Manutenção", color: "bg-blue-500 dark:bg-blue-600" };
    if (tent?.category === "DRYING") return { phase: "Secagem", color: "bg-yellow-800 dark:bg-yellow-700" };
    if (cycle.floraStartDate) return { phase: "Floração", color: "bg-purple-500 dark:bg-purple-600" };
    return { phase: "Vegetativa", color: "bg-green-500 dark:bg-green-600" };
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
        tempC: tempC || undefined,
        rhPct: rhPct || undefined,
        ppfd: ppfd || undefined,
        wateringVolume: wateringVolume ? parseInt(wateringVolume) : undefined,
        runoffCollected: runoffCollected ? parseInt(runoffCollected) : undefined,
        notes: notes || undefined,
      });
      if (destination === "server") toast.success("Registro salvo com sucesso!");
      setTempC(""); setRhPct(""); setPpfd(400);
      setPh(""); setEc("");
      setWateringVolume(""); setRunoffCollected(""); setNotes("");
    } catch (error: any) {
      toast.error(`Erro ao salvar: ${error?.message || "Tente novamente"}`);
    }
  };

  useKeyboardShortcuts([{
    key: "s", ctrl: true, description: "Salvar Registro",
    action: () => { handleSubmit(); toast.success("Atalho acionado: Salvar Registro"); },
  }]);

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
            <Button asChild className="mt-4"><Link href="/">Voltar</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const phaseInfo = getPhaseInfo();

  // Helpers de estilo de validação
  const validationBorder = (s: "valid" | "warning" | "invalid" | "neutral") => ({
    valid:   "border-emerald-500 ring-1 ring-emerald-500/30",
    warning: "border-amber-500 ring-1 ring-amber-500/30",
    invalid: "border-red-500 ring-1 ring-red-500/30",
    neutral: "",
  }[s]);

  const validationText = (s: "valid" | "warning" | "invalid" | "neutral") => ({
    valid:   "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    invalid: "text-red-600 dark:text-red-400",
    neutral: "text-muted-foreground",
  }[s]);

  const validationDot = (s: "valid" | "warning" | "invalid" | "neutral") => ({
    valid:   "bg-emerald-500",
    warning: "bg-amber-500",
    invalid: "bg-red-500",
    neutral: "bg-muted-foreground/30",
  }[s]);

  // Runoff % color
  const runoffNum = runoffPercentage ? parseFloat(runoffPercentage) : null;
  const runoffColor = runoffNum == null ? "text-muted-foreground"
    : runoffNum >= 10 && runoffNum <= 20 ? "text-emerald-600 dark:text-emerald-400"
    : runoffNum >= 5  && runoffNum <= 30 ? "text-amber-600 dark:text-amber-400"
    : "text-red-600 dark:text-red-400";

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28">

        {/* ── Header ── */}
        <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
          <div className="container py-4">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="icon" className="shrink-0">
                <Link href={`/tent/${tentId}`}><ArrowLeft className="w-5 h-5" /></Link>
              </Button>
              <div className="w-9 h-9 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
                <TentIcon className="w-4.5 h-4.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-foreground leading-tight truncate">
                  Novo Registro — {tent.name}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {tent.category} • {tent.width}×{tent.depth}×{tent.height}cm
                </p>
              </div>
              <Badge className={`${phaseInfo.color} text-white border-0 text-xs shrink-0`}>
                {phaseInfo.phase}
              </Badge>
            </div>
          </div>
        </header>

        {/* ── Main ── */}
        <main className="container py-6 max-w-3xl space-y-4">

          {/* Offline banner */}
          <OfflineBanner onSync={syncNow} isSyncing={isSyncing} className="" />

          {/* Ciclo strip */}
          {cycle && currentPhaseInfo && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-card border border-border text-sm">
              <div className="flex items-center gap-1.5 text-primary font-semibold">
                <Clock className="w-3.5 h-3.5" />
                Semana {currentPhaseInfo.weekNumber}
              </div>
              <span className="text-muted-foreground/40">•</span>
              <span className="text-muted-foreground">{phaseInfo.phase}</span>
              <span className="text-muted-foreground/40">•</span>
              <span className="text-muted-foreground">
                Início {new Date(cycle.startDate).toLocaleDateString("pt-BR")}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {Math.floor((Date.now() - new Date(cycle.startDate).getTime()) / (24 * 60 * 60 * 1000))} dias
              </span>
            </div>
          )}

          {/* ── Período AM/PM ── */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Período do Registro
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTurn("AM")}
                  className={`relative overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                    turn === "AM"
                      ? "border-yellow-400 bg-yellow-500/15 shadow-md scale-[1.02]"
                      : "border-border bg-card/50 hover:border-yellow-400/40"
                  }`}
                >
                  <div className="p-4 flex flex-col items-center gap-1.5">
                    <Sunrise className={`w-7 h-7 ${turn === "AM" ? "text-yellow-500" : "text-muted-foreground"}`} />
                    <span className={`text-base font-bold ${turn === "AM" ? "text-yellow-700 dark:text-yellow-400" : "text-muted-foreground"}`}>AM</span>
                    <span className={`text-xs ${turn === "AM" ? "text-yellow-600/80 dark:text-yellow-500/80" : "text-muted-foreground/60"}`}>06:00 – 18:00</span>
                  </div>
                  {turn === "AM" && <div className="absolute top-2 right-2 w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />}
                </button>

                <button
                  type="button"
                  onClick={() => setTurn("PM")}
                  className={`relative overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                    turn === "PM"
                      ? "border-indigo-400 bg-indigo-500/15 shadow-md scale-[1.02]"
                      : "border-border bg-card/50 hover:border-indigo-400/40"
                  }`}
                >
                  <div className="p-4 flex flex-col items-center gap-1.5">
                    <Moon className={`w-7 h-7 ${turn === "PM" ? "text-indigo-300" : "text-muted-foreground"}`} />
                    <span className={`text-base font-bold ${turn === "PM" ? "text-indigo-200 dark:text-indigo-300" : "text-muted-foreground"}`}>PM</span>
                    <span className={`text-xs ${turn === "PM" ? "text-indigo-300/80" : "text-muted-foreground/60"}`}>18:00 – 06:00</span>
                  </div>
                  {turn === "PM" && <div className="absolute top-2 right-2 w-2 h-2 bg-indigo-300 rounded-full animate-pulse" />}
                </button>
              </div>
            </CardContent>
          </Card>

          {/* ── PPFD ── */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-yellow-500/15 flex items-center justify-center">
                    <Sun className="w-4 h-4 text-yellow-500" />
                  </div>
                  <span className="font-semibold text-sm text-foreground">PPFD</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {ppfdValidation !== "neutral" && (
                    <span className={`w-2 h-2 rounded-full ${validationDot(ppfdValidation)}`} />
                  )}
                  <span className="text-3xl font-bold text-foreground tabular-nums">{ppfd}</span>
                  <span className="text-sm text-muted-foreground self-end mb-0.5">µmol</span>
                </div>
              </div>

              <div className="pt-8 pb-2">
                <RangeSlider
                  min={0}
                  max={1500}
                  step={10}
                  value={ppfd}
                  onChange={setPpfd}
                  trackGradient="linear-gradient(to right, #dc2626 0%, #f97316 28.5%, #eab308 42.8%, #22c55e 50%, #3b82f6 64.2%, #8b5cf6 100%)"
                  formatTooltip={(v) => `${v} µmol`}
                  showTooltip
                  labels={[
                    { position: 10,  label: "Clonagem", sublabel: "100-200",  color: "#ef4444", icon: "🌱" },
                    { position: 33,  label: "Vega",     sublabel: "400-600",  color: "#22c55e", icon: "🌿" },
                    { position: 60,  label: "Flora",    sublabel: "600-900",  color: "#f97316", icon: "🌸" },
                    { position: 87,  label: "Máximo",   sublabel: "1000-1200",color: "#a855f7", icon: "⚡" },
                  ]}
                />
              </div>

              {currentTargets && (
                <p className={`text-xs mt-1 font-medium ${validationText(ppfdValidation)}`}>
                  🎯 Target semana {currentPhaseInfo?.weekNumber}: {currentTargets.ppfdMin}–{currentTargets.ppfdMax} µmol
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── Ambiente + Nutrição (2 cols no desktop) ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* 🌡️ Ambiente */}
            <Card>
              <CardContent className="p-5 space-y-5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <ThermometerSun className="w-3.5 h-3.5 text-orange-500" />
                  Ambiente
                </p>

                {/* Temperatura */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground font-medium">Temperatura</label>
                    {tempValidation !== "neutral" && (
                      <span className={`w-2 h-2 rounded-full ${validationDot(tempValidation)}`} />
                    )}
                  </div>
                  <div className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 bg-background dark:bg-zinc-900 transition-colors ${validationBorder(tempValidation) || "border-border"}`}>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="24.5"
                      value={tempC}
                      onChange={(e) => setTempC(e.target.value)}
                      className="flex-1 bg-transparent text-4xl font-bold text-foreground placeholder:text-muted-foreground/30 outline-none tabular-nums w-0 min-w-0"
                    />
                    <span className="text-lg text-muted-foreground font-medium shrink-0">°C</span>
                  </div>
                  {currentTargets && (
                    <p className={`text-xs font-medium ${validationText(tempValidation)}`}>
                      🎯 {currentTargets.tempMin}–{currentTargets.tempMax}°C
                    </p>
                  )}
                </div>

                {/* Umidade */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                      <Droplets className="w-3 h-3 text-blue-500" />
                      Umidade Relativa
                    </label>
                    {rhValidation !== "neutral" && (
                      <span className={`w-2 h-2 rounded-full ${validationDot(rhValidation)}`} />
                    )}
                  </div>
                  <div className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 bg-background dark:bg-zinc-900 transition-colors ${validationBorder(rhValidation) || "border-border"}`}>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="65"
                      value={rhPct}
                      onChange={(e) => setRhPct(e.target.value)}
                      className="flex-1 bg-transparent text-4xl font-bold text-foreground placeholder:text-muted-foreground/30 outline-none tabular-nums w-0 min-w-0"
                    />
                    <span className="text-lg text-muted-foreground font-medium shrink-0">%</span>
                  </div>
                  {currentTargets && (
                    <p className={`text-xs font-medium ${validationText(rhValidation)}`}>
                      🎯 {currentTargets.rhMin}–{currentTargets.rhMax}%
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ⚗️ Nutrição */}
            <Card>
              <CardContent className="p-5 space-y-5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Beaker className="w-3.5 h-3.5 text-purple-500" />
                  Nutrição
                </p>

                {/* pH */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground font-medium">pH</label>
                    {phValidation !== "neutral" && (
                      <span className={`w-2 h-2 rounded-full ${validationDot(phValidation)}`} />
                    )}
                  </div>
                  <div className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 bg-background dark:bg-zinc-900 transition-colors ${validationBorder(phValidation) || "border-border"}`}>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="6.2"
                      step="0.1"
                      value={ph}
                      onChange={(e) => setPh(e.target.value)}
                      className="flex-1 bg-transparent text-4xl font-bold text-foreground placeholder:text-muted-foreground/30 outline-none tabular-nums w-0 min-w-0"
                    />
                    <span className="text-lg text-muted-foreground font-medium shrink-0">pH</span>
                  </div>
                  {currentTargets && (
                    <p className={`text-xs font-medium ${validationText(phValidation)}`}>
                      🎯 {currentTargets.phMin}–{currentTargets.phMax}
                    </p>
                  )}
                </div>

                {/* EC */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                      <Zap className="w-3 h-3 text-yellow-500" />
                      EC
                    </label>
                    {ecValidation !== "neutral" && (
                      <span className={`w-2 h-2 rounded-full ${validationDot(ecValidation)}`} />
                    )}
                  </div>
                  <div className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 bg-background dark:bg-zinc-900 transition-colors ${validationBorder(ecValidation) || "border-border"}`}>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="1.6"
                      step="0.1"
                      value={ec}
                      onChange={(e) => setEc(e.target.value)}
                      className="flex-1 bg-transparent text-4xl font-bold text-foreground placeholder:text-muted-foreground/30 outline-none tabular-nums w-0 min-w-0"
                    />
                    <span className="text-lg text-muted-foreground font-medium shrink-0">mS</span>
                  </div>
                  {currentTargets && (
                    <p className={`text-xs font-medium ${validationText(ecValidation)}`}>
                      🎯 {currentTargets.ecMin}–{currentTargets.ecMax} mS/cm
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── 💧 Rega ── */}
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-4">
                <Droplets className="w-3.5 h-3.5 text-teal-500" />
                Rega & Runoff
              </p>
              <div className="grid grid-cols-3 gap-3">

                {/* Volume Regado */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium block">Volume Regado</label>
                  <div className="flex flex-col items-center gap-1 rounded-xl border-2 border-border px-2 py-3 bg-background dark:bg-zinc-900">
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="1000"
                      value={wateringVolume}
                      onChange={(e) => setWateringVolume(e.target.value)}
                      className="w-full bg-transparent text-2xl font-bold text-foreground placeholder:text-muted-foreground/30 outline-none tabular-nums text-center"
                    />
                    <span className="text-xs text-muted-foreground">ml</span>
                  </div>
                </div>

                {/* Runoff Coletado */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium block">Runoff Coletado</label>
                  <div className="flex flex-col items-center gap-1 rounded-xl border-2 border-border px-2 py-3 bg-background dark:bg-zinc-900">
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="200"
                      value={runoffCollected}
                      onChange={(e) => setRunoffCollected(e.target.value)}
                      className="w-full bg-transparent text-2xl font-bold text-foreground placeholder:text-muted-foreground/30 outline-none tabular-nums text-center"
                    />
                    <span className="text-xs text-muted-foreground">ml</span>
                  </div>
                </div>

                {/* Runoff % calculado */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium block">Runoff %</label>
                  <div className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border px-2 py-3 bg-muted/30">
                    <span className={`text-2xl font-bold tabular-nums ${runoffColor}`}>
                      {runoffPercentage ?? "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {runoffPercentage ? "%" : "auto"}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">Ideal: 10–20%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── 📝 Observações ── */}
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-3">
                <NotebookPen className="w-3.5 h-3.5" />
                Observações
                <span className="font-normal normal-case">(opcional)</span>
              </p>
              <Textarea
                placeholder="Estado das plantas, ajustes realizados, problemas observados..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="resize-none bg-background dark:bg-zinc-900 border-border"
              />
            </CardContent>
          </Card>

        </main>

        {/* ── Sticky Save Footer ── */}
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-md border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <div className="container max-w-3xl flex gap-3">
            <Button asChild variant="outline" className="shrink-0">
              <Link href={`/tent/${tentId}`}>Cancelar</Link>
            </Button>
            <Button
              onClick={() => handleSubmit()}
              disabled={isLoading}
              className="flex-1 gap-2 text-base font-semibold"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</>
              ) : (
                <><Save className="w-4 h-4" />Salvar Registro
                  <span className="ml-auto text-xs opacity-60 hidden sm:block">Ctrl+S</span>
                </>
              )}
            </Button>
          </div>
          {pendingCount > 0 && (
            <p className="text-center text-xs text-amber-600 dark:text-amber-400 mt-1">
              {pendingCount} registro{pendingCount > 1 ? "s" : ""} offline aguardando sync
            </p>
          )}
        </div>

      </div>
    </PageTransition>
  );
}
