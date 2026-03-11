import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Pencil, Trash2, Sprout, Search } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

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
  });

  const { data: strains, isLoading } = trpc.strains.list.useQuery();
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
      });
    } else {
      setEditingStrain(null);
      setFormData({
        name: "",
        description: "",
        vegaWeeks: 4,
        floraWeeks: 8,
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
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10 pt-safe">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <button className="flex items-center gap-2 text-primary hover:text-green-800 transition-colors">
              <Sprout className="w-6 h-6" />
              <div>
                <h1 className="text-xl font-bold">App Cultivo</h1>
                <p className="text-xs text-muted-foreground">Gerenciamento de Strains</p>
              </div>
            </button>
          </Link>
          <Button onClick={() => handleOpenDialog()} className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-2" />
            Nova Strain
          </Button>
        </div>
      </header>

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
                            <CardTitle className="text-lg">{strain.name}</CardTitle>
                            <CardDescription className="mt-1">
                              {strain.description || "Sem descrição"}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div className="bg-background rounded-lg p-3 text-center">
                            <div className="text-xs text-muted-foreground mb-1">🌱 Vega</div>
                            <div className="font-semibold text-foreground">{strain.vegaWeeks} sem</div>
                          </div>
                          <div className="bg-background rounded-lg p-3 text-center">
                            <div className="text-xs text-muted-foreground mb-1">🌸 Flora</div>
                            <div className="font-semibold text-foreground">{strain.floraWeeks} sem</div>
                          </div>
                          <div className="bg-primary/10 rounded-lg p-3 text-center">
                            <div className="text-xs text-muted-foreground mb-1">⏱️ Total</div>
                            <div className="font-bold text-green-600">{strain.vegaWeeks + strain.floraWeeks} sem</div>
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
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-center">Vega (semanas)</TableHead>
                        <TableHead className="text-center">Flora (semanas)</TableHead>
                        <TableHead className="text-center">Total</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStrains.map((strain) => (
                        <TableRow key={strain.id}>
                          <TableCell className="font-medium">{strain.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {strain.description || "-"}
                          </TableCell>
                          <TableCell className="text-center">{strain.vegaWeeks}</TableCell>
                          <TableCell className="text-center">{strain.floraWeeks}</TableCell>
                          <TableCell className="text-center font-medium">
                            {strain.vegaWeeks + strain.floraWeeks} semanas
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

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirm.open} onOpenChange={(open) => !open && setDeleteConfirm({ open: false, id: null, name: "" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Excluir Strain
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir a strain{" "}
              <span className="font-semibold text-foreground">"{deleteConfirm.name}"</span>?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm({ open: false, id: null, name: "" })}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
