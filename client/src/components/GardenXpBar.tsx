/**
 * GardenXpBar — barra de progresso do grower no Modo Jardim (v2 Pilar 3).
 * Reusa a gamificação que já existe (`gamification.getProgress`): nível +
 * Grow Score. Só apresentação; sem emoji.
 */
import { Progress } from "@/components/ui/progress";

export function GardenXpBar({
  score,
  levelName,
  progressPct,
}: {
  score: number;
  levelName: string;
  progressPct: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-primary">{levelName}</span>
        <span className="text-muted-foreground tabular-nums">{score} XP</span>
      </div>
      <Progress value={progressPct} className="h-2" />
    </div>
  );
}
