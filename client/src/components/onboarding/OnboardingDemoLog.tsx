/**
 * OnboardingDemoLog — tutorial guiado do primeiro registro (E4 do épico Onboarding).
 *
 * IMPORTANTE: este é um tutorial ILUSTRATIVO. **Nada é enviado ao servidor** —
 * não importa nenhuma mutation, não persiste. O objetivo é só ensinar o grower
 * novo a fazer um registro diário (Temp/RH/pH/EC) sem medo de "estragar" dados.
 *
 * Por que standalone (não `?demo=1` dentro do QuickLog real): o QuickLog tem
 * 1392 linhas com 3 modos, sensores, upload de foto e fila offline. Threading um
 * flag de demo por todos os submit paths seria arriscado. Este componente imita
 * o fluxo "Status da estufa" visualmente (mesmo CalcSlider, mesma paleta) mas é
 * isolado e seguro. Funciona mesmo sem nenhuma planta/estufa cadastrada.
 *
 * Botão "Pular" sempre visível (grower experiente). Ao fim: "Você fez seu
 * primeiro registro! 🎉".
 *
 * Props:
 *   onComplete — chamado ao concluir o tutorial
 *   onSkip     — chamado ao pular
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ThermometerSun, Droplets, TestTube, Zap, X, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CalcSlider } from "@/components/ui/calc-slider";
import { getPHColor } from "@/lib/quickLogColors";
import { haptics } from "@/lib/haptics";
import { WizardBubble } from "./WizardBubble";

interface DemoMetric {
  key: "temp" | "rh" | "ph" | "ec";
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  icon: React.ElementType;
  accent: string;
  coach: string;
}

const METRICS: DemoMetric[] = [
  {
    key: "temp",
    label: "Temperatura",
    unit: "°C",
    min: 15,
    max: 35,
    step: 0.5,
    initial: 25,
    icon: ThermometerSun,
    accent: "#f97316",
    coach: "Primeiro, a temperatura do ar da estufa. O ideal fica entre 22–28 °C na maior parte do ciclo. Arrasta o controle pra simular.",
  },
  {
    key: "rh",
    label: "Umidade relativa",
    unit: "%",
    min: 20,
    max: 90,
    step: 1,
    initial: 60,
    icon: Droplets,
    accent: "#3b82f6",
    coach: "Agora a umidade do ar (RH). Vega gosta de 60–70%; flora cai pra 40–50%. O app calcula o VPD automaticamente a partir de temp + RH.",
  },
  {
    key: "ph",
    label: "pH da solução",
    unit: "",
    min: 5.0,
    max: 7.0,
    step: 0.1,
    initial: 6.2,
    icon: TestTube,
    accent: "#22c55e",
    coach: "O pH da água/nutrientes. Em cultivo mineral o alvo é ~5.8–6.2. Fora disso, a planta trava a absorção de nutrientes.",
  },
  {
    key: "ec",
    label: "EC (condutividade)",
    unit: "mS/cm",
    min: 0.4,
    max: 3.0,
    step: 0.1,
    initial: 1.6,
    icon: Zap,
    accent: "#a855f7",
    coach: "Por fim, a EC — o quão 'forte' está a solução nutritiva. Sobe conforme a planta cresce. Pronto, esses são os 4 números do dia a dia!",
  },
];

export default function OnboardingDemoLog({
  onComplete,
  onSkip,
}: {
  /** Default: navega pra Home. E5 passa callbacks pra encadear no fluxo do wizard. */
  onComplete?: () => void;
  onSkip?: () => void;
} = {}) {
  const [, setLocation] = useLocation();
  const handleComplete = onComplete ?? (() => setLocation("/"));
  const handleSkip = onSkip ?? (() => setLocation("/"));
  const [step, setStep] = useState(0); // 0..3 metrics, 4 = done
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(METRICS.map((m) => [m.key, m.initial])),
  );

  const isDone = step >= METRICS.length;
  const metric = !isDone ? METRICS[step] : null;

  const next = () => {
    haptics.light().catch(() => {});
    setStep((s) => s + 1);
  };
  const back = () => {
    haptics.light().catch(() => {});
    setStep((s) => Math.max(0, s - 1));
  };
  const skip = () => {
    haptics.light().catch(() => {});
    handleSkip();
  };
  const finish = () => {
    haptics.medium().catch(() => {});
    handleComplete();
  };

  const accent = metric
    ? metric.key === "ph"
      ? getPHColor(values.ph)
      : metric.accent
    : "#22c55e";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header
        className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border/30"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground/70 font-semibold">
              Tutorial · Registro de exemplo
            </span>
          </div>
          {!isDone && (
            <button
              onClick={skip}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Pular
            </button>
          )}
        </div>
        {/* Progress */}
        <div className="container mx-auto px-4 pb-2.5 max-w-2xl">
          <div className="flex items-center gap-1.5">
            {METRICS.map((_, n) => (
              <div
                key={n}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  step > n ? "bg-primary" : step === n ? "bg-primary/40" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 max-w-2xl w-full flex flex-col">
        {/* Aviso: é demo */}
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2 mb-5 text-center">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Isto é só um exemplo — <strong>nada é salvo</strong>. Brinque à vontade. 😊
          </p>
        </div>

        {!isDone && metric && (
          <div className="space-y-5 flex-1">
            <WizardBubble from="app" key={metric.key}>
              {metric.coach}
            </WizardBubble>

            {/* Card do metric */}
            <div className="bg-card border border-border rounded-2xl p-6 space-y-6 mt-2">
              <div className="flex flex-col items-center gap-3">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: `color-mix(in oklch, ${accent} 15%, transparent)`, border: `1px solid color-mix(in oklch, ${accent} 35%, transparent)` }}
                >
                  <metric.icon className="w-8 h-8" style={{ color: accent }} />
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">{metric.label}</p>
                  <p className="mono text-3xl font-bold" style={{ color: accent }}>
                    {metric.step >= 1 ? values[metric.key].toFixed(0) : values[metric.key].toFixed(1)}
                    <span className="text-base text-muted-foreground ml-1">{metric.unit}</span>
                  </p>
                </div>
              </div>

              <CalcSlider
                label={`Ajuste a ${metric.label.toLowerCase()}`}
                value={values[metric.key]}
                setValue={(n) => setValues((v) => ({ ...v, [metric.key]: n }))}
                min={metric.min}
                max={metric.max}
                step={metric.step}
                suffix={metric.unit}
                accent={accent}
              />
            </div>

            {/* Nav */}
            <div className="flex items-center gap-2 pt-2">
              {step > 0 && (
                <Button variant="outline" onClick={back}>
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Voltar
                </Button>
              )}
              <Button onClick={next} className="ml-auto" size="lg">
                {step === METRICS.length - 1 ? "Ver resultado" : "Próximo"}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Done */}
        {isDone && (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center py-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="w-20 h-20 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Check className="w-10 h-10 text-primary" strokeWidth={2.5} />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold">Você fez seu primeiro registro! 🎉</h2>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Foi só isso. No dia a dia você toca no botão <strong>+</strong> da barra, escolhe
                "Status da estufa" e preenche esses 4 valores.
              </p>
            </div>

            {/* Resumo dos valores brincados */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-xs mt-2">
              {METRICS.map((m) => (
                <div key={m.key} className="bg-card border border-border rounded-xl px-3 py-2 flex items-center gap-2">
                  <m.icon className="w-4 h-4 shrink-0" style={{ color: m.key === "ph" ? getPHColor(values.ph) : m.accent }} />
                  <div className="text-left min-w-0">
                    <p className="text-[10px] text-muted-foreground truncate">{m.label}</p>
                    <p className="mono text-sm font-semibold">
                      {m.step >= 1 ? values[m.key].toFixed(0) : values[m.key].toFixed(1)}
                      <span className="text-muted-foreground text-xs ml-0.5">{m.unit}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <Button onClick={finish} size="lg" className="min-w-[200px] mt-3">
              Começar a usar
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
