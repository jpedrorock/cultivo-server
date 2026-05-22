import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ThermometerSun, Droplets, Sun, ArrowLeft, Calendar, FileDown, Plus, Play, Leaf, Flower2, Wind, Trash2, AlertTriangle, Pencil, Share2, MoreVertical, Clock, Zap, TestTube, Sprout, Monitor, QrCode, FlaskConical, Wifi, WifiOff, ToggleLeft, ToggleRight, ChevronUp, ChevronDown, RefreshCw, Settings, Lightbulb, Fan, Droplet, Flame, Snowflake, Cloud, Camera } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TentIcon } from "@/components/TentIcon";
import { Link, useParams, useLocation } from "wouter";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Bar, Line } from "recharts";
import { format, subDays, differenceInHours, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageTransition } from "@/components/PageTransition";
import { PhaseConfirmDialog, type PhaseConfirmType } from "@/components/PhaseConfirmDialog";
import { SelectMotherPlantDialog } from "@/components/SelectMotherPlantDialog";
import { FinishCloningDialog } from "@/components/FinishCloningDialog";
import { PromotePhaseDialog } from "@/components/PromotePhaseDialog";
import { EditTentDialog } from "@/components/EditTentDialog";
import { EditLogDialog } from "@/components/EditLogDialog";
import { MoveToHarvestQueueDialog } from "@/components/MoveToHarvestQueueDialog";
import { PhaseBadge } from "@/components/PhaseBadge";
import { EmptyState } from "@/components/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ─── Sensor SmartLife por estufa ─────────────────────────────────────────────

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)  return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function TentSensorCard({ tentId }: { tentId: number }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: tuyaConfig } = trpc.tuya.getConfig.useQuery();
  const { data: mapping, refetch: refetchMapping } = trpc.tuya.getMappings.useQuery();
  const { data: reading, refetch: refetchReading } = trpc.tuya.getLatestReadingForTent.useQuery(
    { tentId },
    {
      // Polling reduzido pra 5min (era 60s) — Tuya Trial tem quota de 26k calls/mês
      // e camera+sensor polling juntos estavam comendo tudo em <2 semanas.
      refetchInterval: 5 * 60_000,
      refetchIntervalInBackground: false,
    }
  );
  const { data: devices = [], isLoading: devicesLoading } = trpc.tuya.listDevices.useQuery(
    undefined,
    { enabled: pickerOpen }
  );

  const tentMapping = mapping?.find(m => m.tentId === tentId);

  const saveMappings = trpc.tuya.saveMappings.useMutation({
    onSuccess: () => { refetchMapping(); refetchReading(); setPickerOpen(false); toast.success('Sensor vinculado!'); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const readNow = trpc.tuya.readNow.useMutation({
    onSuccess: () => { refetchReading(); toast.success('Leitura atualizada!'); },
    onError: (e) => toast.error(`Sensor: ${e.message}`),
  });

  const handleSelectDevice = (deviceId: string, deviceName: string) => {
    const others = (mapping ?? []).filter(m => m.tentId !== tentId);
    saveMappings.mutate([
      ...others,
      { tentId, deviceId, deviceName, enabled: true },
    ]);
  };

  const handleToggle = () => {
    if (!tentMapping) return;
    const others = (mapping ?? []).filter(m => m.tentId !== tentId);
    saveMappings.mutate([
      ...others,
      { ...tentMapping, enabled: !tentMapping.enabled },
    ]);
  };

  const handleRemove = () => {
    const others = (mapping ?? []).filter(m => m.tentId !== tentId);
    saveMappings.mutate(others);
  };

  // Sem credenciais Tuya configuradas
  if (!tuyaConfig) {
    return (
      <div className="mb-4 rounded-2xl border border-dashed border-border px-4 py-3 flex items-center gap-3 bg-card/50">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Wifi className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Sensor de ambiente</p>
          <p className="text-xs text-muted-foreground">Configure as credenciais SmartLife para ativar</p>
        </div>
        <Link href="/settings/sensors">
          <button className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground font-medium transition-colors flex items-center gap-1">
            <Settings className="w-3 h-3" /> Configurar
          </button>
        </Link>
      </div>
    );
  }

  // Com credenciais mas sem sensor mapeado
  if (!tentMapping) {
    return (
      <div className="mb-4">
        {!pickerOpen ? (
          <button
            onClick={() => setPickerOpen(true)}
            className="w-full rounded-2xl border border-dashed border-border px-4 py-3 flex items-center gap-3 bg-card/50 hover:bg-muted/40 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Wifi className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Vincular sensor SmartLife</p>
              <p className="text-xs text-muted-foreground">Temperatura e umidade automáticos</p>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <p className="text-sm font-semibold">Escolher sensor</p>
              <button onClick={() => setPickerOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
            </div>
            {devicesLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" /> Buscando dispositivos...
              </div>
            ) : devices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum dispositivo encontrado</p>
            ) : (
              <div className="divide-y divide-border/50 max-h-56 overflow-y-auto">
                {(devices as any[]).map((dev: any) => (
                  <button
                    key={dev.id}
                    onClick={() => handleSelectDevice(dev.id, dev.name)}
                    disabled={saveMappings.isPending}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${dev.online ? 'bg-emerald-500/15' : 'bg-muted'}`}>
                      {dev.online ? <Wifi className="w-4 h-4 text-emerald-500" /> : <WifiOff className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{dev.name}</p>
                      <p className="text-xs text-muted-foreground">{dev.online ? 'Online' : 'Offline'}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Com sensor mapeado — mostra status
  const isEnabled = tentMapping.enabled;
  const hasReading = reading && reading.tempC != null;

  return (
    <div className={`mb-4 rounded-2xl border px-4 py-3 flex items-center gap-3 transition-colors ${
      isEnabled && hasReading
        ? 'bg-emerald-500/5 border-emerald-500/20'
        : 'bg-card/50 border-border'
    }`}>
      {/* Ícone */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
        isEnabled && hasReading ? 'bg-emerald-500/15' : 'bg-muted'
      }`}>
        {isEnabled && hasReading
          ? <Wifi className="w-5 h-5 text-emerald-500" />
          : <WifiOff className="w-5 h-5 text-muted-foreground" />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground truncate">{tentMapping.deviceName}</p>
          {isEnabled && hasReading && reading.isFresh && (
            <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-emerald-500 text-white font-bold">AO VIVO</span>
          )}
        </div>
        {isEnabled && hasReading ? (
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-foreground font-medium flex items-center gap-1">
              <ThermometerSun className="w-3 h-3 text-orange-400" />
              {reading.tempC}°C
            </span>
            <span className="text-xs text-foreground font-medium flex items-center gap-1">
              <Droplets className="w-3 h-3 text-blue-400" />
              {reading.rhPct}%
            </span>
            <span className="text-xs text-muted-foreground">{timeAgo(reading.readAt)}</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5">
            {!isEnabled ? 'Leitura automática desativada' : 'Aguardando primeira leitura...'}
          </p>
        )}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2 shrink-0">
        {isEnabled && (
          <button
            onClick={() => readNow.mutate({ tentId })}
            disabled={readNow.isPending}
            className="w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors disabled:opacity-40"
            title="Atualizar agora"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${readNow.isPending ? 'animate-spin' : ''}`} />
          </button>
        )}
        <button
          onClick={handleToggle}
          disabled={saveMappings.isPending}
          title={isEnabled ? 'Desativar sensor' : 'Ativar sensor'}
        >
          {isEnabled
            ? <ToggleRight className="w-8 h-8 text-emerald-500" />
            : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
        </button>
        <button
          onClick={handleRemove}
          disabled={saveMappings.isPending}
          className="w-8 h-8 rounded-lg hover:bg-red-500/10 flex items-center justify-center transition-colors"
          title="Remover sensor"
        >
          <WifiOff className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
        </button>
      </div>
    </div>
  );
}

// ─── Cenas + Devices vinculados a estufa (mostra no display ESP32) ──────────

const ICON_HINT_LABELS: Record<string, string> = {
  light: 'Luz',
  fan: 'Ventilador / Exaustor',
  pump: 'Bomba / Rega',
  heater: 'Aquecedor',
  ac: 'Ar-condicionado',
  humidifier: 'Umidificador',
  dehumidifier: 'Desumidificador',
  co2: 'CO₂',
  schedule: 'Agendado / Timer',
  refresh: 'Sensor / Atualizar',
  camera: 'Câmera',
  other: 'Outro',
};

const ICON_HINT_COMPONENTS: Record<string, React.ComponentType<{ className?: string }>> = {
  light: Lightbulb,
  fan: Fan,
  pump: Droplet,
  heater: Flame,
  ac: Snowflake,
  humidifier: Cloud,
  dehumidifier: Wind,
  co2: Cloud,
  schedule: Clock,        // cena programada (rega automática etc)
  refresh: RefreshCw,     // sensor / ação que atualiza dados
  camera: Camera,         // câmera IP SmartLife / Tuya (Fase 1: só identifica, sem stream)
  other: Zap,
};

/**
 * Botão de toggle pra um device Tuya vinculado à estufa.
 *
 * Usa o MESMO caminho do app web /smartlife (tuya.getDeviceCurrentStatus +
 * tuya.sendDeviceCommand) — autenticado via JWT do user logado, usa
 * getTuyaConfig(ctx.user.id). Diferente do REST /api/device/device-toggle
 * que o ESP usa.
 *
 * Vale como teste isolado: se este botão funciona mas o ESP não, sabemos
 * que o problema está no caminho REST especificamente (provavelmente cfg
 * Tuya errada selecionada, ver fix em commit 2332d5c).
 *
 * Refetch automático a cada 30s pra refletir mudanças feitas pelo SmartLife
 * ou pelo display ESP.
 */
function DeviceToggleButton({
  deviceId,
  savedSwitchCode,
}: {
  deviceId: string;
  savedSwitchCode: string | null;
}) {
  const utils = trpc.useUtils();

  // refetchOnWindowFocus garante que ao voltar pra tab a app capta mudancas
  // feitas pelo display ESP / pelo SmartLife app sem esperar o intervalo.
  // refetchInterval cobre o caso da tab ficar aberta sem foco.
  // QUOTA: Tuya Trial = 26k calls/mes. Era 30s aqui — quebrava em <2 semanas.
  const { data: status, isLoading } = trpc.tuya.getDeviceCurrentStatus.useQuery(
    { deviceId },
    {
      refetchInterval: 5 * 60_000,             // 5min (era 30s)
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      retry: false,
      staleTime: 60_000,                       // confiável por 1min (era 5s)
    }
  );

  const cmd = trpc.tuya.sendDeviceCommand.useMutation({
    onSuccess: () => {
      // Tuya as vezes leva ate ~1s pra propagar o comando. Espera, depois
      // invalida o cache da query — re-fetch global (qualquer outro componente
      // observando o mesmo deviceId tambem atualiza).
      setTimeout(() => utils.tuya.getDeviceCurrentStatus.invalidate({ deviceId }), 600);
    },
    onError: (e) => toast.error(`Toggle: ${e.message}`),
  });

  const isOn = status?.switchOn ?? false;
  const isOnline = status?.online ?? false;
  const pending = cmd.isPending;

  const handleToggle = () => {
    // Prefere switchCode descoberto live; fallback pro salvo no add()
    const code = status?.switchCode ?? savedSwitchCode ?? 'switch_1';
    cmd.mutate({ deviceId, switchCode: code, value: !isOn });
  };

  if (isLoading) {
    return (
      <div className="shrink-0 w-10 h-7 flex items-center justify-center">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isOnline) {
    return (
      <span
        title="Dispositivo offline"
        className="shrink-0 w-10 h-7 flex items-center justify-center rounded-lg bg-muted text-muted-foreground"
      >
        <WifiOff className="w-3.5 h-3.5" />
      </span>
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      title={isOn ? 'Desligar' : 'Ligar'}
      className={`shrink-0 w-10 h-7 rounded-lg flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 ${
        isOn
          ? 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30'
          : 'bg-muted text-muted-foreground hover:bg-muted-foreground/10'
      }`}
    >
      {pending
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : (isOn ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />)}
    </button>
  );
}

/**
 * Botão "▶ Disparar" pra cenas Tuya vinculadas à estufa.
 *
 * Cenas são one-shot (Tap-to-Run no Tuya) — não têm estado on/off como
 * devices. Só dispara o conjunto de ações que o user configurou no app
 * SmartLife (ex: "Modo noite": apaga luz + liga exaustor + ajusta umid).
 *
 * Mesmo path do app web (tuya.triggerScene). Feedback visual:
 * - Hover: highlight
 * - Click: spinner curto
 * - Sucesso: toast "Cena disparada"
 */
function ScenePlayButton({ sceneId, sceneName }: { sceneId: string; sceneName: string }) {
  const trigger = trpc.tuya.triggerScene.useMutation({
    onSuccess: () => toast.success(`▶ ${sceneName}`),
    onError: (e) => toast.error(`Falha ao disparar: ${e.message}`),
  });

  return (
    <button
      onClick={() => trigger.mutate({ sceneId })}
      disabled={trigger.isPending}
      title={`Disparar cena: ${sceneName}`}
      className="shrink-0 w-10 h-7 rounded-lg flex items-center justify-center bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30 transition-all active:scale-95 disabled:opacity-50"
    >
      {trigger.isPending
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Play className="w-3.5 h-3.5" />}
    </button>
  );
}

/**
 * Botão de toggle pra AUTOMATIONS (cenas programadas — diferente de Tap-to-Run).
 *
 * Automations rodam por gatilho (horário, sensor, etc) — não faz sentido
 * "disparar" elas pelo botão. Faz sentido HABILITAR/DESABILITAR a regra
 * inteira (ex: "rega automática" desabilitada quando você vai viajar).
 *
 * Exibe ícone Clock (representa schedule) com cor por estado:
 * - Ativa: blue (azul como ⏰ ativo)
 * - Inativa: cinza
 * - Desconhecido (Tuya não retornou estado): outline cinza com "?"
 */
function AutomationToggleButton({ automationId, automationName }: { automationId: string; automationName: string }) {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.tuya.getAutomationEnabled.useQuery(
    { automationId },
    { refetchInterval: 5 * 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, retry: false, staleTime: 2 * 60_000 }
  );

  const toggle = trpc.tuya.toggleAutomation.useMutation({
    onSuccess: ({ enabled }) => {
      toast.success(`⏰ ${automationName} ${enabled ? 'ativada' : 'pausada'}`);
      setTimeout(() => utils.tuya.getAutomationEnabled.invalidate({ automationId }), 600);
    },
    onError: (e) => toast.error(`Falha: ${e.message}`),
  });

  const isEnabled = data?.enabled;
  const pending = toggle.isPending;

  if (isLoading) {
    return (
      <div className="shrink-0 w-10 h-7 flex items-center justify-center">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Tuya não retornou estado — mostra botão neutral, click tenta habilitar
  if (isEnabled === null || isEnabled === undefined) {
    return (
      <button
        onClick={() => toggle.mutate({ automationId, enabled: true })}
        disabled={pending}
        title="Estado desconhecido — clicar tenta ativar"
        className="shrink-0 w-10 h-7 rounded-lg flex items-center justify-center bg-muted text-muted-foreground hover:bg-muted-foreground/10 transition-all disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
      </button>
    );
  }

  return (
    <button
      onClick={() => toggle.mutate({ automationId, enabled: !isEnabled })}
      disabled={pending}
      title={isEnabled ? 'Pausar automação' : 'Ativar automação'}
      className={`shrink-0 w-10 h-7 rounded-lg flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 ${
        isEnabled
          ? 'bg-blue-500/20 text-blue-500 hover:bg-blue-500/30'
          : 'bg-muted text-muted-foreground hover:bg-muted-foreground/10'
      }`}
    >
      {pending
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : (isEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />)}
    </button>
  );
}

// ─── Functional preview slots ────────────────────────────────────────────────
//
// Os 3 sub-componentes abaixo renderizam o slot do grid 2x3 de preview como
// um BOTÃO funcional (não mais decorativo). Click dispara a mesma ação do
// display ESP físico. Reusam exatamente os hooks tRPC dos botões da row
// (DeviceToggleButton/ScenePlayButton/AutomationToggleButton) — então
// quando uma luz é alterada num card, o outro reflete via React Query
// cache (eles compartilham a mesma query key).

interface PreviewSlotProps {
  slot: any;     // item do listItems (type:'device'|'scene', refId, name, iconHint, sceneType, switchCode)
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  iconColorClass: string;  // 'text-amber-500' / 'text-blue-500'
  ringColorClass: string;  // 'ring-amber-500/30' / 'ring-blue-500/30'
}

const SLOT_BASE = 'relative aspect-square rounded-lg ring-1 flex flex-col items-center justify-center gap-1 p-1 transition-all active:scale-95 disabled:cursor-not-allowed';

/** Slot funcional pra DEVICE — toggle on/off com state ao vivo. */
function PreviewDeviceSlot({ slot, Icon, iconColorClass, ringColorClass }: PreviewSlotProps) {
  const utils = trpc.useUtils();
  const { data: status, isLoading } = trpc.tuya.getDeviceCurrentStatus.useQuery(
    { deviceId: slot.refId },
    { refetchInterval: 5 * 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, retry: false, staleTime: 60_000 }
  );
  const cmd = trpc.tuya.sendDeviceCommand.useMutation({
    onSuccess: () => setTimeout(() => utils.tuya.getDeviceCurrentStatus.invalidate({ deviceId: slot.refId }), 600),
    onError: (e) => toast.error(`${slot.name}: ${e.message}`),
  });

  const isOn = status?.switchOn ?? false;
  const isOnline = status?.online ?? false;
  const pending = cmd.isPending;

  const handleClick = () => {
    if (!isOnline || pending) return;
    const code = status?.switchCode ?? slot.switchCode ?? 'switch_1';
    cmd.mutate({ deviceId: slot.refId, switchCode: code, value: !isOn });
  };

  // Visual: opacity reduz quando offline; ring/icon mais brilhante quando ON.
  const stateClass = !isOnline
    ? 'opacity-40 bg-muted/40'
    : isOn
      ? 'bg-blue-500/15 ring-blue-500/60'
      : 'bg-muted/40';

  return (
    <button
      onClick={handleClick}
      disabled={!isOnline || pending || isLoading}
      title={!isOnline ? `${slot.name} (offline)` : isOn ? `${slot.name} ligado — clique pra desligar` : `${slot.name} desligado — clique pra ligar`}
      className={`${SLOT_BASE} ${ringColorClass} ${stateClass}`}
    >
      {pending || isLoading ? (
        <Loader2 className={`w-4 h-4 animate-spin ${iconColorClass}`} />
      ) : (
        <Icon className={`w-4 h-4 ${isOn ? 'text-blue-400' : iconColorClass}`} />
      )}
      <p className="text-xs text-foreground font-medium leading-tight text-center line-clamp-2 px-0.5">{slot.name}</p>
    </button>
  );
}

/** Slot funcional pra SCENE one-shot — click dispara, animação curta de feedback. */
function PreviewSceneSlot({ slot, Icon, iconColorClass, ringColorClass }: PreviewSlotProps) {
  const trigger = trpc.tuya.triggerScene.useMutation({
    onSuccess: () => toast.success(`▶ ${slot.name}`),
    onError: (e) => toast.error(`Falha: ${e.message}`),
  });

  const handleClick = () => {
    if (trigger.isPending) return;
    trigger.mutate({ sceneId: slot.refId });
  };

  return (
    <button
      onClick={handleClick}
      disabled={trigger.isPending}
      title={`Disparar: ${slot.name}`}
      className={`${SLOT_BASE} ${ringColorClass} bg-muted/40 hover:bg-amber-500/10`}
    >
      {trigger.isPending
        ? <Loader2 className={`w-4 h-4 animate-spin ${iconColorClass}`} />
        : <Icon className={`w-4 h-4 ${iconColorClass}`} />}
      <p className="text-xs text-foreground font-medium leading-tight text-center line-clamp-2 px-0.5">{slot.name}</p>
    </button>
  );
}

/** Slot funcional pra AUTOMATION — toggle ativa/pausa schedule. */
function PreviewAutomationSlot({ slot, Icon, iconColorClass, ringColorClass }: PreviewSlotProps) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.tuya.getAutomationEnabled.useQuery(
    { automationId: slot.refId },
    { refetchInterval: 5 * 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, retry: false, staleTime: 2 * 60_000 }
  );
  const toggle = trpc.tuya.toggleAutomation.useMutation({
    onSuccess: ({ enabled }) => {
      toast.success(`⏰ ${slot.name} ${enabled ? 'ativada' : 'pausada'}`);
      setTimeout(() => utils.tuya.getAutomationEnabled.invalidate({ automationId: slot.refId }), 600);
    },
    onError: (e) => toast.error(`${slot.name}: ${e.message}`),
  });

  const isEnabled = data?.enabled;
  const pending = toggle.isPending;

  const handleClick = () => {
    if (pending) return;
    // null/undefined → tenta habilitar; senão inverte
    toggle.mutate({ automationId: slot.refId, enabled: !isEnabled });
  };

  const stateClass = isEnabled === true
    ? 'bg-blue-500/15 ring-blue-500/60'
    : 'bg-muted/40 opacity-70';

  return (
    <button
      onClick={handleClick}
      disabled={pending || isLoading}
      title={isEnabled ? `${slot.name} ativa — clique pra pausar` : `${slot.name} pausada — clique pra ativar`}
      className={`${SLOT_BASE} ${ringColorClass} ${stateClass}`}
    >
      {pending || isLoading ? (
        <Loader2 className={`w-4 h-4 animate-spin ${iconColorClass}`} />
      ) : (
        <Icon className={`w-4 h-4 ${iconColorClass}`} />
      )}
      <p className="text-xs text-foreground font-medium leading-tight text-center line-clamp-2 px-0.5">{slot.name}</p>
      {/* Badge ⏰ se iconHint não for já 'schedule' */}
      {slot.iconHint !== 'schedule' && (
        <span className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-blue-500/90 ring-1 ring-card flex items-center justify-center">
          <Clock className="w-2 h-2 text-white" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

function TentDisplayItemsCard({ tentId }: { tentId: number }) {
  const utils = trpc.useUtils();
  const [showSceneAdd, setShowSceneAdd] = useState(false);
  const [showDeviceAdd, setShowDeviceAdd] = useState(false);
  const [selectedSceneId, setSelectedSceneId] = useState<string>('');
  const [selectedSceneIconHint, setSelectedSceneIconHint] = useState<string>('pump'); // default droplet (rega)
  const [selectedSceneExecSec, setSelectedSceneExecSec] = useState<number>(5);  // duração padrão 5s
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [selectedIconHint, setSelectedIconHint] = useState<string>('other');

  // Lista combinada (já merged + ordenada por position)
  const { data: items = [] } = trpc.tentDisplay.listItems.useQuery({ tentId });

  // Listas globais Tuya (só busca quando user abre os dropdowns)
  const { data: allScenes = [], isLoading: scenesLoading } = trpc.tuya.listScenes.useQuery(
    undefined,
    { enabled: showSceneAdd, retry: false }
  );
  const { data: allDevices = [], isLoading: devicesLoading } = trpc.tuya.listDevices.useQuery(
    undefined,
    { enabled: showDeviceAdd, retry: false }
  );

  const linkedSceneRefIds = new Set((items as any[]).filter((i: any) => i.type === 'scene').map((i: any) => i.refId));
  const linkedDeviceRefIds = new Set((items as any[]).filter((i: any) => i.type === 'device').map((i: any) => i.refId));

  const totalCount = items.length;
  const atLimit = totalCount >= 6;

  const invalidateAll = () => {
    utils.tentDisplay.listItems.invalidate({ tentId });
    utils.tentScenes.list.invalidate({ tentId });
    utils.tentDevices.list.invalidate({ tentId });
  };

  const addScene = trpc.tentScenes.add.useMutation({
    onSuccess: () => { toast.success('Cena adicionada'); invalidateAll(); setSelectedSceneId(''); setSelectedSceneIconHint('pump'); setSelectedSceneExecSec(5); setShowSceneAdd(false); },
    onError: (e) => toast.error(e.message),
  });
  const removeScene = trpc.tentScenes.remove.useMutation({
    onSuccess: () => { invalidateAll(); toast.success('Removida'); },
    onError: (e) => toast.error(e.message),
  });
  const addDevice = trpc.tentDevices.add.useMutation({
    onSuccess: () => { toast.success('Dispositivo adicionado'); invalidateAll(); setSelectedDeviceId(''); setSelectedIconHint('other'); setShowDeviceAdd(false); },
    onError: (e) => toast.error(e.message),
  });
  const removeDevice = trpc.tentDevices.remove.useMutation({
    onSuccess: () => { invalidateAll(); toast.success('Removido'); },
    onError: (e) => toast.error(e.message),
  });
  const reorder = trpc.tentDisplay.reorder.useMutation({
    onSuccess: () => invalidateAll(),
    onError: (e) => { toast.error(`Reorder: ${e.message}`); invalidateAll(); },
  });

  const handleAddScene = () => {
    if (!selectedSceneId) return;
    const scene = (allScenes as any[]).find((s: any) => s.sceneId === selectedSceneId);
    if (!scene) return;
    // Salva o type vindo da API Tuya (homeName === 'Automações' = automation,
    // senão = scene one-shot). UI usa pra escolher botão certo: ▶ play ou ⏰ toggle.
    const type = scene.homeName === 'Automações' ? 'automation' : 'scene';
    addScene.mutate({
      tentId,
      sceneId: scene.sceneId,
      name: scene.name,
      type,
      iconHint: selectedSceneIconHint as any,
      // Duração só faz sentido pra cenas one-shot. Pra automation, manda o
      // default 5 (campo é NOT NULL no DB) — UI nem mostra o input.
      executionSec: type === 'scene' ? selectedSceneExecSec : 5,
    });
  };
  const handleAddDevice = () => {
    if (!selectedDeviceId) return;
    const dev = (allDevices as any[]).find((d: any) => d.id === selectedDeviceId);
    if (!dev) return;
    addDevice.mutate({ tentId, deviceId: dev.id, name: dev.name, iconHint: selectedIconHint as any });
  };

  // Move o item idx pra cima/baixo trocando position com o vizinho
  const handleMove = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const a = items[idx];
    const b = items[target];
    reorder.mutate({
      tentId,
      order: [
        { type: a.type, id: a.id, position: b.position },
        { type: b.type, id: b.id, position: a.position },
      ],
    });
  };

  const handleRemove = (item: any) => {
    if (item.type === 'scene') removeScene.mutate({ id: item.id });
    else removeDevice.mutate({ id: item.id });
  };

  // Preview do grid 2x3 (preenche slots vazios pra mostrar como vai aparecer)
  const previewSlots = Array.from({ length: 6 }, (_, i) => items[i] ?? null);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <Zap className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <CardTitle className="text-base">Cenas e controles do display</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {totalCount === 0
                  ? 'Vincule cenas e dispositivos pra aparecerem no display ESP32'
                  : `${totalCount}/6 itens — aparecem na aba "Cenas" do display`}
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pb-4">
        {/* Preview FUNCIONAL do grid 2x3 — réplica do display ESP, agora
            clicável: cada slot dispara a mesma ação que o botão da row.
            Estado (on/off pra device, enabled/disabled pra automation) sincroniza
            via React Query cache (mesmo query key dos botões da row). */}
        {totalCount > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Preview do display <span className="text-muted-foreground/50 normal-case font-normal">— clicável</span>
            </p>
            <div className="rounded-xl border border-border/60 bg-background/60 p-2.5">
              <div className="grid grid-cols-3 gap-1.5">
                {previewSlots.map((slot: any, i) => {
                  if (!slot) return (
                    <div key={i} className="aspect-square rounded-lg border border-dashed border-border/40 bg-muted/20" />
                  );
                  // Mesma lógica de fallback da row: cena sem hint → 'pump' (gota),
                  // device sem hint → 'other' (raio).
                  const isSceneSlot = slot.type === 'scene';
                  const sceneDefault = isSceneSlot ? 'pump' : 'other';
                  const Icon = ICON_HINT_COMPONENTS[slot.iconHint ?? sceneDefault] ?? Zap;
                  const ringColor = isSceneSlot ? 'ring-amber-500/30' : 'ring-blue-500/30';
                  const iconColor = isSceneSlot ? 'text-amber-500' : 'text-blue-500';
                  const isAutomationSlot = isSceneSlot && slot.sceneType === 'automation';

                  // Despacha pro componente certo. Cada um tem seus próprios
                  // hooks tRPC (queries + mutations) — React Query cache faz a
                  // sync com a row.
                  if (slot.type === 'device') {
                    // Câmera removida da UI — feature comia ~43k API calls/mes da Tuya Trial.
                    // Devices com iconHint='camera' agora viram toggle comum (raramente
                    // útil — usuário tira camera do mapeamento se quiser sumir).
                    return <PreviewDeviceSlot key={i} slot={slot} Icon={Icon} iconColorClass={iconColor} ringColorClass={ringColor} />;
                  }
                  if (isAutomationSlot) {
                    return <PreviewAutomationSlot key={i} slot={slot} Icon={Icon} iconColorClass={iconColor} ringColorClass={ringColor} />;
                  }
                  return <PreviewSceneSlot key={i} slot={slot} Icon={Icon} iconColorClass={iconColor} ringColorClass={ringColor} />;
                })}
              </div>
            </div>
          </div>
        )}

        {/* Lista combinada com ↑↓ */}
        {totalCount > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Itens vinculados</p>
            {(items as any[]).map((item: any, idx: number) => {
              const isScene = item.type === 'scene';
              // Cenas e devices ambos usam iconHint salvo (ICON_HINT_COMPONENTS).
              // Cenas sem hint caem em pump (gota — default razoável: maioria das
              // cenas vinculadas é rega manual). Devices sem hint caem em other (Zap).
              const sceneDefault = isScene ? 'pump' : 'other';
              const Icon = ICON_HINT_COMPONENTS[item.iconHint ?? sceneDefault] ?? Zap;
              const iconBg = isScene ? 'bg-amber-500/15' : 'bg-blue-500/15';
              const iconColor = isScene ? 'text-amber-500' : 'text-blue-500';
              const isAutomation = isScene && item.sceneType === 'automation';
              return (
                <div key={`${item.type}-${item.id}`} className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-muted/40">
                  {/* Setas ↑↓ — touch targets ampliados (8x8 ao inves de 5x4)
                      Mantém ícone visualmente pequeno (3x3) mas hit area maior pra mobile. */}
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      onClick={() => handleMove(idx, -1)}
                      disabled={idx === 0 || reorder.isPending}
                      title="Mover pra cima"
                      aria-label="Mover item pra cima"
                      className="w-8 h-8 rounded-lg hover:bg-muted-foreground/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleMove(idx, 1)}
                      disabled={idx === items.length - 1 || reorder.isPending}
                      title="Mover pra baixo"
                      aria-label="Mover item pra baixo"
                      className="w-8 h-8 rounded-lg hover:bg-muted-foreground/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Container do ícone com badge Clock no canto pra automations
                      (só quando o iconHint não é 'schedule' — senão fica redundante). */}
                  <div className={`relative w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
                    {isAutomation && item.iconHint !== 'schedule' && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-500/90 ring-1 ring-card flex items-center justify-center">
                        <Clock className="w-2 h-2 text-white" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {isScene
                        ? (item.sceneType === 'automation' ? 'Automação programada' : 'Cena (one-shot)')
                        : (ICON_HINT_LABELS[item.iconHint ?? 'other'] ?? 'Dispositivo')}
                    </p>
                  </div>
                  {/* Ação inline — espelha o que aparece no display ESP32:
                      - device:     toggle on/off
                      - scene:      ▶ disparar (one-shot)
                      - automation: ⏰ toggle ativa/pausa schedule */}
                  {isScene
                    ? (item.sceneType === 'automation'
                        ? <AutomationToggleButton automationId={item.refId} automationName={item.name} />
                        : <ScenePlayButton sceneId={item.refId} sceneName={item.name} />)
                    : <DeviceToggleButton deviceId={item.refId} savedSwitchCode={item.switchCode ?? null} />
                  }
                  <button
                    onClick={() => handleRemove(item)}
                    disabled={removeScene.isPending || removeDevice.isPending}
                    className="shrink-0 w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {totalCount === 0 && !showSceneAdd && !showDeviceAdd && (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 py-6 px-4 text-center">
            <p className="text-xs text-muted-foreground">Nenhum item vinculado ainda. O display vai mostrar a lista padrão da conta.</p>
          </div>
        )}

        {/* Form: adicionar cena */}
        {showSceneAdd && (
          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
            <p className="text-xs font-semibold">Adicionar cena</p>
            {scenesLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando cenas Tuya...
              </div>
            ) : (
              <>
                <select
                  value={selectedSceneId}
                  onChange={e => setSelectedSceneId(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">— Escolha uma cena —</option>
                  {(allScenes as any[])
                    .filter((s: any) => !linkedSceneRefIds.has(s.sceneId))
                    .map((s: any) => (
                      <option key={s.sceneId} value={s.sceneId}>
                        {s.name} {s.homeName ? `(${s.homeName})` : ''}
                      </option>
                    ))}
                </select>
                {/* Dropdown de iconHint — escolhe ícone que aparece no display ESP
                    e na lista. Default 'pump' (gota) porque maioria das cenas
                    vinculadas é rega manual. */}
                <select
                  value={selectedSceneIconHint}
                  onChange={e => setSelectedSceneIconHint(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                >
                  {Object.entries(ICON_HINT_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>

                {/* Duração da cena em segundos — ESP usa pra spinner "executando".
                    Só faz sentido pra cenas one-shot (Tap-to-Run). Pra automation,
                    o tempo é controlado pela própria regra do Tuya — esconde input. */}
                {(() => {
                  const sel = (allScenes as any[]).find((s: any) => s.sceneId === selectedSceneId);
                  const isAutomation = sel?.homeName === 'Automações';
                  if (isAutomation) return null;
                  return (
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        Duração (segundos)
                        <span className="ml-1 text-muted-foreground/60">— quanto tempo o display mostra "executando"</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={600}
                        value={selectedSceneExecSec}
                        onChange={e => {
                          const v = parseInt(e.target.value, 10);
                          if (!Number.isFinite(v)) return;
                          setSelectedSceneExecSec(Math.max(1, Math.min(600, v)));
                        }}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  );
                })()}

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setShowSceneAdd(false); setSelectedSceneId(''); setSelectedSceneIconHint('pump'); setSelectedSceneExecSec(5); }}>Cancelar</Button>
                  <Button size="sm" className="flex-1" disabled={!selectedSceneId || addScene.isPending} onClick={handleAddScene}>
                    {addScene.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Adicionar'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Form: adicionar device */}
        {showDeviceAdd && (
          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
            <p className="text-xs font-semibold">Adicionar dispositivo</p>
            {devicesLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando dispositivos Tuya...
              </div>
            ) : (
              <>
                <select
                  value={selectedDeviceId}
                  onChange={e => setSelectedDeviceId(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">— Escolha um dispositivo —</option>
                  {(allDevices as any[])
                    .filter((d: any) => !linkedDeviceRefIds.has(d.id))
                    .map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.online ? '🟢' : '⚫'}
                      </option>
                    ))}
                </select>
                <select
                  value={selectedIconHint}
                  onChange={e => setSelectedIconHint(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                >
                  {Object.entries(ICON_HINT_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setShowDeviceAdd(false); setSelectedDeviceId(''); }}>Cancelar</Button>
                  <Button size="sm" className="flex-1" disabled={!selectedDeviceId || addDevice.isPending} onClick={handleAddDevice}>
                    {addDevice.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Adicionar'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Botões "+ Adicionar" — só se não estiver no limite */}
        {!atLimit && !showSceneAdd && !showDeviceAdd && (
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowSceneAdd(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Cena
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowDeviceAdd(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Dispositivo
            </Button>
          </div>
        )}

        {atLimit && (
          <p className="text-xs text-amber-500 text-center pt-1">
            Limite atingido (6 itens). Remova algum pra adicionar outro.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Pareamento ESP32 Display (RFC 8628 Device Authorization Grant) ─────────

function PairDisplayCard({ tentId }: { tentId: number }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const cleaned = code.trim().toUpperCase();
      // Aceita "MR4-K8X" ou "MR4K8X" (insere hifen no meio se faltar)
      const normalized = cleaned.includes('-') ? cleaned : (cleaned.length === 6 ? cleaned.slice(0,3) + '-' + cleaned.slice(3) : cleaned);
      const r = await fetch('/api/device/pair-claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalized, tentId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `Erro ${r.status}`);
      setSuccess(true);
      // Backend retorna replacedPrevious > 0 quando substituiu display anterior da mesma estufa.
      // Avisa user pra ele saber que o ESP antigo deixou de funcionar.
      if (data.replacedPrevious > 0) {
        toast.success(`Display "${data.deviceName}" conectado! (display anterior desconectado)`);
      } else {
        toast.success(`Display "${data.deviceName}" conectado!`);
      }
      setTimeout(() => { setOpen(false); setCode(''); setSuccess(false); }, 1500);
    } catch (e: any) {
      setError(e.message || 'Falha ao parear');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
                <Monitor className="w-4 h-4 text-violet-500" />
              </div>
              <div>
                <CardTitle className="text-base">Display ESP32</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Conecte o display físico desta estufa
                </CardDescription>
              </div>
            </div>
            <Button size="sm" onClick={() => { setOpen(true); setError(''); setSuccess(false); setCode(''); }}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Conectar
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { if (!submitting) setOpen(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar display ESP32</DialogTitle>
            <DialogDescription>
              No display, ligue o aparelho. Ele vai mostrar um código de 6 letras/números
              (exemplo: <span className="font-mono font-bold">MR4-K8X</span>). Digite aqui:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <input
              type="text"
              value={code}
              onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); }}
              placeholder="MR4-K8X"
              maxLength={7}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              disabled={submitting || success}
              className="w-full bg-muted rounded-xl px-4 py-4 text-center text-2xl font-mono font-bold tracking-widest text-foreground outline-none placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            />

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}
            {success && (
              <p className="text-sm text-emerald-500 text-center font-medium">✓ Display conectado!</p>
            )}

            <p className="text-xs text-muted-foreground text-center">
              O código vale por 10 minutos. Se expirar, é só reiniciar o display que ele gera outro.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || success || code.replace('-', '').length < 6}
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Conectando...</> : 'Conectar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function TentDetails() {
  const { id } = useParams<{ id: string }>();
  const tentId = parseInt(id || "0");

  const [dateRange, setDateRange] = useState(7); // 7, 14, 30 days

  // Estados dos modais de fase
  const [phaseConfirmOpen, setPhaseConfirmOpen] = useState(false);
  const [phaseConfirmType, setPhaseConfirmType] = useState<PhaseConfirmType>("FLORA");
  const [selectMotherOpen, setSelectMotherOpen] = useState(false);
  const [selectedMotherId, setSelectedMotherId] = useState<number | null>(null);
  const [selectedMotherName, setSelectedMotherName] = useState<string>("");
  const [selectedClonesCount] = useState<number>(10);
  const [finishCloningOpen, setFinishCloningOpen] = useState(false);
  const [promotePhaseOpen, setPromotePhaseOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editTentOpen, setEditTentOpen] = useState(false);
  const [harvestQueueOpen, setHarvestQueueOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [editLogOpen, setEditLogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<any>(null);
  const [deletingLogId, setDeletingLogId] = useState<number | null>(null);
  const [showAutoLogs, setShowAutoLogs] = useState(false);

  const openPhaseConfirm = (type: PhaseConfirmType) => {
    setPhaseConfirmType(type);
    setPhaseConfirmOpen(true);
  };

  const handlePhaseConfirmed = () => {
    setPhaseConfirmOpen(false);
    if (phaseConfirmType === "CLONING") {
      setSelectMotherOpen(true);
    } else {
      setPromotePhaseOpen(true);
    }
  };

  const utils = trpc.useUtils();
  const { data: tent, isLoading: tentLoading } = trpc.tents.getById.useQuery({ id: tentId });
  const [, navigate] = useLocation();

  const deleteMutation = trpc.tents.delete.useMutation({
    onSuccess: () => {
      toast.success("Estufa excluída com sucesso!");
      navigate("/");
    },
    onError: (error) => {
      toast.error(`Erro ao excluir: ${error.message}`);
    },
  });

  const handleDeleteConfirmed = () => {
    deleteMutation.mutate({ id: tentId });
  };

  const deleteLogMutation = trpc.dailyLogs.delete.useMutation({
    onSuccess: () => {
      utils.dailyLogs.list.invalidate({ tentId });
      setDeletingLogId(null);
      toast.success("Registro excluído!");
    },
    onError: (error) => {
      toast.error(`Erro ao excluir: ${error.message}`);
      setDeletingLogId(null);
    },
  });

  const handleDeleteLog = (logId: number) => {
    setDeletingLogId(logId);
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) deleteLogMutation.mutate({ id: logId });
    }, 5000);
    toast.info("Registro será excluído em 5 segundos", {
      duration: 5000,
      action: {
        label: "Desfazer",
        onClick: () => {
          cancelled = true;
          clearTimeout(timeoutId);
          setDeletingLogId(null);
          toast.success("Exclusão cancelada!");
        },
      },
    });
  };
  const { data: cycle } = trpc.cycles.getByTent.useQuery({ tentId });

  // Fase e semana atuais para buscar targets
  const currentPhase = cycle ? (cycle.floraStartDate ? "FLORA" : "VEGA") : null;
  const currentWeek = cycle ? (() => {
    const now = new Date();
    const start = new Date(cycle.startDate);
    if (isNaN(start.getTime())) return 1;
    const floraStart = cycle.floraStartDate ? new Date(cycle.floraStartDate) : null;
    if (floraStart && !isNaN(floraStart.getTime()) && now >= floraStart) {
      return Math.max(1, Math.floor((now.getTime() - floraStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
    }
    return Math.max(1, Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
  })() : null;

  const { data: weekTargets } = trpc.weeklyTargets.getTargetsByTent.useQuery(
    { tentId, phase: currentPhase! as any, weekNumber: currentWeek! },
    { enabled: !!cycle && !!currentPhase && !!currentWeek }
  );

  // Memoize dates to prevent infinite re-renders
  const dateFilter = useMemo(() => {
    const now = new Date();
    return {
      startDate: subDays(now, dateRange),
      endDate: now,
    };
  }, [dateRange]);

  const { data: logs, isLoading: logsLoading, isError: logsError } = trpc.dailyLogs.list.useQuery({
    tentId,
  });

  // Plants — loaded at page level so the PDF export has access
  const { data: tentPlants } = trpc.plants.list.useQuery({ tentId });

  // Filter logs by dateRange client-side for charts/averages (must be before conditional returns — Rules of Hooks)
  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter((log) => new Date(log.logDate) >= dateFilter.startDate);
  }, [logs, dateFilter.startDate]);

  // History tab logs — additionally filter out AUTO entries when showAutoLogs is false
  const historyLogs = useMemo(() => {
    if (!logs) return [];
    if (showAutoLogs) return logs;
    // Usa apenas o campo source — evitar ocultar logs manuais sem pH/EC/PPFD
    return logs.filter((log: any) => log.source !== 'AUTO');
  }, [logs, showAutoLogs]);

  if (tentLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!tent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Estufa não encontrada</p>
            <Button asChild className="mt-4">
              <Link href="/">Voltar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getPhaseInfo = () => {
    if (!cycle) {
      return { phase: "Inativo", color: "bg-muted" };
    }

    if (tent.category === "MAINTENANCE") {
      return { phase: "Manutenção", color: "bg-blue-500" };
    }

    if (cycle.floraStartDate) {
      return { phase: "Floração", color: "bg-purple-500" };
    }

    return { phase: "Vegetativa", color: "bg-primary/100" };
  };

  const phaseInfo = getPhaseInfo();

  const handlePrint = () => {
    const phase = getPhaseInfo().phase;
    const startStr = cycle ? format(new Date(cycle.startDate), "dd/MM/yyyy", { locale: ptBR }) : '—';
    const generatedAt = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    const exportLogs = filteredLogs.slice().reverse(); // ASC para a tabela

    // ── Estatísticas por parâmetro ────────────────────────────────────────
    const stat = (vals: number[]) => vals.length === 0
      ? { avg: '—', min: '—', max: '—' }
      : {
          avg: (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1),
          min: Math.min(...vals).toFixed(1),
          max: Math.max(...vals).toFixed(1),
        };

    const notNull = (v: number | null): v is number => v !== null;
    const temps  = exportLogs.map(l => l.tempC != null ? parseFloat(l.tempC)  : null).filter(notNull);
    const rhs    = exportLogs.map(l => l.rhPct  != null ? parseFloat(l.rhPct)  : null).filter(notNull);
    const ppfds  = exportLogs.map(l => l.ppfd   != null ? l.ppfd               : null).filter(notNull);
    const phs    = exportLogs.map(l => l.ph     != null ? parseFloat(l.ph)     : null).filter(notNull);
    const ecs    = exportLogs.map(l => l.ec     != null ? parseFloat(l.ec)     : null).filter(notNull);

    const sTemp  = stat(temps);
    const sRh    = stat(rhs);
    const sPpfd  = stat(ppfds);
    const sPh    = stat(phs);
    const sEc    = stat(ecs);

    // ── Plantas ───────────────────────────────────────────────────────────
    const plantRows = (tentPlants ?? []).map((p: any) => `
      <tr>
        <td>${p.name}</td>
        <td>${p.code ?? '—'}</td>
        <td>${p.plantStage ?? '—'}</td>
        <td>${p.cycleWeek != null ? `Sem ${p.cycleWeek}` : '—'}</td>
        <td>${p.status ?? '—'}</td>
      </tr>
    `).join('');

    // ── Linhas de log ─────────────────────────────────────────────────────
    const logRows = exportLogs.map((l: any) => `
      <tr>
        <td>${format(new Date(l.logDate), "dd/MM/yy HH:mm", { locale: ptBR })}</td>
        <td>${l.turn === 'AM' ? 'AM' : 'PM'}</td>
        <td>${l.tempC ?? '—'}</td>
        <td>${l.rhPct ?? '—'}</td>
        <td>${l.ppfd ?? '—'}</td>
        <td>${l.ph ?? '—'}</td>
        <td>${l.ec ?? '—'}</td>
        <td>${l.wateringVolume ? `${l.wateringVolume}ml` : '—'}</td>
        <td>${l.runoffPercentage ? `${parseFloat(l.runoffPercentage).toFixed(0)}%` : '—'}</td>
      </tr>
    `).join('');

    const statCard = (label: string, s: ReturnType<typeof stat>, unit: string) => `
      <div class="stat-card">
        <div class="stat-label">${label}</div>
        <div class="stat-avg">${s.avg}${s.avg !== '—' ? unit : ''}</div>
        <div class="stat-minmax">
          ${s.min !== '—' ? `<span>↓ ${s.min}${unit}</span><span>↑ ${s.max}${unit}</span>` : '<span style="color:#bbb">sem dados</span>'}
        </div>
      </div>`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório — ${tent.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; background: #fff; padding: 32px; font-size: 13px; }
    /* Header */
    .header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 20px; }
    .header-left h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
    .header-left .sub { color: #666; font-size: 12px; margin-top: 4px; }
    .header-right { text-align: right; font-size: 11px; color: #888; line-height: 1.6; }
    .phase-badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; background: #f3f4f6; color: #374151; }
    /* Stat cards */
    .stat-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 24px; }
    .stat-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
    .stat-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
    .stat-avg { font-size: 20px; font-weight: 700; color: #111; margin-bottom: 4px; }
    .stat-minmax { font-size: 10px; color: #6b7280; display: flex; justify-content: space-between; }
    /* Section */
    h2 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #374151; margin: 20px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    /* Tables */
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #f9fafb; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
    td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; color: #374151; }
    tr:nth-child(even) td { background: #fafafa; }
    /* Cycle info */
    .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .info-cell { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
    .info-cell .lbl { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
    .info-cell .val { font-size: 14px; font-weight: 600; margin-top: 2px; }
    /* Footer */
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #bbb; display: flex; justify-content: space-between; }
    @media print {
      body { padding: 16px; }
      .no-break { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <h1>🌱 ${tent.name}</h1>
      <div class="sub">${tent.width}×${tent.depth}×${tent.height}cm &nbsp;·&nbsp; ${tent.powerW ? tent.powerW + 'W' : ''}</div>
    </div>
    <div class="header-right">
      <div><span class="phase-badge">${phase}</span></div>
      <div style="margin-top:6px">Gerado em ${generatedAt}</div>
      <div>Período: últimos ${dateRange} dias</div>
    </div>
  </div>

  <!-- Cycle info -->
  ${cycle ? `
  <div class="info-grid">
    <div class="info-cell"><div class="lbl">Início do Ciclo</div><div class="val">${startStr}</div></div>
    <div class="info-cell"><div class="lbl">Dias de Ciclo</div><div class="val">${Math.floor((Date.now() - new Date(cycle.startDate).getTime()) / 86400000)}</div></div>
    <div class="info-cell"><div class="lbl">Status</div><div class="val">${cycle.status === 'ACTIVE' ? 'Ativo' : 'Finalizado'}</div></div>
    <div class="info-cell"><div class="lbl">Registros no período</div><div class="val">${exportLogs.length}</div></div>
  </div>` : ''}

  <!-- Stats -->
  <h2>Médias do período (${dateRange} dias)</h2>
  <div class="stat-grid">
    ${statCard('Temperatura', sTemp, '°C')}
    ${statCard('Umidade', sRh, '%')}
    ${statCard('PPFD', sPpfd, '')}
    ${statCard('pH', sPh, '')}
    ${statCard('EC', sEc, ' mS')}
  </div>

  <!-- Plants -->
  ${(tentPlants ?? []).length > 0 ? `
  <h2>Plantas (${tentPlants!.length})</h2>
  <table class="no-break">
    <thead><tr><th>Nome</th><th>Código</th><th>Estágio</th><th>Semana</th><th>Status</th></tr></thead>
    <tbody>${plantRows}</tbody>
  </table>` : ''}

  <!-- Logs table -->
  <h2>Registros diários (${exportLogs.length})</h2>
  <table>
    <thead>
      <tr>
        <th>Data/Hora</th><th>Turno</th><th>Temp °C</th><th>UR %</th>
        <th>PPFD</th><th>pH</th><th>EC</th><th>Rega</th><th>Runoff</th>
      </tr>
    </thead>
    <tbody>${logRows}</tbody>
  </table>

  <div class="footer">
    <span>App Cultivo &nbsp;·&nbsp; ${window.location.origin}</span>
    <span>${tent.name} &nbsp;·&nbsp; ${phase} &nbsp;·&nbsp; ${generatedAt}</span>
  </div>

  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) { toast.error('Permita pop-ups para exportar o relatório'); return; }
    win.document.write(html);
    win.document.close();
  };

  const handleExportCSV = () => {
    const exportLogs = filteredLogs.slice().reverse(); // ASC — mais antigo primeiro
    const header = "Data,Turno,Temp°C,UR%,PPFD,pH,EC,Rega(ml),Runoff%";
    const rows = exportLogs.map((l: any) => [
      format(new Date(l.logDate), "dd/MM/yyyy HH:mm", { locale: ptBR }),
      l.turn ?? "",
      l.tempC ?? "",
      l.rhPct ?? "",
      l.ppfd ?? "",
      l.ph ?? "",
      l.ec ?? "",
      l.wateringVolume ?? "",
      l.runoffPercentage ? parseFloat(l.runoffPercentage).toFixed(1) : "",
    ].join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tent.name.replace(/\s+/g, "_")}_logs_${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  const handleShare = async () => {
    const phase = phaseInfo.phase;
    const lastLog = logs?.[0];
    const lines: string[] = [
      `🌱 ${tent.name} — ${phase}`,
    ];
    if (cycle) {
      const start = format(new Date(cycle.startDate), "dd/MM/yyyy", { locale: ptBR });
      lines.push(`📅 Ciclo iniciado em ${start}`);
    }
    if (lastLog) {
      const logDate = format(new Date(lastLog.logDate), "dd/MM HH:mm", { locale: ptBR });
      lines.push(`\n📊 Último registro (${logDate}):`);
      if (lastLog.tempC) lines.push(`🌡️ Temperatura: ${lastLog.tempC}°C`);
      if (lastLog.rhPct) lines.push(`💧 Umidade: ${lastLog.rhPct}%`);
      if (lastLog.ppfd) lines.push(`☀️ PPFD: ${lastLog.ppfd} µmol/m²/s`);
      if (lastLog.ph) lines.push(`🧪 pH: ${lastLog.ph}`);
      if (lastLog.ec) lines.push(`⚡ EC: ${lastLog.ec} mS/cm`);
    }
    if (avgTemp !== '--') lines.push(`\n📈 Médias (${dateRange} dias): Temp ${avgTemp}°C | UR ${avgRh}% | PPFD ${avgPpfd}`);
    lines.push(`\n🔗 App Cultivo — app.cultivo.pro`);

    const text = lines.join('\n');

    if (navigator.share) {
      try {
        await navigator.share({
          title: `App Cultivo — ${tent.name}`,
          text,
        });
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          toast.error('Erro ao compartilhar');
        }
      }
    } else {
      // Fallback: copiar para clipboard
      try {
        await navigator.clipboard.writeText(text);
        toast.success('Copiado para a área de transferência!');
      } catch {
        toast.error('Compartilhamento não suportado neste navegador');
      }
    }
  };

  // Pulsing dot at the last data point — "live data" feel
  const PulsingDot = ({ cx, cy, color }: { cx?: number; cy?: number; color: string }) => {
    if (cx == null || cy == null) return null;
    return (
      <g>
        <circle cx={cx} cy={cy} r={4} fill={color} opacity={0.9} />
        <circle cx={cx} cy={cy} r={4} fill="none" stroke={color} strokeWidth={2} opacity={0.6}>
          <animate attributeName="r" values="4;11;4" dur="2.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0;0.6" dur="2.5s" repeatCount="indefinite" />
        </circle>
      </g>
    );
  };

  // Prepare chart data (filtered by period, ASC: oldest → newest = left → right)
  const chartData = filteredLogs.slice().reverse().map((log) => ({
    date: format(new Date(log.logDate), "dd/MM", { locale: ptBR }),
    fullDate: format(new Date(log.logDate), "dd/MM/yyyy HH:mm", { locale: ptBR }),
    turn: log.turn,
    temp: log.tempC ? parseFloat(log.tempC) : null,
    rh: log.rhPct ? parseFloat(log.rhPct) : null,
    ppfd: log.ppfd || null,
    ph: log.ph ? parseFloat(log.ph) : null,
    ec: log.ec ? parseFloat(log.ec) : null,
    watering: log.wateringVolume || null,
  }));

  // L4 — apenas logs com watering registrado (para o gráfico de correlação)
  const wateringChartData = chartData.filter(d => d.watering !== null);

  // Calculate averages (filtered by period) — usando só logs com valor para evitar NaN
  const logsWithTemp  = filteredLogs.filter(l => l.tempC);
  const logsWithRh    = filteredLogs.filter(l => l.rhPct);
  const logsWithPpfd  = filteredLogs.filter(l => l.ppfd);
  const avgTemp = logsWithTemp.length
    ? (logsWithTemp.reduce((sum, log) => sum + parseFloat(log.tempC!), 0) / logsWithTemp.length).toFixed(1)
    : "--";
  const avgRh = logsWithRh.length
    ? (logsWithRh.reduce((sum, log) => sum + parseFloat(log.rhPct!), 0) / logsWithRh.length).toFixed(1)
    : "--";
  const avgPpfd = logsWithPpfd.length
    ? Math.round(logsWithPpfd.reduce((sum, log) => sum + (log.ppfd ?? 0), 0) / logsWithPpfd.length)
    : "--";

  return (
    <PageTransition>
        <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
        <div className="container py-4 md:py-6">
          <div className="flex items-center gap-3">
            {/* Voltar */}
            <Button asChild variant="ghost" size="icon" className="shrink-0">
              <Link href="/">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>

            {/* Ícone + Título */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
                <TentIcon className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-base md:text-xl font-bold text-foreground truncate leading-tight">{tent.name}</h1>

                {/* Linha 1: dimensões + última leitura */}
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <p className="text-xs text-muted-foreground shrink-0">
                    {tent.width}×{tent.depth}×{tent.height}cm
                  </p>
                  {/* Freshness badge */}
                  {logs && logs.length > 0 && (() => {
                    const lastLogDate = new Date(logs[0].logDate);
                    const hoursAgo = differenceInHours(new Date(), lastLogDate);
                    const daysAgo = differenceInDays(new Date(), lastLogDate);
                    if (hoursAgo < 24) return (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        {hoursAgo === 0 ? 'Agora' : `${hoursAgo}h atrás`}
                      </span>
                    );
                    if (daysAgo === 1) return (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        Ontem
                      </span>
                    );
                    return (
                      <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                        {daysAgo}d sem registro
                      </span>
                    );
                  })()}
                </div>

                {/* Linha 2: semana do ciclo (só se tiver) */}
                {cycle && currentPhase && currentWeek && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3 text-primary/60 shrink-0" />
                    <span className="text-xs font-semibold text-primary/80">
                      Sem {currentWeek} de {currentPhase === "FLORA" ? "Flora" : "Vega"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · início {format(new Date(cycle.startDate), "dd/MM", { locale: ptBR })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Ações */}
            <div className="flex items-center gap-2 shrink-0 print-hide">
              {cycle && (
                <div className="hidden sm:block">
                  <PhaseBadge
                    phase={tent.category === "MAINTENANCE" ? "MAINTENANCE" : currentPhase ?? "VEGA"}
                    week={currentWeek ?? undefined}
                    size="sm"
                  />
                </div>
              )}
              {/* QR + Monitor — só desktop */}
              <div className="hidden sm:flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setQrModalOpen(true)} title="QR Code para log rápido">
                  <QrCode className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => navigate(`/tent/${tentId}/display`)} title="Modo Display">
                  <Monitor className="w-4 h-4" />
                </Button>
              </div>
              {/* Dropdown de ações secundárias */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {/* Mobile-only: Novo Registro + QR + Monitor */}
                  <DropdownMenuItem asChild className="sm:hidden">
                    <Link href={`/tent/${tentId}/log`} className="flex items-center gap-2 cursor-pointer">
                      <Plus className="w-4 h-4" />
                      Novo Registro
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setQrModalOpen(true)} className="gap-2 sm:hidden">
                    <QrCode className="w-4 h-4" />
                    QR Code
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/tent/${tentId}/display`)} className="gap-2 sm:hidden">
                    <Monitor className="w-4 h-4" />
                    Modo Display
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="sm:hidden" />
                  <DropdownMenuItem onClick={() => setEditTentOpen(true)} className="gap-2">
                    <Pencil className="w-4 h-4" />
                    Editar Estufa
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShare} className="gap-2">
                    <Share2 className="w-4 h-4" />
                    Compartilhar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handlePrint} className="gap-2">
                    <FileDown className="w-4 h-4" />
                    Exportar Relatório PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportCSV} className="gap-2">
                    <FileDown className="w-4 h-4 text-emerald-500" />
                    Exportar CSV
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="gap-2 text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir Estufa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6 max-w-7xl space-y-6">

        {/* ── Último registro — linha compacta ── */}
        {logs && logs.length > 0 && (() => {
          const last = logs[0];
          type Pill = { icon: React.ReactNode; value: string; ok: boolean | null };
          const pills: Pill[] = [
            { icon: <ThermometerSun className="w-3 h-3 text-orange-400" />, value: last.tempC ? `${parseFloat(last.tempC).toFixed(1)}°C` : "—", ok: last.tempC ? (parseFloat(last.tempC) >= 20 && parseFloat(last.tempC) <= 28) : null },
            { icon: <Droplets className="w-3 h-3 text-teal-400" />,         value: last.rhPct  ? `${parseFloat(last.rhPct).toFixed(0)}%`  : "—", ok: last.rhPct  ? (parseFloat(last.rhPct)  >= 40 && parseFloat(last.rhPct)  <= 70) : null },
            { icon: <TestTube  className="w-3 h-3 text-purple-400" />,      value: last.ph     ? `pH ${parseFloat(last.ph).toFixed(1)}`    : "—", ok: last.ph     ? (parseFloat(last.ph)    >= 5.8 && parseFloat(last.ph)    <= 6.5) : null },
            { icon: <Zap       className="w-3 h-3 text-emerald-400" />,     value: last.ec     ? `${parseFloat(last.ec).toFixed(1)} mS`    : "—", ok: last.ec     ? (parseFloat(last.ec)    >= 1.0 && parseFloat(last.ec)    <= 2.5) : null },
            { icon: <Droplets  className="w-3 h-3 text-cyan-400" />,        value: last.wateringVolume ? `${last.wateringVolume}ml`         : "—", ok: null },
            { icon: <Sun       className="w-3 h-3 text-amber-400" />,       value: (weekTargets as any)?.photoperiod ? `${(weekTargets as any).photoperiod}h` : "—", ok: null },
          ].filter(p => p.value !== "—");
          if (pills.length === 0) return null;
          return (
            <div className="flex items-center gap-1 flex-wrap px-1">
              <span className="text-xs text-muted-foreground/50 flex items-center gap-1 mr-1 shrink-0">
                <Clock className="w-2.5 h-2.5" />
                {format(new Date(last.logDate), "dd/MM HH:mm", { locale: ptBR })}
              </span>
              {pills.map((p, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                    p.ok === null    ? "bg-muted/30 border-border/40 text-muted-foreground" :
                    p.ok            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" :
                                      "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"
                  }`}
                >
                  {p.icon}{p.value}
                </span>
              ))}
            </div>
          );
        })()}

        {/* Cycle — fase + botões de avanço de fase */}
        {cycle && tent && (
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            {/* Linha de resumo do ciclo */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
              <PhaseBadge
                phase={tent.category === "MAINTENANCE" ? "MAINTENANCE" : currentPhase ?? "VEGA"}
                week={currentWeek ?? undefined}
              />
              <div className="flex items-center gap-3 text-xs text-muted-foreground divide-x divide-border/40">
                <span>Início {format(new Date(cycle.startDate), "dd/MM/yy", { locale: ptBR })}</span>
                <span className="pl-3">
                  {Math.floor((Date.now() - new Date(cycle.startDate).getTime()) / (24 * 60 * 60 * 1000))} dias
                </span>
                <span className={`pl-3 font-semibold ${
                  cycle.status === 'ACTIVE' ? 'text-green-400' : 'text-amber-400'
                }`}>
                  {cycle.status === 'ACTIVE' ? 'Ativo' : 'Finalizado'}
                </span>
              </div>
            </div>

            {/* Botões de avanço de fase */}
            <div className="flex flex-wrap gap-2 px-4 py-3">
                {tent.category === "MAINTENANCE" && (
                  <button
                    onClick={() => openPhaseConfirm("CLONING")}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 active:scale-95 transition-all"
                  >
                    <Sprout className="w-3.5 h-3.5" />
                    Tirar Clones
                  </button>
                )}
                {tent.category === "VEGA" && (
                  <button
                    onClick={() => openPhaseConfirm("FLORA")}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-purple-500/15 border border-purple-500/30 text-purple-400 hover:bg-purple-500/25 active:scale-95 transition-all"
                  >
                    <Flower2 className="w-3.5 h-3.5" />
                    Avançar para Floração
                  </button>
                )}
                {tent.category === "FLORA" && (
                  <>
                    <button
                      onClick={() => setHarvestQueueOpen(true)}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 active:scale-95 transition-all"
                    >
                      <Wind className="w-3.5 h-3.5" />
                      Colher → Secagem
                    </button>
                    <button
                      onClick={() => openPhaseConfirm("DRYING")}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold border border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5 active:scale-95 transition-all"
                    >
                      <Wind className="w-3.5 h-3.5" />
                      Ir direto para Secagem
                    </button>
                  </>
                )}
            </div>
          </div>
        )}

        {/* Modais de fase */}
        {tent && (
          <>
            <PhaseConfirmDialog
              open={phaseConfirmOpen}
              onOpenChange={setPhaseConfirmOpen}
              phase={phaseConfirmType}
              tentName={tent.name}
              onConfirm={handlePhaseConfirmed}
            />
            <SelectMotherPlantDialog
              open={selectMotherOpen}
              onOpenChange={setSelectMotherOpen}
              tentId={tentId}
              onMotherSelected={(plantId: number, plantName: string) => {
                setSelectedMotherId(plantId);
                setSelectedMotherName(plantName);
                setSelectMotherOpen(false);
                setFinishCloningOpen(true);
              }}
            />
            {cycle && (
              <>
                <FinishCloningDialog
                  open={finishCloningOpen}
                  onOpenChange={setFinishCloningOpen}
                  cycleId={cycle.id}
                  motherPlantId={selectedMotherId || 0}
                  motherPlantName={selectedMotherName || "Planta Mãe"}
                  clonesCount={selectedClonesCount}
                />
                <PromotePhaseDialog
                  open={promotePhaseOpen}
                  onOpenChange={setPromotePhaseOpen}
                  cycleId={cycle.id}
                  tentId={tentId}
                  currentPhase={cycle.floraStartDate ? "FLORA" : "VEGA"}
                  currentTentName={tent.name}
                />
                <MoveToHarvestQueueDialog
                  open={harvestQueueOpen}
                  onOpenChange={setHarvestQueueOpen}
                  cycleId={cycle.id}
                  tentId={tentId}
                  tentName={tent.name}
                />
              </>
            )}
          </>
        )}

        {/* Tabs principais — agrupa as 4 áreas da estufa numa nav só.
            Antes eram 4 cards empilhados (sensor / pair / cenas / plantas) +
            tabs internas de gráficos. Agora tudo em 4 tabs no mesmo nível,
            menos scroll vertical, foco visual numa área por vez.
            id="charts-container" mantido pra compat com PDF export que faz
            scrollIntoView nele antes de capturar. */}
        <Tabs defaultValue="plantas" className="space-y-6" id="charts-container">
          <TabsList className="bg-card/90 backdrop-blur-sm w-full grid grid-cols-4 p-1 h-auto gap-1">
            <TabsTrigger value="plantas" className="gap-1.5 text-xs sm:text-sm">
              <Sprout className="w-3.5 h-3.5" />
              <span>Plantas</span>
            </TabsTrigger>
            <TabsTrigger value="smartlife" className="gap-1.5 text-xs sm:text-sm">
              <Wifi className="w-3.5 h-3.5" />
              <span>SmartLife</span>
            </TabsTrigger>
            <TabsTrigger value="metricas" className="gap-1.5 text-xs sm:text-sm">
              <ThermometerSun className="w-3.5 h-3.5" />
              <span>Métricas</span>
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-1.5 text-xs sm:text-sm">
              <Clock className="w-3.5 h-3.5" />
              <span>Histórico</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab Plantas (default) — lista de plantas + ações */}
          <TabsContent value="plantas" className="space-y-4">
            <TentPlantsTab tentId={tentId} tentName={tent.name} />
          </TabsContent>

          {/* Tab SmartLife — ESP primeiro (vínculos display + ações inline),
              depois pareamento, depois sensor.
              Hierarquia: o que o user usa mais frequente fica no topo. */}
          <TabsContent value="smartlife" className="space-y-4">
            <TentDisplayItemsCard tentId={tentId} />
            <PairDisplayCard tentId={tentId} />
            <TentSensorCard tentId={tentId} />
          </TabsContent>

          {/* Tab Métricas (gráficos — antes era a tab "charts") */}
          <TabsContent value="metricas" className="space-y-6">
            {/* Date Range Selector */}
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Período:</span>
              <div className="flex gap-2">
                <Button
                  variant={dateRange === 7 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateRange(7)}
                >
                  7 dias
                </Button>
                <Button
                  variant={dateRange === 14 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateRange(14)}
                >
                  14 dias
                </Button>
                <Button
                  variant={dateRange === 30 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateRange(30)}
                >
                  30 dias
                </Button>
              </div>
            </div>
            {logsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : chartData.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="Sem registros neste período"
                description="Crie registros diários pra ver gráficos de evolução."
                action={{ label: "Criar Primeiro Registro", href: `/tent/${tentId}/log` }}
              />
            ) : (
              <>
                {/* Temperature Chart */}
                <Card className="bg-card/90 backdrop-blur-sm relative overflow-hidden group/chart">
                  <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover/chart:opacity-100 transition-opacity duration-500" style={{ boxShadow: '0 0 0 1px rgba(249,115,22,0.15) inset' }} />
                  <div className="chart-glow-line pointer-events-none absolute bottom-0 left-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-orange-500/50 to-transparent" />
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ThermometerSun className="w-5 h-5 text-orange-500" />
                      Temperatura
                    </CardTitle>
                    <CardDescription>Evolução em °C ao longo do tempo</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="gradTemp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#f97316" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" />
                        <XAxis dataKey="date" stroke="currentColor" className="opacity-40 text-xs" />
                        <YAxis stroke="currentColor" className="opacity-40 text-xs" domain={[15, 35]} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "13px" }}
                          labelStyle={{ color: "var(--foreground)" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="temp"
                          stroke="#f97316"
                          strokeWidth={2.5}
                          fill="url(#gradTemp)"
                          dot={(props: any) => {
                            const isLast = props.index === chartData.filter(d => d.temp != null).length - 1;
                            if (!isLast) return <circle key={props.key} cx={props.cx} cy={props.cy} r={2.5} fill="#f97316" opacity={0.5} />;
                            return <PulsingDot key={props.key} cx={props.cx} cy={props.cy} color="#f97316" />;
                          }}
                          activeDot={{ r: 5, fill: "#f97316" }}
                          name="Temperatura (°C)"
                          animationDuration={800}
                          animationEasing="ease-out"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Humidity Chart */}
                <Card className="bg-card/90 backdrop-blur-sm relative overflow-hidden group/chart">
                  <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover/chart:opacity-100 transition-opacity duration-500" style={{ boxShadow: '0 0 0 1px rgba(59,130,246,0.15) inset' }} />
                  <div className="chart-glow-line-delayed pointer-events-none absolute bottom-0 left-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Droplets className="w-5 h-5 text-blue-500" />
                      Umidade Relativa
                    </CardTitle>
                    <CardDescription>Evolução em % ao longo do tempo</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="gradRh" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" />
                        <XAxis dataKey="date" stroke="currentColor" className="opacity-40 text-xs" />
                        <YAxis stroke="currentColor" className="opacity-40 text-xs" domain={[30, 90]} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "13px" }}
                          labelStyle={{ color: "var(--foreground)" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="rh"
                          stroke="#3b82f6"
                          strokeWidth={2.5}
                          fill="url(#gradRh)"
                          dot={(props: any) => {
                            const isLast = props.index === chartData.filter(d => d.rh != null).length - 1;
                            if (!isLast) return <circle key={props.key} cx={props.cx} cy={props.cy} r={2.5} fill="#3b82f6" opacity={0.5} />;
                            return <PulsingDot key={props.key} cx={props.cx} cy={props.cy} color="#3b82f6" />;
                          }}
                          activeDot={{ r: 5, fill: "#3b82f6" }}
                          name="Umidade (%)"
                          animationDuration={800}
                          animationEasing="ease-out"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* PPFD Chart */}
                <Card className="bg-card/90 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sun className="w-5 h-5 text-yellow-500" />
                      PPFD
                    </CardTitle>
                    <CardDescription>Evolução em µmol/m²/s ao longo do tempo</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="gradPpfd" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#eab308" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" />
                        <XAxis dataKey="date" stroke="currentColor" className="opacity-40 text-xs" />
                        <YAxis stroke="currentColor" className="opacity-40 text-xs" domain={[0, 1200]} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "13px" }}
                          labelStyle={{ color: "var(--foreground)" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="ppfd"
                          stroke="#eab308"
                          strokeWidth={2.5}
                          fill="url(#gradPpfd)"
                          dot={(props: any) => {
                            const isLast = props.index === chartData.filter(d => d.ppfd != null).length - 1;
                            if (!isLast) return <circle key={props.key} cx={props.cx} cy={props.cy} r={2.5} fill="#eab308" opacity={0.5} />;
                            return <PulsingDot key={props.key} cx={props.cx} cy={props.cy} color="#eab308" />;
                          }}
                          activeDot={{ r: 5, fill: "#eab308" }}
                          name="PPFD (µmol/m²/s)"
                          animationDuration={800}
                          animationEasing="ease-out"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* pH Chart */}
                {chartData.some(d => d.ph !== null) && (
                  <Card className="bg-card/90 backdrop-blur-sm relative overflow-hidden group/chart">
                    <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover/chart:opacity-100 transition-opacity duration-500" style={{ boxShadow: '0 0 0 1px rgba(168,85,247,0.15) inset' }} />
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FlaskConical className="w-5 h-5 text-purple-500" />
                        pH
                      </CardTitle>
                      <CardDescription>Evolução do pH ao longo do tempo (ideal: 5.8 – 6.5)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="gradPh" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" />
                          <XAxis dataKey="date" stroke="currentColor" className="opacity-40 text-xs" />
                          <YAxis stroke="currentColor" className="opacity-40 text-xs" domain={[4.5, 8]} tickCount={8} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "13px" }}
                            labelStyle={{ color: "var(--foreground)" }}
                          />
                          <Area
                            type="monotone"
                            dataKey="ph"
                            stroke="#a855f7"
                            strokeWidth={2.5}
                            fill="url(#gradPh)"
                            dot={(props: any) => {
                              const isLast = props.index === chartData.filter(d => d.ph != null).length - 1;
                              if (!isLast) return <circle key={props.key} cx={props.cx} cy={props.cy} r={2.5} fill="#a855f7" opacity={0.5} />;
                              return <PulsingDot key={props.key} cx={props.cx} cy={props.cy} color="#a855f7" />;
                            }}
                            activeDot={{ r: 5, fill: "#a855f7" }}
                            name="pH"
                            connectNulls
                            animationDuration={800}
                            animationEasing="ease-out"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* EC Chart */}
                {chartData.some(d => d.ec !== null) && (
                  <Card className="bg-card/90 backdrop-blur-sm relative overflow-hidden group/chart">
                    <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover/chart:opacity-100 transition-opacity duration-500" style={{ boxShadow: '0 0 0 1px rgba(16,185,129,0.15) inset' }} />
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-emerald-500" />
                        EC
                      </CardTitle>
                      <CardDescription>Evolução da condutividade elétrica em mS/cm (ideal: 1.0 – 2.5)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="gradEc" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="#10b981" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" />
                          <XAxis dataKey="date" stroke="currentColor" className="opacity-40 text-xs" />
                          <YAxis stroke="currentColor" className="opacity-40 text-xs" domain={[0, 4]} tickCount={9} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "13px" }}
                            labelStyle={{ color: "var(--foreground)" }}
                          />
                          <Area
                            type="monotone"
                            dataKey="ec"
                            stroke="#10b981"
                            strokeWidth={2.5}
                            fill="url(#gradEc)"
                            dot={(props: any) => {
                              const isLast = props.index === chartData.filter(d => d.ec != null).length - 1;
                              if (!isLast) return <circle key={props.key} cx={props.cx} cy={props.cy} r={2.5} fill="#10b981" opacity={0.5} />;
                              return <PulsingDot key={props.key} cx={props.cx} cy={props.cy} color="#10b981" />;
                            }}
                            activeDot={{ r: 5, fill: "#10b981" }}
                            name="EC (mS/cm)"
                            connectNulls
                            animationDuration={800}
                            animationEasing="ease-out"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* L4 — Correlação Rega × Umidade */}
                {wateringChartData.length >= 2 && (
                  <Card className="bg-card/90 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Droplets className="w-4 h-4 text-teal-500" />
                        Correlação Rega × Umidade
                      </CardTitle>
                      <CardDescription className="text-xs">Volume regado (barras) vs umidade relativa (linha)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <ComposedChart data={wateringChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gradWatering" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.8} />
                              <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.3} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.06} />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }} tickLine={false} axisLine={false} />
                          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }} tickLine={false} axisLine={false} unit="ml" width={48} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }} tickLine={false} axisLine={false} unit="%" width={36} domain={[0, 100]} />
                          <Tooltip
                            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                            formatter={(value: any, name: any) => name === "Rega" ? [`${value} ml`, name] : [`${value}%`, name]}
                          />
                          <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                          <Bar yAxisId="left" dataKey="watering" name="Rega" fill="url(#gradWatering)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                          <Line yAxisId="right" type="monotone" dataKey="rh" name="Umidade %" stroke="#3b82f6" strokeWidth={2}
                            dot={(props: any) => {
                              const isLast = props.index === wateringChartData.length - 1;
                              if (!isLast) return <circle key={props.key} cx={props.cx} cy={props.cy} r={2.5} fill="#3b82f6" opacity={0.5} />;
                              return <PulsingDot key={props.key} cx={props.cx} cy={props.cy} color="#3b82f6" />;
                            }}
                            activeDot={{ r: 5 }} connectNulls />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* Tab Histórico (tabela de logs — antes era "history") */}
          <TabsContent value="historico">
            {logsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : logsError ? (
              <Card className="bg-card/90 backdrop-blur-sm">
                <CardContent className="p-12 text-center">
                  <p className="text-destructive font-medium mb-2">Erro ao carregar registros</p>
                  <p className="text-sm text-muted-foreground">Tente recarregar a página.</p>
                </CardContent>
              </Card>
            ) : logs && logs.length > 0 ? (
              <div className="space-y-2">
                {/* Toggle button for auto logs */}
                <div className="flex justify-end pb-1">
                  <button
                    onClick={() => setShowAutoLogs(v => !v)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${showAutoLogs ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-500' : 'border-border text-muted-foreground'}`}
                  >
                    {showAutoLogs ? '● Automáticos visíveis' : '○ Ocultar automáticos'}
                  </button>
                </div>

                {historyLogs.map((log: any) => {
                  const isAuto = log.source === 'AUTO' || (!log.ph && !log.ec && !log.ppfd && !log.wateringVolume);

                  if (isAuto) {
                    // Compact row for AUTO entries
                    return (
                      <div
                        key={log.id}
                        className={`rounded-xl border border-border/20 bg-card/60 px-4 py-2.5 flex items-center gap-3 transition-opacity ${deletingLogId === log.id ? "opacity-40" : ""}`}
                      >
                        <span className="text-xs text-muted-foreground/50 tabular-nums shrink-0">
                          {format(new Date(log.logDate), "HH:mm", { locale: ptBR })}
                        </span>
                        <span className="text-xs text-muted-foreground/50 capitalize shrink-0">
                          {format(new Date(log.logDate), "EEE, dd MMM", { locale: ptBR })}
                        </span>
                        {log.tempC && (
                          <span className="flex items-center gap-1 text-xs text-foreground/60">
                            <ThermometerSun className="w-3 h-3 text-orange-400 shrink-0" />
                            {log.tempC}°C
                          </span>
                        )}
                        {log.rhPct && (
                          <span className="flex items-center gap-1 text-xs text-foreground/60">
                            <Droplets className="w-3 h-3 text-blue-400 shrink-0" />
                            {log.rhPct}%
                          </span>
                        )}
                        <span className="text-xs font-bold text-cyan-400 bg-cyan-500/15 border border-cyan-500/30 rounded-full px-1.5 py-0.5 ml-auto">A</span>
                      </div>
                    );
                  }

                  // Full card for MANUAL entries
                  return (
                  <div
                    key={log.id}
                    className={`rounded-2xl border border-border/40 bg-card overflow-hidden transition-opacity ${deletingLogId === log.id ? "opacity-40" : ""}`}
                  >
                    {/* Header — data full width */}
                    <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
                      <span className="text-xs font-semibold text-foreground/70 capitalize">
                        {format(new Date(log.logDate), "EEE, dd MMM", { locale: ptBR })}
                      </span>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded leading-none ${
                        log.turn === "AM"
                          ? "bg-amber-500/10 text-amber-400/70"
                          : "bg-indigo-500/10 text-indigo-400/70"
                      }`}>
                        {log.turn === "AM" ? "AM" : "PM"}
                      </span>
                      <div className="flex-1" />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground/40 hover:text-foreground"
                        onClick={() => { setEditingLog({ ...log, tentName: tent?.name }); setEditLogOpen(true); }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground/40 hover:text-destructive"
                        disabled={deletingLogId === log.id}
                        onClick={() => handleDeleteLog(log.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {/* Módulos — 2 linhas de 3 */}
                    <div className="mx-4 mb-4 rounded-xl border border-border/20 overflow-hidden">

                      {/* Linha 1 — Temp · Humidade · PPFD */}
                      <div className="grid grid-cols-3 divide-x divide-border/20 bg-white/[0.015]">
                        <div className="px-3 py-3 flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground/40 uppercase tracking-wider leading-none">Temp</span>
                          <span className="flex items-center gap-1 text-sm font-medium text-foreground/80 leading-none">
                            <ThermometerSun className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                            {log.tempC ? `${log.tempC}°C` : <span className="text-muted-foreground/20">—</span>}
                          </span>
                        </div>
                        <div className="px-3 py-3 flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground/40 uppercase tracking-wider leading-none">Humidade</span>
                          <span className="flex items-center gap-1 text-sm font-medium text-foreground/80 leading-none">
                            <Droplets className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            {log.rhPct ? `${log.rhPct}%` : <span className="text-muted-foreground/20">—</span>}
                          </span>
                        </div>
                        <div className="px-3 py-3 flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground/40 uppercase tracking-wider leading-none">PPFD</span>
                          <span className="flex items-center gap-1 text-sm font-medium text-foreground/80 leading-none">
                            <Sun className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                            {log.ppfd ? `${log.ppfd} µmol` : <span className="text-muted-foreground/20">—</span>}
                          </span>
                        </div>
                      </div>

                      <div className="h-px bg-border/20" />

                      {/* Linha 2 — pH · EC · Runoff */}
                      <div className="grid grid-cols-3 divide-x divide-border/20">
                        <div className="px-3 py-3 flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground/40 uppercase tracking-wider leading-none">pH</span>
                          <span className="flex items-center gap-1 text-sm font-medium text-foreground/80 leading-none">
                            <FlaskConical className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                            {log.ph ? `${log.ph}` : <span className="text-muted-foreground/20">—</span>}
                          </span>
                        </div>
                        <div className="px-3 py-3 flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground/40 uppercase tracking-wider leading-none">EC</span>
                          <span className="flex items-center gap-1 text-sm font-medium text-foreground/80 leading-none">
                            <Zap className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                            {log.ec ? `${log.ec}` : <span className="text-muted-foreground/20">—</span>}
                          </span>
                        </div>
                        <div className="px-3 py-3 flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground/40 uppercase tracking-wider leading-none">Runoff</span>
                          <span className="flex items-center gap-1 text-sm font-medium text-foreground/80 leading-none">
                            <Droplets className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            {log.runoffPercentage
                              ? `${log.runoffPercentage}%`
                              : log.runoffCollected
                              ? `${log.runoffCollected}ml`
                              : <span className="text-muted-foreground/20">—</span>}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    {log.notes && (
                      <p className="text-xs text-muted-foreground/40 italic px-4 pb-3 -mt-1 truncate">
                        {log.notes}
                      </p>
                    )}
                  </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={Calendar}
                title="Nenhum registro encontrado"
                description="Comece registrando as condições da estufa diariamente — temperatura, umidade, pH e EC."
                action={{ label: "Criar Primeiro Registro", href: `/tent/${tentId}/log` }}
              />
            )}
          </TabsContent>

        </Tabs>
      </main>

      {/* Dialog de edição da estufa */}
      <EditTentDialog
        tent={tent}
        open={editTentOpen}
        onOpenChange={setEditTentOpen}
        onSuccess={() => utils.tents.getById.invalidate({ id: tentId })}
      />

      <EditLogDialog
        log={editingLog}
        open={editLogOpen}
        onOpenChange={setEditLogOpen}
        onSuccess={() => utils.dailyLogs.list.invalidate({ tentId })}
      />

      {/* Dialog de confirmação de exclusão da estufa */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <DialogTitle className="text-lg">Excluir Estufa</DialogTitle>
            </div>
            <DialogDescription className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir a estufa{" "}
              <span className="font-semibold text-foreground">{tent.name}</span>? Esta ação é irreversível e removerá todos os ciclos, registros, alertas e histórico associados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirmed}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Excluindo...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" />Excluir Estufa</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── QR Code Modal (D2) ── */}
      <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2">
              <QrCode className="w-5 h-5" />
              QR Code — {tent.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Escaneie para abrir o registro rápido desta estufa
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="p-3 bg-white rounded-2xl shadow-sm">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(`${window.location.origin}/quick-log?tentId=${tentId}`)}`}
                alt={`QR Code para ${tent.name}`}
                width={220}
                height={220}
                className="rounded-lg"
              />
            </div>
            <p className="text-xs text-muted-foreground break-all">
              {window.location.origin}/quick-log?tentId={tentId}
            </p>
            <Button variant="outline" size="sm" onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/quick-log?tentId=${tentId}`);
              toast.success("Link copiado!");
            }}>
              Copiar link
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
    </PageTransition>
  );
}

// Componente para lista de plantas da estufa — estilo PlantsList (cards foto full-cover)
function TentPlantsTab({ tentId, tentName: _tentName }: { tentId: number; tentName: string }) {
  const { data: plants, isLoading } = trpc.plants.list.useQuery({ tentId });
  const { data: strains } = trpc.strains.list.useQuery();

  const getStrainName = (strainId: number) =>
    strains?.find((s) => s.id === strainId)?.name ?? null;

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2.5">
        {[1,2,3].map(i => (
          <div key={i} className="rounded-2xl aspect-[3/4] bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!plants || plants.length === 0) {
    return (
      <EmptyState
        icon={Leaf}
        title="Nenhuma planta nesta estufa"
        description="Cadastre a primeira planta pra começar a acompanhar o ciclo."
        variant="compact"
        action={{ label: "Nova Planta", href: "/plants/new", variant: "outline" }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-0.5">
        <p className="text-xs text-muted-foreground">
          {plants.length} {plants.length === 1 ? "planta" : "plantas"}
        </p>
        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
          <Link href="/plants/new"><Plus className="w-3 h-3 mr-1" />Nova</Link>
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {plants.map((plant: any) => {
          const thumbUrl = plant.lastHealthPhotoUrl
            ? (plant.lastHealthPhotoUrl.startsWith('/uploads/')
                ? `/api/upload/thumbnail?url=${encodeURIComponent(plant.lastHealthPhotoUrl)}&w=220&h=300&q=55`
                : plant.lastHealthPhotoUrl)
            : null;

          const cardBg =
            plant.cyclePhase === 'FLORA' ? '#581c87' :
            plant.cyclePhase === 'VEGA'  ? '#14532d' : '#1e293b';

          const healthBadge =
            plant.lastHealthStatus === 'HEALTHY'    ? { icon: '✓', bg: 'rgba(74,222,128,0.22)',  color: '#4ade80' } :
            plant.lastHealthStatus === 'STRESSED'   ? { icon: '!', bg: 'rgba(251,191,36,0.25)',  color: '#fbbf24' } :
            plant.lastHealthStatus === 'SICK'       ? { icon: '✕', bg: 'rgba(248,113,113,0.25)', color: '#f87171' } :
            plant.lastHealthStatus === 'RECOVERING' ? { icon: '↻', bg: 'rgba(96,165,250,0.25)',  color: '#60a5fa' } :
            null;

          const phaseLabel =
            plant.cyclePhase === 'FLORA' && plant.cycleWeek ? `Flora · S${plant.cycleWeek}` :
            plant.cyclePhase === 'VEGA'  && plant.cycleWeek ? `Vega · S${plant.cycleWeek}`  :
            getStrainName(plant.strainId) ?? '—';

          return (
            <Link key={plant.id} href={`/plants/${plant.id}`}>
              <div
                className="rounded-2xl overflow-hidden relative aspect-[3/4] active:scale-95 transition-transform duration-150"
                style={{ background: cardBg }}
              >
                {/* Badge saúde */}
                {healthBadge && (
                  <span
                    className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-sm"
                    style={{ background: healthBadge.bg, color: healthBadge.color }}
                  >
                    {healthBadge.icon}
                  </span>
                )}

                {/* Foto ou inicial */}
                {thumbUrl ? (
                  <img src={thumbUrl} alt={plant.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-4xl font-black text-white/30 select-none">
                      {(plant.name ?? '?')[0].toUpperCase()}
                    </span>
                  </div>
                )}

                {/* Gradiente + texto */}
                <div className="absolute inset-x-0 bottom-0 pointer-events-none"
                  style={{ height: '55%', background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)' }} />
                <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2.5">
                  <p className="text-white font-bold text-xs leading-tight truncate drop-shadow">{plant.name}</p>
                  <p className="text-white/60 text-xs mt-0.5 truncate">{phaseLabel}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
