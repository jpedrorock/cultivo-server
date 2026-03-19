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
import { Badge } from "@/components/ui/badge";
import { toast as showToast } from "sonner";
import { Beaker, Printer, Loader2, ArrowLeft, Download, Droplets, Zap, FlaskConical } from "lucide-react";
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

// Cores por produto para o layout colorido no app
const PRODUCT_COLORS: Record<string, { bg: string; border: string; badge: string; dot: string }> = {
  "Nitrato de Cálcio":           { bg: "bg-blue-50 dark:bg-blue-950/40",    border: "border-blue-200 dark:border-blue-800",    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",    dot: "bg-blue-500"   },
  "Nitrato de Potássio":         { bg: "bg-purple-50 dark:bg-purple-950/40", border: "border-purple-200 dark:border-purple-800", badge: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300", dot: "bg-purple-500" },
  "MKP (Fosfato Monopotássico)": { bg: "bg-orange-50 dark:bg-orange-950/40", border: "border-orange-200 dark:border-orange-800", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300", dot: "bg-orange-500" },
  "Sulfato de Magnésio":         { bg: "bg-teal-50 dark:bg-teal-950/40",    border: "border-teal-200 dark:border-teal-800",    badge: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",    dot: "bg-teal-500"   },
  "Micronutrientes":             { bg: "bg-rose-50 dark:bg-rose-950/40",    border: "border-rose-200 dark:border-rose-800",    badge: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",    dot: "bg-rose-500"   },
};
const DEFAULT_COLOR = { bg: "bg-gray-50 dark:bg-gray-900", border: "border-gray-200 dark:border-gray-700", badge: "bg-gray-100 text-gray-700", dot: "bg-gray-400" };

const getProductsByPhaseWeek = (phase: Phase, week: number) => {
  if (phase === "CLONING") return [
    { name: "Nitrato de Cálcio",           gPerLiter: 0.3,  npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
    { name: "Nitrato de Potássio",          gPerLiter: 0.2,  npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
    { name: "MKP (Fosfato Monopotássico)",  gPerLiter: 0.1,  npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
    { name: "Sulfato de Magnésio",          gPerLiter: 0.2,  npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
  ];
  if (phase === "VEGA") {
    const m = 0.7 + (Math.min(week, 4) / 4) * 0.3;
    return [
      { name: "Nitrato de Cálcio",           gPerLiter: 0.9  * m, npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
      { name: "Nitrato de Potássio",          gPerLiter: 0.4  * m, npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "MKP (Fosfato Monopotássico)",  gPerLiter: 0.19 * m, npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "Sulfato de Magnésio",          gPerLiter: 0.64 * m, npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
      { name: "Micronutrientes",              gPerLiter: 0.05 * m, npk: "0-0-0",    ca: 0,  mg: 0,  fe: 6, s: 0  },
    ];
  }
  if (phase === "FLORA") {
    const m = 0.8 + (Math.min(week, 8) / 8) * 0.4;
    return [
      { name: "Nitrato de Cálcio",           gPerLiter: 0.6  * m, npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
      { name: "Nitrato de Potássio",          gPerLiter: 0.6  * m, npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "MKP (Fosfato Monopotássico)",  gPerLiter: 0.4  * m, npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "Sulfato de Magnésio",          gPerLiter: 0.5  * m, npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
      { name: "Micronutrientes",              gPerLiter: 0.05 * m, npk: "0-0-0",    ca: 0,  mg: 0,  fe: 6, s: 0  },
    ];
  }
  if (phase === "MAINTENANCE") return [
    { name: "Nitrato de Cálcio",           gPerLiter: 0.5,  npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
    { name: "Nitrato de Potássio",          gPerLiter: 0.3,  npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
    { name: "MKP (Fosfato Monopotássico)",  gPerLiter: 0.15, npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
    { name: "Sulfato de Magnésio",          gPerLiter: 0.3,  npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
  ];
  return []; // DRYING — flush
};

// ── Gera PNG da nota fiscal via Canvas API puro otimizado para 58mm ──
function generateReceiptImage(
  phase: Phase,
  week: number,
  volumeL: number,
  calculatedProducts: Array<{ name: string; gPerLiter: number; totalG: number }>,
  ecEstimated: number,
  ppmApprox: number,
): string {
  // 58mm a 203dpi × 2 para qualidade = ~928px
  const S = 2; // scale
  const W = 464 * S;
  const PAD = 12 * S;
  const MONO = "'Courier New', Courier, monospace";

  // Tamanhos de fonte em px (já escalados)
  const FS_LG = 28 * S;  // título
  const FS = 24 * S;     // normal
  const FS_SM = 22 * S;  // pequeno
  const FS_XS = 18 * S;  // micro

  // Line heights fixos (não dependem de parseFloat)
  const LH_LG = 44 * S;
  const LH = 38 * S;
  const LH_SM = 34 * S;
  const LH_XS = 28 * S;

  // Calcular altura total
  const nItems = calculatedProducts.length;
  const H =
    PAD * 2 +
    LH_LG +          // APP CULTIVO
    LH_SM +          // subtítulo
    LH * 0.5 +       // espaço
    LH_SM * 4 +      // data/hora/fase/volume
    LH * 0.5 +
    LH +             // header tabela
    (nItems === 0 ? LH_SM : nItems * (LH_SM + LH_XS + LH * 0.4)) +
    LH * 0.5 +
    LH_SM * 2 +      // EC / PPM
    LH * 0.5 +
    LH_XS * 2 +      // instruções
    PAD;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = Math.ceil(H);
  const ctx = canvas.getContext("2d")!;

  // Fundo branco
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, canvas.height);

  let y = PAD;

  // ── Helpers ──
  const setFont = (size: number, bold = false) => {
    ctx.font = `${bold ? "bold " : ""}${size}px ${MONO}`;
  };

  const drawCenter = (text: string, size: number, bold = false, lh = LH) => {
    setFont(size, bold);
    ctx.fillStyle = "#000000";
    y += size; // baseline offset
    ctx.fillText(text, (W - ctx.measureText(text).width) / 2, y);
    y += lh - size;
  };

  const drawRow = (left: string, right: string, size: number, boldLeft = false, boldRight = true, lh = LH_SM) => {
    y += size;
    setFont(size, boldLeft);
    ctx.fillStyle = "#000000";
    ctx.fillText(left, PAD, y);
    setFont(size, boldRight);
    ctx.fillText(right, W - PAD - ctx.measureText(right).width, y);
    y += lh - size;
  };

  const drawLine = (thick = false, dashed = false) => {
    ctx.beginPath();
    ctx.setLineDash(dashed ? [6 * S, 4 * S] : []);
    ctx.lineWidth = thick ? 2 * S : 1 * S;
    ctx.strokeStyle = dashed ? "#aaaaaa" : "#000000";
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    ctx.setLineDash([]);
    y += LH * 0.45;
  };

  // ── Cabeçalho ──
  drawCenter("APP CULTIVO", FS_LG, true, LH_LG);
  drawCenter("RECEITA DE FERTILIZACAO", FS_SM, false, LH_SM);
  y += LH * 0.3;
  drawLine(true);

  // ── Dados ──
  const now = new Date();
  drawRow("Data:", now.toLocaleDateString("pt-BR"), FS_SM);
  drawRow("Hora:", now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), FS_SM);
  drawRow("Fase:", `${PHASE_NAMES[phase]} Sem.${week}`, FS_SM);
  drawRow("Volume:", `${volumeL} L`, FS_SM);
  y += LH * 0.3;
  drawLine(false, true);

  // ── Cabeçalho tabela ──
  y += FS;
  setFont(FS, true);
  ctx.fillStyle = "#000000";
  ctx.fillText("PRODUTO", PAD, y);
  ctx.fillText("QTDE", W - PAD - ctx.measureText("QTDE").width, y);
  y += LH - FS;
  drawLine(true);

  // ── Itens ──
  if (nItems === 0) {
    y += FS_SM;
    setFont(FS_SM, false);
    ctx.fillStyle = "#000000";
    const flush = "FLUSH - APENAS AGUA";
    ctx.fillText(flush, (W - ctx.measureText(flush).width) / 2, y);
    y += LH_SM - FS_SM;
  } else {
    calculatedProducts.forEach((prod, idx) => {
      // Nome + gramas
      y += FS_SM;
      setFont(FS_SM, true);
      ctx.fillStyle = "#000000";
      ctx.fillText(`${idx + 1}. ${prod.name}`, PAD, y);
      const grams = `${prod.totalG.toFixed(1)}g`;
      setFont(FS, true);
      ctx.fillText(grams, W - PAD - ctx.measureText(grams).width, y);
      y += LH_SM - FS_SM;

      // Dose por litro
      y += FS_XS;
      setFont(FS_XS, false);
      ctx.fillStyle = "#555555";
      ctx.fillText(`   ${prod.gPerLiter.toFixed(2)} g/L x ${volumeL} L`, PAD, y);
      ctx.fillStyle = "#000000";
      y += LH_XS - FS_XS;
      drawLine(false, true);
    });
  }

  // ── EC / PPM ──
  y += LH * 0.2;
  drawLine(true);
  drawRow("EC Estimado:", `${ecEstimated} mS/cm`, FS_SM, true, true);
  drawRow("PPM Aprox.:", `${ppmApprox} ppm`, FS_SM, false, false);
  y += LH * 0.3;
  drawLine(false, true);

  // ── Instruções ──
  y += FS_XS;
  setFont(FS_XS, false);
  ctx.fillStyle = "#555555";
  const i1 = "Adicionar na ordem listada";
  const i2 = "Ajustar pH para 5.8 - 6.2";
  ctx.fillText(i1, (W - ctx.measureText(i1).width) / 2, y);
  y += LH_XS;
  ctx.fillText(i2, (W - ctx.measureText(i2).width) / 2, y);

  return canvas.toDataURL("image/png");
}

export default function Nutrients() {
  const [phase, setPhase] = useState<Phase>("VEGA");
  const [week, setWeek] = useState(1);
  const [volumeL, setVolumeL] = useState(10);
  const [volumeStr, setVolumeStr] = useState("10");
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [selectedTentId, setSelectedTentId] = useState<string>("");
  const [historyTentFilter, setHistoryTentFilter] = useState<string>("all");
  const [historyPhaseFilter, setHistoryPhaseFilter] = useState<Phase | "all">("all");

  const tents = trpc.tents.list.useQuery();

  // Auto-selecionar a primeira estufa quando carregar
  const firstTentId = tents.data?.[0]?.id?.toString();
  const effectiveTentId = selectedTentId || firstTentId || "";

  const applications = trpc.nutrients.listApplications.useQuery(
    historyTentFilter !== "all" || historyPhaseFilter !== "all"
      ? {
          ...(historyTentFilter !== "all" && { tentId: Number(historyTentFilter) }),
          ...(historyPhaseFilter !== "all" && { phase: historyPhaseFilter }),
          limit: 50,
        }
      : { limit: 50 }
  );

  const products = getProductsByPhaseWeek(phase, week);
  const calculatedProducts = products.map(p => ({ ...p, totalG: p.gPerLiter * volumeL }));

  const calculateEC = () => {
    let ppm = 0;
    calculatedProducts.forEach(prod => {
      const [n, p, k] = prod.npk.split("-").map(Number);
      ppm += ((n + p + k) / 100) * prod.gPerLiter * 1000;
      ppm += (prod.ca / 100) * prod.gPerLiter * 1000;
      ppm += (prod.mg / 100) * prod.gPerLiter * 1000;
    });
    return Math.round((ppm / 700) * 100) / 100;
  };

  const ecEstimated = calculateEC();
  const ppmApprox = Math.round(ecEstimated * 640);

  const recordApplication = trpc.nutrients.recordApplication.useMutation({
    onSuccess: () => showToast.success("Receita salva com sucesso!"),
    onError: (error) => showToast.error(`Erro ao salvar: ${error.message}`),
  });

  const saveRecipe = () => {
    const tentId = Number(effectiveTentId);
    if (!tentId) {
      showToast.error("Selecione uma estufa antes de salvar");
      return;
    }
    recordApplication.mutate({
      tentId,
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

  // ── IMPRIMIR: abre janela com nota fiscal para impressora 58mm ──
  const printRecipe = () => {
    const now = new Date();
    const W = 32; // colunas para 58mm
    const hr = "-".repeat(W);
    const dhr = "=".repeat(W);
    const center = (s: string) => " ".repeat(Math.max(0, Math.floor((W - s.length) / 2))) + s;
    const row = (l: string, r: string) => l + " ".repeat(Math.max(1, W - l.length - r.length)) + r;

    const lines: string[] = [
      center("APP CULTIVO"),
      center("RECEITA FERTILIZACAO"),
      dhr,
      row("Data:", now.toLocaleDateString("pt-BR")),
      row("Hora:", now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })),
      row("Fase:", `${PHASE_NAMES[phase]} S.${week}`),
      row("Volume:", `${volumeL} L`),
      dhr,
      center("PRODUTOS"),
      hr,
    ];

    if (calculatedProducts.length === 0) {
      lines.push(center("FLUSH - APENAS AGUA"));
    } else {
      calculatedProducts.forEach((prod, i) => {
        const num = `${i + 1}.`;
        const grams = `${prod.totalG.toFixed(1)}g`;
        const maxName = W - num.length - grams.length - 2;
        const name = prod.name.length > maxName ? prod.name.slice(0, maxName - 1) + "." : prod.name;
        lines.push(row(`${num} ${name}`, grams));
        lines.push(`   ${prod.gPerLiter.toFixed(2)}g/L x ${volumeL}L`);
      });
    }

    lines.push(hr, row("EC:", `${ecEstimated} mS/cm`), row("PPM:", `${ppmApprox} ppm`), dhr, center("Adicionar na ordem"), center("pH: 5.8 - 6.2"), dhr, "");

    const win = window.open("", "_blank", "width=320,height=600");
    if (!win) { showToast.error("Permita pop-ups para imprimir"); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receita</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:11px;line-height:1.5;background:#fff;color:#000;padding:4px;width:58mm}pre{white-space:pre-wrap;word-break:break-word}@media print{body{width:58mm;padding:0}@page{margin:2mm;size:58mm auto}}</style></head><body><pre>${lines.join("\n")}</pre><script>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}<\/script></body></html>`);
    win.document.close();
  };

  // ── SALVAR IMAGEM: gera PNG 58mm via Canvas API puro ──
  const saveAsImage = () => {
    setIsSavingImage(true);
    try {
      const dataUrl = generateReceiptImage(phase, week, volumeL, calculatedProducts, ecEstimated, ppmApprox);
      const link = document.createElement("a");
      link.download = `receita-${PHASE_NAMES[phase].toLowerCase().replace(/\s/g, "-")}-sem${week}-${volumeL}L.png`;
      link.href = dataUrl;
      link.click();
      showToast.success("Imagem salva! Envie para a impressora.");
    } catch (e) {
      showToast.error("Erro ao gerar imagem");
    } finally {
      setIsSavingImage(false);
    }
  };

  return (
    <PageTransition>
      <div className="container py-6 max-w-5xl">
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Calculadoras", href: "/calculators" }, { label: "Fertilização" }]} />
        <Button variant="ghost" size="sm" onClick={() => window.history.back()} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />Voltar
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
                        {[1,2,3,4,5,6,7,8].map(w => (
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

            {/* ── RECEITA COLORIDA (layout do app) ── */}
            <Card className="border-green-500/40">
              <CardHeader className="pb-3">
                {/* Box arredondado verde em vez de tarja */}
                <div
                  className="rounded-2xl px-4 py-3 flex flex-col gap-1"
                  style={{ background: "linear-gradient(135deg, #16a34a, #10b981)" }}
                >
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-5 h-5 text-white shrink-0" />
                    <span className="text-base font-bold text-white leading-tight">
                      {PHASE_ICONS[phase]} Receita — {PHASE_NAMES[phase]} Semana {week} — {volumeL}L
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: "#d1fae5" }}>Adicione os produtos na ordem listada abaixo</p>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {/* EC / PPM */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                    <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">EC Estimado</p>
                      <p className="text-xl font-bold text-amber-700 dark:text-amber-300">{ecEstimated} <span className="text-xs font-normal">mS/cm</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-xl p-3">
                    <div className="w-9 h-9 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center shrink-0">
                      <Droplets className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">PPM Aprox.</p>
                      <p className="text-xl font-bold text-sky-700 dark:text-sky-300">{ppmApprox} <span className="text-xs font-normal">ppm</span></p>
                    </div>
                  </div>
                </div>

                {/* Lista de produtos colorida */}
                {calculatedProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Droplets className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="font-medium">FLUSH — Apenas Água</p>
                    <p className="text-sm">Nenhum nutriente necessário nesta fase</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {calculatedProducts.map((prod, idx) => {
                      const colors = PRODUCT_COLORS[prod.name] ?? DEFAULT_COLOR;
                      return (
                        <div key={idx} className={`flex items-center gap-3 rounded-xl border p-3 ${colors.bg} ${colors.border}`}>
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${colors.dot}`}>
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{prod.name}</p>
                            <p className="text-xs text-muted-foreground">{prod.gPerLiter.toFixed(2)} g/L × {volumeL} L</p>
                          </div>
                          <span className={`inline-block px-2.5 py-1 rounded-lg text-sm font-bold shrink-0 ${colors.badge}`}>
                            {prod.totalG.toFixed(1)} g
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="text-xs text-muted-foreground text-center pt-1">
                  Ajustar pH para <strong>5.8 – 6.2</strong> após diluição
                </p>

                {/* Seletor de estufa para salvar receita */}
                {tents.data && tents.data.length > 1 && (
                  <div className="pt-2">
                    <Select value={effectiveTentId} onValueChange={setSelectedTentId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecionar estufa para salvar" />
                      </SelectTrigger>
                      <SelectContent>
                        {tents.data.map((tent: any) => (
                          <SelectItem key={tent.id} value={tent.id.toString()}>
                            {tent.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Ações */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button onClick={printRecipe} variant="outline" className="w-full sm:flex-1">
                    <Printer className="w-4 h-4 mr-2 shrink-0" />
                    Imprimir
                  </Button>
                  <Button
                    onClick={saveAsImage}
                    disabled={isSavingImage}
                    variant="outline"
                    className="w-full sm:flex-1 border-green-500 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30"
                  >
                    {isSavingImage ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin shrink-0" />Gerando...</>
                    ) : (
                      <><Download className="w-4 h-4 mr-2 shrink-0" />Salvar Imagem (58mm)</>
                    )}
                  </Button>
                  <Button
                    onClick={saveRecipe}
                    disabled={recordApplication.isPending}
                    className="w-full sm:flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {recordApplication.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin shrink-0" />Salvando...</>
                    ) : "Salvar Receita"}
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
                        <SelectItem key={tent.id} value={tent.id.toString()}>Estufa {tent.name}</SelectItem>
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
                  <Button variant="outline" onClick={() => { setHistoryTentFilter("all"); setHistoryPhaseFilter("all"); }} className="w-full">
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
                                <p className="text-lg font-semibold">{PHASE_ICONS[app.phase as Phase]} {app.recipeName}</p>
                                <p className="text-sm text-muted-foreground">
                                  {PHASE_NAMES[app.phase as Phase]} • Semana {app.weekNumber || "N/A"} • {new Date(app.applicationDate).toLocaleDateString("pt-BR")}
                                </p>
                              </div>
                              <p className="text-2xl font-bold text-green-600 shrink-0 ml-2">{app.volumeTotalL}L</p>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-3 space-y-2">
                            {prods.map((prod: any, idx: number) => {
                              const colors = PRODUCT_COLORS[prod.name] ?? DEFAULT_COLOR;
                              return (
                                <div key={idx} className={`flex items-center gap-3 rounded-xl border p-2.5 ${colors.bg} ${colors.border}`}>
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ${colors.dot}`}>{idx + 1}</div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold truncate">{prod.name}</p>
                                  </div>
                                  <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${colors.badge}`}>
                                    {(prod.totalG ?? prod.amountMl)?.toFixed(1)} g
                                  </span>
                                </div>
                              );
                            })}
                            {app.ecTarget && (
                              <div className="flex items-center gap-2 pt-1">
                                <Badge variant="outline" className="text-amber-600 border-amber-300">EC: {app.ecTarget} mS/cm</Badge>
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
