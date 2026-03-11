import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageTransition } from "@/components/PageTransition";

export default function StrainTargets() {
  const [, params] = useRoute("/strains/:id/targets");
  const [, setLocation] = useLocation();
  const strainId = params?.id ? parseInt(params.id) : null;

  const { data: strain, isLoading: strainLoading } = trpc.strains.getById.useQuery(
    { id: strainId! },
    { enabled: !!strainId }
  );

  const { data: targets = [], refetch } = trpc.weeklyTargets.getByStrain.useQuery(
    { strainId: strainId! },
    { enabled: !!strainId }
  );

  const createTarget = trpc.weeklyTargets.create.useMutation();

  const [editingTargets, setEditingTargets] = useState<Record<string, any>>({});

  useEffect(() => {
    if (targets.length > 0) {
      const targetsMap: Record<string, any> = {};
      targets.forEach((target) => {
        const key = `${target.phase}-${target.weekNumber}`;
        targetsMap[key] = target;
      });
      setEditingTargets(targetsMap);
    }
  }, [targets]);

  const handleSave = async (phase: string, weekNumber: number) => {
    if (!strainId) return;

    const key = `${phase}-${weekNumber}`;
    const target = editingTargets[key];

    if (!target) return;

    try {
      await createTarget.mutateAsync({
        strainId,
        phase: phase as any,
        weekNumber,
        tempMin: target.tempMin || undefined,
        tempMax: target.tempMax || undefined,
        rhMin: target.rhMin || undefined,
        rhMax: target.rhMax || undefined,
        ppfdMin: target.ppfdMin ? parseInt(target.ppfdMin) : undefined,
        ppfdMax: target.ppfdMax ? parseInt(target.ppfdMax) : undefined,
        photoperiod: target.photoperiod || undefined,
        phMin: target.phMin || undefined,
        phMax: target.phMax || undefined,
        ecMin: target.ecMin || undefined,
        ecMax: target.ecMax || undefined,
        notes: target.notes || undefined,
      });

      toast.success(`Parâmetros da Semana ${weekNumber} salvos!`);
      refetch();
    } catch (error) {
      toast.error("Erro ao salvar parâmetros");
    }
  };

  const updateTarget = (phase: string, weekNumber: number, field: string, value: any) => {
    const key = `${phase}-${weekNumber}`;
    setEditingTargets((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }));
  };

  const renderWeekForm = (phase: string, weekNumber: number) => {
    const key = `${phase}-${weekNumber}`;
    const target = editingTargets[key] || {};

    return (
      <Card key={key} className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg">Semana {weekNumber}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Temperatura */}
            <div>
              <Label>Temperatura (°C)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="text"
                  placeholder="Mín"
                  value={target.tempMin || ""}
                  onChange={(e) => updateTarget(phase, weekNumber, "tempMin", e.target.value)}
                />
                <Input
                  type="text"
                  placeholder="Máx"
                  value={target.tempMax || ""}
                  onChange={(e) => updateTarget(phase, weekNumber, "tempMax", e.target.value)}
                />
              </div>
            </div>

            {/* Umidade */}
            <div>
              <Label>Umidade (%)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="text"
                  placeholder="Mín"
                  value={target.rhMin || ""}
                  onChange={(e) => updateTarget(phase, weekNumber, "rhMin", e.target.value)}
                />
                <Input
                  type="text"
                  placeholder="Máx"
                  value={target.rhMax || ""}
                  onChange={(e) => updateTarget(phase, weekNumber, "rhMax", e.target.value)}
                />
              </div>
            </div>

            {/* PPFD */}
            <div>
              <Label>PPFD (µmol/m²/s)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  placeholder="Mín"
                  value={target.ppfdMin || ""}
                  onChange={(e) => updateTarget(phase, weekNumber, "ppfdMin", e.target.value)}
                />
                <Input
                  type="number"
                  placeholder="Máx"
                  value={target.ppfdMax || ""}
                  onChange={(e) => updateTarget(phase, weekNumber, "ppfdMax", e.target.value)}
                />
              </div>
            </div>

            {/* Fotoperíodo */}
            <div>
              <Label>Fotoperíodo</Label>
              <Input
                type="text"
                placeholder="Ex: 18/6"
                value={target.photoperiod || ""}
                onChange={(e) => updateTarget(phase, weekNumber, "photoperiod", e.target.value)}
                className="mt-1"
              />
            </div>

            {/* pH */}
            <div>
              <Label>pH</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="text"
                  placeholder="Mín"
                  value={target.phMin || ""}
                  onChange={(e) => updateTarget(phase, weekNumber, "phMin", e.target.value)}
                />
                <Input
                  type="text"
                  placeholder="Máx"
                  value={target.phMax || ""}
                  onChange={(e) => updateTarget(phase, weekNumber, "phMax", e.target.value)}
                />
              </div>
            </div>

            {/* EC */}
            <div>
              <Label>EC (mS/cm)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="text"
                  placeholder="Mín"
                  value={target.ecMin || ""}
                  onChange={(e) => updateTarget(phase, weekNumber, "ecMin", e.target.value)}
                />
                <Input
                  type="text"
                  placeholder="Máx"
                  value={target.ecMax || ""}
                  onChange={(e) => updateTarget(phase, weekNumber, "ecMax", e.target.value)}
                />
              </div>
            </div>
          </div>

          <Button
            onClick={() => handleSave(phase, weekNumber)}
            className="mt-4 w-full"
            disabled={createTarget.isPending}
          >
            {createTarget.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Save className="w-4 h-4 mr-2" />
            Salvar Semana {weekNumber}
          </Button>
        </CardContent>
      </Card>
    );
  };

  if (strainLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!strain) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Strain não encontrada</p>
          <Button onClick={() => setLocation("/manage-strains")} className="mt-4">
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <PageTransition>
        <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10 pt-safe">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setLocation("/manage-strains")}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{strain.name}</h1>
                <p className="text-sm text-muted-foreground">Parâmetros Ideais por Semana</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="VEGA" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="CLONING">Clonagem</TabsTrigger>
            <TabsTrigger value="VEGA">Vegetativa ({strain.vegaWeeks} semanas)</TabsTrigger>
            <TabsTrigger value="FLORA">Floração ({strain.floraWeeks} semanas)</TabsTrigger>
          </TabsList>

          <TabsContent value="CLONING" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Fase de Clonagem</CardTitle>
                <CardDescription>
                  Parâmetros ideais para a fase de clonagem (normalmente 1-2 semanas)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {[1, 2].map((week) => renderWeekForm("CLONING", week))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="VEGA" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Fase Vegetativa</CardTitle>
                <CardDescription>
                  Parâmetros ideais para cada semana da fase vegetativa ({strain.vegaWeeks} semanas)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {Array.from({ length: strain.vegaWeeks }, (_, i) => i + 1).map((week) =>
                  renderWeekForm("VEGA", week)
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="FLORA" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Fase de Floração</CardTitle>
                <CardDescription>
                  Parâmetros ideais para cada semana da fase de floração ({strain.floraWeeks} semanas)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {Array.from({ length: strain.floraWeeks }, (_, i) => i + 1).map((week) =>
                  renderWeekForm("FLORA", week)
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
    </PageTransition>
  );
}
