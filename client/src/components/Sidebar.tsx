import { Home, Calculator, BarChart3, Bell, Sprout, Leaf, Settings, Droplets, CheckSquare, Beaker } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function Sidebar() {
  const [location] = useLocation();

  const navItems = [
    { href: "/", icon: Home, label: "Home", enabled: true },
    { href: "/plants", icon: Sprout, label: "Plantas", enabled: true },
    { href: "/tarefas", icon: CheckSquare, label: "Tarefas", enabled: true },
    { href: "/calculators", icon: Calculator, label: "Calculadoras", enabled: true },
    { href: "/history", icon: BarChart3, label: "Histórico", enabled: true },
    { href: "/alerts", icon: Bell, label: "Alertas", enabled: true },
    { href: "/manage-strains", icon: Leaf, label: "Strains", enabled: true },
  ];

  return (
    <aside className="hidden md:flex md:flex-col md:fixed md:left-0 md:top-0 md:h-screen md:w-64 bg-sidebar border-r border-sidebar-border shadow-sm z-40">
      {/* Logo/Header */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Leaf className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-sidebar-foreground">App Cultivo</h1>
            <p className="text-xs text-muted-foreground">Gerenciamento</p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          
          // If link is disabled, wrap in tooltip
          if (!item.enabled) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                      "opacity-50 cursor-not-allowed text-sidebar-foreground"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Em breve</p>
                </TooltipContent>
              </Tooltip>
            );
          }
          
          // Enabled link
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                "hover:bg-sidebar-accent",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-sidebar-foreground hover:text-primary"
              )}
            >
              <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border space-y-3">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
            "hover:bg-sidebar-accent",
            location === "/settings"
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
              : "text-sidebar-foreground hover:text-primary"
          )}
        >
          <Settings className={cn("w-5 h-5", location === "/settings" && "stroke-[2.5]")} />
          <span>Configurações</span>
        </Link>
        <div className="px-4 py-2 bg-sidebar-accent rounded-lg">
          <p className="text-xs text-primary font-medium">Sistema Ativo</p>
          <p className="text-xs text-muted-foreground mt-1">3 estufas monitoradas</p>
        </div>
      </div>
    </aside>
  );
}
