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
import { Beaker, Printer, Loader2, ArrowLeft } from "lucide-react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PageTransition } from "@/components/PageTransition";

type Phase = "CLONING" | "VEGA" | "FLORA" | "MAINTENANCE" | "DRYING";

const PHASE_NAMES: Record<Phase, string> = {
  CLONING: "Clonagem",
  VEGA: "Vegetativa",
  FLORA: "Floração",
  MAINTENANCE: "Manutenção",
  DRYING: "Secagem",
};

const PHASE_ICONS: Record<Phase, string> = {
  CLONING: "🌱",
  VEGA: "🌿",
  FLORA: "🌸",
  MAINTENANCE: "🔧",
  DRYING: "💨",
};

// Produtos (sais minerais) pré-definidos por fase/semana com quantidades em g/L
const getProductsByPhaseWeek = (phase: Phase, week: number) => {
  if (phase === "CLONING") {
    return [
      { name: "Nitrato de Cálcio",          gPerLiter: 0.3,  npk: "15.5-0-0", ca: 19, mg: 0, fe: 0, s: 0 },
      { name: "Nitrato de Potássio",         gPerLiter: 0.2,  npk: "13-0-38",  ca: 0,  mg: 0, fe: 0, s: 0 },
      { name: "MKP (Fosfato Monopotássico)", gPerLiter: 0.1,  npk: "0-22-28",  ca: 0,  mg: 0, fe: 0, s: 0 },
      { name: "Sulfato de Magnésio",         gPerLiter: 0.2,  npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
    ];
  }

  if (phase === "VEGA") {
    const vegaWeek = Math.min(week, 4);
    const m = 0.7 + (vegaWeek / 4) * 0.3;
    return [
      { name: "Nitrato de Cálcio",          gPerLiter: 0.9  * m, npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
      { name: "Nitrato de Potássio",         gPerLiter: 0.4  * m, npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "MKP (Fosfato Monopotássico)", gPerLiter: 0.19 * m, npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "Sulfato de Magnésio",         gPerLiter: 0.64 * m, npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
      { name: "Micronutrientes",             gPerLiter: 0.05 * m, npk: "0-0-0",    ca: 0,  mg: 0,  fe: 6, s: 0  },
    ];
  }

  if (phase === "FLORA") {
    const floraWeek = Math.min(week, 8);
    const m = 0.8 + (floraWeek / 8) * 0.4;
    return [
      { name: "Nitrato de Cálcio",          gPerLiter: 0.6  * m, npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
      { name: "Nitrato de Potássio",         gPerLiter: 0.6  * m, npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "MKP (Fosfato Monopotássico)", gPerLiter: 0.4  * m, npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "Sulfato de Magnésio",         gPerLiter: 0.5  * m, npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
      { name: "Micronutrientes",             gPerLiter: 0.05 * m, npk: "0-0-0",    ca: 0,  mg: 0,  fe: 6, s: 0  },
    ];
  }

  if (phase === "MAINTENANCE") {
    return [
      { name: "Nitrato de Cálcio",          gPerLiter: 0.5,  npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
      { name: "Nitrato de Potássio",         gPerLiter: 0.3,  npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "MKP (Fosfato Monopotássico)", gPerLiter: 0.15, npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "Sulfato de Magnésio",         gPerLiter: 0.3,  npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
    ];
  }

  return []; // DRYING — flush
};

export default function Nutrients() {
  const [phase, setPhase] = useState<Phase>("VEGA");
  const [week, setWeek] = useState(1);
  const [volumeL, setVolumeL] = useState(10);
  const [volumeStr, setVolumeStr] = useState("10");

  // Histórico
  const [historyTentFilter, setHistoryTentFilter] = useState<string>("all");
  const [historyPhaseFilter, setHistoryPhaseFilter] = useState<Phase | "all">("all");

  const tents = trpc.tents.list.useQuery();
  const applications = trpc.nutrients.listApplications.useQuery({
    tentId: historyTentFilter !== "all" ? Number(historyTentFilter) : undefined,
    phase: historyPhaseFilter !== "all" ? historyPhaseFilter : undefined,
    limit: 50,
  });

  const products = getProductsByPhaseWeek(phase, week);

  const calculatedProducts = products.map(p => ({
    ...p,
    totalG: p.gPerLiter * volumeL,
  }));

  // EC estimado
  const calculateEC = () => {
    let ppm = 0;
    calculatedProducts.forEach(prod => {
      const [n, p, k] = prod.npk.split("-").map(Number);
      const g = prod.gPerLiter;
      ppm += ((n + p + k) / 100) * g * 1000;
      ppm += (prod.ca / 100) * g * 1000;
      ppm += (prod.mg / 100) * g * 1000;
    });
    return Math.round((ppm / 700) * 100) / 100;
  };

  const ecEstimated = calculateEC();
  const ppmApprox = Math.round(ecEstimated * 640);

  // Mutation para salvar receita
  const recordApplication = trpc.nutrients.recordApplication.useMutation({
    onSuccess: () => showToast.success("Receita salva com sucesso!"),
    onError: (error) => showToast.error(`Erro ao salvar receita: ${error.message}`),
  });

  const saveRecipe = () => {
    recordApplication.mutate({
      tentId: 1,
      cycleId: null,
      recipeTemplateId: null,
      recipeName: `${PHASE_NAMES[phase]} Semana ${week}`,
      phase,
      weekNumber: week,
      volumeTotalL: volumeL,
      ecTarget: ecEstimated,
      ecActual: null,
      phTarget: 6.0,
      phActual: null,
      products: calculatedProducts.map(p => ({
        name: p.name,
        amountMl: p.totalG,
        npk: p.npk,
        ca: p.ca,
        mg: p.mg,
        fe: p.fe,
      })),
      notes: `Receita gerada automaticamente para ${PHASE_NAMES[phase]} Semana ${week}`,
    });
  };

  // Imprimir receita estilo nota fiscal
  const printRecipe = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("pt-BR");
    const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const lines: string[] = [];
    const W = 40; // largura em caracteres (80mm ≈ 40 chars)
    const hr = "-".repeat(W);
    const dhr = "=".repeat(W);

    const center = (s: string) => {
      const pad = Math.max(0, Math.floor((W - s.length) / 2));
      return " ".repeat(pad) + s;
    };

    const row = (left: string, right: string) => {
      const space = W - left.length - right.length;
      return left + " ".repeat(Math.max(1, space)) + right;
    };

    lines.push(center("APP CULTIVO"));
    lines.push(center("RECEITA DE FERTILIZACAO"));
    lines.push(dhr);
    lines.push(row("Data:", dateStr));
    lines.push(row("Hora:", timeStr));
    lines.push(row("Fase:", `${PHASE_NAMES[phase]} Sem.${week}`));
    lines.push(row("Volume:", `${volumeL} L`));
    lines.push(dhr);
    lines.push(center("PRODUTOS"));
    lines.push(hr);

    if (calculatedProducts.length === 0) {
      lines.push(center("FLUSH - APENAS AGUA"));
    } else {
      calculatedProducts.forEach((prod, i) => {
        const num = `${i + 1}.`;
        const grams = `${prod.totalG.toFixed(1)}g`;
        const maxName = W - num.length - grams.length - 2;
        const name = prod.name.length > maxName ? prod.name.slice(0, maxName - 1) + "." : prod.name;
        lines.push(row(`${num} ${name}`, grams));
        lines.push(`   (${prod.gPerLiter.toFixed(2)} g/L x ${volumeL} L)`);
      });
    }

    lines.push(hr);
    lines.push(row("EC Estimado:", `${ecEstimated} mS/cm`));
    lines.push(row("PPM Aprox.:", `${ppmApprox} ppm`));
    lines.push(dhr);
    lines.push(center("Adicionar na ordem listada"));
    lines.push(center("Ajustar pH para 5.8-6.2"));
    lines.push(dhr);
    lines.push("");

    const content = lines.join("\n");

    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) {
      showToast.error("Permita pop-ups para imprimir");
      return;
    }

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receita - ${PHASE_NAMES[phase]} Sem.${week}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      line-height: 1.5;
      background: #fff;
      color: #000;
      padding: 8px;
      width: 80mm;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
    }
    @media print {
      body { width: 80mm; padding: 0; }
      @page { margin: 4mm; size: 80mm auto; }
    }
  </style>
</head>
<body>
  <pre>${content}</pre>
  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() { window.close(); }, 500);
    };
  </script>
</body>
</html>`);
    win.document.close();
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
          <TabsList>
            <TabsTrigger value="calculator">🧪 Calculadora</TabsTrigger>
            <TabsTrigger value="history">📋 Histórico</TabsTrigger>
          </TabsList>

          {/* ── CALCULADORA ── */}
          <TabsContent value="calculator" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Fase e Semana */}
              <Card>
                <CardHeader>
                  <CardTitle>1. Fase e Semana</CardTitle>
                  <CardDescription>O sistema calculará automaticamente os produtos e quantidades</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Fase</Label>
                    <Select value={phase} onValueChange={(v) => setPhase(v as Phase)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
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
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(w => (
                          <SelectItem key={w} value={w.toString()}>Semana {w}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Volume */}
              <Card className="border-green-500/30">
                <CardHeader>
                  <CardTitle className="text-2xl">2. Volume da solução</CardTitle>
                  <CardDescription>Digite o volume total em litros</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={volumeStr}
                      onChange={(e) => {
                        const val = e.target.value;
                        const sanitized = val.replace(",", ".");
                        if (sanitized === "" || /^\d*\.?\d*$/.test(sanitized)) {
                          setVolumeStr(sanitized);
                          const num = parseFloat(sanitized);
                          if (!isNaN(num) && num > 0) setVolumeL(num);
                        }
                      }}
                      onBlur={() => {
                        const num = parseFloat(volumeStr);
                        const safe = isNaN(num) || num < 0.1 ? 1 : num;
                        setVolumeStr(String(safe));
                        setVolumeL(safe);
                      }}
                      className="text-4xl h-20 text-center font-bold"
                    />
                    <span className="text-4xl font-bold text-foreground">L</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── RECEITA ESTILO NOTA FISCAL ── */}
            <Card className="border-green-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  🧾 Receita — {PHASE_NAMES[phase]} Semana {week} — {volumeL}L
                </CardTitle>
                <CardDescription>Adicione os produtos na ordem listada</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Bloco nota fiscal */}
                <div
                  className="font-mono text-sm bg-white dark:bg-gray-950 border border-dashed border-gray-400 rounded-lg p-4 select-all"
                  style={{ fontFamily: "'Courier New', Courier, monospace", lineHeight: "1.6" }}
                >
                  {/* Cabeçalho */}
                  <div className="text-center font-bold text-base border-b-2 border-black dark:border-white pb-2 mb-2">
                    APP CULTIVO
                    <div className="text-xs font-normal">RECEITA DE FERTILIZACAO</div>
                  </div>

                  {/* Dados */}
                  <div className="text-xs space-y-0.5 border-b border-dashed border-gray-400 pb-2 mb-2">
                    <div className="flex justify-between">
                      <span>Data:</span>
                      <span>{new Date().toLocaleDateString("pt-BR")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Fase:</span>
                      <span>{PHASE_NAMES[phase]} — Semana {week}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Volume:</span>
                      <span className="font-bold">{volumeL} L</span>
                    </div>
                  </div>

                  {/* Cabeçalho da tabela */}
                  <div className="flex justify-between text-xs font-bold border-b border-gray-400 pb-1 mb-1">
                    <span>PRODUTO</span>
                    <span>QUANTIDADE</span>
                  </div>

                  {/* Itens */}
                  {calculatedProducts.length === 0 ? (
                    <div className="text-center py-3 text-sm">FLUSH — APENAS ÁGUA</div>
                  ) : (
                    <div className="space-y-2">
                      {calculatedProducts.map((prod, idx) => (
                        <div key={idx} className="border-b border-dotted border-gray-300 pb-1">
                          <div className="flex justify-between items-baseline">
                            <span className="text-xs font-semibold">{idx + 1}. {prod.name}</span>
                            <span className="text-sm font-bold ml-2 shrink-0">{prod.totalG.toFixed(1)} g</span>
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400 pl-3">
                            {prod.gPerLiter.toFixed(2)} g/L × {volumeL} L
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Rodapé */}
                  <div className="border-t-2 border-black dark:border-white mt-3 pt-2 space-y-0.5 text-xs">
                    <div className="flex justify-between font-bold">
                      <span>EC Estimado:</span>
                      <span>{ecEstimated} mS/cm</span>
                    </div>
                    <div className="flex justify-between">
                      <span>PPM Aprox.:</span>
                      <span>{ppmApprox} ppm</span>
                    </div>
                  </div>

                  <div className="text-center text-[11px] text-gray-500 dark:text-gray-400 mt-3 border-t border-dashed border-gray-300 pt-2">
                    Adicionar na ordem listada
                    <br />Ajustar pH para 5.8 – 6.2
                  </div>
                </div>

                {/* Ações */}
                <div className="flex flex-col sm:flex-row gap-3 mt-4">
                  <Button onClick={printRecipe} variant="outline" className="w-full sm:flex-1">
                    <Printer className="w-4 h-4 mr-2 shrink-0" />
                    Imprimir Receita
                  </Button>
                  <Button
                    onClick={saveRecipe}
                    disabled={recordApplication.isPending}
                    className="w-full sm:flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {recordApplication.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin shrink-0" />Salvando...</>
                    ) : (
                      "Salvar Receita"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── HISTÓRICO ── */}
          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Filtros</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Estufa</Label>
                  <Select value={historyTentFilter} onValueChange={setHistoryTentFilter}>
                    <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
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
                    <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as Fases</SelectItem>
                      {(Object.keys(PHASE_NAMES) as Phase[]).map(p => (
                        <SelectItem key={p} value={p}>{PHASE_ICONS[p]} {PHASE_NAMES[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => { setHistoryTentFilter("all"); setHistoryPhaseFilter("all"); }}
                    className="w-full"
                  >
                    Limpar Filtros
                  </Button>
                </div>
              </CardContent>
            </Card>

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
                      const prods = JSON.parse(app.productsJson || "[]");
                      return (
                        <AccordionItem key={app.id} value={`item-${index}`} className="border-l-4 border-l-green-500 px-4">
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-start justify-between w-full pr-4">
                              <div className="text-left">
                                <p className="text-lg font-semibold">
                                  {PHASE_ICONS[app.phase as Phase]} {app.recipeName}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {PHASE_NAMES[app.phase as Phase]} • Semana {app.weekNumber || "N/A"} • {new Date(app.applicationDate).toLocaleDateString("pt-BR")}
                                </p>
                              </div>
                              <p className="text-2xl font-bold text-green-600 shrink-0 ml-2">{app.volumeTotalL}L</p>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-4">
                            {/* Mini nota fiscal no histórico */}
                            <div
                              className="font-mono text-xs bg-white dark:bg-gray-950 border border-dashed border-gray-400 rounded p-3"
                              style={{ fontFamily: "'Courier New', Courier, monospace", lineHeight: "1.6" }}
                            >
                              <div className="flex justify-between font-bold border-b border-gray-300 pb-1 mb-2">
                                <span>PRODUTO</span>
                                <span>QTDE</span>
                              </div>
                              {prods.map((prod: any, idx: number) => (
                                <div key={idx} className="flex justify-between border-b border-dotted border-gray-200 py-0.5">
                                  <span>{idx + 1}. {prod.name}</span>
                                  <span className="font-bold ml-2 shrink-0">
                                    {(prod.totalG ?? prod.amountMl)?.toFixed(1)}g
                                  </span>
                                </div>
                              ))}
                              {app.ecTarget && (
                                <div className="flex justify-between mt-2 pt-1 border-t border-gray-300 font-bold">
                                  <span>EC:</span>
                                  <span>{app.ecTarget} mS/cm</span>
                                </div>
                              )}
                            </div>
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
