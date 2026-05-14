/**
 * EmptyState — componente compartilhado pra "tela vazia" com call-to-action.
 *
 * Antes: API básica (icon + title + description + 1 CTA), usado em 4 lugares.
 * Agora: API extendida pra cobrir mais casos do app.
 *
 * Variants:
 * - default — card grande pra full-page (PlantsList, Alerts, etc.)
 * - compact — sem card, padding menor, pra usar dentro de tabs/sheets/modais
 *
 * Actions:
 * - Primary action via `action.onClick` OU `action.href` (Link wouter)
 * - Secondary action opcional pra "Saiba mais" / "Voltar"
 *
 * Cores do ícone:
 * - default — neutro (muted)
 * - accent — usa cor de acento (pra empty states que merecem destaque)
 */
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type EmptyStateVariant = "default" | "compact";
type EmptyStateAccent = "neutral" | "primary" | "rose" | "amber" | "sky" | "violet";

interface EmptyStateAction {
  label: string;
  /** Click handler. Use OR `href` (anchor). Não passar os dois. */
  onClick?: () => void;
  /** Anchor href (wouter Link). Use OR `onClick`. */
  href?: string;
  /** Variante do botão. Default = primário. */
  variant?: "default" | "outline" | "ghost";
}

interface EmptyStateProps {
  icon: LucideIcon | ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  /** Ação primária (botão grande). */
  action?: EmptyStateAction;
  /** Ação secundária (texto/link discreto). */
  secondaryAction?: EmptyStateAction;
  /** Variante do layout. Default = card cheio (full-page). compact = inline. */
  variant?: EmptyStateVariant;
  /** Cor de acento do ícone. Default = neutro. */
  accent?: EmptyStateAccent;
  /** Classes extras pra container raiz. */
  className?: string;

  // Backward-compat (API antiga)
  /** @deprecated Use action.label */
  actionLabel?: string;
  /** @deprecated Use action.onClick */
  onAction?: () => void;
}

const ACCENT_CLASSES: Record<EmptyStateAccent, { bg: string; ring: string; icon: string }> = {
  neutral: {
    bg: "bg-muted",
    ring: "",
    icon: "text-muted-foreground",
  },
  primary: {
    bg: "bg-primary/10",
    ring: "ring-1 ring-primary/20",
    icon: "text-primary",
  },
  rose: {
    bg: "bg-rose-500/10",
    ring: "ring-1 ring-rose-500/20",
    icon: "text-rose-400",
  },
  amber: {
    bg: "bg-amber-500/10",
    ring: "ring-1 ring-amber-500/20",
    icon: "text-amber-400",
  },
  sky: {
    bg: "bg-sky-500/10",
    ring: "ring-1 ring-sky-500/20",
    icon: "text-sky-400",
  },
  violet: {
    bg: "bg-violet-500/10",
    ring: "ring-1 ring-violet-500/20",
    icon: "text-violet-400",
  },
};

function ActionButton({ action }: { action: EmptyStateAction }) {
  const buttonProps = {
    size: "lg" as const,
    variant: action.variant ?? "default",
    onClick: action.onClick,
  };

  if (action.href) {
    return (
      <Button {...buttonProps} asChild>
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }
  return <Button {...buttonProps}>{action.label}</Button>;
}

function SecondaryActionLink({ action }: { action: EmptyStateAction }) {
  const cls = "text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2";
  if (action.href) {
    return (
      <Link href={action.href}>
        <a className={cls}>{action.label}</a>
      </Link>
    );
  }
  return (
    <button onClick={action.onClick} className={cls}>
      {action.label}
    </button>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  variant = "default",
  accent = "neutral",
  className,
  // Backward-compat (API antiga)
  actionLabel,
  onAction,
}: EmptyStateProps) {
  // Se só passou actionLabel/onAction (API antiga), normaliza pra `action`
  const resolvedAction: EmptyStateAction | undefined = action
    ?? (actionLabel && onAction ? { label: actionLabel, onClick: onAction } : undefined);

  const isCompact = variant === "compact";
  const accentCls = ACCENT_CLASSES[accent];

  const content = (
    <div className={cn(
      "flex flex-col items-center text-center max-w-md mx-auto",
      isCompact ? "gap-3 py-6 px-4" : "gap-4 py-8 md:py-12 px-4"
    )}>
      <div
        className={cn(
          "rounded-full flex items-center justify-center",
          accentCls.bg,
          accentCls.ring,
          isCompact ? "w-12 h-12" : "w-16 h-16 md:w-20 md:h-20"
        )}
      >
        <Icon className={cn(accentCls.icon, isCompact ? "w-6 h-6" : "w-8 h-8 md:w-10 md:h-10")} />
      </div>
      <div className={cn("space-y-1.5", isCompact ? "" : "space-y-2")}>
        <h3 className={cn("font-semibold leading-tight", isCompact ? "text-base" : "text-xl md:text-2xl")}>
          {title}
        </h3>
        {description && (
          <p className={cn(
            "text-muted-foreground leading-relaxed",
            isCompact ? "text-sm" : "text-sm md:text-base"
          )}>
            {description}
          </p>
        )}
      </div>
      {(resolvedAction || secondaryAction) && (
        <div className={cn(
          "flex flex-col sm:flex-row items-center gap-2 mt-1",
          isCompact ? "" : "mt-2"
        )}>
          {resolvedAction && <ActionButton action={resolvedAction} />}
          {secondaryAction && <SecondaryActionLink action={secondaryAction} />}
        </div>
      )}
    </div>
  );

  // Compact: sem card wrapper, encaixa direto no parent
  if (isCompact) {
    return <div className={className}>{content}</div>;
  }

  // Default: dentro de Card pra full-page
  return <Card className={cn("p-0", className)}>{content}</Card>;
}
