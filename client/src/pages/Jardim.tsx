import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, Sprout, Droplet, Thermometer, Camera, Smile, Meh, Frown } from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { LivingPlant, type PlantStage, type PlantMood } from "@/components/LivingPlant";
import { EmptyState } from "@/components/EmptyState";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { haptics } from "@/lib/haptics";
import { hasPendingGardenCare, clearGardenCare } from "@/lib/gardenCare";
import { readLastStage, writeLastStage } from "@/lib/gardenStage";
import { readLastMood, writeLastMood } from "@/lib/gardenMood";

// Folhas que caem na celebração (posições/emojis fixos por índice).
const CELEBRATE_LEAVES = ["🌿", "💚", "✨", "🍃", "🌱", "💚", "✨", "🌿", "🍃", "🌱", "✨", "💚"];
// Estrelas que sobem no level-up de estágio.
const LEVELUP_STARS = ["⭐", "✨", "🌟", "✨", "⭐", "🌟", "✨", "⭐"];

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

  // Reação ao toque na planta: wiggle + partículas + balão de fala.
  const [reacting, setReacting] = useState(false);
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

  const petPlant = () => {
    haptics.light().catch(() => {});
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setReacting(true);
    setBurst((b) => b + 1);
    const phrases = PET_PHRASES[mood];
    setPhrase(phrases[burst % phrases.length]);
    timers.current.push(setTimeout(() => setReacting(false), 650));
    timers.current.push(setTimeout(() => setPhrase(null), 1500));
  };

  // Cuidar: microreação no card (gota/brisa/flash) + planta reage, então vai pro registro.
  const [action, setAction] = useState<CareAction | null>(null);
  const handleCare = (a: CareAction, href: string) => {
    haptics.light().catch(() => {});
    setAction(a);
    setReacting(true);
    timers.current.push(setTimeout(() => navigate(href), 600));
  };

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
            {/* Planta viva */}
            <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card p-5 text-center">
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
              <button
                type="button"
                onClick={petPlant}
                aria-label="Fazer carinho na planta"
                className="relative mx-auto block rounded-2xl focus-visible:outline-none active:scale-[0.98] transition-transform"
                style={{ background: "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(91,191,58,0.14), transparent 70%)" }}
              >
                {/* Balão de fala */}
                {phrase && (
                  <span
                    key={`bubble-${burst}`}
                    className="jardim-bubble absolute left-1/2 -top-1 -translate-x-1/2 z-10 whitespace-nowrap rounded-full bg-foreground text-background text-xs font-semibold px-3 py-1 shadow-lg"
                  >
                    {phrase}
                  </span>
                )}
                {/* Partículas que sobem */}
                {burst > 0 && (
                  <span key={`burst-${burst}`} className="pointer-events-none absolute inset-0 z-10">
                    {PET_PARTICLES[mood].map((p, i) => (
                      <span
                        key={i}
                        className="jardim-particle absolute text-base"
                        style={{
                          left: `${30 + i * 9}%`,
                          bottom: "38%",
                          animationDelay: `${i * 55}ms`,
                        }}
                      >
                        {p}
                      </span>
                    ))}
                  </span>
                )}
                <LivingPlant stage={data.stage as PlantStage} mood={data.mood as PlantMood} size={150} reacting={reacting} celebrating={celebrating || !!levelUp} fromMood={fromMood} />
              </button>
              <p className="text-lg font-bold text-foreground mt-1">{data.tentName}</p>
              <p className="text-xs text-muted-foreground">
                {data.weekNum > 0 ? `Semana ${data.weekNum} · ` : ""}{data.stageName}
              </p>
              {(() => {
                const MoodIcon = MOOD_ICON[data.mood as PlantMood];
                return (
                  <span className={cn("inline-flex items-center gap-1.5 mt-2 text-sm font-medium px-3 py-1 rounded-full bg-muted/40", MOOD_TONE[data.mood as PlantMood])}>
                    <MoodIcon className="w-4 h-4" />
                    {data.moodLabel}
                  </span>
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

            {/* Jornada de crescimento */}
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Jornada</p>
              <div className="flex items-center justify-between">
                {STAGES.map((name, i) => {
                  const stageNum = i + 1;
                  const done = stageNum < data.stage;
                  const current = stageNum === data.stage;
                  return (
                    <div key={name} className="flex flex-col items-center gap-1 flex-1">
                      <div className={cn("w-2.5 h-2.5 rounded-full", current ? "bg-primary ring-2 ring-primary/30" : done ? "bg-primary/60" : "bg-muted")} />
                      <span className={cn("text-[8.5px] text-center leading-tight", current ? "text-primary font-medium" : "text-muted-foreground")}>{name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </PageLayout>
  );
}
