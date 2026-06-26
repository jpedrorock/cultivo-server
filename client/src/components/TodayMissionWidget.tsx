import { Link } from "wouter";
import { CheckCircle, CheckCircle2, Zap, CheckSquare } from "lucide-react";

interface Tent {
  id: number;
  lastReadingAt: number | null;
}

interface TodayMissionWidgetProps {
  /** Estufas (com lastReadingAt). Só estufas com ciclo ativo entram na conta. */
  tents: Tent[];
  /** Total de alertas novos no app — entra na contagem de "tudo certo hoje". */
  totalNewAlerts: number;
  /** Função pra dizer se uma estufa tem ciclo ativo (do estado do pai). */
  hasActiveCycle: (tentId: number) => boolean;
  /** Tarefas da semana ainda não concluídas — entra no "tudo certo hoje". */
  pendingTasks?: number;
  /** Modo Simples: esconde números crus, mostra "N coisas pra cuidar". */
  simpleMode?: boolean;
}

/**
 * Widget no topo da Home com a "missão do dia": quantos registros faltam
 * e quantos alertas novos. CTA muda conforme o estado:
 *   - Tem registro pendente → botão "Registrar" → /quick-log
 *   - Só tem alerta         → botão "Ver alertas" → /alerts
 *   - Tudo OK               → sem CTA, fica verde "Tudo certo hoje! 🌿"
 *
 * Não renderiza nada se não houver estufas com ciclo ativo (no caller).
 */
export function TodayMissionWidget({ tents, totalNewAlerts, hasActiveCycle, pendingTasks = 0, simpleMode = false }: TodayMissionWidgetProps) {
  const activeTents = tents.filter((t) => hasActiveCycle(t.id));
  const registeredToday = activeTents.filter((t) => {
    if (!t.lastReadingAt) return false;
    const diff = Date.now() - t.lastReadingAt;
    return diff < 24 * 60 * 60 * 1000;
  });
  const pendingRegistrations = activeTents.length - registeredToday.length;
  const allDone = pendingRegistrations === 0 && totalNewAlerts === 0 && pendingTasks === 0;

  // Modo Simples: nº de CATEGORIAS que precisam de atenção (não os números crus,
  // pra não assustar com "150 tarefas"). Máx 3.
  const attentionCount =
    (pendingRegistrations > 0 ? 1 : 0) + (totalNewAlerts > 0 ? 1 : 0) + (pendingTasks > 0 ? 1 : 0);

  // CTA prioriza a ação mais "diária": registro > tarefa > alerta.
  const cta = pendingRegistrations > 0
    ? { href: "/quick-log", label: "Registrar" }
    : pendingTasks > 0
      ? { href: "/tarefas", label: "Ver tarefas" }
      : { href: "/alerts", label: "Ver alertas" };

  return (
    <div
      className={`mb-4 rounded-2xl border px-4 py-3 flex items-center gap-4 ${
        allDone
          ? "border-emerald-500/25 bg-emerald-500/[0.06]"
          : "border-border/50 bg-card"
      }`}
    >
      {/* Status icon */}
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          allDone ? "bg-emerald-500/20" : "bg-muted/60"
        }`}
      >
        {allDone ? (
          <CheckCircle className="w-5 h-5 text-emerald-500" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
        )}
      </div>

      {/* Metrics */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {allDone ? "Tudo certo hoje! 🌿" : simpleMode ? "Precisa de atenção" : "Missão de hoje"}
        </p>
        {simpleMode ? (
          !allDone && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {attentionCount} coisa{attentionCount > 1 ? "s" : ""} pra cuidar hoje
            </p>
          )
        ) : (
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span
            className={`text-xs flex items-center gap-1 ${
              pendingRegistrations > 0
                ? "text-amber-500 font-medium"
                : "text-muted-foreground line-through"
            }`}
          >
            <Zap className="w-3 h-3" />
            {pendingRegistrations > 0
              ? `${pendingRegistrations} registro${pendingRegistrations > 1 ? "s" : ""} pendente${pendingRegistrations > 1 ? "s" : ""}`
              : "Registros OK"}
          </span>
          {/* Chip de alertas removido — o banner vermelho acima ja' mostra a
              contagem (evita duplicar o numero na mesma tela). */}
          <span
            className={`text-xs flex items-center gap-1 ${
              pendingTasks > 0
                ? "text-amber-500 font-medium"
                : "text-muted-foreground line-through"
            }`}
          >
            <CheckSquare className="w-3 h-3" />
            {pendingTasks > 0
              ? `${pendingTasks} tarefa${pendingTasks > 1 ? "s" : ""} pendente${pendingTasks > 1 ? "s" : ""}`
              : "Tarefas OK"}
          </span>
        </div>
        )}
      </div>

      {/* CTA */}
      {!allDone && (
        <Link href={cta.href} onClick={(e) => e.stopPropagation()}>
          <button className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
            {cta.label}
          </button>
        </Link>
      )}
    </div>
  );
}
