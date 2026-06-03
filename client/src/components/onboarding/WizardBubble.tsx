/**
 * WizardBubble — balão de conversa do onboarding conversacional.
 *
 * Dois lados:
 *   from="app"  → balão à esquerda, avatar com ícone Sprout, fundo muted
 *   from="user" → balão à direita, sem avatar, fundo primary/10
 *
 * Animação: entra com fade + slide 300ms. Respeita prefers-reduced-motion
 * (sem movimento, só aparece). Use `delay` pra escalonar mensagens numa
 * sequência (ex: app fala, 400ms depois mostra os chips).
 *
 * Parte da E2 do épico Onboarding (ver BACKLOG). Reaproveitável por mobile e PWA.
 */
import { motion, useReducedMotion } from "framer-motion";
import { Sprout } from "lucide-react";
import { cn } from "@/lib/utils";

interface WizardBubbleProps {
  from: "app" | "user";
  children: React.ReactNode;
  /** Atraso da animação de entrada, em segundos (escalonamento). */
  delay?: number;
  className?: string;
}

export function WizardBubble({ from, children, delay = 0, className }: WizardBubbleProps) {
  const reduced = useReducedMotion();
  const isApp = from === "app";

  const initial = reduced
    ? { opacity: 0 }
    : { opacity: 0, y: 8, scale: 0.98 };
  const animate = reduced
    ? { opacity: 1 }
    : { opacity: 1, y: 0, scale: 1 };

  return (
    <motion.div
      initial={initial}
      animate={animate}
      transition={{ duration: 0.3, delay, ease: "easeOut" }}
      className={cn(
        "flex items-end gap-2 w-full",
        isApp ? "justify-start" : "justify-end",
        className,
      )}
    >
      {/* Avatar do app (só no lado app) */}
      {isApp && (
        <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 mb-0.5">
          <Sprout className="w-4 h-4 text-primary" strokeWidth={2.5} />
        </div>
      )}

      {/* Balão */}
      <div
        className={cn(
          "max-w-[80%] px-4 py-2.5 text-sm leading-relaxed",
          isApp
            ? "bg-muted text-foreground rounded-2xl rounded-bl-md"
            : "bg-primary/10 text-foreground rounded-2xl rounded-br-md border border-primary/15",
        )}
      >
        {children}
      </div>
    </motion.div>
  );
}

/**
 * WizardTyping — indicador "app está digitando" (3 dots pulsando).
 * Mostrar brevemente antes de revelar a próxima fala do app, pra dar
 * sensação de conversa real.
 */
export function WizardTyping({ delay = 0 }: { delay?: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: "easeOut" }}
      className="flex items-end gap-2 justify-start w-full"
    >
      <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 mb-0.5">
        <Sprout className="w-4 h-4 text-primary" strokeWidth={2.5} />
      </div>
      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </div>
    </motion.div>
  );
}
