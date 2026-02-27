import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast as showToast } from "sonner";
import { Beaker, Download, Loader2, ArrowLeft } from "lucide-react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PageTransition } from "@/components/PageTransition";

type Phase = "CLONING" | "VEGA" | "FLORA" | "MAINTENANCE" | "DRYING";

// Produtos (sais minerais) pré-definidos por fase/semana com quantidades em g/L
const getProductsByPhaseWeek = (phase: Phase, week: number) => {
  if (phase === "CLONING") {
    return [
      { name: "Nitrato de Cálcio", gPerLiter: 0.3, npk: "15.5-0-0", ca: 19, mg: 0, fe: 0, s: 0 },
      { name: "Nitrato de Potássio", gPerLiter: 0.2, npk: "13-0-38", ca: 0, mg: 0, fe: 0, s: 0 },
      { name: "MKP (Fosfato Monopotássico)", gPerLiter: 0.1, npk: "0-22-28", ca: 0, mg: 0, fe: 0, s: 0 },
      { name: "Sulfato de Magnésio", gPerLiter: 0.2, npk: "0-0-0", ca: 0, mg: 10, fe: 0, s: 13 },
    ];
  }
  
  if (phase === "VEGA") {
    const vegaWeek = Math.min(week, 4);
    const multiplier = 0.7 + (vegaWeek / 4) * 0.3; // 0.7 a 1.0
    
    return [
      { name: "Nitrato de Cálcio", gPerLiter: 0.9 * multiplier, npk: "15.5-0-0", ca: 19, mg: 0, fe: 0, s: 0 },
      { name: "Nitrato de Potássio", gPerLiter: 0.4 * multiplier, npk: "13-0-38", ca: 0, mg: 0, fe: 0, s: 0 },
      { name: "MKP (Fosfato Monopotássico)", gPerLiter: 0.19 * multiplier, npk: "0-22-28", ca: 0, mg: 0, fe: 0, s: 0 },
      { name: "Sulfato de Magnésio", gPerLiter: 0.64 * multiplier, npk: "0-0-0", ca: 0, mg: 10, fe: 0, s: 13 },
      { name: "Micronutrientes", gPerLiter: 0.05 * multiplier, npk: "0-0-0", ca: 0, mg: 0, fe: 6, s: 0 },
    ];
  }
  
  if (phase === "FLORA") {
    const floraWeek = Math.min(week, 8);
    const multiplier = 0.8 + (floraWeek / 8) * 0.4; // 0.8 a 1.2
    
    return [
      { name: "Nitrato de Cálcio", gPerLiter: 0.6 * multiplier, npk: "15.5-0-0", ca: 19, mg: 0, fe: 0, s: 0 },
      { name: "Nitrato de Potássio", gPerLiter: 0.6 * multiplier, npk: "13-0-38", ca: 0, mg: 0, fe: 0, s: 0 },
      { name: "MKP (Fosfato Monopotássico)", gPerLiter: 0.4 * multiplier, npk: "0-22-28", ca: 0, mg: 0, fe: 0, s: 0 },
      { name: "Sulfato de Magnésio", gPerLiter: 0.5 * multiplier, npk: "0-0-0", ca: 0, mg: 10, fe: 0, s: 13 },
      { name: "Micronutrientes", gPerLiter: 0.05 * multiplier, npk: "0-0-0", ca: 0, mg: 0, fe: 6, s: 0 },
    ];
  }
  
  if (phase === "MAINTENANCE") {
    return [
      { name: "Nitrato de Cálcio", gPerLiter: 0.5, npk: "15.5-0-0", ca: 19, mg: 0, fe: 0, s: 0 },
      { name: "Nitrato de Potássio", gPerLiter: 0.3, npk: "13-0-38", ca: 0, mg: 0, fe: 0, s: 0 },
      { name: "MKP (Fosfato Monopotássico)", gPerLiter: 0.15, npk: "0-22-28", ca: 0, mg: 0, fe: 0, s: 0 },
      { name: "Sulfato de Magnésio", gPerLiter: 0.3, npk: "0-0-0", ca: 0, mg: 10, fe: 0, s: 13 },
    ];
  }
  
  // DRYING - apenas flush
  return [];
};

// Função para atribuir cor baseado no produto
const getProductColor = (productName: string) => {
  if (productName.includes("Cálcio")) return "text-orange-600 dark:text-orange-400";
  if (productName.includes("Potássio")) return "text-green-600 dark:text-green-400";
  if (productName.includes("MKP") || productName.includes("Fosfato")) return "text-blue-600 dark:text-blue-400";
  if (productName.includes("Magnésio")) return "text-emerald-600 dark:text-emerald-400";
  if (productName.includes("Micronutrientes")) return "text-yellow-600 dark:text-yellow-400";
  return "text-purple-600 dark:text-purple-400"; // default
};

export default function Nutrients() {
  const [phase, setPhase] = useState<Phase>("VEGA");
  const [week, setWeek] = useState(1);
  const [volumeL, setVolumeL] = useState(10);
  
  // Estados para filtros do histórico
  const [historyTentFilter, setHistoryTentFilter] = useState<string>("all");
  const [historyPhaseFilter, setHistoryPhaseFilter] = useState<Phase | "all">("all");
  
  // Queries
  const tents = trpc.tents.list.useQuery();
  const applications = trpc.nutrients.listApplications.useQuery({
    tentId: historyTentFilter !== "all" ? Number(historyTentFilter) : undefined,
    phase: historyPhaseFilter !== "all" ? historyPhaseFilter : undefined,
    limit: 50,
  });
  
  const products = getProductsByPhaseWeek(phase, week);
  
  // Calcular quantidades totais em gramas
  const calculatedProducts = products.map(p => ({
    ...p,
    totalG: p.gPerLiter * volumeL,
  }));
  
  // Calcular NPK total
  const calculateNPK = () => {
    let n = 0, p = 0, k = 0;
    calculatedProducts.forEach(prod => {
      const [nVal, pVal, kVal] = prod.npk.split("-").map(Number);
      const gPerLiter = prod.gPerLiter;
      
      // Converter % para ppm: (% / 100) * g/L * 1000
      n += (nVal / 100) * gPerLiter * 1000;
      p += (pVal / 100) * gPerLiter * 1000;
      k += (kVal / 100) * gPerLiter * 1000;
    });
    
    return {
      n: Math.round(n),
      p: Math.round(p),
      k: Math.round(k),
    };
  };
  
  // Calcular micronutrientes
  const calculateMicros = () => {
    let ca = 0, mg = 0, fe = 0, s = 0;
    calculatedProducts.forEach(prod => {
      const gPerLiter = prod.gPerLiter;
      
      ca += (prod.ca / 100) * gPerLiter * 1000;
      mg += (prod.mg / 100) * gPerLiter * 1000;
      fe += (prod.fe / 100) * gPerLiter * 1000;
      s += (prod.s / 100) * gPerLiter * 1000;
    });
    
    return {
      ca: Math.round(ca),
      mg: Math.round(mg),
      fe: Math.round(fe),
      s: Math.round(s),
    };
  };
  
  // Calcular EC estimado
  const calculateEC = () => {
    const npk = calculateNPK();
    const micros = calculateMicros();
    const totalPPM = npk.n + npk.p + npk.k + micros.ca + micros.mg;
    const ec = Math.round((totalPPM / 700) * 100) / 100;
    return ec;
  };
  
  const npkTotal = calculateNPK();
  const microsTotal = calculateMicros();
  const ecEstimated = calculateEC();
  const ppmApprox = Math.round(ecEstimated * 640);
  
  // Mutation para salvar receita
  const recordApplication = trpc.nutrients.recordApplication.useMutation({
    onSuccess: () => {
      showToast.success("Receita salva com sucesso!");
    },
    onError: (error) => {
      showToast.error(`Erro ao salvar receita: ${error.message}`);
    },
  });
  
  // Exportar receita para TXT
  const exportRecipe = () => {
    const phaseNames = {
      CLONING: "Clonagem",
      VEGA: "Vegetativa",
      FLORA: "Floração",
      MAINTENANCE: "Manutenção",
      DRYING: "Secagem",
    };
    
    let txt = `Receita de Fertilização - ${phaseNames[phase]} Semana ${week}\n`;
    txt += `Volume Total: ${volumeL}L\n`;
    txt += `EC Estimado: ${ecEstimated} mS/cm (${ppmApprox} ppm)\n\n`;
    txt += `Produtos:\n`;
    calculatedProducts.forEach(p => {
      txt += `- ${p.name}: ${p.totalG.toFixed(2)}g (${p.gPerLiter.toFixed(2)} g/L)\n`;
      txt += `  NPK: ${p.npk}`;
      if (p.ca > 0) txt += ` | Ca: ${p.ca}%`;
      if (p.mg > 0) txt += ` | Mg: ${p.mg}%`;
      if (p.fe > 0) txt += ` | Fe: ${p.fe}%`;
      if (p.s > 0) txt += ` | S: ${p.s}%`;
      txt += `\n`;
    });
    txt += `\nNPK Total:\n`;
    txt += `- Nitrogênio (N): ${npkTotal.n} ppm\n`;
    txt += `- Fósforo (P): ${npkTotal.p} ppm\n`;
    txt += `- Potássio (K): ${npkTotal.k} ppm\n`;
    txt += `\nMicronutrientes:\n`;
    txt += `- Cálcio (Ca): ${microsTotal.ca} ppm\n`;
    txt += `- Magnésio (Mg): ${microsTotal.mg} ppm\n`;
    txt += `- Ferro (Fe): ${microsTotal.fe} ppm\n`;
    txt += `- Enxofre (S): ${microsTotal.s} ppm\n`;
    
    const blob = new Blob([txt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receita_${phase.toLowerCase()}_sem${week}_${volumeL}L.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast.success("Receita exportada!");
  };
  
  // Salvar receita
  const saveRecipe = () => {
    const phaseNames = {
      CLONING: "Clonagem",
      VEGA: "Vegetativa",
      FLORA: "Floração",
      MAINTENANCE: "Manutenção",
      DRYING: "Secagem",
    };
    
    recordApplication.mutate({
      tentId: 1, // ID fixo da estufa padrão
      cycleId: null,
      recipeTemplateId: null,
      recipeName: `${phaseNames[phase]} Semana ${week}`,
      phase: phase,
      weekNumber: week,
      volumeTotalL: volumeL,
      ecTarget: ecEstimated,
      ecActual: null,
      phTarget: 6.0,
      phActual: null,
      products: calculatedProducts.map(p => ({
        name: p.name,
        amountMl: p.totalG, // Usando campo amountMl para gramas temporariamente
        npk: p.npk,
        ca: p.ca,
        mg: p.mg,
        fe: p.fe,
      })),
      notes: `Receita gerada automaticamente para ${phaseNames[phase]} Semana ${week}`,
    });
  };
  
  return (
    <PageTransition>
        <div className="container py-6 max-w-5xl">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Calculadoras", href: "/calculators" },
          { label: "Fertilização" },
        ]}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => window.history.back()}
        className="mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Voltar
      </Button>
      <div className="flex items-center gap-3 mb-6">
        <Beaker className="w-8 h-8 text-green-600" />
        <div>
          <h1 className="text-3xl font-bold">Calculadora de Fertilização</h1>
          <p className="text-muted-foreground">Calcule automaticamente as quantidades de nutrientes baseado em fase e semana</p>
        </div>
      </div>
      
      <Tabs defaultValue="calculator" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="calculator">🧪 Calculadora</TabsTrigger>
          <TabsTrigger value="history">📋 Histórico</TabsTrigger>
        </TabsList>
        
        <TabsContent value="calculator" className="space-y-6">
          {/* Inputs - Grid de 2 colunas no desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Seletor de Fase e Semana */}
            <Card>
              <CardHeader>
                <CardTitle>1. Selecione a Fase e Semana</CardTitle>
                <CardDescription>O sistema calculará automaticamente os produtos e quantidades</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Fase</Label>
                  <Select value={phase} onValueChange={(v) => setPhase(v as Phase)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CLONING">🌱 Clonagem</SelectItem>
                      <SelectItem value="VEGA">🌿 Vegetativa</SelectItem>
                      <SelectItem value="FLORA">🌸 Floração</SelectItem>
                      <SelectItem value="MAINTENANCE">🔧 Manutenção</SelectItem>
                      <SelectItem value="DRYING">💨 Secagem</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Semana</Label>
                  <Select value={week.toString()} onValueChange={(v) => setWeek(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(w => (
                        <SelectItem key={w} value={w.toString()}>Semana {w}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
            
            {/* Campo de Volume */}
            <Card className="border-green-500/30">
              <CardHeader>
                <CardTitle className="text-2xl">2. Quantos litros você vai preparar?</CardTitle>
                <CardDescription>Digite o volume total da solução nutritiva</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Input
                    type="number"
                    value={volumeL}
                    onChange={(e) => {
                      const val = e.target.value;
                      // Remove leading zeros and convert to number
                      const num = val === '' ? 0 : parseInt(val, 10);
                      setVolumeL(isNaN(num) ? 0 : num);
                    }}
                    onBlur={(e) => {
                      // Ensure minimum value of 1 on blur
                      if (volumeL < 1) setVolumeL(1);
                    }}
                    className="text-4xl h-20 text-center font-bold"
                    min={1}
                    max={1000}
                  />
                  <span className="text-4xl font-bold text-foreground">Litros</span>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Receita Calculada */}
          <Card className="border-green-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                🧪 Receita de Fertilização para {volumeL}L
              </CardTitle>
              <CardDescription>Quantidades calculadas automaticamente baseadas no volume total</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Produtos */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Produtos</h3>
                {calculatedProducts.length === 0 ? (
                  <p className="text-muted-foreground">Flush (apenas água)</p>
                ) : (
                  <div className="grid gap-3">
                    {calculatedProducts.map((prod, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                        <div>
                          <p className="font-medium">{prod.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {prod.gPerLiter.toFixed(2)}g/L × {volumeL}L
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            NPK: {prod.npk}
                            {prod.ca > 0 && ` | Ca: ${prod.ca}%`}
                            {prod.mg > 0 && ` | Mg: ${prod.mg}%`}
                            {prod.fe > 0 && ` | Fe: ${prod.fe}%`}
                            {prod.s > 0 && ` | S: ${prod.s}%`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-2xl font-bold ${getProductColor(prod.name)}`}>{prod.totalG.toFixed(1)} g</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* NPK Total */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">NPK Total</h3>
                <div className="grid grid-cols-3 gap-3">
                  <Card className="bg-purple-500/10 dark:bg-purple-500/20 border-purple-500/30">
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Nitrogênio (N):</p>
                      <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{npkTotal.n} ppm</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-blue-500/10 dark:bg-blue-500/20 border-blue-500/30">
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Fósforo (P):</p>
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{npkTotal.p} ppm</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-green-500/10 dark:bg-green-500/20 border-green-500/30">
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Potássio (K):</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">{npkTotal.k} ppm</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
              
              {/* Micronutrientes */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Micronutrientes</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="bg-orange-500/10 dark:bg-orange-500/20 border-orange-500/30">
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Cálcio (Ca):</p>
                      <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{microsTotal.ca} ppm</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/30">
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Magnésio (Mg):</p>
                      <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{microsTotal.mg} ppm</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-yellow-500/10 dark:bg-yellow-500/20 border-yellow-500/30">
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Ferro (Fe):</p>
                      <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{microsTotal.fe} ppm</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/30">
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Enxofre (S):</p>
                      <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{microsTotal.s} ppm</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
              
              {/* EC */}
              <Card className="bg-blue-500/10 dark:bg-blue-500/20 border-blue-500/30">
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">EC Estimado:</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{ecEstimated} mS/cm</p>
                  <p className="text-sm text-muted-foreground mt-1">PPM Aproximado: {ppmApprox} ppm</p>
                </CardContent>
              </Card>
              
              {/* Ações */}
              <div className="flex gap-3">
                <Button onClick={exportRecipe} variant="outline" className="flex-1">
                  <Download className="w-4 h-4 mr-2" />
                  Exportar Receita (TXT)
                </Button>
                <Button 
                  onClick={saveRecipe} 
                  disabled={recordApplication.isPending}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {recordApplication.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar Receita"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="history" className="space-y-4">
          {/* Filtros */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Estufa</Label>
                <Select value={historyTentFilter} onValueChange={setHistoryTentFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Estufas</SelectItem>
                    {tents.data?.map((tent: any) => (
                      <SelectItem key={tent.id} value={tent.id.toString()}>
                        Estufa {tent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Fase</Label>
                <Select value={historyPhaseFilter} onValueChange={(v) => setHistoryPhaseFilter(v as Phase | "all")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Fases</SelectItem>
                    <SelectItem value="CLONING">🌱 Clonagem</SelectItem>
                    <SelectItem value="VEGA">🌿 Vegetativa</SelectItem>
                    <SelectItem value="FLORA">🌸 Floração</SelectItem>
                    <SelectItem value="MAINTENANCE">🔧 Manutenção</SelectItem>
                    <SelectItem value="DRYING">💨 Secagem</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-end">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setHistoryTentFilter("all");
                    setHistoryPhaseFilter("all");
                  }}
                  className="w-full"
                >
                  Limpar Filtros
                </Button>
              </div>
            </CardContent>
          </Card>
          
          {/* Lista de Receitas */}
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Receitas ({applications.data?.length || 0})</CardTitle>
              <CardDescription>Receitas salvas anteriormente</CardDescription>
            </CardHeader>
            <CardContent>
              {applications.isLoading ? (
                <p className="text-muted-foreground text-center py-8">Carregando...</p>
              ) : applications.data && applications.data.length > 0 ? (
                <Accordion type="single" collapsible className="w-full">
                  {applications.data.map((app: any, index: number) => {
                    const products = JSON.parse(app.productsJson || '[]');
                    const phaseNames = {
                      CLONING: "Clonagem",
                      VEGA: "Vegetativa",
                      FLORA: "Floração",
                      MAINTENANCE: "Manutenção",
                      DRYING: "Secagem",
                    };
                    const phaseIcons = {
                      CLONING: "🌱",
                      VEGA: "🌿",
                      FLORA: "🌸",
                      MAINTENANCE: "🔧",
                      DRYING: "💨",
                    };
                    
                    return (
                      <AccordionItem key={app.id} value={`item-${index}`} className="border-l-4 border-l-green-500 px-4">
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-start justify-between w-full pr-4">
                            <div className="text-left">
                              <p className="text-lg font-semibold">
                                {phaseIcons[app.phase as Phase]} {app.recipeName}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {phaseNames[app.phase as Phase]} • Semana {app.weekNumber || "N/A"} • {new Date(app.applicationDate).toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-green-600">{app.volumeTotalL}L</p>
                              <p className="text-sm text-muted-foreground">EC: {app.ecTarget ? Number(app.ecTarget).toFixed(2) : "N/A"} mS/cm</p>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4 pt-4">
                          {/* Produtos */}
                          <div>
                            <h4 className="font-semibold mb-2">Produtos:</h4>
                            <div className="grid gap-2">
                              {products.map((prod: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded">
                                  <div>
                                    <p className="font-medium text-sm">{prod.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {prod.gPerLiter?.toFixed(2) || (prod.totalG / app.volumeTotalL).toFixed(2)} g/L
                                    </p>
                                  </div>
                                  <p className={`font-bold ${getProductColor(prod.name)}`}>{prod.totalG?.toFixed(1) || prod.amountMl?.toFixed(1)}g</p>
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          {/* Notas */}
                          {app.notes && (
                            <div>
                              <h4 className="font-semibold mb-1">Notas:</h4>
                              <p className="text-sm text-muted-foreground">{app.notes}</p>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  Nenhuma receita encontrada. Salve uma receita na aba Calculadora para vê-la aqui.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </PageTransition>
  );
}
