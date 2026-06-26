import { Link } from "wouter";
import { Loader2, Sprout, Droplet, Thermometer, Camera, Smile, Meh, Frown } from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { LivingPlant, type PlantStage, type PlantMood } from "@/components/LivingPlant";
import { EmptyState } from "@/components/EmptyState";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

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
  const { data, isLoading } = trpc.garden.getState.useQuery();

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
            <div className="rounded-2xl border border-border/50 bg-card p-5 text-center">
              <div
                className="mx-auto inline-block rounded-2xl"
                style={{ background: "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(91,191,58,0.14), transparent 70%)" }}
              >
                <LivingPlant stage={data.stage as PlantStage} mood={data.mood as PlantMood} size={150} />
              </div>
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
                {[
                  { Icon: Droplet, label: "Regar" },
                  { Icon: Thermometer, label: "Ambiente" },
                  { Icon: Camera, label: "Foto" },
                ].map((c) => (
                  <Link key={c.label} href="/quick-log">
                    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors py-4 cursor-pointer">
                      <c.Icon className="w-6 h-6 text-primary" />
                      <span className="text-xs font-medium text-foreground">{c.label}</span>
                    </div>
                  </Link>
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
