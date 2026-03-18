import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";

interface PageLayoutProps {
  /** Conteúdo do header sticky (ficará FORA da animação para não ficar transparente) */
  header?: ReactNode;
  /** Conteúdo principal da página (será animado com fade) */
  children: ReactNode;
  className?: string;
}

/**
 * PageLayout — wrapper de página que separa o header do conteúdo animado.
 *
 * PROBLEMA RESOLVIDO:
 * O PageTransition usa motion.div com opacity/transform que cria stacking context.
 * Qualquer position:sticky dentro desse contexto fica sem background visível
 * durante a animação (opacity herdado pelo filho).
 *
 * SOLUÇÃO:
 * O header é renderizado FORA do motion.div animado, garantindo que sempre
 * tenha background opaco. Apenas o conteúdo principal é animado.
 */
export function PageLayout({ header, children, className }: PageLayoutProps) {
  return (
    <div className={className ?? "min-h-screen bg-background"}>
      {/* Header fora da animação — sempre opaco */}
      {header && (
        <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
          {header}
        </header>
      )}

      {/* Conteúdo animado com fade suave */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </div>
  );
}
