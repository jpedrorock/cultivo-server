import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Bell, ThermometerSun, Droplets, Sun, Loader2, Settings, ArrowLeft, FlaskConical, CheckCircle2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageTransition, StaggerList, ListItemAnimation } from "@/components/PageTransition";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ALERTS_PER_PAGE = 10;

export default function Alerts() {
  const [, navigate] = useLocation();
  const [selectedTentId, setSelectedTentId] = useState<number | undefined>(undefined);
  const [visibleCount, setVisibleCount] = useState(ALERTS_PER_PAGE);

  const handleSelectTent = (id: number | undefined) => {
    setSelectedTentId(id);
    setVisibleCount(ALERTS_PER_PAGE);
  };
  const utils = trpc.useUtils();

  // Marcar alerta individual como visto ao clicar
  const markAsSeen = trpc.alerts.markAsSeen.useMutation({
    onSuccess: () => {
      utils.alerts.getNewCount.invalidate();
      utils.alerts.list.invalidate();
    },
    onError: () => {
      toast.error("Erro ao marcar alerta como visto");
    },
  });

  const handleMarkAsSeen = (alertId: number, currentStatus: string) => {
    if (currentStatus !== "NEW") return; // Já está visto, não faz nada
    markAsSeen.mutate({ alertId });
  };

  // Buscar estufas
  const { data: tents, isLoading: loadingTents, isError: errorTents, refetch: refetchTents } = trpc.tents.list.useQuery();

  // Buscar alertas
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

  if (errorTents) {
    return <ErrorState fullPage onRetry={refetchTents} />;
  }

  const currentTent = tents?.find(t => t.id === selectedTentId);
  const newCount = alertList?.filter((a: any) => a.status === "NEW").length ?? 0;

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button asChild variant="ghost" size="icon">
                  <Link href="/">
                    <ArrowLeft className="w-5 h-5" />
                  </Link>
                </Button>
                <div>
                  <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Bell className="w-6 h-6 text-primary" />
                    Histórico de Alertas
                    {newCount > 0 && (
                      <Badge variant="destructive" className="text-xs px-2 py-0.5 animate-pulse">
                        {newCount} novo{newCount !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Clique em um alerta para marcá-lo como visto
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/settings">
                  <Settings className="w-4 h-4 mr-2" />
                  Configurar
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
                <Button
                  variant={selectedTentId === undefined ? "default" : "outline"}
                  onClick={() => handleSelectTent(undefined)}
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
                    onClick={() => handleSelectTent(tent.id)}
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
                    ? `${alertList.length} alerta${alertList.length !== 1 ? "s" : ""} registrado${alertList.length !== 1 ? "s" : ""} · Clique para marcar como visto`
                    : "Alertas disparados pelo sistema de monitoramento"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingAlerts ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : alertList && alertList.length > 0 ? (
                  <div className="space-y-3">
                    <StaggerList className="space-y-3">
                    {alertList.slice(0, visibleCount).map((alert: any) => {
                      const isNew = alert.status === "NEW";
                      const isPending = markAsSeen.isPending && markAsSeen.variables?.alertId === alert.id;

                      return (
                        <ListItemAnimation key={alert.id}>
                          <div
                            onClick={() => handleMarkAsSeen(alert.id, alert.status)}
                            className={cn(
                              "p-4 rounded-lg border transition-all duration-200",
                              isNew
                                ? "bg-primary/5 border-primary/20 cursor-pointer hover:bg-primary/10 hover:border-primary/40 hover:shadow-sm active:scale-[0.99]"
                                : "bg-muted/30 border-border cursor-default opacity-70"
                            )}
                            title={isNew ? "Clique para marcar como visto" : "Já visualizado"}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 flex-1">
                                {/* Ícone por métrica */}
                                {alert.metric === "TEMP" && (
                                  <div className={cn("p-2 rounded-lg shrink-0", isNew ? "bg-orange-500/15" : "bg-muted")}>
                                    <ThermometerSun className={cn("w-5 h-5", isNew ? "text-orange-600" : "text-muted-foreground")} />
                                  </div>
                                )}
                                {alert.metric === "RH" && (
                                  <div className={cn("p-2 rounded-lg shrink-0", isNew ? "bg-blue-500/15" : "bg-muted")}>
                                    <Droplets className={cn("w-5 h-5", isNew ? "text-blue-600" : "text-muted-foreground")} />
                                  </div>
                                )}
                                {alert.metric === "PPFD" && (
                                  <div className={cn("p-2 rounded-lg shrink-0", isNew ? "bg-yellow-500/15" : "bg-muted")}>
                                    <Sun className={cn("w-5 h-5", isNew ? "text-yellow-600" : "text-muted-foreground")} />
                                  </div>
                                )}
                                {alert.metric === "PH" && (
                                  <div className={cn("p-2 rounded-lg shrink-0", isNew ? "bg-purple-500/15" : "bg-muted")}>
                                    <FlaskConical className={cn("w-5 h-5", isNew ? "text-purple-600" : "text-muted-foreground")} />
                                  </div>
                                )}
                                {!["TEMP","RH","PPFD","PH"].includes(alert.metric) && (
                                  <div className="p-2 bg-muted rounded-lg shrink-0">
                                    <Bell className="w-5 h-5 text-muted-foreground" />
                                  </div>
                                )}

                                <div className="flex-1 min-w-0">
                                  <p className={cn("text-sm font-medium leading-relaxed", isNew ? "text-foreground" : "text-muted-foreground")}>
                                    {alert.message}
                                  </p>
                                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    {!selectedTentId && (
                                      <Badge variant="outline" className="text-xs">
                                        {tents?.find(t => t.id === alert.tentId)?.name ?? `Estufa #${alert.tentId}`}
                                      </Badge>
                                    )}
                                    <Badge variant="secondary" className="text-xs">
                                      {alert.turn === "AM" ? "Manhã" : "Tarde"}
                                    </Badge>
                                    <Badge
                                      variant={isNew ? "destructive" : "outline"}
                                      className="text-xs"
                                    >
                                      {isNew ? "● Novo" : "✓ Visto"}
                                    </Badge>
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

                              {/* Ícone de check ao clicar */}
                              <div className="shrink-0 mt-1">
                                {isPending ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                ) : isNew ? (
                                  <CheckCircle2 className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4 text-primary/60" />
                                )}
                              </div>
                            </div>
                          </div>
                        </ListItemAnimation>
                      );
                    })}
                  </StaggerList>
                  {visibleCount < alertList.length && (
                    <div className="pt-2 text-center">
                      <p className="text-xs text-muted-foreground mb-2">
                        Mostrando {visibleCount} de {alertList.length} alertas
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVisibleCount(v => v + ALERTS_PER_PAGE)}
                      >
                        Ver mais {Math.min(ALERTS_PER_PAGE, alertList.length - visibleCount)}
                      </Button>
                    </div>
                  )}
                  </div>
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
