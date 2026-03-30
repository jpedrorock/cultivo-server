import { useState, useEffect } from "react";
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, Droplets, Sprout, Sun, Download, AlertCircle, CheckCircle2, Target, Lightbulb, AlertTriangle, BarChart2, ClipboardList } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PageTransition } from "@/components/PageTransition";
import { RangeSlider } from "@/components/ui/range-slider";

// Funções de exportação de receitas
function exportIrrigationRecipe(potVolume: string, substrate: string, result: { volume: number; frequency: string }) {
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

function exportFertilizationRecipe(waterVolume: string, targetEC: string, _unused: string, result: { calciumNitrate: number; potassiumNitrate: number; mkp: number; magnesiumSulfate: number; micronutrients: number; totalPPM: number }) {
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

import { useRoute, useLocation, Redirect } from "wouter";
import { ArrowLeft } from "lucide-react";
import { FertilizationCalculator } from "@/components/FertilizationCalculator";
import { IrrigationScheduleCalculator } from "@/components/IrrigationScheduleCalculator";
import { useTactileFeedback } from "@/hooks/useTactileFeedback";

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
      <main className="container py-4 md:py-8">
        {calculatorId === "watering-runoff" && <WateringRunoffCalculator />}
        {calculatorId === "irrigation-schedule" && <IrrigationScheduleCalculator />}
        {calculatorId === "lux-ppfd" && <LuxPPFDCalculator />}
        {calculatorId === "ppm-ec" && <PPMECConverter />}
        {calculatorId === "ph-adjust" && <PHAdjustCalculator />}
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

  const handleLoadPreset = (preset: any) => {
    setPotSize(preset.potSize);
    setNumPlants(preset.plantCount);
    setDesiredRunoff(preset.targetRunoff);
  };

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
    
    let status: "ideal" | "low" | "high" = "ideal";
    let recommendation = "";
    
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
      alert("Receita salva com sucesso!");
    } catch (error) {
      alert("Erro ao salvar receita");
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

          {/* ── Bloco principal: parâmetros ── */}
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            {/* Header do bloco */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40" style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.12) 0%, rgba(6,182,212,0.05) 100%)' }}>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-lg shadow-cyan-900/30">
                <Droplets className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Calculadora de Rega</p>
                <p className="text-[11px] text-muted-foreground">Volume ideal por vaso e por sessão</p>
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
                      {(n === 15 || n === 20) && <span className="block text-[9px] font-normal opacity-60">ideal</span>}
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
                <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400/80">Resultado</p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-cyan-500/15">
                <div className="p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Por Planta</p>
                  <p className="text-3xl font-bold text-cyan-300" style={{ textShadow: '0 0 20px rgba(34,211,238,0.4)' }}>{wateringResult.adjustedVolume}<span className="text-base font-medium text-cyan-400/70 ml-0.5">L</span></p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total · {numPlants} plantas</p>
                  <p className="text-3xl font-bold text-cyan-300" style={{ textShadow: '0 0 20px rgba(34,211,238,0.4)' }}>{wateringResult.totalVolume}<span className="text-base font-medium text-cyan-400/70 ml-0.5">L</span></p>
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
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-900/30">
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Verificar Runoff Real</p>
                <p className="text-[11px] text-muted-foreground">Meça o volume coletado e calcule o %</p>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Volume Aplicado</span>
                  <Input id="volumeIn" type="text" inputMode="decimal" placeholder="Ex: 3.5"
                    value={volumeIn} onChange={(e) => setVolumeIn(e.target.value)}
                    className="h-12 text-center text-lg font-bold bg-muted/30 border-border/50" />
                  <p className="text-[10px] text-center text-muted-foreground">litros (L)</p>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Volume Coletado</span>
                  <Input id="volumeOut" type="text" inputMode="decimal" placeholder="Ex: 0.7"
                    value={volumeOut} onChange={(e) => setVolumeOut(e.target.value)}
                    className="h-12 text-center text-lg font-bold bg-muted/30 border-border/50" />
                  <p className="text-[10px] text-center text-muted-foreground">litros (L)</p>
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
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-900/30">
                <Download className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Salvar Receita</p>
                <p className="text-[11px] text-muted-foreground">Registre para consulta futura</p>
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
                className="w-full h-11 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold shadow-lg shadow-violet-900/30 border-0">
                {saveApplication.isPending ? "Salvando..." : "Salvar Receita"}
              </Button>
            </div>
          </div>

          {/* ── Dicas ── */}
          <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-yellow-400/80 flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5 text-yellow-400"/>Dicas de Uso</p>
            <p className="text-xs text-muted-foreground"><span className="text-foreground font-medium">Runoff Ideal:</span> Entre 15–25%. Muito baixo acumula sais, muito alto desperdiça nutrientes.</p>
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
                  className="w-full px-3 py-2 border rounded-md bg-background"
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

  // Smooth gradient for light intensity (blue → green → yellow → red)
  const lightGradient = "linear-gradient(to right, #3b82f6 0%, #10b981 33%, #eab308 66%, #ef4444 100%)";

  const luxLabels = [
    { position: 0, label: "Clonagem", sublabel: "7k-14k", color: "#3b82f6" },
    { position: 28, label: "Vega", sublabel: "28k-42k", color: "#10b981" },
    { position: 50, label: "Flora", sublabel: "42k-63k", color: "#eab308" },
    { position: 75, label: "Máximo", sublabel: "70k-84k", color: "#ef4444" },
  ];

  const ppfdLabels = [
    { position: 0, label: "Clonagem", sublabel: "100-200", color: "#3b82f6" },
    { position: 33, label: "Vega", sublabel: "400-600", color: "#10b981" },
    { position: 58, label: "Flora", sublabel: "600-900", color: "#eab308" },
    { position: 83, label: "Máximo", sublabel: "1000-1200", color: "#ef4444" },
  ];

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden" data-tour="calculator-lux-ppfd">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.12) 0%, rgba(202,138,4,0.05) 100%)' }}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-lg shadow-yellow-900/30">
          <Sun className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Calculadora Lux ↔ PPFD</p>
          <p className="text-[11px] text-muted-foreground">Converta entre Lux (luxímetro) e PPFD (µmol/m²/s) baseado no tipo de luz</p>
        </div>
      </div>
      <div className="p-4 space-y-6">
        {/* Seletor de modo */}
        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          <button
            onClick={() => { setConversionMode("lux-to-ppfd"); setPpfd(""); setResult(null); }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              conversionMode === "lux-to-ppfd" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Lux → PPFD
          </button>
          <button
            onClick={() => { setConversionMode("ppfd-to-lux"); setLux(""); setResult(null); }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              conversionMode === "ppfd-to-lux" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            PPFD → Lux
          </button>
        </div>

        {conversionMode === "lux-to-ppfd" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-4">
              <Input
                id="lux-input"
                type="number"
                inputMode="numeric"
                placeholder="35000"
                value={lux}
                onChange={(e) => setLux(e.target.value)}
                className={`w-44 md:w-52 text-center text-3xl md:text-4xl lg:text-5xl h-16 md:h-20 border-2 rounded-2xl bg-background dark:bg-zinc-800 text-foreground shadow-lg transition-all duration-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                  parseInt(lux || "0") > 0 ? "border-yellow-500 ring-2 ring-yellow-500/20" : "border-border"
                }`}
                data-tour="lux-input"
              />
              <span className="text-2xl md:text-3xl font-bold text-muted-foreground">lux</span>
            </div>
            <RangeSlider
              min={0}
              max={100000}
              step={1000}
              value={parseInt(lux || "0")}
              onChange={(v) => setLux(String(v))}
              trackGradient={lightGradient}
              formatTooltip={(v) => `${(v / 1000).toFixed(0)}k lux`}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-4">
              <Input
                id="ppfd-input"
                type="number"
                inputMode="numeric"
                placeholder="600"
                value={ppfd}
                onChange={(e) => setPpfd(e.target.value)}
                className={`w-44 md:w-52 text-center text-3xl md:text-4xl lg:text-5xl h-16 md:h-20 border-2 rounded-2xl bg-background dark:bg-zinc-800 text-foreground shadow-lg transition-all duration-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                  parseInt(ppfd || "0") > 0 ? "border-yellow-500 ring-2 ring-yellow-500/20" : "border-border"
                }`}
              />
              <span className="text-lg md:text-xl font-bold text-muted-foreground whitespace-nowrap">µmol/m²/s</span>
            </div>
            <RangeSlider
              id="ppfd-slider"
              min={0}
              max={1200}
              step={10}
              value={parseInt(ppfd || "0")}
              onChange={(v) => setPpfd(String(v))}
              trackGradient={lightGradient}
              formatTooltip={(v) => `${v} µmol`}
            />
          </div>
        )}

        {/* Tipo de luz */}
        <div className="space-y-2">
          <Label htmlFor="lightType">Tipo de Luz</Label>
          <select
            id="lightType"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={lightType}
            onChange={(e) => setLightType(e.target.value)}
          >
            <option value="led-white">LED Branco</option>
            <option value="led-full-spectrum">LED Full Spectrum</option>
            <option value="hps">HPS (Alta Pressão de Sódio)</option>
            <option value="mh">MH (Metal Halide)</option>
            <option value="sunlight">Luz Solar</option>
          </select>
        </div>

        {/* Resultado */}
        {result !== null && (
          <div className="rounded-xl border border-yellow-400/30 p-4 space-y-3" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.10) 0%, rgba(202,138,4,0.04) 100%)' }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                {conversionMode === "lux-to-ppfd" ? "PPFD estimado:" : "Lux estimado:"}
              </span>
              <span className="text-3xl font-bold text-yellow-400" style={{ textShadow: '0 0 16px rgba(234,179,8,0.6)' }}>
                {conversionMode === "lux-to-ppfd"
                  ? `${result} µmol/m²/s`
                  : `${result.toLocaleString('pt-BR')} lux`}
              </span>
            </div>
            <div className="mt-4 space-y-2 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Referências de PPFD por fase:</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted p-2 rounded"><span className="font-medium">Clonagem:</span> 100-200</div>
                <div className="bg-muted p-2 rounded"><span className="font-medium">Vegetativa:</span> 400-600</div>
                <div className="bg-muted p-2 rounded"><span className="font-medium">Floração:</span> 600-900</div>
                <div className="bg-muted p-2 rounded"><span className="font-medium">Máximo:</span> 1000-1200</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5 text-yellow-400"/><strong>Dica:</strong></span> Esta é uma estimativa. Para medições precisas, use um medidor PPFD (quantum sensor).
            </p>
            <Button onClick={() => exportLuxPPFDRecipe(lux, lightType, result)} variant="outline" className="w-full mt-4">
              <Download className="w-4 h-4 mr-2" />
              Exportar Receita
            </Button>
          </div>
        )}
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

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden" data-tour="calculator-ppm-ec">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(139,92,246,0.05) 100%)' }}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
          <Calculator className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Conversão PPM ↔ EC</p>
          <p className="text-[11px] text-muted-foreground">Converta entre PPM (partes por milhão) e EC (condutividade elétrica)</p>
        </div>
      </div>
      <div className="p-4 space-y-6">
        {/* Modo */}
        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          <button
            onClick={() => { setConversionType("ppm-to-ec"); setInputValue(""); }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              conversionType === "ppm-to-ec" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            PPM → EC
          </button>
          <button
            onClick={() => { setConversionType("ec-to-ppm"); setInputValue(""); }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              conversionType === "ec-to-ppm" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            EC → PPM
          </button>
        </div>

        {/* Escala */}
        <div className="space-y-2">
          <Label>Escala de Conversão</Label>
          <div className="flex gap-2">
            {(["500", "700"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScale(s)}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium border transition-colors ${
                  scale === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                Escala {s}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {scale === "500" ? "Padrão europeu (Truncheon)" : "Padrão americano (Hanna)"}
          </p>
        </div>

        {/* Input */}
        <div className="space-y-2">
          <Label htmlFor="ppm-ec-input">
            {conversionType === "ppm-to-ec" ? "Valor em PPM" : "Valor em EC (mS/cm)"}
          </Label>
          <Input
            id="ppm-ec-input"
            type="text"
            inputMode="decimal"
            placeholder={conversionType === "ppm-to-ec" ? "Ex: 1000" : "Ex: 2.0"}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="text-xl h-14 text-center font-bold"
            data-tour="ppm-input"
          />
        </div>

        {/* Resultado */}
        {result !== null && (
          <div className="rounded-xl border border-purple-400/30 p-4" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.10) 0%, rgba(139,92,246,0.04) 100%)' }}>
            <h4 className="font-semibold text-foreground mb-3">Resultado:</h4>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                {conversionType === "ppm-to-ec" ? "EC (mS/cm):" : "PPM:"}
              </span>
              <span className="text-3xl font-bold text-purple-400" style={{ textShadow: '0 0 16px rgba(168,85,247,0.6)' }}>
                {result} {conversionType === "ppm-to-ec" ? "mS/cm" : "PPM"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              <span className="inline-flex items-center gap-1"><BarChart2 className="w-3.5 h-3.5 text-blue-400"/><strong>Referência:</strong></span> Vega: 1.0-1.8 EC | Flora: 1.8-2.4 EC
            </p>
          </div>
        )}

        {/* Tabela */}
        <div className="rounded-xl border border-border/50 p-4 bg-muted/30">
          <h5 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5 text-muted-foreground"/>Tabela de Referência (Escala {scale}):</h5>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Clonagem:</span>
              <span className="font-medium">0.4-0.8 EC ({scale === "500" ? "200-400" : "280-560"} PPM)</span>
            </div>
            <div className="flex justify-between">
              <span>Vegetativo:</span>
              <span className="font-medium">1.0-1.8 EC ({scale === "500" ? "500-900" : "700-1260"} PPM)</span>
            </div>
            <div className="flex justify-between">
              <span>Floração:</span>
              <span className="font-medium">1.8-2.4 EC ({scale === "500" ? "900-1200" : "1260-1680"} PPM)</span>
            </div>
            <div className="flex justify-between">
              <span>Flush Final:</span>
              <span className="font-medium">0.0-0.4 EC ({scale === "500" ? "0-200" : "0-280"} PPM)</span>
            </div>
          </div>
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

  // pH gradient (acid → neutral → alkaline)
  const phGradient = "linear-gradient(to right, #dc2626 0%, #f97316 28.5%, #eab308 42.8%, #22c55e 50%, #3b82f6 64.2%, #8b5cf6 100%)";

  const phLabels = [
    { position: 0, label: "0", sublabel: "Ácido", color: "#dc2626" },
    { position: 50, label: "7", sublabel: "Neutro", color: "#22c55e" },
    { position: 100, label: "14", sublabel: "Alcalino", color: "#8b5cf6" },
  ];

  return (
    <Card className="bg-card/90 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Droplets className="w-5 h-5 text-blue-500" />
          Calculadora de Ajuste de pH
        </CardTitle>
        <CardDescription>
          Calcule quanto ácido ou base adicionar para atingir o pH ideal
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Volume */}
        <div className="space-y-3">
          <Label htmlFor="waterVolumePH" className="text-base font-semibold">Volume de Água (litros)</Label>
          <Input
            id="waterVolumePH"
            type="text"
            inputMode="decimal"
            placeholder="Ex: 10"
            value={waterVolume}
            onChange={(e) => setWaterVolume(e.target.value)}
            className="text-xl h-14 px-4 font-bold text-center"
          />
        </div>

        {/* pH Atual */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label className="text-base font-semibold">pH Atual</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{getPHLabel(currentPH)}</span>
              <span
                className="text-3xl font-bold px-3 py-1 rounded-lg tabular-nums"
                style={{ color: getPHColor(currentPH) }}
              >
                {currentPH.toFixed(1)}
              </span>
            </div>
          </div>
          <RangeSlider
            id="currentPH"
            min={0}
            max={14}
            step={0.1}
            value={currentPH}
            onChange={setCurrentPH}
            trackGradient={phGradient}
            formatTooltip={(v) => `pH ${v.toFixed(1)}`}
            labels={phLabels}
          />
        </div>

        {/* pH Alvo */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label className="text-base font-semibold">pH Alvo</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{getPHLabel(targetPH)}</span>
              <span
                className="text-3xl font-bold px-3 py-1 rounded-lg tabular-nums"
                style={{ color: getPHColor(targetPH) }}
              >
                {targetPH.toFixed(1)}
              </span>
            </div>
          </div>
          <RangeSlider
            id="targetPH"
            min={0}
            max={14}
            step={0.1}
            value={targetPH}
            onChange={setTargetPH}
            trackGradient={phGradient}
            formatTooltip={(v) => `pH ${v.toFixed(1)}`}
            labels={phLabels}
          />
        </div>

        {/* Resultado */}
        {result && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6 space-y-3">
            <h4 className="font-semibold text-foreground mb-3">Receita de Ajuste:</h4>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Produto:</span>
              <span className="text-base font-bold text-blue-600">{result.product}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Quantidade:</span>
              <span className="text-3xl font-bold text-blue-600">{result.amount} ml</span>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              <span className="inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-amber-400"/><strong>Importante:</strong></span> Adicione aos poucos, misture bem e meça novamente. Nunca adicione tudo de uma vez!
            </p>
          </div>
        )}

        {/* Tabela de Referência */}
        <div className="bg-muted border border-border rounded-lg p-4">
          <h5 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5 text-muted-foreground"/>pH Ideal por Substrato:</h5>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Solo/Terra:</span>
              <span className="font-medium">6.0 - 7.0</span>
            </div>
            <div className="flex justify-between">
              <span>Fibra de Coco:</span>
              <span className="font-medium">5.5 - 6.5</span>
            </div>
            <div className="flex justify-between">
              <span>Hidroponia:</span>
              <span className="font-medium">5.5 - 6.0</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            <span className="inline-flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5 text-yellow-400"/><strong>Dica:</strong></span> pH fora da faixa ideal bloqueia absorção de nutrientes, causando deficiências mesmo com fertilização adequada.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// Função auxiliar para calcular runoff (mantida para compatibilidade)
function RunoffCalculator() {
  const [desiredRunoff] = useState(20);
  const [volumeIn, setVolumeIn] = useState<string>("");
  const [volumeOut, setVolumeOut] = useState<string>("");

  const calculateRunoff = () => {
    if (!volumeIn || !volumeOut) return null;
    const volIn = parseFloat(volumeIn);
    const volOut = parseFloat(volumeOut);
    if (volIn <= 0 || volOut < 0) return null;
    const runoffPercent = (volOut / volIn) * 100;
    const diff = runoffPercent - desiredRunoff;
    let status: "ideal" | "low" | "high" = "ideal";
    let recommendation = "";
    if (Math.abs(diff) <= 2) { status = "ideal"; recommendation = "Perfeito! Mantenha esse volume."; }
    else if (diff < 0) { status = "low"; recommendation = `Runoff abaixo do ideal. Aumente o volume em aproximadamente ${Math.abs(diff * 2).toFixed(0)}%.`; }
    else { status = "high"; recommendation = `Runoff acima do ideal. Reduza o volume em aproximadamente ${(diff * 2).toFixed(0)}%.`; }
    return { runoffPercent: runoffPercent.toFixed(1), status, recommendation };
  };

  const runoffResult = calculateRunoff();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verificar Runoff</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Volume Aplicado (L)</Label>
            <Input type="text" inputMode="decimal" placeholder="Ex: 3.5" value={volumeIn} onChange={(e) => setVolumeIn(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Volume Coletado (L)</Label>
            <Input type="text" inputMode="decimal" placeholder="Ex: 0.7" value={volumeOut} onChange={(e) => setVolumeOut(e.target.value)} />
          </div>
        </div>
        {runoffResult && (
          <div className={`p-4 rounded-lg ${runoffResult.status === "ideal" ? "bg-green-500/10 border border-green-500/30" : "bg-amber-500/10 border border-amber-500/30"}`}>
            <p className="font-bold text-2xl">{runoffResult.runoffPercent}%</p>
            <p className="text-sm mt-1">{runoffResult.recommendation}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Calculadora de Rega legada (mantida para compatibilidade)
function IrrigationCalculator() {
  return <div />;
}
