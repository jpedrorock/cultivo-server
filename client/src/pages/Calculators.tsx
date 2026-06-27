import { useState, useEffect } from "react";
import React from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, Droplets, Download, AlertCircle, CheckCircle2, Target, Lightbulb, Sprout, Mountain, FlaskConical } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PageTransition } from "@/components/PageTransition";
import { CalcSlider } from "@/components/ui/calc-slider";
import { CalcEyebrow, CalcRunning } from "@/components/ui/calc-helpers";

// Funções de exportação de receitas (não usadas atualmente, mantidas para futuro)
function _exportIrrigationRecipe(potVolume: string, substrate: string, result: { volume: number; frequency: string }) {
  const substrateNames: Record<string, string> = {
    soil: "Solo/Terra",
    coco: "Fibra de Coco",
    hidro: "Hidroponia"
  };

  const content = `
===========================================
       RECEITA DE REGA - APP CULTIVO
===========================================

DATA: ${new Date().toLocaleDateString('pt-BR')}

PARÂMETROS:
- Volume do vaso: ${potVolume}L
- Tipo de substrato: ${substrateNames[substrate] || substrate}

RESULTADO:
- Volume por rega: ${result.volume}L
- Frequência: ${result.frequency}

DICA:
Regue até ver 10-20% de drenagem no fundo do vaso
para evitar acúmulo de sais.

===========================================
  `;

  downloadTextFile(content, `receita-rega-${Date.now()}.txt`);
}

function _exportFertilizationRecipe(waterVolume: string, targetEC: string, result: { calciumNitrate: number; potassiumNitrate: number; mkp: number; magnesiumSulfate: number; micronutrients: number; totalPPM: number }) {
  const content = `
===========================================
   RECEITA DE FERTILIZAÇÃO - APP CULTIVO
===========================================

DATA: ${new Date().toLocaleDateString('pt-BR')}

PARÂMETROS:
- Volume de preparo: ${waterVolume}L
- EC desejado: ${targetEC} mS/cm
- PPM aproximado: ${result.totalPPM} ppm

RECEITA (g/L):
- Nitrato de Cálcio: ${result.calciumNitrate} g/L
- Nitrato de Potássio: ${result.potassiumNitrate} g/L
- MKP (Fosfato Monopotássico): ${result.mkp} g/L
- Sulfato de Magnésio: ${result.magnesiumSulfate} g/L
- Micronutrientes: ${result.micronutrients} g/L

QUANTIDADES TOTAIS:
- Nitrato de Cálcio: ${(result.calciumNitrate * parseFloat(waterVolume)).toFixed(2)} g
- Nitrato de Potássio: ${(result.potassiumNitrate * parseFloat(waterVolume)).toFixed(2)} g
- MKP: ${(result.mkp * parseFloat(waterVolume)).toFixed(2)} g
- Sulfato de Magnésio: ${(result.magnesiumSulfate * parseFloat(waterVolume)).toFixed(2)} g
- Micronutrientes: ${(result.micronutrients * parseFloat(waterVolume)).toFixed(2)} g

DICA:
Dissolva cada reagente separadamente e misture na ordem:
Cálcio → Potássio → MKP → Magnésio → Micronutrientes

===========================================
  `;

  downloadTextFile(content, `receita-fertilizacao-${Date.now()}.txt`);
}

function exportLuxPPFDRecipe(lux: string, lightType: string, result: number) {
  const lightTypeNames: Record<string, string> = {
    "led-white": "LED Branco",
    "led-full-spectrum": "LED Full Spectrum",
    "hps": "HPS (Alta Pressão de Sódio)",
    "mh": "MH (Metal Halide)",
    "sunlight": "Luz Solar"
  };

  const content = `
===========================================
   CONVERSÃO LUX → PPFD - APP CULTIVO
===========================================

DATA: ${new Date().toLocaleDateString('pt-BR')}

PARÂMETROS:
- Leitura em Lux: ${lux}
- Tipo de luz: ${lightTypeNames[lightType] || lightType}

RESULTADO:
- PPFD estimado: ${result} µmol/m²/s

REFERÊNCIAS DE PPFD POR FASE:
- Clonagem: 100-200 µmol/m²/s
- Vegetativa: 400-600 µmol/m²/s
- Floração: 600-900 µmol/m²/s
- Máximo: 1000-1200 µmol/m²/s

DICA:
Esta é uma estimativa. Para medições precisas,
use um medidor PPFD (quantum sensor).

===========================================
  `;

  downloadTextFile(content, `conversao-lux-ppfd-${Date.now()}.txt`);
}

function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

import { lazy, Suspense, useCallback } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useRoute, useLocation, Redirect } from "wouter";
import { ArrowLeft, Clock as ClockIcon, Bookmark } from "lucide-react";
import { useTactileFeedback } from "@/hooks/useTactileFeedback";

// ── Calc history hook ─────────────────────────────────────────────────────────
interface CalcEntry {
  id: string;
  label: string;
  result: string;
  at: string; // ISO
}

function useCalcHistory(key: string, maxEntries = 10) {
  const storageKey = `calc_history_${key}`;
  const [entries, setEntries] = useState<CalcEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "[]"); } catch { return []; }
  });

  const push = useCallback((label: string, result: string) => {
    setEntries(prev => {
      const next = [{ id: Date.now().toString(), label, result, at: new Date().toISOString() }, ...prev].slice(0, maxEntries);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey, maxEntries]);

  const clear = useCallback(() => {
    localStorage.removeItem(storageKey);
    setEntries([]);
  }, [storageKey]);

  return { entries, push, clear };
}

function CalcHistoryPanel({ entries, onClear }: { entries: CalcEntry[]; onClear: () => void }) {
  if (entries.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <ClockIcon className="w-3.5 h-3.5" /> Histórico
        </p>
        <button onClick={onClear} className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors">Limpar</button>
      </div>
      <div className="space-y-1.5">
        {entries.map(e => (
          <div key={e.id} className="flex items-center justify-between gap-3 text-xs py-1.5 border-b border-border/20 last:border-0">
            <span className="text-muted-foreground/70 truncate flex-1">{e.label}</span>
            <span className="font-semibold text-foreground font-mono">{e.result}</span>
            <span className="text-muted-foreground/40 shrink-0 text-xs">
              {new Date(e.at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Calculadoras pesadas — carregadas sob demanda conforme o id selecionado
const IrrigationScheduleCalculator = lazy(() =>
  import("@/components/IrrigationScheduleCalculator").then((m) => ({ default: m.IrrigationScheduleCalculator }))
);

function CalculatorSkeleton() {
  return (
    <div className="space-y-4 animate-pulse pt-2">
      <div className="h-32 rounded-xl bg-muted/60" />
      <div className="h-24 rounded-xl bg-muted/40" />
      <div className="h-24 rounded-xl bg-muted/40" />
    </div>
  );
}

export default function Calculators() {
  const [, params] = useRoute("/calculators/:id");
  const [, setLocation] = useLocation();
  const calculatorId = params?.id || "irrigation";

  // Redirecionar /calculators/nutrients para /nutrients
  if (calculatorId === "nutrients") {
    return <Redirect to="/nutrients" />;
  }

  const calculatorTitles: Record<string, string> = {
    "watering-runoff": "Rega e Runoff",
    "irrigation-schedule": "Rega Automática",
    "lux-ppfd": "Conversor Lux → PPFD",
    "ppm-ec": "Conversor PPM ↔ EC",
    "ph-adjust": "Calculadora de pH",
    "vpd": "Calculadora VPD",
    "living-soil": "Construtor de Solo Vivo",
    "organic-maintenance": "Manutenção do Solo Vivo",
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
        <div className="container py-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation("/calculators")}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Calculator className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                {calculatorTitles[calculatorId] || "Calculadora"}
              </h1>
              <p className="text-muted-foreground mt-1 text-sm md:text-base">Ferramenta prática para cultivo</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-4 md:py-8 max-w-4xl">
        {calculatorId === "watering-runoff" && <WateringRunoffCalculator />}
        {calculatorId === "irrigation-schedule" && (
          <ErrorBoundary>
            <Suspense fallback={<CalculatorSkeleton />}>
              <IrrigationScheduleCalculator />
            </Suspense>
          </ErrorBoundary>
        )}
        {calculatorId === "lux-ppfd" && <LuxPPFDCalculator />}
        {calculatorId === "ppm-ec" && <PPMECConverter />}
        {calculatorId === "ph-adjust" && <PHAdjustCalculator />}
        {calculatorId === "vpd" && <VPDCalculator />}
        {calculatorId === "living-soil" && <LivingSoilCalculator />}
        {calculatorId === "organic-maintenance" && <OrganicMaintenanceCalculator />}
      </main>
    </div>
    </PageTransition>
  );
}

// Rega e Runoff (Integrado)
function WateringRunoffCalculator() {
  const haptic = useTactileFeedback();
  // Estados para tabs
  const [activeTab, setActiveTab] = useState<"calculator" | "history">("calculator");
  
  // Calculadora de Rega
  const [numPlants, setNumPlants] = useState<number>(4);
  const [potSize, setPotSize] = useState<number>(11);
  const [desiredRunoff, setDesiredRunoff] = useState<number>(20);
  const [lastRunoff, setLastRunoff] = useState<string>("");
  
  // Estados para salvar receita
  const [selectedTent, setSelectedTent] = useState<number | null>(null);
  const [notes, setNotes] = useState<string>("");
  
  // Filtros do histórico
  const [historyTentFilter, setHistoryTentFilter] = useState<string>("all");
  
  // Queries
  const tents = trpc.tents.list.useQuery();
  const applications = trpc.watering.listApplications.useQuery(
    historyTentFilter !== "all"
      ? { tentId: Number(historyTentFilter), limit: 50 }
      : { limit: 50 }
  );
  const saveApplication = trpc.watering.recordApplication.useMutation();
  
  // Calculadora de Runoff
  const [volumeIn, setVolumeIn] = useState<string>("");
  const [volumeOut, setVolumeOut] = useState<string>("");

  // Cálculos da Calculadora de Rega
  const calculateWatering = () => {
    // Volume base por planta (33% da capacidade do vaso)
    const baseVolume = potSize * 0.33;
    
    // Volume com runoff desejado
    const volumeWithRunoff = baseVolume * (1 + desiredRunoff / 100);
    
    // Se forneceu runoff da última rega, ajustar
    let adjustedVolume = volumeWithRunoff;
    let adjustment = "";
    
    if (lastRunoff && parseFloat(lastRunoff) > 0) {
      const lastRunoffNum = parseFloat(lastRunoff);
      const diff = desiredRunoff - lastRunoffNum;
      
      if (Math.abs(diff) > 2) {
        // Ajustar proporcionalmente
        const adjustmentFactor = 1 + (diff / 100);
        adjustedVolume = volumeWithRunoff * adjustmentFactor;
        
        if (diff > 0) {
          adjustment = `Aumentado ${diff.toFixed(1)}% para atingir ${desiredRunoff}%`;
        } else {
          adjustment = `Reduzido ${Math.abs(diff).toFixed(1)}% para atingir ${desiredRunoff}%`;
        }
      }
    }
    
    return {
      baseVolume: volumeWithRunoff.toFixed(2),
      adjustedVolume: adjustedVolume.toFixed(2),
      totalVolume: (adjustedVolume * numPlants).toFixed(2),
      adjustment,
      isAdjusted: !!adjustment
    };
  };

  // Cálculos da Calculadora de Runoff
  const calculateRunoff = () => {
    if (!volumeIn || !volumeOut) return null;
    
    const volIn = parseFloat(volumeIn);
    const volOut = parseFloat(volumeOut);
    
    if (volIn <= 0 || volOut < 0) return null;
    
    const runoffPercent = (volOut / volIn) * 100;
    const diff = runoffPercent - desiredRunoff;
    
    let status: "ideal" | "low" | "high";
    let recommendation: string;

    if (Math.abs(diff) <= 2) {
      status = "ideal";
      recommendation = "Perfeito! Mantenha esse volume.";
    } else if (diff < 0) {
      status = "low";
      recommendation = `Runoff abaixo do ideal. Aumente o volume em aproximadamente ${Math.abs(diff * 2).toFixed(0)}%.`;
    } else {
      status = "high";
      recommendation = `Runoff acima do ideal. Reduza o volume em aproximadamente ${(diff * 2).toFixed(0)}%.`;
    }
    
    return {
      runoffPercent: runoffPercent.toFixed(1),
      status,
      recommendation
    };
  };

  const wateringResult = calculateWatering();
  const runoffResult = calculateRunoff();
  
  const handleSaveRecipe = async () => {
    if (!selectedTent) return;
    
    const result = calculateWatering();
    
    try {
      await saveApplication.mutateAsync({
        tentId: selectedTent,
        cycleId: null,
        recipeName: `Rega ${new Date().toLocaleDateString('pt-BR')}`,
        numberOfPots: numPlants,
        potSizeL: potSize,
        waterPerPotL: parseFloat(result.adjustedVolume),
        totalWaterL: parseFloat(result.totalVolume),
        targetRunoffPercent: desiredRunoff,
        expectedRunoffL: null,
        actualRunoffL: null,
        actualRunoffPercent: lastRunoff ? parseFloat(lastRunoff) : null,
        notes: notes || undefined,
      });
      setNotes("");
      toast.success("Receita salva com sucesso!");
    } catch (_error) {
      toast.error("Erro ao salvar receita");
    }
  };

  // helpers de estilo neon reutilizáveis
  const chipBase = "py-2.5 rounded-xl font-bold text-sm transition-all duration-200 active:scale-95";
  const chipInactive = "bg-card border border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground";

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "calculator" | "history")}>
        <TabsList className="w-full">
          <TabsTrigger value="calculator" className="flex-1">Calculadora</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="calculator" className="space-y-4 mt-4">

          {/* Editorial header */}
          <div>
            <CalcEyebrow text="rega · runoff · volume ideal" />
            <div className="text-2xl font-semibold tracking-tight">Volume de rega.</div>
          </div>

          {/* ── Bloco principal: parâmetros ── */}
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden relative">
            <CalcRunning />
            {/* Header do bloco */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40" style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.12) 0%, rgba(6,182,212,0.05) 100%)' }}>
              <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center shadow-sm">
                <Droplets className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Calculadora de Rega</p>
                <p className="text-xs text-muted-foreground">Volume ideal por vaso e por sessão</p>
              </div>
            </div>

            <div className="p-4 space-y-5">
              {/* Número de plantas */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nº de Plantas</span>
                  <span className="text-xl font-bold text-cyan-400" style={{ textShadow: '0 0 12px rgba(34,211,238,0.5)' }}>{numPlants}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[2, 4, 6, 8].map((n) => (
                    <button key={n} onClick={() => { haptic.tap(); setNumPlants(n); }}
                      className={`${chipBase} ${numPlants === n
                        ? "bg-cyan-500/15 border border-cyan-400/60 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.2)]"
                        : chipInactive}`}>
                      {n}
                    </button>
                  ))}
                </div>
                <Input type="number" inputMode="numeric" placeholder="Outro número..."
                  value={![2,4,6,8].includes(numPlants) ? numPlants : ""}
                  onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) setNumPlants(v); }}
                  className="h-10 text-center font-bold bg-muted/30 border-border/50" />
              </div>

              <div className="h-px bg-border/40" />

              {/* Tamanho do vaso */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tamanho do Vaso</span>
                  <span className="text-xl font-bold text-cyan-400" style={{ textShadow: '0 0 12px rgba(34,211,238,0.5)' }}>{potSize}L</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[5, 11, 20, 50].map((n) => (
                    <button key={n} onClick={() => { haptic.tap(); setPotSize(n); }}
                      className={`${chipBase} ${potSize === n
                        ? "bg-cyan-500/15 border border-cyan-400/60 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.2)]"
                        : chipInactive}`}>
                      {n}L
                    </button>
                  ))}
                </div>
                <Input type="text" inputMode="decimal" placeholder="Outro tamanho (L)..."
                  value={![5,11,20,50].includes(potSize) ? potSize : ""}
                  onChange={(e) => { const raw = e.target.value.replace(",", "."); const v = parseFloat(raw); if (!isNaN(v) && v > 0) setPotSize(v); }}
                  className="h-10 text-center font-bold bg-muted/30 border-border/50" />
              </div>

              <div className="h-px bg-border/40" />

              {/* Runoff desejado */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Runoff Desejado</span>
                  <span className={`text-xl font-bold ${desiredRunoff < 10 ? "text-red-400" : desiredRunoff <= 25 ? "text-emerald-400" : "text-yellow-400"}`}
                    style={{ textShadow: desiredRunoff <= 25 && desiredRunoff >= 10 ? '0 0 12px rgba(74,222,128,0.5)' : undefined }}>
                    {desiredRunoff}%
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[10, 15, 20, 25].map((n) => (
                    <button key={n} onClick={() => { haptic.tap(); setDesiredRunoff(n); }}
                      className={`${chipBase} ${desiredRunoff === n
                        ? "bg-emerald-500/15 border border-emerald-400/60 text-emerald-300 shadow-[0_0_12px_rgba(74,222,128,0.2)]"
                        : chipInactive}`}>
                      {n}%
                      {(n === 15 || n === 20) && <span className="block text-xs font-normal opacity-60">ideal</span>}
                    </button>
                  ))}
                </div>
                <Input type="number" inputMode="numeric" placeholder="Outro %..."
                  value={![10,15,20,25].includes(desiredRunoff) ? desiredRunoff : ""}
                  onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 0) setDesiredRunoff(v); }}
                  className="h-10 text-center font-bold bg-muted/30 border-border/50" />
              </div>

              <div className="h-px bg-border/40" />

              {/* Runoff real opcional */}
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Runoff Real da Última Rega <span className="normal-case font-normal">(opcional)</span></span>
                <Input id="lastRunoff" type="text" inputMode="decimal" placeholder="Ex: 15"
                  value={lastRunoff} onChange={(e) => setLastRunoff(e.target.value)}
                  className="h-10 text-center font-bold bg-muted/30 border-border/50" />
              </div>
            </div>

            {/* Resultado — dentro do mesmo card, separado */}
            <div className="mx-4 mb-4 rounded-xl overflow-hidden border border-cyan-500/20" style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.12) 0%, rgba(6,182,212,0.06) 100%)' }}>
              <div className="px-4 py-2 border-b border-cyan-500/15">
                <p className="mono text-xs font-semibold uppercase tracking-[0.25em] text-cyan-400/80">Resultado</p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-cyan-500/15">
                <div className="p-4 text-center">
                  <p className="mono text-xs text-muted-foreground uppercase tracking-[0.2em] mb-1">Por Planta</p>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="mono text-5xl font-light text-cyan-300" style={{ filter: "drop-shadow(0 0 8px rgba(34,211,238,0.5))" }}>{wateringResult.adjustedVolume}</span>
                    <span className="mono text-sm text-cyan-400/70">L</span>
                  </div>
                </div>
                <div className="p-4 text-center">
                  <p className="mono text-xs text-muted-foreground uppercase tracking-[0.2em] mb-1">Total · {numPlants}pl</p>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="mono text-5xl font-light text-cyan-300" style={{ filter: "drop-shadow(0 0 8px rgba(34,211,238,0.5))" }}>{wateringResult.totalVolume}</span>
                    <span className="mono text-sm text-cyan-400/70">L</span>
                  </div>
                </div>
              </div>
              {wateringResult.adjustment && (
                <div className="mx-3 mb-3 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <p className="text-xs text-yellow-300 flex items-center gap-1"><Target className="w-3 h-3"/> {wateringResult.adjustment}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Verificar Runoff Real ── */}
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40" style={{ background: 'linear-gradient(135deg, rgba(74,222,128,0.10) 0%, rgba(16,185,129,0.04) 100%)' }}>
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm">
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Verificar Runoff Real</p>
                <p className="text-xs text-muted-foreground">Meça o volume coletado e calcule o %</p>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Volume Aplicado</span>
                  <Input id="volumeIn" type="text" inputMode="decimal" placeholder="Ex: 3.5"
                    value={volumeIn} onChange={(e) => setVolumeIn(e.target.value)}
                    className="h-12 text-center text-lg font-bold bg-muted/30 border-border/50" />
                  <p className="text-xs text-center text-muted-foreground">litros (L)</p>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Volume Coletado</span>
                  <Input id="volumeOut" type="text" inputMode="decimal" placeholder="Ex: 0.7"
                    value={volumeOut} onChange={(e) => setVolumeOut(e.target.value)}
                    className="h-12 text-center text-lg font-bold bg-muted/30 border-border/50" />
                  <p className="text-xs text-center text-muted-foreground">litros (L)</p>
                </div>
              </div>

              {runoffResult && (
                <div className={`rounded-xl border p-4 space-y-2 ${
                  runoffResult.status === "ideal"
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-amber-500/10 border-amber-500/30"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {runoffResult.status === "ideal"
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        : <AlertCircle className="w-4 h-4 text-amber-400" />}
                      <span className={`text-sm font-semibold ${runoffResult.status === "ideal" ? "text-emerald-400" : "text-amber-400"}`}>
                        {runoffResult.status === "ideal" ? "Ideal" : "Ajuste Necessário"}
                      </span>
                    </div>
                    <span className={`text-2xl font-bold ${runoffResult.status === "ideal" ? "text-emerald-300" : "text-amber-300"}`}
                      style={{ textShadow: runoffResult.status === "ideal" ? '0 0 16px rgba(74,222,128,0.5)' : '0 0 16px rgba(251,191,36,0.4)' }}>
                      {runoffResult.runoffPercent}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{runoffResult.recommendation}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Salvar Receita ── */}
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.10) 0%, rgba(109,40,217,0.04) 100%)' }}>
              <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shadow-sm">
                <Download className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Salvar Receita</p>
                <p className="text-xs text-muted-foreground">Registre para consulta futura</p>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estufa</span>
                <select className="w-full h-10 px-3 rounded-lg border border-border/50 bg-muted/30 text-sm text-foreground"
                  value={selectedTent || ""} onChange={(e) => setSelectedTent(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Selecione uma estufa</option>
                  {tents.data?.map((tent) => <option key={tent.id} value={tent.id}>{tent.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Observações <span className="normal-case font-normal">(opcional)</span></span>
                <textarea className="w-full px-3 py-2 rounded-lg border border-border/50 bg-muted/30 text-sm min-h-[72px] resize-none text-foreground placeholder:text-muted-foreground/50"
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Ajustado volume devido ao runoff baixo..." />
              </div>
              <Button onClick={handleSaveRecipe} disabled={!selectedTent || saveApplication.isPending}
                className="w-full h-11 bg-violet-700 hover:bg-violet-700 text-white font-semibold shadow-sm border-0">
                {saveApplication.isPending ? "Salvando..." : "Salvar Receita"}
              </Button>
            </div>
          </div>

          {/* ── Dicas ── */}
          <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-yellow-400/80 flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5 text-yellow-400"/>Dicas de Uso</p>
            <p className="text-xs text-muted-foreground"><span className="text-foreground font-medium">Runoff Ideal por fase:</span> Stretch (sem 1–3): 30–50% · Bulking (sem 4–7): 20–30% · Finalização (sem 8+): 20–40%. Muito baixo acumula sais, muito alto desperdiça nutrientes.</p>
            <p className="text-xs text-muted-foreground"><span className="text-foreground font-medium">Ajuste Automático:</span> Informe o runoff da última rega para o sistema corrigir o volume.</p>
          </div>

        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          {/* Filtros */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="history-tent-filter">Estufa</Label>
                <select
                  id="history-tent-filter"
                  className="w-full px-3 py-2 border rounded-lg bg-background"
                  value={historyTentFilter}
                  onChange={(e) => setHistoryTentFilter(e.target.value)}
                >
                  <option value="all">Todas as Estufas</option>
                  {tents.data?.map((tent) => (
                    <option key={tent.id} value={tent.id}>
                      {tent.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="outline"
                onClick={() => setHistoryTentFilter("all")}
                className="self-end"
              >
                Limpar
              </Button>
            </CardContent>
          </Card>

          {/* Histórico */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">
              Histórico ({applications.data?.length || 0})
            </h3>
            {applications.isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Carregando...</p>
            ) : applications.data && applications.data.length > 0 ? (
              <div className="space-y-4">
                {applications.data.map((app: any) => (
                  <Card key={app.id} className="border-l-4 border-l-blue-500">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg flex items-center gap-1.5"><Droplets className="w-4 h-4 text-cyan-400"/>{app.recipeName}</CardTitle>
                          <CardDescription>
                            {new Date(app.applicationDate).toLocaleDateString('pt-BR')}
                          </CardDescription>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-blue-600">{Number(app.totalWaterL).toFixed(2)}L</p>
                          <p className="text-sm text-muted-foreground">Total</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Vasos:</span>
                          <span className="ml-2 font-medium">{app.numberOfPots} x {Number(app.potSizeL).toFixed(0)}L</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Água/vaso:</span>
                          <span className="ml-2 font-medium">{Number(app.waterPerPotL).toFixed(2)}L</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">
                Nenhuma receita encontrada.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}


// Calculadora Lux ↔ PPFD (Bidirecional)
function LuxPPFDCalculator() {
  const [conversionMode, setConversionMode] = useState<"lux-to-ppfd" | "ppfd-to-lux">("lux-to-ppfd");
  const [lux, setLux] = useState<string>("20000");
  const [ppfd, setPpfd] = useState<string>("400");
  const [lightType, setLightType] = useState<string>("led-white");
  const [result, setResult] = useState<number | null>(null);

  const calculate = () => {
    let conversionFactor = 0.015;
    if (lightType === "led-full-spectrum") conversionFactor = 0.017;
    else if (lightType === "hps") conversionFactor = 0.012;
    else if (lightType === "mh") conversionFactor = 0.014;
    else if (lightType === "sunlight") conversionFactor = 0.0185;

    if (conversionMode === "lux-to-ppfd") {
      const luxValue = parseFloat(lux);
      if (isNaN(luxValue) || luxValue <= 0) { setResult(null); return; }
      setResult(Math.round(luxValue * conversionFactor));
    } else {
      const ppfdValue = parseFloat(ppfd);
      if (isNaN(ppfdValue) || ppfdValue <= 0) { setResult(null); return; }
      setResult(Math.round(ppfdValue / conversionFactor));
    }
  };

  useEffect(() => {
    calculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lux, ppfd, lightType, conversionMode]);

  const luxNum = parseInt(lux || "0");
  const ppfdNum = parseInt(ppfd || "0");

  return (
    <div className="space-y-6 pb-8" data-tour="calculator-lux-ppfd">
      {/* Editorial header */}
      <div>
        <CalcEyebrow text="lux → ppfd · conversão de fluxo luminoso" />
        <div className="text-2xl font-semibold tracking-tight">Conversão de fluxo.</div>
      </div>

      {/* Main panel */}
      <div
        className="rounded-2xl border border-border/60 p-6 relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, color-mix(in oklch, var(--color-kpi-ppfd) 5%, var(--card)), var(--card))" }}
      >
        <CalcRunning />

        {/* Mode toggle */}
        <div className="flex gap-1 p-1 rounded-full border border-border w-fit mb-6">
          {([["lux-to-ppfd", "Lux → PPFD"], ["ppfd-to-lux", "PPFD → Lux"]] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => { setConversionMode(k); k === "lux-to-ppfd" ? setPpfd("") : setLux(""); setResult(null); }}
              className={`mono text-xs uppercase tracking-widest px-4 py-1.5 rounded-full transition ${
                conversionMode === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Controls */}
          <div className="space-y-6">
            {conversionMode === "lux-to-ppfd" ? (
              <CalcSlider
                label="Lux medido"
                value={luxNum}
                setValue={(v) => setLux(String(v))}
                min={1000} max={100000} step={500}
                suffix="lux"
                accent="var(--color-kpi-ppfd)"
              />
            ) : (
              <CalcSlider
                label="PPFD medido"
                value={ppfdNum}
                setValue={(v) => setPpfd(String(v))}
                min={50} max={1400} step={10}
                suffix="µmol·m⁻²·s⁻¹"
                accent="var(--color-kpi-ppfd)"
              />
            )}

            {/* Fonte de luz */}
            <div>
              <div className="mono text-xs uppercase tracking-[0.25em] text-muted-foreground mb-2">Fonte de luz</div>
              <div className="grid grid-cols-2 gap-1">
                {([
                  ["led-white",        "LED Branco"],
                  ["led-full-spectrum","LED Full"],
                  ["hps",             "HPS"],
                  ["mh",              "MH"],
                  ["sunlight",        "Solar"],
                ] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setLightType(v)}
                    className={`mono text-xs uppercase tracking-widest py-2 rounded-lg border transition ${
                      lightType === v
                        ? "border-primary text-primary bg-primary/10"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Result */}
          <div className="flex flex-col justify-center">
            <div className="mono text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">
              {conversionMode === "lux-to-ppfd" ? "PPFD" : "Lux"}
            </div>
            {result !== null ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span
                    className="mono text-7xl lg:text-8xl font-light tracking-tight leading-none"
                    style={{ color: "var(--color-kpi-ppfd)", filter: "drop-shadow(0 0 10px var(--color-kpi-ppfd))" }}
                  >
                    {conversionMode === "lux-to-ppfd" ? result : result.toLocaleString("pt-BR")}
                  </span>
                  <span className="mono text-xs text-muted-foreground">
                    {conversionMode === "lux-to-ppfd" ? "µmol·m⁻²·s⁻¹" : "lux"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  estimativa para a fonte selecionada · medição direta com PAR meter é mais precisa.
                </p>
                <Button onClick={() => exportLuxPPFDRecipe(lux, lightType, result)} variant="outline" size="sm" className="mt-4 self-start gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Exportar
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Ajuste o slider para ver o resultado.</p>
            )}
          </div>
        </div>
      </div>

      {/* Reference table */}
      <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-3">
        <p className="mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Referência PPFD por fase</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[["Clonagem", "100–200"], ["Vegetativa", "400–600"], ["Floração", "600–900"], ["Máximo", "1000–1200"]].map(([phase, range]) => (
            <div key={phase} className="bg-muted/40 rounded-lg p-2.5">
              <span className="font-medium block">{phase}</span>
              <span className="mono text-muted-foreground">{range} µmol</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// Calculadora PPM ↔ EC
function PPMECConverter() {
  const [conversionType, setConversionType] = useState<"ppm-to-ec" | "ec-to-ppm">("ppm-to-ec");
  const [scale, setScale] = useState<"500" | "700">("500");
  const [inputValue, setInputValue] = useState<string>("");
  const [result, setResult] = useState<number | null>(null);

  useEffect(() => {
    const value = parseFloat(inputValue);
    if (isNaN(value) || value <= 0) { setResult(null); return; }
    const scaleFactor = scale === "500" ? 500 : 700;
    if (conversionType === "ppm-to-ec") {
      setResult(Math.round((value / scaleFactor) * 100) / 100);
    } else {
      setResult(Math.round(value * scaleFactor));
    }
  }, [inputValue, conversionType, scale]);

  const inputNum = parseFloat(inputValue) || (conversionType === "ppm-to-ec" ? 900 : 1.8);

  return (
    <div className="space-y-6 pb-8" data-tour="calculator-ppm-ec">
      {/* Editorial header */}
      <div>
        <CalcEyebrow text="ppm ↔ ec · solução nutritiva" />
        <div className="text-2xl font-semibold tracking-tight">Solução nutritiva.</div>
      </div>

      {/* Main panel */}
      <div
        className="rounded-2xl border border-border/60 p-6 relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, color-mix(in oklch, var(--primary) 5%, var(--card)), var(--card))" }}
      >
        <CalcRunning />

        {/* Mode toggle */}
        <div className="flex gap-1 p-1 rounded-full border border-border w-fit mb-6">
          {([["ppm-to-ec", "PPM → EC"], ["ec-to-ppm", "EC → PPM"]] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => { setConversionType(k); setInputValue(""); }}
              className={`mono text-xs uppercase tracking-widest px-4 py-1.5 rounded-full transition ${
                conversionType === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Controls */}
          <div className="space-y-6">
            <CalcSlider
              label={conversionType === "ppm-to-ec" ? "PPM" : "EC"}
              value={inputNum}
              setValue={(v) => setInputValue(String(v))}
              min={conversionType === "ppm-to-ec" ? 100 : 0.2}
              max={conversionType === "ppm-to-ec" ? 2500 : 4.0}
              step={conversionType === "ppm-to-ec" ? 10 : 0.05}
              suffix={conversionType === "ppm-to-ec" ? "ppm" : "mS/cm"}
              accent="hsl(var(--primary))"
            />

            {/* Escala */}
            <div>
              <div className="mono text-xs uppercase tracking-[0.25em] text-muted-foreground mb-2">Escala PPM</div>
              <div className="grid grid-cols-2 gap-1">
                {(["500", "700"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setScale(s)}
                    className={`mono text-xs py-2 rounded-lg border transition ${
                      scale === s
                        ? "border-primary text-primary bg-primary/10"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    ×{s} {s === "500" ? "(EU)" : "(US)"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Result */}
          <div className="flex flex-col justify-center">
            <div className="mono text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">
              {conversionType === "ppm-to-ec" ? "EC" : "PPM"}
            </div>
            {result !== null ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span
                    className="mono text-7xl lg:text-8xl font-light tracking-tight leading-none"
                    style={{ color: "hsl(var(--primary))", filter: "drop-shadow(0 0 8px hsl(var(--primary)))" }}
                  >
                    {conversionType === "ppm-to-ec" ? result.toFixed(2) : Math.round(result)}
                  </span>
                  <span className="mono text-sm text-muted-foreground">
                    {conversionType === "ppm-to-ec" ? "mS/cm" : `ppm ×${scale}`}
                  </span>
                </div>
                <p className="mono text-xs text-muted-foreground mt-3">
                  Veg: 1.8–2.2 EC · Flora: 2.5–3.2 EC · Flush: ~1.0 EC
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Ajuste o slider para ver o resultado.</p>
            )}
          </div>
        </div>
      </div>

      {/* Reference table */}
      <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-3">
        <p className="mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Tabela de referência — Escala ×{scale}</p>
        <div className="space-y-2 text-xs">
          {[
            ["Clonagem",              "0.4–0.8 EC", scale === "500" ? "200–400" : "280–560"],
            ["Vegetativo",            "1.8–2.2 EC", scale === "500" ? "900–1100" : "1260–1540"],
            ["Floração Stretch/Bulk", "2.5–3.2 EC", scale === "500" ? "1250–1600" : "1750–2240"],
            ["Floração Finalização",  "~1.0 EC",    scale === "500" ? "~500" : "~700"],
            ["Flush Final",           "0–0.4 EC",   scale === "500" ? "0–200" : "0–280"],
          ].map(([phase, ec, ppm]) => (
            <div key={phase} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
              <span className="text-muted-foreground">{phase}</span>
              <div className="flex items-center gap-3 text-right">
                <span className="mono font-medium text-foreground">{ec}</span>
                <span className="mono text-muted-foreground/60">{ppm} ppm</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// Calculadora de Ajuste de pH
function PHAdjustCalculator() {
  const [waterVolume, setWaterVolume] = useState<string>("");
  const [currentPH, setCurrentPH] = useState<number>(7.0);
  const [targetPH, setTargetPH] = useState<number>(6.2);
  const [result, setResult] = useState<{ amount: number; product: string } | null>(null);
  const { entries: phHistory, push: pushPh, clear: clearPh } = useCalcHistory("ph-adjust");

  const getPHColor = (ph: number) => {
    if (ph < 4) return "#dc2626";
    if (ph < 5.5) return "#f97316";
    if (ph < 6.5) return "#eab308";
    if (ph < 7.5) return "#22c55e";
    if (ph < 9) return "#3b82f6";
    return "#8b5cf6";
  };

  const getPHLabel = (ph: number) => {
    if (ph < 4) return "Muito Ácido";
    if (ph < 5.5) return "Ácido";
    if (ph < 6.5) return "Levemente Ácido";
    if (ph < 7.5) return "Neutro";
    if (ph < 9) return "Alcalino";
    return "Muito Alcalino";
  };

  useEffect(() => {
    const volume = parseFloat(waterVolume);
    if (isNaN(volume) || volume <= 0) { setResult(null); return; }

    const phDifference = Math.abs(currentPH - targetPH);
    if (phDifference < 0.05) { setResult(null); return; }

    const needsDecrease = currentPH > targetPH;
    let mlPerLiter: number;
    let productName: string;

    if (needsDecrease) {
      mlPerLiter = 0.2;
      productName = "pH Down (Ácido Fosfórico 85%)";
    } else {
      mlPerLiter = 0.25;
      productName = "pH Up (Hidróxido de Potássio)";
    }

    const totalML = phDifference * mlPerLiter * volume;
    setResult({ amount: Math.round(totalML * 10) / 10, product: productName });
  }, [waterVolume, currentPH, targetPH]);

  return (
    <div className="space-y-6 pb-8">
      {/* Editorial header */}
      <div>
        <CalcEyebrow text="ph · ajuste de solução" />
        <div className="text-2xl font-semibold tracking-tight">Equilíbrio químico.</div>
      </div>

      {/* Main panel */}
      <div
        className="rounded-2xl border border-border/60 p-6 relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, color-mix(in oklch, var(--primary) 5%, var(--card)), var(--card))" }}
      >
        <CalcRunning />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Controls */}
          <div className="space-y-6">
            {/* Volume */}
            <div>
              <div className="mono text-xs uppercase tracking-[0.25em] text-muted-foreground mb-2">Volume de água</div>
              <Input
                id="waterVolumePH"
                type="text"
                inputMode="decimal"
                placeholder="Ex: 10"
                value={waterVolume}
                onChange={(e) => setWaterVolume(e.target.value)}
                className="mono text-xl h-12 font-bold text-center"
              />
              <p className="mono text-xs text-muted-foreground/60 text-center mt-1">litros (L)</p>
            </div>

            {/* pH atual */}
            <CalcSlider
              label="pH atual"
              value={currentPH}
              setValue={setCurrentPH}
              min={0} max={14} step={0.1}
              suffix={getPHLabel(currentPH)}
              accent={getPHColor(currentPH)}
            />

            {/* pH alvo */}
            <CalcSlider
              label="pH alvo"
              value={targetPH}
              setValue={setTargetPH}
              min={0} max={14} step={0.1}
              suffix={getPHLabel(targetPH)}
              accent={getPHColor(targetPH)}
            />
          </div>

          {/* Result */}
          <div className="flex flex-col justify-center">
            {result ? (
              <>
                <div className="mono text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">
                  {currentPH > targetPH ? "pH Down" : "pH Up"}
                </div>
                <div className="flex items-baseline gap-2">
                  <span
                    className="mono text-7xl lg:text-8xl font-light tracking-tight leading-none"
                    style={{ color: getPHColor(targetPH), filter: "drop-shadow(0 0 8px currentColor)" }}
                  >
                    {result.amount}
                  </span>
                  <span className="mono text-base text-muted-foreground">ml</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{result.product}</p>
                <p className="text-xs text-muted-foreground/60 mt-2 leading-relaxed">
                  Adicione aos poucos, misture bem e meça novamente.
                </p>
                <button
                  onClick={() => { pushPh(`${waterVolume}L · pH ${currentPH.toFixed(1)}→${targetPH.toFixed(1)}`, `${result.amount} ml ${currentPH > targetPH ? 'pH Down' : 'pH Up'}`); toast.success('Salvo no histórico!'); }}
                  className="mt-4 self-start flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary border border-border/40 hover:border-primary/40 rounded-lg px-3 py-1.5 transition-colors"
                >
                  <Bookmark className="w-3.5 h-3.5" /> Salvar
                </button>
              </>
            ) : (
              <div className="space-y-2">
                <div className="mono text-xs uppercase tracking-[0.3em] text-muted-foreground">pH atual → alvo</div>
                <div className="flex items-baseline gap-3">
                  <span className="mono text-5xl font-light" style={{ color: getPHColor(currentPH) }}>{currentPH.toFixed(1)}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="mono text-5xl font-light" style={{ color: getPHColor(targetPH) }}>{targetPH.toFixed(1)}</span>
                </div>
                <p className="text-xs text-muted-foreground">Informe o volume de água para calcular a dose.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reference table */}
      <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-3">
        <p className="mono text-xs uppercase tracking-[0.25em] text-muted-foreground">pH ideal por substrato</p>
        <div className="space-y-2 text-xs">
          {[["Solo/Terra", "6.0–7.0"], ["Fibra de Coco", "5.5–6.5"], ["Hidroponia", "5.5–6.0"]].map(([sub, range]) => (
            <div key={sub} className="flex justify-between py-1.5 border-b border-border/20 last:border-0">
              <span className="text-muted-foreground">{sub}</span>
              <span className="mono font-medium">{range}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground/60">pH fora da faixa bloqueia absorção mesmo com fertilização adequada.</p>
      </div>

      <CalcHistoryPanel entries={phHistory} onClear={clearPh} />
    </div>
  );
}

// ── VPD Calculator ────────────────────────────────────────────────────────────
function VPDCalculator() {
  const [tempC, setTempC] = useState(25);
  const [rh, setRh] = useState(60);
  const { entries: vpdHistory, push: pushVpd, clear: clearVpd } = useCalcHistory("vpd");

  // SVP(T) = 0.6108 × e^(17.27×T / (T+237.3))
  const svp = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
  const tLeaf = tempC - 2; // leaf temp ≈ air − 2°C
  const vpd = svp(tLeaf) * (1 - rh / 100);
  const vpdFixed = Math.max(0, vpd).toFixed(2);

  type Zone = { min: number; max: number; label: string; sub: string; color: string; textColor: string; borderColor: string };
  const zones: Zone[] = [
    { min: 0,    max: 0.4,  label: "Risco de Mofo",    sub: "VPD muito baixo — ventile mais",        color: "bg-red-500/15",    textColor: "text-red-400",    borderColor: "border-red-500/30" },
    { min: 0.4,  max: 0.8,  label: "Mudas / Clones",   sub: "Zona segura para plantas jovens",        color: "bg-yellow-500/15", textColor: "text-yellow-400", borderColor: "border-yellow-500/30" },
    { min: 0.8,  max: 1.2,  label: "Ideal — Vegetativa", sub: "Ótimo para vega e crescimento",         color: "bg-emerald-500/15", textColor: "text-emerald-400", borderColor: "border-emerald-500/30" },
    { min: 1.0,  max: 1.5,  label: "Ideal — Floração",  sub: "Ótimo para flora e produção",           color: "bg-green-500/15",  textColor: "text-green-400",  borderColor: "border-green-500/30" },
    { min: 1.5,  max: 99,   label: "Estresse Hídrico",  sub: "VPD alto — plantas perdem água rápido", color: "bg-red-500/15",    textColor: "text-red-400",    borderColor: "border-red-500/30" },
  ];

  const vpdNum = parseFloat(vpdFixed);
  // Pick best matching zone — if multiple overlap (0.8-1.2 vs 1.0-1.5) prefer the more specific range
  const activeZone = zones.slice().reverse().find(z => vpdNum >= z.min && vpdNum < z.max) ?? zones[zones.length - 1];

  const haptic = useTactileFeedback();

  // ── Referência por fase do ciclo — VPD ideal sobe ao longo do cultivo ──
  type RefPhase = "mudas" | "vega" | "flora";
  const PHASE_TARGET: Record<RefPhase, { min: number; max: number; label: string }> = {
    mudas: { min: 0.4, max: 0.8, label: "Mudas" },
    vega: { min: 0.8, max: 1.2, label: "Vegetativa" },
    flora: { min: 1.2, max: 1.5, label: "Floração" },
  };
  const [refPhase, setRefPhase] = useState<RefPhase>("vega");
  const [refTentId, setRefTentId] = useState<number | null>(null);
  const { data: activeCycles } = trpc.cycles.getActiveCyclesWithProgress.useQuery(undefined, { staleTime: 60_000 });
  const cycleToRef = (p: string): RefPhase =>
    p === "CLONING" ? "mudas" : (p === "FLORA" || p === "PRE_FLORA") ? "flora" : "vega";
  const refTent = (activeCycles as any[] | undefined)?.find((c) => c.tentId === refTentId) ?? null;
  const pickRefTent = (id: number | null) => {
    setRefTentId(id);
    const c = (activeCycles as any[] | undefined)?.find((t) => t.tentId === id);
    if (c) setRefPhase(cycleToRef(c.phase));
  };
  const phaseLabelPt = (p: string) =>
    p === "FLORA" ? "Floração" : p === "PRE_FLORA" ? "Pré-flora" : p === "CLONING" ? "Clonagem" : p === "MAINTENANCE" ? "Manutenção" : "Vegetativa";
  const target = PHASE_TARGET[refPhase];
  const verdict = vpdNum < target.min
    ? { txt: "Abaixo do alvo — muito úmido", tone: "text-blue-400 border-blue-500/30 bg-blue-500/10", arrow: "↓" }
    : vpdNum > target.max
      ? { txt: "Acima do alvo — ar seco", tone: "text-amber-400 border-amber-500/30 bg-amber-500/10", arrow: "↑" }
      : { txt: "No alvo", tone: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", arrow: "✓" };

  return (
    <div className="space-y-6 pb-8">
      {/* Editorial header */}
      <div>
        <CalcEyebrow text="vpd · vapor pressure deficit" />
        <div className="text-2xl font-semibold tracking-tight">Pressão de vapor.</div>
      </div>

      {/* Main panel — sliders + result side by side */}
      <div
        className="rounded-2xl border border-border/60 p-6 relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, color-mix(in oklch, var(--primary) 5%, var(--card)), var(--card))" }}
      >
        <CalcRunning />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Controls */}
          <div className="space-y-6">
            <CalcSlider
              label="Temperatura do ar"
              value={tempC}
              setValue={(v) => { setTempC(v); haptic.tap(); }}
              min={15} max={35} step={0.5}
              suffix="°C"
              accent="var(--color-kpi-temp)"
            />
            <CalcSlider
              label="Umidade relativa"
              value={rh}
              setValue={(v) => { setRh(v); haptic.tap(); }}
              min={20} max={90} step={1}
              suffix="%"
              accent="var(--color-kpi-rh)"
            />
            <div className="rounded-xl bg-muted/30 border border-border/40 px-4 py-2.5 flex justify-between text-xs text-muted-foreground">
              <span>Temp. folha estimada</span>
              <span className="mono font-semibold text-foreground">{tLeaf.toFixed(1)}°C</span>
            </div>
          </div>

          {/* Result */}
          <div className="flex flex-col justify-center">
            <div className="mono text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">VPD</div>
            <div className="flex items-baseline gap-2">
              <span
                className={`mono text-7xl lg:text-8xl font-light tracking-tight leading-none ${activeZone.textColor}`}
                style={{ filter: "drop-shadow(0 0 10px currentColor)" }}
              >
                {vpdFixed}
              </span>
              <span className="mono text-base text-muted-foreground">kPa</span>
            </div>
            <div className={`mt-4 inline-flex items-center self-start gap-1.5 px-3 py-1.5 rounded-full text-xs mono uppercase tracking-widest border ${activeZone.color} ${activeZone.borderColor} ${activeZone.textColor}`}>
              ▸ {activeZone.label}
            </div>
            <p className="text-xs text-muted-foreground mt-2">{activeZone.sub}</p>
          </div>
        </div>
      </div>

      {/* Referência pra fase do ciclo */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tá bom pra fase?</p>
          {(activeCycles as any[] | undefined)?.length ? (
            <select
              value={refTentId ?? ""}
              onChange={(e) => pickRefTent(e.target.value ? parseInt(e.target.value) : null)}
              className="text-xs bg-muted/30 border border-border/40 rounded-lg px-2 py-1 text-foreground max-w-[160px]"
            >
              <option value="">Puxar da estufa…</option>
              {(activeCycles as any[]).map((c) => (
                <option key={c.tentId} value={c.tentId}>{c.tentName}</option>
              ))}
            </select>
          ) : null}
        </div>

        {/* Toggle de fase */}
        <div className="grid grid-cols-3 gap-2">
          {(["mudas", "vega", "flora"] as RefPhase[]).map((p) => (
            <button
              key={p}
              onClick={() => { setRefPhase(p); setRefTentId(null); haptic.tap(); }}
              className={`py-2 rounded-xl text-xs font-medium border transition-colors ${refPhase === p ? "bg-primary/15 border-primary/40 text-primary" : "border-border/40 text-muted-foreground hover:text-foreground"}`}
            >
              {PHASE_TARGET[p].label}
            </button>
          ))}
        </div>

        {refTent && (
          <p className="text-xs text-muted-foreground">
            {refTent.tentName} · {phaseLabelPt(refTent.phase)} · semana {refTent.currentWeek}
          </p>
        )}

        {/* Veredito */}
        <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${verdict.tone}`}>
          <div>
            <p className="text-sm font-bold">{verdict.arrow} {verdict.txt}</p>
            <p className="text-xs opacity-80">Alvo {target.label}: {target.min.toFixed(1)}–{target.max.toFixed(1)} kPa</p>
          </div>
          <span className="mono text-lg font-bold">{vpdFixed}</span>
        </div>
      </div>

      {/* Save to history */}
      <button
        onClick={() => { pushVpd(`${tempC}°C / ${rh}% UR`, `${vpdFixed} kPa — ${activeZone.label}`); toast.success('Salvo no histórico!'); }}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border/40 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
      >
        <Bookmark className="w-4 h-4" /> Salvar no histórico
      </button>

      {/* Zone guide */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Guia de Zonas VPD</p>
        {[
          { range: "< 0.4 kPa",    label: "Risco de Mofo",     color: "bg-red-500", tip: "Muito úmido — aumentar ventilação" },
          { range: "0.4–0.8 kPa",  label: "Mudas / Clones",    color: "bg-yellow-500", tip: "OK para plantas jovens" },
          { range: "0.8–1.2 kPa",  label: "Vegetativa",        color: "bg-emerald-500", tip: "Zona ideal para vega" },
          { range: "1.0–1.5 kPa",  label: "Floração",          color: "bg-green-400", tip: "Zona ideal para flora" },
          { range: "> 1.5 kPa",    label: "Estresse Hídrico",  color: "bg-red-500", tip: "Umidificar ou reduzir temperatura" },
        ].map((z) => (
          <div key={z.range} className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${z.color} shrink-0`} />
            <span className="text-xs font-medium text-foreground w-28 shrink-0">{z.range}</span>
            <span className="text-xs text-muted-foreground">{z.label} — {z.tip}</span>
          </div>
        ))}
      </div>

      {/* 2D VPD reference grid */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tabela de Referência VPD (kPa)</p>
        <p className="text-xs text-muted-foreground/60">Temperatura do ar × Umidade Relativa</p>
        {(() => {
          const temps = [18, 20, 22, 24, 26, 28, 30];
          const rhs = [40, 50, 60, 70, 80];
          const svp = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
          const vpdCell = (t: number, rh: number) => (svp(t - 2) * (1 - rh / 100)).toFixed(2);
          const cellColor = (v: number) => {
            if (v < 0.4) return "bg-red-500/20 text-red-400";
            if (v < 0.8) return "bg-yellow-500/20 text-yellow-500";
            if (v < 1.0) return "bg-emerald-500/20 text-emerald-400";
            if (v < 1.5) return "bg-green-500/20 text-green-400";
            return "bg-orange-500/20 text-orange-400";
          };
          return (
            <div className="overflow-x-auto">
              <table className="w-full text-center text-xs">
                <thead>
                  <tr>
                    <th className="py-1 pr-2 text-muted-foreground font-normal text-left">UR \ T</th>
                    {temps.map(t => (
                      <th key={t} className={`px-1 py-1 font-semibold ${t === tempC ? 'text-orange-400' : 'text-muted-foreground'}`}>{t}°</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rhs.map(r => (
                    <tr key={r}>
                      <td className={`py-1 pr-2 font-semibold text-left ${r === rh ? 'text-teal-400' : 'text-muted-foreground'}`}>{r}%</td>
                      {temps.map(t => {
                        const v = parseFloat(vpdCell(t, r));
                        const isActive = t === tempC && r === rh;
                        return (
                          <td key={t} className={`px-0.5 py-0.5`}>
                            <span className={`inline-block w-full rounded px-1 py-0.5 tabular-nums font-medium ${cellColor(v)} ${isActive ? 'ring-2 ring-white/30' : ''}`}>
                              {v}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500/40 inline-block"/>{'< 0.4 Risco mofo'}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-yellow-500/40 inline-block"/>0.4–0.8 Mudas</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/40 inline-block"/>0.8–1.0 Vega</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500/40 inline-block"/>1.0–1.5 Flora</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-500/40 inline-block"/>{'> 1.5 Estresse'}</span>
        </div>
      </div>

      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 text-xs text-muted-foreground space-y-1">
        <p><strong className="text-foreground">Fórmula:</strong> SVP(T) = 0.6108 × e<sup>17.27T/(T+237.3)</sup></p>
        <p>VPD = SVP(T<sub>folha</sub>) × (1 − UR/100) &nbsp;·&nbsp; T<sub>folha</sub> ≈ T<sub>ar</sub> − 2°C</p>
      </div>

      <CalcHistoryPanel entries={vpdHistory} onClear={clearVpd} />
    </div>
  );
}

// ─── Construtor de Solo Vivo (Cultivo Orgânico Fase 2) ─────────────────────────
// Receita Clackamas Coots (living soil) escalada pelo volume total de solo.
// Mostra base mix (turfa/aeração/húmus) + amendments em GRAMAS e em CUPS/pé³.
// Valores de referência da comunidade (clackamascoots.com) — ver
// ORGANIC-AMENDMENTS-REFERENCES.md. NÃO são prescrição: o grower ajusta.
function LivingSoilCalculator() {
  const haptic = useTactileFeedback();
  const [potSize, setPotSize] = useState<number>(30); // litros por vaso
  const [numPots, setNumPots] = useState<number>(4);

  const volumeL = Math.max(1, potSize * numPots);
  const FT3_L = 28.3168; // litros por pé cúbico
  const ft3 = volumeL / FT3_L;

  // Base mix Coots: 1/3 turfa + 1/3 aeração + 1/3 húmus (do volume total).
  const baseThird = volumeL / 3;

  // Amendments por pé³ (cups) + densidade aproximada (g/cup) pra converter.
  const AMENDMENTS = [
    { name: "Farinha de alga (kelp)", cupsPerFt3: 1, gPerCup: 60, hint: "K + micronutrientes" },
    { name: "Farinha de neem", cupsPerFt3: 1, gPerCup: 60, hint: "N + proteção" },
    { name: "Calcário / casca de ostra", cupsPerFt3: 1, gPerCup: 200, hint: "Cálcio · pH" },
    { name: "Gesso agrícola (gypsum)", cupsPerFt3: 0.5, gPerCup: 200, hint: "Ca + enxofre" },
    { name: "Pó de rocha (basalto)", cupsPerFt3: 3, gPerCup: 250, hint: "Remineralização" },
  ];

  const fmtG = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`);
  const fmtCups = (c: number) => (c < 0.1 ? "—" : c < 1 ? `${c.toFixed(2)}` : c.toFixed(1));

  return (
    <div className="space-y-6">
      {/* Headline editorial */}
      <div>
        <CalcEyebrow text="Solo Vivo · Receita Coots" />
        <h2 className="text-2xl font-bold text-foreground">Construtor de Solo Vivo</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Monte seu super soil / living soil de uma vez. Informe o volume e veja a lista de compras
          escalada — em gramas e em cups (pé³).
        </p>
      </div>

      {/* Entrada: vaso × quantidade */}
      <Card className="relative overflow-hidden">
        <CalcRunning />
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mountain className="w-4 h-4 text-primary" /> Volume de solo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <CalcSlider label="Tamanho do vaso" value={potSize} setValue={(v) => { haptic.tap(); setPotSize(v); }} min={1} max={100} step={1} suffix="L" accent="var(--color-primary, #22c55e)" />
          <CalcSlider label="Número de vasos" value={numPots} setValue={(v) => { haptic.tap(); setNumPots(v); }} min={1} max={50} step={1} suffix="vasos" accent="var(--color-primary, #22c55e)" />
          <div className="flex items-baseline justify-between rounded-xl bg-primary/8 border border-primary/20 px-4 py-3">
            <span className="text-sm text-muted-foreground">Volume total de solo</span>
            <span className="mono text-2xl font-bold text-primary">{volumeL.toLocaleString("pt-BR")} L</span>
          </div>
        </CardContent>
      </Card>

      {/* Base mix */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sprout className="w-4 h-4 text-emerald-500" /> Base do solo (⅓ cada)
          </CardTitle>
          <CardDescription>Misture por volume — é a estrutura "viva" do solo.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {[
              { n: "Turfa (peat)", d: "retém água" },
              { n: "Aeração", d: "pumice/perlita" },
              { n: "Húmus", d: "vermicomposto" },
            ].map((b) => (
              <div key={b.n} className="rounded-xl border border-border bg-card px-3 py-3 text-center">
                <div className="mono text-xl font-bold text-foreground">{Math.round(baseThird)} L</div>
                <div className="text-xs font-medium text-foreground mt-1">{b.n}</div>
                <div className="text-[10px] text-muted-foreground">{b.d}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Amendments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="w-4 h-4 text-amber-500" /> Amendments (misturar tudo)
          </CardTitle>
          <CardDescription>Para {volumeL} L de solo ({ft3.toFixed(1)} pé³).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {AMENDMENTS.map((a) => {
              const cups = a.cupsPerFt3 * ft3;
              const grams = cups * a.gPerCup;
              return (
                <div key={a.name} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{a.name}</p>
                    <p className="text-[11px] text-muted-foreground">{a.hint}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="mono text-base font-bold text-foreground">{fmtG(grams)}</span>
                    <span className="mono text-xs text-muted-foreground ml-1.5">≈ {fmtCups(cups)} cup</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Como usar + disclaimer */}
      <div className="rounded-xl bg-muted/40 border border-border p-4 space-y-2.5 text-sm text-muted-foreground">
        <p className="flex items-start gap-2">
          <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <span>Misture base + amendments e deixe <strong className="text-foreground">curtir 2–4 semanas</strong> úmido antes de plantar. Depois é só manter com top dressing + chá de compostagem.</span>
        </p>
        <p className="text-xs leading-relaxed">
          Valores de referência da receita <strong>Clackamas Coots</strong> (comunidade living soil). A densidade dos pós varia — ajuste ao seu gosto. Cups são aproximados (1 pé³ = 28,3 L).
        </p>
      </div>
    </div>
  );
}

// ─── Manutenção do Solo Vivo (Cultivo Orgânico Fase 3) ─────────────────────────
// 2 abas: Chá de Compostagem (AACT, escalado pelo balde) + Top Dressing (guia +
// quantidades por vaso). Valores de referência da comunidade (AACT + Coots) —
// ver ORGANIC-AMENDMENTS-REFERENCES.md. NÃO é prescrição.
function OrganicMaintenanceCalculator() {
  const haptic = useTactileFeedback();
  const [tab, setTab] = useState<"tea" | "topdress">("tea");

  // ── Chá de compostagem (AACT) — base por balde de 19 L (5 gal) ──────────────
  const [bucketL, setBucketL] = useState<number>(19);
  const teaScale = bucketL / 19;
  const tea = {
    castings: 225 * teaScale, // g de húmus de minhoca
    molasses: 45 * teaScale, // ml de melaço (blackstrap)
    kelp: 15 * teaScale, // g de farinha de alga
  };

  // ── Top dressing — por vaso ──────────────────────────────────────────────────
  const [potL, setPotL] = useState<number>(30);
  const [phase, setPhase] = useState<"veg" | "flora">("veg");
  // Referência: top dress leve a cada 2-3 semanas. Veg = N (alfafa/húmus),
  // Flora = P-K (kelp/guano). ~g por litro de vaso (conservador).
  const topdress = phase === "veg"
    ? [
        { name: "Húmus de minhoca", gPerL: 8, hint: "camada fina na superfície" },
        { name: "Farinha de alfafa", gPerL: 0.6, hint: "N + triacontanol" },
        { name: "Farinha de neem", gPerL: 0.5, hint: "N + proteção" },
      ]
    : [
        { name: "Húmus de minhoca", gPerL: 8, hint: "camada fina na superfície" },
        { name: "Farinha de alga (kelp)", gPerL: 1.0, hint: "K + floração" },
        { name: "Guano de morcego (flora)", gPerL: 0.8, hint: "P-K alto" },
      ];

  const fmtG = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`);
  const fmtMl = (ml: number) => `${Math.round(ml)} ml`;

  return (
    <div className="space-y-6">
      <div>
        <CalcEyebrow text="Solo Vivo · Manutenção" />
        <h2 className="text-2xl font-bold text-foreground">Manutenção do Solo Vivo</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Depois do solo montado, você alimenta o solo (não a planta): chá de compostagem + top dressing.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "tea" | "topdress")}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="tea">Chá de Compostagem</TabsTrigger>
          <TabsTrigger value="topdress">Top Dressing</TabsTrigger>
        </TabsList>

        {/* ── Aba: Chá de compostagem ── */}
        <TabsContent value="tea" className="space-y-5 mt-4">
          <Card className="relative overflow-hidden">
            <CalcRunning />
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Droplets className="w-4 h-4 text-primary" /> Volume do balde
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <CalcSlider label="Volume de água" value={bucketL} setValue={(v) => { haptic.tap(); setBucketL(v); }} min={5} max={100} step={1} suffix="L" accent="var(--color-primary, #22c55e)" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Receita (AACT) para {bucketL} L</CardTitle>
              <CardDescription>Chá aerado — vida microbiana viva.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {[
                  { n: "Húmus de minhoca (em saquinho)", v: fmtG(tea.castings), h: "fonte de micróbios" },
                  { n: "Melaço (blackstrap, sem enxofre)", v: fmtMl(tea.molasses), h: "alimenta os micróbios" },
                  { n: "Farinha de alga (kelp)", v: fmtG(tea.kelp), h: "hormônios + micronutrientes" },
                ].map((r) => (
                  <div key={r.n} className="flex items-center justify-between py-2.5 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{r.n}</p>
                      <p className="text-[11px] text-muted-foreground">{r.h}</p>
                    </div>
                    <span className="mono text-base font-bold text-foreground shrink-0">{r.v}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="rounded-xl bg-muted/40 border border-border p-4 space-y-2 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span><strong className="text-foreground">Aere 24–48h</strong> com bomba de ar + pedra porosa. <strong className="text-foreground">Use em até 36h</strong> após o fim (os micróbios morrem sem oxigênio). Regue o solo direto.</span>
            </p>
            <p className="text-xs">Não use água clorada (mata a vida). Deixe descansar 24h ou use filtro.</p>
          </div>
        </TabsContent>

        {/* ── Aba: Top dressing ── */}
        <TabsContent value="topdress" className="space-y-5 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mountain className="w-4 h-4 text-primary" /> Vaso e fase
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <CalcSlider label="Tamanho do vaso" value={potL} setValue={(v) => { haptic.tap(); setPotL(v); }} min={5} max={100} step={1} suffix="L" accent="var(--color-primary, #22c55e)" />
              <div className="grid grid-cols-2 gap-2">
                {([["veg", "Vegetativa"], ["flora", "Floração"]] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => { haptic.tap(); setPhase(k); }}
                    className={`px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                      phase === k ? "bg-primary/15 border-primary/50 text-primary" : "bg-card border-border text-muted-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top dress por vaso ({potL} L · {phase === "veg" ? "Veg" : "Flora"})</CardTitle>
              <CardDescription>Espalhe na superfície e regue. Repita a cada 2–3 semanas.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {topdress.map((a) => (
                  <div key={a.name} className="flex items-center justify-between py-2.5 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{a.name}</p>
                      <p className="text-[11px] text-muted-foreground">{a.hint}</p>
                    </div>
                    <span className="mono text-base font-bold text-foreground shrink-0">{fmtG(a.gPerL * potL)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="rounded-xl bg-muted/40 border border-border p-4 space-y-2 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>Veg pede mais <strong className="text-foreground">N</strong>; flora pede mais <strong className="text-foreground">P-K</strong>. <strong className="text-foreground">Pare na semana 4–5 de flora</strong> (deixa ~1 mês pro solo consumir antes da colheita).</span>
            </p>
            <p className="text-xs">Cubra o top dress com uma fina camada de palha/mulch pra proteger os micróbios. Valores de referência — ajuste à resposta da planta.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
