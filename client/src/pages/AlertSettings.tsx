import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, BellOff, Clock, AlertTriangle, CheckSquare, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  showNotification,
  scheduleMultipleDailyReminders,
  registerPushSubscription,
} from "@/lib/notifications";
import { PageTransition } from "@/components/PageTransition";

export default function AlertSettings() {
  const [newReminderTime, setNewReminderTime] = useState<string>("08:00");
  const [permission, setPermission] = useState<string>(getNotificationPermission());
  const [isSyncing, setIsSyncing] = useState(false);
  const cleanupRemindersRef = useRef<(() => void) | null>(null);

  // ── Fonte de verdade: banco de dados ──────────────────────────────────────
  const { data: dbSettings, isLoading, refetch } = trpc.alerts.getNotificationSettings.useQuery(
    undefined,
    { retry: false, staleTime: 0 }
  );

  const updateMutation = trpc.alerts.updateNotificationSettings.useMutation({
    onSuccess: () => refetch(),
    onError: (err: any) => toast.error(`Erro ao salvar: ${err.message}`),
  });

  // Query VAPID e mutations push
  const { data: vapidData } = trpc.push.getVapidKey.useQuery(undefined, { retry: false });
  const subscribeMutation = trpc.push.subscribe.useMutation();
  const updateReminderMutation = trpc.push.updateReminderSettings.useMutation();

  // Horários salvos no banco (fonte de verdade)
  const reminderTimes: string[] = (() => {
    try { return JSON.parse(dbSettings?.reminderTimes ?? "[]"); } catch { return []; }
  })();
  // Lembrete ativo = tem pelo menos um horário configurado
  const reminderActive = reminderTimes.length > 0;

  const alertsEnabled = dbSettings?.tempAlertsEnabled ?? true;
  const taskRemindersEnabled = dbSettings?.taskRemindersEnabled ?? true;

  // Atualizar permissão ao montar
  useEffect(() => {
    if ("Notification" in window) setPermission(Notification.permission);
  }, []);

  // Agendar lembretes locais quando os horários mudarem
  useEffect(() => {
    if (cleanupRemindersRef.current) {
      cleanupRemindersRef.current();
      cleanupRemindersRef.current = null;
    }
    if (permission === "granted" && reminderTimes.length > 0) {
      cleanupRemindersRef.current = scheduleMultipleDailyReminders(reminderTimes);
    }
    return () => {
      if (cleanupRemindersRef.current) {
        cleanupRemindersRef.current();
        cleanupRemindersRef.current = null;
      }
    };
  }, [reminderTimes, permission]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const saveTimesToDb = useCallback((times: string[]) => {
    updateMutation.mutate({ reminderTimes: JSON.stringify(times) } as any);
  }, [updateMutation]);

  // Garantir subscription push e sincronizar horários com servidor
  const syncPushWithTimes = useCallback(async (times: string[]) => {
    if (permission !== "granted") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await updateReminderMutation.mutateAsync({
          endpoint: subscription.endpoint,
          reminderEnabled: times.length > 0,
          reminderTimes: times,
        });
      } else if (vapidData?.configured && vapidData.publicKey) {
        await registerPushSubscription(
          vapidData.publicKey,
          async (sub) => {
            await subscribeMutation.mutateAsync({
              subscription: sub as any,
              reminderEnabled: times.length > 0,
              reminderTimes: times,
            });
          }
        );
      }
    } catch {
      // Silencioso — o banco já foi salvo, push é best-effort
    }
  }, [permission, vapidData, updateReminderMutation, subscribeMutation]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleRequestPermission = useCallback(async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === "granted") {
      toast.success("Notificações ativadas!");
      await showNotification("🧪 Teste - App Cultivo", {
        body: "Notificações funcionando! 🌱",
        tag: "test-notification",
      });
    } else if (result === "denied") {
      toast.error("Permissão negada. Ative nas configurações do dispositivo.");
    }
  }, []);

  const handleTestNotification = useCallback(async () => {
    await showNotification("📝 Lembrete Diário", {
      body: "Hora de registrar os dados das estufas! 🌱📊",
      tag: "test-daily-reminder",
    });
    toast.success("Notificação de teste enviada!");
  }, []);

  const handleAddReminderTime = useCallback(async () => {
    if (!newReminderTime) return;
    if (reminderTimes.includes(newReminderTime)) {
      toast.error("Este horário já está configurado");
      return;
    }
    if (permission !== "granted") {
      const result = await requestNotificationPermission();
      setPermission(result);
      if (result !== "granted") {
        toast.error("Permissão de notificação necessária para adicionar lembretes.");
        return;
      }
    }
    const newTimes = [...reminderTimes, newReminderTime].sort();
    saveTimesToDb(newTimes);
    syncPushWithTimes(newTimes);
    toast.success(`✅ Lembrete das ${newReminderTime} adicionado!`);
  }, [newReminderTime, reminderTimes, permission, saveTimesToDb, syncPushWithTimes]);

  const handleRemoveReminderTime = useCallback((index: number) => {
    const removed = reminderTimes[index];
    const newTimes = reminderTimes.filter((_, i) => i !== index);
    saveTimesToDb(newTimes);
    syncPushWithTimes(newTimes);
    toast.info(`Lembrete das ${removed} removido.`);
  }, [reminderTimes, saveTimesToDb, syncPushWithTimes]);

  const handlePresetTimes = useCallback(async () => {
    if (permission !== "granted") {
      const result = await requestNotificationPermission();
      setPermission(result);
      if (result !== "granted") {
        toast.error("Permissão de notificação necessária.");
        return;
      }
    }
    const times = ["08:00", "20:00"];
    saveTimesToDb(times);
    syncPushWithTimes(times);
    toast.success("✅ Lembretes das 8h e 20h configurados!");
  }, [permission, saveTimesToDb, syncPushWithTimes]);

  const handleToggleAlerts = useCallback((enabled: boolean) => {
    if (enabled && permission !== "granted") {
      handleRequestPermission();
      return;
    }
    updateMutation.mutate({
      tempAlertsEnabled: enabled,
      rhAlertsEnabled: enabled,
      ppfdAlertsEnabled: enabled,
      phAlertsEnabled: enabled,
    } as any);
    if (enabled) toast.success("Alertas automáticos ativados!");
    else toast.info("Alertas automáticos desativados.");
  }, [permission, updateMutation, handleRequestPermission]);

  const handleToggleTaskReminders = useCallback((enabled: boolean) => {
    if (enabled && permission !== "granted") {
      handleRequestPermission();
      return;
    }
    updateMutation.mutate({ taskRemindersEnabled: enabled } as any);
    if (enabled) toast.success("Lembretes de tarefas ativados!");
    else toast.info("Lembretes de tarefas desativados.");
  }, [permission, updateMutation, handleRequestPermission]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isNotificationSupported()) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center gap-4">
              <Button asChild variant="ghost" size="icon">
                <Link href="/settings"><ArrowLeft className="w-5 h-5" /></Link>
              </Button>
              <h1 className="text-xl font-bold">Alertas</h1>
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
                Seu navegador não suporta notificações push. Use Chrome, Firefox, Edge ou Safari.
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
                <Link href="/settings"><ArrowLeft className="w-5 h-5" /></Link>
              </Button>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-primary/15 rounded-xl flex items-center justify-center ring-1 ring-primary/20 shadow-sm flex-shrink-0">
                  <Bell className="w-4.5 h-4.5 text-primary" strokeWidth={2} />
                </div>
                <div>
                  <h1 className="text-xl font-bold">Alertas</h1>
                  <p className="text-sm text-muted-foreground">Notificações e lembretes</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6">
          <div className="max-w-2xl mx-auto space-y-5">

            {/* Permission Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bell className="w-4 h-4" />
                  Permissão de Notificações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Status:</span>
                    {permission === "granted" && <Badge variant="default" className="bg-green-600">✅ Ativado</Badge>}
                    {permission === "denied" && <Badge variant="destructive">❌ Negado</Badge>}
                    {permission === "default" && <Badge variant="secondary">⏸️ Não configurado</Badge>}
                  </div>
                  {permission !== "granted" ? (
                    <Button size="sm" onClick={handleRequestPermission}>
                      Ativar
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={handleTestNotification}>
                      Testar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Daily Reminder Card — sem toggle, horários = ativo */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock className="w-4 h-4" />
                    Lembrete Diário
                  </CardTitle>
                  {reminderActive ? (
                    <Badge variant="default" className="bg-green-600">
                      {reminderTimes.length} horário{reminderTimes.length > 1 ? "s" : ""}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Inativo</Badge>
                  )}
                </div>
                <CardDescription>
                  Adicione horários para receber lembretes de registro. Sem horários = sem notificação.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground animate-pulse">Carregando...</p>
                ) : (
                  <>
                    {/* Preset rápido */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handlePresetTimes}
                      className="w-full"
                      disabled={updateMutation.isPending}
                    >
                      ☀️ Manhã (8h) + 🌙 Noite (20h)
                    </Button>

                    {/* Horários configurados */}
                    {reminderTimes.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Horários ativos</Label>
                        {reminderTimes.map((time, index) => (
                          <div key={index} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                            <span className="font-mono font-medium text-sm">{time}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleRemoveReminderTime(index)}
                              disabled={updateMutation.isPending}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Adicionar horário */}
                    <div className="flex gap-2">
                      <Input
                        type="time"
                        value={newReminderTime}
                        onChange={(e) => setNewReminderTime(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        onClick={handleAddReminderTime}
                        disabled={updateMutation.isPending}
                        size="sm"
                        className="gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        Adicionar
                      </Button>
                    </div>

                    {reminderTimes.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-1">
                        Nenhum lembrete configurado. Adicione um horário acima.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Alerts Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="w-4 h-4" />
                  Alertas Automáticos
                </CardTitle>
                <CardDescription>
                  Notificações quando Temperatura, Umidade ou PPFD estiverem fora da faixa ideal
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Label htmlFor="alerts">Ativar alertas automáticos</Label>
                  <Switch
                    id="alerts"
                    checked={alertsEnabled}
                    onCheckedChange={handleToggleAlerts}
                    disabled={updateMutation.isPending}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Task Reminders Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckSquare className="w-4 h-4" />
                  Lembretes de Tarefas
                </CardTitle>
                <CardDescription>
                  Notificações sobre tarefas semanais pendentes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Label htmlFor="task-reminders">Ativar lembretes de tarefas</Label>
                  <Switch
                    id="task-reminders"
                    checked={taskRemindersEnabled}
                    onCheckedChange={handleToggleTaskReminders}
                    disabled={updateMutation.isPending}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Resumo */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Resumo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    {reminderActive && permission === "granted" ? (
                      <><Bell className="w-4 h-4 text-green-600" /><span className="text-green-700 dark:text-green-400 font-medium">Lembretes diários ativos ({reminderTimes.join(", ")})</span></>
                    ) : (
                      <><BellOff className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">Lembretes diários inativo{!reminderActive ? " (sem horários)" : " (sem permissão)"}</span></>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {alertsEnabled && permission === "granted" ? (
                      <><AlertTriangle className="w-4 h-4 text-orange-500" /><span className="font-medium">Alertas automáticos ativos</span></>
                    ) : (
                      <><AlertTriangle className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">Alertas automáticos desativados</span></>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {taskRemindersEnabled && permission === "granted" ? (
                      <><CheckSquare className="w-4 h-4 text-blue-500" /><span className="font-medium">Lembretes de tarefas ativos</span></>
                    ) : (
                      <><CheckSquare className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">Lembretes de tarefas desativados</span></>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-center">
              <Button asChild variant="outline">
                <Link href="/alerts/history">Ver Histórico de Alertas</Link>
              </Button>
            </div>

          </div>
        </main>
      </div>
    </PageTransition>
  );
}
