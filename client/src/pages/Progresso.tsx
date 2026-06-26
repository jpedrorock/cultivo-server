import { Flame, Camera, Sprout, Leaf, Eye, Scissors, Lock, Trophy, Loader2 } from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

// Ícone + cor por badge (classes estáticas — Tailwind purga interpolação).
const BADGE_META: Record<string, { Icon: typeof Flame; cls: string }> = {
  "first-log": { Icon: Sprout, cls: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400" },
  "first-plant": { Icon: Leaf, cls: "bg-green-500/15 text-green-600 dark:text-green-400" },
  "streak-7": { Icon: Flame, cls: "bg-amber-500/15 text-amber-500 dark:text-amber-400" },
  "streak-30": { Icon: Flame, cls: "bg-orange-500/15 text-orange-500 dark:text-orange-400" },
  "streak-100": { Icon: Flame, cls: "bg-red-500/15 text-red-500 dark:text-red-400" },
  photographer: { Icon: Camera, cls: "bg-blue-500/15 text-blue-500 dark:text-blue-400" },
  observer: { Icon: Eye, cls: "bg-violet-500/15 text-violet-500 dark:text-violet-400" },
  "first-harvest": { Icon: Scissors, cls: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400" },
};

export default function Progresso() {
  const { data, isLoading } = trpc.gamification.getProgress.useQuery();

  return (
    <PageLayout
      header={
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-foreground">Progresso</h1>
              <p className="text-xs text-muted-foreground">Sua ofensiva, conquistas e Grow Score</p>
            </div>
          </div>
        </div>
      }
    >
      <main className="container mx-auto px-3 py-4 md:px-4 md:py-6 max-w-xl">
        {isLoading || !data ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Ofensiva */}
            <div className="rounded-2xl border border-border/50 bg-card p-6 text-center">
              <Flame className={cn("w-9 h-9 mx-auto", data.streak.current > 0 ? "text-amber-500" : "text-muted-foreground/40")} />
              <p className="text-3xl font-bold text-foreground mt-1 leading-none">{data.streak.current} dia{data.streak.current === 1 ? "" : "s"}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {data.streak.current === 0
                  ? "Registre hoje pra começar sua ofensiva"
                  : data.streak.todayDone
                    ? "Ofensiva em dia — mandou bem! 🌿"
                    : "Registre hoje pra não quebrar a ofensiva"}
              </p>
              {data.streak.longest > 0 && (
                <p className="text-xs text-muted-foreground/70 mt-2">Recorde: {data.streak.longest} dias</p>
              )}
            </div>

            {/* Grow Score + Nível */}
            <div className="rounded-2xl border border-border/50 bg-card p-5">
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Grow Score</p>
                  <p className="text-2xl font-bold text-foreground tabular-nums">{data.growScore.toLocaleString("pt-BR")}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nível {data.level.num}</p>
                  <p className="text-lg font-bold text-primary">{data.level.name}</p>
                </div>
              </div>
              {data.level.nextAt != null ? (
                <>
                  <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${data.level.progressPct}%` }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 text-right">
                    {(data.level.nextAt - data.growScore).toLocaleString("pt-BR")} pts pra {data.level.nextName}
                  </p>
                </>
              ) : (
                <p className="text-xs text-primary font-medium">Nível máximo alcançado 🏆</p>
              )}
            </div>

            {/* Conquistas */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">
                Conquistas · {data.badgesUnlocked} de {data.badgesTotal}
              </p>
              <div className="grid grid-cols-3 gap-3">
                {data.badges.map((b) => {
                  const meta = BADGE_META[b.id];
                  const Icon = b.unlocked ? (meta?.Icon ?? Trophy) : Lock;
                  return (
                    <div
                      key={b.id}
                      className={cn(
                        "flex flex-col items-center text-center gap-1.5 rounded-xl border p-3",
                        b.unlocked ? "border-border/50 bg-card" : "border-border/30 bg-muted/10 opacity-70"
                      )}
                    >
                      <span className={cn("w-11 h-11 rounded-full flex items-center justify-center", b.unlocked ? meta?.cls : "bg-muted/40 text-muted-foreground/50")}>
                        <Icon className="w-5 h-5" />
                      </span>
                      <span className="text-[11px] font-semibold leading-tight text-foreground">{b.name}</span>
                      {b.unlocked ? (
                        <span className="text-[10px] text-muted-foreground leading-tight">{b.description}</span>
                      ) : b.progress ? (
                        <span className="text-[10px] text-muted-foreground tabular-nums">{b.progress.have}/{b.progress.need}</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground leading-tight">{b.description}</span>
                      )}
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
