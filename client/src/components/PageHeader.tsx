import { ArrowLeft, Menu } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/contexts/SidebarContext";
import type { MouseEvent, ReactNode } from "react";

interface PageHeaderProps {
  title?: string | ReactNode;
  subtitle?: ReactNode;
  backHref: string;
  rightActions?: ReactNode;
  sticky?: boolean;
  spacerHeight?: string;
  className?: string;
  titleClassName?: string;
  children?: ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  rightActions,
  sticky = true,
  spacerHeight,
  className,
  titleClassName,
  children,
}: PageHeaderProps) {
  const resolvedSpacerHeight = spacerHeight ?? (subtitle ? "88px" : "64px");
  const [, navigate] = useLocation();
  const { collapsed, openSidebar } = useSidebar();

  const handleBack = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      navigate(backHref);
    }
  };

  const headerEl = (
    <header
      className={cn(
        "bg-card border-b border-border",
        sticky
          ? cn(
              "fixed top-0 left-0 right-0 z-20 pt-safe",
              "transition-[left] duration-200 ease-in-out",
              // iPad (md < lg): sem deslocamento — sidebar é overlay
              // Desktop (lg+): desloca conforme estado do sidebar
              collapsed ? "lg:left-16" : "lg:left-64",
            )
          : "relative",
        className,
      )}
    >
      <div className="container mx-auto px-4 py-3 flex items-center gap-3">
        {/* Hamburguer — só visível no iPad (md < lg) */}
        <Button
          variant="ghost"
          size="icon"
          className="sidebar-hamburger h-10 w-10 shrink-0"
          onClick={openSidebar}
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </Button>

        {/* Botão voltar */}
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

  if (!sticky) return headerEl;

  return (
    <>
      {headerEl}
      <div
        aria-hidden="true"
        className="pt-safe"
        style={{ paddingBottom: resolvedSpacerHeight }}
      />
    </>
  );
}
