import { useState, useEffect } from "react";
import { Bell, BellOff, Clock, AlertTriangle, Volume2 } from "lucide-react";
import { testSound, saveSoundConfig } from "@/lib/notificationSounds";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface NotificationConfig {
  dailyReminderEnabled: boolean;
  reminderTime: string; // HH:MM format
  alertsEnabled: boolean;
  taskRemindersEnabled: boolean;
  soundEnabled: boolean;
  soundVolume: number; // 0-1
}

export function NotificationSettings() {
  // Backend state
  const { data: backendSettings } = trpc.alerts.getNotificationSettings.useQuery();
  const updateBackendSettings = trpc.alerts.updateNotificationSettings.useMutation();
  
  // Local state
  const [config, setConfig] = useState<NotificationConfig>({
    dailyReminderEnabled: false,
    reminderTime: "18:00",
    alertsEnabled: false,
    taskRemindersEnabled: false,
    soundEnabled: true,
    soundVolume: 0.28,
  });
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    // Load saved config from localStorage
    const saved = localStorage.getItem("notificationConfig");
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch (e) {
        // If parsing fails, use defaults
        console.error("Error parsing notification config:", e);
      }
    }

    // Check current permission status
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);
  
  // Sync with backend settings
  useEffect(() => {
    if (backendSettings) {
      setConfig(prev => ({
        ...prev,
        alertsEnabled: backendSettings.tempAlertsEnabled || backendSettings.rhAlertsEnabled || backendSettings.ppfdAlertsEnabled || backendSettings.phAlertsEnabled,
        taskRemindersEnabled: backendSettings.taskRemindersEnabled,
        dailyReminderEnabled: backendSettings.dailySummaryEnabled,
        reminderTime: backendSettings.dailySummaryTime || "18:00",
      }));
    }
  }, [backendSettings]);

  useEffect(() => {
    // Save config to localStorage whenever it changes
    localStorage.setItem("notificationConfig", JSON.stringify(config));
    
    // Save sound config separately
    saveSoundConfig({ enabled: config.soundEnabled, volume: config.soundVolume });

    // Setup daily reminder if enabled
    if (config.dailyReminderEnabled && permission === "granted") {
      setupDailyReminder(config.reminderTime);
    }
    
    // Sync to backend (debounced)
    const timeoutId = setTimeout(() => {
      updateBackendSettings.mutate({
        tempAlertsEnabled: config.alertsEnabled,
        rhAlertsEnabled: config.alertsEnabled,
        ppfdAlertsEnabled: config.alertsEnabled,
        phAlertsEnabled: config.alertsEnabled,
        taskRemindersEnabled: config.taskRemindersEnabled,
        dailySummaryEnabled: config.dailyReminderEnabled,
        dailySummaryTime: config.reminderTime,
      });
    }, 1000);
    
    return () => clearTimeout(timeoutId);
  }, [config, permission]);

  const requestPermission = async () => {
    if (!("Notification" in window)) {
      toast.error("Seu navegador não suporta notificações");
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === "granted") {
        toast.success("Permissão concedida! Você receberá lembretes diários.");
        // Send a test notification with sound and vibration
        sendTestNotification();
      } else if (result === "denied") {
        toast.error("Permissão negada. Ative nas configurações do navegador.");
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      toast.error("Erro ao solicitar permissão");
    }
  };

  const setupDailyReminder = (time: string) => {
    // Clear any existing reminders
    const existingInterval = localStorage.getItem("reminderIntervalId");
    if (existingInterval) {
      clearInterval(Number(existingInterval));
    }

    // Safety check for time format
    if (!time || typeof time !== 'string' || !time.includes(':')) {
      console.error('Invalid time format:', time);
      return;
    }

    // Calculate milliseconds until next reminder
    const [hours, minutes] = time.split(":").map(Number);
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);

    // If the time has already passed today, schedule for tomorrow
    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const msUntilReminder = scheduledTime.getTime() - now.getTime();

    // Set initial timeout
    setTimeout(() => {
      sendDailyReminder();
      // Then set daily interval (24 hours)
      const intervalId = setInterval(sendDailyReminder, 24 * 60 * 60 * 1000);
      localStorage.setItem("reminderIntervalId", String(intervalId));
    }, msUntilReminder);
  };

  const sendTestNotification = () => {
    if (permission === "granted") {
      new Notification("🧪 Teste - App Cultivo", {
        body: "Notificações ativadas com sucesso! Som e vibração funcionando. 🌱",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "test-notification",
        requireInteraction: false,
      });
    }
  };

  const sendDailyReminder = () => {
    if (permission === "granted" && config.dailyReminderEnabled) {
      new Notification("📝 Lembrete - App Cultivo", {
        body: "Hora de registrar os dados das estufas! 🌱📊",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "daily-reminder",
        requireInteraction: false,
        data: { url: "/" },
      });
    }
  };

  const handleToggleDailyReminder = (enabled: boolean) => {
    if (enabled && permission !== "granted") {
      requestPermission();
      return;
    }
    setConfig({ ...config, dailyReminderEnabled: enabled });
  };

  const handleToggleAlerts = (enabled: boolean) => {
    if (enabled && permission !== "granted") {
      requestPermission();
      return;
    }
    setConfig({ ...config, alertsEnabled: enabled });
    if (enabled) {
      toast.success("Alertas automáticos ativados! Você será notificado quando Temp/RH/PPFD estiverem fora da faixa.");
    }
  };

  const handleToggleTaskReminders = (enabled: boolean) => {
    if (enabled && permission !== "granted") {
      requestPermission();
      return;
    }
    setConfig({ ...config, taskRemindersEnabled: enabled });
    if (enabled) {
      toast.success("Lembretes de tarefas ativados! Você será notificado sobre tarefas pendentes.");
    }
  };

  const handleTimeChange = (time: string) => {
    setConfig({ ...config, reminderTime: time });
  };

  const testNotification = () => {
    if (permission === "granted") {
      sendDailyReminder();
      toast.success("Notificação de teste enviada!");
    } else {
      toast.error("Permissão de notificações necessária");
    }
  };

  return (
    <div className="space-y-4">
      {/* Permission Status */}
      {permission === "default" && (
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                <Bell className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100">Ativar Notificações</h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Para receber lembretes e alertas, precisamos de permissão para enviar notificações.
                  </p>
                </div>
                <Button onClick={requestPermission} size="sm" className="bg-blue-600 hover:bg-blue-700">
                  <Bell className="w-4 h-4 mr-2" />
                  Permitir Notificações
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {permission === "denied" && (
        <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-100 dark:bg-red-900/50 rounded-lg">
                <BellOff className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 dark:text-red-100">Permissão Negada</h3>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  Para ativar, acesse as configurações do navegador e permita notificações para este site.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {permission === "granted" && (
        <>
          {/* Daily Reminder Card - Redirects to AlertSettings */}
          <Card>
            <CardHeader>
              <CardTitle>Lembrete Diário</CardTitle>
              <CardDescription>
                Receba um lembrete para registrar os dados das estufas - configure múltiplos horários
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Você pode configurar múltiplos horários de lembrete diário (por exemplo: 8h AM e 20h PM) na página de Alertas.
              </p>
              <Button asChild>
                <a href="/settings/alerts">
                  Configurar Lembretes
                </a>
              </Button>
            </CardContent>
          </Card>

          {/* Alerts Card */}
          <Card>
            <CardHeader className="pb-3">
              <label className="flex items-center justify-between gap-3 cursor-pointer min-h-[44px]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg shrink-0">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-sm sm:text-base">Alertas Automáticos</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Notificações quando Temp/RH/PPFD estiverem fora da faixa ideal
                    </CardDescription>
                  </div>
                </div>
                <Switch
                  checked={config.alertsEnabled}
                  onCheckedChange={handleToggleAlerts}
                  className="shrink-0"
                />
              </label>
            </CardHeader>
          </Card>

          {/* Task Reminders Card */}
          <Card>
            <CardHeader className="pb-3">
              <label className="flex items-center justify-between gap-3 cursor-pointer min-h-[44px]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg shrink-0">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-sm sm:text-base">Lembretes de Tarefas</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Notificações sobre tarefas pendentes no fim da semana
                    </CardDescription>
                  </div>
                </div>
                <Switch
                  checked={config.taskRemindersEnabled}
                  onCheckedChange={handleToggleTaskReminders}
                  className="shrink-0"
                />
              </label>
            </CardHeader>
          </Card>

          {/* Sound Settings Card */}
          <Card>
            <CardHeader className="pb-3">
              <label className="flex items-center justify-between gap-3 cursor-pointer min-h-[44px]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg shrink-0">
                    <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-sm sm:text-base">Sons de Notificação</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Tocar som quando receber notificações
                    </CardDescription>
                  </div>
                </div>
                <Switch
                  checked={config.soundEnabled}
                  onCheckedChange={(enabled) => setConfig({ ...config, soundEnabled: enabled })}
                  className="shrink-0"
                />
              </label>
            </CardHeader>
            {config.soundEnabled && (
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="sound-volume" className="flex items-center justify-between text-sm font-medium">
                      <span>Volume</span>
                      <span className="text-muted-foreground font-normal">{Math.round(config.soundVolume * 100)}%</span>
                    </Label>
                    <input
                      id="sound-volume"
                      type="range"
                      min="0"
                      max="100"
                      value={config.soundVolume * 100}
                      onChange={(e) => setConfig({ ...config, soundVolume: parseInt(e.target.value) / 100 })}
                      className="w-full accent-primary"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      onClick={() => testSound("daily_reminder", config.soundVolume)}
                      variant="outline"
                      size="sm"
                      className="flex-col h-auto py-3 gap-1"
                    >
                      <span className="text-xl">🔔</span>
                      <span className="text-xs">Lembrete</span>
                    </Button>
                    <Button
                      onClick={() => testSound("environment_alert", config.soundVolume)}
                      variant="outline"
                      size="sm"
                      className="flex-col h-auto py-3 gap-1"
                    >
                      <span className="text-xl">⚠️</span>
                      <span className="text-xs">Alerta</span>
                    </Button>
                    <Button
                      onClick={() => testSound("task_reminder", config.soundVolume)}
                      variant="outline"
                      size="sm"
                      className="flex-col h-auto py-3 gap-1"
                    >
                      <span className="text-xl">📋</span>
                      <span className="text-xs">Tarefa</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Test Notification Card */}
          <Card className="border-dashed">
            <CardContent className="pt-4 pb-4">
              <Button
                onClick={testNotification}
                variant="outline"
                className="w-full min-h-[48px]"
                size="lg"
              >
                <Bell className="w-4 h-4 mr-2" />
                Testar Notificação
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
