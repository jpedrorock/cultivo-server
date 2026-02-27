import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Bell, ThermometerSun, Droplets, Sun, Loader2, Settings, ArrowLeft } from "lucide-react";
import { Link, useLocation } from "wouter";
import { EmptyState } from "@/components/EmptyState";
import { PageTransition, StaggerList, ListItemAnimation } from "@/components/PageTransition";

export default function Alerts() {
  const [, navigate] = useLocation();
  const [selectedTentId, setSelectedTentId] = useState<number>(1);

  // Buscar estufas
  const { data: tents, isLoading: loadingTents } = trpc.tents.list.useQuery();

  // Buscar histórico de alertas
  const { data: history, isLoading: loadingHistory } = 
    trpc.alerts.getHistory.useQuery({ tentId: selectedTentId, limit: 50 });

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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

          {/* Histórico de Alertas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Alertas - {currentTent?.name}
              </CardTitle>
              <CardDescription>
                Últimos 50 alertas disparados para esta estufa
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : history && history.length > 0 ? (
                <StaggerList className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                  {history.map((alert: any) => (
                    <ListItemAnimation key={alert.id}>
                    <div
                      className="p-4 bg-muted/50 rounded-lg border border-border hover:bg-muted transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          {alert.metric === "TEMP" && (
                            <div className="p-2 bg-orange-500/10 rounded-lg">
                              <ThermometerSun className="w-5 h-5 text-orange-600" />
                            </div>
                          )}
                          {alert.metric === "RH" && (
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                              <Droplets className="w-5 h-5 text-blue-600" />
                            </div>
                          )}
                          {alert.metric === "PPFD" && (
                            <div className="p-2 bg-yellow-500/10 rounded-lg">
                              <Sun className="w-5 h-5 text-yellow-600" />
                            </div>
                          )}
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground leading-relaxed">
                              {alert.message}
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {new Date(alert.createdAt).toLocaleString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </p>
                          </div>
                        </div>
                        {alert.notificationSent && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            ✉️ Enviado
                          </Badge>
                        )}
                      </div>
                    </div>
                    </ListItemAnimation>
                  ))}
                </StaggerList>
              ) : (
                <EmptyState
                  icon={Bell}
                  title="Nenhum alerta disparado ainda"
                  description="Os alertas aparecerão aqui quando valores ambientais (temperatura, umidade, PPFD) saírem da faixa ideal configurada para cada estufa."
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
