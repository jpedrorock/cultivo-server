/**
 * WizardChips — seleção por chips no onboarding conversacional.
 *
 * Mostra opções como "pílulas" tocáveis alinhadas à direita (lado do usuário,
 * já que representam a resposta dele). Ao tocar, dispara haptic + onSelect.
 *
 * Suporta:
 *   - chip simples (label)
 *   - chip rico (label + sublabel + featured ⭐)
 *
 * Animação: chips entram escalonados (stagger). Respeita prefers-reduced-motion.
 *
 * Parte da E2 do épico Onboarding (ver BACKLOG).
 */
import { motion, useReducedMotion } from "framer-motion";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptics } from "@/lib/haptics";

export interface WizardChipOption {
  id: string;
  label: string;
  sublabel?: string;
  featured?: boolean;
}

interface WizardChipsProps {
  options: WizardChipOption[];
  /** id selecionado (controlado) — destaca o chip ativo */
  selectedId?: string | null;
  onSelect: (id: string) => void;
  /** Atraso base da animação de entrada, em segundos */
  delay?: number;
  /** Layout: 'wrap' (pílulas inline) ou 'grid' (cards 2-col, pra presets ricos) */
  layout?: "wrap" | "grid";
  className?: string;
}

export function WizardChips({
  options,
  selectedId,
  onSelect,
  delay = 0,
  layout = "wrap",
  className,
}: WizardChipsProps) {
  const reduced = useReducedMotion();

  const handleSelect = (id: string) => {
    haptics.light().catch(() => {});
    onSelect(id);
  };

  return (
    <div
      className={cn(
        "w-full",
        layout === "wrap"
          ? "flex flex-wrap gap-2 justify-end"
          : "grid grid-cols-2 gap-2",
        className,
      )}
    >
      {options.map((opt, i) => {
        const isSelected = selectedId === opt.id;
        const isRich = Boolean(opt.sublabel);
        return (
          <motion.button
            key={opt.id}
            type="button"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25, delay: delay + i * 0.05, ease: "easeOut" }}
            onClick={() => handleSelect(opt.id)}
            aria-pressed={isSelected}
            className={cn(
              "relative text-left transition-colors active:scale-[0.97] focus-visible:outline-none",
              isRich
                ? "px-4 py-3 rounded-2xl border"
                : "px-4 py-2.5 rounded-full border text-sm font-semibold",
              isSelected
                ? "bg-primary/15 border-primary/50 text-primary"
                : "bg-card border-border text-foreground hover:border-primary/40 hover:bg-primary/5",
            )}
          >
            {opt.featured && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm">
                <Star className="w-3 h-3 text-primary-foreground fill-primary-foreground" />
              </span>
            )}
            <span className={cn("block", isRich && "font-semibold text-sm")}>
              {opt.label}
            </span>
            {opt.sublabel && (
              <span className="block text-xs text-muted-foreground mt-0.5">
                {opt.sublabel}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
