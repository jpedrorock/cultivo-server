import { motion, AnimatePresence, useMotionValue, useTransform, animate, useReducedMotion } from "framer-motion";
import { ReactNode, useEffect } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * PageTransition — wrapper de transição entre páginas.
 *
 * Usa CSS animate-in (tailwindcss-animate) em vez de framer-motion opacity/transform
 * para não criar stacking context persistente que quebraria position:sticky.
 * A animação CSS completa em 220ms e remove o stacking context automaticamente.
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <div className={`animate-in fade-in duration-[220ms] ease-out ${className ?? ''}`}>
      {children}
    </div>
  );
}

/**
 * TabContent — anima a troca de conteúdo entre abas.
 * Use com AnimatePresence e key={activeTab} no pai.
 *
 * @example
 * <AnimatePresence mode="wait" initial={false}>
 *   <TabContent key={tab}>
 *     {tab === 'a' && <TabA />}
 *   </TabContent>
 * </AnimatePresence>
 */
export function TabContent({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

// Fade transition for modals/dialogs
export function FadeTransition({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

// Scale-up animation for cards
export function CardAnimation({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      className={className}
      whileHover={{ scale: 1.01, transition: { duration: 0.15 } }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.1 }}
    >
      {children}
    </motion.div>
  );
}

/**
 * PressableCard — wrapper com feedback tátil de pressão para cards clicáveis.
 * Substitui active:scale-[0.98] do Tailwind com uma animação suave real.
 */
export function PressableCard({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      className={className}
      whileTap={{ scale: 0.975, transition: { duration: 0.1, ease: "easeOut" } }}
    >
      {children}
    </motion.div>
  );
}

// Stagger animation wrapper for lists
interface StaggerListProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}

export function StaggerList({
  children,
  className,
  staggerDelay = 0.06,
}: StaggerListProps) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: staggerDelay,
            delayChildren: 0.04,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

// List item animation — use inside StaggerList
export function ListItemAnimation({ children, className }: PageTransitionProps) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 14 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" } },
      }}
    >
      {children}
    </motion.div>
  );
}

// Slide-in from bottom (for bottom sheets, modals)
export function SlideUp({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

// Animated counter for KPI numbers
interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
  decimals?: number;
  suffix?: string;
  prefix?: string;
}

export function AnimatedCounter({
  value,
  duration = 0.8,
  className,
  decimals = 0,
  suffix = "",
  prefix = "",
}: AnimatedCounterProps) {
  const reduced = useReducedMotion();
  const motionValue = useMotionValue(reduced ? value : 0);
  const rounded = useTransform(motionValue, (latest) => {
    const formatted = latest.toFixed(decimals);
    return `${prefix}${formatted}${suffix}`;
  });

  useEffect(() => {
    if (reduced) {
      // sem animação: definir valor imediatamente
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, {
      duration,
      ease: "easeOut",
    });
    return controls.stop;
  }, [value, duration, motionValue, reduced]);

  return <motion.span className={className}>{rounded}</motion.span>;
}

// Animated presence wrapper — use around conditionally rendered content
export { AnimatePresence };
