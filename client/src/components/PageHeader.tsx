import { ArrowLeft } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MouseEvent, ReactNode } from "react";

interface PageHeaderProps {
  /**
   * Título principal. Aceita string ou ReactNode (ícone + texto, badges inline, etc.)
   */
  title?: string | ReactNode;
  /**
   * Subtítulo opcional em cinza, abaixo do título.
   */
  subtitle?: ReactNode;
  /**
   * Rota de fallback quando não há histórico de navegação (ex: usuário chegou via URL direta).
   * No caso geral, o botão usa `history.back()` para preservar filtros/scroll da página anterior.
   */
  backHref: string;
  /**
   * Conteúdo opcional à direita (botões CTA, filtros, badges, dropdown).
   */
  rightActions?: ReactNode;
  /**
   * Se true, header fica sticky no topo (default: true).
   */
  sticky?: boolean;
  /**
   * Classes extras para o `<header>`.
   */
  className?: string;
  /**
   * Classes extras para o `<h1>` do título.
   */
  titleClassName?: string;
  /**
   * Conteúdo renderizado abaixo da linha principal do header — útil para tabs,
   * barra de filtros, ou stats que devem ficar "colados" ao título.
   */
  children?: ReactNode;
}

/**
 * Header padrão de páginas secundárias.
 *
 * - Botão de voltar unificado: usa `history.back()` quando há histórico na aba
 *   (preserva filtros/scroll da página anterior) e cai em `backHref` quando
 *   o usuário chegou por URL direta, refresh, bookmark.
 * - Safe area superior (iPhone com notch) por padrão.
 * - Sticky por padrão — passe `sticky={false}` em telas sem scroll.
 */
export function PageHeader({
  title,
  subtitle,
  backHref,
  rightActions,
  sticky = true,
  className,
  titleClassName,
  children,
}: PageHeaderProps) {
  const [, navigate] = useLocation();

  const handleBack = (e: MouseEvent<HTMLAnchorElement>) => {
    // Permite Ctrl/Cmd+clique ou botão do meio abrir o backHref em nova aba.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      navigate(backHref);
    }
  };

  return (
    <header
      className={cn(
        "bg-card border-b border-border pt-safe",
        sticky && "sticky top-0 z-20",
        className,
      )}
    >
      <div className="container mx-auto px-4 py-3 flex items-center gap-3">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
        >
          <Link href={backHref} onClick={handleBack} aria-label="Voltar">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>

        <div className="flex-1 min-w-0">
          {title !== undefined && title !== null && (
            <h1
              className={cn(
                "text-lg sm:text-xl font-bold text-foreground truncate flex items-center gap-2",
                titleClassName,
              )}
            >
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate">
              {subtitle}
            </p>
          )}
        </div>

        {rightActions && (
          <div className="shrink-0 flex items-center gap-2">{rightActions}</div>
        )}
      </div>
      {children}
    </header>
  );
}
