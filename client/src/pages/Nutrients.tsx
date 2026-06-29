import React, { useState, useEffect } from "react";
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
import { Beaker, Printer, Loader2, Download, Droplets, Droplet, Zap, FlaskConical, Sprout, Leaf, Flower2, Flame, Wrench, Wind, ClipboardList, ArrowUpDown, ArrowUp, TrendingUp, TrendingDown, Minus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { CalcEyebrow, CalcRunning } from "@/components/ui/calc-helpers";
import { PageTransition } from "@/components/PageTransition";
import { diagnoseNutrients, type PlantSymptom, type DiagnosisResult } from "@/lib/nutrientDiagnosis";

// Chips de sintoma do diagnóstico (override sobre a receita Kroma).
const SYMPTOM_CHIPS: { id: PlantSymptom; label: string; Icon: typeof Leaf; color: string }[] = [
  { id: "chlorosis_new", label: "Folhas novas amareladas", Icon: Leaf, color: "text-yellow-400" },
  { id: "chlorosis_old", label: "Folhas velhas amareladas", Icon: Leaf, color: "text-amber-500" },
  { id: "necrosis_tips", label: "Pontas queimadas", Icon: Flame, color: "text-orange-500" },
  { id: "twist_curl", label: "Folhas enroladas", Icon: Wind, color: "text-sky-400" },
  { id: "dark_green", label: "Verde muito escuro", Icon: Leaf, color: "text-green-600" },
  { id: "wilting", label: "Murcha", Icon: Droplet, color: "text-blue-400" },
];

type Phase = "CLONING" | "VEGA" | "PRE_FLORA" | "FLORA" | "MAINTENANCE" | "DRYING";

const PHASE_NAMES: Record<Phase, string> = {
  CLONING: "Clonagem",
  VEGA: "Vegetativa",
  PRE_FLORA: "Pré-flora",
  FLORA: "Floração",
  MAINTENANCE: "Manutenção",
  DRYING: "Secagem",
};

const PHASE_ICONS: Record<Phase, React.ReactElement> = {
  CLONING: <Sprout className="w-4 h-4 text-green-400 inline"/>,
  VEGA: <Leaf className="w-4 h-4 text-emerald-400 inline"/>,
  PRE_FLORA: <Flower2 className="w-4 h-4 text-fuchsia-300 inline"/>,
  FLORA: <Flower2 className="w-4 h-4 text-purple-400 inline"/>,
  MAINTENANCE: <Wrench className="w-4 h-4 text-blue-400 inline"/>,
  DRYING: <Wind className="w-4 h-4 text-amber-400 inline"/>,
};

// Cores por produto — estilo neon dark
const PRODUCT_COLORS: Record<string, { bg: string; border: string; badge: string; dot: string }> = {
  "Nitrato de Cálcio":           { bg: "bg-blue-500/8",    border: "border-blue-400/25",    badge: "bg-blue-500/15 text-blue-300",    dot: "bg-blue-400"   },
  "Nitrato de Potássio":         { bg: "bg-purple-500/8",  border: "border-purple-400/25",  badge: "bg-purple-500/15 text-purple-300", dot: "bg-purple-400" },
  "MKP (Fosfato Monopotássico)": { bg: "bg-orange-500/8",  border: "border-orange-400/25",  badge: "bg-orange-500/15 text-orange-300", dot: "bg-orange-400" },
  "Sulfato de Magnésio":         { bg: "bg-teal-500/8",    border: "border-teal-400/25",    badge: "bg-teal-500/15 text-teal-300",    dot: "bg-teal-400"   },
  "Micronutrientes":             { bg: "bg-rose-500/8",    border: "border-rose-400/25",    badge: "bg-rose-500/15 text-rose-300",    dot: "bg-rose-400"   },
  "Óxido de Cálcio":            { bg: "bg-cyan-500/8",    border: "border-cyan-400/25",    badge: "bg-cyan-500/15 text-cyan-300",    dot: "bg-cyan-400"   },
};
const DEFAULT_COLOR = { bg: "bg-muted/20", border: "border-border/50", badge: "bg-muted/30 text-muted-foreground", dot: "bg-muted-foreground" };

const getProductsByPhaseWeek = (phase: Phase, week: number) => {
  if (phase === "CLONING") return [
    { name: "Nitrato de Cálcio",           gPerLiter: 0.3,  npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
    { name: "Nitrato de Potássio",          gPerLiter: 0.2,  npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
    { name: "MKP (Fosfato Monopotássico)",  gPerLiter: 0.1,  npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
    { name: "Sulfato de Magnésio",          gPerLiter: 0.2,  npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
  ];
  if (phase === "VEGA") {
    // Receita Vega Kroma (@kromafarms) — planilha do João. Receita única.
    return [
      { name: "Nitrato de Cálcio",           gPerLiter: 1.12, npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
      { name: "Nitrato de Potássio",          gPerLiter: 0.50, npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "MKP (Fosfato Monopotássico)",  gPerLiter: 0.24, npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "Sulfato de Magnésio",          gPerLiter: 0.80, npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
      { name: "Micronutrientes",              gPerLiter: 0.06, npk: "0-0-0",    ca: 0,  mg: 0,  fe: 6, s: 0  },
    ];
  }
  if (phase === "PRE_FLORA") {
    // Pré-flora = transição Vega → Flora. Receita intermediária pra não estressar:
    // só o MKP sobe pela metade (0,24 → 0,37 → 0,50), Ca/Mg/micros iguais. EC ~2,58.
    return [
      { name: "Nitrato de Cálcio",           gPerLiter: 1.12, npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
      { name: "Nitrato de Potássio",          gPerLiter: 0.50, npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "MKP (Fosfato Monopotássico)",  gPerLiter: 0.37, npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "Sulfato de Magnésio",          gPerLiter: 0.80, npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
      { name: "Micronutrientes",              gPerLiter: 0.06, npk: "0-0-0",    ca: 0,  mg: 0,  fe: 6, s: 0  },
    ];
  }
  if (phase === "FLORA") {
    // Receitas Flora Kroma (@kromafarms) — planilha do João, fonte da verdade.
    // 3 blocos: Flora 1–3 (stretch), Flora 4–7 (bulking) e Finalização.
    // A semana selecionada carrega o bloco Kroma correspondente.
    if (week <= 3) {
      // Flora 1–3 (EC Kroma 2,67)
      return [
        { name: "Nitrato de Cálcio",           gPerLiter: 1.12, npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
        { name: "Nitrato de Potássio",          gPerLiter: 0.50, npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
        { name: "MKP (Fosfato Monopotássico)",  gPerLiter: 0.50, npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
        { name: "Sulfato de Magnésio",          gPerLiter: 0.80, npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
        { name: "Micronutrientes",              gPerLiter: 0.06, npk: "0-0-0",    ca: 0,  mg: 0,  fe: 6, s: 0  },
      ];
    }
    if (week <= 7) {
      // Flora 4–7 (EC ~2,40) — Nitrato de Cálcio em 0,90 g/L: meio-termo entre o
      // 0,70 da planilha Kroma e o 1,12 do stretch. A Kroma assume acúmulo de N
      // das semanas 1–3, mas substrato pequeno/runoff baixo não acumula → 0,70
      // causava clorose em folhas novas (def. de N) na semana 6–7. 0,90 é o mínimo
      // seguro; o diagnóstico por sintomas sobe pra 1,12 se houver clorose nova.
      return [
        { name: "Nitrato de Cálcio",           gPerLiter: 0.90, npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
        { name: "Nitrato de Potássio",          gPerLiter: 0.50, npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
        { name: "MKP (Fosfato Monopotássico)",  gPerLiter: 0.50, npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
        { name: "Sulfato de Magnésio",          gPerLiter: 0.80, npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
        { name: "Micronutrientes",              gPerLiter: 0.06, npk: "0-0-0",    ca: 0,  mg: 0,  fe: 6, s: 0  },
      ];
    }
    // Finalização (EC Kroma 2,00) — entra Óxido de Cálcio (receita Kroma)
    return [
      { name: "Nitrato de Cálcio",           gPerLiter: 0.15, npk: "15.5-0-0", ca: 19, mg: 0,  fe: 0, s: 0  },
      { name: "Óxido de Cálcio",             gPerLiter: 0.45, npk: "0-0-0",    ca: 71, mg: 0,  fe: 0, s: 0  },
      { name: "Nitrato de Potássio",          gPerLiter: 0.55, npk: "13-0-38",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "MKP (Fosfato Monopotássico)",  gPerLiter: 0.55, npk: "0-22-28",  ca: 0,  mg: 0,  fe: 0, s: 0  },
      { name: "Sulfato de Magnésio",          gPerLiter: 0.80, npk: "0-0-0",    ca: 0,  mg: 10, fe: 0, s: 13 },
      { name: "Micronutrientes",              gPerLiter: 0.06, npk: "0-0-0",    ca: 0,  mg: 0,  fe: 6, s: 0  },
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

// EC de referência da receita — vem da planilha Kroma (Vega/Pré-flora/Flora);
// fases sem receita Kroma usam o modelo linear (Σg/L × 0,91) como fallback.
function recipeEC(phase: Phase, week: number, products: { gPerLiter: number }[]): number {
  if (phase === "VEGA") return 2.49;
  if (phase === "PRE_FLORA") return 2.58;
  if (phase === "FLORA") return week <= 3 ? 2.67 : week <= 7 ? 2.40 : 2.00;
  const totalGPerL = products.reduce((s, p) => s + p.gPerLiter, 0);
  return Math.round(totalGPerL * 0.91 * 100) / 100;
}

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

// ── Compare Tab ───────────────────────────────────────────────────────────────

function RecipeSelector({ label, phase, week, onPhase, onWeek }: {
  label: string;
  phase: Phase;
  week: number;
  onPhase: (p: Phase) => void;
  onWeek: (w: number) => void;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2 flex-1 min-w-0">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <Select value={phase} onValueChange={(v) => onPhase(v as Phase)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="CLONING">Clonagem</SelectItem>
          <SelectItem value="VEGA">Vegetativa</SelectItem>
          <SelectItem value="PRE_FLORA">Pré-flora</SelectItem>
          <SelectItem value="FLORA">Floração</SelectItem>
          <SelectItem value="MAINTENANCE">Manutenção</SelectItem>
          <SelectItem value="DRYING">Secagem</SelectItem>
        </SelectContent>
      </Select>
      <Select value={week.toString()} onValueChange={(v) => onWeek(Number(v))}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {[1,2,3,4,5,6,7,8].map(w => (
            <SelectItem key={w} value={w.toString()}>Semana {w}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block ${
        phase === 'VEGA' ? 'bg-emerald-500/15 text-emerald-400' :
        phase === 'FLORA' ? 'bg-purple-500/15 text-purple-400' :
        'bg-muted/40 text-muted-foreground'
      }`}>{PHASE_NAMES[phase]} · Sem. {week}</p>
    </div>
  );
}

function CompareTab() {
  const [leftPhase, setLeftPhase]   = useState<Phase>("VEGA");
  const [leftWeek, setLeftWeek]     = useState(1);
  const [rightPhase, setRightPhase] = useState<Phase>("FLORA");
  const [rightWeek, setRightWeek]   = useState(1);
  const [volume, setVolume]         = useState(10);

  const leftProds  = getProductsByPhaseWeek(leftPhase,  leftWeek).map(p => ({ ...p, totalG: p.gPerLiter * volume }));
  const rightProds = getProductsByPhaseWeek(rightPhase, rightWeek).map(p => ({ ...p, totalG: p.gPerLiter * volume }));

  // Unified product name list
  const allNames = Array.from(new Set([...leftProds.map(p => p.name), ...rightProds.map(p => p.name)]));

  const getAmt = (prods: typeof leftProds, name: string) =>
    prods.find(p => p.name === name)?.totalG ?? 0;

  return (
    <div className="space-y-4">
      {/* Config row */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-primary" />
            Configuração da comparação
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="flex gap-3">
            <RecipeSelector label="Receita A" phase={leftPhase}  week={leftWeek}  onPhase={setLeftPhase}  onWeek={setLeftWeek} />
            <div className="flex items-center shrink-0 self-center mt-4">
              <span className="text-lg font-bold text-muted-foreground/40">vs</span>
            </div>
            <RecipeSelector label="Receita B" phase={rightPhase} week={rightWeek} onPhase={setRightPhase} onWeek={setRightWeek} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs shrink-0 text-muted-foreground">Volume (L)</Label>
            <Input
              type="number"
              min={1}
              value={volume}
              onChange={e => setVolume(Math.max(1, Number(e.target.value)))}
              className="w-20 h-7 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Comparison table */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Comparativo de doses</CardTitle>
          <CardDescription className="text-xs">
            {PHASE_NAMES[leftPhase]} Sem.{leftWeek} vs {PHASE_NAMES[rightPhase]} Sem.{rightWeek} · {volume}L
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-4">
          {/* Header */}
          <div className="grid grid-cols-[1fr,auto,auto,auto] gap-0 text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 pb-1 border-b border-border/40">
            <span>Produto</span>
            <span className="w-14 text-right text-emerald-400">{PHASE_NAMES[leftPhase].slice(0,4)} S{leftWeek}</span>
            <span className="w-14 text-right text-purple-400">{PHASE_NAMES[rightPhase].slice(0,4)} S{rightWeek}</span>
            <span className="w-8 text-center">Δ</span>
          </div>
          <div className="divide-y divide-border/20">
            {allNames.map(name => {
              const L = getAmt(leftProds, name);
              const R = getAmt(rightProds, name);
              const diff = R - L;
              const pct = L > 0 ? Math.round((diff / L) * 100) : R > 0 ? 100 : 0;
              const colors = PRODUCT_COLORS[name] ?? DEFAULT_COLOR;
              return (
                <div key={name} className={`grid grid-cols-[1fr,auto,auto,auto] gap-0 items-center px-4 py-2.5 ${colors.bg}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
                    <span className="text-xs font-medium truncate">{name}</span>
                  </div>
                  <span className="w-14 text-right text-xs font-mono text-emerald-300">
                    {L > 0 ? `${L.toFixed(1)}g` : '—'}
                  </span>
                  <span className="w-14 text-right text-xs font-mono text-purple-300">
                    {R > 0 ? `${R.toFixed(1)}g` : '—'}
                  </span>
                  <span className="w-8 flex justify-center">
                    {diff === 0 || (L === 0 && R === 0) ? (
                      <Minus className="w-3 h-3 text-muted-foreground/40" />
                    ) : diff > 0 ? (
                      <span title={`+${pct}%`}><TrendingUp className="w-3 h-3 text-amber-400" /></span>
                    ) : (
                      <span title={`${pct}%`}><TrendingDown className="w-3 h-3 text-sky-400" /></span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* EC comparison */}
          {(() => {
            const ecL = recipeEC(leftPhase, leftWeek, leftProds);
            const ecR = recipeEC(rightPhase, rightWeek, rightProds);
            return (
              <div className="mx-4 mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/20 px-3 py-2 text-center">
                  <p className="text-xs text-emerald-400 font-semibold uppercase">EC Receita A</p>
                  <p className="text-lg font-bold text-emerald-300">{ecL} <span className="text-xs font-normal">mS/cm</span></p>
                </div>
                <div className="rounded-lg bg-purple-500/8 border border-purple-500/20 px-3 py-2 text-center">
                  <p className="text-xs text-purple-400 font-semibold uppercase">EC Receita B</p>
                  <p className="text-lg font-bold text-purple-300">{ecR} <span className="text-xs font-normal">mS/cm</span></p>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}

// Alvo de EC por bloco de flora Kroma (mS/cm) — direto da planilha do João.
// 3 blocos: Flora 1–3 (2,67), Flora 4–7 (2,28), Finalização (2,00).
// Reutilizado pelo seletor, pela receita e pelo painel de alertas de EC.
function floraTarget(week: number): { mid: number; min: number; max: number } {
  if (week <= 3) return { mid: 2.67, min: 2.5, max: 2.8 };
  if (week <= 7) return { mid: 2.40, min: 2.2, max: 2.6 };
  return { mid: 2.00, min: 1.8, max: 2.1 };
}

function getFloraSubphase(week: number): { label: string; ecTarget: string } {
  if (week <= 3) return { label: "Flora 1–3 (Stretch)", ecTarget: "EC 2,67" };
  if (week <= 7) return { label: "Flora 4–7 (Bulking)", ecTarget: "EC 2,40" };
  return { label: "Finalização", ecTarget: "EC 2,00" };
}

export default function Nutrients() {
  const [phase, setPhase] = useState<Phase>("VEGA");
  const [week, setWeek] = useState(1);
  const [volumeL, setVolumeL] = useState(10);
  const [volumeStr, setVolumeStr] = useState("10");
  const [ecMeasuredStr, setEcMeasuredStr] = useState(""); // EC real medido (opcional)
  // Diagnóstico por sintomas + runoff.
  const [symptoms, setSymptoms] = useState<PlantSymptom[]>([]);
  const [runoffPhStr, setRunoffPhStr] = useState("");
  const [runoffEcStr, setRunoffEcStr] = useState("");
  const [diag, setDiag] = useState<DiagnosisResult | null>(null);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [selectedTentId, setSelectedTentId] = useState<string>("");
  const [historyTentFilter, setHistoryTentFilter] = useState<string>("all");
  const [historyPhaseFilter, setHistoryPhaseFilter] = useState<Phase | "all">("all");

  const tents = trpc.tents.list.useQuery();
  const { data: activeCycles } = trpc.cycles.listActive.useQuery();

  // Auto-selecionar a primeira estufa quando carregar
  const firstTentId = tents.data?.[0]?.id?.toString();
  const effectiveTentId = selectedTentId || firstTentId || "";

  // Auto-detectar fase e semana do ciclo ativo da estufa selecionada
  useEffect(() => {
    if (!activeCycles?.length) return;
    const tentIdNum = effectiveTentId ? Number(effectiveTentId) : activeCycles[0]?.tentId;
    const cycle = activeCycles.find((c: any) => c.tentId === tentIdNum) ?? activeCycles[0];
    if (!cycle) return;

    // Detectar fase (flora > pré-flora > vega)
    const detectedPhase: Phase = cycle.floraStartDate
      ? "FLORA"
      : cycle.preFloraStartDate
      ? "PRE_FLORA"
      : "VEGA";
    setPhase(detectedPhase);

    // Calcular semana atual (a partir da data da fase detectada)
    const now = new Date();
    const refDate = cycle.floraStartDate
      ? new Date(cycle.floraStartDate)
      : cycle.preFloraStartDate
      ? new Date(cycle.preFloraStartDate)
      : new Date(cycle.startDate);
    if (!isNaN(refDate.getTime())) {
      const weeks = Math.max(1, Math.floor((now.getTime() - refDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
      setWeek(weeks);
    }
   
  }, [activeCycles, effectiveTentId]);

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

  // EC de referência — Kroma (ver recipeEC). Não recalcula do zero.
  const ecEstimated = recipeEC(phase, week, products);
  // PPM com fator 500 (igual à planilha Kroma: ppm = EC/2 × 1000 = EC × 500).
  const ppmApprox = Math.round(ecEstimated * 500);

  // EC medido (opcional) — parse seguro
  const ecMeasured = (() => {
    const n = parseFloat(ecMeasuredStr.replace(",", "."));
    return !isNaN(n) && n > 0 ? n : null;
  })();

  // ── Alertas de EC ─────────────────────────────────────────────────────────
  // Compara o EC medido (se informado) com o alvo Kroma do bloco de flora.
  // Só roda em FLORA, onde os alvos Kroma estão definidos.
  type EcAlert = { sev: "high" | "warn" | "info"; msg: string };
  const ecAlerts: EcAlert[] = (() => {
    if (phase !== "FLORA" || ecMeasured === null) return [];
    const t = floraTarget(week);
    const alerts: EcAlert[] = [];

    if (ecMeasured < t.mid * 0.8) {
      alerts.push({ sev: "high",
        msg: `EC medido ${ecMeasured.toFixed(2)} baixo para a fase (alvo Kroma ${t.mid.toFixed(2)}). Reforce a receita.` });
    } else if (ecMeasured > t.mid * 1.2) {
      alerts.push({ sev: "high",
        msg: `EC medido ${ecMeasured.toFixed(2)} alto para a fase (alvo Kroma ${t.mid.toFixed(2)}). Risco de queimadura — dilua a solução.` });
    } else {
      alerts.push({ sev: "info",
        msg: `EC medido ${ecMeasured.toFixed(2)} dentro da faixa do alvo Kroma (${t.mid.toFixed(2)}).` });
    }

    return alerts;
  })();

  // Roda o diagnóstico (sintomas + runoff) e a receita ajustada por override.
  const runDiagnosis = () => {
    const ph = parseFloat(runoffPhStr.replace(",", "."));
    const ec = parseFloat(runoffEcStr.replace(",", "."));
    setDiag(diagnoseNutrients({
      symptoms: symptoms.length ? symptoms : ["none"],
      runoffPh: !isNaN(ph) && ph > 0 ? ph : null,
      runoffEc: !isNaN(ec) && ec > 0 ? ec : null,
      ecTarget: ecEstimated,
    }));
  };
  const toggleSymptom = (s: PlantSymptom) => {
    setDiag(null);
    setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };
  // Receita com os multiplicadores do diagnóstico aplicados (se houver).
  const adjustedProducts = diag?.recipeMul
    ? calculatedProducts.map((p) => {
        const mul = diag.recipeMul![p.name] ?? 1;
        return { ...p, gPerLiter: p.gPerLiter * mul, totalG: p.totalG * mul };
      })
    : null;

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
      ecActual: ecMeasured,
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
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receita</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:11px;line-height:1.5;background:#fff;color:#000;padding:4px;width:58mm}pre{white-space:pre-wrap;word-break:break-word}@media print{body{width:58mm;padding:0}@page{margin:2mm;size:58mm auto}}</style></head><body><pre>${lines.join("\n")}</pre><script>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}</script></body></html>`);
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
    } catch (_e) {
      showToast.error("Erro ao gerar imagem");
    } finally {
      setIsSavingImage(false);
    }
  };

  return (
    <PageTransition>
      <PageHeader
        backHref="/calculators"
        title={
          <>
            <Beaker className="w-5 h-5 text-green-600 shrink-0" />
            <span className="truncate">Calculadora de Fertilização</span>
          </>
        }
        subtitle="Quantidades de nutrientes por fase e semana"
      />
      <div className="container py-6 max-w-5xl">
        <Tabs defaultValue="calculator" className="space-y-6">
          <TabsList>
            <TabsTrigger value="calculator" className="flex items-center gap-1.5"><FlaskConical className="w-4 h-4"/>Calculadora</TabsTrigger>
            <TabsTrigger value="compare" className="flex items-center gap-1.5"><ArrowUpDown className="w-4 h-4"/>Comparar</TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5"><ClipboardList className="w-4 h-4"/>Histórico</TabsTrigger>
          </TabsList>

          {/* ── CALCULADORA ── */}
          <TabsContent value="calculator" className="space-y-6">
            {/* Editorial header — DNA visual do site */}
            <div>
              <CalcEyebrow text="npk · fertilização mineral" />
              <div className="text-2xl font-semibold tracking-tight">Receita de nutrientes.</div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Fase e Semana */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle>1. Fase e Semana</CardTitle>
                    {activeCycles?.length ? (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">auto-detectado</span>
                    ) : null}
                  </div>
                  <CardDescription>O sistema calculará automaticamente os produtos e quantidades</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Fase</Label>
                    <Select value={phase} onValueChange={(v) => setPhase(v as Phase)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CLONING"><span className="flex items-center gap-1"><Sprout className="w-3.5 h-3.5 text-green-400"/>Clonagem</span></SelectItem>
                        <SelectItem value="VEGA"><span className="flex items-center gap-1"><Leaf className="w-3.5 h-3.5 text-emerald-400"/>Vegetativa</span></SelectItem>
                        <SelectItem value="PRE_FLORA"><span className="flex items-center gap-1"><Flower2 className="w-3.5 h-3.5 text-fuchsia-300"/>Pré-flora</span></SelectItem>
                        <SelectItem value="FLORA"><span className="flex items-center gap-1"><Flower2 className="w-3.5 h-3.5 text-purple-400"/>Floração</span></SelectItem>
                        <SelectItem value="MAINTENANCE"><span className="flex items-center gap-1"><Wrench className="w-3.5 h-3.5 text-blue-400"/>Manutenção</span></SelectItem>
                        <SelectItem value="DRYING"><span className="flex items-center gap-1"><Wind className="w-3.5 h-3.5 text-amber-400"/>Secagem</span></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Semana</Label>
                    <Select value={week.toString()} onValueChange={(v) => setWeek(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1,2,3,4,5,6,7,8].map(w => (
                          <SelectItem key={w} value={w.toString()}>
                            Semana {w}{phase === "FLORA" ? ` — ${getFloraSubphase(w).label}` : ""}
                          </SelectItem>
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
            <Card className="border-green-500/40 relative overflow-hidden"
              style={{ background: "linear-gradient(160deg, color-mix(in oklch, var(--primary) 6%, var(--card)), var(--card))" }}>
              <CalcRunning />
              <CardHeader className="pb-3">
                {/* Box arredondado verde em vez de tarja */}
                <div
                  className="rounded-2xl px-4 py-3 flex flex-col gap-1"
                  style={{ background: "linear-gradient(135deg, #16a34a, #10b981)" }}
                >
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-5 h-5 text-white shrink-0" />
                    <span className="text-base font-bold text-white leading-tight">
                      {PHASE_ICONS[phase]} Receita — {PHASE_NAMES[phase]}{phase === "FLORA" ? ` · ${getFloraSubphase(week).label}` : ""} Sem. {week} — {volumeL}L
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: "#d1fae5" }}>
                    Adicione os produtos na ordem listada abaixo
                    {phase === "FLORA" && (
                      <span className="ml-2 font-semibold">· Alvo: {getFloraSubphase(week).ecTarget}</span>
                    )}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {/* EC / PPM */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="flex items-center gap-3 bg-amber-500/8 border border-amber-400/25 rounded-xl p-3">
                    <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">EC Estimado</p>
                      <p className="mono text-xl font-bold text-amber-300">{ecEstimated} <span className="text-xs font-normal">mS/cm</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-sky-500/8 border border-sky-400/25 rounded-xl p-3">
                    <div className="w-9 h-9 rounded-full bg-sky-500/15 flex items-center justify-center shrink-0">
                      <Droplets className="w-4 h-4 text-sky-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">PPM Aprox.</p>
                      <p className="mono text-xl font-bold text-sky-300">{ppmApprox} <span className="text-xs font-normal">ppm</span></p>
                    </div>
                  </div>
                </div>

                {/* EC medido (opcional) + alertas — só em FLORA */}
                {phase === "FLORA" && (
                  <div className="space-y-2 mb-1">
                    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 p-3">
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">EC medido (opcional)</p>
                        <p className="text-[11px] text-muted-foreground/70 leading-tight">Alvo da semana {week}: {getFloraSubphase(week).ecTarget}</p>
                      </div>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="—"
                        value={ecMeasuredStr}
                        onChange={(e) => {
                          const v = e.target.value.replace(",", ".");
                          if (v === "" || /^\d*\.?\d*$/.test(v)) setEcMeasuredStr(v);
                        }}
                        className="w-24 text-center text-lg font-bold"
                      />
                    </div>
                    {ecAlerts.map((a, i) => (
                      <div key={i} className={`rounded-xl border px-3 py-2.5 flex items-start gap-2 ${
                        a.sev === "high" ? "border-red-400/30 bg-red-500/8"
                        : a.sev === "warn" ? "border-amber-400/30 bg-amber-500/8"
                        : "border-sky-400/30 bg-sky-500/8"}`}>
                        <Zap className={`w-4 h-4 shrink-0 mt-0.5 ${
                          a.sev === "high" ? "text-red-400" : a.sev === "warn" ? "text-amber-400" : "text-sky-400"}`} />
                        <p className={`text-xs leading-snug ${
                          a.sev === "high" ? "text-red-200/90" : a.sev === "warn" ? "text-amber-200/90" : "text-sky-200/90"}`}>{a.msg}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Nota de Finalização (Kroma) */}
                {phase === "FLORA" && week >= 8 && (
                  <div className="rounded-xl border border-amber-400/30 bg-amber-500/8 px-3 py-2.5 flex items-start gap-2">
                    <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-200/80 leading-snug">
                      <span className="font-semibold text-amber-300">Finalização:</span> Receita Kroma de finalização (EC 2,0) — entra o Óxido de Cálcio e o Nitrato de Cálcio cai. Cheque os tricomas para decidir o ponto de colheita / flush.
                    </p>
                  </div>
                )}

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
                            <p className="mono text-xs text-muted-foreground">{prod.gPerLiter.toFixed(2)} g/L × {volumeL} L</p>
                          </div>
                          <span className={`mono inline-block px-2.5 py-1 rounded-lg text-sm font-bold shrink-0 ${colors.badge}`}>
                            {prod.totalG.toFixed(1)} g
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* NPK Total */}
                {calculatedProducts.length > 0 && (() => {
                  let totalN = 0, totalP = 0, totalK = 0;
                  calculatedProducts.forEach(prod => {
                    const [n, p, k] = prod.npk.split("-").map(Number);
                    totalN += (n / 100) * prod.gPerLiter * 1000;
                    totalP += (p / 100) * prod.gPerLiter * 1000;
                    totalK += (k / 100) * prod.gPerLiter * 1000;
                  });
                  return (
                    <div className="rounded-xl border border-border/30 bg-muted/20 p-3 mt-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">NPK Total (ppm)</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-2 py-1.5">
                          <p className="mono text-xs text-green-400 font-semibold uppercase">N</p>
                          <p className="mono text-base font-bold text-green-300">{totalN.toFixed(0)}</p>
                        </div>
                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg px-2 py-1.5">
                          <p className="mono text-xs text-orange-400 font-semibold uppercase">P</p>
                          <p className="mono text-base font-bold text-orange-300">{totalP.toFixed(0)}</p>
                        </div>
                        <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg px-2 py-1.5">
                          <p className="mono text-xs text-violet-400 font-semibold uppercase">K</p>
                          <p className="mono text-base font-bold text-violet-300">{totalK.toFixed(0)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

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
                    className="w-full sm:flex-1 border-green-500/40 text-green-400 hover:bg-green-500/10"
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
                    className="w-full sm:flex-1 bg-primary text-primary-foreground hover:bg-primary/90 border-0"
                  >
                    {recordApplication.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin shrink-0" />Salvando...</>
                    ) : "Salvar Receita"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ── DIAGNÓSTICO POR SINTOMAS (override sobre a Kroma) ── */}
            <Card className="border-amber-500/30">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2"><Leaf className="w-5 h-5 text-amber-400" /> 3. A planta tem algum sinal?</CardTitle>
                <CardDescription>Marque o que você vê + (opcional) o pH/EC do runoff. O app ajusta a receita ou manda fazer flush.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {SYMPTOM_CHIPS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSymptom(s.id)}
                      className={`flex items-center gap-2 text-left text-sm rounded-xl border px-3 py-2.5 transition-colors ${symptoms.includes(s.id) ? "border-amber-500/50 bg-amber-500/10 text-foreground" : "border-border/40 text-muted-foreground hover:text-foreground"}`}
                    >
                      <s.Icon className={cn("w-4 h-4 shrink-0", s.color)} /> {s.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">pH do runoff</Label>
                    <Input type="text" inputMode="decimal" placeholder="ex: 6.2" value={runoffPhStr}
                      onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) { setRunoffPhStr(v); setDiag(null); } }} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">EC do runoff (mS/cm)</Label>
                    <Input type="text" inputMode="decimal" placeholder="ex: 1.8" value={runoffEcStr}
                      onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) { setRunoffEcStr(v); setDiag(null); } }} />
                  </div>
                </div>
                <Button onClick={runDiagnosis} className="w-full">Diagnosticar</Button>

                {diag && (
                  <div className={`rounded-xl border p-4 space-y-3 ${diag.action === "flush" ? "border-sky-400/40 bg-sky-500/8" : diag.action === "maintain" ? "border-emerald-400/40 bg-emerald-500/8" : "border-amber-400/40 bg-amber-500/8"}`}>
                    <p className="font-bold text-foreground flex items-center gap-2">
                      {diag.action === "flush" ? <Droplets className="w-4 h-4 shrink-0 text-sky-400" />
                        : diag.action === "maintain" ? <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                        : <FlaskConical className="w-4 h-4 shrink-0 text-amber-400" />}
                      {diag.title}
                    </p>
                    <p className="text-sm text-muted-foreground">{diag.message}</p>
                    {diag.flush && (
                      <ul className="text-sm text-foreground/90 list-disc pl-5 space-y-0.5">
                        <li>Volume: <strong>{diag.flush.volumeMul}×</strong> o normal</li>
                        <li>Runoff alvo: <strong>{diag.flush.targetRunoffPct}%</strong></li>
                        <li>Se o EC do runoff &gt; {diag.flush.repeatIfEcAbove}: repete o flush</li>
                      </ul>
                    )}
                    {adjustedProducts && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Receita ajustada (g/L · {volumeL}L)</p>
                        {adjustedProducts.map((p, i) => {
                          const changed = !!diag.recipeMul?.[p.name] && diag.recipeMul[p.name] !== 1;
                          return (
                            <div key={i} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${changed ? "border-amber-400/40 bg-amber-500/10" : "border-border/40"}`}>
                              <span className={cn("flex items-center gap-1.5", changed && "font-semibold")}>{p.name}{changed && <ArrowUp className="w-3.5 h-3.5 text-amber-400" />}</span>
                              <span className="mono font-bold">{p.gPerLiter.toFixed(2)} g/L · {p.totalG.toFixed(1)} g</span>
                            </div>
                          );
                        })}
                        {diag.ecMul && <p className="text-xs text-muted-foreground">EC alvo ajustado: ~{(ecEstimated * diag.ecMul).toFixed(2)} mS/cm</p>}
                      </div>
                    )}
                    {diag.warnings.length > 0 && (
                      <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                        {diag.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── COMPARAR ── */}
          <TabsContent value="compare">
            <CompareTab />
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
                        <SelectItem key={p} value={p}><span className="flex items-center gap-1">{PHASE_ICONS[p]}{PHASE_NAMES[p]}</span></SelectItem>
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
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${colors.dot}`}>{idx + 1}</div>
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
