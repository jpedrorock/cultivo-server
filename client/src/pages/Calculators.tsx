import { useState, useEffect } from "react";
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, Droplets, Sprout, Sun, Download, AlertCircle, CheckCircle2 } from "lucide-react";
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
    "lux-ppfd": "Conversor Lux → PPFD",
    "ppm-ec": "Conversor PPM ↔ EC",
    "ph-adjust": "Calculadora de pH",
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10 pt-safe">
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
  const applications = trpc.watering.listApplications.useQuery({
    tentId: historyTentFilter !== "all" ? Number(historyTentFilter) : undefined,
    limit: 50,
  });
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

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "calculator" | "history")}>
        <TabsList className="w-full">
          <TabsTrigger value="calculator" className="flex-1">Calculadora</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="calculator" className="space-y-6 mt-6">
          {/* Calculadora de Rega */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Droplets className="w-5 h-5 text-blue-500" />
                Calculadora de Rega
              </CardTitle>
              <CardDescription>
                Calcule o volume ideal de água baseado no tamanho do vaso
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Número de plantas */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="text-base font-semibold">Número de Plantas</Label>
                  <span className="text-2xl font-bold text-primary">{numPlants}</span>
                </div>
                <RangeSlider
                  min={1}
                  max={20}
                  step={1}
                  value={numPlants}
                  onChange={setNumPlants}
                  fillColor="#3b82f6"
                  formatTooltip={(v) => `${v} planta${v !== 1 ? 's' : ''}`}
                  labels={[
                    { position: 0, label: "1" },
                    { position: 47.4, label: "10" },
                    { position: 100, label: "20" },
                  ]}
                />
              </div>

              {/* Tamanho do vaso */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="text-base font-semibold">Tamanho do Vaso</Label>
                  <span className="text-2xl font-bold text-primary">{potSize}L</span>
                </div>
                <RangeSlider
                  min={1}
                  max={50}
                  step={1}
                  value={potSize}
                  onChange={setPotSize}
                  fillColor="#3b82f6"
                  formatTooltip={(v) => `${v}L`}
                  labels={[
                    { position: 0, label: "1L" },
                    { position: 20.4, label: "11L" },
                    { position: 40.8, label: "20L" },
                    { position: 100, label: "50L" },
                  ]}
                />
              </div>

              {/* Runoff desejado */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="text-base font-semibold">Runoff Desejado</Label>
                  <span className="text-2xl font-bold text-primary">{desiredRunoff}%</span>
                </div>
                <RangeSlider
                  min={0}
                  max={50}
                  step={1}
                  value={desiredRunoff}
                  onChange={setDesiredRunoff}
                  fillColor={desiredRunoff < 10 ? "#ef4444" : desiredRunoff <= 25 ? "#22c55e" : "#eab308"}
                  formatTooltip={(v) => `${v}%`}
                  labels={[
                    { position: 0, label: "0%", color: "#ef4444" },
                    { position: 30, label: "15%", sublabel: "Ideal", color: "#22c55e" },
                    { position: 50, label: "25%", sublabel: "Ideal", color: "#22c55e" },
                    { position: 100, label: "50%", color: "#ef4444" },
                  ]}
                />
              </div>

              {/* Runoff real (opcional) */}
              <div className="space-y-2">
                <Label htmlFor="lastRunoff" className="text-sm text-muted-foreground">
                  Runoff Real da Última Rega (opcional)
                </Label>
                <Input
                  id="lastRunoff"
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 15"
                  value={lastRunoff}
                  onChange={(e) => setLastRunoff(e.target.value)}
                  className="h-12 text-center text-lg font-bold"
                />
              </div>

              {/* Resultado */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5 space-y-3">
                <h3 className="font-semibold text-foreground">Resultado:</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-background/60 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Por planta</p>
                    <p className="text-2xl font-bold text-blue-600">{wateringResult.adjustedVolume}L</p>
                  </div>
                  <div className="bg-background/60 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Total ({numPlants} plantas)</p>
                    <p className="text-2xl font-bold text-blue-600">{wateringResult.totalVolume}L</p>
                  </div>
                </div>
                {wateringResult.adjustment && (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                    <p className="text-sm">🎯 {wateringResult.adjustment}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Calculadora de Runoff */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Droplets className="w-5 h-5 text-cyan-500" />
                Verificar Runoff Real
              </CardTitle>
              <CardDescription>
                Meça o volume coletado e calcule o runoff real
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="volumeIn">Volume Aplicado (L)</Label>
                  <Input
                    id="volumeIn"
                    type="text"
                    inputMode="decimal"
                    placeholder="Ex: 3.5"
                    value={volumeIn}
                    onChange={(e) => setVolumeIn(e.target.value)}
                    className="h-12 text-center text-lg font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="volumeOut">Volume Coletado (L)</Label>
                  <Input
                    id="volumeOut"
                    type="text"
                    inputMode="decimal"
                    placeholder="Ex: 0.7"
                    value={volumeOut}
                    onChange={(e) => setVolumeOut(e.target.value)}
                    className="h-12 text-center text-lg font-bold"
                  />
                </div>
              </div>

              {runoffResult && (
                <div className="space-y-3 pt-2">
                  <div className="bg-muted/50 p-4 rounded-lg flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Runoff Real:</span>
                    <span className="font-bold text-2xl text-foreground">{runoffResult.runoffPercent}%</span>
                  </div>
                  <div className={`p-4 rounded-lg flex items-start gap-3 ${
                    runoffResult.status === "ideal"
                      ? "bg-green-500/10 border border-green-500/30"
                      : "bg-amber-500/10 border border-amber-500/30"
                  }`}>
                    {runoffResult.status === "ideal" ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className={`font-semibold ${runoffResult.status === "ideal" ? "text-green-600" : "text-amber-600"}`}>
                        {runoffResult.status === "ideal" ? "✅ Ideal!" : "⚠️ Ajuste Necessário"}
                      </p>
                      <p className="text-sm text-foreground mt-1">{runoffResult.recommendation}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dicas */}
          <Card>
            <CardHeader>
              <CardTitle>💡 Dicas de Uso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Runoff Ideal:</strong> Entre 15-25%.
                Runoff muito baixo pode causar acúmulo de sais, muito alto desperdiça água e nutrientes.
              </p>
              <p>
                <strong className="text-foreground">Ajuste Automático:</strong> Informe o runoff real da última rega
                para o sistema ajustar o volume automaticamente.
              </p>
            </CardContent>
          </Card>

          {/* Botão Salvar Receita */}
          <Card>
            <CardHeader>
              <CardTitle>💾 Salvar Receita de Rega</CardTitle>
              <CardDescription>Registre esta receita para consulta futura</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tent-select">Estufa</Label>
                <select
                  id="tent-select"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  value={selectedTent || ""}
                  onChange={(e) => setSelectedTent(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Selecione uma estufa</option>
                  {tents.data?.map((tent) => (
                    <option key={tent.id} value={tent.id}>
                      {tent.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes-input">Observações (opcional)</Label>
                <textarea
                  id="notes-input"
                  className="w-full px-3 py-2 border rounded-md min-h-[80px] bg-background"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Ajustado volume devido ao runoff baixo..."
                />
              </div>
              <Button
                onClick={handleSaveRecipe}
                disabled={!selectedTent || saveApplication.isPending}
                className="w-full"
              >
                {saveApplication.isPending ? "Salvando..." : "Salvar Receita"}
              </Button>
            </CardContent>
          </Card>
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
                          <CardTitle className="text-lg">💧 {app.recipeName}</CardTitle>
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

  // Gradient for light intensity (blue → green → yellow → red)
  const lightGradient = "linear-gradient(to right, #3b82f6 0%, #3b82f6 16.67%, #10b981 16.67%, #10b981 50%, #eab308 50%, #eab308 75%, #ef4444 75%, #ef4444 100%)";

  const luxLabels = [
    { position: 0, label: "Clonagem", sublabel: "7k-14k", icon: "🌱", color: "#3b82f6" },
    { position: 28, label: "Vega", sublabel: "28k-42k", icon: "🌿", color: "#10b981" },
    { position: 50, label: "Flora", sublabel: "42k-63k", icon: "🌸", color: "#eab308" },
    { position: 75, label: "Máximo", sublabel: "70k-84k", icon: "⚡", color: "#ef4444" },
  ];

  const ppfdLabels = [
    { position: 0, label: "Clonagem", sublabel: "100-200", icon: "🌱", color: "#3b82f6" },
    { position: 33, label: "Vega", sublabel: "400-600", icon: "🌿", color: "#10b981" },
    { position: 58, label: "Flora", sublabel: "600-900", icon: "🌸", color: "#eab308" },
    { position: 83, label: "Máximo", sublabel: "1000-1200", icon: "⚡", color: "#ef4444" },
  ];

  return (
    <Card className="bg-card/90 backdrop-blur-sm" data-tour="calculator-lux-ppfd">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sun className="w-8 h-8 text-yellow-500" />
          Calculadora Lux ↔ PPFD
        </CardTitle>
        <CardDescription>
          Converta entre Lux (luxímetro) e PPFD (µmol/m²/s) baseado no tipo de luz
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
          <div className="space-y-6">
            {/* Input numérico */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="lux" className="text-base font-semibold">Intensidade (Lux)</Label>
                <span className="text-2xl font-bold text-yellow-500">{parseInt(lux || "0").toLocaleString('pt-BR')}</span>
              </div>
              <RangeSlider
                id="lux-slider"
                min={0}
                max={100000}
                step={1000}
                value={parseInt(lux || "0")}
                onChange={(v) => setLux(String(v))}
                trackGradient={lightGradient}
                formatTooltip={(v) => `${(v / 1000).toFixed(0)}k lux`}
                labels={luxLabels}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lux-input" className="text-xs text-muted-foreground">Ou digite o valor exato:</Label>
              <Input
                id="lux-input"
                type="text"
                inputMode="numeric"
                placeholder="Ex: 50000"
                value={lux}
                onChange={(e) => setLux(e.target.value)}
                className="text-xl h-12 px-4 font-bold text-center"
                data-tour="lux-input"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="ppfd-slider" className="text-base font-semibold">PPFD (µmol/m²/s)</Label>
                <span className="text-2xl font-bold text-yellow-500">{parseInt(ppfd || "0")}</span>
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
                labels={ppfdLabels}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ppfd-input" className="text-xs text-muted-foreground">Ou digite o valor exato:</Label>
              <Input
                id="ppfd-input"
                type="text"
                inputMode="numeric"
                placeholder="Ex: 750"
                value={ppfd}
                onChange={(e) => setPpfd(e.target.value)}
                className="text-xl h-12 px-4 font-bold text-center"
              />
            </div>
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
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                {conversionMode === "lux-to-ppfd" ? "PPFD estimado:" : "Lux estimado:"}
              </span>
              <span className="text-3xl font-bold text-yellow-600">
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
              💡 <strong>Dica:</strong> Esta é uma estimativa. Para medições precisas, use um medidor PPFD (quantum sensor).
            </p>
            <Button onClick={() => exportLuxPPFDRecipe(lux, lightType, result)} variant="outline" className="w-full mt-4">
              <Download className="w-4 h-4 mr-2" />
              Exportar Receita
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
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
    <Card className="bg-card/90 backdrop-blur-sm" data-tour="calculator-ppm-ec">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-purple-500" />
          Conversão PPM ↔ EC
        </CardTitle>
        <CardDescription>
          Converta entre PPM (partes por milhão) e EC (condutividade elétrica)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-6">
            <h4 className="font-semibold text-foreground mb-3">Resultado:</h4>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                {conversionType === "ppm-to-ec" ? "EC (mS/cm):" : "PPM:"}
              </span>
              <span className="text-3xl font-bold text-purple-600">
                {result} {conversionType === "ppm-to-ec" ? "mS/cm" : "PPM"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              📊 <strong>Referência:</strong> Vega: 1.0-1.8 EC | Flora: 1.8-2.4 EC
            </p>
          </div>
        )}

        {/* Tabela */}
        <div className="bg-muted border border-border rounded-lg p-4">
          <h5 className="text-sm font-semibold text-foreground mb-3">📋 Tabela de Referência (Escala {scale}):</h5>
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
      </CardContent>
    </Card>
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
              ⚠️ <strong>Importante:</strong> Adicione aos poucos, misture bem e meça novamente. Nunca adicione tudo de uma vez!
            </p>
          </div>
        )}

        {/* Tabela de Referência */}
        <div className="bg-muted border border-border rounded-lg p-4">
          <h5 className="text-sm font-semibold text-foreground mb-3">📋 pH Ideal por Substrato:</h5>
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
            💡 <strong>Dica:</strong> pH fora da faixa ideal bloqueia absorção de nutrientes, causando deficiências mesmo com fertilização adequada.
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
