import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { AnimatedButton } from "@/components/AnimatedButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Edit, Trash2, ArrowLeft, Copy, Search, Sprout, Clock } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageTransition } from "@/components/PageTransition";

export default function ManageStrains() {
  const [, setLocation] = useLocation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);
  const [selectedStrain, setSelectedStrain] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vegaWeeks, setVegaWeeks] = useState(4);
  const [floraWeeks, setFloraWeeks] = useState(8);

  const { data: strains = [], refetch } = trpc.strains.list.useQuery();

  // Filtrar strains por busca
  const filteredStrains = strains.filter((strain: any) => {
    const query = searchQuery.toLowerCase();
    return (
      strain.name.toLowerCase().includes(query) ||
      (strain.description && strain.description.toLowerCase().includes(query))
    );
  });

  const createStrain = trpc.strains.create.useMutation();
  const updateStrain = trpc.strains.update.useMutation();
  const deleteStrain = trpc.strains.delete.useMutation();

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Nome da strain é obrigatório");
      return;
    }

    try {
      await createStrain.mutateAsync({ name, description, vegaWeeks, floraWeeks });
      toast.success("Strain criada com sucesso!");
      setIsCreateOpen(false);
      setName("");
      setDescription("");
      setVegaWeeks(4);
      setFloraWeeks(8);
      refetch();
    } catch (error) {
      toast.error("Erro ao criar strain");
    }
  };

  const handleEdit = async () => {
    if (!selectedStrain || !name.trim()) {
      toast.error("Nome da strain é obrigatório");
      return;
    }

    try {
      await updateStrain.mutateAsync({
        id: selectedStrain.id,
        name,
        description,
        vegaWeeks,
        floraWeeks,
      });
      toast.success("Strain atualizada com sucesso!");
      setIsEditOpen(false);
      setSelectedStrain(null);
      refetch();
    } catch (error) {
      toast.error("Erro ao atualizar strain");
    }
  };

  const handleDelete = async () => {
    if (!selectedStrain) return;

    const strain = selectedStrain;
    setIsDeleteOpen(false);
    setSelectedStrain(null);

    let timeoutId: NodeJS.Timeout | null = null;

    toast.info(`Strain "${strain.name}" será excluída em 5 segundos`, {
      duration: 5000,
      action: {
        label: "Desfazer",
        onClick: () => {
          if (timeoutId) clearTimeout(timeoutId);
          toast.success("Exclusão cancelada!");
        },
      },
    });

    timeoutId = setTimeout(async () => {
      try {
        await deleteStrain.mutateAsync({ id: strain.id });
        toast.success("Strain deletada com sucesso!");
        refetch();
      } catch (error) {
        toast.error("Erro ao deletar strain");
      }
    }, 5000);
  };

  const openEditDialog = (strain: any) => {
    setSelectedStrain(strain);
    setName(strain.name);
    setDescription(strain.description || "");
    setVegaWeeks(strain.vegaWeeks);
    setFloraWeeks(strain.floraWeeks);
    setIsEditOpen(true);
  };

  const openDeleteDialog = (strain: any) => {
    setSelectedStrain(strain);
    setIsDeleteOpen(true);
  };

  const openDuplicateDialog = (strain: any) => {
    setSelectedStrain(strain);
    setName(strain.name + " (Cópia)");
    setDescription(strain.description || "");
    setVegaWeeks(strain.vegaWeeks);
    setFloraWeeks(strain.floraWeeks);
    setIsDuplicateOpen(true);
  };

  const duplicateStrain = trpc.strains.duplicate.useMutation();

  const handleDuplicate = async () => {
    if (!selectedStrain || !name.trim()) {
      toast.error("Nome da strain é obrigatório");
      return;
    }

    try {
      await duplicateStrain.mutateAsync({
        sourceStrainId: selectedStrain.id,
        name,
        description,
        vegaWeeks,
        floraWeeks,
      });

      toast.success("Strain duplicada com sucesso! Todos os parâmetros ideais foram copiados.");
      setIsDuplicateOpen(false);
      setSelectedStrain(null);
      setName("");
      setDescription("");
      setVegaWeeks(4);
      setFloraWeeks(8);
      refetch();
    } catch (error) {
      toast.error("Erro ao duplicar strain");
    }
  };

  return (
    <PageTransition>
        <div className="min-h-screen bg-background">
      {/* Header — sticky, compacto no mobile */}
      <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/")}
            className="shrink-0 h-10 w-10"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-foreground truncate">
              Gerenciar Strains
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Crie e edite variedades com seus parâmetros ideais
            </p>
          </div>

          {/* Botão: ícone no mobile, texto completo no desktop */}
          <AnimatedButton
            onClick={() => setIsCreateOpen(true)}
            className="bg-green-600 hover:bg-green-700 text-white shrink-0 h-10"
            aria-label="Nova Strain"
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Nova Strain</span>
          </AnimatedButton>
        </div>
      </header>

      {/* Conteúdo */}
      <div className="container mx-auto px-4 py-6 space-y-5">
        {/* Campo de busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Buscar por nome ou descrição..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11"
          />
        </div>

        {/* Grid de strains */}
        {filteredStrains.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStrains.map((strain: any) => (
              <Card key={strain.id} className="hover:shadow-md transition-shadow flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base sm:text-lg leading-tight truncate">
                        {strain.name}
                      </CardTitle>
                      {strain.description && (
                        <CardDescription className="mt-1 text-xs line-clamp-2">
                          {strain.description}
                        </CardDescription>
                      )}
                    </div>
                  </div>

                  {/* Badges de semanas */}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Badge variant="outline" className="text-xs gap-1">
                      <span className="text-green-600">🌱</span>
                      Vega: {strain.vegaWeeks} sem
                    </Badge>
                    <Badge variant="outline" className="text-xs gap-1">
                      <span className="text-purple-500">🌸</span>
                      Flora: {strain.floraWeeks} sem
                    </Badge>
                    <Badge className="text-xs bg-primary/10 text-primary border-0 gap-1">
                      <Clock className="w-3 h-3" />
                      {strain.vegaWeeks + strain.floraWeeks} sem total
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-0 flex flex-col gap-2 mt-auto">
                  {/* Botão principal: Editar Parâmetros */}
                  <Button
                    variant="outline"
                    className="w-full h-10"
                    onClick={() => setLocation(`/strains/${strain.id}/targets`)}
                  >
                    Editar Parâmetros Ideais
                  </Button>

                  {/* Ações secundárias: linha com 3 botões */}
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDuplicateDialog(strain)}
                      className="flex-1 h-10 text-blue-600 hover:text-blue-700 hover:bg-blue-500/10"
                      title="Duplicar strain"
                    >
                      <Copy className="h-4 w-4 mr-1.5" />
                      <span className="text-xs">Duplicar</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(strain)}
                      className="flex-1 h-10"
                      title="Editar strain"
                    >
                      <Edit className="h-4 w-4 mr-1.5" />
                      <span className="text-xs">Editar</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDeleteDialog(strain)}
                      className="flex-1 h-10 text-red-600 hover:text-red-700 hover:bg-red-50"
                      title="Excluir strain"
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      <span className="text-xs">Excluir</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <Sprout className="w-14 h-14 text-muted-foreground/40" />
              <div className="text-center">
                <p className="font-medium text-foreground">
                  {searchQuery ? "Nenhuma strain encontrada" : "Nenhuma strain cadastrada"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchQuery
                    ? "Tente outro termo de busca"
                    : "Crie sua primeira strain para começar"}
                </p>
              </div>
              {!searchQuery && (
                <AnimatedButton
                  onClick={() => setIsCreateOpen(true)}
                  className="bg-green-600 hover:bg-green-700 text-white h-11"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeira Strain
                </AnimatedButton>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ─── Dialogs ─── */}

      {/* Formulário reutilizável como componente interno */}
      {[
        { open: isCreateOpen, onOpenChange: setIsCreateOpen, title: "Nova Strain", desc: "Crie uma nova variedade. Você poderá definir os parâmetros ideais depois.", onSave: handleCreate, isPending: createStrain.isPending, saveLabel: "Criar Strain" },
        { open: isEditOpen, onOpenChange: setIsEditOpen, title: "Editar Strain", desc: "Atualize as informações da strain.", onSave: handleEdit, isPending: updateStrain.isPending, saveLabel: "Salvar Alterações" },
        { open: isDuplicateOpen, onOpenChange: setIsDuplicateOpen, title: "Duplicar Strain", desc: `Crie uma cópia de "${selectedStrain?.name}" com todos os parâmetros ideais.`, onSave: handleDuplicate, isPending: duplicateStrain.isPending, saveLabel: "Duplicar Strain", saveClass: "bg-blue-600 hover:bg-blue-700 text-white" },
      ].map(({ open, onOpenChange, title, desc, onSave, isPending, saveLabel, saveClass }) => (
        <Dialog key={title} open={open} onOpenChange={onOpenChange}>
          <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{desc}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${title}-name`}>Nome *</Label>
                <Input
                  id={`${title}-name`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Blue Dream, OG Kush..."
                  className="h-11"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${title}-vega`}>Semanas VEGA</Label>
                  <Input
                    id={`${title}-vega`}
                    type="number"
                    min={1}
                    max={12}
                    value={vegaWeeks}
                    onChange={(e) => setVegaWeeks(parseInt(e.target.value))}
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${title}-flora`}>Semanas FLORA</Label>
                  <Input
                    id={`${title}-flora`}
                    type="number"
                    min={1}
                    max={16}
                    value={floraWeeks}
                    onChange={(e) => setFloraWeeks(parseInt(e.target.value))}
                    className="h-11"
                  />
                </div>
              </div>
              <div className="bg-primary/10 rounded-lg px-3 py-2 text-sm text-foreground">
                <strong>Total:</strong> {vegaWeeks + floraWeeks} semanas de ciclo
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${title}-desc`}>Descrição</Label>
                <Textarea
                  id={`${title}-desc`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Características, efeitos, notas..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="h-11 w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <AnimatedButton
                onClick={onSave}
                className={`h-11 w-full sm:w-auto ${saveClass ?? "bg-green-600 hover:bg-green-700 text-white"}`}
                disabled={isPending}
              >
                {isPending ? "Salvando..." : saveLabel}
              </AnimatedButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}

      {/* Delete Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Excluir Strain</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{selectedStrain?.name}</strong>? Esta ação não
              pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDeleteOpen(false)}
              className="h-11 w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDelete}
              variant="destructive"
              disabled={deleteStrain.isPending}
              className="h-11 w-full sm:w-auto"
            >
              {deleteStrain.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
