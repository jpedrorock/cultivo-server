import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, Sprout, Droplet, Thermometer, Camera, Smile, Meh, Frown, Flower2, ArrowRight, Bot } from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { LivingPlant, type PlantStage, type PlantMood, type PlantHealth, type PlantEnv } from "@/components/LivingPlant";
import { EmptyState } from "@/components/EmptyState";
import { StartFloraModal } from "@/components/StartFloraModal";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { haptics } from "@/lib/haptics";
import { scheduleLocalNotification, cancelLocalNotifications } from "@/lib/localNotifications";
import { hasPendingGardenCare, clearGardenCare } from "@/lib/gardenCare";
import { readLastStage, writeLastStage } from "@/lib/gardenStage";
import { readLastMood, writeLastMood } from "@/lib/gardenMood";

// Folhas que caem na celebração (posições/emojis fixos por índice).
const CELEBRATE_LEAVES = ["🌿", "💚", "✨", "🍃", "🌱", "💚", "✨", "🌿", "🍃", "🌱", "✨", "💚"];
// Estrelas que sobem no level-up de estágio.
const LEVELUP_STARS = ["⭐", "✨", "🌟", "✨", "⭐", "🌟", "✨", "⭐"];

// Pólen/luz do cenário vivo (posições/tamanhos/ritmos fixos por índice).
const MOTES = [
  { left: 12, size: 5, dur: 9, delay: 0, c: "#cfe9b0" },
  { left: 26, size: 3, dur: 7, delay: 1.6, c: "#ffe6a8" },
  { left: 40, size: 4, dur: 11, delay: 3.2, c: "#cfe9b0" },
  { left: 55, size: 3, dur: 8, delay: 0.8, c: "#ffe6a8" },
  { left: 68, size: 5, dur: 10, delay: 2.4, c: "#cfe9b0" },
  { left: 82, size: 3, dur: 6.5, delay: 4, c: "#ffe6a8" },
  { left: 90, size: 4, dur: 9.5, delay: 1.2, c: "#cfe9b0" },
];

// Ações de cuidar: cada uma com sua microreação + destino no quick-log.
type CareAction = "water" | "env" | "photo";
const CARE_ACTIONS: { Icon: typeof Droplet; label: string; action: CareAction; href: string }[] = [
  { Icon: Droplet, label: "Regar", action: "water", href: "/quick-log?mode=status" },
  { Icon: Thermometer, label: "Ambiente", action: "env", href: "/quick-log?mode=status" },
  { Icon: Camera, label: "Foto", action: "photo", href: "/quick-log?mode=plant" },
];

// Falas da planta ao ser tocada (por humor).
const PET_PHRASES: Record<PlantMood, string[]> = {
  happy: ["Tô feliz! 🌿", "Obrigada por cuidar 💚", "Crescendo forte!"],
  thirsty: ["Tô com sede… 💧", "Bora registrar?", "Me dá um carinho 🌱"],
  sad: ["Senti sua falta 🥺", "Volta sempre 🌱", "Vamos retomar?"],
};
// Partículas que sobem ao tocar (por humor).
const PET_PARTICLES: Record<PlantMood, string[]> = {
  happy: ["💚", "✨", "🌿", "💚", "✨", "🌱"],
  thirsty: ["💧", "🌱", "💧", "🌿", "💧", "✨"],
  sad: ["🌱", "💚", "🌿", "🌱", "✨", "💚"],
};

const MOOD_ICON: Record<PlantMood, typeof Smile> = {
  happy: Smile,
  thirsty: Meh,
  sad: Frown,
};
const MOOD_TONE: Record<PlantMood, string> = {
  happy: "text-green-500",
  thirsty: "text-amber-500",
  sad: "text-muted-foreground",
};
const STAGES = ["Semente", "Muda", "Vegetativo", "Floração", "Maturação", "Colheita"];

export default function Jardim() {
  const { data, isLoading, refetch } = trpc.garden.getState.useQuery();
  const [, navigate] = useLocation();

  // Carrossel de plantas.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setActiveIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };

  // Reação ao toque na planta: wiggle + partículas + balão de fala (na planta tocada).
  const [reactingIdx, setReactingIdx] = useState<number | null>(null);
  const [burst, setBurst] = useState(0);
  const [phrase, setPhrase] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Celebração ao voltar de um registro (cuidar = recompensa).
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    if (!hasPendingGardenCare()) return;
    refetch(); // mood deve refletir o registro fresco
    haptics.success().catch(() => {});
    setCelebrating(true);
    // Só limpa a flag ao FIM da celebração — sobrevive ao double-mount do StrictMode.
    const t = setTimeout(() => {
      setCelebrating(false);
      clearGardenCare();
    }, 2400);
    return () => clearTimeout(t);
  }, [refetch]);

  // Limpa timers do toque ao desmontar.
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Level-up: detecta subida de estágio (semente→muda→…) e celebra.
  const [levelUp, setLevelUp] = useState<string | null>(null);
  useEffect(() => {
    if (!data || !("hasGarden" in data) || !data.hasGarden) return;
    const prev = readLastStage(data.tentId);
    if (prev != null && data.stage > prev) {
      // Subiu! Não persiste agora — só ao fim (sobrevive ao double-mount do StrictMode).
      setLevelUp(data.stageName);
      haptics.success().catch(() => {});
      const t = setTimeout(() => {
        setLevelUp(null);
        writeLastStage(data.tentId, data.stage);
      }, 3200);
      return () => clearTimeout(t);
    }
    // Primeira vez ou sem subida: só sincroniza o marcador.
    writeLastStage(data.tentId, data.stage);
  }, [data]);

  // Transição de humor: se o humor mudou desde a última visita, a planta anima do antigo pro novo.
  const [fromMood, setFromMood] = useState<PlantMood | undefined>(undefined);
  useEffect(() => {
    if (!data || !("hasGarden" in data) || !data.hasGarden) return;
    const prev = readLastMood(data.tentId) as PlantMood | null;
    if (prev && prev !== data.mood) {
      setFromMood(prev);
      // Persiste o novo humor só ao FIM da transição (sobrevive ao double-mount do StrictMode).
      const t = setTimeout(() => {
        writeLastMood(data.tentId, data.mood);
        setFromMood(undefined);
      }, 1100);
      return () => clearTimeout(t);
    }
    writeLastMood(data.tentId, data.mood);
    setFromMood(undefined);
  }, [data]);

  const mood = (data && "hasGarden" in data && data.hasGarden ? data.mood : "happy") as PlantMood;

  // Viço: cai com o tempo sem registro (dia 0-1 = 1.0 → dia 4+ = 0, congelada/P&B).
  const daysSinceLog = data && "hasGarden" in data && data.hasGarden ? data.daysSinceLog : 0;
  const vitality = Math.max(0, Math.min(1, 1 - (daysSinceLog - 1) / 3));

  const petPlant = (idx: number) => {
    haptics.light().catch(() => {});
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setReactingIdx(idx);
    setBurst((b) => b + 1);
    const phrases = PET_PHRASES[mood];
    setPhrase(phrases[burst % phrases.length]);
    timers.current.push(setTimeout(() => setReactingIdx(null), 650));
    timers.current.push(setTimeout(() => setPhrase(null), 1500));
  };

  // Cuidar: microreação no card (gota/brisa/flash) + planta reage, então vai pro registro.
  const [action, setAction] = useState<CareAction | null>(null);
  const handleCare = (a: CareAction, href: string) => {
    haptics.light().catch(() => {});
    setAction(a);
    setReactingIdx(activeIdx);
    timers.current.push(setTimeout(() => navigate(href), 600));
  };

  // Passagem veg→flora: modal de floração + push "tá na hora do flip".
  const [floraModalOpen, setFloraModalOpen] = useState(false);
  const hasG = data && "hasGarden" in data && data.hasGarden;
  const flipDueTs = hasG ? data.flipDueTs : null;
  const flipTentId = hasG ? data.tentId : null;
  useEffect(() => {
    if (!flipTentId || !flipDueTs) return;
    const id = 810000 + flipTentId; // estável por estufa → reagenda sem duplicar
    if (flipDueTs > Date.now()) {
      scheduleLocalNotification({
        id,
        title: "Hora do flip? 🌸",
        body: "Tua planta tá pronta pra floração — mude o fotoperíodo pra 12/12.",
        at: new Date(flipDueTs),
        extra: { type: "flip", tentId: flipTentId },
      }).catch(() => {});
    } else {
      cancelLocalNotifications([id]).catch(() => {});
    }
  }, [flipDueTs, flipTentId]);

  return (
    <PageLayout
      header={
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Sprout className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-foreground">Meu Jardim</h1>
              <p className="text-xs text-muted-foreground">Cuide da sua planta — ela cresce de verdade</p>
            </div>
          </div>
        </div>
      }
    >
      <main className="container mx-auto px-3 py-4 md:px-4 md:py-6 max-w-md">
        {isLoading || !data ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando…
          </div>
        ) : !data.hasGarden ? (
          <EmptyState
            icon={Sprout}
            title="Seu jardim ainda está vazio"
            description="Crie uma estufa e inicie um ciclo de cultivo — sua plantinha vai aparecer aqui e crescer conforme você cuida dela."
          />
        ) : (
          <div className="space-y-4">
            {/* Passagem: hora do flip pra floração */}
            {data.readyToFlip && data.cycleId && (
              <button
                type="button"
                onClick={() => setFloraModalOpen(true)}
                className="w-full text-left rounded-2xl border-2 border-fuchsia-500/40 bg-fuchsia-500/10 p-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
              >
                <div className="w-10 h-10 rounded-xl bg-fuchsia-500/20 flex items-center justify-center shrink-0">
                  <Flower2 className="w-5 h-5 text-fuchsia-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">Hora do flip pra floração? 🌸</p>
                  <p className="text-xs text-muted-foreground">Tua planta está pronta — fotoperíodo vai pra 12/12</p>
                </div>
                <ArrowRight className="w-5 h-5 text-fuchsia-400 shrink-0" />
              </button>
            )}

            {/* Planta viva */}
            <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card p-5 text-center">
              {/* Cenário vivo — pólen/luz flutuando ao fundo */}
              <span className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
                {MOTES.map((m, i) => (
                  <span
                    key={i}
                    className="jardim-mote absolute rounded-full"
                    style={{
                      left: `${m.left}%`,
                      bottom: "10%",
                      width: m.size,
                      height: m.size,
                      background: m.c,
                      filter: "blur(0.5px)",
                      animationDuration: `${m.dur}s`,
                      animationDelay: `${m.delay}s`,
                    }}
                  />
                ))}
              </span>
              {/* Celebração ao voltar de um registro */}
              {celebrating && (
                <>
                  <span className="pointer-events-none absolute inset-0 z-20">
                    {CELEBRATE_LEAVES.map((leaf, i) => (
                      <span
                        key={i}
                        className="jardim-falling absolute text-lg"
                        style={{ left: `${5 + i * 8}%`, top: "-6%", animationDelay: `${i * 110}ms` }}
                      >
                        {leaf}
                      </span>
                    ))}
                  </span>
                  <span className="jardim-bubble absolute left-1/2 top-2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 shadow-lg">
                    Verdinha agradeceu o cuidado! 💚
                  </span>
                </>
              )}
              {/* Level-up de estágio */}
              {levelUp && (
                <>
                  <span
                    className="jardim-glow pointer-events-none absolute left-1/2 top-[42%] z-0 h-44 w-44 rounded-full"
                    style={{ background: "radial-gradient(circle, rgba(255,207,106,0.55), transparent 70%)" }}
                  />
                  <span className="pointer-events-none absolute inset-0 z-20">
                    {LEVELUP_STARS.map((s, i) => (
                      <span
                        key={i}
                        className="jardim-particle absolute text-lg"
                        style={{ left: `${18 + i * 9}%`, bottom: "40%", animationDelay: `${i * 70}ms` }}
                      >
                        {s}
                      </span>
                    ))}
                  </span>
                  <span className="jardim-bubble absolute left-1/2 top-2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-400 text-amber-950 text-sm font-extrabold px-4 py-1.5 shadow-lg">
                    🎉 Novo estágio: {levelUp}!
                  </span>
                </>
              )}
              {/* Microreação de cuidar */}
              {action === "photo" && (
                <span className="jardim-flash pointer-events-none absolute inset-0 z-40 rounded-2xl bg-white" />
              )}
              {action === "water" && (
                <span className="pointer-events-none absolute inset-0 z-30">
                  {["💧", "💧", "💧"].map((d, i) => (
                    <span key={i} className="jardim-drop absolute text-lg" style={{ left: `${42 + i * 8}%`, top: "16%", animationDelay: `${i * 90}ms` }}>
                      {d}
                    </span>
                  ))}
                </span>
              )}
              {action === "env" && (
                <span className="pointer-events-none absolute inset-0 z-30">
                  {["🍃", "🌬️", "🍃"].map((d, i) => (
                    <span key={i} className="jardim-breeze absolute text-base" style={{ left: "6%", top: `${30 + i * 14}%`, animationDelay: `${i * 100}ms` }}>
                      {d}
                    </span>
                  ))}
                </span>
              )}
              {/* Carrossel das plantas (≤3). Compartilham ciclo → mesmo estágio; muda nome/strain. */}
              {(() => {
                const slides = data.plants.length > 0 ? data.plants : [{ id: 0, name: data.tentName, strain: null as string | null, health: null as PlantHealth | null }];
                return (
                  <>
                    <div ref={scrollRef} onScroll={onScroll} className="no-scrollbar relative z-10 flex snap-x snap-mandatory overflow-x-auto">
                      {slides.map((p, idx) => (
                        <div key={p.id} className="flex w-full shrink-0 snap-center flex-col items-center">
                          <button
                            type="button"
                            onClick={() => petPlant(idx)}
                            aria-label="Fazer carinho na planta"
                            className="relative mx-auto block rounded-2xl focus-visible:outline-none active:scale-[0.98] transition-transform"
                            style={{ background: "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(91,191,58,0.14), transparent 70%)" }}
                          >
                            {reactingIdx === idx && phrase && (
                              <span
                                key={`bubble-${burst}`}
                                className="jardim-bubble absolute left-1/2 -top-1 -translate-x-1/2 z-10 whitespace-nowrap rounded-full bg-foreground text-background text-xs font-semibold px-3 py-1 shadow-lg"
                              >
                                {phrase}
                              </span>
                            )}
                            {reactingIdx === idx && burst > 0 && (
                              <span key={`burst-${burst}`} className="pointer-events-none absolute inset-0 z-10">
                                {PET_PARTICLES[mood].map((pp, i) => (
                                  <span
                                    key={i}
                                    className="jardim-particle absolute text-base"
                                    style={{ left: `${30 + i * 9}%`, bottom: "38%", animationDelay: `${i * 55}ms` }}
                                  >
                                    {pp}
                                  </span>
                                ))}
                              </span>
                            )}
                            <LivingPlant stage={data.stage as PlantStage} mood={data.mood as PlantMood} size={150} reacting={reactingIdx === idx} celebrating={celebrating || !!levelUp} fromMood={fromMood} vitality={vitality} health={p.health} env={data.env.state as PlantEnv} />
                          </button>
                          <p className="text-lg font-bold text-foreground mt-1">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.strain ? `${p.strain} · ` : ""}{data.weekNum > 0 ? `Semana ${data.weekNum} · ` : ""}{data.stageName}
                          </p>
                        </div>
                      ))}
                    </div>
                    {/* Humor + clima (compartilhados pela estufa) */}
                    <div className="flex items-center justify-center flex-wrap gap-1.5 mt-2">
                      {(() => {
                        const MoodIcon = MOOD_ICON[mood];
                        return (
                          <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full bg-muted/40", MOOD_TONE[mood])}>
                            <MoodIcon className="w-4 h-4" />
                            {data.moodLabel}
                          </span>
                        );
                      })()}
                      {data.env.state === "hot" && (
                        <span className="inline-flex items-center gap-1 text-sm font-medium px-3 py-1 rounded-full bg-amber-500/15 text-amber-500">🥵 Calor</span>
                      )}
                      {data.env.state === "cold" && (
                        <span className="inline-flex items-center gap-1 text-sm font-medium px-3 py-1 rounded-full bg-blue-500/15 text-blue-400">🥶 Frio</span>
                      )}
                    </div>
                    {/* Voz do Cultivisor — aparece quando ela começa a desbotar */}
                    {daysSinceLog >= 2 && (
                      <div className={cn(
                        "mt-3 mx-auto max-w-[280px] flex items-center gap-2 rounded-xl border px-3 py-2 text-left",
                        daysSinceLog >= 4 ? "border-amber-500/30 bg-amber-500/10" : "border-border/50 bg-muted/20",
                      )}>
                        <Bot className={cn("w-4 h-4 shrink-0", daysSinceLog >= 4 ? "text-amber-400" : "text-blue-400")} />
                        <p className="text-xs text-muted-foreground leading-snug">
                          {daysSinceLog >= 4
                            ? `Faz ${daysSinceLog} dias… ela ficou em preto e branco aqui na minha memória. Me conta como ela está? 🌫️`
                            : `Faz ${daysSinceLog} dias que você não registra — como ela tá?`}
                        </p>
                      </div>
                    )}
                    {/* Bolinhas do carrossel */}
                    {slides.length > 1 && (
                      <div className="flex justify-center gap-1.5 mt-3">
                        {slides.map((_, i) => (
                          <span key={i} className={cn("h-1.5 rounded-full transition-all", i === activeIdx ? "w-4 bg-primary" : "w-1.5 bg-muted")} />
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Cuidar = registrar */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">Cuidar da planta</p>
              <div className="grid grid-cols-3 gap-3">
                {CARE_ACTIONS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => handleCare(c.action, c.href)}
                    disabled={action !== null}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border border-border/50 bg-card hover:bg-muted/30 active:scale-[0.97] transition-[background-color,transform] py-4 disabled:opacity-60",
                      c.action === "water" && mood !== "happy" && action === null && "jardim-attention",
                    )}
                  >
                    <c.Icon className={cn("w-6 h-6 text-primary", action === c.action && "plant-reacting")} />
                    <span className="text-xs font-medium text-foreground">{c.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-center text-muted-foreground mt-2">
                Cuidar dela é registrar — cada registro deixa sua planta mais feliz. 🌿
              </p>
            </div>

            {/* Jornada — corrida pelos estágios */}
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Jornada</p>
                <span className="text-[11px] font-semibold text-primary">{data.stage}/{STAGES.length} · {data.stageName}</span>
              </div>
              {(() => {
                const pct = ((data.stage - 1) / (STAGES.length - 1)) * 100;
                return (
                  <>
                    {/* pista */}
                    <div className="relative h-2 rounded-full bg-muted mt-8 mb-2.5">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-700 ease-out"
                        style={{ width: `${pct}%` }}
                      />
                      {/* marcadores de cada estágio */}
                      {STAGES.map((_, i) => (
                        <span
                          key={i}
                          className={cn(
                            "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full",
                            i + 1 <= data.stage ? "bg-background/70" : "bg-foreground/20",
                          )}
                          style={{ left: `${(i / (STAGES.length - 1)) * 100}%` }}
                        />
                      ))}
                      {/* corredor — a plantinha avançando */}
                      <div
                        className="absolute -top-[26px] -translate-x-1/2 transition-[left] duration-700 ease-out text-lg leading-none"
                        style={{ left: `${pct}%` }}
                      >
                        🌱
                      </div>
                      {/* linha de chegada */}
                      <span className="absolute -top-1 right-0 translate-x-1/2 text-sm leading-none">🏁</span>
                    </div>
                    {/* rótulos */}
                    <div className="flex">
                      {STAGES.map((name, i) => (
                        <span
                          key={name}
                          className={cn(
                            "flex-1 text-[8.5px] text-center leading-tight",
                            i + 1 === data.stage ? "text-primary font-semibold" : "text-muted-foreground",
                          )}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>

            {data.cycleId && (
              <StartFloraModal
                open={floraModalOpen}
                onClose={() => {
                  setFloraModalOpen(false);
                  refetch();
                }}
                cycleId={data.cycleId}
                cycleName={data.tentName}
              />
            )}
          </div>
        )}
      </main>
    </PageLayout>
  );
}
