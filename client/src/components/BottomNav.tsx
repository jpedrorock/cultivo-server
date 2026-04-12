import { Calculator, Bell, MoreHorizontal, Sprout, Settings, Leaf, CheckSquare, Plus, BookOpen, Wind, Sunrise, ThermometerSun, Heart, Sparkles, Scissors, ChevronRight, Bot } from "lucide-react";
import { TentIcon } from "@/components/TentIcon";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { useNavBadges } from "@/hooks/useNavBadges";
import { trpc } from "@/lib/trpc";
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
  const [location, navigate] = useLocation();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const [trainingPickerOpen, setTrainingPickerOpen] = useState(false);
  const [chatPickerOpen, setChatPickerOpen] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);

  // Carrega plantas ativas quando o picker de treinamento ou chat está aberto
  const { data: activePlants = [] } = trpc.plants.list.useQuery(
    { status: 'ACTIVE' },
    { enabled: trainingPickerOpen || chatPickerOpen },
  );
  const { data: allTents = [] } = trpc.tents.list.useQuery(
    undefined,
    { enabled: chatPickerOpen },
  );
  const tentMap = Object.fromEntries((allTents as any[]).map((t: any) => [t.id, t.name]));

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

  // Close FAB menu when clicking outside
  useEffect(() => {
    if (!fabMenuOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) {
        setFabMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [fabMenuOpen]);

  // Detectar teclado virtual iOS (visualViewport encolhe quando teclado abre)
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handleResize = () => {
      // Se a viewport visual é <75% da janela inteira, teclado está aberto
      setKeyboardOpen(vv.height < window.innerHeight * 0.75);
    };
    vv.addEventListener('resize', handleResize);
    return () => vv.removeEventListener('resize', handleResize);
  }, []);

  // Ocultar nav em telas de foco (ex: registro rápido) ou com teclado aberto — após todos os hooks
  const isHidden =
    HIDDEN_NAV_ROUTES.includes(location) ||
    location.endsWith("/display") ||
    location.endsWith("/training") ||
    keyboardOpen;

  const navItems: NavItem[] = [
    { href: "/", icon: TentIcon, label: "Estufas" },
    { href: "/plants", icon: Leaf, label: "Plantas" },
    { href: "/calculators", icon: Calculator, label: "Calculadoras" },
  ];

  const moreMenuItems: NavItem[] = [
    { href: "/morning-check", icon: Sunrise, label: "Status" },
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
        <div className="flex justify-around items-end pb-3 pt-3">
          {/* FAB — Mini menu Force Touch style */}
          <div ref={fabRef} className="relative flex items-center justify-center -mt-5" data-tour="quick-log-menu">
            {/* Popup menu — aparece acima do FAB, ancorado na viewport para não sair da tela */}
            {fabMenuOpen && (
              <div className="fixed bottom-[72px] left-3 w-56 rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150 z-[200]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                {/* Seta apontando para o FAB (FAB está ~28px do left-3, então seta perto da esquerda) */}
                <div className="absolute bottom-0 left-7 translate-y-full w-0 h-0 border-l-[7px] border-r-[7px] border-t-[7px] border-l-transparent border-r-transparent border-t-border/60" />
                <div className="absolute bottom-0 left-7 translate-y-[5px] w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-card/95" />

                <Link
                  href="/quick-log?mode=status"
                  onClick={() => { triggerHapticFeedback(); setFabMenuOpen(false); }}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-teal-500/8 active:bg-teal-500/15 transition-colors border-b border-border/30 w-full"
                >
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center shrink-0 shadow-sm">
                    <ThermometerSun className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-tight">Status da Estufa</p>
                    <p className="text-[11px] text-muted-foreground/60">Temp, RH, pH, EC, luz</p>
                  </div>
                </Link>

                <Link
                  href="/quick-log?mode=plant"
                  onClick={() => { triggerHapticFeedback(); setFabMenuOpen(false); }}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-rose-500/8 active:bg-rose-500/15 transition-colors border-b border-border/30 w-full"
                >
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shrink-0 shadow-sm">
                    <Heart className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-tight">Saúde de Planta</p>
                    <p className="text-[11px] text-muted-foreground/60">Status, sintomas, foto</p>
                  </div>
                </Link>

                <Link
                  href="/quick-log?mode=trichome"
                  onClick={() => { triggerHapticFeedback(); setFabMenuOpen(false); }}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-violet-500/8 active:bg-violet-500/15 transition-colors border-b border-border/30 w-full"
                >
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 shadow-sm">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-tight">Tricomas</p>
                    <p className="text-[11px] text-muted-foreground/60">Maturação · Flora</p>
                  </div>
                </Link>

                {/* Treinamento — abre picker de planta */}
                <button
                  onClick={() => { triggerHapticFeedback(); setFabMenuOpen(false); setTrainingPickerOpen(true); }}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-green-500/8 active:bg-green-500/15 transition-colors border-b border-border/30 w-full text-left"
                >
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shrink-0 shadow-sm">
                    <Scissors className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-tight">Treinamento</p>
                    <p className="text-[11px] text-muted-foreground/60">LST, topping, super crop</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                </button>

                {/* IA Especialista — abre picker de planta */}
                <button
                  onClick={() => { triggerHapticFeedback(); setFabMenuOpen(false); setChatPickerOpen(true); }}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-blue-500/8 active:bg-blue-500/15 transition-colors w-full text-left"
                >
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-tight">IA Especialista</p>
                    <p className="text-[11px] text-muted-foreground/60">Diagnóstico · LST · Tricomas</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                </button>
              </div>
            )}

            {/* ── Sheet: picker de planta para treinamento ── */}
            <Sheet open={trainingPickerOpen} onOpenChange={setTrainingPickerOpen}>
              <SheetContent side="bottom" className="rounded-t-2xl" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
                <SheetHeader className="mb-4">
                  <SheetTitle className="text-sm flex items-center gap-2">
                    <Scissors className="w-4 h-4 text-emerald-500" />
                    Selecionar planta para treinar
                  </SheetTitle>
                </SheetHeader>
                {activePlants.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhuma planta ativa encontrada</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pb-2">
                    {activePlants.map((plant: any) => (
                      <button
                        key={plant.id}
                        onClick={() => {
                          triggerHapticFeedback();
                          setTrainingPickerOpen(false);
                          navigate(`/plants/${plant.id}/training?sandbox=1`);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/40 hover:border-emerald-500/40 hover:bg-emerald-500/5 active:scale-[0.98] transition-all text-left"
                      >
                        <span className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0 text-sm font-bold text-emerald-500">
                          {(plant.name ?? '?')[0].toUpperCase()}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold leading-tight truncate">{plant.name ?? `Planta ${plant.id}`}</p>
                          {plant.strain && (
                            <p className="text-xs text-muted-foreground truncate">{plant.strain}</p>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </SheetContent>
            </Sheet>

            {/* ── Sheet: picker de planta para IA chat ── */}
            <Sheet open={chatPickerOpen} onOpenChange={setChatPickerOpen}>
              <SheetContent side="bottom" className="rounded-t-2xl flex flex-col" style={{ maxHeight: '75vh', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
                {/* Header */}
                <div className="shrink-0 mb-4">
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5 text-white" />
                    </div>
                    <p className="font-bold text-base">Conversar sobre qual planta?</p>
                  </div>
                  <p className="text-xs text-muted-foreground ml-9">A IA recebe fase, ambiente e saúde automaticamente</p>
                </div>

                {activePlants.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">Nenhuma planta ativa encontrada</p>
                  </div>
                ) : (() => {
                  const gradients = [
                    'from-emerald-500 to-teal-600', 'from-blue-500 to-indigo-600',
                    'from-violet-500 to-purple-600', 'from-rose-500 to-pink-600',
                    'from-amber-500 to-orange-600', 'from-cyan-500 to-sky-600',
                  ];
                  const stageLabel = (s: string) =>
                    s === 'CLONE' ? 'Clone' : s === 'SEEDLING' ? 'Seedling' :
                    s === 'VEGETATION' ? 'Vegetativa' : s === 'FLOWERING' ? 'Flora' : 'Planta';

                  // Agrupar por estufa
                  const groups = new Map<string, { tentName: string; plants: any[] }>();
                  for (const p of activePlants as any[]) {
                    const key = p.currentTentId ? String(p.currentTentId) : '__sem_estufa__';
                    const tentName = p.currentTentId ? (tentMap[p.currentTentId] ?? `Estufa ${p.currentTentId}`) : 'Sem estufa';
                    if (!groups.has(key)) groups.set(key, { tentName, plants: [] });
                    groups.get(key)!.plants.push(p);
                  }

                  return (
                    <div className="flex-1 overflow-y-auto space-y-4">
                      {Array.from(groups.entries()).map(([key, group]) => (
                        <div key={key}>
                          {/* Tent header */}
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-5 h-5 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <span className="text-[10px]">🏕️</span>
                            </div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.tentName}</p>
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-[10px] text-muted-foreground">{group.plants.length} planta{group.plants.length !== 1 ? 's' : ''}</span>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            {group.plants.map((plant: any) => {
                              const letter = (plant.name ?? '?')[0].toUpperCase();
                              const grad = gradients[letter.charCodeAt(0) % gradients.length];
                              return (
                                <button
                                  key={plant.id}
                                  onClick={() => {
                                    triggerHapticFeedback();
                                    setChatPickerOpen(false);
                                    navigate(`/chat/${plant.id}`);
                                  }}
                                  className="flex flex-col items-center gap-2.5 p-4 rounded-2xl border border-border/60 bg-card hover:border-blue-500/40 hover:bg-blue-500/5 active:scale-[0.96] transition-all text-center"
                                >
                                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${grad} flex items-center justify-center text-white font-bold text-2xl shadow-md`}>
                                    {letter}
                                  </div>
                                  <div className="min-w-0 w-full">
                                    <p className="text-sm font-semibold text-foreground truncate leading-tight">{plant.name ?? `Planta ${plant.id}`}</p>
                                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                                      {stageLabel(plant.plantStage ?? '')}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </SheetContent>
            </Sheet>

            <button
              onClick={() => { triggerHapticFeedback(); setFabMenuOpen(v => !v); }}
              className={cn(
                "w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-xl shadow-green-900/40 transition-all duration-200",
                fabMenuOpen ? "scale-90 rotate-45" : "active:scale-95"
              )}
            >
              <Plus className="w-6 h-6 text-white stroke-[2.5]" />
            </button>
          </div>

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
                  "flex items-center justify-center p-3 rounded-xl transition-colors relative",
                  isActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                )}
              >
                <Icon className={cn("w-6 h-6", isActive && "stroke-[2.5]")} />
              </Link>
            );
          })}

          {/* More Menu */}
          <Sheet open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
            <SheetTrigger asChild>
              <button
                onClick={triggerHapticFeedback}
                className={cn(
                  "flex items-center justify-center p-3 rounded-xl transition-colors",
                  "hover:bg-primary/10",
                  isMoreMenuActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-primary"
                )}
              >
                <MoreHorizontal className={cn("w-6 h-6", isMoreMenuActive && "stroke-[2.5]")} />
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
