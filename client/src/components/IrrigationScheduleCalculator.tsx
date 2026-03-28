import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle, BookmarkPlus, Trash2, Download, Timer,
  Droplets, Zap, Sun, Clock, Loader2, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

// ─────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────

interface IrrigationInput {
  pumpFlowMlMin: number;
  numOutlets: number;
  maxRuntimeMin: number;
  restTimeBetweenMin: number;
  potSizeLiters: number;
  targetPct: number;
  lightsOnMinutes: number;
  lightsOffMinutes: number;
}

interface CycleEntry {
  cycleNumber: number;
  startTimeFormatted: string;
  durationMin: number;
  durationSec: number;
  mlPerPlant: number;
}

interface IrrigationResult {
  flowPerPlantMlMin: number;
  dailyVolumePerPlantMl: number;
  totalDailyVolumeMl: number;
  numCycles: number;
  durationPerCycleMin: number;
  durationPerCycleSec: number;
  mlPerCyclePerPlant: number;
  schedule: CycleEntry[];
  expectedRunoffMlPerPlant: number;
  availableWindowMin: number;
  warnings: string[];
}

// ─────────────────────────────────────────────
// Helpers de tempo
// ─────────────────────────────────────────────

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTimeString(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.round(totalMinutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────
// Lógica de cálculo (função pura)
// ─────────────────────────────────────────────

function calculateIrrigationSchedule(input: IrrigationInput): IrrigationResult | null {
  const {
    pumpFlowMlMin, numOutlets, maxRuntimeMin, restTimeBetweenMin,
    potSizeLiters, targetPct, lightsOnMinutes, lightsOffMinutes,
  } = input;

  if (
    pumpFlowMlMin <= 0 || numOutlets <= 0 || maxRuntimeMin <= 0 ||
    potSizeLiters <= 0 || targetPct <= 0 || lightsOffMinutes <= lightsOnMinutes
  ) return null;

  const warnings: string[] = [];

  // 1. Vazão por planta
  const flowPerPlantMlMin = pumpFlowMlMin / numOutlets;

  // 2. Volume diário por planta
  const dailyVolumePerPlantMl = potSizeLiters * 1000 * targetPct / 100;
  const totalDailyVolumeMl = dailyVolumePerPlantMl * numOutlets;

  // 3. Tempo total de bombeamento necessário
  const totalPumpTimeMin = totalDailyVolumeMl / pumpFlowMlMin;

  // 4. Mínimo de ciclos pelo limite de runtime
  const minCyclesByRuntime = Math.ceil(totalPumpTimeMin / maxRuntimeMin);

  // 5. Janela de irrigação (boas práticas cannabis)
  //    Primeiro ciclo: luzes ligaram + 1,5h (estômatos abertos)
  //    Último ciclo: luzes apagam - 2h (evitar raízes molhadas no escuro)
  const firstCycleStartMin = lightsOnMinutes + 90;
  const lastCycleLatestMin = lightsOffMinutes - 120;
  const availableWindowMin = lastCycleLatestMin - firstCycleStartMin;

  if (availableWindowMin < 60) {
    warnings.push(
      "Janela de luz muito curta. Precisa de pelo menos 3h50min entre acender e apagar as luzes para 2+ ciclos."
    );
  }

  // 6. Escolher número "bonito" de ciclos
  const niceNumbers = [2, 3, 4, 6, 8, 12];
  let numCycles = minCyclesByRuntime < 1 ? 1 : minCyclesByRuntime;
  for (const n of niceNumbers) {
    if (n >= minCyclesByRuntime) {
      numCycles = n;
      break;
    }
  }
  if (minCyclesByRuntime > niceNumbers[niceNumbers.length - 1]) {
    numCycles = minCyclesByRuntime;
    warnings.push(
      `Número elevado de ciclos necessários (${numCycles}). Considere uma bomba com maior vazão ou vaso menor.`
    );
  }

  // 7. Duração de cada ciclo
  const durationPerCycleMin = totalDailyVolumeMl / (numCycles * pumpFlowMlMin);
  const durationPerCycleSec = Math.round(durationPerCycleMin * 60);

  if (durationPerCycleMin > maxRuntimeMin + 0.01) {
    warnings.push(
      `Duração por ciclo (${durationPerCycleMin.toFixed(1)} min) excede o tempo máximo configurado (${maxRuntimeMin} min).`
    );
  }

  // 8. Validar intervalo de descanso
  if (numCycles > 1) {
    const intervalBetween = availableWindowMin / (numCycles - 1);
    const minInterval = durationPerCycleMin + restTimeBetweenMin;
    if (intervalBetween < minInterval) {
      warnings.push(
        `Intervalo entre ciclos (~${intervalBetween.toFixed(0)} min) pode ser insuficiente para o descanso da bomba (${restTimeBetweenMin} min após ${durationPerCycleMin.toFixed(1)} min de bombeamento).`
      );
    }
  }

  // 9. ml por ciclo por planta
  const mlPerCyclePerPlant = dailyVolumePerPlantMl / numCycles;

  // 10. Construir schedule
  const schedule: CycleEntry[] = [];
  for (let i = 0; i < numCycles; i++) {
    const startMin = numCycles === 1
      ? firstCycleStartMin
      : firstCycleStartMin + (i * (availableWindowMin / (numCycles - 1)));

    schedule.push({
      cycleNumber: i + 1,
      startTimeFormatted: minutesToTimeString(startMin),
      durationMin: durationPerCycleMin,
      durationSec: durationPerCycleSec,
      mlPerPlant: Math.round(mlPerCyclePerPlant),
    });
  }

  // 11. Drenagem esperada (boas práticas: ~17,5%)
  const expectedRunoffMlPerPlant = dailyVolumePerPlantMl * 0.175;

  return {
    flowPerPlantMlMin,
    dailyVolumePerPlantMl,
    totalDailyVolumeMl,
    numCycles,
    durationPerCycleMin,
    durationPerCycleSec: durationPerCycleSec,
    mlPerCyclePerPlant,
    schedule,
    expectedRunoffMlPerPlant,
    availableWindowMin,
    warnings,
  };
}

// ─────────────────────────────────────────────
// Sugestão de % por fase/semana (boas práticas)
// ─────────────────────────────────────────────

function getSuggestedTargetPct(phase: "vega" | "flora", weekNumber: number): number {
  if (phase === "vega") return 35;
  if (weekNumber <= 4) return 45;
  return 60;
}

function getSuggestedLabel(phase: "vega" | "flora", weekNumber: number): string {
  if (phase === "vega") return "Vega: 30–40% do vaso";
  if (weekNumber <= 4) return `Flora Sem. ${weekNumber}: 40–50% do vaso`;
  return `Flora Sem. ${weekNumber}: 50–70% do vaso`;
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────

export function IrrigationScheduleCalculator() {
  // ── Bomba ──
  const [pumpFlowStr, setPumpFlowStr] = useState("2000");
  const [outletsStr, setOutletsStr] = useState("8");
  const [maxRuntimeStr, setMaxRuntimeStr] = useState("3");
  const [restTimeStr, setRestTimeStr] = useState("30");

  // ── Planta ──
  const [potSizeStr, setPotSizeStr] = useState("11");
  const [phase, setPhase] = useState<"vega" | "flora">("vega");
  const [weekNumber, setWeekNumber] = useState(3);

  // ── Luz ──
  const [lightsOnTime, setLightsOnTime] = useState("06:00");
  const [lightsOffTime, setLightsOffTime] = useState("22:00");

  // ── Volume ──
  const [useCustomPct, setUseCustomPct] = useState(false);
  const [customPctStr, setCustomPctStr] = useState("35");

  // ── Presets ──
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: number; name: string }>({
    open: false, id: 0, name: "",
  });

  // ── tRPC ──
  const utils = trpc.useUtils();
  const { data: presetsList = [] } = trpc.pumpPresets.list.useQuery();

  const createPreset = trpc.pumpPresets.create.useMutation({
    onSuccess: () => {
      utils.pumpPresets.list.invalidate();
      toast.success(`✅ Bomba "${presetName}" salva!`);
      setShowSaveDialog(false);
      setPresetName("");
    },
    onError: (e) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  const deletePreset = trpc.pumpPresets.delete.useMutation({
    onSuccess: () => {
      utils.pumpPresets.list.invalidate();
      toast.success("🗑️ Predefinição removida");
      setDeleteConfirm({ open: false, id: 0, name: "" });
    },
    onError: (e) => toast.error(`Erro ao excluir: ${e.message}`),
  });

  // ── Valores numéricos derivados ──
  const pumpFlowMlMin = parseFloat(pumpFlowStr) || 0;
  const numOutlets = parseInt(outletsStr) || 0;
  const maxRuntimeMin = parseFloat(maxRuntimeStr) || 0;
  const restTimeBetweenMin = parseFloat(restTimeStr) || 0;
  const potSizeLiters = parseFloat(potSizeStr) || 0;
  const lightsOnMinutes = parseTimeToMinutes(lightsOnTime);
  const lightsOffMinutes = parseTimeToMinutes(lightsOffTime);

  const suggestedPct = getSuggestedTargetPct(phase, weekNumber);
  const targetPct = useCustomPct ? (parseFloat(customPctStr) || suggestedPct) : suggestedPct;
  const flowPerPlant = numOutlets > 0 ? pumpFlowMlMin / numOutlets : 0;
  const lightWindowH = ((lightsOffMinutes - lightsOnMinutes) / 60).toFixed(1);

  // ── Cálculo principal ──
  const result = useMemo(() => calculateIrrigationSchedule({
    pumpFlowMlMin, numOutlets, maxRuntimeMin, restTimeBetweenMin,
    potSizeLiters, targetPct, lightsOnMinutes, lightsOffMinutes,
  }), [pumpFlowMlMin, numOutlets, maxRuntimeMin, restTimeBetweenMin,
       potSizeLiters, targetPct, lightsOnMinutes, lightsOffMinutes]);

  // ── Carregar preset ──
  const handleLoadPreset = (preset: any) => {
    setPumpFlowStr(String(parseFloat(preset.totalFlowMlPerMin)));
    setOutletsStr(String(preset.numOutlets));
    setMaxRuntimeStr(String(parseFloat(preset.maxRuntimeMin)));
    setRestTimeStr(String(parseFloat(preset.restTimeBetweenCyclesMin)));
    toast.success(`Bomba "${preset.name}" carregada!`);
  };

  // ── Salvar preset ──
  const handleSavePreset = () => {
    if (!presetName.trim()) { toast.error("Digite um nome para a predefinição"); return; }
    createPreset.mutate({
      name: presetName.trim(),
      totalFlowMlPerMin: pumpFlowMlMin,
      numOutlets,
      maxRuntimeMin,
      restTimeBetweenCyclesMin: restTimeBetweenMin,
    });
  };

  // ── Exportar TXT ──
  const handleExportTxt = () => {
    if (!result) return;
    const lines = [
      "========================================",
      "  CRONOGRAMA DE REGA AUTOMÁTICA",
      "  Cultivo App",
      "========================================",
      "",
      `Fase: ${phase === "vega" ? "Vegetativa" : "Floração"} — Semana ${weekNumber}`,
      `Bomba: ${pumpFlowMlMin} ml/min total · ${numOutlets} saídas`,
      `       Máx. ${maxRuntimeMin} min ligada · ${restTimeBetweenMin} min descanso`,
      `Vaso: ${potSizeLiters}L`,
      `Volume alvo: ${targetPct}% → ${result.dailyVolumePerPlantMl.toFixed(0)} ml/planta/dia`,
      `Luzes: ${lightsOnTime} – ${lightsOffTime} (${lightWindowH}h)`,
      "",
      "── RESUMO ───────────────────────────────",
      `Ciclos por dia:       ${result.numCycles}`,
      `Duração por ciclo:    ${result.durationPerCycleSec}s (${result.durationPerCycleMin.toFixed(2)} min)`,
      `Volume/ciclo/planta:  ${result.mlPerCyclePerPlant.toFixed(0)} ml`,
      `Volume diário total:  ${result.totalDailyVolumeMl.toFixed(0)} ml (${numOutlets} plantas)`,
      `Drenagem esperada:    ~${result.expectedRunoffMlPerPlant.toFixed(0)} ml/planta (17,5%)`,
      "",
      "── HORÁRIOS ────────────────────────────",
      "Ciclo  Horário  Duração   ml/planta",
      ...result.schedule.map(c =>
        `  ${String(c.cycleNumber).padStart(2)}     ${c.startTimeFormatted}    ${String(c.durationSec).padStart(4)}s   ${String(c.mlPerPlant).padStart(6)} ml`
      ),
      "",
      "========================================",
      "Boas práticas embutidas:",
      "• 1º ciclo: 1,5h após acender as luzes",
      "• Último ciclo: 2h antes de apagar",
      "• Drenagem alvo: 15–20%",
      "========================================",
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cronograma-rega-${phase}-sem${weekNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("📄 Cronograma exportado!");
  };

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <div className="space-y-5 pb-10">

      {/* ── SEÇÃO 1: Configuração da Bomba ── */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <Zap className="w-4 h-4 text-blue-500" />
            </div>
            <h3 className="font-semibold text-sm text-foreground uppercase tracking-wide">Configuração da Bomba</h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Vazão total */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Vazão total (ml/min)</Label>
              <Input
                type="text" inputMode="decimal"
                value={pumpFlowStr}
                onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setPumpFlowStr(v); }}
                placeholder="Ex: 2000"
                className="text-xl font-bold text-center h-12"
              />
            </div>

            {/* Nº de saídas */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Saídas / Plantas</Label>
              <Input
                type="text" inputMode="numeric"
                value={outletsStr}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setOutletsStr(v); }}
                placeholder="Ex: 8"
                className="text-xl font-bold text-center h-12"
              />
            </div>

            {/* Máx. runtime */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Máx. bombeamento (min)</Label>
              <Input
                type="text" inputMode="decimal"
                value={maxRuntimeStr}
                onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setMaxRuntimeStr(v); }}
                placeholder="Ex: 3"
                className="text-xl font-bold text-center h-12"
              />
            </div>

            {/* Descanso */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Descanso entre ciclos (min)</Label>
              <Input
                type="text" inputMode="decimal"
                value={restTimeStr}
                onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setRestTimeStr(v); }}
                placeholder="Ex: 30"
                className="text-xl font-bold text-center h-12"
              />
            </div>
          </div>

          {/* Chip derivado */}
          {flowPerPlant > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/8 border border-blue-500/15">
              <Droplets className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="text-xs text-blue-700 dark:text-blue-300">
                <strong>{flowPerPlant.toFixed(1)} ml/min</strong> por planta
                {numOutlets > 0 && ` · ${numOutlets} ${numOutlets === 1 ? "planta" : "plantas"}`}
              </span>
            </div>
          )}

          {/* Botão salvar preset */}
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 text-xs"
            onClick={() => setShowSaveDialog(true)}
            disabled={pumpFlowMlMin <= 0 || numOutlets <= 0}
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            Salvar Bomba como Predefinição
          </Button>

          {/* Lista de presets */}
          {presetsList.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Bombas salvas</p>
              {presetsList.map((preset: any) => (
                <div
                  key={preset.id}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{preset.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {parseFloat(preset.totalFlowMlPerMin).toFixed(0)} ml/min · {preset.numOutlets} saídas ·
                      máx {parseFloat(preset.maxRuntimeMin).toFixed(1)} min · descanso {parseFloat(preset.restTimeBetweenCyclesMin).toFixed(0)} min
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs shrink-0"
                    onClick={() => handleLoadPreset(preset)}
                  >
                    Carregar
                  </Button>
                  <button
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                    onClick={() => setDeleteConfirm({ open: true, id: preset.id, name: preset.name })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── SEÇÃO 2: Configuração da Planta ── */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <Droplets className="w-4 h-4 text-emerald-500" />
            </div>
            <h3 className="font-semibold text-sm text-foreground uppercase tracking-wide">Configuração da Planta</h3>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* Vaso */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Volume do vaso (L)</Label>
              <Input
                type="text" inputMode="decimal"
                value={potSizeStr}
                onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setPotSizeStr(v); }}
                placeholder="11"
                className="text-2xl font-bold text-center h-12"
              />
            </div>

            {/* Fase */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Fase</Label>
              <Select value={phase} onValueChange={(v: "vega" | "flora") => setPhase(v)}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vega">🌿 Vega</SelectItem>
                  <SelectItem value="flora">🌺 Flora</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Semana */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Semana</Label>
              <Select value={String(weekNumber)} onValueChange={(v) => setWeekNumber(parseInt(v))}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((w) => (
                    <SelectItem key={w} value={String(w)}>Sem. {w}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sugestão de volume */}
          <div className="p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/15">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  💡 {getSuggestedLabel(phase, weekNumber)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Para {potSizeLiters > 0 ? `vaso de ${potSizeLiters}L` : "—"}:{" "}
                  <strong>{potSizeLiters > 0 ? (potSizeLiters * 1000 * suggestedPct / 100).toFixed(0) : "—"} ml/planta/dia</strong>
                </p>
              </div>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 shrink-0">{suggestedPct}%</span>
            </div>
          </div>

          {/* Override */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useCustomPct}
                onChange={(e) => setUseCustomPct(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <span className="text-xs text-muted-foreground">Personalizar porcentagem</span>
            </label>
            {useCustomPct && (
              <div className="flex items-center gap-3">
                <Input
                  type="text" inputMode="decimal"
                  value={customPctStr}
                  onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setCustomPctStr(v); }}
                  className="text-xl font-bold text-center h-10 w-24"
                />
                <span className="text-lg font-semibold text-muted-foreground">%</span>
                {potSizeLiters > 0 && (
                  <span className="text-sm text-muted-foreground">
                    = {(potSizeLiters * 1000 * (parseFloat(customPctStr) || 0) / 100).toFixed(0)} ml/planta
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── SEÇÃO 3: Janela de Luz ── */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/15 flex items-center justify-center">
              <Sun className="w-4 h-4 text-yellow-500" />
            </div>
            <h3 className="font-semibold text-sm text-foreground uppercase tracking-wide">Janela de Luz</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">🌅 Hora de acender</Label>
              <Input
                type="time"
                value={lightsOnTime}
                onChange={(e) => setLightsOnTime(e.target.value)}
                className="text-xl font-bold text-center h-12"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">🌙 Hora de apagar</Label>
              <Input
                type="time"
                value={lightsOffTime}
                onChange={(e) => setLightsOffTime(e.target.value)}
                className="text-xl font-bold text-center h-12"
              />
            </div>
          </div>

          {lightsOffMinutes > lightsOnMinutes && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/8 border border-yellow-500/15">
              <Clock className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
              <span className="text-xs text-yellow-700 dark:text-yellow-300">
                Fotoperíodo: <strong>{lightWindowH}h</strong>
                {parseFloat(lightWindowH) >= 18 ? " · Vega (18/6)" : parseFloat(lightWindowH) >= 12 ? " · Flora (12/12)" : ""}
              </span>
            </div>
          )}

          <div className="px-3 py-2.5 rounded-xl bg-muted/30 border border-border/40 text-xs text-muted-foreground space-y-0.5">
            <p className="font-semibold text-foreground/70">Boas práticas embutidas:</p>
            <p>• 1º ciclo: {lightsOnTime ? minutesToTimeString(lightsOnMinutes + 90) : "—"} (1,5h após acender)</p>
            <p>• Último ciclo até: {lightsOffTime ? minutesToTimeString(lightsOffMinutes - 120) : "—"} (2h antes de apagar)</p>
          </div>
        </CardContent>
      </Card>

      {/* ── RESULTADO ── */}
      {result && (
        <Card className="border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/50 dark:to-cyan-950/50">
          <CardContent className="p-5 space-y-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <Timer className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-bold text-base text-foreground">Cronograma de Rega</h3>
            </div>

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-900/30 border border-amber-400/50">
                <div className="flex gap-2 items-start">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <ul className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
                    {result.warnings.map((w, i) => <li key={i}>⚠️ {w}</li>)}
                  </ul>
                </div>
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Ciclos/dia", value: String(result.numCycles), icon: "🔄" },
                { label: "Duração/ciclo", value: `${result.durationPerCycleSec}s`, sub: `${result.durationPerCycleMin.toFixed(2)} min`, icon: "⏱️" },
                { label: "ml/ciclo/planta", value: `${result.mlPerCyclePerPlant.toFixed(0)} ml`, icon: "💧" },
                { label: "Volume diário/planta", value: `${result.dailyVolumePerPlantMl.toFixed(0)} ml`, icon: "🪣" },
                { label: "Volume total", value: `${result.totalDailyVolumeMl.toFixed(0)} ml`, sub: `${numOutlets} plantas`, icon: "📊" },
                { label: "Drenagem esperada", value: `~${result.expectedRunoffMlPerPlant.toFixed(0)} ml`, sub: "17,5%/planta", icon: "🌊" },
              ].map((stat) => (
                <div key={stat.label} className="p-2.5 rounded-xl bg-background/70 border border-border/40 text-center">
                  <p className="text-base mb-0.5">{stat.icon}</p>
                  <p className="text-base font-black text-foreground leading-tight">{stat.value}</p>
                  {stat.sub && <p className="text-[10px] text-muted-foreground leading-tight">{stat.sub}</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Tabela de horários */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Horários dos ciclos</p>
              <div className="rounded-xl border border-border/50 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground text-xs">
                      <th className="text-left px-3 py-2 font-semibold">Ciclo</th>
                      <th className="text-left px-3 py-2 font-semibold">Horário</th>
                      <th className="text-right px-3 py-2 font-semibold">Duração</th>
                      <th className="text-right px-3 py-2 font-semibold">ml/planta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.schedule.map((cycle, idx) => (
                      <tr
                        key={cycle.cycleNumber}
                        className={`border-t border-border/30 ${idx % 2 === 0 ? "bg-background/40" : "bg-muted/10"}`}
                      >
                        <td className="px-3 py-2.5 text-muted-foreground font-medium">#{cycle.cycleNumber}</td>
                        <td className="px-3 py-2.5">
                          <span className="font-mono font-bold text-foreground text-base">{cycle.startTimeFormatted}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-semibold text-foreground">{cycle.durationSec}s</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-semibold text-blue-600 dark:text-blue-400">{cycle.mlPerPlant} ml</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Exportar */}
            <Button
              onClick={handleExportTxt}
              variant="outline"
              className="w-full gap-2 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50"
            >
              <Download className="w-4 h-4" />
              Exportar Cronograma (TXT)
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Placeholder quando não há resultado */}
      {!result && (
        <div className="flex flex-col items-center justify-center py-10 px-6 rounded-2xl border border-dashed border-border/50 bg-muted/10 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Timer className="w-7 h-7 text-blue-500/60" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-foreground">Preencha os dados acima</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              O cronograma aparece automaticamente conforme você preenche os campos.
            </p>
          </div>
        </div>
      )}

      {/* ── Dialog: Salvar Preset ── */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar Predefinição de Bomba</DialogTitle>
            <DialogDescription>
              Salve as configurações desta bomba para reutilizar depois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome da predefinição</Label>
              <Input
                placeholder="Ex: Bomba Principal, Bomba Pequena..."
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
              />
            </div>
            <div className="p-3 rounded-xl bg-muted/40 border border-border/40 text-xs text-muted-foreground space-y-1">
              <p>• Vazão: <strong>{pumpFlowMlMin} ml/min</strong> · {numOutlets} saídas</p>
              <p>• Máx. bombeamento: <strong>{maxRuntimeMin} min</strong></p>
              <p>• Descanso: <strong>{restTimeBetweenMin} min</strong></p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>Cancelar</Button>
            <Button onClick={handleSavePreset} disabled={createPreset.isPending}>
              {createPreset.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Confirmar exclusão ── */}
      <Dialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover predefinição</DialogTitle>
            <DialogDescription>
              Deseja remover <strong>{deleteConfirm.name}</strong>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm({ open: false, id: 0, name: "" })}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deletePreset.isPending}
              onClick={() => deletePreset.mutate({ id: deleteConfirm.id })}
            >
              {deletePreset.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
