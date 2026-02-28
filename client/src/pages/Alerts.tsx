import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Bell, ThermometerSun, Droplets, Sun, Loader2, Settings, ArrowLeft, FlaskConical } from "lucide-react";
import { Link, useLocation } from "wouter";
import { EmptyState } from "@/components/EmptyState";
import { PageTransition, StaggerList, ListItemAnimation } from "@/components/PageTransition";

export default function Alerts() {
  const [, navigate] = useLocation();
  const [selectedTentId, setSelectedTentId] = useState<number | undefined>(undefined);
  const utils = trpc.useUtils();

  // Marcar todos os alertas como lidos ao entrar na página
  const markAllAsSeen = trpc.alerts.markAllAsSeen.useMutation({
    onSuccess: () => {
      utils.alerts.getNewCount.invalidate();
      utils.alerts.list.invalidate();
    },
  });

  useEffect(() => {
    markAllAsSeen.mutate({});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Buscar estufas
  const { data: tents, isLoading: loadingTents } = trpc.tents.list.useQuery();

  // Buscar alertas (usa tabela alerts, não alertHistory)
  const { data: alertList, isLoading: loadingAlerts } = trpc.alerts.list.useQuery(
    { tentId: selectedTentId },
    { enabled: true }
  );

  if (loadingTents) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentTent = tents?.find(t => t.id === selectedTentId);

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button asChild variant="ghost" size="icon">
                  <Link href="/">
                    <ArrowLeft className="w-5 h-5" />
                  </Link>
                </Button>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Histórico de Alertas</h1>
                  <p className="text-sm text-muted-foreground">
                    Visualize todos os alertas disparados pelo sistema
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/settings">
                  <Settings className="w-4 h-4 mr-2" />
                  Configurar Alertas
                </Link>
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Seletor de Estufa */}
            <div>
              <Label className="text-base font-medium mb-3 block">Filtrar por Estufa</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Opção "Todas" */}
                <Button
                  variant={selectedTentId === undefined ? "default" : "outline"}
                  onClick={() => setSelectedTentId(undefined)}
                  className="h-auto py-3 justify-start"
                >
                  <div className="text-left">
                    <div className="font-semibold">Todas</div>
                    <div className="text-xs opacity-80">Todas as estufas</div>
                  </div>
                </Button>
                {tents?.map((tent) => (
                  <Button
                    key={tent.id}
                    variant={selectedTentId === tent.id ? "default" : "outline"}
                    onClick={() => setSelectedTentId(tent.id)}
                    className="h-auto py-3 justify-start"
                  >
                    <div className="text-left">
                      <div className="font-semibold">{tent.name}</div>
                      <div className="text-xs opacity-80">
                        {tent.category === 'MAINTENANCE' ? 'Manutenção' :
                         tent.category === 'VEGA' ? 'Vegetativa' :
                         tent.category === 'FLORA' ? 'Floração' :
                         tent.category === 'DRYING' ? 'Secagem' : tent.category}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>

            {/* Lista de Alertas */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-primary" />
                  {selectedTentId && currentTent
                    ? `Alertas — ${currentTent.name}`
                    : "Todos os Alertas"}
                </CardTitle>
                <CardDescription>
                  {alertList?.length
                    ? `${alertList.length} alerta${alertList.length !== 1 ? "s" : ""} registrado${alertList.length !== 1 ? "s" : ""}`
                    : "Alertas disparados pelo sistema de monitoramento"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingAlerts ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : alertList && alertList.length > 0 ? (
                  <StaggerList className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                    {alertList.map((alert: any) => (
                      <ListItemAnimation key={alert.id}>
                        <div className="p-4 bg-muted/50 rounded-lg border border-border hover:bg-muted transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1">
                              {/* Ícone por métrica */}
                              {alert.metric === "TEMP" && (
                                <div className="p-2 bg-orange-500/10 rounded-lg shrink-0">
                                  <ThermometerSun className="w-5 h-5 text-orange-600" />
                                </div>
                              )}
                              {alert.metric === "RH" && (
                                <div className="p-2 bg-blue-500/10 rounded-lg shrink-0">
                                  <Droplets className="w-5 h-5 text-blue-600" />
                                </div>
                              )}
                              {alert.metric === "PPFD" && (
                                <div className="p-2 bg-yellow-500/10 rounded-lg shrink-0">
                                  <Sun className="w-5 h-5 text-yellow-600" />
                                </div>
                              )}
                              {alert.metric === "PH" && (
                                <div className="p-2 bg-purple-500/10 rounded-lg shrink-0">
                                  <FlaskConical className="w-5 h-5 text-purple-600" />
                                </div>
                              )}
                              {!["TEMP","RH","PPFD","PH"].includes(alert.metric) && (
                                <div className="p-2 bg-muted rounded-lg shrink-0">
                                  <Bell className="w-5 h-5 text-muted-foreground" />
                                </div>
                              )}

                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground leading-relaxed">
                                  {alert.message}
                                </p>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  {/* Nome da estufa */}
                                  {!selectedTentId && (
                                    <Badge variant="outline" className="text-xs">
                                      {tents?.find(t => t.id === alert.tentId)?.name ?? `Estufa #${alert.tentId}`}
                                    </Badge>
                                  )}
                                  {/* Turno */}
                                  <Badge variant="secondary" className="text-xs">
                                    {alert.turn === "AM" ? "Manhã" : "Tarde"}
                                  </Badge>
                                  {/* Status */}
                                  <Badge
                                    variant={alert.status === "NEW" ? "destructive" : "outline"}
                                    className="text-xs"
                                  >
                                    {alert.status === "NEW" ? "Novo" : "Visto"}
                                  </Badge>
                                  {/* Data */}
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(alert.createdAt).toLocaleString("pt-BR", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </ListItemAnimation>
                    ))}
                  </StaggerList>
                ) : (
                  <EmptyState
                    icon={Bell}
                    title="Nenhum alerta registrado"
                    description="Os alertas aparecerão aqui quando valores ambientais (temperatura, umidade, PPFD, pH) saírem da faixa ideal configurada para cada estufa."
                    actionLabel="Configurar Alertas"
                    onAction={() => navigate("/settings")}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </PageTransition>
  );
}
