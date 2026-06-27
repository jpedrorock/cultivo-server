/**
 * TrophyUnlockWatcher — observa gamification.getProgress e dispara a cerimônia
 * de unlock quando um troféu atinge um tier novo (vs o seen-set em localStorage).
 * Montado global na área autenticada do App. Baseline na 1ª vez (sem spam).
 * Como getProgress é invalidado após registros, a cerimônia aparece logo depois
 * do unlock, em qualquer tela.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { type TrophyTier } from "@/components/TrophyIcon";
import { TrophyUnlockCelebration } from "@/components/TrophyUnlockCelebration";
import { loadSeen, saveSeen, hasBaseline } from "@/lib/trophySeen";

export function TrophyUnlockWatcher() {
  const { data } = trpc.gamification.getProgress.useQuery(undefined, { staleTime: 30_000 });
  const [queue, setQueue] = useState<{ tier: TrophyTier; title: string }[]>([]);

  useEffect(() => {
    if (!data) return;
    const achievements = (data.achievements ?? []) as Array<{ key: string; name: string; tier: TrophyTier | null; unlocked: boolean }>;

    // Conjunto atual de "chave:tier" desbloqueados (+ platina).
    const current = new Set<string>();
    for (const a of achievements) {
      if (a.unlocked && a.tier) current.add(`${a.key}:${a.tier}`);
    }
    if (data.platinum?.unlocked) current.add("platinum");

    // Primeira vez → baseline, sem celebrar conquistas antigas.
    if (!hasBaseline()) {
      saveSeen(current);
      return;
    }

    const seen = loadSeen();
    const fresh: { tier: TrophyTier; title: string }[] = [];
    for (const a of achievements) {
      if (a.unlocked && a.tier && !seen.has(`${a.key}:${a.tier}`)) {
        fresh.push({ tier: a.tier, title: a.name });
      }
    }
    if (data.platinum?.unlocked && !seen.has("platinum")) {
      fresh.push({ tier: "platinum", title: "Lenda do Cultivo" });
    }

    if (fresh.length) {
      saveSeen(new Set<string>([...seen, ...current]));
      setQueue((q) => [...q, ...fresh]);
    }
  }, [data]);

  if (queue.length === 0) return null;
  const first = queue[0];
  return (
    <TrophyUnlockCelebration
      key={`${first.tier}-${first.title}`}
      tier={first.tier}
      title={first.title}
      onDone={() => setQueue((q) => q.slice(1))}
    />
  );
}
