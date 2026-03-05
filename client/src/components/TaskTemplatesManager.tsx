import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedButton } from "@/components/AnimatedButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, Edit, Trash2, Loader2, Search, ListChecks } from "lucide-react";
import { toast } from "sonner";

type Phase = "VEGA" | "FLORA" | "MAINTENANCE" | "DRYING";
type Context = "TENT_A" | "TENT_BC";

// Mapeamento semântico: context representa o tipo de ciclo, não a estufa física
// TENT_A = ciclos de Manutenção (estufas configuradas como MAINTENANCE)
// TENT_BC = ciclos de Vega/Flora/Secagem (estufas configuradas como VEGA/FLORA/DRYING)

interface TaskTemplate {
  id: number;
  title: string;
  description: string | null;
  phase: Phase;
  weekNumber: number | null;
  context: Context;
}

const PHASE_LABELS: Record<Phase, string> = {
  VEGA: "Vegetativo",
  FLORA: "Floração",
  MAINTENANCE: "Manutenção",
  DRYING: "Secagem",
};

// Labels do contexto: mostra o tipo de ciclo, não o nome físico da estufa
const CONTEXT_LABELS: Record<Context, string> = {
  TENT_A: "Ciclo de Manutenção",
  TENT_BC: "Ciclo Vega / Flora / Secagem",
};


const PHASE_COLORS: Record<Phase, string> = {
  VEGA: "bg-green-500/10 text-green-700 border-green-200",
  FLORA: "bg-purple-500/10 text-purple-700 border-purple-200",
  MAINTENANCE: "bg-amber-500/10 text-amber-700 border-amber-200",
  DRYING: "bg-orange-500/10 text-orange-700 border-orange-200",
};

export function TaskTemplatesManager() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    phase: "VEGA" as Phase,
    weekNumber: 1,
    context: "TENT_BC" as Context,
  });

  const { data: templates, isLoading } = trpc.taskTemplates.list.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.taskTemplates.create.useMutation({
    onSuccess: () => {
      utils.taskTemplates.list.invalidate();
      utils.tasks.getTasksByTent.invalidate();
      toast.success("Template de tarefa criado!");
      handleCloseDialog();
    },
    onError: (error) => toast.error(`Erro ao criar template: ${error.message}`),
  });

  const updateMutation = trpc.taskTemplates.update.useMutation({
    onSuccess: () => {
      utils.taskTemplates.list.invalidate();
      utils.tasks.getTasksByTent.invalidate();
      toast.success("Template de tarefa atualizado!");
      handleCloseDialog();
    },
    onError: (error) => toast.error(`Erro ao atualizar template: ${error.message}`),
  });

  const deleteMutation = trpc.taskTemplates.delete.useMutation({
    onSuccess: () => {
      utils.taskTemplates.list.invalidate();
      utils.tasks.getTasksByTent.invalidate();
      toast.success("Template de tarefa excluído!");
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    },
    onError: (error) => toast.error(`Erro ao excluir template: ${error.message}`),
  });

  const handleOpenDialog = (template?: TaskTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        title: template.title,
        description: template.description || "",
        phase: template.phase,
        weekNumber: template.weekNumber || 1,
        context: template.context,
      });
    } else {
      setEditingTemplate(null);
      setFormData({ title: "", description: "", phase: "VEGA", weekNumber: 1, context: "TENT_BC" });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingTemplate(null);
    setFormData({ title: "", description: "", phase: "VEGA", weekNumber: 1, context: "TENT_BC" });
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    const payload = {
      ...formData,
      weekNumber: formData.phase === "MAINTENANCE" ? null : formData.weekNumber,
    };
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (id: number) => {
    setTemplateToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (templateToDelete) deleteMutation.mutate({ id: templateToDelete });
  };

  // Filtrar e agrupar
  const filteredTemplates = templates?.filter((t: TaskTemplate) => {
    const q = searchQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q))
    );
  });

  const groupedTemplates = filteredTemplates?.reduce(
    (acc: Record<string, TaskTemplate[]>, t: TaskTemplate) => {
      if (!acc[t.phase]) acc[t.phase] = [];
      acc[t.phase].push(t);
      return acc;
    },
    {} as Record<string, TaskTemplate[]>
  ) as Record<string, TaskTemplate[]>;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho da seção */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-foreground">Templates de Tarefas</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Crie, edite ou remova templates por fase e tipo de ciclo
          </p>
        </div>
        <AnimatedButton
          onClick={() => handleOpenDialog()}
          className="shrink-0 h-10"
          aria-label="Nova Tarefa"
        >
          <Plus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Nova Tarefa</span>
        </AnimatedButton>
      </div>

      {/* Campo de busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="Buscar por título ou descrição..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-11"
        />
      </div>

      {/* Lista agrupada por fase */}
      {groupedTemplates && Object.keys(groupedTemplates).length > 0 ? (
        <Accordion type="multiple" className="space-y-3">
          {Object.entries(groupedTemplates).map(([key, phaseTemplates]) => {
            const phase = key as Phase;
            return (
              <AccordionItem
                key={key}
                value={key}
                className="border rounded-xl overflow-hidden"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-accent/30 transition-colors">
                  <div className="flex items-center gap-2.5 text-left">
                    <span className="font-semibold text-sm sm:text-base">
                      {PHASE_LABELS[phase]}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${PHASE_COLORS[phase]}`}
                    >
                      {phaseTemplates.length} {phaseTemplates.length === 1 ? "tarefa" : "tarefas"}
                    </Badge>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-3 pb-3 pt-1">
                  <div className="space-y-2">
                    {phaseTemplates
                      .sort((a: any, b: any) => (a.weekNumber || 0) - (b.weekNumber || 0))
                      .map((template: any) => (
                        <div
                          key={template.id}
                          className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
                        >
                          {/* Conteúdo */}
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-start gap-2 flex-wrap">
                              <span className="font-medium text-sm leading-snug">
                                {template.title}
                              </span>
                              {template.weekNumber && (
                                <Badge variant="secondary" className="text-xs shrink-0">
                                  Sem. {template.weekNumber}
                                </Badge>
                              )}
                            </div>
                            {template.description && (
                              <p className="text-xs text-muted-foreground leading-snug">
                                {template.description}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground/70">
                              {CONTEXT_LABELS[template.context as Context]}
                            </p>
                          </div>

                          {/* Ações — touch targets 44px */}
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => handleOpenDialog(template)}
                              className="h-9 w-9 flex items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label="Editar template"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(template.id)}
                              className="h-9 w-9 flex items-center justify-center rounded-md hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label="Excluir template"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <ListChecks className="w-14 h-14 text-muted-foreground/40" />
            <div className="text-center">
              <p className="font-medium text-foreground">
                {searchQuery ? "Nenhum template encontrado" : "Nenhum template cadastrado"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {searchQuery
                  ? "Tente outro termo de busca"
                  : "Crie templates para automatizar as tarefas semanais"}
              </p>
            </div>
            {!searchQuery && (
              <AnimatedButton onClick={() => handleOpenDialog()} className="h-11">
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Template
              </AnimatedButton>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog: Criar / Editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Atualize os dados do template"
                : "Crie um novo template de tarefa para uma fase"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="tmpl-title">Título *</Label>
              <Input
                id="tmpl-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Ex: Verificar pH do solo"
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tmpl-desc">Descrição</Label>
              <Textarea
                id="tmpl-desc"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Detalhes opcionais da tarefa..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tmpl-phase">Fase *</Label>
                <Select
                  value={formData.phase}
                  onValueChange={(v) => setFormData({ ...formData, phase: v as Phase })}
                >
                  <SelectTrigger id="tmpl-phase" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VEGA">Vegetativo</SelectItem>
                    <SelectItem value="FLORA">Floração</SelectItem>
                    <SelectItem value="MAINTENANCE">Manutenção</SelectItem>
                    <SelectItem value="DRYING">Secagem</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tmpl-context">Tipo de Ciclo *</Label>
                <Select
                  value={formData.context}
                  onValueChange={(v) => setFormData({ ...formData, context: v as Context })}
                >
                  <SelectTrigger id="tmpl-context" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TENT_BC">
                      <div className="flex flex-col">
                        <span>Vega / Flora / Secagem</span>
                        <span className="text-xs text-muted-foreground">Ciclos produtivos</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="TENT_A">
                      <div className="flex flex-col">
                        <span>Manutenção</span>
                        <span className="text-xs text-muted-foreground">Ciclos de manutenção</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.phase !== "MAINTENANCE" && (
              <div className="space-y-1.5">
                <Label htmlFor="tmpl-week">Semana *</Label>
                <Input
                  id="tmpl-week"
                  type="number"
                  min={1}
                  max={12}
                  value={formData.weekNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, weekNumber: parseInt(e.target.value) || 1 })
                  }
                  className="h-11"
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleCloseDialog}
              className="h-11 w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <AnimatedButton
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="h-11 w-full sm:w-auto"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingTemplate ? "Atualizar" : "Criar"}
            </AnimatedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-sm w-[calc(100vw-2rem)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Template</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza? Esta ação também removerá todas as instâncias de tarefas associadas e não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel className="h-11 w-full sm:w-auto">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="h-11 w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
