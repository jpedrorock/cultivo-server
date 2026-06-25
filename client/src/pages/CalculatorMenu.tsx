import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Calculator, Droplets, Sun, Beaker, TestTube, Timer, FlaskConical, Microscope, ArrowRight, Wind, Lock, Sparkles, Play, Sprout } from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { usePlan } from "@/_core/hooks/usePlan";
import { useHasOrganicTent } from "@/_core/hooks/useCultivationMethod";
import { usePaywall } from "@/components/PaywallGate";
import { useCalculatorUnlock } from "@/_core/hooks/useCalculatorUnlock";
import { RewardedUnlockModal } from "@/components/RewardedUnlockModal";
import { trpc } from "@/lib/trpc";

// Fase dominante entre as estufas → calcs recomendadas (proposta #5).
const PHASE_RANK: Record<string, number> = { FLORA: 3, VEGA: 2, DRYING: 1, MAINTENANCE: 0 };
const RECOMMEND_BY_PHASE: Record<string, { ids: string[]; label: string }> = {
  VEGA:        { ids: ["nutrients", "vpd"], label: "Vegetativo" },
  FLORA:       { ids: ["nutrients", "vpd"], label: "Floração" },
  DRYING:      { ids: ["vpd", "ph-adjust"], label: "Secagem" },
  MAINTENANCE: { ids: ["nutrients", "vpd"], label: "Manutenção" },
};

/** Helper: card individual de calculadora que gerencia seu próprio unlock */
function CalculatorCard({
  calc,
  index,
  isProUser,
  isAllowed,
  openPaywall,
}: {
  calc: any;
  index: number;
  isProUser: boolean;
  isAllowed: boolean;
  openPaywall: (msg: string) => void;
}) {
  const [, setLocation] = useLocation();
  const { unlocked, expiresAt, grantUnlock } = useCalculatorUnlock(calc.id);
  const [rewardedOpen, setRewardedOpen] = useState(false);

  const Icon = calc.icon;
  const isLocked = !isProUser && !isAllowed && !unlocked;
  const showUnlockedBadge = !isProUser && !isAllowed && unlocked;
  const triggerMsg = `A calculadora "${calc.title}" faz parte do plano Pro.`;

  const innerCard = (
    <div
      className={`group relative rounded-2xl border ${calc.border} cursor-pointer overflow-hidden transition-all duration-300 hover:scale-[1.02] animate-in fade-in slide-in-from-bottom-4 md:h-full ${isLocked ? "opacity-90" : ""}`}
      style={{
        animationDelay: `${index * 80}ms`,
        animationFillMode: 'backwards',
        background: `linear-gradient(145deg, ${calc.glow} 0%, var(--card) 55%)`,
      }}
    >
      {isLocked && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-foreground/85 text-background px-2 py-0.5 text-[10px] font-bold shadow">
          <Lock className="w-2.5 h-2.5" />
          <span>Pro</span>
          <Sparkles className="w-2.5 h-2.5" />
        </div>
      )}
      {showUnlockedBadge && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-amber-500/90 text-white px-2 py-0.5 text-[10px] font-bold shadow">
          <Play className="w-2.5 h-2.5 fill-current" />
          <span>24h</span>
        </div>
      )}

      {/* Mobile: horizontal */}
      <div className="flex md:hidden items-center gap-4 px-4 h-[88px] overflow-hidden">
        <div className={`w-14 h-14 rounded-2xl ${calc.gradient} flex items-center justify-center shadow-lg ${calc.shadowColor} shrink-0`}>
          <Icon className="w-7 h-7 text-white drop-shadow-sm" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <h3 className="text-base font-bold text-foreground leading-tight">{calc.title}</h3>
            {calc.badge && !isLocked && !showUnlockedBadge && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${calc.badgeStyle}`}>
                {calc.badge}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground leading-snug line-clamp-1 mb-1.5">{calc.description}</p>
          <div className={`flex items-center gap-1 text-xs font-medium ${calc.accentColor}`}>
            <span>{isLocked ? "Desbloquear" : "Abrir calculadora"}</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </div>

      {/* Desktop: vertical */}
      <div className="hidden md:flex flex-col p-5 h-full">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className={`w-14 h-14 rounded-2xl ${calc.gradient} flex items-center justify-center shadow-lg ${calc.shadowColor} group-hover:scale-105 transition-transform duration-300 shrink-0`}>
            <Icon className="w-7 h-7 text-white drop-shadow-sm" />
          </div>
          {calc.badge && !isLocked && !showUnlockedBadge && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${calc.badgeStyle}`}>
              {calc.badge}
            </span>
          )}
        </div>
        <div className="flex-1 space-y-1.5 mb-3">
          <h3 className="text-lg font-bold text-foreground leading-tight">{calc.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{calc.description}</p>
        </div>
        <div className={`flex items-center gap-1.5 text-sm font-medium ${calc.accentColor} group-hover:gap-2.5 transition-all duration-200`}>
          <span>{isLocked ? "Desbloquear" : "Abrir calculadora"}</span>
          <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    </div>
  );

  if (isLocked) {
    return (
      <>
        <button
          type="button"
          onClick={() => setRewardedOpen(true)}
          className="block w-full text-left md:h-full"
        >
          {innerCard}
        </button>
        <RewardedUnlockModal
          open={rewardedOpen}
          onOpenChange={setRewardedOpen}
          calculatorTitle={calc.title}
          onRewardEarned={async () => {
            await grantUnlock();
          }}
          onOpenPaywall={() => openPaywall(triggerMsg)}
        />
      </>
    );
  }

  return (
    <Link href={`/calculators/${calc.id}`} className="block md:h-full">
      {innerCard}
    </Link>
  );
}

export default function CalculatorMenu() {
  const { limits, isPro } = usePlan();
  const paywall = usePaywall();
  const { data: tents } = trpc.tents.list.useQuery();
  const hasOrganic = useHasOrganicTent();
  const calculators = [
    {
      id: "watering-runoff",
      title: "Rega e Runoff",
      description: "Volume ideal de rega e medição de runoff real",
      icon: Droplets,
      gradient: "bg-teal-500",
      border: "border-teal-500/20",
      glow: "rgba(20,184,166,0.09)",
      accentColor: "text-teal-400",
      shadowColor: "shadow-teal-900/20",
      badge: "Popular",
      badgeStyle: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    },
    {
      id: "irrigation-schedule",
      title: "Rega Automática",
      description: "Cronograma de ciclos por bomba gotejadora e janela de luz",
      icon: Timer,
      gradient: "bg-blue-500",
      border: "border-blue-500/20",
      glow: "rgba(59,130,246,0.09)",
      accentColor: "text-blue-400",
      shadowColor: "shadow-blue-900/20",
      badge: "Novo",
      badgeStyle: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    },
    {
      id: "nutrients",
      title: "Fertilização",
      description: "Receitas de sais minerais por fase e semana de cultivo",
      icon: FlaskConical,
      gradient: "bg-emerald-500",
      border: "border-emerald-500/20",
      glow: "rgba(16,185,129,0.09)",
      accentColor: "text-emerald-400",
      shadowColor: "shadow-emerald-900/20",
      badge: "Popular",
      badgeStyle: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    },
    {
      id: "living-soil",
      title: "Solo Vivo (Orgânico)",
      description: "Receita de super soil / living soil escalada pelo volume",
      icon: Sprout,
      gradient: "bg-green-600",
      border: "border-green-500/20",
      glow: "rgba(34,197,94,0.09)",
      accentColor: "text-green-400",
      shadowColor: "shadow-green-900/20",
      badge: "Orgânico",
      badgeStyle: "bg-muted text-muted-foreground",
    },
    {
      id: "organic-maintenance",
      title: "Manutenção Orgânica",
      description: "Chá de compostagem + top dressing pro solo vivo",
      icon: Droplets,
      gradient: "bg-lime-600",
      border: "border-lime-500/20",
      glow: "rgba(132,204,22,0.09)",
      accentColor: "text-lime-400",
      shadowColor: "shadow-lime-900/20",
      badge: "Orgânico",
      badgeStyle: "bg-muted text-muted-foreground",
    },
    {
      id: "lux-ppfd",
      title: "Conversor Lux → PPFD",
      description: "Converta leitura de luxímetro para PPFD por tipo de luz",
      icon: Sun,
      gradient: "bg-amber-500",
      border: "border-yellow-500/20",
      glow: "rgba(234,179,8,0.08)",
      accentColor: "text-yellow-400",
      shadowColor: "shadow-yellow-900/20",
      badge: null,
      badgeStyle: "",
    },
    {
      id: "ppm-ec",
      title: "Conversor PPM ↔ EC",
      description: "Converta entre partes por milhão e condutividade elétrica",
      icon: Calculator,
      gradient: "bg-violet-500",
      border: "border-violet-500/20",
      glow: "rgba(139,92,246,0.08)",
      accentColor: "text-violet-400",
      shadowColor: "shadow-violet-900/20",
      badge: null,
      badgeStyle: "",
    },
    {
      id: "ph-adjust",
      title: "Calculadora de pH",
      description: "Calcule quanto ácido ou base adicionar para ajustar o pH",
      icon: TestTube,
      gradient: "bg-rose-500",
      border: "border-rose-500/20",
      glow: "rgba(244,63,94,0.08)",
      accentColor: "text-rose-400",
      shadowColor: "shadow-rose-900/20",
      badge: "Novo",
      badgeStyle: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    },
    {
      id: "vpd",
      title: "VPD",
      description: "Pressão de vapor deficit — zona ideal de temperatura e umidade",
      icon: Wind,
      gradient: "bg-indigo-500",
      border: "border-indigo-500/20",
      glow: "rgba(99,102,241,0.09)",
      accentColor: "text-indigo-400",
      shadowColor: "shadow-indigo-900/20",
      badge: "Novo",
      badgeStyle: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    },
  ];

  // Fase dominante entre as estufas (flora > vega > secagem > manutenção)
  const dominantPhase = (tents ?? []).reduce<string | null>((acc, t: any) => {
    if (!t.category) return acc;
    if (!acc) return t.category;
    return (PHASE_RANK[t.category] ?? 0) > (PHASE_RANK[acc] ?? 0) ? t.category : acc;
  }, null);
  const rec = dominantPhase ? RECOMMEND_BY_PHASE[dominantPhase] : null;
  const recommended = rec
    ? rec.ids.flatMap((id) => { const c = calculators.find((x) => x.id === id); return c ? [c] : []; })
    : [];

  // Calcs orgânicas agrupadas à parte das minerais. Quando o user tem estufa
  // orgânica, a seção sobe pro topo (relevante); senão vai pro fim (ruído).
  const ORGANIC_IDS = ["living-soil", "organic-maintenance"];
  const mineralCalcs = calculators.filter((c) => !ORGANIC_IDS.includes(c.id));
  const organicCalcs = calculators.filter((c) => ORGANIC_IDS.includes(c.id));

  const organicSection = (
    <div className={hasOrganic ? "mb-6" : "mt-8"}>
      <p className="text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-400 flex items-center gap-1.5 mb-3">
        <Sprout className="w-3.5 h-3.5" /> Cultivo orgânico
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {organicCalcs.map((calc, index) => (
          <CalculatorCard
            key={`org-${calc.id}`}
            calc={calc}
            index={index}
            isProUser={isPro}
            isAllowed={limits.allowedCalculators.includes(calc.id)}
            openPaywall={paywall.open}
          />
        ))}
      </div>
    </div>
  );

  return (
    <PageLayout
      header={
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Calculator className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-foreground">Calculadoras</h1>
              <p className="text-xs text-muted-foreground">Ferramentas para cultivo</p>
            </div>
          </div>
        </div>
      }
    >
      <main className="container mx-auto px-3 py-4 md:px-4 md:py-8">
        {/* Recomendadas pela fase atual do cultivo (proposta #5) */}
        {recommended.length > 0 && rec && (
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5 mb-3">
              <Sparkles className="w-3.5 h-3.5" /> Recomendadas para {rec.label}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommended.map((calc, index) => (
                <CalculatorCard
                  key={`rec-${calc.id}`}
                  calc={calc}
                  index={index}
                  isProUser={isPro}
                  isAllowed={limits.allowedCalculators.includes(calc.id)}
                  openPaywall={paywall.open}
                />
              ))}
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-6 mb-3">
              Todas as ferramentas
            </p>
          </div>
        )}
        {/* Estufa orgânica → seção orgânica em destaque no topo */}
        {hasOrganic && organicSection}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mineralCalcs.map((calc, index) => (
            <CalculatorCard
              key={calc.id}
              calc={calc}
              index={index}
              isProUser={isPro}
              isAllowed={limits.allowedCalculators.includes(calc.id)}
              openPaywall={paywall.open}
            />
          ))}
        </div>
        {/* Sem estufa orgânica → seção orgânica de-priorizada no fim */}
        {!hasOrganic && organicSection}
        {paywall.PaywallElement}

        {/* Info Card */}
        <div className="mt-4 rounded-2xl border border-border/50 bg-muted/10 p-4 space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Beaker className="w-3.5 h-3.5" /> Sobre as Calculadoras
          </p>
          <p className="text-xs text-muted-foreground"><strong className="text-foreground inline-flex items-center gap-1"><Droplets className="w-3 h-3 text-cyan-400"/>Rega e Runoff:</strong> Volume ideal de rega com recomendações de ajuste por runoff</p>
          <p className="text-xs text-muted-foreground"><strong className="text-foreground inline-flex items-center gap-1"><FlaskConical className="w-3 h-3 text-emerald-400"/>Fertilização:</strong> Receitas de sais minerais (Ca, K, MKP, Mg) por fase e semana</p>
          <p className="text-xs text-muted-foreground"><strong className="text-foreground inline-flex items-center gap-1"><Sun className="w-3 h-3 text-yellow-400"/>Lux → PPFD:</strong> Converta leituras de luxímetro para PPFD por tipo de luminária</p>
          <p className="text-xs text-muted-foreground"><strong className="text-foreground inline-flex items-center gap-1"><Calculator className="w-3 h-3 text-violet-400"/>PPM ↔ EC:</strong> Conversão bidirecional entre partes por milhão e condutividade</p>
          <p className="text-xs text-muted-foreground"><strong className="text-foreground inline-flex items-center gap-1"><Microscope className="w-3 h-3 text-rose-400"/>pH:</strong> Calcule quanto ácido ou base adicionar para ajustar o pH da solução</p>
          <p className="text-xs text-muted-foreground"><strong className="text-foreground inline-flex items-center gap-1"><Wind className="w-3 h-3 text-indigo-400"/>VPD:</strong> Pressão de vapor deficit — parâmetro essencial para growers avançados</p>
        </div>
      </main>
    </PageLayout>
  );
}
