import { useState } from "react";
import { ArrowLeft, Bell, Clock, AlertTriangle, CheckSquare, Filter } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageTransition } from "@/components/PageTransition";

type AlertType = "daily_reminder" | "environment_alert" | "task_reminder" | "all";

export default function AlertHistory() {
  const [filterType, setFilterType] = useState<AlertType>("all");
  const { data: alerts, isLoading } = trpc.notifications.getHistory.useQuery();

  const filteredAlerts = alerts?.filter((alert: any) => 
    filterType === "all" || alert.type === filterType
  ) || [];

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "daily_reminder":
        return <Clock className="w-5 h-5 text-blue-600" />;
      case "environment_alert":
        return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case "task_reminder":
        return <CheckSquare className="w-5 h-5 text-green-600" />;
      default:
        return <Bell className="w-5 h-5 text-gray-600" />;
    }
  };

  const getAlertTypeLabel = (type: string) => {
    switch (type) {
      case "daily_reminder":
        return "Lembrete Diário";
      case "environment_alert":
        return "Alerta Ambiental";
      case "task_reminder":
        return "Lembrete de Tarefa";
      default:
        return "Notificação";
    }
  };

  const getAlertTypeBadgeColor = (type: string) => {
    switch (type) {
      case "daily_reminder":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "environment_alert":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "task_reminder":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  return (
    <PageTransition>
        <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="icon">
              <Link href="/settings/alerts">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Histórico de Alertas</h1>
              <p className="text-sm text-muted-foreground">
                {filteredAlerts.length} notificação(ões) enviada(s)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={filterType} onValueChange={(value) => setFilterType(value as AlertType)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtrar por tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="daily_reminder">Lembretes Diários</SelectItem>
                  <SelectItem value="environment_alert">Alertas Ambientais</SelectItem>
                  <SelectItem value="task_reminder">Lembretes de Tarefas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-4">
          {isLoading && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Carregando histórico...</p>
              </CardContent>
            </Card>
          )}

          {!isLoading && filteredAlerts.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Bell className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">Nenhuma notificação encontrada</p>
                <p className="text-sm text-muted-foreground mb-4">
                  {filterType === "all" 
                    ? "Você ainda não recebeu nenhuma notificação."
                    : "Nenhuma notificação deste tipo foi enviada."}
                </p>
                <Button asChild variant="outline">
                  <Link href="/settings/alerts">
                    Configurar Notificações
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {!isLoading && filteredAlerts.map((alert: any) => (
            <Card key={alert.id} className={alert.isRead ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="mt-1">{getAlertIcon(alert.type)}</div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{alert.title}</CardTitle>
                        <Badge className={getAlertTypeBadgeColor(alert.type)}>
                          {getAlertTypeLabel(alert.type)}
                        </Badge>
                        {!alert.isRead && (
                          <Badge variant="default" className="bg-primary">
                            Novo
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="flex items-center gap-2 text-xs">
                        <Clock className="w-3 h-3" />
                        {format(new Date(alert.sentAt), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{alert.message}</p>
                {alert.metadata && (
                  <div className="mt-3 p-3 bg-muted/50 rounded-md">
                    <p className="text-xs font-mono text-muted-foreground">
                      {JSON.stringify(alert.metadata, null, 2)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Summary Card */}
          {!isLoading && filteredAlerts.length > 0 && (
            <Card className="bg-muted/30">
              <CardHeader>
                <CardTitle className="text-sm">Resumo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-primary">{filteredAlerts.length}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-600">
                      {filteredAlerts.filter((a: any) => a.type === "daily_reminder").length}
                    </p>
                    <p className="text-xs text-muted-foreground">Lembretes</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-orange-600">
                      {filteredAlerts.filter((a: any) => a.type === "environment_alert").length}
                    </p>
                    <p className="text-xs text-muted-foreground">Alertas</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">
                      {filteredAlerts.filter((a: any) => a.type === "task_reminder").length}
                    </p>
                    <p className="text-xs text-muted-foreground">Tarefas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
    </PageTransition>
  );
}
