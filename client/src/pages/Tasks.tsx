import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CheckCircle2, Circle, Sprout, Filter, Trash2, AlertTriangle, Plus, Calendar, Flag } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "wouter";
import { toast } from "sonner";
import { TaskTemplatesManager } from "@/components/TaskTemplatesManager";
import { TaskCardSkeleton } from "@/components/ListSkeletons";
import { useState } from "react";
import { format, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";

const PRIORITY_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  LOW: { label: "Baixa", color: "text-gray-500", icon: "🔵" },
  MEDIUM: { label: "Média", color: "text-amber-500", icon: "🟡" },
  HIGH: { label: "Alta", color: "text-red-500", icon: "🔴" },
};

export default function Tasks() {
  const { data: tasks, isLoading } = trpc.tasks.getCurrentWeekTasks.useQuery();
  const { data: standaloneTasks = [], refetch: refetchStandalone } = trpc.tasks.listStandalone.useQuery();
  const utils = trpc.useUtils();
  const [selectedTent, setSelectedTent] = useState<number | "all">("all");
  const [showOnlyPending, setShowOnlyPending] = useState(false);
  const [deleteTaskConfirm, setDeleteTaskConfirm] = useState<{ open: boolean; taskId: number | null }>({
    open: false, taskId: null
  });

  // Standalone task form
  const [standaloneDialogOpen, setStandaloneDialogOpen] = useState(false);
  const [standaloneForm, setStandaloneForm] = useState({ title: "", description: "", priority: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH", dueDate: "" });

  const createStandalone = trpc.tasks.createStandalone.useMutation({
    onSuccess: () => { refetchStandalone(); setStandaloneDialogOpen(false); setStandaloneForm({ title: "", description: "", priority: "MEDIUM", dueDate: "" }); toast.success("Tarefa criada!"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
  const toggleStandalone = trpc.tasks.toggleStandalone.useMutation({
    onSuccess: () => refetchStandalone(),
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
  const deleteStandalone = trpc.tasks.deleteStandalone.useMutation({
    onSuccess: () => { refetchStandalone(); toast.success("Tarefa excluída!"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
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
        <div className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
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
    // Filter by tent (using tentId for reliable matching)
    if (selectedTent !== "all" && task.tentId !== selectedTent) {
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

  // Get unique tents (id + name) for filter buttons
  const uniqueTents = Array.from(
    new Map((tasks || []).map((t) => [t.tentId, { id: t.tentId, name: t.tentName }])).values()
  );

  return (
    <>
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
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
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="tasks">Semana</TabsTrigger>
            <TabsTrigger value="standalone" className="relative">
              Avulsas
              {standaloneTasks.filter((t: any) => !t.isDone).length > 0 && (
                <span className="ml-1.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center">
                  {standaloneTasks.filter((t: any) => !t.isDone).length}
                </span>
              )}
            </TabsTrigger>
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
                  {uniqueTents.map((tent) => (
                    <Button
                      key={tent.id}
                      variant={selectedTent === tent.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedTent(tent.id)}
                    >
                      {tent.name}
                    </Button>
                  ))}
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
                              : "bg-card border-border hover:border-green-300"
                          }`}
                        >
                          <Checkbox
                            checked={task.isDone}
                            onCheckedChange={() => handleToggleTask(task.id, task.isDone)}
                            disabled={task.isDone || task.id === 0}
                            title={task.id === 0 ? "Tarefa gerada automaticamente — não pode ser marcada individualmente" : undefined}
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
                            {task.id === 0 && (
                              <span className="inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground/60">
                                Gerada automaticamente
                              </span>
                            )}
                            {task.description && (
                              <p className={`text-sm mt-1 ${task.isDone ? "text-gray-400" : "text-muted-foreground"}`}>
                                {task.description}
                              </p>
                            )}
                            {task.dueDate && !task.isDone && (
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Semana de {format(new Date(task.dueDate), "dd/MM", { locale: ptBR })}
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

          <TabsContent value="standalone" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Tarefas Avulsas</h3>
              <Button size="sm" onClick={() => setStandaloneDialogOpen(true)} className="bg-green-600 hover:bg-green-700">
                <Plus className="w-4 h-4 mr-1" /> Nova Tarefa
              </Button>
            </div>
            {standaloneTasks.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Circle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhuma tarefa avulsa</p>
                  <p className="text-xs mt-1 opacity-60">Crie tarefas que não fazem parte de um ciclo</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {[...standaloneTasks]
                  .sort((a: any, b: any) => {
                    if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
                    const pOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
                    const pd = (pOrder[a.priority as keyof typeof pOrder] ?? 1) - (pOrder[b.priority as keyof typeof pOrder] ?? 1);
                    if (pd !== 0) return pd;
                    if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                    if (a.dueDate) return -1;
                    if (b.dueDate) return 1;
                    return 0;
                  })
                  .map((task: any) => {
                    const pr = PRIORITY_LABELS[task.priority] ?? PRIORITY_LABELS.MEDIUM;
                    const isOverdue = task.dueDate && !task.isDone && isAfter(new Date(), new Date(task.dueDate));
                    return (
                      <div
                        key={task.id}
                        className={`flex items-start gap-3 p-4 rounded-lg border transition-all ${
                          task.isDone ? "bg-primary/5 border-primary/20 opacity-60" : "bg-card border-border"
                        }`}
                      >
                        <Checkbox
                          checked={task.isDone}
                          onCheckedChange={() => toggleStandalone.mutate({ id: task.id })}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-medium text-sm ${task.isDone ? "line-through text-muted-foreground" : ""}`}>
                              {task.title}
                            </span>
                            <span className={`text-xs ${pr.color}`}>{pr.icon} {pr.label}</span>
                          </div>
                          {task.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                          )}
                          {task.dueDate && (
                            <p className={`text-xs mt-0.5 flex items-center gap-1 ${isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                              <Calendar className="w-3 h-3" />
                              {isOverdue ? "Vencida em " : "Vence em "}
                              {format(new Date(task.dueDate), "dd/MM/yyyy", { locale: ptBR })}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => deleteStandalone.mutate({ id: task.id })}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="manage">
            <TaskTemplatesManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>

      {/* Standalone Task Create Dialog */}
      <Dialog open={standaloneDialogOpen} onOpenChange={setStandaloneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="w-5 h-5 text-green-600" />
              Nova Tarefa Avulsa
            </DialogTitle>
            <DialogDescription>Crie uma tarefa fora de qualquer ciclo</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input
                value={standaloneForm.title}
                onChange={(e) => setStandaloneForm({ ...standaloneForm, title: e.target.value })}
                placeholder="Ex: Trocar substrato"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input
                value={standaloneForm.description}
                onChange={(e) => setStandaloneForm({ ...standaloneForm, description: e.target.value })}
                placeholder="Detalhes opcionais"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["LOW", "MEDIUM", "HIGH"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setStandaloneForm({ ...standaloneForm, priority: p })}
                    className={`py-2 rounded-lg border text-xs font-medium transition-all ${
                      standaloneForm.priority === p
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {PRIORITY_LABELS[p].icon} {PRIORITY_LABELS[p].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Data de Vencimento</Label>
              <Input
                type="date"
                value={standaloneForm.dueDate}
                onChange={(e) => setStandaloneForm({ ...standaloneForm, dueDate: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStandaloneDialogOpen(false)}>Cancelar</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={!standaloneForm.title.trim() || createStandalone.isPending}
              onClick={() => createStandalone.mutate({
                title: standaloneForm.title.trim(),
                description: standaloneForm.description || undefined,
                priority: standaloneForm.priority,
                dueDate: standaloneForm.dueDate ? new Date(standaloneForm.dueDate) : undefined,
              })}
            >
              {createStandalone.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Criar Tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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