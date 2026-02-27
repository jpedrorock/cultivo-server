import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Apple, Contrast, Moon, Sun, Trees } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

// Theme preview component showing visual representation
function ThemePreview({
  type,
}: {
  type: "light" | "dark" | "forest" | "highcontrast" | "highcontrast-dark" | "apple";
}) {
  const previewStyles = {
    light: { bg: "bg-[#faf9f6]", card: "bg-white", text: "bg-[#1a2e1a]", accent: "bg-[#3d7a3d]" },
    dark: { bg: "bg-[#111a1a]", card: "bg-[#182020]", text: "bg-[#f0f7f0]", accent: "bg-[#4db84d]" },
    forest: { bg: "bg-[#0d1a0d]", card: "bg-[#152015]", text: "bg-[#d4f0d4]", accent: "bg-[#5cd65c]" },
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
    description: "Fundo off-white quente, ideal para ambientes iluminados",
    icon: <Sun className="w-4 h-4 text-yellow-600 shrink-0" />,
  },
  {
    value: "dark" as const,
    label: "Escuro",
    description: "Fundo slate-verde profundo, ideal para uso noturno",
    icon: <Moon className="w-4 h-4 text-blue-400 shrink-0" />,
  },
  {
    value: "forest" as const,
    label: "Floresta",
    description: "Verde escuro profundo, inspirado em apps de cultivo premium",
    icon: <Trees className="w-4 h-4 text-green-500 shrink-0" />,
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
