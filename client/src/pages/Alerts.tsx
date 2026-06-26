import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Bell, ThermometerSun, Droplets, Sun, Loader2, Settings, FlaskConical, CheckCircle2, Leaf } from "lucide-react";
import { Link, useLocation } from "wouter";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageHeader } from "@/components/PageHeader";
import { PageTransition, StaggerList, ListItemAnimation } from "@/components/PageTransition";
import { AlertsListSkeleton, TentFilterSkeleton } from "@/components/ListSkeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ALERTS_PER_PAGE = 10;

// Abas de filtro por tipo de alerta (o `metric` já vem do backend)
const METRIC_TABS = [
  { key: "ALL", label: "Todos" },
  { key: "TEMP", label: "Temp" },
  { key: "RH", label: "Umidade" },
  { key: "PPFD", label: "Luz" },
  { key: "PH", label: "pH" },
  { key: "HEALTH", label: "Saúde" },
] as const;

// Severidade derivada do alertType: limite de segurança = crítico; resto = atenção
function alertSeverity(a: { alertType?: string }): "CRITICAL" | "WARNING" {
  return a.alertType === "SAFETY_LIMIT" ? "CRITICAL" : "WARNING";
}

export default function Alerts() {
  const [, navigate] = useLocation();
  const [selectedTentId, setSelectedTentId] = useState<number | undefined>(undefined);
  const [metricFilter, setMetricFilter] = useState<string>("ALL");
  const [visibleCount, setVisibleCount] = useState(ALERTS_PER_PAGE);
  const [hideSeen, setHideSeen] = useState(false);

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

  // Marcar todos como vistos
  const markAllAsSeen = trpc.alerts.markAllAsSeen.useMutation({
    onSuccess: (res) => {
      utils.alerts.getNewCount.invalidate();
      utils.alerts.list.invalidate();
      toast.success(`${res.updated} alerta${res.updated !== 1 ? "s" : ""} marcado${res.updated !== 1 ? "s" : ""} como visto${res.updated !== 1 ? "s" : ""}`);
    },
    onError: () => {
      toast.error("Erro ao marcar alertas como vistos");
    },
  });

  const handleMarkAsSeen = (alertId: number, currentStatus: string) => {
    if (currentStatus !== "NEW") return; // Já está visto, não faz nada
    markAsSeen.mutate({ alertId });
  };

  // Marca o grupo inteiro (todos os repetidos novos) como visto.
  const handleMarkGroup = async (newIds: number[]) => {
    if (newIds.length === 0) return;
    await Promise.all(newIds.map((id) => markAsSeen.mutateAsync({ alertId: id })));
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
      <PageTransition>
        <div className="min-h-screen bg-background">
          <PageHeader
            backHref="/"
            title={
              <>
                <Bell className="w-5 h-5 text-primary shrink-0" />
                <span className="truncate">Histórico de Alertas</span>
              </>
            }
            subtitle="Carregando alertas…"
          />
          <main className="container mx-auto px-4 py-8">
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <Skeleton className="h-5 w-36 mb-3" />
                <TentFilterSkeleton count={4} />
              </div>
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-64" />
                </CardHeader>
                <CardContent>
                  <AlertsListSkeleton count={4} />
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </PageTransition>
    );
  }

  if (errorTents) {
    return <ErrorState fullPage onRetry={refetchTents} />;
  }

  const currentTent = tents?.find(t => t.id === selectedTentId);
  const newCount = alertList?.filter((a: any) => a.status === "NEW").length ?? 0;

  // Filtro por tipo (metric) — o dado já tem o campo; só expomos como aba.
  const filteredAlerts = (alertList ?? []).filter(
    (a: any) => metricFilter === "ALL" || a.metric === metricFilter
  );
  const metricCount = (key: string) =>
    key === "ALL" ? (alertList?.length ?? 0) : (alertList ?? []).filter((a: any) => a.metric === key).length;

  // Consolida repetidos: agrupa por estufa + métrica + tipo. A lista vem mais
  // recente primeiro, então o 1º de cada grupo é o "latest". Cada grupo vira 1
  // card com contador "N×" — evita a parede de alertas iguais.
  const groupedAlerts = useMemo(() => {
    const map = new Map<string, { key: string; latest: any; count: number; newCount: number; newIds: number[] }>();
    for (const a of filteredAlerts as any[]) {
      const key = `${a.tentId}-${a.metric}-${a.alertType}`;
      const g = map.get(key);
      if (!g) {
        map.set(key, { key, latest: a, count: 1, newCount: a.status === "NEW" ? 1 : 0, newIds: a.status === "NEW" ? [a.id] : [] });
      } else {
        g.count++;
        if (a.status === "NEW") { g.newCount++; g.newIds.push(a.id); }
      }
    }
    return [...map.values()];
  }, [filteredAlerts]);

  // "Ocultar vistos": some os grupos já totalmente vistos (limpa a visão).
  const visibleGroups = hideSeen ? groupedAlerts.filter((g) => g.newCount > 0) : groupedAlerts;

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <PageHeader
          backHref="/"
          title={
            <>
              <Bell className="w-5 h-5 text-primary shrink-0" />
              <span className="truncate">Histórico de Alertas</span>
              {newCount > 0 && (
                <Badge variant="destructive" className="text-xs px-2 py-0 h-5 animate-pulse shrink-0">
                  {newCount} novo{newCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </>
          }
          subtitle="Toque em um alerta para marcá-lo como visto"
          spacerHeight="88px"
          rightActions={
            <>
              {newCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => markAllAsSeen.mutate({ tentId: selectedTentId })}
                  disabled={markAllAsSeen.isPending}
                  className="hidden sm:inline-flex"
                >
                  {markAllAsSeen.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  )}
                  Marcar todos como vistos
                </Button>
              )}
              {newCount > 0 && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => markAllAsSeen.mutate({ tentId: selectedTentId })}
                  disabled={markAllAsSeen.isPending}
                  className="sm:hidden h-11 w-11"
                  aria-label="Marcar todos como vistos"
                >
                  {markAllAsSeen.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                </Button>
              )}
              <Button asChild variant="outline" size="icon" className="h-11 w-11" aria-label="Configurar alertas">
                <Link href="/settings">
                  <Settings className="w-4 h-4" />
                </Link>
              </Button>
            </>
          }
        />

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
                  <AlertsListSkeleton count={4} />
                ) : alertList && alertList.length > 0 ? (
                  <>
                    {/* Filtro por tipo de alerta */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {METRIC_TABS.map((t) => {
                        const c = metricCount(t.key);
                        if (t.key !== "ALL" && c === 0) return null;
                        return (
                          <button
                            key={t.key}
                            onClick={() => { setMetricFilter(t.key); setVisibleCount(ALERTS_PER_PAGE); }}
                            className={cn(
                              "text-xs px-3 py-1.5 rounded-full border transition-colors",
                              metricFilter === t.key
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border text-muted-foreground hover:bg-muted"
                            )}
                          >
                            {t.label} <span className="opacity-60">{c}</span>
                          </button>
                        );
                      })}
                      {/* Ocultar vistos — limpa a visão deixando só os novos */}
                      <button
                        onClick={() => { setHideSeen((v) => !v); setVisibleCount(ALERTS_PER_PAGE); }}
                        className={cn(
                          "text-xs px-3 py-1.5 rounded-full border transition-colors ml-auto",
                          hideSeen
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {hideSeen ? "Mostrando só novos" : "Ocultar vistos"}
                      </button>
                    </div>
                    {visibleGroups.length === 0 ? (
                      <p className="text-center text-sm text-muted-foreground py-6">Nenhum alerta desse tipo.</p>
                    ) : (
                  <div className="space-y-3">
                    <StaggerList className="space-y-3">
                    {visibleGroups.slice(0, visibleCount).map((group: any) => {
                      const alert = group.latest;
                      const isNew = group.newCount > 0;
                      const isPending = markAsSeen.isPending && group.newIds.includes(markAsSeen.variables?.alertId);

                      return (
                        <ListItemAnimation key={group.key}>
                          <div
                            onClick={() => handleMarkGroup(group.newIds)}
                            className={cn(
                              "p-4 rounded-lg border transition-all duration-200 active:scale-[0.99]",
                              isNew
                                ? "bg-primary/5 border-primary/20 cursor-pointer hover:bg-primary/10 hover:border-primary/40 hover:shadow-sm"
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
                                {alert.metric === "HEALTH" && (
                                  <div className={cn("p-2 rounded-lg shrink-0", isNew ? "bg-green-500/15" : "bg-muted")}>
                                    <Leaf className={cn("w-5 h-5", isNew ? "text-green-600" : "text-muted-foreground")} />
                                  </div>
                                )}
                                {!["TEMP","RH","PPFD","PH","HEALTH"].includes(alert.metric) && (
                                  <div className="p-2 bg-muted rounded-lg shrink-0">
                                    <Bell className="w-5 h-5 text-muted-foreground" />
                                  </div>
                                )}

                                <div className="flex-1 min-w-0">
                                  <p className={cn("text-sm font-medium leading-relaxed", isNew ? "text-foreground" : "text-muted-foreground")}>
                                    {alert.message}
                                  </p>
                                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    {/* Severidade — componente Badge unificado (design system) */}
                                    <Badge variant={alertSeverity(alert) === "CRITICAL" ? "danger" : "warning"}>
                                      {alertSeverity(alert) === "CRITICAL" ? "Crítico" : "Atenção"}
                                    </Badge>
                                    {/* Contador de repetidos consolidados */}
                                    {group.count > 1 && (
                                      <Badge variant="neutral" className="text-xs">
                                        {group.count}× {group.newCount > 0 && group.newCount < group.count ? `(${group.newCount} novos)` : ""}
                                      </Badge>
                                    )}
                                    {!selectedTentId && (
                                      <Badge variant="outline" className="text-xs">
                                        {tents?.find(t => t.id === alert.tentId)?.name ?? `Estufa #${alert.tentId}`}
                                      </Badge>
                                    )}
                                    {alert.value != null && (
                                      <Badge variant="outline" className={cn("text-xs font-mono", isNew ? "border-primary/30 text-foreground" : "")}>
                                        {alert.metric === "TEMP" ? `${parseFloat(alert.value).toFixed(1)}°C`
                                          : alert.metric === "RH" ? `${parseFloat(alert.value).toFixed(0)}%`
                                          : alert.metric === "PH" ? `pH ${parseFloat(alert.value).toFixed(1)}`
                                          : alert.metric === "PPFD" ? `${parseFloat(alert.value).toFixed(0)} μmol`
                                          : parseFloat(alert.value).toFixed(1)}
                                      </Badge>
                                    )}
                                    {alert.turn && (
                                      <Badge variant="secondary" className="text-xs">
                                        {alert.turn === "AM" ? "Manhã" : "Tarde"}
                                      </Badge>
                                    )}
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
                  {visibleCount < visibleGroups.length && (
                    <div className="pt-2 text-center">
                      <p className="text-xs text-muted-foreground mb-2">
                        Mostrando {visibleCount} de {visibleGroups.length} grupos de alerta
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVisibleCount(v => v + ALERTS_PER_PAGE)}
                      >
                        Ver mais {Math.min(ALERTS_PER_PAGE, visibleGroups.length - visibleCount)}
                      </Button>
                    </div>
                  )}
                  </div>
                    )}
                  </>
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
