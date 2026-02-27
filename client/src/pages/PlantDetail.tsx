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
import { 
  ArrowLeft, 
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
  XCircle
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
import { toast } from "sonner";
import { PageTransition } from "@/components/PageTransition";

export default function PlantDetail() {
  const [, params] = useRoute("/plants/:id");
  const plantId = params?.id ? parseInt(params.id) : 0;
  const [moveTentModalOpen, setMoveTentModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", code: "", notes: "" });

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
    if (confirm('Deseja transplantar esta planta para a estufa de Flora?')) {
      transplantMutation.mutate({ plantId });
    }
  };
  
  const handleHarvest = () => {
    const reason = prompt('Notas sobre a colheita (opcional - ex: peso, qualidade):');
    if (reason !== null) { // null = cancelado
      archiveMutation.mutate({ 
        plantId, 
        status: 'HARVESTED',
        finishReason: reason || undefined
      });
    }
  };
  
  const handleDelete = () => {
    if (confirm('⚠️ ATENÇÃO: Esta ação é PERMANENTE e não pode ser desfeita!\n\nUse apenas para plantas cadastradas por erro.\n\nPara plantas colhidas ou descartadas, use "Marcar como Colhida" ou "Descartar Planta".\n\nDeseja realmente excluir permanentemente?')) {
      deleteMutation.mutate({ plantId: plant!.id });
    }
  };
  
  const handleDiscard = () => {
    const reason = prompt('Motivo do descarte (ex: doente, hermafrodita, baixa qualidade):');
    if (reason !== null) { // null = cancelado
      archiveMutation.mutate({ 
        plantId, 
        status: 'DISCARDED',
        finishReason: reason || undefined
      });
    }
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
        <div className="container py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" asChild>
                <Link href="/plants">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              </Button>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg bg-gradient-to-br ${
                plant.cyclePhase === 'VEGA' || tent?.category === 'VEGA'
                  ? 'from-green-500 to-emerald-600'
                  : plant.cyclePhase === 'FLORA' || tent?.category === 'FLORA'
                  ? 'from-purple-500 to-violet-600'
                  : tent?.category === 'DRYING'
                  ? 'from-amber-500 to-orange-600'
                  : 'from-blue-500 to-cyan-600'
              }`}>
                <Sprout className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">{plant.name}</h1>
                {plant.code && (
                  <p className="text-sm text-muted-foreground font-mono">{plant.code}</p>
                )}
              </div>
              {/* Badge de fase com sistema de cores por fase */}
              {(plant.cyclePhase || tent) && (
                <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold border flex items-center gap-1.5 ${
                  (plant.cyclePhase === 'VEGA' || tent?.category === 'VEGA')
                    ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:bg-green-500/15 dark:border-green-500/35 dark:text-green-400'
                    : (plant.cyclePhase === 'FLORA' || tent?.category === 'FLORA')
                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-700 dark:bg-purple-500/15 dark:border-purple-500/35 dark:text-purple-400'
                    : tent?.category === 'DRYING'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:bg-amber-500/15 dark:border-amber-500/35 dark:text-amber-400'
                    : 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:bg-blue-500/15 dark:border-blue-500/35 dark:text-blue-400'
                }`}>
                  <span>{
                    (plant.cyclePhase === 'VEGA' || tent?.category === 'VEGA') ? '🌱' :
                    (plant.cyclePhase === 'FLORA' || tent?.category === 'FLORA') ? '🌸' :
                    tent?.category === 'DRYING' ? '🍂' : '🔧'
                  }</span>
                  <span>{
                    plant.cyclePhase === 'VEGA' ? 'Vegetativa' :
                    plant.cyclePhase === 'FLORA' ? 'Floração' :
                    tent?.category === 'VEGA' ? 'Vegetativa' :
                    tent?.category === 'FLORA' ? 'Floração' :
                    tent?.category === 'DRYING' ? 'Secagem' :
                    tent?.category === 'MAINTENANCE' ? 'Manutenção' :
                    tent?.category || ''
                  }</span>
                  {plant.cycleWeek && (
                    <span className="font-bold ml-0.5">· Sem. {plant.cycleWeek}</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleEditClick}>
                <Edit className="w-4 h-4 mr-2" />
                Editar
              </Button>
              
              {/* Menu de Ações Rápidas */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <MoreVertical className="w-4 h-4 mr-2" />
                    Ações
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
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
          <TabsList className="flex w-full overflow-x-auto">
            <TabsTrigger value="health">
              <Heart className="w-4 h-4 mr-2" />
              Saúde
            </TabsTrigger>
            {plant.plantStage === "PLANT" && (
              <TabsTrigger value="trichomes">
                <Sparkles className="w-4 h-4 mr-2" />
                Tricomas
              </TabsTrigger>
            )}
            {plant.plantStage === "PLANT" && (
              <TabsTrigger value="lst">
                <Scissors className="w-4 h-4 mr-2" />
                LST
              </TabsTrigger>
            )}
            <TabsTrigger value="observations">
              <FileText className="w-4 h-4 mr-2" />
              Observações
            </TabsTrigger>

          </TabsList>

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
    </div>
    </PageTransition>
  );
}
