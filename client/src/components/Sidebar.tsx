import {
  Calculator, Bell, Sprout, Leaf, Settings, CheckSquare, BookOpen,
  AlertTriangle, Wind, Wifi, Plus, Bot, PanelLeftClose, PanelLeftOpen, X,
} from "lucide-react";
import { TentIcon } from "@/components/TentIcon";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useState, useEffect, useRef } from "react";
import { useNavBadges } from "@/hooks/useNavBadges";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSidebar } from "@/contexts/SidebarContext";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

// ─── Avatar ──────────────────────────────────────────────────────────────────

function charToHue(char: string): number {
  return (char.toUpperCase().charCodeAt(0) * 47) % 360;
}

function UserAvatar({ name, email }: { name: string | null; email: string }) {
  const initial = (name || email || "?").charAt(0).toUpperCase();
  const hue = charToHue(initial);
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm select-none"
      style={{ background: `hsl(${hue}, 60%, 42%)` }}
    >
      {initial}
    </div>
  );
}

// ─── Nav data ────────────────────────────────────────────────────────────────

const PRIMARY_NAV = [
  { href: "/",        icon: TentIcon,     label: "Estufas",   isAlerts: false },
  { href: "/plants",  icon: Sprout,       label: "Plantas",   isAlerts: false },
  { href: "/alerts",  icon: Bell,         label: "Alertas",   isAlerts: true  },
  { href: "/tarefas", icon: CheckSquare,  label: "Tarefas",   isAlerts: false },
];

const SECONDARY_NAV = [
  { href: "/smartlife",      icon: Wifi,       label: "SmartLife"          },
  { href: "/calculators",    icon: Calculator, label: "Calculadoras"       },
  { href: "/manage-strains", icon: Leaf,       label: "Strains"            },
  { href: "/harvest-queue",  icon: Wind,       label: "Aguardando Secagem" },
  { href: "/chat",           icon: Bot,        label: "Doctor Jáh"    },
];

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function Sidebar() {
  const [location] = useLocation();
  const { data: tents } = trpc.tents.list.useQuery();
  const { alertCount, harvestQueueCount } = useNavBadges();
  const { user } = useAuth();
  const { collapsed, open, toggle, closeSidebar } = useSidebar();

  // Badge shake
  const prevCountRef = useRef<number | null>(null);
  const [badgeShaking, setBadgeShaking] = useState(false);
  const [pillShaking, setPillShaking] = useState(false);

  useEffect(() => {
    const current = alertCount ?? 0;
    const prev = prevCountRef.current;
    if (prev !== null && current > prev) {
      setBadgeShaking(true);
      setPillShaking(true);
      const t1 = setTimeout(() => setBadgeShaking(false), 700);
      const t2 = setTimeout(() => setPillShaking(false), 700);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    prevCountRef.current = current;
  }, [alertCount]);

  // Fechar overlay ao navegar
  useEffect(() => {
    closeSidebar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const tentCount  = tents?.length ?? 0;
  const tentLabel  = tentCount === 1 ? "1 estufa monitorada" : `${tentCount} estufas monitoradas`;
  const unreadAlerts = alertCount ?? 0;

  // ── Nav link ──────────────────────────────────────────────────────────────

  function NavLink({
    href, icon: Icon, label, badge = 0, isAlerts = false,
  }: {
    href: string; icon: React.ComponentType<{ className?: string }>;
    label: string; badge?: number; isAlerts?: boolean;
  }) {
    // Em overlay (iPad), nunca icon-only
    const isIconOnly = collapsed && !open;
    const isActive = location === href || (href !== "/" && location.startsWith(href));

    const inner = (
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-xl transition-all duration-150 cursor-pointer relative",
          isIconOnly ? "justify-center px-2 py-3" : "px-3.5 py-3",
          isActive
            ? "text-primary font-semibold shadow-sm"
            : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent",
        )}
        style={isActive ? {
          background: "linear-gradient(135deg, rgba(34,197,94,0.18) 0%, rgba(16,185,129,0.08) 60%, rgba(34,197,94,0.02) 100%)",
          boxShadow: "inset 0 0 0 1px rgba(34,197,94,0.2)",
        } : undefined}
      >
        <Icon className={cn("w-6 h-6 shrink-0", isActive ? "text-primary stroke-[2.5]" : "stroke-[1.75]")} />
        {!isIconOnly && <span className="flex-1 text-[15px]">{label}</span>}
        {!isIconOnly && badge > 0 && (
          <Badge
            variant="destructive"
            className={cn("h-5 min-w-5 px-1.5 text-[10px] font-bold rounded-full", isAlerts && badgeShaking && "animate-badge-shake")}
          >
            {badge > 99 ? "99+" : badge}
          </Badge>
        )}
        {/* Dot badge in icon-only mode */}
        {isIconOnly && badge > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive" />
        )}
      </Link>
    );

    if (isIconOnly) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{inner}</TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {label}
            {badge > 0 && (
              <Badge variant="destructive" className="h-4 px-1 text-[10px]">{badge > 99 ? "99+" : badge}</Badge>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }

    return inner;
  }

  // Se sidebar está em icon-only (collapsed no desktop, nunca no iPad overlay)
  const isIconOnly = collapsed && !open;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Backdrop iPad (overlay mode) ── */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "flex flex-col fixed left-0 top-0 h-screen",
          "bg-sidebar border-r border-sidebar-border shadow-[2px_0_12px_rgba(0,0,0,0.06)]",

          // Mobile: sempre oculto (usa bottom nav)
          "hidden md:flex",

          // iPad (md, overlay): largura fixa 256px, animação de slide
          "md:w-64 md:z-50",
          "md:transition-transform md:duration-300 md:ease-in-out",
          open ? "md:translate-x-0" : "md:-translate-x-full",

          // Desktop (lg+, docked): sem transform, animação de width
          "lg:translate-x-0 lg:z-40",
          "lg:transition-[width] lg:duration-200 lg:ease-in-out",
          isIconOnly ? "lg:w-16" : "lg:w-64",
        )}
      >
        {/* ── Topo: logo + toggle + QuickLog ── */}
        <div className={cn("border-b border-sidebar-border space-y-2", isIconOnly ? "px-2 pt-4 pb-3" : "px-4 pt-5 pb-3")}>

          {/* Logo + botões de toggle */}
          <div className={cn("flex items-center", isIconOnly ? "justify-center" : "justify-between")}>
            {isIconOnly ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-8 h-8 bg-primary/15 rounded-xl flex items-center justify-center ring-1 ring-primary/20 shadow-sm shrink-0">
                    <Leaf className="w-4 h-4 text-primary" strokeWidth={2} />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">Cultivo</TooltipContent>
              </Tooltip>
            ) : (
              <>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-primary/15 rounded-xl flex items-center justify-center ring-1 ring-primary/20 shadow-sm shrink-0">
                    <Leaf className="w-4 h-4 text-primary" strokeWidth={2} />
                  </div>
                  <span className="text-base font-bold text-sidebar-foreground tracking-tight">Cultivo</span>
                </div>

                {/* iPad: botão fechar overlay | Desktop: botão recolher */}
                <button
                  onClick={open ? closeSidebar : toggle}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                  aria-label={open ? "Fechar menu" : "Recolher menu"}
                >
                  {open
                    ? <X className="w-4 h-4" />
                    : <PanelLeftClose className="w-4 h-4" />
                  }
                </button>
              </>
            )}
          </div>

          {/* QuickLog CTA */}
          {isIconOnly ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/quick-log"
                  className="flex items-center justify-center w-full py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all duration-150 shadow-sm shadow-primary/20 cursor-pointer"
                >
                  <Plus className="w-6 h-6" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Registro Rápido</TooltipContent>
            </Tooltip>
          ) : (
            <Link
              href="/quick-log"
              className="flex items-center justify-center gap-2 w-full px-3 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-[15px] hover:bg-primary/90 active:scale-[0.98] transition-all duration-150 shadow-sm shadow-primary/20 cursor-pointer"
            >
              <Plus className="w-6 h-6 shrink-0" />
              Registro Rápido
            </Link>
          )}
        </div>

        {/* ── Nav ── */}
        <nav className={cn("flex-1 py-3 space-y-0.5 overflow-y-auto", isIconOnly ? "px-2" : "px-3")}>
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              badge={item.isAlerts ? (alertCount || 0) : 0}
              isAlerts={item.isAlerts}
            />
          ))}

          <div className="my-2 mx-1 border-t border-sidebar-border/60" />

          {SECONDARY_NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              badge={item.href === "/harvest-queue" ? (harvestQueueCount || 0) : 0}
            />
          ))}
        </nav>

        {/* ── Rodapé ── */}
        <div className={cn("pb-3 pt-2 border-t border-sidebar-border space-y-0.5", isIconOnly ? "px-2" : "px-3")}>
          <NavLink href="/help"     icon={BookOpen} label="Guia do Usuário" />
          <NavLink href="/settings" icon={Settings} label="Configurações"   />

          {/* Toggle expandir (só no desktop icon-only) */}
          {isIconOnly && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggle}
                  className="flex items-center justify-center w-full py-3 rounded-xl text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                  aria-label="Expandir menu"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expandir menu</TooltipContent>
            </Tooltip>
          )}

          {/* User avatar */}
          {user && (
            isIconOnly ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/settings/account"
                    className="flex justify-center py-1.5 cursor-pointer"
                  >
                    <UserAvatar name={user.name} email={user.email} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-medium">{user.name || "Conta"}</p>
                  <p className="text-xs opacity-70">{user.email}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                href="/settings/account"
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer mt-1"
              >
                <UserAvatar name={user.name} email={user.email} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sidebar-foreground truncate leading-tight">{user.name || "Sem nome"}</p>
                  <p className="text-[11px] text-sidebar-foreground/50 truncate leading-tight">{user.email}</p>
                </div>
              </Link>
            )
          )}

          {/* Status pill — só no modo expandido */}
          {!isIconOnly && (
            <div
              className="mt-2 mx-1 px-3 py-2.5 rounded-xl"
              style={{
                background: "linear-gradient(135deg, rgba(34,197,94,0.18) 0%, rgba(16,185,129,0.08) 60%, rgba(34,197,94,0.02) 100%)",
                boxShadow: "inset 0 0 0 1px rgba(34,197,94,0.22)",
              }}
            >
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                <p className="text-xs text-primary font-semibold">Sistema Ativo</p>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 pl-3.5">
                {tents ? tentLabel : "Carregando..."}
              </p>
              {unreadAlerts > 0 && (
                <div className={cn("flex items-center gap-1.5 mt-1.5 pl-3.5", pillShaking && "animate-badge-shake")}>
                  <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
                  <p className="text-[11px] text-destructive font-semibold">
                    {unreadAlerts === 1 ? "1 alerta não lido" : `${unreadAlerts} alertas não lidos`}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Status dot — só no icon-only */}
          {isIconOnly && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-center py-1">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    unreadAlerts > 0 ? "bg-destructive animate-pulse" : "bg-primary animate-pulse"
                  )} />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                {unreadAlerts > 0
                  ? `${unreadAlerts} alerta${unreadAlerts !== 1 ? "s" : ""} não lido${unreadAlerts !== 1 ? "s" : ""}`
                  : "Sistema Ativo"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>
    </>
  );
}
