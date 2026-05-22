/**
 * OnboardingTour — apresentação inicial em 4 slides.
 *
 * Aparece pra novos users mobile (gated por isNative + flag Preferences).
 * Estética marketing-style: hero icon grande, título, descrição curta,
 * com dots + swipe horizontal + botões Pular/Próximo/Começar.
 *
 * Slides:
 *  1. Boas-vindas  — apresenta o app
 *  2. Estufas      — gerencia múltiplos cultivos
 *  3. Calculadoras — ferramentas técnicas (LUX→PPFD, EC, VPD, etc)
 *  4. Pro          — call-to-action sutil pro paywall
 *
 * Distinto do OnboardingWizard (setup técnico). Tour vem antes na hierarquia:
 *   Login → SplashScreen → OnboardingTour → OnboardingWizard → Home
 */

import { useEffect, useRef, useState } from "react";
import { ChevronRight, X, Sprout, Calculator, Sparkles, Leaf } from "lucide-react";
import { haptics } from "@/lib/haptics";

export interface OnboardingTourProps {
  onComplete: () => void;
  onShowPaywall?: () => void; // callback opcional pra abrir paywall direto do último slide
}

interface Slide {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  description: string;
}

const SLIDES: Slide[] = [
  {
    icon: Leaf,
    iconColor: "#4ade80",
    iconBg: "rgba(74,222,128,0.12)",
    title: "Bem-vindo ao Cultivo",
    subtitle: "Seu jardim, no controle.",
    description:
      "Gerencie estufas, plantas e ciclos completos. Tudo num só lugar, com dados que importam.",
  },
  {
    icon: Sprout,
    iconColor: "#a78bfa",
    iconBg: "rgba(167,139,250,0.12)",
    title: "Estufas inteligentes",
    subtitle: "Acompanhe cada ciclo.",
    description:
      "Registre temperatura, umidade, pH e EC. Veja gráficos de evolução e alertas automáticos quando algo sai do alvo.",
  },
  {
    icon: Calculator,
    iconColor: "#60a5fa",
    iconBg: "rgba(96,165,250,0.12)",
    title: "Calculadoras técnicas",
    subtitle: "Sem chute, sem perda.",
    description:
      "LUX → PPFD, runoff, VPD ideal, conversor PPM ↔ EC, fertilização NPK. As ferramentas que cultivadores sérios usam.",
  },
  {
    icon: Sparkles,
    iconColor: "#fbbf24",
    iconBg: "rgba(251,191,36,0.12)",
    title: "Cultivo Pro",
    subtitle: "Quando você quiser mais.",
    description:
      "Estufas ilimitadas, todas as calculadoras, fotos das plantas, chat com IA e integração com sensores Tuya / SmartLife.",
  },
];

export function OnboardingTour({ onComplete, onShowPaywall }: OnboardingTourProps) {
  const [index, setIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];
  const Icon = slide.icon;

  // Animação leve ao trocar de slide — fade in cada vez que o índice muda
  const [animKey, setAnimKey] = useState(0);
  useEffect(() => {
    setAnimKey((k) => k + 1);
  }, [index]);

  const goNext = async () => {
    await haptics.light();
    if (isLast) {
      onComplete();
      return;
    }
    setIndex((i) => Math.min(SLIDES.length - 1, i + 1));
  };

  const goPrev = async () => {
    if (index === 0) return;
    await haptics.light();
    setIndex((i) => Math.max(0, i - 1));
  };

  const handleSkip = async () => {
    await haptics.light();
    onComplete();
  };

  const handleShowPaywall = async () => {
    await haptics.medium();
    onComplete();
    onShowPaywall?.();
  };

  // Swipe handlers — só ativa se delta > 50px
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 50) return;
    if (delta < 0) goNext();
    else goPrev();
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-background flex flex-col"
      style={{
        // safe-area pra iOS notch + barra inferior
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="dialog"
      aria-labelledby="onboarding-title"
    >
      {/* Skip button no canto */}
      <div className="flex justify-end px-4 pt-3">
        <button
          type="button"
          onClick={handleSkip}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Pular tour"
        >
          Pular
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Conteúdo do slide */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div
          key={animKey}
          className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-sm"
        >
          {/* Hero icon */}
          <div
            className="w-24 h-24 mx-auto mb-8 rounded-3xl flex items-center justify-center"
            style={{
              background: slide.iconBg,
              boxShadow: `0 0 40px ${slide.iconColor}30`,
            }}
          >
            <Icon className="w-12 h-12" style={{ color: slide.iconColor }} strokeWidth={1.5} />
          </div>

          {/* Subtitle (pequeno, acima do título) */}
          <p
            className="text-xs font-bold uppercase tracking-[0.2em] mb-3"
            style={{ color: slide.iconColor }}
          >
            {slide.subtitle}
          </p>

          {/* Título */}
          <h2
            id="onboarding-title"
            className="text-3xl font-bold text-foreground mb-4 leading-tight"
          >
            {slide.title}
          </h2>

          {/* Descrição */}
          <p className="text-base text-muted-foreground leading-relaxed">
            {slide.description}
          </p>
        </div>
      </div>

      {/* Dots indicator */}
      <div className="flex items-center justify-center gap-2 pb-6">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Slide ${i + 1} de ${SLIDES.length}`}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-8" : "w-1.5"
            }`}
            style={{
              background: i === index ? slide.iconColor : "color-mix(in oklch, var(--muted-foreground) 30%, transparent)",
            }}
          />
        ))}
      </div>

      {/* Bottom action */}
      <div className="px-6 pb-6 space-y-2">
        {isLast && onShowPaywall ? (
          <>
            {/* Botão secundário: ver Pro */}
            <button
              type="button"
              onClick={handleShowPaywall}
              className="w-full py-3.5 rounded-2xl font-semibold text-base transition-all"
              style={{
                background: slide.iconColor,
                color: "#000",
                boxShadow: `0 0 20px ${slide.iconColor}40`,
              }}
            >
              Ver planos Pro
            </button>
            {/* Botão primário: começar grátis */}
            <button
              type="button"
              onClick={goNext}
              className="w-full py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Começar grátis
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="w-full py-3.5 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-all"
            style={{
              background: slide.iconColor,
              color: "#000",
              boxShadow: `0 0 20px ${slide.iconColor}40`,
            }}
          >
            {isLast ? "Começar" : "Próximo"}
            {!isLast && <ChevronRight className="w-5 h-5" />}
          </button>
        )}
      </div>
    </div>
  );
}

export default OnboardingTour;
