import { useState } from "react";
import { useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, 
  Sprout, 
  FileText, 
  Droplets, 
  Heart, 
  Sparkles, 
  Scissors,
  Edit,
  MoveRight,
  MoreVertical,
  Flower2,
  CheckCircle,
  Loader2,
  Trash2,
  XCircle,
  History,
  ArrowRight
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import PlantObservationsTab from "@/components/PlantObservationsTab";
import PlantHealthTab from "@/components/PlantHealthTab";
import PlantTrichomesTab from "@/components/PlantTrichomesTab";
import PlantLSTTab from "@/components/PlantLSTTab";
import MoveTentModal from "@/components/MoveTentModal";
import PlantTentHistoryTab from "@/components/PlantTentHistoryTab";
import { toast } from "sonner";
import { PageTransition } from "@/components/PageTransition";

export default function PlantDetail() {
  const [, params] = useRoute("/plants/:id");
  const plantId = params?.id ? parseInt(params.id) : 0;
  const [moveTentModalOpen, setMoveTentModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", code: "", notes: "" });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [transplantConfirmOpen, setTransplantConfirmOpen] = useState(false);
  const [harvestModalOpen, setHarvestModalOpen] = useState(false);
  const [harvestNotes, setHarvestNotes] = useState("");
  const [discardModalOpen, setDiscardModalOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState("");

  const { data: plant, isLoading, refetch } = trpc.plants.getById.useQuery({ id: plantId });
  const { data: strain } = trpc.strains.getById.useQuery(
    { id: plant?.strainId || 0 },
    { enabled: !!plant?.strainId }
  );
  const { data: tent } = trpc.tents.getById.useQuery(
    { id: plant?.currentTentId || 0 },
    { enabled: !!plant?.currentTentId }
  );
  
  // Mutations para ações
  const transplantMutation = trpc.plants.transplantToFlora.useMutation({
    onSuccess: (data) => {
      toast.success(`Planta transplantada para ${data.tentName} com sucesso!`);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao transplantar: ${error.message}`);
    },
  });
  
  const archiveMutation = trpc.plants.archive.useMutation({
    onSuccess: (_, variables) => {
      const message = variables.status === 'HARVESTED' 
        ? '✅ Planta marcada como colhida e arquivada!'
        : '🗑️ Planta descartada e arquivada!';
      toast.success(message);
      window.location.href = '/plants';
    },
    onError: (error) => {
      toast.error(`Erro ao arquivar planta: ${error.message}`);
    },
  });
  
  const deleteMutation = trpc.plants.deletePermanently.useMutation({
    onSuccess: () => {
      toast.success('✅ Planta excluída permanentemente!');
      window.location.href = '/plants';
    },
    onError: (error) => {
      toast.error(`Erro ao excluir planta: ${error.message}`);
    },
  });

  const promoteToPlantMutation = trpc.plants.promoteToPlant.useMutation({
    onSuccess: () => {
      toast.success('🌱 Muda promovida para planta com sucesso!');
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao promover muda: ${error.message}`);
    },
  });

  const updateMutation = trpc.plants.update.useMutation({
    onSuccess: () => {
      toast.success('✅ Planta atualizada com sucesso!');
      setEditModalOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar planta: ${error.message}`);
    },
  });
  
  // Handlers
  const handleTransplantToFlora = () => {
    setTransplantConfirmOpen(true);
  };
  
  const handleHarvest = () => {
    setHarvestNotes("");
    setHarvestModalOpen(true);
  };

  const confirmHarvest = () => {
    archiveMutation.mutate({ 
      plantId, 
      status: 'HARVESTED',
      finishReason: harvestNotes || undefined
    });
    setHarvestModalOpen(false);
  };
  
  const handleDelete = () => {
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (plant) deleteMutation.mutate({ plantId: plant.id });
  };
  
  const handleDiscard = () => {
    setDiscardReason("");
    setDiscardModalOpen(true);
  };

  const confirmDiscard = () => {
    archiveMutation.mutate({ 
      plantId, 
      status: 'DISCARDED',
      finishReason: discardReason || undefined
    });
    setDiscardModalOpen(false);
  };

  const handlePromoteToPlant = () => {
    if (!plant) return;
    promoteToPlantMutation.mutate({ plantId: plant.id });
  };

  const handleEditClick = () => {
    if (plant) {
      setEditForm({
        name: plant.name,
        code: plant.code || "",
        notes: plant.notes || "",
      });
      setEditModalOpen(true);
    }
  };

  const handleEditSave = () => {
    updateMutation.mutate({
      id: plantId,
      name: editForm.name,
      code: editForm.code || undefined,
      notes: editForm.notes || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!plant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-foreground mb-2">Planta não encontrada</p>
          <Button variant="outline" asChild>
            <Link href="/plants">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-500/10 text-green-600 border-green-500/30";
      case "HARVESTED":
        return "bg-blue-500/10 text-blue-600 border-blue-500/30";
      case "DEAD":
        return "bg-red-500/10 text-red-600 border-red-500/30";
      case "DISCARDED":
        return "bg-orange-500/10 text-orange-600 border-orange-500/30";
      default:
        return "bg-gray-500/10 text-gray-600 border-gray-500/30";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "Ativa";
      case "HARVESTED":
        return "Colhida";
      case "DEAD":
        return "Morta";
      case "DISCARDED":
        return "Descartada";
      default:
        return status;
    }
  };



  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="container py-3 md:py-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Button variant="ghost" size="icon" className="shrink-0" asChild>
                <Link href="/plants">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              </Button>
              <div className={`w-9 h-9 md:w-12 md:h-12 rounded-xl shrink-0 flex items-center justify-center shadow-lg bg-gradient-to-br ${
                plant.cyclePhase === 'VEGA' || tent?.category === 'VEGA'
                  ? 'from-green-500 to-emerald-600'
                  : plant.cyclePhase === 'FLORA' || tent?.category === 'FLORA'
                  ? 'from-purple-500 to-violet-600'
                  : tent?.category === 'DRYING'
                  ? 'from-amber-500 to-orange-600'
                  : 'from-blue-500 to-cyan-600'
              }`}>
                <Sprout className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base md:text-2xl font-bold text-foreground truncate leading-tight">{plant.name}</h1>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {plant.code && (
                    <p className="text-xs text-muted-foreground font-mono">{plant.code}</p>
                  )}
                  {/* Badge de fase - inline no mobile */}
                  {(plant.cyclePhase || tent) && (
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                      (plant.cyclePhase === 'VEGA' || tent?.category === 'VEGA')
                        ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                        : (plant.cyclePhase === 'FLORA' || tent?.category === 'FLORA')
                        ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                        : tent?.category === 'DRYING'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                    }`}>
                      {plant.cyclePhase === 'VEGA' ? '🌱 Veg' :
                       plant.cyclePhase === 'FLORA' ? '🌸 Flora' :
                       tent?.category === 'VEGA' ? '🌱 Veg' :
                       tent?.category === 'FLORA' ? '🌸 Flora' :
                       tent?.category === 'DRYING' ? '🍂 Sec' :
                       tent?.category === 'MAINTENANCE' ? '🔧 Man' : ''}
                      {plant.cycleWeek ? ` S${plant.cycleWeek}` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* Ações: no desktop mostra todos os botões, no mobile apenas o dropdown */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Desktop: botões individuais */}
              <Button variant="outline" size="sm" className="hidden md:flex" onClick={handleEditClick}>
                <Edit className="w-4 h-4 mr-2" />
                Editar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="hidden md:flex text-red-500 border-red-500/30 hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-500"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Excluir
              </Button>
              
              {/* Dropdown de Ações - ícone no mobile, texto no desktop */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 md:w-auto md:px-3 md:gap-2">
                    <MoreVertical className="w-4 h-4" />
                    <span className="hidden md:inline">Ações</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {/* Editar e Excluir: apenas no dropdown mobile */}
                  <DropdownMenuItem onClick={handleEditClick} className="md:hidden">
                    <Edit className="w-4 h-4 mr-2" />
                    Editar Planta
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="md:hidden text-red-600"
                  >
                    {deleteMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Excluindo...</>
                    ) : (
                      <><Trash2 className="w-4 h-4 mr-2" />Excluir Planta</>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="md:hidden" />
                  {plant.plantStage === "SEEDLING" && (
                    <DropdownMenuItem 
                      onClick={handlePromoteToPlant}
                      disabled={promoteToPlantMutation.isPending}
                      className="text-green-600"
                    >
                      {promoteToPlantMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Promovendo...
                        </>
                      ) : (
                        <>
                          <Sprout className="w-4 h-4 mr-2" />
                          Promover para Planta
                        </>
                      )}
                    </DropdownMenuItem>
                  )}
                  {tent?.category === "VEGA" && plant.plantStage === "PLANT" && (
                    <DropdownMenuItem 
                      onClick={handleTransplantToFlora}
                      disabled={transplantMutation.isPending}
                    >
                      {transplantMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Transplantando...
                        </>
                      ) : (
                        <>
                          <Flower2 className="w-4 h-4 mr-2" />
                          Transplantar para Flora
                        </>
                      )}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setMoveTentModalOpen(true)}>
                    <MoveRight className="w-4 h-4 mr-2" />
                    Mover para Outra Estufa
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleHarvest} 
                    disabled={archiveMutation.isPending}
                    className="text-green-600"
                  >
                    {archiveMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Arquivando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Marcar como Colhida
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={handleDiscard} 
                    disabled={archiveMutation.isPending}
                    className="text-orange-600"
                  >
                    {archiveMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Arquivando...
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 mr-2" />
                        Descartar Planta
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="text-red-600"
                  >
                    {deleteMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Excluindo...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Excluir Planta
                      </>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8 pb-32 md:pb-8">
        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Strain</CardDescription>
              <CardTitle className="text-xl">{strain?.name || "Unknown"}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Estufa Atual</CardDescription>
              <CardTitle className="text-xl">{tent?.name || "Unknown"}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Notes */}
        {plant.notes && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Notas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground">{plant.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="health" className="w-full">
          <div className="overflow-x-auto scrollbar-none -mx-4 px-4">
            <TabsList className="inline-flex min-w-full h-auto p-1 gap-0.5">
              <TabsTrigger value="health" className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2">
                <Heart className="w-3.5 h-3.5" />
                <span>Saúde</span>
              </TabsTrigger>
              {plant.plantStage === "PLANT" && (
                <TabsTrigger value="trichomes" className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Tricomas</span>
                </TabsTrigger>
              )}
              {plant.plantStage === "PLANT" && (
                <TabsTrigger value="lst" className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2">
                  <Scissors className="w-3.5 h-3.5" />
                  <span>LST</span>
                </TabsTrigger>
              )}
              <TabsTrigger value="observations" className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2">
                <FileText className="w-3.5 h-3.5" />
                <span>Obs.</span>
              </TabsTrigger>
              <TabsTrigger value="history" className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2">
                <History className="w-3.5 h-3.5" />
                <span>Histórico</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="health">
            <PlantHealthTab plantId={plantId} />
          </TabsContent>

          <TabsContent value="trichomes">
            <PlantTrichomesTab plantId={plantId} />
          </TabsContent>

          <TabsContent value="lst">
            <PlantLSTTab plantId={plantId} />
          </TabsContent>

          <TabsContent value="observations">
            <PlantObservationsTab plantId={plantId} />
          </TabsContent>

          <TabsContent value="history">
            <PlantTentHistoryTab plantId={plantId} />
          </TabsContent>

        </Tabs>
      </main>
      
      {/* Modal de Mover Estufa */}
      <MoveTentModal
        open={moveTentModalOpen}
        onOpenChange={setMoveTentModalOpen}
        plantId={plantId}
        plantName={plant?.name || ""}
        currentTentId={plant?.currentTentId || 0}
        onSuccess={refetch}
      />

      {/* Modal de Editar Planta */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Planta</DialogTitle>
            <DialogDescription>
              Atualize as informações da planta
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome *</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Nome da planta"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-code">Código</Label>
              <Input
                id="edit-code"
                value={editForm.code}
                onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                placeholder="Ex: NL-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notas</Label>
              <Textarea
                id="edit-notes"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Observações gerais sobre a planta"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditModalOpen(false)}
              disabled={updateMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={!editForm.name || updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Excluir Planta
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir permanentemente{" "}
              <span className="font-semibold text-foreground">{plant.name}</span>?
              Esta ação não pode ser desfeita e removerá todos os registros, fotos e histórico associados.
              Use apenas para plantas cadastradas por engano.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir Permanentemente
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transplant Confirm Dialog */}
      <Dialog open={transplantConfirmOpen} onOpenChange={setTransplantConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-600">
              <MoveRight className="w-5 h-5" />
              Transplantar para Flora
            </DialogTitle>
            <DialogDescription>
              Deseja transplantar{" "}
              <span className="font-semibold text-foreground">{plant.name}</span>{" "}
              para a estufa de Flora? A planta será movida automaticamente para a estufa de Floração configurada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTransplantConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={() => {
                transplantMutation.mutate({ plantId });
                setTransplantConfirmOpen(false);
              }}
            >
              <MoveRight className="w-4 h-4 mr-2" />
              Transplantar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Harvest Modal */}
      <Dialog open={harvestModalOpen} onOpenChange={setHarvestModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Scissors className="w-5 h-5" />
              Registrar Colheita
            </DialogTitle>
            <DialogDescription>
              Colhendo{" "}
              <span className="font-semibold text-foreground">{plant.name}</span>.
              Adicione notas sobre a colheita (opcional).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-foreground mb-2 block">
              Notas da colheita (ex: peso, qualidade)
            </label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              rows={3}
              placeholder="Ex: 45g, qualidade excelente, terpenos intensos..."
              value={harvestNotes}
              onChange={(e) => setHarvestNotes(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setHarvestModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={confirmHarvest}
              disabled={archiveMutation.isPending}
            >
              {archiveMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Colhendo...</>
              ) : (
                <><Scissors className="w-4 h-4 mr-2" />Confirmar Colheita</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard Modal */}
      <Dialog open={discardModalOpen} onOpenChange={setDiscardModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" />
              Descartar Planta
            </DialogTitle>
            <DialogDescription>
              Descartando{" "}
              <span className="font-semibold text-foreground">{plant.name}</span>.
              Informe o motivo do descarte (opcional).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-foreground mb-2 block">
              Motivo do descarte
            </label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              rows={3}
              placeholder="Ex: doente, hermafrodita, baixa qualidade..."
              value={discardReason}
              onChange={(e) => setDiscardReason(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDiscardModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDiscard}
              disabled={archiveMutation.isPending}
            >
              {archiveMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Descartando...</>
              ) : (
                <><XCircle className="w-4 h-4 mr-2" />Confirmar Descarte</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
