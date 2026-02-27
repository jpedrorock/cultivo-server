import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CheckCircle2, Circle, Sprout, Filter, Trash2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "wouter";
import { toast } from "sonner";
import { TaskTemplatesManager } from "@/components/TaskTemplatesManager";
import { TaskCardSkeleton } from "@/components/ListSkeletons";
import { useState } from "react";

export default function Tasks() {
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
      toast.success("Tarefa marcada como concluída!");
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
        <div className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Link href="/">
              <Button variant="ghost" size="sm">
                ← Voltar
              </Button>
            </Link>
            <h1 className="text-xl font-bold">Tarefas da Semana</h1>
            <div className="w-20" />
          </div>
        </div>
        <main className="container mx-auto px-4 py-6">
          <TaskCardSkeleton count={3} />
        </main>
      </div>
    );
  }

  // Filter tasks
  const filteredTasks = tasks?.filter((task) => {
    // Filter by tent
    if (selectedTent !== "all" && !task.tentName.includes(selectedTent)) {
      return false;
    }
    // Filter by pending status
    if (showOnlyPending && task.isDone) {
      return false;
    }
    return true;
  }) || [];

  // Group tasks by tent
  const tasksByTent = filteredTasks.reduce((acc: Record<string, any[]>, task) => {
    const key = `${task.tentName}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(task);
    return acc;
  }, {}) || {};

  const totalTasks = filteredTasks.length || 0;
  const completedTasks = filteredTasks.filter((t) => t.isDone).length || 0;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Get unique tent names for filter buttons
  const tentNames = Array.from(new Set(tasks?.map((t) => t.tentName) || []));

  return (
    <>
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="sm">
              ← Voltar
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <Sprout className="w-6 h-6 text-green-600" />
            <div>
              <h1 className="text-xl font-bold text-foreground">Tarefas Semanais</h1>
              <p className="text-sm text-muted-foreground">Tarefas organizadas por estufa e semana do ciclo</p>
            </div>
          </div>
          <Badge variant="outline" className="text-sm">
            {completedTasks}/{totalTasks} concluídas
          </Badge>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <Tabs defaultValue="tasks" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="tasks">Tarefas da Semana</TabsTrigger>
            <TabsTrigger value="manage">Gerenciar</TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="space-y-6">
        {/* Filters */}
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
              {/* Tent filter */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Filter className="w-4 h-4" />
                  <span>Filtrar por estufa:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={selectedTent === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedTent("all")}
                  >
                    Todas
                  </Button>
                  {tentNames.map((tentName) => {
                    const tentLetter = tentName.includes("A") ? "A" : tentName.includes("B") ? "B" : "C";
                    return (
                      <Button
                        key={tentName}
                        variant={selectedTent === tentLetter ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedTent(tentLetter)}
                      >
                        Estufa {tentLetter}
                      </Button>
                    );
                  })}
                </div>
              </div>
              
              {/* Pending filter */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="pending-only"
                  checked={showOnlyPending}
                  onCheckedChange={(checked) => setShowOnlyPending(checked as boolean)}
                />
                <label
                  htmlFor="pending-only"
                  className="text-sm font-medium text-foreground cursor-pointer"
                >
                  Mostrar apenas tarefas pendentes
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Progress Card */}
        <Card className="mb-6 bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg">Progresso Geral</CardTitle>
            <CardDescription>Acompanhe a conclusão das tarefas da semana atual de cada ciclo</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progresso</span>
                <span className="font-semibold text-green-600">{progress}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{completedTasks} concluídas</span>
                <span>{totalTasks - completedTasks} pendentes</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tasks by Tent */}
        {tasks && tasks.length > 0 ? (
          <div className="space-y-6">
            {Object.entries(tasksByTent).map(([tentName, tentTasks]) => {
              const tentCompleted = tentTasks.filter((t) => t.isDone).length;
              const tentTotal = tentTasks.length;
              const firstTask = tentTasks[0];

              return (
                <Card key={tentName} className="bg-card/80 backdrop-blur-sm">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{tentName}</CardTitle>
                        <CardDescription>
                          {firstTask?.phase === "VEGA" ? "Vegetativa" : firstTask?.phase === "FLORA" ? "Floração" : "Manutenção"}
                          {firstTask?.weekNumber ? ` • Semana ${firstTask.weekNumber} do ciclo` : ""}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={firstTask?.phase === "VEGA" ? "default" : "secondary"}
                        className={
                          firstTask?.phase === "VEGA"
                            ? "bg-primary/100 hover:bg-green-600"
                            : "bg-purple-500 hover:bg-purple-600"
                        }
                      >
                        {tentCompleted}/{tentTotal}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {tentTasks.map((task) => (
                        <div
                          key={task.id || task.title}
                          className={`flex items-start gap-3 p-4 rounded-lg border transition-all ${
                            task.isDone
                              ? "bg-primary/10 border-primary/20"
                              : "bg-white border-gray-200 hover:border-green-300"
                          }`}
                        >
                          <Checkbox
                            checked={task.isDone}
                            onCheckedChange={() => handleToggleTask(task.id, task.isDone)}
                            disabled={task.isDone || task.id === 0}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <h4
                                className={`font-medium ${
                                  task.isDone ? "text-muted-foreground line-through" : "text-foreground"
                                }`}
                              >
                                {task.title}
                              </h4>
                              {task.isDone ? (
                                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                              ) : (
                                <Circle className="w-5 h-5 text-gray-400 flex-shrink-0" />
                              )}
                            </div>
                            {task.description && (
                              <p className={`text-sm mt-1 ${task.isDone ? "text-gray-400" : "text-muted-foreground"}`}>
                                {task.description}
                              </p>
                            )}
                            {task.completedAt && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Concluída em {new Date(task.completedAt).toLocaleDateString("pt-BR")}
                              </p>
                            )}
                          </div>
                          {task.id > 0 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setDeleteTaskConfirm({ open: true, taskId: task.id });
                              }}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          /* No tasks */
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Circle className="w-16 h-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma tarefa</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                Não há ciclos ativos no momento. Inicie um ciclo para ver as tarefas semanais.
              </p>
            </CardContent>
          </Card>
        )}
          </TabsContent>

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
    </>
  );
}