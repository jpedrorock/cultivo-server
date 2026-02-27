import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Calculator, Droplets, Sun, Beaker, TestTube } from "lucide-react";

export default function CalculatorMenu() {
  const calculators = [
    {
      id: "watering-runoff",
      title: "Rega e Runoff",
      description: "Calcule volume ideal de rega e meça runoff real",
      icon: Droplets,
      color: "from-teal-500 to-cyan-500",
      bgColor: "bg-teal-500/10",
      iconColor: "text-teal-600 dark:text-teal-400",
      badge: "Popular",
    },
    {
      id: "nutrients",
      title: "Fertilização",
      description: "Calcule receitas de sais minerais por fase e semana",
      icon: Beaker,
      color: "from-green-500 to-emerald-500",
      bgColor: "bg-green-500/10",
      iconColor: "text-green-600",
      badge: "Popular",
    },
    {
      id: "lux-ppfd",
      title: "Conversor Lux → PPFD",
      description: "Converta leitura de lux para PPFD",
      icon: Sun,
      color: "from-yellow-500 to-orange-500",
      bgColor: "bg-yellow-500/10",
      iconColor: "text-yellow-600 dark:text-yellow-400",
    },
    {
      id: "ppm-ec",
      title: "Conversor PPM ↔ EC",
      description: "Converta entre PPM e EC bidirecionalmente",
      icon: Calculator,
      color: "from-gray-500 to-gray-600",
      bgColor: "bg-gray-500/10",
      iconColor: "text-gray-600 dark:text-gray-400",
    },
    {
      id: "ph-adjust",
      title: "Calculadora de pH",
      description: "Calcule ajustes necessários de pH",
      icon: TestTube,
      color: "from-red-600 to-red-700",
      bgColor: "bg-red-500/10",
      iconColor: "text-red-600 dark:text-red-400",
      badge: "Novo",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
              <Calculator className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground">Calculadoras</h1>
              <p className="text-sm text-muted-foreground">Ferramentas para cultivo</p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-3 py-4 md:px-4 md:py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {calculators.map((calc, index) => {
            const Icon = calc.icon;
            return (
              <Link key={calc.id} href={`/calculators/${calc.id}`}>
                <Card 
                  className={`cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-[1.02] border-2 ${calc.bgColor} hover:border-primary/50 w-full overflow-hidden p-5 md:p-6 animate-in fade-in slide-in-from-bottom-4`}
                  style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'backwards' }}
                >
                  <CardHeader className="p-4 md:p-6 space-y-3 md:space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br ${calc.color} flex items-center justify-center shadow-lg`}>
                        <Icon className="w-7 h-7 md:w-8 md:h-8 text-white" />
                      </div>
                      {calc.badge && (
                        <Badge 
                          variant={calc.badge === "Novo" ? "default" : "secondary"}
                          className="text-xs font-semibold"
                        >
                          {calc.badge}
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <CardTitle className="text-xl md:text-2xl font-bold leading-tight">{calc.title}</CardTitle>
                      <CardDescription className="text-sm md:text-base leading-relaxed">
                        {calc.description}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 md:px-6 md:pb-6 pt-0">
                    <div className="flex items-center text-sm md:text-base font-medium text-primary">
                      <span>Abrir calculadora</span>
                      <span className="ml-2 text-xl">→</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Info Card */}
        <Card className="mt-4 md:mt-8 bg-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Beaker className="w-5 h-5 text-green-600 dark:text-green-400" />
              Sobre as Calculadoras
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-foreground">
            <p>
              <strong>💧 Rega e Runoff:</strong> Calcule o volume ideal de rega e meça o runoff real com recomendações de ajuste
            </p>
            <p>
              <strong>🧪 Fertilização:</strong> Calcule receitas de sais minerais (Nitrato de Cálcio, Potássio, MKP, Sulfato de Magnésio) por fase e semana
            </p>
            <p>
              <strong>☀️ Lux → PPFD:</strong> Converta leituras de luxímetro para PPFD (medida usada em cultivo)
            </p>
            <p>
              <strong>🧪 PPM ↔ EC:</strong> Converta entre partes por milhão e condutividade elétrica
            </p>
            <p>
              <strong>🔬 pH:</strong> Calcule quanto ácido/base adicionar para ajustar o pH da solução
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
