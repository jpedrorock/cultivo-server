/**
 * GardenStreakBadge — a ofensiva de cuidado no Modo Jardim (v2 Pilar 3).
 * Reusa `gamification.getProgress().streak`. Ícone lucide (sem emoji).
 */
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export function GardenStreakBadge({
  days,
  todayDone,
}: {
  days: number;
  todayDone: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1 text-sm font-semibold">
      <Flame className={cn("w-4 h-4", !todayDone && "opacity-50")} />
      {days} dia{days === 1 ? "" : "s"} de cuidado
      {!todayDone && <span className="text-xs font-normal opacity-70">· registre hoje</span>}
    </div>
  );
}
