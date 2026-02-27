import { Warehouse, Calculator, Bell, MoreHorizontal, BarChart3, Sprout, Settings, Leaf, CheckSquare, Plus } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useState } from "react";

// Haptic feedback helper
const triggerHapticFeedback = () => {
  if ('vibrate' in navigator) {
    navigator.vibrate(10); // 10ms light vibration
  }
};
import { trpc } from "@/lib/trpc";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type NavItem = {
  href: string;
  icon: React.ComponentType<any>;
  label: string;
  badge?: number;
};

export function BottomNav() {
  const [location] = useLocation();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  
  // Buscar contagem de alertas não lidos
  const { data: alertCount } = trpc.alerts.getNewCount.useQuery({});

  const mainNavItems: NavItem[] = [
    { href: "/quick-log", icon: Plus, label: "Registro" },
    { href: "/", icon: Warehouse, label: "Estufas" },
    { href: "/calculators", icon: Calculator, label: "Calculadoras" },
  ];

  const moreMenuItems: NavItem[] = [
    { href: "/plants", icon: Leaf, label: "Plantas" },
    { href: "/tarefas", icon: CheckSquare, label: "Tarefas" },
    { href: "/history", icon: BarChart3, label: "Histórico" },
    { href: "/alerts", icon: Bell, label: "Alertas", badge: alertCount || 0 },
    { href: "/manage-strains", icon: Sprout, label: "Strains" },
    { href: "/settings", icon: Settings, label: "Configurações" },
  ];

  const isMoreMenuActive = moreMenuItems.some(item => location === item.href);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg z-50 md:hidden">
      <div className="max-w-screen-xl mx-auto px-4 py-3">
        <div className="flex justify-around items-center">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={triggerHapticFeedback}
                data-tour={item.href === "/quick-log" ? "quick-log-menu" : item.href === "/calculators" ? "calculators-menu" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-3 px-4 rounded-lg transition-colors relative",
                  item.href === "/quick-log"
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : isActive
                      ? "text-primary hover:bg-primary/10"
                      : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                )}
              >
                <Icon className={cn(
                  "w-6 h-6",
                  isActive && "stroke-[2.5]",
                  item.href === "/quick-log" && "stroke-[2.5]"
                )} />
                <span className="text-xs font-medium">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
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
                        <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
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
