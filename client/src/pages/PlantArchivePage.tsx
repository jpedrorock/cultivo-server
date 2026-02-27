import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  ArrowLeft, 
  Archive, 
  CheckCircle, 
  XCircle, 
  Skull,
  RotateCcw,
  Loader2,
  Calendar,
  Sprout,
  Home,
  Scale,
  FileText
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PlantArchivePage() {
  const [statusFilter, setStatusFilter] = useState<"HARVESTED" | "DISCARDED" | "DEAD" | undefined>(undefined);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedPlantId, setSelectedPlantId] = useState<number | null>(null);
  const [targetTentId, setTargetTentId] = useState<number | null>(null);

  const { data: archivedPlants, isLoading, refetch } = trpc.plants.listArchived.useQuery({
    status: statusFilter,
  });

  const { data: tents } = trpc.tents.list.useQuery();

  const unarchiveMutation = trpc.plants.unarchive.useMutation({
    onSuccess: () => {
      toast.success("✅ Planta restaurada com sucesso!");
      setRestoreDialogOpen(false);
      setSelectedPlantId(null);
      setTargetTentId(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao restaurar planta: ${error.message}`);
    },
  });

  const handleRestore = (plantId: number) => {
    setSelectedPlantId(plantId);
    setRestoreDialogOpen(true);
  };

  const confirmRestore = () => {
    if (!selectedPlantId || !targetTentId) {
      toast.error("Selecione uma estufa de destino");
      return;
    }
    unarchiveMutation.mutate({
      plantId: selectedPlantId,
      targetTentId: targetTentId,
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "HARVESTED":
        return <CheckCircle className="w-4 h-4" />;
      case "DISCARDED":
        return <XCircle className="w-4 h-4" />;
      case "DEAD":
        return <Skull className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "HARVESTED":
        return "Colhida";
      case "DISCARDED":
        return "Descartada";
      case "DEAD":
        return "Morta";
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "HARVESTED":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "DISCARDED":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
      case "DEAD":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  const stats = {
    total: archivedPlants?.length || 0,
    harvested: archivedPlants?.filter((p) => p.status === "HARVESTED").length || 0,
    discarded: archivedPlants?.filter((p) => p.status === "DISCARDED").length || 0,
    dead: archivedPlants?.filter((p) => p.status === "DEAD").length || 0,
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" asChild>
                <Link href="/plants">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              </Button>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-500 to-gray-700 flex items-center justify-center shadow-lg">
                <Archive className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">Arquivo de Plantas</h1>
                <p className="text-sm text-muted-foreground">
                  Plantas colhidas, descartadas e mortas
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total</CardDescription>
              <CardTitle className="text-3xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-1">
                <CheckCircle className="w-4 h-4 text-green-600" />
                Colhidas
              </CardDescription>
              <CardTitle className="text-3xl text-green-600">{stats.harvested}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-1">
                <XCircle className="w-4 h-4 text-orange-600" />
                Descartadas
              </CardDescription>
              <CardTitle className="text-3xl text-orange-600">{stats.discarded}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-1">
                <Skull className="w-4 h-4 text-red-600" />
                Mortas
              </CardDescription>
              <CardTitle className="text-3xl text-red-600">{stats.dead}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filter */}
        <div className="mb-6">
          <Select
            value={statusFilter || "all"}
            onValueChange={(value) => setStatusFilter(value === "all" ? undefined : value as any)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="HARVESTED">Colhidas</SelectItem>
              <SelectItem value="DISCARDED">Descartadas</SelectItem>
              <SelectItem value="DEAD">Mortas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Plants Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : archivedPlants && archivedPlants.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {archivedPlants.map((plant) => (
              <Card key={plant.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{plant.name}</CardTitle>
                      {plant.code && (
                        <p className="text-xs text-muted-foreground font-mono mt-1">{plant.code}</p>
                      )}
                    </div>
                    <Badge className={getStatusColor(plant.status)}>
                      <span className="flex items-center gap-1">
                        {getStatusIcon(plant.status)}
                        {getStatusLabel(plant.status)}
                      </span>
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Strain */}
                  <div className="flex items-center gap-2 text-sm">
                    <Sprout className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Strain:</span>
                    <span className="font-medium">{(plant as any).strainName}</span>
                  </div>

                  {/* Tent */}
                  {(plant as any).tentName && (
                    <div className="flex items-center gap-2 text-sm">
                      <Home className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Estufa:</span>
                      <span className="font-medium">{(plant as any).tentName}</span>
                    </div>
                  )}

                  {/* Finished Date */}
                  {plant.finishedAt && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Finalizada:</span>
                      <span className="font-medium">
                        {format(new Date(plant.finishedAt), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                  )}

                  {/* Harvest Weight */}
                  {(plant as any).harvestWeight && (
                    <div className="flex items-center gap-2 text-sm">
                      <Scale className="w-4 h-4 text-green-600" />
                      <span className="text-muted-foreground">Peso colhido:</span>
                      <span className="font-semibold text-green-600">{(plant as any).harvestWeight}g</span>
                    </div>
                  )}

                  {/* Finish Reason */}
                  {plant.finishReason && (
                    <div className="text-sm">
                      <p className="text-muted-foreground mb-1">Motivo:</p>
                      <p className="text-foreground italic bg-muted/50 p-2 rounded text-xs">
                        "{plant.finishReason}"
                      </p>
                    </div>
                  )}

                  {/* Harvest Notes from Cycle */}
                  {(plant as any).harvestNotes && (
                    <div className="text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground mb-1">
                        <FileText className="w-3.5 h-3.5" />
                        <span>Notas da colheita:</span>
                      </div>
                      <p className="text-foreground italic bg-muted/50 p-2 rounded text-xs">
                        "{(plant as any).harvestNotes}"
                      </p>
                    </div>
                  )}

                  {/* Photo */}
                  {plant.lastHealthPhotoUrl && (
                    <div className="mt-3">
                      <img
                        src={plant.lastHealthPhotoUrl}
                        alt={plant.name}
                        className="w-full h-32 object-cover rounded-md"
                      />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="pt-3 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleRestore(plant.id)}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Restaurar Planta
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Archive className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                Nenhuma planta arquivada encontrada
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Restore Dialog */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restaurar Planta</DialogTitle>
            <DialogDescription>
              Selecione a estufa de destino para restaurar esta planta como ACTIVE.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select
              value={targetTentId?.toString() || ""}
              onValueChange={(value) => setTargetTentId(parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma estufa" />
              </SelectTrigger>
              <SelectContent>
                {tents?.map((tent) => (
                  <SelectItem key={tent.id} value={tent.id.toString()}>
                    {tent.name} ({tent.category})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRestoreDialogOpen(false);
                setSelectedPlantId(null);
                setTargetTentId(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmRestore}
              disabled={!targetTentId || unarchiveMutation.isPending}
            >
              {unarchiveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Restaurando...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Restaurar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
