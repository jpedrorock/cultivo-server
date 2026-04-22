import { useState } from 'react';
import { Link } from 'wouter';
import {
  Wifi, WifiOff, Power, Play, Loader2, Plus, X, Settings,
  Zap, Home, ChevronDown, ChevronUp, AlertCircle, RefreshCw,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { PageTransition } from '@/components/PageTransition';
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'devices' | 'scenes';

interface DeviceMapping {
  tentId: number;
  deviceId: string;
  deviceName: string;
  switchCode: string;
  enabled: boolean;
}

// ─── DeviceToggle ─────────────────────────────────────────────────────────────

function DeviceToggle({ mapping }: { mapping: DeviceMapping }) {
  const utils = trpc.useUtils();

  const { data: status, isLoading, refetch } = trpc.tuya.getDeviceCurrentStatus.useQuery(
    { deviceId: mapping.deviceId },
    { refetchInterval: 30_000, retry: false }
  );

  const cmd = trpc.tuya.sendDeviceCommand.useMutation({
    onSuccess: () => {
      setTimeout(() => refetch(), 600);
    },
    onError: (e) => toast.error(e.message),
  });

  const isOn = status?.switchOn ?? false;
  const isOnline = status?.online ?? false;
  const pending = cmd.isPending;

  const toggle = () => {
    const code = status?.switchCode ?? mapping.switchCode;
    cmd.mutate({ deviceId: mapping.deviceId, switchCode: code, value: !isOn });
  };

  return (
    <div className="flex items-center justify-between px-4 py-3.5 border-b border-border/20 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        {/* Status dot */}
        <span className={`w-2 h-2 rounded-full shrink-0 ${isLoading ? 'bg-muted animate-pulse' : isOnline ? 'bg-green-400' : 'bg-red-400/50'}`} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{mapping.deviceName}</p>
          <p className="text-[11px] text-muted-foreground/60">
            {isLoading ? 'Verificando...' : isOnline ? (status?.switchOn === null ? 'Online · sem controle' : isOn ? 'Ligado' : 'Desligado') : 'Offline'}
          </p>
        </div>
      </div>

      {/* Toggle */}
      {!isLoading && status?.switchOn !== null && isOnline && (
        <button
          onClick={toggle}
          disabled={pending}
          className={`relative w-12 h-6 rounded-full transition-all duration-300 shrink-0 disabled:opacity-60 ${isOn ? 'bg-green-500' : 'bg-muted'}`}
        >
          {pending
            ? <Loader2 className="absolute inset-0 m-auto w-3.5 h-3.5 animate-spin text-white" />
            : <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300 ${isOn ? 'left-6.5' : 'left-0.5'}`} />
          }
        </button>
      )}

      {/* Offline indicator */}
      {!isLoading && !isOnline && (
        <WifiOff className="w-4 h-4 text-muted-foreground/30 shrink-0" />
      )}
    </div>
  );
}

// ─── DevicesTab ───────────────────────────────────────────────────────────────

function DevicesTab() {
  const [addingTentId, setAddingTentId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: mappings = [], isLoading: mappingsLoading } = trpc.tuya.getDeviceMappings.useQuery();
  const { data: tents = [] } = trpc.tents.list.useQuery();
  const { data: allDevices = [], isLoading: devicesLoading } = trpc.tuya.listDevices.useQuery(
    undefined,
    { enabled: pickerOpen, retry: false }
  );
  const { data: config } = trpc.tuya.getConfig.useQuery();

  const saveDeviceMappings = trpc.tuya.saveDeviceMappings.useMutation({
    onSuccess: () => {
      utils.tuya.getDeviceMappings.invalidate();
      setAddingTentId(null);
      setPickerOpen(false);
      toast.success('Dispositivo adicionado!');
    },
    onError: (e) => toast.error(e.message),
  });

  const removeDevice = trpc.tuya.saveDeviceMappings.useMutation({
    onSuccess: () => {
      utils.tuya.getDeviceMappings.invalidate();
      toast.success('Dispositivo removido');
    },
    onError: (e) => toast.error(e.message),
  });

  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
        <Wifi className="w-12 h-12 text-muted-foreground/30" />
        <div>
          <p className="font-medium text-foreground">Tuya não configurado</p>
          <p className="text-sm text-muted-foreground mt-1">Configure suas credenciais para controlar dispositivos</p>
        </div>
        <Link href="/settings/sensors">
          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="w-4 h-4" />
            Configurar API Tuya
          </Button>
        </Link>
      </div>
    );
  }

  // Group mappings by tentId
  const byTent = mappings.reduce<Record<number, DeviceMapping[]>>((acc, m) => {
    if (!acc[m.tentId]) acc[m.tentId] = [];
    acc[m.tentId].push(m);
    return acc;
  }, {});

  // Tents that have at least one device mapped
  const mappedTentIds = Object.keys(byTent).map(Number);
  // All tents (to add devices to unmapped tents too)
  const allTentIds = tents.map((t: any) => t.id);

  // Devices already mapped (to filter picker)
  const mappedDeviceIds = new Set(mappings.map(m => m.deviceId));

  // Non-sensor categories to show in picker
  const SENSOR_CATS = ['wsdcg', 'mcs', 'zdkj', 'wnykq', 'hjjcy'];
  const controllableDevices = allDevices.filter((d: any) => !SENSOR_CATS.includes(d.category));
  const pickerDevices = controllableDevices.filter((d: any) => !mappedDeviceIds.has(d.id));

  const handleAddDevice = (tentId: number, device: any) => {
    const existing = (byTent[tentId] ?? []).map(m => ({
      tentId: m.tentId,
      deviceId: m.deviceId,
      deviceName: m.deviceName,
      switchCode: m.switchCode,
      enabled: m.enabled,
    }));
    saveDeviceMappings.mutate([
      ...existing,
      { tentId, deviceId: device.id, deviceName: device.name, switchCode: 'switch_1', enabled: true },
    ]);
  };

  const handleRemoveDevice = (mapping: DeviceMapping) => {
    // Pass empty array for that tent — will delete all of that tent's devices,
    // then re-add remaining
    const remaining = (byTent[mapping.tentId] ?? [])
      .filter(m => m.deviceId !== mapping.deviceId)
      .map(m => ({ tentId: m.tentId, deviceId: m.deviceId, deviceName: m.deviceName, switchCode: m.switchCode, enabled: m.enabled }));
    removeDevice.mutate(remaining.length > 0 ? remaining : []);
  };

  if (mappingsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      {/* Tents with mapped devices */}
      {mappedTentIds.map(tentId => {
        const tent = tents.find((t: any) => t.id === tentId);
        const tentDevices = byTent[tentId] ?? [];
        return (
          <div key={tentId} className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            {/* Tent header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/30 bg-muted/20">
              <Home className="w-3.5 h-3.5 text-muted-foreground/60" />
              <p className="text-sm font-semibold text-foreground flex-1">{tent?.name ?? `Estufa #${tentId}`}</p>
              {/* Add device to this tent */}
              <button
                onClick={() => { setAddingTentId(tentId); setPickerOpen(true); }}
                className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-primary" />
              </button>
            </div>

            {/* Device rows */}
            <div>
              {tentDevices.map(m => (
                <div key={m.deviceId} className="relative group">
                  <DeviceToggle mapping={m} />
                  {/* Remove button on hover */}
                  <button
                    onClick={() => handleRemoveDevice(m)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-red-500/10 items-center justify-center hidden group-hover:flex hover:bg-red-500/20 transition-colors"
                  >
                    <X className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {mappedTentIds.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 py-12 text-center px-6">
          <Power className="w-10 h-10 mx-auto text-muted-foreground/25 mb-3" />
          <p className="font-medium text-foreground">Nenhum dispositivo mapeado</p>
          <p className="text-sm text-muted-foreground mt-1">Adicione tomadas ou relés para controlar aqui</p>
        </div>
      )}

      {/* Add device to tent — fab-style button */}
      {tents.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 pt-3 pb-2">Adicionar dispositivo</p>
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {tents.map((tent: any) => (
              <button
                key={tent.id}
                onClick={() => { setAddingTentId(tent.id); setPickerOpen(true); }}
                className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {tent.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Device picker sheet */}
      {pickerOpen && addingTentId !== null && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPickerOpen(false)} />
          <div className="relative bg-card border border-border rounded-2xl w-full max-w-md max-h-[70vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
              <p className="font-semibold text-foreground">Escolher dispositivo</p>
              <button onClick={() => setPickerOpen(false)} className="w-7 h-7 rounded-full bg-muted/60 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {devicesLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : pickerDevices.length === 0 ? (
                <div className="py-10 text-center px-6">
                  <p className="text-sm text-muted-foreground">
                    {allDevices.length === 0
                      ? 'Nenhum dispositivo encontrado na conta Tuya'
                      : 'Todos os dispositivos já foram mapeados'}
                  </p>
                </div>
              ) : (
                pickerDevices.map((device: any) => (
                  <button
                    key={device.id}
                    onClick={() => handleAddDevice(addingTentId, device)}
                    disabled={saveDeviceMappings.isPending}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors border-b border-border/20 last:border-0 text-left"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${device.online ? 'bg-green-400' : 'bg-muted-foreground/30'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{device.name}</p>
                      <p className="text-[11px] text-muted-foreground/60">{device.category} · {device.online ? 'Online' : 'Offline'}</p>
                    </div>
                    <Plus className="w-4 h-4 text-primary shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ScenesTab ────────────────────────────────────────────────────────────────

function ScenesTab() {
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [expandedHomes, setExpandedHomes] = useState<Set<string>>(new Set(['__all__']));

  const { data: config } = trpc.tuya.getConfig.useQuery();
  const { data: scenes = [], isLoading, isError, refetch } = trpc.tuya.listScenes.useQuery(
    undefined,
    { enabled: !!config, retry: false }
  );

  const triggerScene = trpc.tuya.triggerScene.useMutation({
    onSuccess: () => {
      toast.success('Cena disparada!');
      setTriggeringId(null);
    },
    onError: (e) => {
      toast.error(e.message);
      setTriggeringId(null);
    },
  });

  const handleTrigger = (scene: { sceneId: string; homeId: number }) => {
    setTriggeringId(scene.sceneId);
    triggerScene.mutate({ sceneId: scene.sceneId, homeId: scene.homeId });
  };

  const toggleHome = (homeName: string) => {
    setExpandedHomes(prev => {
      const next = new Set(prev);
      next.has(homeName) ? next.delete(homeName) : next.add(homeName);
      return next;
    });
  };

  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
        <Zap className="w-12 h-12 text-muted-foreground/30" />
        <div>
          <p className="font-medium text-foreground">Tuya não configurado</p>
          <p className="text-sm text-muted-foreground mt-1">Configure suas credenciais para ver as cenas</p>
        </div>
        <Link href="/settings/sensors">
          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="w-4 h-4" />
            Configurar API Tuya
          </Button>
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card py-12 text-center px-6">
        <AlertCircle className="w-8 h-8 mx-auto text-red-400/60 mb-3" />
        <p className="font-medium text-foreground">Erro ao carregar cenas</p>
        <p className="text-sm text-muted-foreground mt-1 mb-4">Verifique se sua conta SmartLife tem permissão de Homes na API Tuya</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (scenes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 py-12 text-center px-6">
        <Zap className="w-10 h-10 mx-auto text-muted-foreground/25 mb-3" />
        <p className="font-medium text-foreground">Nenhuma cena encontrada</p>
        <p className="text-sm text-muted-foreground mt-1">Crie cenas no app SmartLife e elas aparecerão aqui</p>
      </div>
    );
  }

  // Group by homeName
  const grouped = scenes.reduce<Record<string, typeof scenes>>((acc, s) => {
    if (!acc[s.homeName]) acc[s.homeName] = [];
    acc[s.homeName].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-3 pt-2">
      {Object.entries(grouped).map(([homeName, homeScenes]) => {
        const isOpen = expandedHomes.has(homeName);
        return (
          <div key={homeName} className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            {/* Home header */}
            <button
              className="w-full flex items-center gap-2.5 px-4 py-3 border-b border-border/30 bg-muted/20 hover:bg-muted/30 transition-colors text-left"
              onClick={() => toggleHome(homeName)}
            >
              <Home className="w-3.5 h-3.5 text-muted-foreground/60" />
              <p className="text-sm font-semibold text-foreground flex-1">{homeName}</p>
              <span className="text-xs text-muted-foreground/50">{homeScenes.length} cena{homeScenes.length !== 1 ? 's' : ''}</span>
              {isOpen
                ? <ChevronUp className="w-4 h-4 text-muted-foreground/40" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground/40" />
              }
            </button>

            {/* Scene rows */}
            {isOpen && (
              <div>
                {homeScenes.map((scene) => {
                  const isTriggeringThis = triggeringId === scene.sceneId;
                  return (
                    <div
                      key={scene.sceneId}
                      className="flex items-center gap-3 px-4 py-3.5 border-b border-border/20 last:border-0"
                    >
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                        <Zap className="w-4 h-4 text-amber-500" />
                      </div>
                      <p className="flex-1 text-sm font-medium text-foreground truncate">{scene.name}</p>
                      <button
                        onClick={() => handleTrigger(scene)}
                        disabled={!!triggeringId}
                        className="flex items-center gap-1.5 h-8 px-3.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 shrink-0"
                      >
                        {isTriggeringThis
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Play className="w-3.5 h-3.5" />
                        }
                        {isTriggeringThis ? 'Disparando...' : 'Disparar'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SmartLife() {
  const [tab, setTab] = useState<Tab>('devices');
  const { data: config } = trpc.tuya.getConfig.useQuery();

  const isConnected = !!config?.enabled;

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">

        {/* Header */}
        <header className="bg-card border-b border-border fixed top-0 left-0 right-0 z-20 pt-safe">
          <div className="container py-4 max-w-2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 bg-cyan-500/15 rounded-xl flex items-center justify-center ring-1 ring-cyan-500/20 shadow-sm shrink-0">
                  <Wifi className="w-4.5 h-4.5 text-cyan-500" strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <h1 className="text-base font-bold text-foreground leading-none">SmartLife</h1>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-muted-foreground/40'}`} />
                    <span className="text-[11px] text-muted-foreground">{isConnected ? 'Conectado' : 'Não configurado'}</span>
                  </div>
                </div>
              </div>
              {/* Config button */}
              <Link href="/settings/sensors">
                <button className="w-8 h-8 rounded-xl bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors shrink-0">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                </button>
              </Link>
            </div>

            {/* Internal tabs */}
            <div className="flex gap-1 mt-4 bg-muted/40 rounded-xl p-1">
              {([
                { key: 'devices', label: 'Dispositivos', icon: Power },
                { key: 'scenes',  label: 'Cenas',        icon: Zap  },
              ] as { key: Tab; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                    tab === key
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Spacer */}
        <div aria-hidden="true" className="pt-safe" style={{ paddingBottom: '128px' }} />

        {/* Content */}
        <main className="container mx-auto px-4 pb-28 sm:pb-8 max-w-2xl">
          {tab === 'devices' ? <DevicesTab /> : <ScenesTab />}
        </main>
      </div>
    </PageTransition>
  );
}
