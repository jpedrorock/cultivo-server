import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell, BellOff, Check, Smartphone, Wifi } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  showNotification,
  registerPushSubscription,
} from "@/lib/notifications";

export default function NotificationSettings() {
  const [permission, setPermission] = useState<string>(getNotificationPermission());
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [pushRegistered, setPushRegistered] = useState(false);

  // Buscar chave pública VAPID do servidor
  const { data: vapidData } = trpc.push.getVapidKey.useQuery(undefined, {
    retry: false,
  });

  // Mutation para enviar notificação de teste via servidor
  const sendTestMutation = trpc.push.sendTest.useMutation();

  // Mutation para registrar subscription
  const subscribeMutation = trpc.push.subscribe.useMutation();

  // Carregar configurações do localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('notificationSettings');
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        setAlertsEnabled(settings.alertsEnabled || false);
      } catch (e) {
        // ignorar erro de parse
      }
    }
    // Verificar se já tem subscription registrada
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushRegistered(!!sub);
        });
      });
    }
  }, []);

  const doRegisterPush = async (): Promise<boolean> => {
    if (!vapidData?.configured || !vapidData.publicKey) return false;
    return registerPushSubscription(
      vapidData.publicKey,
      async (sub) => {
        await subscribeMutation.mutateAsync({ subscription: sub as any });
      }
    );
  };

  const handleRequestPermission = async () => {
    setIsRegistering(true);
    try {
      const result = await requestNotificationPermission();
      setPermission(result);

      if (result === 'granted') {
        toast.success('Notificações ativadas!');
        // Registrar Web Push após conceder permissão
        const registered = await doRegisterPush();
        setPushRegistered(registered);
        if (registered) {
          toast.success('Push Web registrado! Notificações funcionarão em background.');
        }
      } else if (result === 'denied') {
        toast.error('Permissão negada. Ative nas configurações do navegador.');
      }
    } finally {
      setIsRegistering(false);
    }
  };

  const handleTestNotification = async () => {
    setIsTesting(true);
    try {
      // Tentar Web Push primeiro (funciona em background no iPhone)
      if (vapidData?.configured && pushRegistered) {
        await sendTestMutation.mutateAsync();
        toast.success('Notificação Push enviada pelo servidor!');
      } else {
        // Fallback: notificação local via Service Worker
        await showNotification('🧪 Notificação de Teste', {
          body: 'Se você viu isso, as notificações locais estão funcionando!',
          tag: 'test-notification',
        });
        toast.success('Notificação local enviada!');

        if (!vapidData?.configured) {
          toast.info('Para notificações em background, configure VAPID_PUBLIC_KEY no servidor.', {
            duration: 5000,
          });
        } else if (!pushRegistered) {
          toast.info('Registrando dispositivo para Push Web...', { duration: 3000 });
          const registered = await doRegisterPush();
          setPushRegistered(registered);
          if (registered) {
            toast.success('Dispositivo registrado! Teste novamente para Push em background.');
          }
        }
      }
    } catch (error: any) {
      toast.error('Erro ao enviar notificação: ' + (error?.message || 'Tente novamente'));
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveSettings = () => {
    const settings = { alertsEnabled };
    localStorage.setItem('notificationSettings', JSON.stringify(settings));
    toast.success('Configurações salvas!');
  };

  const handleToggleAlerts = (enabled: boolean) => {
    setAlertsEnabled(enabled);
    if (enabled && permission !== 'granted') {
      toast.error('Ative as notificações primeiro!');
      setAlertsEnabled(false);
    }
  };

  if (!isNotificationSupported()) {
    return (
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellOff className="w-5 h-5" />
              Notificações Não Suportadas
            </CardTitle>
            <CardDescription>
              No iPhone, adicione o app à Tela de Início via Safari para ativar notificações.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Notificações</h1>
        <p className="text-muted-foreground">
          Configure lembretes e alertas para não perder nenhum registro ou problema nas estufas
        </p>
      </div>

      {/* Status de Permissão */}
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
                {permission === 'granted' && '✅ Ativado'}
                {permission === 'denied' && '❌ Negado — ative nas configurações do navegador'}
                {permission === 'default' && '⏸️ Não configurado'}
              </p>
            </div>
            <div className="flex gap-2">
              {permission !== 'granted' && (
                <Button onClick={handleRequestPermission} disabled={isRegistering}>
                  {isRegistering ? 'Ativando...' : 'Ativar Notificações'}
                </Button>
              )}
              {permission === 'granted' && (
                <Button variant="outline" onClick={handleTestNotification} disabled={isTesting}>
                  {isTesting ? 'Enviando...' : 'Testar Notificação'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status do Web Push */}
      {permission === 'granted' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5" />
              Push Web (Background)
            </CardTitle>
            <CardDescription>
              Notificações que chegam mesmo com o app fechado — necessário para iPhone
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Servidor VAPID:</p>
                <p className="text-sm text-muted-foreground">
                  {vapidData?.configured
                    ? '✅ Configurado'
                    : '⚠️ Não configurado — adicione VAPID_PUBLIC_KEY no .env'}
                </p>
              </div>
              <Wifi className={`w-5 h-5 ${vapidData?.configured ? 'text-green-500' : 'text-muted-foreground'}`} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Dispositivo registrado:</p>
                <p className="text-sm text-muted-foreground">
                  {pushRegistered
                    ? '✅ Este dispositivo receberá notificações em background'
                    : '⏸️ Não registrado'}
                </p>
              </div>
              {!pushRegistered && vapidData?.configured && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const ok = await doRegisterPush();
                    setPushRegistered(ok);
                    if (ok) toast.success('Dispositivo registrado!');
                    else toast.error('Falha ao registrar. Tente novamente.');
                  }}
                >
                  Registrar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lembrete Diário */}
      <Card>
        <CardHeader>
          <CardTitle>Lembrete Diário</CardTitle>
          <CardDescription>
            Receba um lembrete para registrar os dados das estufas — configure múltiplos horários
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Configure múltiplos horários de lembrete diário (ex: 8h e 20h) na página de Alertas.
          </p>
          <Button asChild>
            <a href="/settings/alerts">
              Configurar Lembretes
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Alertas Automáticos */}
      <Card>
        <CardHeader>
          <CardTitle>Alertas Automáticos</CardTitle>
          <CardDescription>
            Receba notificações quando Temperatura, Umidade ou PPFD estiverem fora da faixa ideal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label htmlFor="alerts">Ativar alertas automáticos</Label>
            <Switch
              id="alerts"
              checked={alertsEnabled}
              onCheckedChange={handleToggleAlerts}
              disabled={permission !== 'granted'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Salvar */}
      <div className="flex justify-end">
        <Button onClick={handleSaveSettings} size="lg">
          <Check className="w-4 h-4 mr-2" />
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
