import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CheckCircle2, Circle, ArrowLeft, Filter, Trash2, ListChecks, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "wouter";
import { toast } from "sonner";
import { TaskTemplatesManager } from "@/components/TaskTemplatesManager";
import { TaskCardSkeleton } from "@/components/ListSkeletons";
import { PageTransition, StaggerList, ListItemAnimation } from "@/components/PageTransition";
import { useState } from "react";

export default function Tarefas() {
  const { data: tasks, isLoading } = trpc.tasks.getCurrentWeekTasks.useQuery();
  const utils = trpc.useUtils();
  const [selectedTent, setSelectedTent] = useState<string>("all");
  const [showOnlyPending, setShowOnlyPending] = useState(false);
  const [deleteTaskConfirm, setDeleteTaskConfirm] = useState<{ open: boolean; taskId: number | null }>({
    open: false, taskId: null
  });

  const markAsDone = trpc.tasks.markAsDone.useMutation({
    onSuccess: () => {
      utils.tasks.getCurrentWeekTasks.invalidate();
      toast.success("Tarefa concluída!");
    },
    onError: (error) => {
      toast.error(`Erro ao marcar tarefa: ${error.message}`);
    },
  });

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      utils.tasks.getCurrentWeekTasks.invalidate();
      toast.success("Tarefa excluída!");
    },
    onError: (error) => {
      toast.error(`Erro ao excluir tarefa: ${error.message}`);
    },
  });

  const handleToggleTask = (taskId: number, isDone: boolean) => {
    if (!isDone && taskId > 0) {
      markAsDone.mutate({ taskId });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
          <div className="container mx-auto px-4 py-3 flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-lg font-bold">Tarefas da Semana</h1>
          </div>
        </div>
        <main className="container mx-auto px-4 py-6">
          <TaskCardSkeleton count={3} />
        </main>
      </div>
    );
  }

  // Filtrar tarefas
  const filteredTasks =
    tasks?.filter((task) => {
      if (selectedTent !== "all" && task.tentName !== selectedTent) return false;
      if (showOnlyPending && task.isDone) return false;
      return true;
    }) || [];

  // Agrupar por estufa
  const tasksByTent = filteredTasks.reduce((acc: Record<string, any[]>, task) => {
    const key = task.tentName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(task);
    return acc;
  }, {});

  const totalTasks = filteredTasks.length;
  const completedTasks = filteredTasks.filter((t) => t.isDone).length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Nomes únicos das estufas
  const tentNames = Array.from(new Set(tasks?.map((t) => t.tentName) || []));

  return (
    <PageTransition>
    <div className="min-h-screen bg-background">
      {/* Header sticky */}
      <div className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Voltar">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">
              Tarefas Semanais
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Organizadas por estufa e semana do ciclo
            </p>
          </div>

          {/* Badge de progresso — compacto */}
          <Badge
            variant="outline"
            className="shrink-0 text-xs sm:text-sm px-2 py-1 whitespace-nowrap"
          >
            {completedTasks}/{totalTasks}
          </Badge>
        </div>
      </div>

      <div className="container mx-auto px-4 py-5">
        <Tabs defaultValue="tasks" className="space-y-5">
          <TabsList className="grid w-full grid-cols-2 h-11">
            <TabsTrigger value="tasks" className="text-sm">
              Tarefas da Semana
            </TabsTrigger>
            <TabsTrigger value="manage" className="text-sm">
              Gerenciar
            </TabsTrigger>
          </TabsList>

          {/* ── Aba: Tarefas da Semana ── */}
          <TabsContent value="tasks" className="space-y-4">
            {/* Filtros */}
            <Card className="bg-card/80 backdrop-blur-sm">
              <CardContent className="pt-4 pb-4 space-y-3">
                {/* Filtro por estufa — scroll horizontal no mobile */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Filter className="w-3.5 h-3.5" />
                    <span>Filtrar por estufa</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    <Button
                      variant={selectedTent === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedTent("all")}
                      className="shrink-0 h-9"
                    >
                      Todas
                    </Button>
                    {tentNames.map((tentName) => (
                      <Button
                        key={tentName}
                        variant={selectedTent === tentName ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedTent(tentName)}
                        className="shrink-0 h-9"
                      >
                        {tentName}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Filtro: apenas pendentes */}
                <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                  <Checkbox
                    id="pending-only"
                    checked={showOnlyPending}
                    onCheckedChange={(checked) => setShowOnlyPending(checked as boolean)}
                    className="h-5 w-5"
                  />
                  <span className="text-sm font-medium text-foreground select-none">
                    Mostrar apenas tarefas pendentes
                  </span>
                </label>
              </CardContent>
            </Card>

            {/* Barra de progresso */}
            <Card className="bg-card/80 backdrop-blur-sm">
              <CardContent className="pt-4 pb-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Progresso geral</span>
                  <span className="font-bold text-green-600">{progress}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5">
                  <div
                    className="bg-gradient-to-r from-green-500 to-emerald-500 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{completedTasks} concluídas</span>
                  <span>{totalTasks - completedTasks} pendentes</span>
                </div>
              </CardContent>
            </Card>

            {/* Tarefas por estufa */}
            {tasks && tasks.length > 0 ? (
              <StaggerList className="space-y-4">
                {Object.entries(tasksByTent).map(([tentName, tentTasks]) => {
                  const tentCompleted = tentTasks.filter((t) => t.isDone).length;
                  const tentTotal = tentTasks.length;
                  const firstTask = tentTasks[0];

                  const phaseLabel =
                    firstTask?.phase === "VEGA"
                      ? "Vegetativa"
                      : firstTask?.phase === "FLORA"
                        ? "Floração"
                        : "Manutenção";

                  const badgeClass =
                    firstTask?.phase === "VEGA"
                      ? "bg-green-600 hover:bg-green-600"
                      : "bg-purple-500 hover:bg-purple-500";

                  return (
                    <ListItemAnimation key={tentName}>
                    <Card className="bg-card/80 backdrop-blur-sm">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <CardTitle className="text-base truncate">{tentName}</CardTitle>
                            <CardDescription className="text-xs">
                              {phaseLabel}
                              {firstTask?.weekNumber
                                ? ` · Semana ${firstTask.weekNumber} do ciclo`
                                : ""}
                            </CardDescription>
                          </div>
                          <Badge className={`${badgeClass} shrink-0 text-white text-xs`}>
                            {tentCompleted}/{tentTotal}
                          </Badge>
                        </div>
                      </CardHeader>

                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          {tentTasks.map((task) => (
                            <div
                              key={task.id || task.title}
                              className={`flex items-start gap-3 px-3 py-3 rounded-lg border transition-all min-h-[56px] ${
                                task.isDone
                                  ? "bg-primary/10 border-primary/20"
                                  : "bg-background border-border hover:border-green-300"
                              }`}
                            >
                              {/* Checkbox com área de toque ampliada */}
                              <button
                                onClick={() => handleToggleTask(task.id, task.isDone)}
                                disabled={task.isDone || task.id === 0}
                                className="mt-0.5 shrink-0 p-1 -m-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={task.isDone ? "Tarefa concluída" : "Marcar como concluída"}
                              >
                                {task.isDone ? (
                                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                                ) : (
                                  <Circle className="w-5 h-5 text-muted-foreground" />
                                )}
                              </button>

                              {/* Conteúdo */}
                              <div className="flex-1 min-w-0">
                                <p
                                  className={`text-sm font-medium leading-snug ${
                                    task.isDone
                                      ? "text-muted-foreground line-through"
                                      : "text-foreground"
                                  }`}
                                >
                                  {task.title}
                                </p>
                                {task.description && (
                                  <p
                                    className={`text-xs mt-0.5 leading-snug ${
                                      task.isDone ? "text-muted-foreground/60" : "text-muted-foreground"
                                    }`}
                                  >
                                    {task.description}
                                  </p>
                                )}
                                {task.completedAt && (
                                  <p className="text-xs text-muted-foreground/60 mt-1">
                                    Concluída em{" "}
                                    {new Date(task.completedAt).toLocaleDateString("pt-BR")}
                                  </p>
                                )}
                              </div>

                              {/* Botão excluir */}
                              {task.id > 0 && (
                                <button
                                  onClick={() => {
                                    setDeleteTaskConfirm({ open: true, taskId: task.id });
                                  }}
                                  className="shrink-0 p-2 -mr-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  aria-label="Excluir tarefa"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                    </ListItemAnimation>
                  );
                })}
              </StaggerList>
            ) : (
              <Card className="bg-card/80 backdrop-blur-sm">
                <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                  <ListChecks className="w-14 h-14 text-muted-foreground/40" />
                  <div className="text-center">
                    <h3 className="font-semibold text-foreground">Nenhuma tarefa</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                      {showOnlyPending
                        ? "Todas as tarefas foram concluídas!"
                        : "Não há ciclos ativos. Inicie um ciclo para ver as tarefas semanais."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Aba: Gerenciar Templates ── */}
          <TabsContent value="manage">
            <TaskTemplatesManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
      {/* Delete Task Confirm Dialog */}
      <Dialog open={deleteTaskConfirm.open} onOpenChange={(open) => !open && setDeleteTaskConfirm({ open: false, taskId: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Excluir Tarefa
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir esta tarefa? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTaskConfirm({ open: false, taskId: null })}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTaskConfirm.taskId) {
                  deleteTask.mutate({ taskId: deleteTaskConfirm.taskId });
                  setDeleteTaskConfirm({ open: false, taskId: null });
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
