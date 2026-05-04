import { ArrowRight, Heart, Sparkles, ThermometerSun } from "lucide-react";

export type QuickLogMode = "status" | "plant" | "trichome";

interface ModeOption {
  mode: QuickLogMode;
  title: string;
  description: string;
  icon: typeof ThermometerSun;
  /** Cor base usada nos buckets do button (border, bg gradient, icon bg, arrow) */
  color: {
    border: string;
    hoverBorder: string;
    iconBg: string;
    arrow: string;
    /** RGB usado na string de gradient (r,g,b) */
    gradientRgb: string;
  };
}

const OPTIONS: ModeOption[] = [
  {
    mode: "status",
    title: "Status da Estufa",
    description: "Temperatura, umidade, pH, EC, luz",
    icon: ThermometerSun,
    color: {
      border: "border-teal-500/20",
      hoverBorder: "hover:border-teal-500/40",
      iconBg: "bg-teal-600",
      arrow: "text-teal-400/60",
      gradientRgb: "20,184,166",
    },
  },
  {
    mode: "plant",
    title: "Saúde de Planta",
    description: "Status, sintomas e observações por planta",
    icon: Heart,
    color: {
      border: "border-rose-500/20",
      hoverBorder: "hover:border-rose-500/40",
      iconBg: "bg-rose-600",
      arrow: "text-rose-400/60",
      gradientRgb: "244,63,94",
    },
  },
  {
    mode: "trichome",
    title: "Tricomas",
    description: "Maturação, percentagens por planta · Flora",
    icon: Sparkles,
    color: {
      border: "border-violet-500/20",
      hoverBorder: "hover:border-violet-500/40",
      iconBg: "bg-violet-600",
      arrow: "text-violet-400/60",
      gradientRgb: "139,92,246",
    },
  },
];

interface QuickLogModeSelectorProps {
  /** True se há ao menos uma estufa em floração — exigido pelo modo "trichome". */
  hasFloraTents: boolean;
  /** Chamado quando o usuário escolhe um modo. */
  onSelectMode: (mode: QuickLogMode) => void;
  /** Chamado quando o usuário tenta tricomas mas não há flora ativa. */
  onTrichomeUnavailable: () => void;
}

/**
 * Tela inicial do QuickLog: três cards verticais com gradiente colorido,
 * cada um abre um fluxo diferente (status / saúde / tricomas).
 *
 * Antes era ~73 linhas inline em QuickLog.tsx — agora é puramente
 * presentacional com toda a config dos 3 cards consolidada num array.
 */
export function QuickLogModeSelector({
  hasFloraTents,
  onSelectMode,
  onTrichomeUnavailable,
}: QuickLogModeSelectorProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-5 gap-8 animate-[fade-in_0.4s_ease-out]">
      <div className="text-center space-y-1.5">
        <h2 className="text-2xl font-bold text-foreground">O que deseja registrar?</h2>
        <p className="text-sm text-muted-foreground">Escolha o tipo de registro</p>
      </div>
      <div className="w-full space-y-3">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const handleClick = () => {
            if (opt.mode === "trichome" && !hasFloraTents) {
              onTrichomeUnavailable();
              return;
            }
            onSelectMode(opt.mode);
          };
          return (
            <button
              key={opt.mode}
              onClick={handleClick}
              className={`w-full rounded-2xl border ${opt.color.border} text-left flex items-center gap-4 overflow-hidden transition-all duration-200 ${opt.color.hoverBorder} active:scale-[0.98]`}
              style={{
                background: `linear-gradient(135deg, rgba(${opt.color.gradientRgb},0.08) 0%, var(--card) 60%)`,
              }}
            >
              <div className="p-4 flex items-center gap-4 w-full">
                <div
                  className={`w-12 h-12 rounded-xl ${opt.color.iconBg} flex items-center justify-center shadow-lg shrink-0`}
                >
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-foreground text-base">{opt.title}</div>
                  <div className="text-sm text-muted-foreground">{opt.description}</div>
                </div>
                <ArrowRight className={`w-4 h-4 ${opt.color.arrow} shrink-0`} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
