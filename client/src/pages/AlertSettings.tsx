import { useState, useEffect } from "react";
import { Bell, BellOff, Clock, AlertTriangle, CheckSquare, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  showNotification,
  scheduleMultipleDailyReminders,
  migrateReminderConfig,
} from "@/lib/notifications";
import { PageTransition } from "@/components/PageTransition";

interface NotificationConfig {
  dailyReminderEnabled: boolean;
  reminderTimes: string[]; // Changed from reminderTime to support multiple times
  alertsEnabled: boolean;
  taskRemindersEnabled: boolean;
}

export default function AlertSettings() {
  const [config, setConfig] = useState<NotificationConfig>({
    dailyReminderEnabled: false,
    reminderTimes: [], // Empty array by default
    alertsEnabled: false,
    taskRemindersEnabled: false,
  });
  const [newReminderTime, setNewReminderTime] = useState<string>("08:00");
  const [permission, setPermission] = useState<string>(getNotificationPermission());

  useEffect(() => {
    const saved = localStorage.getItem("notificationConfig");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migrate old format to new format
        const migrated = migrateReminderConfig(parsed);
        setConfig(migrated);
      } catch (e) {
        console.error("Error parsing notification config:", e);
      }
    }

    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("notificationConfig", JSON.stringify(config));

    if (config.dailyReminderEnabled && permission === "granted" && config.reminderTimes.length > 0) {
      scheduleMultipleDailyReminders(config.reminderTimes);
    }
  }, [config, permission]);

  const handleRequestPermission = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);

    if (result === "granted") {
      toast.success("Notificações ativadas!");
      await showNotification("🧪 Teste - App Cultivo", {
        body: "Notificações funcionando! Som e vibração ativos. 🌱",
        tag: "test-notification",
      });
    } else if (result === "denied") {
      toast.error("Permissão negada. Ative nas configurações do navegador.");
    }
  };

  const handleToggleDailyReminder = (enabled: boolean) => {
    if (enabled && permission !== "granted") {
      handleRequestPermission();
      return;
    }
    setConfig({ ...config, dailyReminderEnabled: enabled });
  };

  const handleToggleAlerts = (enabled: boolean) => {
    if (enabled && permission !== "granted") {
      handleRequestPermission();
      return;
    }
    setConfig({ ...config, alertsEnabled: enabled });
    if (enabled) {
      toast.success("Alertas automáticos ativados!");
    }
  };

  const handleToggleTaskReminders = (enabled: boolean) => {
    if (enabled && permission !== "granted") {
      handleRequestPermission();
      return;
    }
    setConfig({ ...config, taskRemindersEnabled: enabled });
    if (enabled) {
      toast.success("Lembretes de tarefas ativados!");
    }
  };

  const handleTestNotification = async () => {
    if (permission === "granted") {
      await showNotification("📝 Teste - Lembrete Diário", {
        body: "Hora de registrar os dados das estufas! 🌱📊",
        tag: "test-daily-reminder",
      });
      toast.success("Notificação de teste enviada!");
    } else {
      toast.error("Permissão de notificações necessária");
    }
  };

  if (!isNotificationSupported()) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center gap-4">
              <Button asChild variant="ghost" size="icon">
                <Link href="/settings">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Configurações de Alertas</h1>
                <p className="text-sm text-muted-foreground">Gerenciar notificações</p>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BellOff className="w-5 h-5" />
                Notificações Não Suportadas
              </CardTitle>
              <CardDescription>
                Seu navegador não suporta notificações push. Tente usar Chrome, Firefox, Edge ou Safari.
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <PageTransition>
        <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="icon">
              <Link href="/settings">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Configurações de Alertas</h1>
              <p className="text-sm text-muted-foreground">Gerenciar notificações e lembretes</p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Permission Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Permissão de Notificações
              </CardTitle>
              <CardDescription>
                Permita que o aplicativo envie notificações para seu dispositivo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Status:</p>
                  <p className="text-sm text-muted-foreground">
                    {permission === "granted" && "✅ Ativado"}
                    {permission === "denied" && "❌ Negado"}
                    {permission === "default" && "⏸️ Não configurado"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {permission !== "granted" && (
                    <Button onClick={handleRequestPermission}>
                      Ativar Notificações
                    </Button>
                  )}
                  {permission === "granted" && (
                    <Button variant="outline" onClick={handleTestNotification}>
                      Testar Notificação
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Daily Reminder Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Lembrete Diário
              </CardTitle>
              <CardDescription>
                Receba um lembrete para registrar os dados das estufas todos os dias
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="daily-reminder">Ativar lembrete diário</Label>
                <Switch
                  id="daily-reminder"
                  checked={config.dailyReminderEnabled}
                  onCheckedChange={handleToggleDailyReminder}
                  disabled={permission !== "granted"}
                />
              </div>

              {config.dailyReminderEnabled && (
                <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                  {/* Preset Button */}
                  <div className="space-y-2">
                    <Label>Configuração Rápida</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfig({ ...config, reminderTimes: ["08:00", "20:00"] })}
                      className="w-full"
                    >
                      ☀️ AM (8h) + 🌙 PM (20h)
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Aplica lembretes para turno da manhã e noite
                    </p>
                  </div>

                  {/* List of Reminder Times */}
                  <div className="space-y-2">
                    <Label>Horários Configurados ({config.reminderTimes.length})</Label>
                    {config.reminderTimes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum horário configurado</p>
                    ) : (
                      <div className="space-y-2">
                        {config.reminderTimes.map((time, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Input
                              type="time"
                              value={time}
                              onChange={(e) => {
                                const newTimes = [...config.reminderTimes];
                                newTimes[index] = e.target.value;
                                setConfig({ ...config, reminderTimes: newTimes });
                              }}
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                const newTimes = config.reminderTimes.filter((_, i) => i !== index);
                                setConfig({ ...config, reminderTimes: newTimes });
                              }}
                            >
                              Remover
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add New Reminder Time */}
                  <div className="space-y-2">
                    <Label htmlFor="new-reminder-time">Adicionar Novo Horário</Label>
                    <div className="flex gap-2">
                      <Input
                        id="new-reminder-time"
                        type="time"
                        value={newReminderTime}
                        onChange={(e) => setNewReminderTime(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        onClick={() => {
                          if (newReminderTime && !config.reminderTimes.includes(newReminderTime)) {
                            setConfig({ ...config, reminderTimes: [...config.reminderTimes, newReminderTime].sort() });
                            toast.success(`Lembrete adicionado: ${newReminderTime}`);
                          } else if (config.reminderTimes.includes(newReminderTime)) {
                            toast.error("Este horário já está configurado");
                          }
                        }}
                      >
                        Adicionar
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alerts Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Alertas Automáticos
              </CardTitle>
              <CardDescription>
                Receba notificações quando Temperatura, Umidade ou PPFD estiverem fora da faixa ideal
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label htmlFor="alerts">Ativar alertas automáticos</Label>
                <Switch
                  id="alerts"
                  checked={config.alertsEnabled}
                  onCheckedChange={handleToggleAlerts}
                  disabled={permission !== "granted"}
                />
              </div>
            </CardContent>
          </Card>

          {/* Task Reminders Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5" />
                Lembretes de Tarefas
              </CardTitle>
              <CardDescription>
                Receba notificações sobre tarefas semanais pendentes (2 dias, 1 dia e último dia da semana)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label htmlFor="task-reminders">Ativar lembretes de tarefas</Label>
                <Switch
                  id="task-reminders"
                  checked={config.taskRemindersEnabled}
                  onCheckedChange={handleToggleTaskReminders}
                  disabled={permission !== "granted"}
                />
              </div>
            </CardContent>
          </Card>

          {/* Status Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Resumo de Notificações</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  {config.dailyReminderEnabled && permission === "granted" ? (
                    <>
                      <Bell className="w-4 h-4 text-green-600" />
                      <span className="text-primary font-medium">Lembretes diários ativos</span>
                    </>
                  ) : (
                    <>
                      <BellOff className="w-4 h-4 text-gray-400" />
                      <span className="text-muted-foreground">Lembretes diários desativados</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {config.alertsEnabled && permission === "granted" ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-orange-600" />
                      <span className="text-primary font-medium">Alertas automáticos ativos</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-gray-400" />
                      <span className="text-muted-foreground">Alertas automáticos desativados</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {config.taskRemindersEnabled && permission === "granted" ? (
                    <>
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                      <span className="text-primary font-medium">Lembretes de tarefas ativos</span>
                    </>
                  ) : (
                    <>
                      <CheckSquare className="w-4 h-4 text-gray-400" />
                      <span className="text-muted-foreground">Lembretes de tarefas desativados</span>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Link to History */}
          <div className="flex justify-center">
            <Button asChild variant="outline">
              <Link href="/alerts/history">
                Ver Histórico de Alertas
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
    </PageTransition>
  );
}
