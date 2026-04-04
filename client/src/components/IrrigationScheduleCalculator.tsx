import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
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
  Leaf, Flower2, Lightbulb, Bot, MapPin, Sunrise, Moon, Sparkles,
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

interface SubCycle {
  subNumber: number;
  startTimeFormatted: string;
  durationSec: number;
  mlPerPlant: number;
}

const MASTER_COLORS = [
  { bg: "bg-blue-500/10",    border: "border-blue-400/40",    text: "text-blue-700 dark:text-blue-300",    dot: "bg-blue-500"    },
  { bg: "bg-emerald-500/10", border: "border-emerald-400/40", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  { bg: "bg-amber-500/10",   border: "border-amber-400/40",   text: "text-amber-700 dark:text-amber-300",   dot: "bg-amber-500"   },
  { bg: "bg-purple-500/10",  border: "border-purple-400/40",  text: "text-purple-700 dark:text-purple-300",  dot: "bg-purple-500"  },
] as const;

interface MasterEntry {
  masterNumber: number;
  masterTime: string;
  colorIdx: number;
  subCycles: SubCycle[];
  totalMlPerPlant: number;
  totalSessionMinutes: number;
}

interface IrrigationResult {
  flowPerPlantMlMin: number;
  dailyVolumePerPlantMl: number;
  totalDailyVolumeMl: number;
  numMasters: number;
  maxSubCyclesPerMaster: number;
  durationPerCycleSec: number;
  mlPerCyclePerPlant: number;
  masters: MasterEntry[];
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
// Função auxiliar: constrói masters com sub-ciclos
// ─────────────────────────────────────────────

function buildMasters(
  masterTimeStrings: string[],
  pumpFlowMlMin: number,
  numOutlets: number,
  maxRuntimeMin: number,
  restTimeBetweenMin: number,
  totalDailyVolumeMl: number,
  dailyVolumePerPlantMl: number,
): MasterEntry[] {
  const numMasters = masterTimeStrings.length;
  const volPerMaster = totalDailyVolumeMl / numMasters;
  const maxVolPerRun = maxRuntimeMin * pumpFlowMlMin;

  return masterTimeStrings.map((timeStr, idx) => {
    const masterStartMin = parseTimeToMinutes(timeStr);
    const numSubs = Math.max(1, Math.ceil(volPerMaster / maxVolPerRun));
    const totalMlPerPlant = dailyVolumePerPlantMl / numMasters;

    const subCycles: SubCycle[] = [];
    let remaining = volPerMaster;

    for (let s = 0; s < numSubs; s++) {
      const volThisRun = Math.min(maxVolPerRun, remaining);
      const durSec = Math.round((volThisRun / pumpFlowMlMin) * 60);
      const mlPerPlant = Math.round(volThisRun / numOutlets);
      const startMin = masterStartMin + s * (maxRuntimeMin + restTimeBetweenMin);

      subCycles.push({
        subNumber: s + 1,
        startTimeFormatted: minutesToTimeString(startMin % 1440),
        durationSec: durSec,
        mlPerPlant,
      });

      remaining -= volThisRun;
      if (remaining <= 0) break;
    }

    const totalSessionMinutes = subCycles.length > 1
      ? (subCycles.length - 1) * (maxRuntimeMin + restTimeBetweenMin) + (subCycles[subCycles.length - 1].durationSec / 60)
      : subCycles[0].durationSec / 60;

    return {
      masterNumber: idx + 1,
      masterTime: timeStr,
      colorIdx: idx % MASTER_COLORS.length,
      subCycles,
      totalMlPerPlant: Math.round(totalMlPerPlant),
      totalSessionMinutes,
    };
  });
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
    potSizeLiters <= 0 || targetPct <= 0
  ) return null;

  const warnings: string[] = [];

  // Suporte a janela de luz que cruza meia-noite (ex: 18:00 → 12:00 do dia seguinte)
  const effectiveLightsOffMinutes =
    lightsOffMinutes <= lightsOnMinutes
      ? lightsOffMinutes + 1440
      : lightsOffMinutes;

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
  const lastCycleLatestMin = effectiveLightsOffMinutes - 120;
  const availableWindowMin = lastCycleLatestMin - firstCycleStartMin;

  if (availableWindowMin < 60) {
    warnings.push(
      "Janela de luz muito curta. Precisa de pelo menos 3h50min entre acender e apagar as luzes para 2+ ciclos."
    );
  }

  // 6. Número de masters (máx 4, "números bonitos")
  const niceNumbers = [2, 3, 4];
  let numMasters = Math.max(1, minCyclesByRuntime);
  for (const n of niceNumbers) {
    if (n >= minCyclesByRuntime) { numMasters = n; break; }
  }
  if (minCyclesByRuntime > niceNumbers[niceNumbers.length - 1]) {
    numMasters = 4;
    warnings.push(
      `Volume diário elevado para essa bomba. Usando 4 masters/dia com múltiplos sub-ciclos em cada.`
    );
  }

  // 7. Duração do maior sub-ciclo (referência para o display)
  const volPerMaster = totalDailyVolumeMl / numMasters;
  const maxVolPerRun = maxRuntimeMin * pumpFlowMlMin;
  const maxSubCyclesPerMaster = Math.max(1, Math.ceil(volPerMaster / maxVolPerRun));
  const durationPerCycleSec = Math.round(Math.min(volPerMaster, maxVolPerRun) / pumpFlowMlMin * 60);
  const mlPerCyclePerPlant = (dailyVolumePerPlantMl / numMasters) / maxSubCyclesPerMaster;

  // 8. Validar intervalo de descanso entre masters
  if (numMasters > 1) {
    const intervalBetween = availableWindowMin / (numMasters - 1);
    const sessionMin = maxSubCyclesPerMaster * maxRuntimeMin + (maxSubCyclesPerMaster - 1) * restTimeBetweenMin;
    if (intervalBetween < sessionMin + restTimeBetweenMin) {
      warnings.push(
        `Intervalo entre masters (~${intervalBetween.toFixed(0)} min) pode ser insuficiente para o descanso da bomba.`
      );
    }
  }

  // 9. Construir horários dos masters e sub-ciclos
  const masterTimeStrings: string[] = [];
  for (let i = 0; i < numMasters; i++) {
    const startMin = numMasters === 1
      ? firstCycleStartMin
      : firstCycleStartMin + (i * (availableWindowMin / (numMasters - 1)));
    masterTimeStrings.push(minutesToTimeString(Math.round(startMin) % 1440));
  }

  const masters = buildMasters(masterTimeStrings, pumpFlowMlMin, numOutlets, maxRuntimeMin, restTimeBetweenMin, totalDailyVolumeMl, dailyVolumePerPlantMl);

  // 10. Drenagem esperada (boas práticas: ~17,5%)
  const expectedRunoffMlPerPlant = dailyVolumePerPlantMl * 0.175;

  return {
    flowPerPlantMlMin,
    dailyVolumePerPlantMl,
    totalDailyVolumeMl,
    numMasters,
    maxSubCyclesPerMaster,
    durationPerCycleSec,
    mlPerCyclePerPlant,
    masters,
    expectedRunoffMlPerPlant,
    availableWindowMin,
    warnings,
  };
}

// ─────────────────────────────────────────────
// Cálculo para modo de horários fixos (manual)
// ─────────────────────────────────────────────

function calculateManualSchedule(
  input: IrrigationInput,
  manualTimes: string[],
): IrrigationResult | null {
  const { pumpFlowMlMin, numOutlets, maxRuntimeMin, restTimeBetweenMin, potSizeLiters, targetPct } = input;

  if (pumpFlowMlMin <= 0 || numOutlets <= 0 || maxRuntimeMin <= 0 || potSizeLiters <= 0 || targetPct <= 0) return null;

  const validTimes = manualTimes.filter(Boolean);
  if (validTimes.length === 0) return null;

  const warnings: string[] = [];

  const flowPerPlantMlMin = pumpFlowMlMin / numOutlets;
  const dailyVolumePerPlantMl = potSizeLiters * 1000 * targetPct / 100;
  const totalDailyVolumeMl = dailyVolumePerPlantMl * numOutlets;
  const numMasters = validTimes.length;

  const volPerMaster = totalDailyVolumeMl / numMasters;
  const maxVolPerRun = maxRuntimeMin * pumpFlowMlMin;
  const maxSubCyclesPerMaster = Math.max(1, Math.ceil(volPerMaster / maxVolPerRun));
  const durationPerCycleSec = Math.round(Math.min(volPerMaster, maxVolPerRun) / pumpFlowMlMin * 60);
  const mlPerCyclePerPlant = (dailyVolumePerPlantMl / numMasters) / maxSubCyclesPerMaster;
  const expectedRunoffMlPerPlant = dailyVolumePerPlantMl * 0.175;

  // Verificar intervalo mínimo entre masters consecutivos
  const sortedMinutes = [...validTimes.map(parseTimeToMinutes)].sort((a, b) => a - b);
  for (let i = 1; i < sortedMinutes.length; i++) {
    const gap = sortedMinutes[i] - sortedMinutes[i - 1];
    const sessionMin = maxSubCyclesPerMaster * maxRuntimeMin + (maxSubCyclesPerMaster - 1) * restTimeBetweenMin;
    if (gap < sessionMin + restTimeBetweenMin) {
      warnings.push(
        `Intervalo entre masters ${i} e ${i + 1} (~${gap.toFixed(0)} min) pode ser insuficiente.`
      );
    }
  }

  // Ordenar horários e construir masters
  const sortedTimes = [...validTimes].sort((a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b));
  const masters = buildMasters(sortedTimes, pumpFlowMlMin, numOutlets, maxRuntimeMin, restTimeBetweenMin, totalDailyVolumeMl, dailyVolumePerPlantMl);

  return {
    flowPerPlantMlMin,
    dailyVolumePerPlantMl,
    totalDailyVolumeMl,
    numMasters,
    maxSubCyclesPerMaster,
    durationPerCycleSec,
    mlPerCyclePerPlant,
    masters,
    expectedRunoffMlPerPlant,
    availableWindowMin: 0,
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
  const [pumpFlowStr, setPumpFlowStr] = useState("200");
  const [outletsStr, setOutletsStr] = useState("8");
  const [maxRuntimeStr, setMaxRuntimeStr] = useState("3");
  const [restTimeStr, setRestTimeStr] = useState("30");

  // ── Planta ──
  const [potSizeStr, setPotSizeStr] = useState("5");
  const [phase, setPhase] = useState<"vega" | "flora">("vega");
  const [weekNumber, setWeekNumber] = useState(3);

  // ── Luz ──
  const [scheduleMode, setScheduleMode] = useState<"auto" | "manual">("auto");
  const [lightsOnTime, setLightsOnTime] = useState("18:00");
  const [lightsOffTime, setLightsOffTime] = useState("12:00");
  const [manualTimes, setManualTimes] = useState<string[]>(["08:00", "12:00", "18:00"]);

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
      toast.success(`Bomba "${presetName}" salva!`);
      setShowSaveDialog(false);
      setPresetName("");
    },
    onError: (e) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  const deletePreset = trpc.pumpPresets.delete.useMutation({
    onSuccess: () => {
      utils.pumpPresets.list.invalidate();
      toast.success("Predefinição removida");
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
  const effectiveLightsOffMin = lightsOffMinutes <= lightsOnMinutes ? lightsOffMinutes + 1440 : lightsOffMinutes;
  const lightWindowH = ((effectiveLightsOffMin - lightsOnMinutes) / 60).toFixed(1);

  // ── Cálculo principal ──
  const baseInput = { pumpFlowMlMin, numOutlets, maxRuntimeMin, restTimeBetweenMin, potSizeLiters, targetPct, lightsOnMinutes, lightsOffMinutes };
  const result = useMemo(() =>
    scheduleMode === "manual"
      ? calculateManualSchedule(baseInput, manualTimes)
      : calculateIrrigationSchedule(baseInput),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [pumpFlowMlMin, numOutlets, maxRuntimeMin, restTimeBetweenMin,
   potSizeLiters, targetPct, lightsOnMinutes, lightsOffMinutes,
   scheduleMode, manualTimes]);

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
      `Masters por dia:      ${result.numMasters}`,
      `Sub-ciclos/master:    ${result.maxSubCyclesPerMaster}`,
      `Duração sub-ciclo:    ${result.durationPerCycleSec}s`,
      `ml/master/planta:     ${result.masters[0]?.totalMlPerPlant ?? "—"} ml`,
      `Volume diário/planta: ${result.dailyVolumePerPlantMl.toFixed(0)} ml`,
      `Volume total:         ${result.totalDailyVolumeMl.toFixed(0)} ml (${numOutlets} plantas)`,
      `Drenagem esperada:    ~${result.expectedRunoffMlPerPlant.toFixed(0)} ml/planta (17,5%)`,
      "",
      "── CRONOGRAMA ──────────────────────────",
      ...result.masters.flatMap(master => [
        ``,
        `  ▶ MASTER ${master.masterNumber} — ${master.masterTime}  (${master.totalMlPerPlant} ml/planta)`,
        ...master.subCycles.map(sub =>
          `      #${sub.subNumber}  ${sub.startTimeFormatted}    ${String(sub.durationSec).padStart(4)}s   ${String(sub.mlPerPlant).padStart(5)} ml/planta`
        ),
      ]),
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
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40" style={{ background: 'linear-gradient(135deg, rgba(96,165,250,0.12) 0%, rgba(59,130,246,0.05) 100%)' }}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/30">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Configuração da Bomba</p>
            <p className="text-[11px] text-muted-foreground">Vazão, saídas e ciclos</p>
          </div>
        </div>
        <div className="p-4 space-y-4">

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
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-400/20">
              <Droplets className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-xs text-blue-300">
                <strong>{flowPerPlant.toFixed(1)} ml/min</strong> por planta
                {numOutlets > 0 && ` · ${numOutlets} ${numOutlets === 1 ? "planta" : "plantas"}`}
              </span>
            </div>
          )}

          {/* Botão salvar preset */}
          <Button variant="outline" size="sm" className="w-full gap-2 text-xs border-border/50 hover:border-blue-400/40 hover:text-blue-300"
            onClick={() => setShowSaveDialog(true)} disabled={pumpFlowMlMin <= 0 || numOutlets <= 0}>
            <BookmarkPlus className="w-3.5 h-3.5" />
            Salvar Bomba como Predefinição
          </Button>

          {/* Lista de presets */}
          {presetsList.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Bombas salvas</p>
              {presetsList.map((preset: any) => (
                <div key={preset.id} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{preset.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {parseFloat(preset.totalFlowMlPerMin).toFixed(0)} ml/min · {preset.numOutlets} saídas · máx {parseFloat(preset.maxRuntimeMin).toFixed(1)} min · descanso {parseFloat(preset.restTimeBetweenCyclesMin).toFixed(0)} min
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs shrink-0 border-border/40" onClick={() => handleLoadPreset(preset)}>Carregar</Button>
                  <button className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                    onClick={() => setDeleteConfirm({ open: true, id: preset.id, name: preset.name })}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── SEÇÃO 2: Configuração da Planta ── */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40" style={{ background: 'linear-gradient(135deg, rgba(74,222,128,0.10) 0%, rgba(16,185,129,0.04) 100%)' }}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-900/30">
            <Droplets className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Configuração da Planta</p>
            <p className="text-[11px] text-muted-foreground">Vaso, fase e volume alvo</p>
          </div>
        </div>
        <div className="p-4 space-y-4">

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
                  <SelectItem value="vega"><span className="flex items-center gap-1"><Leaf className="w-3.5 h-3.5 text-green-400"/>Vega</span></SelectItem>
                  <SelectItem value="flora"><span className="flex items-center gap-1"><Flower2 className="w-3.5 h-3.5 text-purple-400"/>Flora</span></SelectItem>
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
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-400/20">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5 text-yellow-400"/> {getSuggestedLabel(phase, weekNumber)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Para {potSizeLiters > 0 ? `vaso de ${potSizeLiters}L` : "—"}:{" "}
                  <strong className="text-foreground">{potSizeLiters > 0 ? (potSizeLiters * 1000 * suggestedPct / 100).toFixed(0) : "—"} ml/planta/dia</strong>
                </p>
              </div>
              <span className="text-2xl font-black text-emerald-400 shrink-0" style={{ textShadow: '0 0 12px rgba(74,222,128,0.5)' }}>{suggestedPct}%</span>
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
        </div>
      </div>

      {/* ── SEÇÃO 3: Janela de Luz ── */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.10) 0%, rgba(202,138,4,0.04) 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center shadow-lg shadow-yellow-900/30">
              <Sun className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Janela de Luz</p>
              <p className="text-[11px] text-muted-foreground">Fotoperíodo e horários</p>
            </div>
          </div>
          {/* Toggle modo */}
          <div className="flex rounded-lg border border-border/50 overflow-hidden text-xs font-semibold shrink-0">
            <button onClick={() => setScheduleMode("auto")}
              className={`px-3 py-1.5 transition-colors ${scheduleMode === "auto" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}>
              <span className="flex items-center gap-1"><Bot className="w-3.5 h-3.5"/>Auto</span>
            </button>
            <button onClick={() => setScheduleMode("manual")}
              className={`px-3 py-1.5 transition-colors ${scheduleMode === "manual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}>
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5"/>Fixo</span>
            </button>
          </div>
        </div>
        <div className="p-4 space-y-4">

          {/* Luzes ligam/apagam — sempre visível */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><Sunrise className="w-3.5 h-3.5 text-orange-400"/>Hora de acender</Label>
              <Input
                type="time"
                value={lightsOnTime}
                onChange={(e) => setLightsOnTime(e.target.value)}
                className="text-xl font-bold text-center h-12"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><Moon className="w-3.5 h-3.5 text-blue-400"/>Hora de apagar</Label>
              <Input
                type="time"
                value={lightsOffTime}
                onChange={(e) => setLightsOffTime(e.target.value)}
                className="text-xl font-bold text-center h-12"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-400/20">
            <Clock className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            <span className="text-xs text-yellow-300">
              Fotoperíodo: <strong>{lightWindowH}h</strong>
              {parseFloat(lightWindowH) >= 18 ? " · Vega (18/6)" : parseFloat(lightWindowH) >= 12 ? " · Flora (12/12)" : ""}
            </span>
          </div>

          {/* ── Modo Automático ── */}
          {scheduleMode === "auto" && (
            <div className="px-3 py-2.5 rounded-xl bg-muted/20 border border-border/40 text-xs text-muted-foreground space-y-0.5">
              <p className="font-semibold text-foreground/70">Boas práticas embutidas:</p>
              <p>• 1º ciclo: {lightsOnTime ? minutesToTimeString(lightsOnMinutes + 90) : "—"} (1,5h após acender)</p>
              <p>• Último ciclo até: {minutesToTimeString(effectiveLightsOffMin - 120)} (2h antes de apagar)</p>
              <p>• Horários calculados automaticamente dentro desta janela</p>
            </div>
          )}

          {/* ── Modo Fixo ── */}
          {scheduleMode === "manual" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Horários fixos (máx. 4)</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs gap-1.5 text-primary hover:text-primary"
                  onClick={() => {
                    // Auto-sugerir horários baseados na janela de luz
                    const first = lightsOnMinutes + 90;
                    const last = effectiveLightsOffMin - 120;
                    const n = 4;
                    const step = (last - first) / (n - 1);
                    const suggested = Array.from({ length: n }, (_, i) =>
                      minutesToTimeString(Math.round(first + i * step))
                    );
                    setManualTimes(suggested);
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5"/> Sugerir ideais
                </Button>
              </div>

              {manualTimes.map((t, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground w-5 shrink-0 text-right">{idx + 1}.</span>
                  <Input
                    type="time"
                    value={t}
                    onChange={(e) => {
                      const updated = [...manualTimes];
                      updated[idx] = e.target.value;
                      setManualTimes(updated);
                    }}
                    className="text-xl font-bold text-center h-12 flex-1"
                  />
                  {manualTimes.length > 1 && (
                    <button
                      onClick={() => setManualTimes(manualTimes.filter((_, i) => i !== idx))}
                      className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}

              {manualTimes.length < 4 && (
                <button
                  onClick={() => setManualTimes([...manualTimes, minutesToTimeString(lightsOnMinutes + 90)])}
                  className="w-full h-10 rounded-xl border-2 border-dashed border-border/50 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center gap-1.5"
                >
                  + Adicionar horário
                </button>
              )}

              <div className="px-3 py-2 rounded-xl bg-muted/30 border border-border/40 text-xs text-muted-foreground">
                <p>O volume diário ({potSizeLiters > 0 ? `${(potSizeLiters * 1000 * targetPct / 100).toFixed(0)} ml/planta` : "—"}) será dividido igualmente entre os {manualTimes.length} horário{manualTimes.length > 1 ? "s" : ""}.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── RESULTADO ── */}
      {result && (
        <div className="rounded-2xl border border-cyan-500/30 bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-cyan-500/20" style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.12) 0%, rgba(6,182,212,0.05) 100%)' }}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/30">
              <Timer className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Cronograma de Rega</p>
              <p className="text-[11px] text-muted-foreground">Resultado calculado</p>
            </div>
          </div>
          <div className="p-4 space-y-5">

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/30">
                <div className="flex gap-2 items-start">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <ul className="text-xs text-amber-300 space-y-1">
                    {result.warnings.map((w, i) => <li key={i} className="flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5"/>{w}</li>)}
                  </ul>
                </div>
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Masters/dia", value: String(result.numMasters), sub: undefined, color: "cyan" },
                { label: "Sub-ciclos", value: String(result.maxSubCyclesPerMaster), sub: result.maxSubCyclesPerMaster > 1 ? `${(result.maxSubCyclesPerMaster * maxRuntimeMin + (result.maxSubCyclesPerMaster - 1) * restTimeBetweenMin).toFixed(0)}min/sessão` : undefined, color: "blue" },
                { label: "Duração/ciclo", value: `${result.durationPerCycleSec}s`, sub: `≤${maxRuntimeMin}min`, color: "violet" },
                { label: "ml/master/pla.", value: `${result.masters[0]?.totalMlPerPlant ?? "—"}ml`, sub: undefined, color: "teal" },
                { label: "Vol. diário/pla.", value: `${result.dailyVolumePerPlantMl.toFixed(0)}ml`, sub: undefined, color: "emerald" },
                { label: "Drenagem esp.", value: `~${result.expectedRunoffMlPerPlant.toFixed(0)}ml`, sub: "17,5%/pla.", color: "green" },
              ].map((stat) => (
                <div key={stat.label} className="p-2.5 rounded-xl bg-muted/30 border border-border/40 text-center">
                  <p className="text-base font-black text-cyan-300 leading-tight" style={{ textShadow: '0 0 10px rgba(34,211,238,0.4)' }}>{stat.value}</p>
                  {stat.sub && <p className="text-[10px] text-muted-foreground leading-tight">{stat.sub}</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Tabela de masters com sub-ciclos */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cronograma por master</p>
              <div className="space-y-2">
                {result.masters.map((master) => {
                  const c = MASTER_COLORS[master.colorIdx];
                  const singleSub = master.subCycles.length === 1;
                  return (
                    <div key={master.masterNumber} className={`rounded-xl border ${c.border} overflow-hidden`}>
                      {/* Header do master */}
                      <div className={`flex items-center justify-between px-3 py-2 ${c.bg}`}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${c.dot} shrink-0`} />
                          <span className={`text-sm font-bold ${c.text}`}>
                            Master {master.masterNumber}
                          </span>
                          <span className="font-mono font-black text-foreground text-base">
                            {master.masterTime}
                          </span>
                        </div>
                        <div className={`text-right text-xs ${c.text}`}>
                          <span className="font-semibold">{master.totalMlPerPlant} ml/planta</span>
                          {!singleSub && (
                            <span className="ml-2 opacity-70">· {master.subCycles.length} sub-ciclos</span>
                          )}
                        </div>
                      </div>

                      {/* Sub-ciclos */}
                      {singleSub ? (
                        /* Linha única inline quando só 1 sub-ciclo */
                        <div className="flex items-center justify-between px-3 py-2 bg-background/60">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-foreground">{master.subCycles[0].startTimeFormatted}</span>
                            <span className="text-muted-foreground/50 text-xs">–</span>
                            <span className="font-mono font-bold text-foreground">
                              {minutesToTimeString((parseTimeToMinutes(master.subCycles[0].startTimeFormatted) + master.subCycles[0].durationSec / 60) % 1440)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="font-bold text-foreground">{master.subCycles[0].durationSec}s</span>
                            <span className={`font-semibold ${c.text}`}>{master.subCycles[0].mlPerPlant} ml</span>
                          </div>
                        </div>
                      ) : (
                        /* Múltiplos sub-ciclos */
                        <div className="divide-y divide-border/30">
                          {master.subCycles.map((sub, sidx) => (
                            <div
                              key={sub.subNumber}
                              className={`flex items-center justify-between px-3 py-2 ${sidx % 2 === 0 ? "bg-background/60" : "bg-muted/10"}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.bg} ${c.text} shrink-0`}>
                                  #{sub.subNumber}
                                </span>
                                <span className="font-mono font-bold text-foreground">{sub.startTimeFormatted}</span>
                                <span className="text-muted-foreground/50 text-xs">–</span>
                                <span className="font-mono font-bold text-foreground">
                                  {minutesToTimeString((parseTimeToMinutes(sub.startTimeFormatted) + sub.durationSec / 60) % 1440)}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-sm">
                                <span className="font-bold text-foreground">{sub.durationSec}s</span>
                                <span className={`font-semibold ${c.text}`}>{sub.mlPerPlant} ml</span>
                              </div>
                            </div>
                          ))}
                          {/* Linha de total da sessão */}
                          <div className={`flex items-center justify-between px-3 py-1.5 ${c.bg}`}>
                            <span className={`text-[11px] font-semibold ${c.text}`}>
                              Total sessão: ~{master.totalSessionMinutes.toFixed(0)} min
                            </span>
                            <span className={`text-[11px] font-bold ${c.text}`}>
                              {master.totalMlPerPlant} ml/planta
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Exportar */}
            <Button onClick={handleExportTxt} variant="outline"
              className="w-full gap-2 border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-400/50">
              <Download className="w-4 h-4" />
              Exportar Cronograma (TXT)
            </Button>
          </div>
        </div>
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
