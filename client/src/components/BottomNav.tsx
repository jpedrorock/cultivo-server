import { Calculator, Bell, MoreHorizontal, Sprout, Settings, Leaf, CheckSquare, Plus, BookOpen, Wind, Sunrise } from "lucide-react";
import { TentIcon } from "@/components/TentIcon";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { useNavBadges } from "@/hooks/useNavBadges";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// Haptic feedback helper
const triggerHapticFeedback = () => {
  if ('vibrate' in navigator) {
    navigator.vibrate(10); // 10ms light vibration
  }
};

type NavItem = {
  href: string;
  icon: React.ComponentType<any>;
  label: string;
  badge?: number;
};

// Rotas onde o BottomNav deve ficar oculto (telas de foco total)
const HIDDEN_NAV_ROUTES = ["/quick-log"];
const HIDDEN_NAV_PREFIXES = ["/tent/", "/display"];

export function BottomNav() {
  const [location] = useLocation();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // TODOS os hooks devem ser chamados antes de qualquer return condicional (regra do React)
  const { alertCount, harvestQueueCount } = useNavBadges();
  const prevCountRef = useRef<number | null>(null);
  const [badgeShaking, setBadgeShaking] = useState(false);

  useEffect(() => {
    if (prevCountRef.current !== null && alertCount > prevCountRef.current) {
      setBadgeShaking(true);
      const timer = setTimeout(() => setBadgeShaking(false), 700);
      return () => clearTimeout(timer);
    }
    prevCountRef.current = alertCount;
  }, [alertCount]);

  // Ocultar nav em telas de foco (ex: registro rápido) — após todos os hooks
  const isHidden = HIDDEN_NAV_ROUTES.includes(location) || location.endsWith("/display");

  const navItems: NavItem[] = [
    { href: "/", icon: TentIcon, label: "Estufas" },
    { href: "/calculators", icon: Calculator, label: "Calculadoras" },
  ];

  const moreMenuItems: NavItem[] = [
    { href: "/morning-check", icon: Sunrise, label: "Status" },
    { href: "/plants", icon: Leaf, label: "Plantas" },
    { href: "/harvest-queue", icon: Wind, label: "Aguardando Secagem", badge: harvestQueueCount },
    { href: "/tarefas", icon: CheckSquare, label: "Tarefas" },
    { href: "/alerts", icon: Bell, label: "Alertas", badge: alertCount || 0 },
    { href: "/manage-strains", icon: Sprout, label: "Strains" },
    { href: "/help", icon: BookOpen, label: "Guia do Usuário" },
    { href: "/settings", icon: Settings, label: "Configurações" },
  ];

  const isMoreMenuActive = moreMenuItems.some(item => location === item.href);

  if (isHidden) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg z-50 md:hidden"
      style={{
        // iOS Safari: position:fixed pode falhar quando ancestrais têm transform/backdrop-filter.
        // Forçar contexto de composição próprio na GPU com translate3d.
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
        willChange: 'transform',
        WebkitBackfaceVisibility: 'hidden',
        backfaceVisibility: 'hidden',
        // Padding bottom para safe-area (iPhone com notch/home indicator)
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        // zIndex 100: acima dos headers sticky (z-10/z-40) mas abaixo dos modais/sheets (z-[200]+)
        zIndex: 100,
      }}
    >
      <div className="max-w-screen-xl mx-auto px-2">
        <div className="flex justify-around items-end pb-1 pt-1">
          {/* FAB — Novo Registro (primeiro) */}
          <Link
            href="/quick-log"
            onClick={triggerHapticFeedback}
            data-tour="quick-log-menu"
            className="flex flex-col items-center justify-center gap-1 relative -mt-5"
          >
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-xl shadow-green-900/40 active:scale-95 transition-transform">
              <Plus className="w-7 h-7 text-white stroke-[2.5]" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground">Registro</span>
          </Link>

          {/* Nav items — Estufas e Calculadoras */}
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={triggerHapticFeedback}
                data-tour={item.href === "/calculators" ? "calculators-menu" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2 px-5 rounded-lg transition-colors relative",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                )}
              >
                <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
                <span className="text-[11px] font-medium">{item.label}</span>
              </Link>
            );
          })}

          {/* More Menu */}
          <Sheet open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
            <SheetTrigger asChild>
              <button
                onClick={triggerHapticFeedback}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-3 px-4 rounded-lg transition-colors",
                  "hover:bg-primary/10",
                  isMoreMenuActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-primary"
                )}
              >
                <MoreHorizontal className={cn("w-6 h-6", isMoreMenuActive && "stroke-[2.5]")} />
                <span className="text-xs font-medium">Mais</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto pb-safe">
              <SheetHeader className="sr-only">
                <SheetTitle>Menu Mais</SheetTitle>
              </SheetHeader>
              <div className="space-y-2 pb-6 pt-8">
                {moreMenuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location === item.href;
                  const isAlertsItem = item.href === "/alerts";
                  
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => {
                        triggerHapticFeedback();
                        setMoreMenuOpen(false);
                      }}
                      data-tour={item.href === "/history" ? "history-menu" : undefined}
                      className={cn(
                        "flex items-center gap-4 px-4 py-4 rounded-lg transition-colors relative",
                        "hover:bg-primary/10",
                        isActive
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-foreground"
                      )}
                    >
                      <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
                      <span className="text-base">{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className={cn(
                          "ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center",
                          isAlertsItem && badgeShaking ? "animate-badge-shake" : "animate-pulse"
                        )}>
                          {item.badge > 9 ? '9+' : item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
