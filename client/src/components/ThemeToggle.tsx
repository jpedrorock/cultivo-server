import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Apple, Contrast, Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

// Theme preview component showing visual representation
function ThemePreview({
  type,
}: {
  type: "light" | "dark" | "highcontrast" | "highcontrast-dark" | "apple";
}) {
  const previewStyles = {
    light: { bg: "bg-white", card: "bg-gray-100", text: "bg-gray-800", accent: "bg-green-500" },
    dark: { bg: "bg-gray-900", card: "bg-gray-800", text: "bg-gray-100", accent: "bg-green-500" },
    highcontrast: { bg: "bg-white", card: "bg-gray-200", text: "bg-black", accent: "bg-black" },
    "highcontrast-dark": { bg: "bg-black", card: "bg-gray-900", text: "bg-white", accent: "bg-white" },
    apple: { bg: "bg-gray-50", card: "bg-white", text: "bg-gray-800", accent: "bg-blue-500" },
  };

  const colors = previewStyles[type];

  return (
    <div
      className={`w-14 h-10 sm:w-16 sm:h-12 rounded border-2 border-border overflow-hidden flex-shrink-0 ${colors.bg}`}
    >
      <div className="h-full p-1 flex gap-0.5">
        <div className={`w-3 ${colors.card} rounded-sm`} />
        <div className="flex-1 flex flex-col gap-0.5">
          <div className={`h-1.5 ${colors.accent} rounded-sm`} />
          <div className={`flex-1 ${colors.card} rounded-sm p-0.5 flex flex-col gap-0.5`}>
            <div className={`h-0.5 w-3/4 ${colors.text} rounded-full`} />
            <div className={`h-0.5 w-1/2 ${colors.text} opacity-50 rounded-full`} />
          </div>
        </div>
      </div>
    </div>
  );
}

const THEMES = [
  {
    value: "light" as const,
    label: "Claro",
    description: "Melhor para ambientes bem iluminados",
    icon: <Sun className="w-4 h-4 text-yellow-600 shrink-0" />,
  },
  {
    value: "dark" as const,
    label: "Escuro",
    description: "Ideal para uso noturno e economia de bateria",
    icon: <Moon className="w-4 h-4 text-blue-600 shrink-0" />,
  },
  {
    value: "highcontrast" as const,
    label: "Alto Contraste",
    description: "Preto e branco puro (fundo branco, texto preto)",
    icon: <Contrast className="w-4 h-4 shrink-0" />,
  },
  {
    value: "highcontrast-dark" as const,
    label: "Alto Contraste Escuro",
    description: "Preto e branco invertido (fundo preto, texto branco)",
    icon: <Contrast className="w-4 h-4 shrink-0" />,
  },
  {
    value: "apple" as const,
    label: "Apple",
    description: "Inspirado no design macOS/iOS com bordas arredondadas",
    icon: <Apple className="w-4 h-4 text-blue-500 shrink-0" />,
  },
] as const;

export function ThemeToggle() {
  const { theme, setTheme, switchable } = useTheme();

  if (!switchable) return null;

  const activeTheme = THEMES.find((t) => t.value === theme);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          {activeTheme?.icon}
          Tema
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Escolha o tema que melhor se adapta ao seu ambiente
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as any)}
          className="space-y-2"
        >
          {THEMES.map((t) => (
            <label
              key={t.value}
              htmlFor={t.value}
              className={`flex items-center gap-3 rounded-lg border p-3 sm:p-4 cursor-pointer transition-colors min-h-[56px] ${
                theme === t.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent/50"
              }`}
            >
              <RadioGroupItem value={t.value} id={t.value} className="shrink-0" />
              <ThemePreview type={t.value} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {t.icon}
                  <span className="font-medium text-sm sm:text-base">{t.label}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{t.description}</p>
              </div>
            </label>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
