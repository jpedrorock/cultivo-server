import { Calculator, BarChart3, Bell, Sprout, Leaf, Settings, CheckSquare, BookOpen, AlertTriangle } from "lucide-react";
import { TentIcon } from "@/components/TentIcon";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useState, useEffect, useRef } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

export function Sidebar() {
  const [location] = useLocation();
  const { data: tents } = trpc.tents.list.useQuery();
  const { data: alertCount } = trpc.alerts.getNewCount.useQuery(
    {},
    { refetchInterval: 30_000 } // poll every 30s to detect new alerts
  );

  // Track previous count to detect new alerts — badge shake
  const prevCountRef = useRef<number | null>(null);
  const [badgeShaking, setBadgeShaking] = useState(false);

  // Track previous count for status pill shake
  const prevPillCountRef = useRef<number | null>(null);
  const [pillShaking, setPillShaking] = useState(false);

  useEffect(() => {
    const current = alertCount ?? 0;
    const prev = prevCountRef.current;

    if (prev !== null && current > prev) {
      // Shake the nav badge
      setBadgeShaking(true);
      const t1 = setTimeout(() => setBadgeShaking(false), 700);

      // Shake the status pill alert count too
      setPillShaking(true);
      const t2 = setTimeout(() => setPillShaking(false), 700);

      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    prevCountRef.current = current;
    prevPillCountRef.current = current;
  }, [alertCount]);

  const navItems = [
    { href: "/", icon: TentIcon, label: "Estufas", enabled: true, badge: 0 },
    { href: "/plants", icon: Sprout, label: "Plantas", enabled: true, badge: 0 },
    { href: "/tarefas", icon: CheckSquare, label: "Tarefas", enabled: true, badge: 0 },
    { href: "/calculators", icon: Calculator, label: "Calculadoras", enabled: true, badge: 0 },
    { href: "/history", icon: BarChart3, label: "Histórico", enabled: true, badge: 0 },
    { href: "/alerts", icon: Bell, label: "Alertas", enabled: true, badge: alertCount || 0 },
    { href: "/manage-strains", icon: Leaf, label: "Strains", enabled: true, badge: 0 },
  ];

  const tentCount = tents?.length ?? 0;
  const tentLabel = tentCount === 1
    ? "1 estufa monitorada"
    : `${tentCount} estufas monitoradas`;

  const unreadAlerts = alertCount ?? 0;

  return (
    <aside className="hidden md:flex md:flex-col md:fixed md:left-0 md:top-0 md:h-screen md:w-64 bg-sidebar border-r border-sidebar-border z-40 shadow-[2px_0_12px_rgba(0,0,0,0.06)]">
      
      {/* Logo/Header — gradient accent strip */}
      <div className="relative p-5 border-b border-sidebar-border overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/15 rounded-xl flex items-center justify-center ring-1 ring-primary/20 shadow-sm">
            <TentIcon className="w-9 h-6" strokeColor="currentColor" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-sidebar-foreground leading-tight">App Cultivo</h1>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Gerenciamento</p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          const isAlertsItem = item.href === "/alerts";
          
          if (!item.enabled) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
                      "opacity-40 cursor-not-allowed text-sidebar-foreground"
                    )}
                  >
                    <Icon className="w-4.5 h-4.5" />
                    <span className="text-sm">{item.label}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Em breve</p>
                </TooltipContent>
              </Tooltip>
            );
          }
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150",
                isActive
                  ? "bg-primary/10 text-primary font-semibold shadow-sm ring-1 ring-primary/15"
                  : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <Icon className={cn(
                "w-4.5 h-4.5 shrink-0",
                isActive ? "text-primary stroke-[2.5]" : "stroke-[1.75]"
              )} />
              <span className="flex-1 text-sm">{item.label}</span>
              {item.badge > 0 && (
                <Badge
                  variant="destructive"
                  className={cn(
                    "h-5 min-w-5 px-1.5 text-[10px] font-bold rounded-full inline-block",
                    isAlertsItem && badgeShaking && "animate-badge-shake"
                  )}
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 pt-2 border-t border-sidebar-border space-y-0.5">
        {/* Help */}
        <Link
          href="/help"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150",
            location === "/help"
              ? "bg-primary/10 text-primary font-semibold shadow-sm ring-1 ring-primary/15"
              : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          )}
        >
          <BookOpen className={cn(
            "w-4.5 h-4.5 shrink-0",
            location === "/help" ? "text-primary stroke-[2.5]" : "stroke-[1.75]"
          )} />
          <span className="text-sm">Guia do Usuário</span>
        </Link>

        {/* Settings */}
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150",
            location === "/settings"
              ? "bg-primary/10 text-primary font-semibold shadow-sm ring-1 ring-primary/15"
              : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          )}
        >
          <Settings className={cn(
            "w-4.5 h-4.5 shrink-0",
            location === "/settings" ? "text-primary stroke-[2.5]" : "stroke-[1.75]"
          )} />
          <span className="text-sm">Configurações</span>
        </Link>

        {/* Status pill */}
        <div className="mt-3 mx-1 px-3 py-2.5 bg-primary/8 rounded-xl border border-primary/12">
          {/* Row 1: Sistema Ativo dot */}
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
            <p className="text-xs text-primary font-semibold">Sistema Ativo</p>
          </div>

          {/* Row 2: tent count */}
          <p className="text-[11px] text-muted-foreground mt-0.5 pl-3.5">
            {tents ? tentLabel : 'Carregando...'}
          </p>

          {/* Row 3: alert count — only shown when there are unread alerts */}
          {unreadAlerts > 0 && (
            <div className={cn(
              "flex items-center gap-1.5 mt-1.5 pl-3.5",
              pillShaking && "animate-badge-shake"
            )}>
              <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
              <p className="text-[11px] text-destructive font-semibold">
                {unreadAlerts === 1
                  ? "1 alerta não lido"
                  : `${unreadAlerts} alertas não lidos`}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
