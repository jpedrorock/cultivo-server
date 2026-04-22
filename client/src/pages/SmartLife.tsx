import { useState, useEffect } from 'react';
import {
  Wifi, WifiOff, Power, Play, Loader2, Plus, X, Settings,
  Zap, Home, ChevronDown, ChevronUp, AlertCircle, RefreshCw,
  Check, ToggleLeft, ToggleRight, ChevronRight, Pencil,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { PageTransition } from '@/components/PageTransition';
import { Button } from '@/components/ui/button';
import { TentIcon } from '@/components/TentIcon';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'devices' | 'scenes' | 'sensors' | 'config';

interface DeviceMapping {
  tentId: number;
  deviceId: string;
  deviceName: string;
  switchCode: string;
  enabled: boolean;
}

type Region = 'eu' | 'us' | 'cn' | 'in';
type PollInterval = 30 | 60 | 180 | 480 | 720;

const REGION_LABELS: Record<Region, string> = {
  eu: 'Europa', us: 'América', cn: 'China', in: 'Índia',
};

const POLL_OPTIONS: { value: PollInterval; label: string; sub: string }[] = [
  { value: 30,  label: 'A cada 30 min',  sub: '~48× por dia' },
  { value: 60,  label: 'A cada 1 hora',  sub: '~24× por dia' },
  { value: 180, label: 'A cada 3 horas', sub: '~8× por dia' },
  { value: 480, label: '3× ao dia',      sub: 'manhã, tarde, noite' },
  { value: 720, label: '2× ao dia',      sub: 'manhã e noite' },
];

// ─── CredentialField ──────────────────────────────────────────────────────────

function CredentialField({ label, value, onChange, placeholder, mono, secret }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; mono?: boolean; secret?: boolean;
}) {
  const [show, setShow] = useState(!secret);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50 ${mono ? 'font-mono' : ''}`}
        />
      </div>
      {secret && (
        <button onClick={() => setShow(v => !v)}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg bg-muted"
        >
          {show ? 'Ocultar' : 'Ver'}
        </button>
      )}
    </div>
  );
}

// ─── ConfigTab ────────────────────────────────────────────────────────────────

function ConfigTab({ onSaved }: { onSaved: () => void }) {
  const [accessId, setAccessId] = useState('');
  const [accessSecret, setAccessSecret] = useState('');
  const [region, setRegion] = useState<Region>('eu');
  const [pollInterval, setPollInterval] = useState<PollInterval>(180);
  const [integrationEnabled, setIntegrationEnabled] = useState(true);
  const [connStatus, setConnStatus] = useState<null | 'ok' | 'error'>(null);
  const [connMsg, setConnMsg] = useState('');

  const { data: config } = trpc.tuya.getConfig.useQuery();

  useEffect(() => {
    if (config) {
      setAccessId(config.accessId);
      setAccessSecret(config.accessSecret);
      setRegion(config.region as Region);
      setPollInterval(config.pollIntervalMin as PollInterval);
      setIntegrationEnabled(config.enabled);
    }
  }, [config]);

  const saveConfig = trpc.tuya.saveConfig.useMutation({
    onSuccess: () => { toast.success('Configuração salva!'); onSaved(); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const testConn = trpc.tuya.testConnection.useMutation({
    onSuccess: (r) => {
      setConnStatus(r.ok ? 'ok' : 'error');
      setConnMsg(r.ok ? 'Conectado com sucesso!' : (r.error ?? 'Erro desconhecido'));
    },
    onError: (e) => { setConnStatus('error'); setConnMsg(e.message); },
  });

  return (
    <div className="space-y-4 pt-2">
      {/* Guia */}
      <div className="rounded-2xl bg-blue-500/8 border border-blue-500/20 p-4 space-y-1.5">
        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">Como obter as credenciais</p>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Acesse <span className="font-mono text-foreground">iot.tuya.com</span> e crie uma conta</li>
          <li>Crie um <strong>Cloud Project</strong> → Smart Home → Data Center: Western Europe</li>
          <li>Em <strong>Devices → Link App Account</strong>, leia o QR code no SmartLife</li>
          <li>Copie o <strong>Access ID</strong> e <strong>Access Secret</strong></li>
        </ol>
      </div>

      {/* Toggle geral */}
      <div className="bg-card border border-border rounded-2xl px-4 py-3.5 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Integração ativa</p>
          <p className="text-xs text-muted-foreground">Liga/desliga toda a leitura automática</p>
        </div>
        <button onClick={() => setIntegrationEnabled(v => !v)}>
          {integrationEnabled
            ? <ToggleRight className="w-8 h-8 text-emerald-500" />
            : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
        </button>
      </div>

      {/* Credenciais */}
      <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
        <CredentialField label="Access ID" value={accessId}
          onChange={(v) => { setAccessId(v); setConnStatus(null); setConnMsg(''); }}
          placeholder="Ex: 9gk3qwi8nf2mxxx" mono secret />
        <CredentialField label="Access Secret" value={accessSecret}
          onChange={(v) => { setAccessSecret(v); setConnStatus(null); setConnMsg(''); }}
          placeholder="Ex: a1b2c3d4e5f6..." mono secret />
      </div>

      {/* Região */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 pt-3 pb-2">Região do servidor</p>
        <div className="grid grid-cols-2 gap-2 px-4 pb-4">
          {(Object.keys(REGION_LABELS) as Region[]).map(r => (
            <button key={r} onClick={() => { setRegion(r); setConnStatus(null); setConnMsg(''); }}
              className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                region === r
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
                  : 'border-border text-muted-foreground hover:bg-muted/60'
              }`}
            >
              {REGION_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Frequência */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 pt-3 pb-2">Frequência de leitura automática</p>
        <div className="divide-y divide-border">
          {POLL_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setPollInterval(opt.value)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="text-left">
                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.sub}</p>
              </div>
              {pollInterval === opt.value && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      {connStatus && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm ${
          connStatus === 'ok'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
            : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
        }`}>
          {connStatus === 'ok' ? <Wifi className="w-4 h-4 shrink-0" /> : <WifiOff className="w-4 h-4 shrink-0" />}
          <span>{connMsg}</span>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1"
          disabled={testConn.isPending || !accessId || !accessSecret}
          onClick={() => testConn.mutate({ accessId, accessSecret, region })}
        >
          {testConn.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Wifi className="w-4 h-4 mr-2" />}
          Testar conexão
        </Button>
        <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700"
          disabled={saveConfig.isPending}
          onClick={() => saveConfig.mutate({ accessId, accessSecret, region, pollIntervalMin: pollInterval, enabled: integrationEnabled })}
        >
          {saveConfig.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}

// ─── SensoresTab ──────────────────────────────────────────────────────────────

function SensoresTab() {
  const [mappings, setMappings] = useState<Record<number, { deviceId: string; deviceName: string; enabled: boolean }>>({});
  const [openPicker, setOpenPicker] = useState<number | null>(null);
  const [manualDraft, setManualDraft] = useState<Record<number, { deviceId: string; deviceName: string }>>({});
  const [syncingTentId, setSyncingTentId] = useState<number | null>(null);

  const { data: config } = trpc.tuya.getConfig.useQuery();
  const { data: tents = [] } = trpc.tents.list.useQuery();
  const { data: savedMappings = [] } = trpc.tuya.getMappings.useQuery();
  const { data: devices = [], isLoading: devicesLoading, isError: devicesError } = trpc.tuya.listDevices.useQuery(
    undefined, { enabled: !!config && openPicker !== null, retry: false, staleTime: 60_000 }
  );
  const { data: latestReadings = {}, refetch: refetchReadings } = trpc.tuya.getLatestReadingsAll.useQuery();

  const useManualEntry = !devicesLoading && (devicesError || devices.length === 0);

  useEffect(() => {
    if (savedMappings.length > 0) {
      const m: typeof mappings = {};
      for (const s of savedMappings) m[s.tentId] = { deviceId: s.deviceId, deviceName: s.deviceName, enabled: s.enabled };
      setMappings(m);
    }
  }, [savedMappings]);

  const saveMappings = trpc.tuya.saveMappings.useMutation({
    onSuccess: () => toast.success('Sensor salvo!', { duration: 2000 }),
    onError: (e) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  const readNow = trpc.tuya.readNow.useMutation({
    onSuccess: () => { setSyncingTentId(null); toast.success('Leitura atualizada!'); refetchReadings(); },
    onError: (e) => { setSyncingTentId(null); toast.error(`Sensor: ${e.message}`); },
  });

  const persistMappings = (newMappings: typeof mappings) => {
    saveMappings.mutate(
      Object.entries(newMappings).map(([tentId, m]) => ({
        tentId: Number(tentId), deviceId: m.deviceId, deviceName: m.deviceName, enabled: m.enabled,
      }))
    );
  };

  const handlePickDevice = (tentId: number, deviceId: string, deviceName: string) => {
    const updated = { ...mappings, [tentId]: { deviceId, deviceName, enabled: mappings[tentId]?.enabled ?? true } };
    setMappings(updated);
    setOpenPicker(null);
    persistMappings(updated);
  };

  const handleToggle = (tentId: number) => {
    const current = mappings[tentId];
    if (!current) return;
    const updated = { ...mappings, [tentId]: { ...current, enabled: !current.enabled } };
    setMappings(updated);
    persistMappings(updated);
  };

  const handleRemove = (tentId: number) => {
    const updated = { ...mappings };
    delete updated[tentId];
    setMappings(updated);
    persistMappings(updated);
  };

  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
        <WifiOff className="w-12 h-12 text-muted-foreground/30" />
        <div>
          <p className="font-medium text-foreground">API não configurada</p>
          <p className="text-sm text-muted-foreground mt-1">Configure as credenciais Tuya primeiro</p>
        </div>
      </div>
    );
  }

  if (devicesLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-sm">Buscando dispositivos SmartLife...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      {useManualEntry && (
        <div className="rounded-2xl bg-amber-500/8 border border-amber-500/20 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Inserção manual de Device ID</p>
          <p className="text-xs text-muted-foreground">
            A listagem automática não está disponível. Cole o <strong>Device ID</strong> de cada sensor do portal Tuya:
          </p>
          <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
            <li>Acesse <span className="font-mono text-foreground">iot.tuya.com</span> → seu projeto → aba <strong>Devices</strong></li>
            <li>Copie o <strong>Device ID</strong> do sensor</li>
            <li>Cole abaixo na estufa correspondente</li>
          </ol>
        </div>
      )}

      {!useManualEntry && (
        <p className="text-xs text-muted-foreground px-1">
          Para cada estufa escolha o sensor de temperatura/umidade correspondente.
        </p>
      )}

      <div className="space-y-3">
        {(tents as any[]).map((tent: any) => {
          const m = mappings[tent.id];
          const isOpen = openPicker === tent.id;
          const draft = manualDraft[tent.id] ?? { deviceId: '', deviceName: tent.name };
          const reading = (latestReadings as any)[tent.id];

          return (
            <div key={tent.id} className="bg-card border border-border rounded-2xl overflow-hidden">
              {/* Header da estufa */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <TentIcon className="w-4.5 h-4.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{tent.name}</p>
                  {m ? (
                    <>
                      <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                        <Wifi className="w-3 h-3 shrink-0 text-emerald-500" />
                        {m.deviceName}
                      </p>
                      {reading && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                          {reading.tempC != null && <span className="text-amber-500 font-medium">{reading.tempC.toFixed(1)}°C</span>}
                          {reading.rhPct != null && <span className="text-blue-500 font-medium">{reading.rhPct.toFixed(0)}%</span>}
                          <span className="text-muted-foreground/60">
                            {new Date(reading.readAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">Sem sensor</p>
                  )}
                </div>
                {m && (
                  <button onClick={() => handleToggle(tent.id)} className="shrink-0">
                    {m.enabled
                      ? <ToggleRight className="w-7 h-7 text-emerald-500" />
                      : <ToggleLeft className="w-7 h-7 text-muted-foreground" />}
                  </button>
                )}
                {m && m.enabled && !isOpen && (
                  <button
                    onClick={() => { setSyncingTentId(tent.id); readNow.mutate({ tentId: tent.id }); }}
                    disabled={syncingTentId === tent.id}
                    className="shrink-0 w-8 h-8 rounded-lg bg-muted hover:bg-emerald-500/10 flex items-center justify-center transition-colors disabled:opacity-40"
                    title="Sincronizar agora"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${syncingTentId === tent.id ? 'animate-spin' : ''}`} />
                  </button>
                )}
                {m && !isOpen && (
                  <button onClick={() => handleRemove(tent.id)}
                    className="shrink-0 w-8 h-8 rounded-lg bg-muted hover:bg-red-500/10 flex items-center justify-center transition-colors">
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}
                <button
                  onClick={() => setOpenPicker(isOpen ? null : tent.id)}
                  className="shrink-0 w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
                >
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <Pencil className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
              </div>

              {/* Picker */}
              {isOpen && (
                <div className="border-t border-border/50">
                  {!useManualEntry && devices.length > 0 && (
                    <div className="divide-y divide-border/50 max-h-56 overflow-y-auto">
                      <button
                        onClick={() => { handleRemove(tent.id); setOpenPicker(null); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 ${!m ? 'bg-muted/30' : ''}`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <WifiOff className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground italic flex-1">Sem sensor</p>
                        {!m && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                      </button>
                      {(devices as any[]).map((dev: any) => {
                        const selected = m?.deviceId === dev.id;
                        return (
                          <button key={dev.id}
                            onClick={() => handlePickDevice(tent.id, dev.id, dev.name)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${selected ? 'bg-emerald-500/8' : 'hover:bg-muted/40'}`}
                          >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${dev.online ? 'bg-emerald-500/15' : 'bg-muted'}`}>
                              {dev.online ? <Wifi className="w-4 h-4 text-emerald-500" /> : <WifiOff className="w-4 h-4 text-muted-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{dev.name}</p>
                              <p className="text-[10px] text-muted-foreground">{dev.online ? 'Online' : 'Offline'}</p>
                            </div>
                            {selected && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {useManualEntry && (
                    <div className="px-4 py-4 space-y-3">
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">Device ID <span className="text-muted-foreground/60">(do portal iot.tuya.com)</span></p>
                        <input
                          type="text"
                          value={draft.deviceId}
                          onChange={e => setManualDraft(prev => ({ ...prev, [tent.id]: { ...draft, deviceId: e.target.value.trim() } }))}
                          placeholder="ex: eb8168f5771604de9ccjsi"
                          className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-emerald-500/50"
                        />
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">Nome do sensor</p>
                        <input
                          type="text"
                          value={draft.deviceName}
                          onChange={e => setManualDraft(prev => ({ ...prev, [tent.id]: { ...draft, deviceName: e.target.value } }))}
                          placeholder={`Sensor ${tent.name}`}
                          className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-emerald-500/50"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1"
                          onClick={() => { handleRemove(tent.id); setOpenPicker(null); }}>
                          <X className="w-3.5 h-3.5 mr-1" /> Sem sensor
                        </Button>
                        <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                          disabled={!draft.deviceId}
                          onClick={() => {
                            if (!draft.deviceId) return;
                            handlePickDevice(tent.id, draft.deviceId, draft.deviceName || tent.name);
                            setManualDraft(prev => ({ ...prev, [tent.id]: { deviceId: '', deviceName: tent.name } }));
                          }}
                        >
                          <Check className="w-3.5 h-3.5 mr-1" /> Confirmar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {saveMappings.isPending
          ? <span className="flex items-center justify-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Salvando...</span>
          : '✓ Configurações salvas automaticamente'}
      </p>
    </div>
  );
}

// ─── DeviceToggle ─────────────────────────────────────────────────────────────

function DeviceToggle({ mapping }: { mapping: DeviceMapping }) {
  const { data: status, isLoading, refetch } = trpc.tuya.getDeviceCurrentStatus.useQuery(
    { deviceId: mapping.deviceId },
    { refetchInterval: 30_000, retry: false }
  );

  const cmd = trpc.tuya.sendDeviceCommand.useMutation({
    onSuccess: () => { setTimeout(() => refetch(), 600); },
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
        <span className={`w-2 h-2 rounded-full shrink-0 ${isLoading ? 'bg-muted animate-pulse' : isOnline ? 'bg-green-400' : 'bg-red-400/50'}`} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{mapping.deviceName}</p>
          <p className="text-[11px] text-muted-foreground/60">
            {isLoading ? 'Verificando...' : isOnline
              ? (status?.switchOn === null ? 'Online · sem controle' : isOn ? 'Ligado' : 'Desligado')
              : 'Offline'}
          </p>
        </div>
      </div>
      {!isLoading && status?.switchOn !== null && isOnline && (
        <button
          onClick={toggle}
          disabled={pending}
          className={`relative w-12 h-6 rounded-full transition-all duration-300 shrink-0 disabled:opacity-60 ${isOn ? 'bg-green-500' : 'bg-muted'}`}
        >
          {pending
            ? <Loader2 className="absolute inset-0 m-auto w-3.5 h-3.5 animate-spin text-white" />
            : <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300 ${isOn ? 'left-[26px]' : 'left-0.5'}`} />
          }
        </button>
      )}
      {!isLoading && !isOnline && <WifiOff className="w-4 h-4 text-muted-foreground/30 shrink-0" />}
    </div>
  );
}

// ─── DevicesTab ───────────────────────────────────────────────────────────────

function DevicesTab() {
  const [addingTentId, setAddingTentId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualDeviceId, setManualDeviceId] = useState('');
  const [manualDeviceName, setManualDeviceName] = useState('');
  const utils = trpc.useUtils();

  const { data: mappings = [], isLoading: mappingsLoading } = trpc.tuya.getDeviceMappings.useQuery();
  const { data: tents = [] } = trpc.tents.list.useQuery();
  const { data: config } = trpc.tuya.getConfig.useQuery();
  const { data: allDevices = [], isLoading: devicesLoading } = trpc.tuya.listDevices.useQuery(
    undefined, { enabled: !!config && pickerOpen, retry: false, staleTime: 60_000 }
  );

  const useManualEntry = !devicesLoading && allDevices.length === 0;

  const SENSOR_CATS = ['wsdcg', 'mcs', 'zdkj', 'wnykq', 'hjjcy'];
  const mappedDeviceIds = new Set(mappings.map((m: DeviceMapping) => m.deviceId));
  const controllableDevices = (allDevices as any[]).filter((d: any) => !SENSOR_CATS.includes(d.category));
  const pickerDevices = controllableDevices.filter((d: any) => !mappedDeviceIds.has(d.id));

  const saveDeviceMappings = trpc.tuya.saveDeviceMappings.useMutation({
    onSuccess: () => { utils.tuya.getDeviceMappings.invalidate(); setAddingTentId(null); setPickerOpen(false); toast.success('Dispositivo adicionado!'); },
    onError: (e) => toast.error(e.message),
  });

  const removeDevice = trpc.tuya.saveDeviceMappings.useMutation({
    onSuccess: () => { utils.tuya.getDeviceMappings.invalidate(); toast.success('Dispositivo removido'); },
    onError: (e) => toast.error(e.message),
  });

  const byTent = mappings.reduce<Record<number, DeviceMapping[]>>((acc, m: DeviceMapping) => {
    if (!acc[m.tentId]) acc[m.tentId] = [];
    acc[m.tentId].push(m);
    return acc;
  }, {});

  const mappedTentIds = Object.keys(byTent).map(Number);

  const handleAddDevice = (tentId: number, device: { id: string; name: string }) => {
    const existing = (byTent[tentId] ?? []).map((m: DeviceMapping) => ({
      tentId: m.tentId, deviceId: m.deviceId, deviceName: m.deviceName, switchCode: m.switchCode, enabled: m.enabled,
    }));
    saveDeviceMappings.mutate([...existing, { tentId, deviceId: device.id, deviceName: device.name, switchCode: 'switch_1', enabled: true }]);
  };

  const handleAddManual = () => {
    if (!manualDeviceId.trim() || addingTentId === null) return;
    handleAddDevice(addingTentId, { id: manualDeviceId.trim(), name: manualDeviceName.trim() || `Dispositivo ${manualDeviceId.trim().slice(-6)}` });
    setManualDeviceId('');
    setManualDeviceName('');
  };

  const handleRemoveDevice = (mapping: DeviceMapping) => {
    const remaining = (byTent[mapping.tentId] ?? [])
      .filter((m: DeviceMapping) => m.deviceId !== mapping.deviceId)
      .map((m: DeviceMapping) => ({ tentId: m.tentId, deviceId: m.deviceId, deviceName: m.deviceName, switchCode: m.switchCode, enabled: m.enabled }));
    removeDevice.mutate(remaining);
  };

  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
        <Power className="w-12 h-12 text-muted-foreground/30" />
        <div>
          <p className="font-medium text-foreground">API não configurada</p>
          <p className="text-sm text-muted-foreground mt-1">Configure suas credenciais Tuya primeiro</p>
        </div>
      </div>
    );
  }

  if (mappingsLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4 pt-2">
      {mappedTentIds.map(tentId => {
        const tent = (tents as any[]).find((t: any) => t.id === tentId);
        const tentDevices = byTent[tentId] ?? [];
        return (
          <div key={tentId} className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/30 bg-muted/20">
              <Home className="w-3.5 h-3.5 text-muted-foreground/60" />
              <p className="text-sm font-semibold text-foreground flex-1">{tent?.name ?? `Estufa #${tentId}`}</p>
              <button
                onClick={() => { setAddingTentId(tentId); setPickerOpen(true); }}
                className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-primary" />
              </button>
            </div>
            <div>
              {tentDevices.map((m: DeviceMapping) => (
                <div key={m.deviceId} className="relative group">
                  <DeviceToggle mapping={m} />
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

      {mappedTentIds.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 py-12 text-center px-6">
          <Power className="w-10 h-10 mx-auto text-muted-foreground/25 mb-3" />
          <p className="font-medium text-foreground">Nenhum dispositivo mapeado</p>
          <p className="text-sm text-muted-foreground mt-1">Adicione tomadas ou relés para controlar aqui</p>
        </div>
      )}

      {/* Adicionar a uma estufa */}
      {(tents as any[]).length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 pt-3 pb-2">Adicionar dispositivo</p>
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {(tents as any[]).map((tent: any) => (
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

      {/* Device picker modal */}
      {pickerOpen && addingTentId !== null && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pt-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setPickerOpen(false); setManualDeviceId(''); setManualDeviceName(''); }} />
          <div className="relative bg-card border border-border rounded-2xl w-full max-w-md max-h-[75vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
              <p className="font-semibold text-foreground">Escolher dispositivo</p>
              <button onClick={() => { setPickerOpen(false); setManualDeviceId(''); setManualDeviceName(''); }} className="w-7 h-7 rounded-full bg-muted/60 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {devicesLoading ? (
                <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Buscando dispositivos...</span>
                </div>
              ) : useManualEntry ? (
                /* ── Modo manual ── */
                <div className="px-5 py-5 space-y-4">
                  <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 p-3.5 space-y-1.5">
                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Inserção manual de Device ID</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      A listagem automática não está disponível. Encontre o <strong>Device ID</strong> em{' '}
                      <span className="font-mono text-foreground">iot.tuya.com</span> → seu projeto → aba <strong>Devices</strong>.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">
                        Device ID <span className="text-muted-foreground/50">(do portal iot.tuya.com)</span>
                      </p>
                      <input
                        type="text"
                        value={manualDeviceId}
                        onChange={e => setManualDeviceId(e.target.value.trim())}
                        placeholder="ex: eb8168f5771604de9ccjsi"
                        className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-emerald-500/50"
                      />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">Nome do dispositivo</p>
                      <input
                        type="text"
                        value={manualDeviceName}
                        onChange={e => setManualDeviceName(e.target.value)}
                        placeholder="ex: Tomada Ventilador"
                        className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-emerald-500/50"
                      />
                    </div>
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      disabled={!manualDeviceId.trim() || saveDeviceMappings.isPending}
                      onClick={handleAddManual}
                    >
                      {saveDeviceMappings.isPending
                        ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Adicionando...</>
                        : <><Check className="w-4 h-4 mr-2" /> Adicionar dispositivo</>}
                    </Button>
                  </div>
                </div>
              ) : pickerDevices.length === 0 ? (
                <div className="py-10 text-center px-6">
                  <p className="text-sm text-muted-foreground">Todos os dispositivos já foram mapeados</p>
                </div>
              ) : (
                pickerDevices.map((device: any) => (
                  <button key={device.id}
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
  const [expandedHomes, setExpandedHomes] = useState<Set<string>>(new Set());

  const { data: config } = trpc.tuya.getConfig.useQuery();
  const { data: scenes = [], isLoading, isError, error: scenesError, refetch } = trpc.tuya.listScenes.useQuery(
    undefined, { enabled: !!config, retry: false }
  );

  // Auto-expand all homes on first load
  useEffect(() => {
    if (scenes.length > 0) {
      const homes = new Set(scenes.map((s: any) => s.homeName));
      setExpandedHomes(homes);
    }
  }, [scenes.length]);

  const triggerScene = trpc.tuya.triggerScene.useMutation({
    onSuccess: () => { toast.success('Cena disparada!'); setTriggeringId(null); },
    onError: (e) => { toast.error(e.message); setTriggeringId(null); },
  });

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
          <p className="font-medium text-foreground">API não configurada</p>
          <p className="text-sm text-muted-foreground mt-1">Configure suas credenciais Tuya primeiro</p>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  if (isError) {
    const errMsg = (scenesError as any)?.message ?? String(scenesError);
    return (
      <div className="rounded-2xl border border-border/40 bg-card py-10 text-center px-6 space-y-3">
        <AlertCircle className="w-8 h-8 mx-auto text-red-400/60" />
        <p className="font-medium text-foreground">Erro ao carregar cenas</p>
        {errMsg && (
          <p className="text-xs font-mono text-red-400 bg-red-500/8 border border-red-500/20 rounded-xl px-3 py-2 text-left break-all">
            {errMsg}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Adicione os serviços <strong>Industry Basic Service</strong> e <strong>Smart Home Scene Linkage</strong> no portal iot.tuya.com → seu projeto → Service API
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Tentar novamente
        </Button>
      </div>
    );
  }

  if (scenes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 py-12 text-center px-6">
        <Zap className="w-10 h-10 mx-auto text-muted-foreground/25 mb-3" />
        <p className="font-medium text-foreground">Nenhuma cena encontrada</p>
        <p className="text-sm text-muted-foreground mt-1">Crie cenas no app SmartLife para vê-las aqui</p>
      </div>
    );
  }

  const grouped = (scenes as any[]).reduce<Record<string, any[]>>((acc, s) => {
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
            <button
              className="w-full flex items-center gap-2.5 px-4 py-3 border-b border-border/30 bg-muted/20 hover:bg-muted/30 transition-colors text-left"
              onClick={() => toggleHome(homeName)}
            >
              <Home className="w-3.5 h-3.5 text-muted-foreground/60" />
              <p className="text-sm font-semibold text-foreground flex-1">{homeName}</p>
              <span className="text-xs text-muted-foreground/50">{homeScenes.length} cena{homeScenes.length !== 1 ? 's' : ''}</span>
              {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground/40" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/40" />}
            </button>
            {isOpen && (
              <div>
                {homeScenes.map((scene: any) => {
                  const isTriggering = triggeringId === scene.sceneId;
                  return (
                    <div key={scene.sceneId} className="flex items-center gap-3 px-4 py-3.5 border-b border-border/20 last:border-0">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                        <Zap className="w-4 h-4 text-amber-500" />
                      </div>
                      <p className="flex-1 text-sm font-medium text-foreground truncate">{scene.name}</p>
                      <button
                        onClick={() => { setTriggeringId(scene.sceneId); triggerScene.mutate({ sceneId: scene.sceneId, homeId: scene.homeId }); }}
                        disabled={!!triggeringId}
                        className="flex items-center gap-1.5 h-8 px-3.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 shrink-0"
                      >
                        {isTriggering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        {isTriggering ? 'Disparando...' : 'Disparar'}
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

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'devices',  label: 'Dispositivos', icon: Power    },
  { key: 'scenes',   label: 'Cenas',        icon: Zap      },
  { key: 'sensors',  label: 'Sensores',     icon: Wifi     },
  { key: 'config',   label: 'Config',       icon: Settings },
];

export default function SmartLife() {
  const [tab, setTab] = useState<Tab>('devices');
  const { data: config } = trpc.tuya.getConfig.useQuery();
  const isConnected = !!config?.enabled;

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">

        {/* Header fixo */}
        <header className="bg-card border-b border-border fixed top-0 left-0 right-0 z-20 pt-safe">
          <div className="container py-4 max-w-2xl">
            {/* Título + status */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-cyan-500/15 rounded-xl flex items-center justify-center ring-1 ring-cyan-500/20 shadow-sm shrink-0">
                <Wifi className="w-4.5 h-4.5 text-cyan-500" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-base font-bold text-foreground leading-none">SmartLife</h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-muted-foreground/40'}`} />
                  <span className="text-[11px] text-muted-foreground">{isConnected ? 'Conectado' : 'Não configurado'}</span>
                </div>
              </div>
            </div>

            {/* Abas — scroll horizontal em telas pequenas */}
            <div className="flex gap-1 mt-4 bg-muted/40 rounded-xl p-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex-1 min-w-max flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    tab === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Spacer */}
        <div aria-hidden="true" className="pt-safe" style={{ paddingBottom: '136px' }} />

        {/* Conteúdo */}
        <main className="container mx-auto px-4 pb-28 sm:pb-8 max-w-2xl">
          {tab === 'devices' && <DevicesTab />}
          {tab === 'scenes'  && <ScenesTab />}
          {tab === 'sensors' && <SensoresTab />}
          {tab === 'config'  && <ConfigTab onSaved={() => setTab('sensors')} />}
        </main>
      </div>
    </PageTransition>
  );
}
