import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Leaf, Sparkles, Trees, Zap, Telescope } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

type ThemeValue = "forest" | "hps" | "monstera" | "vision" | "aurora";

// Theme preview component showing visual representation
function ThemePreview({ type }: { type: ThemeValue }) {
  const previewStyles: Record<ThemeValue, { bg: string; card: string; text: string; accent: string; sidebar: string }> = {
    forest:   { bg: "bg-[#0d1a0d]",  card: "bg-[#152015]", text: "bg-[#d4f0d4]", accent: "bg-[#5cd65c]", sidebar: "bg-[#0a1408]" },
    hps:      { bg: "bg-[#080f08]",  card: "bg-[#111a11]", text: "bg-[#f7fff7]", accent: "bg-[#39ff14]", sidebar: "bg-[#050c05]" },
    monstera: { bg: "bg-[#fafffe]",  card: "bg-white",     text: "bg-[#1a3322]", accent: "bg-[#9fd9ba]", sidebar: "bg-[#1e4d34]" },
    vision:   { bg: "bg-[#0a1620]",  card: "bg-[#162228]", text: "bg-[#e0f0e8]", accent: "bg-[#40c060]", sidebar: "bg-[#080f18]" },
    aurora:   { bg: "bg-[#0b0d12]",  card: "bg-[#141820]", text: "bg-[#f0fdf4]", accent: "bg-[#4ade80]", sidebar: "bg-[#080a0f]" },
  };

  const colors = previewStyles[type];

  return (
    <div className={`w-14 h-10 sm:w-16 sm:h-12 rounded border-2 border-border overflow-hidden flex-shrink-0 ${colors.bg}`}>
      <div className="h-full p-1 flex gap-0.5">
        <div className={`w-3 ${colors.sidebar} rounded-sm`} />
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
    value: "monstera" as ThemeValue,
    label: "Claro",
    description: "Botânico minimalista — branco limpo, verde-floresta, acentos menta",
    icon: <Leaf className="w-4 h-4 text-emerald-600 shrink-0" />,
  },
  {
    value: "vision" as ThemeValue,
    label: "Escuro",
    description: "Glassmorphism dark — cards translúcidos com brilho verde esmeralda",
    icon: <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />,
  },
  {
    value: "forest" as ThemeValue,
    label: "Floresta",
    description: "Verde escuro profundo, inspirado em apps de cultivo premium",
    icon: <Trees className="w-4 h-4 text-green-500 shrink-0" />,
  },
  {
    value: "hps" as ThemeValue,
    label: "HPS Agrícola",
    description: "Preto absoluto + verde neon — máximo contraste sob luz HPS/LED",
    icon: <Zap className="w-4 h-4 text-green-400 shrink-0" />,
  },
  {
    value: "aurora" as ThemeValue,
    label: "Aurora",
    description: "Dark atmosférico — glow verde, cards glass e textura de grão",
    icon: <Telescope className="w-4 h-4 text-emerald-300 shrink-0" />,
  },
] as const;

function applyThemeToDOM(t: ThemeValue) {
  const root = document.documentElement;
  root.classList.remove("forest", "hps", "monstera", "vision", "aurora", "jardim", "light", "dark");
  root.classList.add(t);
  if (t === "hps" || t === "vision" || t === "forest" || t === "aurora") {
    root.classList.add("dark");
  }
}

export function ThemeToggle() {
  const { theme, setTheme, switchable } = useTheme();
  const [hovering, setHovering] = useState<ThemeValue | null>(null);

  if (!switchable) return null;

  const activeTheme = THEMES.find((t) => t.value === theme);

  const handleMouseEnter = (val: ThemeValue) => {
    setHovering(val);
    applyThemeToDOM(val);
  };

  const handleMouseLeave = () => {
    setHovering(null);
    applyThemeToDOM(theme);
  };

  const displayTheme = hovering ?? theme;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          {activeTheme?.icon}
          Tema
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          {hovering
            ? <span className="text-primary font-medium">Pré-visualizando: {THEMES.find(t => t.value === hovering)?.label}</span>
            : 'Passe o mouse ou toque para ver o tema ao vivo'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {THEMES.map((t) => {
            const isActive = displayTheme === t.value;
            const isSaved = theme === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => { setTheme(t.value); setHovering(null); }}
                onMouseEnter={() => handleMouseEnter(t.value)}
                onMouseLeave={handleMouseLeave}
                className={`w-full flex items-center gap-3 rounded-lg border p-3 sm:p-4 cursor-pointer transition-all duration-150 min-h-[56px] text-left active:scale-[0.98] ${
                  isActive
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:bg-accent/50 hover:border-border/80"
                }`}
              >
                <ThemePreview type={t.value} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {t.icon}
                    <span className="font-medium text-sm sm:text-base">{t.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{t.description}</p>
                </div>
                {isSaved && (
                  <Check className="w-4 h-4 text-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
