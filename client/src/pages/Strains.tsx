import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Pencil, Trash2, Sprout, Search, Flower2, Timer, Leaf } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

export default function Strains() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStrain, setEditingStrain] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: number | null; name: string }>({
    open: false, id: null, name: ""
  });
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    vegaWeeks: 4,
    floraWeeks: 8,
    origin: "FEMINIZED" as "FEMINIZED" | "AUTOFLOWER" | "CLONE",
  });

  const ORIGIN_LABELS: Record<string, { label: string; color: string }> = {
    FEMINIZED: { label: "Feminizada", color: "bg-pink-500/10 text-pink-600 border-pink-500/30" },
    AUTOFLOWER: { label: "Autoflorescente", color: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
    CLONE: { label: "Clone", color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/30" },
  };

  const { data: strains, isLoading } = trpc.strains.list.useQuery();
  const { data: allPlants = [] } = trpc.plants.list.useQuery({ status: "ACTIVE" });
  const utils = trpc.useUtils();

  const createStrain = trpc.strains.create.useMutation({
    onSuccess: () => {
      utils.strains.list.invalidate();
      toast.success("Strain criada com sucesso!");
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error(`Erro ao criar strain: ${error.message}`);
    },
  });

  const updateStrain = trpc.strains.update.useMutation({
    onSuccess: () => {
      utils.strains.list.invalidate();
      toast.success("Strain atualizada com sucesso!");
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar strain: ${error.message}`);
    },
  });

  const deleteStrain = trpc.strains.delete.useMutation({
    onSuccess: () => {
      utils.strains.list.invalidate();
      toast.success("Strain excluída com sucesso!");
    },
    onError: (error) => {
      toast.error(`Erro ao excluir strain: ${error.message}`);
    },
  });

  const handleOpenDialog = (strain?: any) => {
    if (strain) {
      setEditingStrain(strain);
      setFormData({
        name: strain.name,
        description: strain.description || "",
        vegaWeeks: strain.vegaWeeks,
        floraWeeks: strain.floraWeeks,
        origin: (strain.origin as any) || "FEMINIZED",
      });
    } else {
      setEditingStrain(null);
      setFormData({
        name: "",
        description: "",
        vegaWeeks: 4,
        floraWeeks: 8,
        origin: "FEMINIZED",
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingStrain(null);
    setFormData({
      name: "",
      description: "",
      vegaWeeks: 4,
      floraWeeks: 8,
      origin: "FEMINIZED",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingStrain) {
      updateStrain.mutate({
        id: editingStrain.id,
        ...formData,
      });
    } else {
      createStrain.mutate(formData);
    }
  };

  const handleDelete = (id: number, name: string) => {
    const activePlants = allPlants.filter(
      (p: any) => p.strainId === id && p.status === "ACTIVE"
    );
    if (activePlants.length > 0) {
      toast.error(
        `Não é possível excluir "${name}" — há ${activePlants.length} planta${activePlants.length > 1 ? "s ativas" : " ativa"} usando esta cepa.`
      );
      return;
    }
    setDeleteConfirm({ open: true, id, name });
  };

  const confirmDelete = () => {
    if (!deleteConfirm.id) return;
    const id = deleteConfirm.id;
    const name = deleteConfirm.name;
    setDeleteConfirm({ open: false, id: null, name: "" });
    
    let timeoutId: NodeJS.Timeout | null = null;
    toast.info(`Strain "${name}" será excluída em 5 segundos`, {
      duration: 5000,
      action: {
        label: "Desfazer",
        onClick: () => {
          if (timeoutId) clearTimeout(timeoutId);
          toast.success("Exclusão cancelada!");
        },
      },
    });
    timeoutId = setTimeout(() => {
      deleteStrain.mutate({ id });
    }, 5000);
  };

  // Filtrar strains por busca
  const filteredStrains = strains?.filter((strain) => {
    const query = searchQuery.toLowerCase();
    return (
      strain.name.toLowerCase().includes(query) ||
      (strain.description && strain.description.toLowerCase().includes(query))
    );
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        backHref="/"
        title={
          <>
            <Sprout className="w-5 h-5 text-primary shrink-0" />
            <span className="truncate">Strains</span>
          </>
        }
        subtitle="Gerenciamento de variedades"
        rightActions={
          <Button onClick={() => handleOpenDialog()} className="bg-green-600 hover:bg-green-700 h-10">
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Nova Strain</span>
          </Button>
        }
      />

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sprout className="w-5 h-5 text-green-600" />
              Variedades Cadastradas
            </CardTitle>
            <CardDescription>
              Gerencie as strains disponíveis para seus ciclos de cultivo
            </CardDescription>
          </CardHeader>
          <div className="px-6 pb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar por nome ou descrição..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <CardContent>
            {filteredStrains && filteredStrains.length > 0 ? (
              <>
                {/* Mobile cards (< lg) */}
                <div className="lg:hidden space-y-4">
                  {filteredStrains.map((strain) => (
                    <Card key={strain.id} className="bg-muted/50">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <CardTitle className="text-lg">{strain.name}</CardTitle>
                              {strain.origin && ORIGIN_LABELS[strain.origin] && (
                                <Badge variant="outline" className={`text-xs ${ORIGIN_LABELS[strain.origin].color}`}>
                                  {ORIGIN_LABELS[strain.origin].label}
                                </Badge>
                              )}
                            </div>
                            <CardDescription className="mt-1">
                              {strain.description || "Sem descrição"}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-4 gap-2 text-sm">
                          <div className="bg-background rounded-lg p-3 text-center">
                            <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1"><Sprout className="w-3 h-3"/>Vega</div>
                            <div className="font-semibold text-foreground">{strain.vegaWeeks}s</div>
                          </div>
                          <div className="bg-background rounded-lg p-3 text-center">
                            <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1"><Flower2 className="w-3 h-3"/>Flora</div>
                            <div className="font-semibold text-foreground">{strain.floraWeeks}s</div>
                          </div>
                          <div className="bg-primary/10 rounded-lg p-3 text-center">
                            <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1"><Timer className="w-3.5 h-3.5"/>Total</div>
                            <div className="font-bold text-green-600">{strain.vegaWeeks + strain.floraWeeks}s</div>
                          </div>
                          <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                            <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1"><Leaf className="w-3 h-3"/>Ativas</div>
                            <div className="font-bold text-emerald-600">
                              {allPlants.filter((p: any) => p.strainId === strain.id).length}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDialog(strain)}
                            className="flex-1"
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(strain.id, strain.name)}
                            className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Desktop table (>= lg) */}
                <div className="hidden lg:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead className="text-center">Vega (sem)</TableHead>
                        <TableHead className="text-center">Flora (sem)</TableHead>
                        <TableHead className="text-center">Total</TableHead>
                        <TableHead className="text-center">Ativas</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStrains.map((strain) => (
                        <TableRow key={strain.id}>
                          <TableCell className="font-medium">{strain.name}</TableCell>
                          <TableCell>
                            {strain.origin && ORIGIN_LABELS[strain.origin] ? (
                              <Badge variant="outline" className={`text-xs ${ORIGIN_LABELS[strain.origin].color}`}>
                                {ORIGIN_LABELS[strain.origin].label}
                              </Badge>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-center">{strain.vegaWeeks}</TableCell>
                          <TableCell className="text-center">{strain.floraWeeks}</TableCell>
                          <TableCell className="text-center font-medium">
                            {strain.vegaWeeks + strain.floraWeeks} sem
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-semibold text-emerald-600">
                              {allPlants.filter((p: any) => p.strainId === strain.id).length}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenDialog(strain)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(strain.id, strain.name)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <Sprout className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-muted-foreground mb-4">Nenhuma strain cadastrada</p>
                <Button onClick={() => handleOpenDialog()} className="bg-green-600 hover:bg-green-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Cadastrar Primeira Strain
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingStrain ? "Editar Strain" : "Nova Strain"}
            </DialogTitle>
            <DialogDescription>
              {editingStrain
                ? "Atualize as informações da strain"
                : "Cadastre uma nova variedade para seus ciclos"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Northern Lights"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Características da strain"
                />
              </div>
              <div className="space-y-2">
                <Label>Origem</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["FEMINIZED", "AUTOFLOWER", "CLONE"] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setFormData({ ...formData, origin: o })}
                      className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                        formData.origin === o
                          ? ORIGIN_LABELS[o].color + " ring-2 ring-offset-1"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {ORIGIN_LABELS[o].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vegaWeeks">Vega (semanas) *</Label>
                  <Input
                    id="vegaWeeks"
                    type="number"
                    min="1"
                    max="12"
                    value={formData.vegaWeeks}
                    onChange={(e) =>
                      setFormData({ ...formData, vegaWeeks: parseInt(e.target.value) })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="floraWeeks">Flora (semanas) *</Label>
                  <Input
                    id="floraWeeks"
                    type="number"
                    min="1"
                    max="16"
                    value={formData.floraWeeks}
                    onChange={(e) =>
                      setFormData({ ...formData, floraWeeks: parseInt(e.target.value) })
                    }
                    required
                  />
                </div>
              </div>
              <div className="bg-primary/10 rounded-lg p-3 text-sm text-foreground">
                <strong>Duração total:</strong> {formData.vegaWeeks + formData.floraWeeks} semanas
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-green-600 hover:bg-green-700"
                disabled={createStrain.isPending || updateStrain.isPending}
              >
                {(createStrain.isPending || updateStrain.isPending) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {editingStrain ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => !open && setDeleteConfirm({ open: false, id: null, name: "" })}
        title="Excluir Strain"
        description={
          <>
            Tem certeza que deseja excluir a strain{" "}
            <span className="font-semibold text-foreground">"{deleteConfirm.name}"</span>?
            Esta ação não pode ser desfeita.
          </>
        }
        onConfirm={confirmDelete}
        confirmLabel="Excluir"
      />
    </div>
  );
}
