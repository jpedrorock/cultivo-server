import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle2, AlertCircle, Thermometer, Droplets, Sun, TestTube } from "lucide-react";
import { Link } from "wouter";

interface TentAlertStatus {
  tentId: number;
  tentName: string;
  alertCount: number;
  alertTypes: {
    temperature: number;
    humidity: number;
    ppfd: number;
    ph: number;
  };
}

export function AlertsWidget() {
  const { data: tents } = trpc.tents.list.useQuery();
  const { data: allAlerts } = trpc.alerts.list.useQuery({});
  
  // Agrupar alertas por estufa
  const tentAlertStatuses: TentAlertStatus[] = (tents || []).map((tent: any) => {
    const tentAlerts = (allAlerts || []).filter(
      (alert: any) => alert.tentId === tent.id && alert.status === "NEW"
    );
    
    const alertTypes = {
      temperature: tentAlerts.filter((a: any) => a.message.toLowerCase().includes("temp")).length,
      humidity: tentAlerts.filter((a: any) => a.message.toLowerCase().includes("umidade") || a.message.toLowerCase().includes("rh")).length,
      ppfd: tentAlerts.filter((a: any) => a.message.toLowerCase().includes("ppfd")).length,
      ph: tentAlerts.filter((a: any) => a.message.toLowerCase().includes("ph")).length,
    };
    
    return {
      tentId: tent.id,
      tentName: tent.name,
      alertCount: tentAlerts.length,
      alertTypes,
    };
  });
  
  // Função para determinar cor do badge
  const getBadgeColor = (count: number) => {
    if (count === 0) return "bg-green-500 text-white";
    if (count <= 3) return "bg-yellow-500 text-white";
    return "bg-red-500 text-white";
  };
  
  // Função para determinar ícone de status
  const getStatusIcon = (count: number) => {
    if (count === 0) return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    if (count <= 3) return <AlertCircle className="w-5 h-5 text-yellow-600" />;
    return <AlertTriangle className="w-5 h-5 text-red-600" />;
  };
  
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-600" />
          Status de Alertas
        </CardTitle>
        <CardDescription>Monitoramento de alertas ativos por estufa</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {tentAlertStatuses.map((status) => (
          <Link key={status.tentId} href="/alerts">
            <div className="p-4 bg-muted/50 rounded-lg border hover:border-primary/50 hover:bg-muted transition-all cursor-pointer">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  {getStatusIcon(status.alertCount)}
                  <div>
                    <h4 className="font-semibold">{status.tentName}</h4>
                    <p className="text-sm text-muted-foreground">
                      {status.alertCount === 0
                        ? "Tudo OK"
                        : `${status.alertCount} alerta${status.alertCount > 1 ? "s" : ""} ativo${status.alertCount > 1 ? "s" : ""}`}
                    </p>
                  </div>
                </div>
                
                <div className={`px-3 py-1 rounded-full font-bold text-sm ${getBadgeColor(status.alertCount)}`}>
                  {status.alertCount}
                </div>
              </div>
              
              {/* Tipos de alertas */}
              {status.alertCount > 0 && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {status.alertTypes.temperature > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 rounded text-xs">
                      <Thermometer className="w-3 h-3 text-red-600 dark:text-red-400" />
                      <span className="text-red-700 dark:text-red-300">{status.alertTypes.temperature} Temp</span>
                    </div>
                  )}
                  
                  {status.alertTypes.humidity > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded text-xs">
                      <Droplets className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                      <span className="text-blue-700 dark:text-blue-300">{status.alertTypes.humidity} RH</span>
                    </div>
                  )}
                  
                  {status.alertTypes.ppfd > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 rounded text-xs">
                      <Sun className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                      <span className="text-yellow-700 dark:text-yellow-300">{status.alertTypes.ppfd} PPFD</span>
                    </div>
                  )}
                  
                  {status.alertTypes.ph > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 rounded text-xs">
                      <TestTube className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                      <span className="text-purple-700 dark:text-purple-300">{status.alertTypes.ph} pH</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Link>
        ))}
        
        {tentAlertStatuses.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma estufa cadastrada
          </div>
        )}
        
        <Link href="/alerts">
          <div className="text-center text-sm text-primary hover:underline cursor-pointer mt-4">
            Ver todos os alertas →
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}
