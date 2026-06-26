import { Flame, Loader2, Trophy, Shield } from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { TrophyIcon, type TrophyTier } from "@/components/TrophyIcon";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const TIER_NAME: Record<TrophyTier, string> = {
  bronze: "Broto",
  silver: "Folhagem",
  gold: "Florada",
  platinum: "Lenda",
};
const TIER_COLOR: Record<TrophyTier, string> = {
  bronze: "#c0843f",
  silver: "#c2ccd4",
  gold: "#f0cf6a",
  platinum: "#7df0e0",
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
              <h1 className="text-xl font-bold text-foreground">Estufa de Troféus</h1>
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
              {data.streak.current > 0 && (
                <div className="mt-3">
                  <span className={cn(
                    "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full",
                    data.streak.shieldUsed
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  )}>
                    <Shield className="w-3.5 h-3.5" />
                    {data.streak.shieldUsed ? "Escudo usado — sua ofensiva foi salva!" : "Escudo pronto · 1 dia perdido é perdoado"}
                  </span>
                </div>
              )}
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

            {/* Platina — pedestal */}
            <div className="rounded-2xl border border-[#7df0e0]/25 bg-[#7df0e0]/[0.04] p-5 flex items-center gap-4">
              <TrophyIcon tier="platinum" locked={!data.platinum.unlocked} size={56} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">Lenda do Cultivo</p>
                <p className="text-xs text-muted-foreground mb-2">
                  Coleção {data.platinum.have}/{data.platinum.total}
                  {data.platinum.unlocked ? " · Platina conquistada! 🏆" : ` · Platina em ${data.platinum.total - data.platinum.have}`}
                </p>
                <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((data.platinum.have / data.platinum.total) * 100)}%`, backgroundColor: "#7df0e0" }} />
                </div>
              </div>
            </div>

            {/* Conquistas */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">Conquistas</p>
              <div className="grid grid-cols-3 gap-3">
                {data.achievements.map((a) => {
                  const tier = (a.tier ?? "bronze") as TrophyTier;
                  return (
                    <div
                      key={a.key}
                      className={cn(
                        "flex flex-col items-center text-center gap-1.5 rounded-xl border p-3",
                        a.unlocked ? "border-border/50 bg-card" : "border-border/30 bg-muted/10"
                      )}
                    >
                      <TrophyIcon tier={tier} locked={!a.unlocked} size={46} />
                      <span className="text-[11px] font-semibold leading-tight text-foreground">{a.name}</span>
                      {a.unlocked ? (
                        <span className="text-[10px] font-medium leading-tight" style={{ color: TIER_COLOR[tier] }}>{TIER_NAME[tier]}</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground leading-tight">{a.hint}</span>
                      )}
                      {a.nextThreshold != null ? (
                        <span className="text-[10px] text-muted-foreground/80 tabular-nums">{a.current}/{a.nextThreshold}</span>
                      ) : (
                        <span className="text-[10px] text-primary font-medium">Máximo</span>
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
