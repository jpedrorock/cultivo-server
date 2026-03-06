import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, BellOff, Clock, AlertTriangle, CheckSquare, ArrowLeft, Save } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  showNotification,
  scheduleMultipleDailyReminders,
  migrateReminderConfig,
  registerPushSubscription,
} from "@/lib/notifications";
import { PageTransition } from "@/components/PageTransition";

interface NotificationConfig {
  dailyReminderEnabled: boolean;
  reminderTimes: string[];
  alertsEnabled: boolean;
  taskRemindersEnabled: boolean;
}

const DEFAULT_CONFIG: NotificationConfig = {
  dailyReminderEnabled: false,
  reminderTimes: [],
  alertsEnabled: false,
  taskRemindersEnabled: false,
};

export default function AlertSettings() {
  const [config, setConfig] = useState<NotificationConfig>(DEFAULT_CONFIG);
  const [newReminderTime, setNewReminderTime] = useState<string>("08:00");
  const [permission, setPermission] = useState<string>(getNotificationPermission());
  const [isSyncing, setIsSyncing] = useState(false);
  // Ref para controlar se já carregou do localStorage (evita salvar no primeiro render)
  const loadedRef = useRef(false);
  // Ref para o cleanup dos lembretes agendados
  const cleanupRemindersRef = useRef<(() => void) | null>(null);

  // Query para obter a chave pública VAPID do servidor
  const { data: vapidData } = trpc.push.getVapidKey.useQuery(undefined, { retry: false });

  // Mutation para registrar subscription no banco
  const subscribeMutation = trpc.push.subscribe.useMutation();

  // Mutation para sincronizar configurações de lembrete com o banco
  const updateReminderMutation = trpc.push.updateReminderSettings.useMutation();

  // Função para garantir que a subscription push está registrada no servidor
  const ensurePushSubscription = async (): Promise<string | null> => {
    if (!vapidData?.configured || !vapidData.publicKey) return null;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;

    try {
      let endpoint: string | null = null;
      await registerPushSubscription(
        vapidData.publicKey,
        async (sub) => {
          await subscribeMutation.mutateAsync({
            subscription: sub as any,
            reminderEnabled: config.dailyReminderEnabled,
            reminderTimes: config.reminderTimes,
          });
          endpoint = sub.endpoint ?? null;
        }
      );
      return endpoint;
    } catch (e) {
      console.error("[AlertSettings] Erro ao registrar subscription:", e);
      return null;
    }
  };

  // ── Carregar configurações do localStorage apenas uma vez ──────────────────
  useEffect(() => {
    const saved = localStorage.getItem("notificationConfig");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const migrated = migrateReminderConfig(parsed);
        setConfig(migrated);
      } catch (e) {
        console.error("Error parsing notification config:", e);
      }
    }
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
    loadedRef.current = true;
  }, []); // apenas uma vez

  // ── Salvar no localStorage com debounce (500ms) ───────────────────────────
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Não salvar antes de carregar
    if (!loadedRef.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      localStorage.setItem("notificationConfig", JSON.stringify(config));
    }, 500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [config]);

  // ── Agendar lembretes apenas quando os horários mudarem ───────────────────
  useEffect(() => {
    if (!loadedRef.current) return;

    // Limpar lembretes anteriores
    if (cleanupRemindersRef.current) {
      cleanupRemindersRef.current();
      cleanupRemindersRef.current = null;
    }

    if (config.dailyReminderEnabled && permission === "granted" && config.reminderTimes.length > 0) {
      cleanupRemindersRef.current = scheduleMultipleDailyReminders(config.reminderTimes);
    }

    return () => {
      if (cleanupRemindersRef.current) {
        cleanupRemindersRef.current();
        cleanupRemindersRef.current = null;
      }
    };
  }, [config.dailyReminderEnabled, config.reminderTimes, permission]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleRequestPermission = useCallback(async () => {
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
  }, []);

  const handleToggleDailyReminder = useCallback(async (enabled: boolean) => {
    if (enabled && permission !== "granted") {
      // Pede permissão e, se concedida, ativa o toggle
      const result = await requestNotificationPermission();
      setPermission(result);
      if (result === "granted") {
        toast.success("Notificações ativadas!");
        const newConfig = { ...config, dailyReminderEnabled: true };
        setConfig(newConfig);
        localStorage.setItem("notificationConfig", JSON.stringify(newConfig));
      } else if (result === "denied") {
        toast.error("Permissão negada. Ative nas configurações do navegador.");
      }
      return;
    }
    const newConfig = { ...config, dailyReminderEnabled: enabled };
    setConfig(newConfig);
    localStorage.setItem("notificationConfig", JSON.stringify(newConfig));
    if (!enabled) toast.info("Lembrete diário desativado.");
  }, [permission, config]);

  const handleToggleAlerts = useCallback((enabled: boolean) => {
    if (enabled && permission !== "granted") {
      handleRequestPermission();
      return;
    }
    const newConfig = { ...config, alertsEnabled: enabled };
    setConfig(newConfig);
    localStorage.setItem("notificationConfig", JSON.stringify(newConfig));
    if (enabled) toast.success("Alertas automáticos ativados!");
    else toast.info("Alertas automáticos desativados.");
  }, [permission, config, handleRequestPermission]);

  const handleToggleTaskReminders = useCallback((enabled: boolean) => {
    if (enabled && permission !== "granted") {
      handleRequestPermission();
      return;
    }
    const newConfig = { ...config, taskRemindersEnabled: enabled };
    setConfig(newConfig);
    localStorage.setItem("notificationConfig", JSON.stringify(newConfig));
    if (enabled) toast.success("Lembretes de tarefas ativados!");
    else toast.info("Lembretes de tarefas desativados.");
  }, [permission, config, handleRequestPermission]);

  const handleTestNotification = useCallback(async () => {
    if (permission === "granted") {
      await showNotification("📝 Teste - Lembrete Diário", {
        body: "Hora de registrar os dados das estufas! 🌱📊",
        tag: "test-daily-reminder",
      });
      toast.success("Notificação de teste enviada!");
    } else {
      toast.error("Permissão de notificações necessária");
    }
  }, [permission]);

  const handleAddReminderTime = useCallback(() => {
    if (!newReminderTime) return;
    if (config.reminderTimes.includes(newReminderTime)) {
      toast.error("Este horário já está configurado");
      return;
    }
    const newTimes = [...config.reminderTimes, newReminderTime].sort();
    const newConfig = { ...config, reminderTimes: newTimes };
    setConfig(newConfig);
    localStorage.setItem("notificationConfig", JSON.stringify(newConfig));
    toast.success(`Lembrete adicionado: ${newReminderTime}`);
  }, [newReminderTime, config]);

  const handleRemoveReminderTime = useCallback((index: number) => {
    const newTimes = config.reminderTimes.filter((_, i) => i !== index);
    const newConfig = { ...config, reminderTimes: newTimes };
    setConfig(newConfig);
    localStorage.setItem("notificationConfig", JSON.stringify(newConfig));
  }, [config]);

  const handleEditReminderTime = useCallback((index: number, value: string) => {
    setConfig((prev) => {
      const newTimes = [...prev.reminderTimes];
      newTimes[index] = value;
      return { ...prev, reminderTimes: newTimes };
    });
  }, []);
  const handlePresetTimes = useCallback(() => {
    const newConfig = { ...config, reminderTimes: ["08:00", "20:00"] };
    setConfig(newConfig);
    localStorage.setItem("notificationConfig", JSON.stringify(newConfig));
    toast.success("Horários 8h e 20h configurados!");
  }, [config]);

  // Sincronizar configurações de lembrete com o servidor (para push em background)
  const handleSyncToServer = useCallback(async () => {
    if (permission !== "granted") {
      toast.error("Ative as notificações primeiro!");
      return;
    }
    if (config.reminderTimes.length === 0 && config.dailyReminderEnabled) {
      toast.error("Adicione pelo menos um horário de lembrete!");
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Push não suportado neste navegador");
      return;
    }

    setIsSyncing(true);
    try {
      // Verificar se já existe subscription
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      let endpoint = subscription?.endpoint ?? null;

      if (!subscription) {
        // Tentar registrar automaticamente via VAPID
        if (!vapidData?.configured || !vapidData.publicKey) {
          toast.error("Servidor VAPID não configurado. Contate o suporte.");
          return;
        }
        toast.info("Registrando dispositivo para push...");
        endpoint = await ensurePushSubscription();
        if (!endpoint) {
          toast.error("Não foi possível registrar o dispositivo. Tente novamente.");
          return;
        }
      }

      // Atualizar os horários no banco
      await updateReminderMutation.mutateAsync({
        endpoint: endpoint!,
        reminderEnabled: config.dailyReminderEnabled,
        reminderTimes: config.reminderTimes,
      });

      toast.success("✅ Lembretes salvos! Você receberá notificações mesmo com o app fechado.");
    } catch (error: any) {
      toast.error(`Erro ao sincronizar: ${error?.message || "Tente novamente"}`);
    } finally {
      setIsSyncing(false);
    }
  }, [permission, config.dailyReminderEnabled, config.reminderTimes, updateReminderMutation, vapidData, ensurePushSubscription]);

  // ── Render ────────────────────────────────────────────────────────────────────────────────────

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
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-primary/15 rounded-xl flex items-center justify-center ring-1 ring-primary/20 shadow-sm flex-shrink-0">
                  <Bell className="w-4.5 h-4.5 text-primary" strokeWidth={2} />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Configurações de Alertas</h1>
                  <p className="text-sm text-muted-foreground">Gerenciar notificações</p>
                </div>
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
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-primary/15 rounded-xl flex items-center justify-center ring-1 ring-primary/20 shadow-sm flex-shrink-0">
                  <Bell className="w-4.5 h-4.5 text-primary" strokeWidth={2} />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Configurações de Alertas</h1>
                  <p className="text-sm text-muted-foreground">Gerenciar notificações e lembretes</p>
                </div>
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
                  />
                </div>
                {permission !== "granted" && (
                  <p className="text-xs text-muted-foreground">
                    Ao ativar, será solicitada permissão de notificação.
                  </p>
                )}

                {config.dailyReminderEnabled && (
                  <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                    {/* Preset Button */}
                    <div className="space-y-2">
                      <Label>Configuração Rápida</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handlePresetTimes}
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
                                onChange={(e) => handleEditReminderTime(index, e.target.value)}
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => handleRemoveReminderTime(index)}
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
                          onClick={handleAddReminderTime}
                        >
                          Adicionar
                        </Button>
                      </div>
                    </div>

                    {/* Sync to Server */}
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-2">
                        🔔 Para receber notificações mesmo com o app fechado, sincronize com o servidor:
                      </p>
                      <Button
                        type="button"
                        onClick={handleSyncToServer}
                        disabled={isSyncing}
                        className="w-full"
                        variant="default"
                      >
                        {isSyncing ? (
                          "Sincronizando..."
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-2" />
                            Salvar Lembretes no Servidor
                          </>
                        )}
                      </Button>
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
                  />
                </div>
                {permission !== "granted" && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Ao ativar, será solicitada permissão de notificação.
                  </p>
                )}
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
                  />
                </div>
                {permission !== "granted" && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Ao ativar, será solicitada permissão de notificação.
                  </p>
                )}
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
                        <span className="text-primary font-medium">
                          Lembretes diários ativos
                          {config.reminderTimes.length > 0 && ` (${config.reminderTimes.join(", ")})`}
                        </span>
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
