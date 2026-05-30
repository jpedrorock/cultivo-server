import { Calculator, Bell, MoreHorizontal, Sprout, Settings, Leaf, CheckSquare, PenLine, BookOpen, Wind, ThermometerSun, Heart, Sparkles, Scissors, ChevronRight, Bot, Wifi, Timer, FlaskConical, Sun, TestTube, Droplets } from "lucide-react";
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
import { EmptyState } from "@/components/EmptyState";
import { haptics } from "@/lib/haptics";

// Haptic feedback helper.
//
// Antes era só navigator.vibrate(10), que NÃO funciona em iOS Safari/WKWebView
// (Apple desabilitou). Agora usa nosso wrapper @capacitor/haptics que aciona
// o Taptic Engine real em iOS e VibratorService em Android. Web continua
// usando navigator.vibrate via fallback do helper (no-op em iOS browser).
const triggerHapticFeedback = () => {
  haptics.light().catch(() => {});
};

type NavItem = {
  href: string;
  icon: React.ComponentType<any>;
  label: string;
  badge?: number;
};

// Rotas onde o BottomNav deve ficar oculto (telas de foco total)
const HIDDEN_NAV_ROUTES = ["/quick-log"];

// Avatar colors — light usa 700 (sóbrio), dark mantém 500 (vibrante)
const AVATAR_GRADIENTS = [
  'bg-teal-600',
  'bg-blue-600',
  'bg-violet-600',
  'bg-rose-600',
  'bg-amber-600',
  'bg-cyan-600',
];
const stageLabel = (s: string) =>
  s === 'CLONE' ? 'Clone' : s === 'SEEDLING' ? 'Seedling' :
  s === 'VEGETATION' ? 'Veg' : s === 'FLOWERING' ? 'Flora' : 'Planta';

function ChatPlantPicker({
  plants, tentMap, onSelect,
}: {
  plants: any[];
  tentMap: Record<string | number, string>;
  onSelect: (plant: any) => void;
}) {
  // Build groups
  const groups: { key: string; tentName: string; plants: any[] }[] = [];
  const seen = new Map<string, number>();
  for (const p of plants) {
    const key = p.currentTentId ? String(p.currentTentId) : '__sem__';
    const tentName = p.currentTentId ? (tentMap[p.currentTentId] ?? `Estufa ${p.currentTentId}`) : 'Sem estufa';
    if (!seen.has(key)) { seen.set(key, groups.length); groups.push({ key, tentName, plants: [] }); }
    groups[seen.get(key)!].plants.push(p);
  }

  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  // If only one tent, skip straight to plants
  const activeGroup = selectedGroup
    ? groups.find(g => g.key === selectedGroup) ?? null
    : groups.length === 1 ? groups[0] : null;

  // ── Step 2: plants list ──────────────────────────────────────────────────
  if (activeGroup) {
    return (
      <div>
        {groups.length > 1 && (
          <button
            onClick={() => setSelectedGroup(null)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-5 hover:text-foreground transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5 rotate-180" />
            Todas as estufas
          </button>
        )}
        {/* Tent title */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <TentIcon className="w-4.5 h-4.5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">{activeGroup.tentName}</p>
            <p className="text-xs text-muted-foreground">{activeGroup.plants.length} planta{activeGroup.plants.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="space-y-1">
          {activeGroup.plants.map((p: any) => {
            const letter = (p.name ?? '?')[0].toUpperCase();
            const grad = AVATAR_GRADIENTS[letter.charCodeAt(0) % AVATAR_GRADIENTS.length];
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-muted/60 active:scale-[0.98] transition-[color,background-color,border-color,transform] text-left"
              >
                <div className={`w-11 h-11 rounded-xl ${grad} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
                  {letter}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stageLabel(p.plantStage ?? '')}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/60 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Step 1: tent list ────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {groups.map(group => (
        <button
          key={group.key}
          onClick={() => setSelectedGroup(group.key)}
          className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl border border-border/50 hover:border-border hover:bg-muted/50 active:scale-[0.98] transition-[color,background-color,border-color,transform] text-left"
        >
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <TentIcon className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{group.tentName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{group.plants.length} planta{group.plants.length !== 1 ? 's' : ''}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground/60 shrink-0" />
        </button>
      ))}
    </div>
  );
}

export function BottomNav() {
  const [location, navigate] = useLocation();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const [trainingPickerOpen, setTrainingPickerOpen] = useState(false);
  const [chatPickerOpen, setChatPickerOpen] = useState(false);
  const [calcSheetOpen, setCalcSheetOpen] = useState(false);
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

  // Slots diretos: Estufas · Plantas · [FAB] · Alertas · Mais
  const navItems: NavItem[] = [
    { href: "/", icon: TentIcon, label: "Estufas" },
    { href: "/plants", icon: Leaf, label: "Plantas" },
  ];

  // Slot 4: calculadoras em sheet
  const isCalcActive = location.startsWith("/calculators");

  const CALC_ITEMS = [
    { id: "watering-runoff",     title: "Rega e Runoff",    desc: "Volume ideal + medição de runoff",  icon: Droplets,    color: "bg-teal-600" },
    { id: "irrigation-schedule", title: "Rega Automática",  desc: "Cronograma por bomba gotejadora",   icon: Timer,       color: "bg-blue-600" },
    { id: "nutrients",           title: "Fertilização",     desc: "Receitas por fase e semana",        icon: FlaskConical,color: "bg-emerald-600" },
    { id: "lux-ppfd",            title: "Lux → PPFD",       desc: "Converta leitura de luxímetro",     icon: Sun,         color: "bg-amber-600" },
    { id: "ppm-ec",              title: "PPM ↔ EC",          desc: "Converta condutividade elétrica",   icon: Calculator,  color: "bg-violet-600" },
    { id: "ph-adjust",           title: "pH",               desc: "Quanto ácido/base para ajustar",    icon: TestTube,    color: "bg-rose-600" },
    { id: "vpd",                 title: "VPD",              desc: "Zona ideal de temperatura e umidade",icon: Wind,        color: "bg-indigo-600" },
  ] as const;

  const moreMenuItems: NavItem[] = [
    { href: "/alerts", icon: Bell, label: "Alertas", badge: alertCount || 0 },
    { href: "/harvest-queue", icon: Wind, label: "Aguardando Secagem", badge: harvestQueueCount },
    { href: "/tarefas", icon: CheckSquare, label: "Tarefas" },
    { href: "/smartlife", icon: Wifi, label: "SmartLife" },
    { href: "/manage-strains", icon: Sprout, label: "Strains" },
    { href: "/help", icon: BookOpen, label: "Guia do Usuário" },
    { href: "/settings", icon: Settings, label: "Configurações" },
  ];

  const isMoreMenuActive = moreMenuItems.some(item => location === item.href);

  if (HIDDEN_NAV_ROUTES.includes(location) || location.endsWith("/display") || location.endsWith("/training")) return null;

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-[100] md:hidden transition-[opacity,transform] duration-200 ease-in-out ${
        keyboardOpen ? 'opacity-0 pointer-events-none translate-y-2' : 'opacity-100 pointer-events-auto translate-y-0'
      }`}
      style={{
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
        willChange: 'transform',
        WebkitBackfaceVisibility: 'hidden',
        backfaceVisibility: 'hidden',
        overflow: 'visible',
      }}
    >
      {/* Gradient fade acima da barra — dissolve a transição entre conteúdo e nav */}
      <div
        className="absolute left-0 right-0 h-8 pointer-events-none bg-gradient-to-b from-transparent to-card"
        style={{ top: '-32px' }}
      />

      {/* Curved SVG background — cobre apenas a área da barra (65px) */}
      {/* SVG não consegue resolver CSS vars confiável no iOS: usamos um rect bg-card por baixo */}
      <div className="absolute top-0 left-0 w-full bg-card pointer-events-none" style={{ height: '65px' }} />
      <svg
        className="absolute top-0 left-0 w-full pointer-events-none"
        style={{ height: '65px' }}
        viewBox="0 0 390 65"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Notch cutout: transparente no centro para o FAB "flutuar" acima */}
        <path
          d="M0,0 L148,0 C160,0 166,8 171,18 C177,30 184,38 195,38 C206,38 213,30 219,18 C224,8 230,0 242,0 L390,0 L390,65 L0,65 Z"
          className="fill-background"
        />
        {/* Fill da barra (card) — preenche a área da barra abaixo da curva */}
        <path
          d="M0,1 L148,1 C160,1 166,8 171,18 C177,30 184,38 195,38 C206,38 213,30 219,18 C224,8 230,1 242,1 L390,1 L390,65 L0,65 Z"
          className="fill-card"
        />
        {/* Border line following the curve */}
        <path
          d="M0,1 L148,1 C160,1 166,8 171,18 C177,30 184,38 195,38 C206,38 213,30 219,18 C224,8 230,1 242,1 L390,1"
          fill="none"
          className="stroke-border"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Background fill: do bottom do SVG (65px) até a borda inferior da tela
          Usa bg-card (classe Tailwind) pois CSS var em inline style não resolve no iOS Safari */}
      <div
        className="absolute left-0 right-0 bottom-0 bg-card pointer-events-none"
        style={{ top: '65px' }}
      />

      <div className="max-w-screen-xl mx-auto px-2">
        <div className="relative flex justify-around items-end pt-2" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
          {/* Nav items — Estufas, Plantas (antes do FAB) */}
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={triggerHapticFeedback}
                aria-label={item.label}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl transition-colors relative",
                  isActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                )}
              >
                <Icon className={cn("w-6 h-6", isActive && "stroke-[2.5]")} />
                <span className="text-[9px] font-mono uppercase tracking-widest leading-none opacity-70">
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* FAB — Mini menu Force Touch style — CENTER */}
          <div ref={fabRef} className="relative flex flex-col items-center justify-center -mt-10" data-tour="quick-log-menu">
            {/* Popup menu — aparece acima do FAB, ancorado na viewport para não sair da tela */}
            {fabMenuOpen && (
              <div className="fixed left-1/2 -translate-x-1/2 w-[85vw] max-w-sm rounded-2xl border border-border/60 bg-card/98 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150 z-[200]" style={{ bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}>
                {/* Seta apontando para o FAB (centro) */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[7px] border-r-[7px] border-t-[7px] border-l-transparent border-r-transparent border-t-border/60" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[5px] w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-card/95" />

                <Link
                  href="/quick-log?mode=status"
                  onClick={() => { triggerHapticFeedback(); setFabMenuOpen(false); }}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-teal-500/8 active:bg-teal-500/15 transition-colors border-b border-border/30 w-full"
                >
                  <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center shrink-0 shadow-sm">
                    <ThermometerSun className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-foreground leading-tight">Status da Estufa</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">Temp, RH, pH, EC, luz</p>
                  </div>
                </Link>

                <Link
                  href="/quick-log?mode=plant"
                  onClick={() => { triggerHapticFeedback(); setFabMenuOpen(false); }}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-rose-500/8 active:bg-rose-500/15 transition-colors border-b border-border/30 w-full"
                >
                  <div className="w-10 h-10 rounded-xl bg-rose-600 flex items-center justify-center shrink-0 shadow-sm">
                    <Heart className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-foreground leading-tight">Saúde de Planta</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">Status, sintomas, foto</p>
                  </div>
                </Link>

                <Link
                  href="/quick-log?mode=trichome"
                  onClick={() => { triggerHapticFeedback(); setFabMenuOpen(false); }}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-violet-500/8 active:bg-violet-500/15 transition-colors border-b border-border/30 w-full"
                >
                  <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shrink-0 shadow-sm">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-foreground leading-tight">Tricomas</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">Maturação · Flora</p>
                  </div>
                </Link>

                {/* Treinamento — abre picker de planta */}
                <button
                  onClick={() => { triggerHapticFeedback(); setFabMenuOpen(false); setTrainingPickerOpen(true); }}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-muted/40 active:bg-muted/60 transition-colors border-b border-border/30 w-full text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-sm">
                    <Scissors className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-foreground leading-tight">Treinamento</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">LST, topping, super crop</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                </button>

                {/* Doctor Jáh — abre picker de planta */}
                <button
                  onClick={() => { triggerHapticFeedback(); setFabMenuOpen(false); setChatPickerOpen(true); }}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-blue-500/8 active:bg-blue-500/15 transition-colors w-full text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-sm">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-foreground leading-tight">Doctor Jáh</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">Diagnóstico · LST · Tricomas</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
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
                  <EmptyState
                    variant="compact"
                    icon={Leaf}
                    title="Nenhuma planta ativa"
                    description="Crie uma planta numa estufa pra usar técnicas de treinamento."
                    action={{
                      label: "Adicionar planta",
                      href: "/plants/new",
                      onClick: () => { setTrainingPickerOpen(false); },
                    }}
                  />
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pb-2">
                    {activePlants.map((plant: any) => (
                      <div
                        key={plant.id}
                        className="flex items-center gap-2 p-3 rounded-xl border border-border/40 hover:border-border hover:bg-muted/40 transition-colors"
                      >
                        <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-bold text-muted-foreground">
                          {(plant.name ?? '?')[0].toUpperCase()}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold leading-tight truncate">{plant.name ?? `Planta ${plant.id}`}</p>
                          {plant.strain && (
                            <p className="text-xs text-muted-foreground truncate">{plant.strain}</p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            triggerHapticFeedback();
                            setTrainingPickerOpen(false);
                            navigate(`/plants/${plant.id}/training?sandbox=1&view=top`);
                          }}
                          className="px-2.5 h-7 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 active:scale-95 transition-[background-color,transform] shrink-0"
                          title="Editar em 2D (vista de cima)"
                        >
                          2D
                        </button>
                        <button
                          onClick={() => {
                            triggerHapticFeedback();
                            setTrainingPickerOpen(false);
                            navigate(`/plants/${plant.id}/training?sandbox=1&view=3d`);
                          }}
                          className="px-2.5 h-7 rounded-lg text-xs font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-500/25 active:scale-95 transition-[background-color,transform] shrink-0"
                          title="Editar em 3D"
                        >
                          3D
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </SheetContent>
            </Sheet>

            {/* ── Sheet: picker de planta para IA chat ── */}
            <Sheet open={chatPickerOpen} onOpenChange={setChatPickerOpen}>
              <SheetContent side="bottom" className="rounded-t-2xl flex flex-col px-5 pt-6" style={{ maxHeight: '75vh', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
                {/* Header */}
                <div className="shrink-0 mb-5">
                  <div className="flex items-center gap-2.5 mb-1">
                    <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <p className="font-bold text-base">Conversar sobre qual planta?</p>
                  </div>
                  <p className="text-xs text-muted-foreground ml-[42px]">A IA recebe fase, ambiente e saúde automaticamente</p>
                </div>

                {activePlants.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <EmptyState
                      variant="compact"
                      icon={Bot}
                      title="Nenhuma planta pra conversar"
                      description="Crie uma planta primeiro pra a IA ter contexto sobre fase, ambiente e saúde."
                      action={{
                        label: "Adicionar planta",
                        href: "/plants/new",
                        onClick: () => { setChatPickerOpen(false); },
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto -mx-1 px-1">
                    <ChatPlantPicker
                      plants={activePlants}
                      tentMap={tentMap}
                      onSelect={(plant) => {
                        triggerHapticFeedback();
                        setChatPickerOpen(false);
                        navigate(`/chat/${plant.id}`);
                      }}
                    />
                  </div>
                )}
              </SheetContent>
            </Sheet>

            <button
              onClick={() => { triggerHapticFeedback(); setFabMenuOpen(v => !v); }}
              aria-label="Registrar log diário"
              className={cn(
                "w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-xl shadow-primary/30 transition-all duration-200",
                fabMenuOpen ? "scale-90 opacity-75" : "active:scale-95"
              )}
            >
              <PenLine className="w-5 h-5 text-white stroke-[2.5]" />
            </button>
          </div>

          {/* Calculadoras — slot 4: abre sheet com lista de calcs */}
          <Sheet open={calcSheetOpen} onOpenChange={setCalcSheetOpen}>
            <SheetTrigger asChild>
              <button
                onClick={triggerHapticFeedback}
                aria-label="Calculadoras"
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl transition-colors relative",
                  isCalcActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                )}
              >
                <Calculator className={cn("w-6 h-6", isCalcActive && "stroke-[2.5]")} />
                <span className="text-[9px] font-mono uppercase tracking-widest leading-none opacity-70">Calc</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
              <SheetHeader className="pb-2">
                <SheetTitle className="text-base flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-primary" />
                  Calculadoras
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-1 pb-4">
                {CALC_ITEMS.map((calc) => {
                  const Icon = calc.icon;
                  return (
                    <Link
                      key={calc.id}
                      href={`/calculators/${calc.id}`}
                      onClick={() => { triggerHapticFeedback(); setCalcSheetOpen(false); }}
                      className="flex items-center gap-4 px-3 py-3 rounded-xl hover:bg-primary/8 active:bg-primary/15 transition-colors"
                    >
                      <div className={`w-10 h-10 rounded-xl ${calc.color} flex items-center justify-center shrink-0 shadow-sm`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-tight">{calc.title}</p>
                        <p className="text-xs text-muted-foreground/60 mt-0.5">{calc.desc}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>

          {/* More Menu */}
          <Sheet open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
            <SheetTrigger asChild>
              <button
                onClick={triggerHapticFeedback}
                aria-label="Mais opções"
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl transition-colors relative",
                  "hover:bg-primary/10",
                  isMoreMenuActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-primary"
                )}
              >
                <MoreHorizontal className={cn("w-6 h-6", isMoreMenuActive && "stroke-[2.5]")} />
                <span className="text-[9px] font-mono uppercase tracking-widest leading-none opacity-70">Mais</span>
                {/* Badge: alertas + secagem */}
                {((alertCount || 0) + (harvestQueueCount ?? 0)) > 0 && (
                  <span
                    className={cn(
                      "absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-sm",
                      (alertCount || 0) > 0 && badgeShaking ? "animate-badge-shake" : "animate-pulse",
                    )}
                  >
                    {((alertCount || 0) + (harvestQueueCount ?? 0)) > 9 ? "9+" : (alertCount || 0) + (harvestQueueCount ?? 0)}
                  </span>
                )}
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
                      data-tour={
                        item.href === "/history" ? "history-menu" :
                        item.href === "/alerts" ? "alerts-menu" :
                        undefined
                      }
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
