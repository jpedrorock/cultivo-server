import { Link } from "wouter";
import { Calculator, Droplets, Sun, Beaker, TestTube, Timer, FlaskConical, Microscope, ArrowRight } from "lucide-react";
import { PageLayout } from "@/components/PageLayout";

export default function CalculatorMenu() {
  const calculators = [
    {
      id: "watering-runoff",
      title: "Rega e Runoff",
      description: "Volume ideal de rega e medição de runoff real",
      icon: Droplets,
      gradient: "from-teal-400 to-cyan-500",
      border: "border-teal-500/20",
      glow: "rgba(20,184,166,0.09)",
      accentColor: "text-teal-400",
      shadowColor: "shadow-teal-900/20",
      badge: "Popular",
      badgeStyle: "bg-teal-500/15 text-teal-300 border border-teal-500/25",
    },
    {
      id: "irrigation-schedule",
      title: "Rega Automática",
      description: "Cronograma de ciclos por bomba gotejadora e janela de luz",
      icon: Timer,
      gradient: "from-blue-400 to-cyan-500",
      border: "border-blue-500/20",
      glow: "rgba(59,130,246,0.09)",
      accentColor: "text-blue-400",
      shadowColor: "shadow-blue-900/20",
      badge: "Novo",
      badgeStyle: "bg-blue-500/15 text-blue-300 border border-blue-500/25",
    },
    {
      id: "nutrients",
      title: "Fertilização",
      description: "Receitas de sais minerais por fase e semana de cultivo",
      icon: FlaskConical,
      gradient: "from-emerald-400 to-green-500",
      border: "border-emerald-500/20",
      glow: "rgba(16,185,129,0.09)",
      accentColor: "text-emerald-400",
      shadowColor: "shadow-emerald-900/20",
      badge: "Popular",
      badgeStyle: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25",
    },
    {
      id: "lux-ppfd",
      title: "Conversor Lux → PPFD",
      description: "Converta leitura de luxímetro para PPFD por tipo de luz",
      icon: Sun,
      gradient: "from-yellow-400 to-amber-500",
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
      gradient: "from-violet-400 to-purple-500",
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
      gradient: "from-rose-400 to-red-500",
      border: "border-rose-500/20",
      glow: "rgba(244,63,94,0.08)",
      accentColor: "text-rose-400",
      shadowColor: "shadow-rose-900/20",
      badge: "Novo",
      badgeStyle: "bg-rose-500/15 text-rose-300 border border-rose-500/25",
    },
  ];

  return (
    <PageLayout
      header={
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-900/40">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 items-start">
          {calculators.map((calc, index) => {
            const Icon = calc.icon;
            return (
              <Link key={calc.id} href={`/calculators/${calc.id}`}>
                <div
                  className={`group relative rounded-2xl border ${calc.border} cursor-pointer overflow-hidden transition-all duration-300 hover:scale-[1.02] animate-in fade-in slide-in-from-bottom-4`}
                  style={{
                    animationDelay: `${index * 80}ms`,
                    animationFillMode: 'backwards',
                    background: `linear-gradient(145deg, ${calc.glow} 0%, hsl(var(--card)) 55%)`,
                  }}
                >
                  <div className="p-5 flex flex-col gap-4">
                    {/* Top row: icon + badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${calc.gradient} flex items-center justify-center shadow-lg ${calc.shadowColor} group-hover:scale-105 transition-transform duration-300 shrink-0`}>
                        <Icon className="w-7 h-7 text-white drop-shadow-sm" />
                      </div>
                      {calc.badge && (
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${calc.badgeStyle}`}>
                          {calc.badge}
                        </span>
                      )}
                    </div>

                    {/* Title + description */}
                    <div className="space-y-1 flex-1">
                      <h3 className="text-lg font-bold text-foreground leading-tight">{calc.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 min-h-[2.5rem]">{calc.description}</p>
                    </div>

                    {/* CTA */}
                    <div className={`flex items-center gap-1.5 text-sm font-medium ${calc.accentColor} group-hover:gap-2.5 transition-all duration-200`}>
                      <span>Abrir calculadora</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

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
        </div>
      </main>
    </PageLayout>
  );
}
