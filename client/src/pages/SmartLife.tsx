import { useState, useEffect, useRef } from 'react';
import {
  Wifi, WifiOff, Power, Play, Loader2, Plus, X, Settings,
  Zap, Home, ChevronDown, ChevronUp, RefreshCw,
  Check, ToggleLeft, ToggleRight, ChevronRight, Pencil, Search, Trash2, Clock,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { PageTransition, AnimatePresence, TabContent } from '@/components/PageTransition';
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
  const inputId = `smartlife-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <label htmlFor={inputId} className="block text-xs text-muted-foreground mb-1">{label}</label>
        <input
          id={inputId}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:outline-none ${mono ? 'font-mono' : ''}`}
        />
      </div>
      {secret && (
        <button
          onClick={() => setShow(v => !v)}
          aria-label={show ? 'Ocultar valor' : 'Mostrar valor'}
          aria-pressed={show}
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
  const [homeId, setHomeId] = useState('');
  const [smartlifeUid, setSmartlifeUid] = useState('');
  const [resolvedHomes, setResolvedHomes] = useState<Array<{ homeId: string; name: string }>>([]);
  const [connStatus, setConnStatus] = useState<null | 'ok' | 'error'>(null);
  const [connMsg, setConnMsg] = useState('');

  const { data: config } = trpc.tuya.getConfig.useQuery();

  useEffect(() => {
    if (config) {
      setAccessId(config.accessId);
      // Nunca popular com o segredo — usuário digita novo apenas se quiser trocar
      setAccessSecret('');
      setRegion(config.region as Region);
      setPollInterval(config.pollIntervalMin as PollInterval);
      setIntegrationEnabled(config.enabled);
      setHomeId(config.homeId ?? '');
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

  const resolveHomes = trpc.tuya.resolveHomeId.useMutation({
    onSuccess: (homes) => {
      setResolvedHomes(homes);
      if (homes.length === 1) {
        setHomeId(homes[0].homeId);
        toast.success(`Casa encontrada: ${homes[0].name} — Home ID preenchido!`);
      } else if (homes.length === 0) {
        toast.warning('Nenhuma casa encontrada para esse UID');
      } else {
        toast.success(`${homes.length} casas encontradas — escolha abaixo`);
      }
    },
    onError: (e) => toast.error(`Erro ao buscar casas: ${e.message}`),
  });

  return (
    <div className="space-y-4 pt-2">
      {/* Guia */}
      <div className="rounded-2xl bg-blue-500/8 border border-blue-500/20 p-4 space-y-3">
        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">Como configurar</p>

        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-foreground">① Access ID e Access Secret</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-mono text-foreground">iot.tuya.com</span> → Cloud → seu projeto → aba <strong>Overview</strong> → campo <strong>Access ID/Client ID</strong> e <strong>Access Secret</strong>
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-foreground">② Região</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Veja no canto superior direito do portal. <strong>Western America</strong> = América · <strong>Western Europe</strong> = Europa · <strong>China</strong> = China
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-foreground">③ Vincular SmartLife (para sensores e dispositivos)</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Aba <strong>Devices → Link App Account</strong> → clique em <strong>Add App Account</strong> → escaneie o QR code no SmartLife. Após vincular, o UID do usuário aparece na coluna <strong>UID</strong> e os Device IDs aparecem em <strong>All Devices</strong>.
          </p>
        </div>
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
          placeholder={config?.accessSecretMasked ? "Segredo salvo — deixe vazio para manter" : "Ex: a1b2c3d4e5f6..."} mono secret />
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

      {/* Home ID — busca automática via UID SmartLife */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 pt-3 pb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Home ID <span className="normal-case font-normal">(para cenas)</span>
          </p>

          {/* Busca pelo UID SmartLife */}
          <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">
            UID do usuário SmartLife{' '}
            <span className="font-normal text-muted-foreground/60">
              (API Explorer → Smart Home User Management → Query User List → campo <span className="font-mono">uid</span>)
            </span>
          </p>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={smartlifeUid}
              onChange={e => setSmartlifeUid(e.target.value.trim())}
              placeholder="ex: eu1234567890abcdef"
              className="flex-1 bg-muted rounded-xl px-3 py-2 text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-emerald-500/50"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!smartlifeUid || resolveHomes.isPending || !accessId}
              onClick={() => resolveHomes.mutate({ smartlifeUid })}
              className="shrink-0 gap-1.5"
            >
              {resolveHomes.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Search className="w-3.5 h-3.5" />}
              {resolveHomes.isPending ? 'Buscando...' : 'Buscar casas'}
            </Button>
          </div>

          {/* Casas encontradas */}
          {resolvedHomes.length > 0 && (
            <div className="rounded-xl border border-border/60 overflow-hidden mb-3">
              {resolvedHomes.map(h => (
                <button
                  key={h.homeId}
                  onClick={() => setHomeId(h.homeId)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-border/30 last:border-0 ${
                    homeId === h.homeId ? 'bg-emerald-500/8' : 'hover:bg-muted/40'
                  }`}
                >
                  <Home className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{h.name}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{h.homeId}</p>
                  </div>
                  {homeId === h.homeId && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {/* Home ID manual (fallback) */}
          <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">
            Home ID <span className="font-normal text-muted-foreground/60">(preenchido automaticamente acima, ou insira manualmente)</span>
          </p>
          <input
            type="text"
            value={homeId}
            onChange={e => setHomeId(e.target.value.trim())}
            placeholder="ex: 123456789"
            className="w-full bg-muted rounded-xl px-3 py-2 text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-emerald-500/50 mb-1"
          />
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
          onClick={() => saveConfig.mutate({ accessId, accessSecret, region, pollIntervalMin: pollInterval, enabled: integrationEnabled, homeId: homeId || undefined })}
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

const SWIPE_DELETE_WIDTH = 80;
const SWIPE_THRESHOLD = 50;

function DeviceToggle({ mapping, onRemove }: { mapping: DeviceMapping; onRemove: () => void }) {
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

  // Swipe state
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const dragging = useRef(false);

  const toggle = () => {
    const code = status?.switchCode ?? mapping.switchCode;
    cmd.mutate({ deviceId: mapping.deviceId, switchCode: code, value: !isOn });
  };

  const closeSwipe = () => { setOffset(0); setOpen(false); };

  const startDrag = (clientX: number) => {
    startX.current = clientX;
    startOffset.current = offset;
    dragging.current = true;
  };

  const moveDrag = (clientX: number) => {
    if (!dragging.current) return;
    const delta = startX.current - clientX;
    const next = Math.max(0, Math.min(SWIPE_DELETE_WIDTH, startOffset.current + delta));
    setOffset(next);
  };

  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (offset > SWIPE_THRESHOLD) {
      setOffset(SWIPE_DELETE_WIDTH);
      setOpen(true);
    } else {
      setOffset(0);
      setOpen(false);
    }
  };

  // Touch
  const onTouchStart = (e: React.TouchEvent) => startDrag(e.touches[0].clientX);
  const onTouchMove  = (e: React.TouchEvent) => moveDrag(e.touches[0].clientX);
  const onTouchEnd   = () => endDrag();

  // Mouse (desktop)
  const onMouseDown = (e: React.MouseEvent) => startDrag(e.clientX);
  const onMouseMove = (e: React.MouseEvent) => moveDrag(e.clientX);
  const onMouseUp   = () => endDrag();

  return (
    <div className="relative overflow-hidden border-b border-border/20 last:border-0">
      {/* Botão excluir revelado no swipe */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center justify-center bg-red-500"
        style={{ width: SWIPE_DELETE_WIDTH }}
      >
        <button
          onClick={() => { closeSwipe(); onRemove(); }}
          className="w-full h-full flex flex-col items-center justify-center gap-1"
        >
          <Trash2 className="w-5 h-5 text-white" />
          <span className="text-[10px] font-semibold text-white">Excluir</span>
        </button>
      </div>

      {/* Linha principal — desliza para esquerda */}
      <div
        className="relative bg-card flex items-center gap-3 px-4 py-3.5"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={() => open && closeSwipe()}
        style={{
          transform: `translateX(-${offset}px)`,
          transition: dragging.current ? 'none' : 'transform 0.25s ease',
          cursor: open ? 'default' : 'grab',
          userSelect: 'none',
        }}
      >
        {/* Status dot */}
        <span className={`w-2 h-2 rounded-full shrink-0 ${isLoading ? 'bg-muted animate-pulse' : isOnline ? 'bg-green-400' : 'bg-red-400/50'}`} />

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{mapping.deviceName}</p>
          <p className="text-[11px] text-muted-foreground/60">
            {isLoading ? 'Verificando...' : isOnline
              ? (status?.switchOn === null ? 'Online · sem controle' : isOn ? 'Ligado' : 'Desligado')
              : 'Offline'}
          </p>
        </div>

        {/* Toggle switch */}
        {!isLoading && status?.switchOn !== null && isOnline && (
          <button
            onClick={e => { e.stopPropagation(); if (open) { closeSwipe(); return; } toggle(); }}
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
    </div>
  );
}

// ─── DevicesTab ───────────────────────────────────────────────────────────────

function DevicesTab() {
  // modal state: null = fechado | 'tent' = escolher estufa | 'device' = escolher dispositivo
  const [modalStep, setModalStep] = useState<null | 'tent' | 'device'>(null);
  const [addingTentId, setAddingTentId] = useState<number | null>(null);
  const [manualDeviceId, setManualDeviceId] = useState('');
  const [manualDeviceName, setManualDeviceName] = useState('');
  const utils = trpc.useUtils();

  const pickerOpen = modalStep === 'device';

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
    onSuccess: () => { utils.tuya.getDeviceMappings.invalidate(); closeModal(); toast.success('Dispositivo adicionado!'); },
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

  const closeModal = () => { setModalStep(null); setAddingTentId(null); setManualDeviceId(''); setManualDeviceName(''); };

  const handleAddDevice = (tentId: number, device: { id: string; name: string }) => {
    const existing = (byTent[tentId] ?? []).map((m: DeviceMapping) => ({
      tentId: m.tentId, deviceId: m.deviceId, deviceName: m.deviceName, switchCode: m.switchCode, enabled: m.enabled,
    }));
    saveDeviceMappings.mutate([...existing, { tentId, deviceId: device.id, deviceName: device.name, switchCode: 'switch_1', enabled: true }]);
  };

  const handleAddManual = () => {
    if (!manualDeviceId.trim() || addingTentId === null) return;
    handleAddDevice(addingTentId, { id: manualDeviceId.trim(), name: manualDeviceName.trim() || `Dispositivo ${manualDeviceId.trim().slice(-6)}` });
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
      {/* Lista de dispositivos por estufa */}
      {mappedTentIds.map(tentId => {
        const tent = (tents as any[]).find((t: any) => t.id === tentId);
        const tentDevices = byTent[tentId] ?? [];
        return (
          <div key={tentId} className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/30 bg-muted/20">
              <Home className="w-3.5 h-3.5 text-muted-foreground/60" />
              <p className="text-sm font-semibold text-foreground flex-1">{tent?.name ?? `Estufa #${tentId}`}</p>
            </div>
            <div>
              {tentDevices.map((m: DeviceMapping) => (
                <DeviceToggle key={m.deviceId} mapping={m} onRemove={() => handleRemoveDevice(m)} />
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

      {/* Botão único de adicionar */}
      <button
        onClick={() => setModalStep('tent')}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-dashed border-primary/30 bg-primary/5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Adicionar dispositivo
      </button>

      {/* ── Modal ── */}
      {modalStep !== null && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pt-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-card border border-border rounded-2xl w-full max-w-md max-h-[75vh] flex flex-col overflow-hidden shadow-2xl">

            {/* ── Passo 1: Escolher estufa ── */}
            {modalStep === 'tent' && (<>
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
                <p className="font-semibold text-foreground">Em qual estufa?</p>
                <button onClick={closeModal} className="w-7 h-7 rounded-full bg-muted/60 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-2">
                {(tents as any[]).map((tent: any) => (
                  <button key={tent.id}
                    onClick={() => { setAddingTentId(tent.id); setModalStep('device'); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Home className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground">{tent.name}</p>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 ml-auto shrink-0" />
                  </button>
                ))}
              </div>
            </>)}

            {/* ── Passo 2: Escolher dispositivo ── */}
            {modalStep === 'device' && addingTentId !== null && (<>
              <div className="flex items-center gap-2 px-5 py-4 border-b border-border/40">
                <button onClick={() => setModalStep('tent')} className="w-7 h-7 rounded-full bg-muted/60 flex items-center justify-center">
                  <ChevronRight className="w-4 h-4 rotate-180" />
                </button>
                <p className="font-semibold text-foreground flex-1">
                  {(tents as any[]).find((t: any) => t.id === addingTentId)?.name ?? 'Estufa'}
                </p>
                <button onClick={closeModal} className="w-7 h-7 rounded-full bg-muted/60 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1">
                {devicesLoading ? (
                  <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Buscando dispositivos...</span>
                  </div>
                ) : !useManualEntry && pickerDevices.length > 0 ? (
                  /* Lista automática */
                  pickerDevices.map((device: any) => (
                    <button key={device.id}
                      onClick={() => handleAddDevice(addingTentId, device)}
                      disabled={saveDeviceMappings.isPending}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors border-b border-border/20 last:border-0 text-left"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${device.online ? 'bg-green-400' : 'bg-muted-foreground/30'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{device.name}</p>
                        <p className="text-[11px] text-muted-foreground/60">{device.online ? 'Online' : 'Offline'}</p>
                      </div>
                      {saveDeviceMappings.isPending
                        ? <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                        : <Plus className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  ))
                ) : (
                  /* Entrada manual */
                  <div className="px-5 py-5 space-y-3">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Cole o <strong>Device ID</strong> do portal{' '}
                      <span className="font-mono text-foreground">iot.tuya.com</span> → Devices → All Devices.
                    </p>
                    <input
                      type="text"
                      value={manualDeviceId}
                      onChange={e => setManualDeviceId(e.target.value.trim())}
                      placeholder="ex: eb8168f5771604de9ccjsi"
                      className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-emerald-500/50"
                    />
                    <input
                      type="text"
                      value={manualDeviceName}
                      onChange={e => setManualDeviceName(e.target.value)}
                      placeholder="Nome do dispositivo (ex: Tomada Ventilador)"
                      className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-emerald-500/50"
                    />
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      disabled={!manualDeviceId.trim() || saveDeviceMappings.isPending}
                      onClick={handleAddManual}
                    >
                      {saveDeviceMappings.isPending
                        ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Adicionando...</>
                        : <><Check className="w-4 h-4 mr-2" /> Adicionar</>}
                    </Button>
                  </div>
                )}
              </div>
            </>)}

          </div>
        </div>
      )}
    </div>
  );
}

// ─── ScenesTab ────────────────────────────────────────────────────────────────

const SCENE_SWIPE_WIDTH = 80;
const SCENE_SWIPE_THRESHOLD = 50;

function ManualSceneRow({ scene, isTriggering, onTrigger, onDelete, triggerDisabled }: {
  scene: { id: number; sceneId: string; name: string; homeId?: number | null; type?: string };
  isTriggering: boolean;
  onTrigger: () => void;
  onDelete: () => void;
  triggerDisabled: boolean;
}) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const dragging = useRef(false);
  const isAuto = scene.type === 'automation';

  const { data: details, isLoading: detailsLoading } = trpc.tuya.getAutomationDetails.useQuery(
    { ruleId: scene.sceneId },
    { enabled: isAuto && expanded, staleTime: 300_000 }
  );

  const schedules = details?.schedules
    ? formatSchedules(details.schedules as any)
    : parseSchedules(details?.conditions ?? []);

  const closeSwipe = () => { setSwipeOffset(0); setSwipeOpen(false); };

  const startDrag = (clientX: number) => { startX.current = clientX; startOffset.current = swipeOffset; dragging.current = true; };
  const moveDrag = (clientX: number) => {
    if (!dragging.current) return;
    const delta = startX.current - clientX;
    setSwipeOffset(Math.max(0, Math.min(SCENE_SWIPE_WIDTH, startOffset.current + delta)));
  };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (swipeOffset > SCENE_SWIPE_THRESHOLD) { setSwipeOffset(SCENE_SWIPE_WIDTH); setSwipeOpen(true); }
    else { setSwipeOffset(0); setSwipeOpen(false); }
  };

  return (
    <div className="border-b border-border/20 last:border-0">
      <div className="relative overflow-hidden">
        {/* Botão excluir revelado no swipe */}
        <div className="absolute right-0 top-0 bottom-0 flex items-center justify-center bg-red-500" style={{ width: SCENE_SWIPE_WIDTH }}>
          <button onClick={() => { closeSwipe(); onDelete(); }} className="w-full h-full flex flex-col items-center justify-center gap-1">
            <Trash2 className="w-5 h-5 text-white" />
            <span className="text-[10px] font-semibold text-white">Excluir</span>
          </button>
        </div>

        {/* Linha principal — desliza para esquerda */}
        <div
          className="relative bg-card flex items-center gap-3 px-4 py-3.5"
          onTouchStart={e => startDrag(e.touches[0].clientX)}
          onTouchMove={e => moveDrag(e.touches[0].clientX)}
          onTouchEnd={endDrag}
          onMouseDown={e => startDrag(e.clientX)}
          onMouseMove={e => moveDrag(e.clientX)}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onClick={() => { if (swipeOpen) { closeSwipe(); return; } if (isAuto) setExpanded(v => !v); }}
          style={{
            transform: `translateX(-${swipeOffset}px)`,
            transition: dragging.current ? 'none' : 'transform 0.25s ease',
            cursor: isAuto ? 'pointer' : swipeOpen ? 'default' : 'grab',
            userSelect: 'none',
          }}
        >
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isAuto ? 'bg-blue-500/10' : 'bg-amber-500/10'}`}>
            {isAuto ? <Clock className="w-4 h-4 text-blue-500" /> : <Zap className="w-4 h-4 text-amber-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{scene.name}</p>
            {isAuto && !expanded && schedules.length > 0 && (
              <p className="text-[11px] text-muted-foreground">{schedules.map(s => s.time).join(' · ')}</p>
            )}
            {isAuto && !expanded && schedules.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Toque para ver horários</p>
            )}
          </div>
          {isAuto
            ? detailsLoading && expanded
              ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
              : expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground/40 shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/40 shrink-0" />
            : (
              <button
                onClick={e => { e.stopPropagation(); if (!swipeOpen) onTrigger(); }}
                disabled={triggerDisabled}
                className="flex items-center gap-1.5 h-8 px-3.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 shrink-0"
              >
                {isTriggering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                {isTriggering ? 'Disparando...' : 'Disparar'}
              </button>
            )
          }
        </div>
      </div>

      {/* Horários expandidos (só automações) */}
      {isAuto && expanded && details && (
        <div className="px-4 pb-4 space-y-2 bg-muted/20">
          {schedules.length > 0 ? (
            <>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-1">Horários</p>
              <div className="space-y-1.5">
                {schedules.map((s, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="text-sm font-mono font-semibold text-foreground">{s.time}</span>
                    <span className="text-xs text-muted-foreground">— {s.days}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground py-1">
              {details?.found === false ? 'Horários não disponíveis via API' : 'Sem horários configurados (gatilho por sensor ou outro)'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatSchedules(raw: { time: string; loops: string }[]) {
  const dayLabels = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  return raw.map(s => ({
    time: s.time,
    days: s.loops === '1111111' || !s.loops
      ? 'Todos os dias'
      : s.loops.split('').map((v, i) => v === '1' ? dayLabels[i] : null).filter(Boolean).join(', '),
  }));
}

function parseSchedules(conditions: any[]) {
  const raw: { time: string; loops: string }[] = [];
  for (const c of conditions) {
    // Smart Home format: entity_type=6 (timer), horário em display.time
    if (c.entity_type === 6 || c.entity_type === '6' || c.entity_id === 'timer') {
      const time = c.display?.time ?? c.display?.start_time ?? c.expr?.time ?? c.time ?? '';
      const loops = c.display?.loops ?? c.expr?.loops ?? c.loops ?? '1111111';
      if (time) { raw.push({ time, loops }); continue; }
    }
    // IoT Core format: entity_type="timer", horário em expr.time
    if (c.entity_type === 'timer' || c.type === 'timer' || c.expr?.time) {
      const time = c.expr?.time ?? c.time ?? '';
      const loops = c.expr?.loops ?? c.loops ?? '1111111';
      if (time) raw.push({ time, loops });
    }
  }
  return formatSchedules(raw);
}

function AutomationCard({ automation }: { automation: { sceneId: string; name: string; conditions?: any[] } }) {
  const [expanded, setExpanded] = useState(false);

  // Usa condições já vindas da listagem; só chama API se não tiver
  const hasInlineConditions = Array.isArray(automation.conditions) && automation.conditions.length > 0;
  const { data: details, isLoading } = trpc.tuya.getAutomationDetails.useQuery(
    { ruleId: automation.sceneId },
    { enabled: expanded && !hasInlineConditions, staleTime: 300_000 }
  );

  // Usa schedules já parseados pelo backend se disponível, senão parseia condições inline
  const schedules = details?.schedules
    ? formatSchedules(details.schedules as any)
    : parseSchedules(hasInlineConditions ? automation.conditions! : (details?.conditions ?? []));

  return (
    <div className="border-b border-border/20 last:border-0">
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
          <Clock className="w-4 h-4 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{automation.name}</p>
          {!expanded && schedules.length > 0 && (
            <p className="text-[11px] text-muted-foreground truncate">
              {schedules.map(s => s.time).join(' · ')}
            </p>
          )}
        </div>
        {isLoading && expanded
          ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
          : expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground/40 shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
      </button>

      {expanded && (hasInlineConditions || details) && (
        <div className="px-4 pb-4 space-y-2 bg-muted/20">
          {schedules.length > 0 ? (
            <>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-1">Horários</p>
              <div className="space-y-1.5">
                {schedules.map((s, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="text-sm font-mono font-semibold text-foreground">{s.time}</span>
                    <span className="text-xs text-muted-foreground">— {s.days}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="pt-1">
              <p className="text-xs text-muted-foreground">
                {details?.found === false ? 'Horários não disponíveis via API' : 'Sem horários (gatilho por sensor ou outro)'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function ManualSceneForm({ onSaved }: { onSaved: () => void }) {
  const [homeId, setHomeId] = useState('');
  const [sceneId, setSceneId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'tap' | 'automation'>('tap');

  const save = trpc.tuya.saveManualScene.useMutation({
    onSuccess: () => { toast.success('Cena adicionada!'); setHomeId(''); setSceneId(''); setName(''); setType('tap'); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
        <p className="text-sm font-semibold text-foreground">Adicionar cena manualmente</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Você precisa apenas do <strong>Scene ID</strong>. O Home ID é opcional.
        </p>
      </div>
      <div className="px-4 py-4 space-y-3">
        {/* Como encontrar o Scene ID */}
        <div className="rounded-xl bg-blue-500/8 border border-blue-500/20 p-3 space-y-1.5">
          <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">Como encontrar o Scene ID</p>
          <ol className="text-[11px] text-muted-foreground space-y-0.5 list-decimal list-inside leading-relaxed">
            <li>Acesse <span className="font-mono text-foreground">iot.tuya.com</span> → seu projeto</li>
            <li>Menu lateral → <strong>API Explorer</strong></li>
            <li>Busque <span className="font-mono">Get Scene List</span> ou <span className="font-mono">scenes</span></li>
            <li>Execute → copie o campo <span className="font-mono">scene_id</span> de cada cena</li>
          </ol>
        </div>

        <div>
          <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">
            Scene ID <span className="text-red-400">*</span>
          </p>
          <input type="text" value={sceneId} onChange={e => setSceneId(e.target.value.trim())}
            placeholder="ex: dYNQ1695123456789abc"
            className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-emerald-500/50" />
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">Nome da cena</p>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="ex: Ligar tudo"
            className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-emerald-500/50" />
        </div>
        {/* Tipo da cena */}
        <div>
          <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">Tipo</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('tap')}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${type === 'tap' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground'}`}
            >
              <Play className="w-3.5 h-3.5" />
              Tap-to-Run
            </button>
            <button
              type="button"
              onClick={() => setType('automation')}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${type === 'automation' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground'}`}
            >
              <Clock className="w-3.5 h-3.5" />
              Automação
            </button>
          </div>
          {type === 'automation' && (
            <p className="text-[10px] text-muted-foreground mt-1.5">Automações são disparadas por horário — sem botão Disparar.</p>
          )}
        </div>

        <div>
          <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">
            Home ID <span className="font-normal text-muted-foreground/50">(opcional)</span>
          </p>
          <input type="text" value={homeId} onChange={e => setHomeId(e.target.value.trim())}
            placeholder="ex: 123456789  (deixe em branco se não souber)"
            className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-emerald-500/50" />
        </div>
        <Button className="w-full bg-emerald-600 hover:bg-emerald-700"
          disabled={!sceneId || !name || save.isPending}
          onClick={() => save.mutate({ homeId: homeId || undefined, sceneId, name, type })}
        >
          {save.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Salvando...</> : <><Check className="w-4 h-4 mr-2" />Salvar cena</>}
        </Button>
      </div>
    </div>
  );
}

function ScenesTab() {
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [view, setView] = useState<'mine' | 'import'>('mine');
  const [expandedHomes, setExpandedHomes] = useState<Set<string>>(new Set());
  const [showManualForm, setShowManualForm] = useState(false);

  const { data: config } = trpc.tuya.getConfig.useQuery();
  // Só busca cenas da API quando estiver na view de importar
  const { data: scenes = [], isLoading, isError, refetch } = trpc.tuya.listScenes.useQuery(
    undefined, { enabled: !!config && view === 'import', retry: false }
  );
  const { data: manualScenes = [], refetch: refetchManual } = trpc.tuya.listManualScenes.useQuery();

  // Auto-expand all homes ao entrar na view de importar
  useEffect(() => {
    if (view === 'import' && scenes.length > 0) {
      const homes = new Set(scenes.map((s: any) => s.homeName));
      setExpandedHomes(homes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes.length, view]);

  const triggerScene = trpc.tuya.triggerScene.useMutation({
    onSuccess: () => { toast.success('Cena disparada!'); setTriggeringId(null); },
    onError: (e) => { toast.error(e.message); setTriggeringId(null); },
  });

  const deleteManual = trpc.tuya.deleteManualScene.useMutation({
    onSuccess: () => { refetchManual(); toast.success('Cena removida'); },
  });

  const saveManual = trpc.tuya.saveManualScene.useMutation({
    onSuccess: () => { refetchManual(); toast.success('Cena adicionada!'); },
    onError: (e) => toast.error(e.message),
  });

  const toggleHome = (homeName: string) => {
    setExpandedHomes(prev => {
      const next = new Set(prev);
      next.has(homeName) ? next.delete(homeName) : next.add(homeName);
      return next;
    });
  };

  // Set de sceneIds já importados — pra mostrar ✓ ao invés de + na lista da API
  const importedIds = new Set(manualScenes.map((s: any) => s.sceneId));

  // Importa cena da lista da API
  const handleImport = (scene: any) => {
    saveManual.mutate({
      homeId: scene.homeId ? String(scene.homeId) : undefined,
      sceneId: scene.sceneId,
      name: scene.name,
      type: scene.homeName === 'Automações' ? 'automation' : 'tap',
    });
  };

  // Remove cena pelo sceneId (usado quando o usuário clica em ✓ na view de importar)
  const handleUnimportBySceneId = (sceneId: string) => {
    const found = manualScenes.find((s: any) => s.sceneId === sceneId);
    if (found) deleteManual.mutate({ id: found.id });
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

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: IMPORTAR DA SMARTLIFE
  // Mostra a lista completa da API com botão "+ Adicionar" em cada cena.
  // Cenas já importadas mostram ✓ (clicar remove).
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === 'import') {
    const tapToRunGrouped = (scenes as any[])
      .filter(s => s.homeName !== 'Automações')
      .reduce<Record<string, any[]>>((acc, s) => {
        if (!acc[s.homeName]) acc[s.homeName] = [];
        acc[s.homeName].push(s);
        return acc;
      }, {});
    const automationList = (scenes as any[]).filter(s => s.homeName === 'Automações');

    return (
      <div className="space-y-3 pt-2">
        {/* Header com botão voltar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setView('mine')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5 rotate-180" />
            Voltar
          </button>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        {/* Aviso explicando a tela */}
        <div className="rounded-xl bg-blue-500/8 border border-blue-500/20 p-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Selecione apenas as cenas que você quer usar no Cultivo. As marcadas com <Check className="inline w-3 h-3 text-emerald-500" /> já estão importadas.
          </p>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Erro */}
        {isError && !isLoading && (
          <div className="rounded-2xl bg-amber-500/8 border border-amber-500/20 p-4 space-y-2">
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Listagem automática indisponível</p>
            <p className="text-xs text-muted-foreground">
              A API Tuya não conseguiu listar suas cenas. Use o formulário manual abaixo com o <strong>scene_id</strong> obtido no API Explorer do portal Tuya.
            </p>
          </div>
        )}

        {/* Tap-to-run agrupados por casa */}
        {!isLoading && Object.entries(tapToRunGrouped).map(([homeName, homeScenes]) => {
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
                    const imported = importedIds.has(scene.sceneId);
                    return (
                      <div key={scene.sceneId} className="flex items-center gap-3 px-4 py-3.5 border-b border-border/20 last:border-0">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                          <Zap className="w-4 h-4 text-amber-500" />
                        </div>
                        <p className="flex-1 text-sm font-medium text-foreground truncate">{scene.name}</p>
                        {imported ? (
                          <button
                            onClick={() => handleUnimportBySceneId(scene.sceneId)}
                            disabled={saveManual.isPending || deleteManual.isPending}
                            title="Remover do Cultivo"
                            className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-all disabled:opacity-50 shrink-0"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Importada
                          </button>
                        ) : (
                          <button
                            onClick={() => handleImport(scene)}
                            disabled={saveManual.isPending}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Adicionar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Automações */}
        {!isLoading && automationList.length > 0 && (
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <button
              className="w-full flex items-center gap-2.5 px-4 py-3 border-b border-border/30 bg-muted/20 hover:bg-muted/30 transition-colors text-left"
              onClick={() => toggleHome('Automações')}
            >
              <Clock className="w-3.5 h-3.5 text-blue-400/70" />
              <p className="text-sm font-semibold text-foreground flex-1">Automações</p>
              <span className="text-xs text-muted-foreground/50">{automationList.length} regra{automationList.length !== 1 ? 's' : ''}</span>
              {expandedHomes.has('Automações') ? <ChevronUp className="w-4 h-4 text-muted-foreground/40" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/40" />}
            </button>
            {expandedHomes.has('Automações') && (
              <div>
                {automationList.map((automation: any) => {
                  const imported = importedIds.has(automation.sceneId);
                  return (
                    <div key={automation.sceneId} className="flex items-center gap-3 px-4 py-3.5 border-b border-border/20 last:border-0">
                      <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4 text-blue-500" />
                      </div>
                      <p className="flex-1 text-sm font-medium text-foreground truncate">{automation.name}</p>
                      {imported ? (
                        <button
                          onClick={() => handleUnimportBySceneId(automation.sceneId)}
                          disabled={saveManual.isPending || deleteManual.isPending}
                          title="Remover do Cultivo"
                          className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-all disabled:opacity-50 shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Importada
                        </button>
                      ) : (
                        <button
                          onClick={() => handleImport(automation)}
                          disabled={saveManual.isPending}
                          className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Adicionar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Estado vazio (API conectada mas sem cenas) */}
        {!isLoading && !isError && scenes.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 py-10 text-center px-6">
            <Zap className="w-9 h-9 mx-auto text-muted-foreground/25 mb-2" />
            <p className="font-medium text-foreground text-sm">Nenhuma cena na sua conta</p>
            <p className="text-xs text-muted-foreground mt-1">Crie cenas no app SmartLife para vê-las aqui</p>
          </div>
        )}

        {/* Form de entrada manual (sempre disponível como fallback) */}
        <button
          onClick={() => setShowManualForm(v => !v)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-border/50 text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {showManualForm ? 'Fechar formulário' : 'Adicionar manualmente (cole o scene_id)'}
        </button>
        {showManualForm && <ManualSceneForm onSaved={() => { refetchManual(); setShowManualForm(false); }} />}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: MINHAS CENAS (default)
  // Mostra apenas as cenas que o usuário escolheu importar.
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-3 pt-2">
      {/* Header com botão importar */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Minhas cenas</p>
        <button
          onClick={() => refetchManual()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar
        </button>
      </div>

      {/* Lista das cenas importadas */}
      {manualScenes.length > 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
          {manualScenes.map((scene: any) => (
            <ManualSceneRow
              key={scene.id}
              scene={scene}
              isTriggering={triggeringId === scene.sceneId}
              onTrigger={() => { setTriggeringId(scene.sceneId); triggerScene.mutate({ sceneId: scene.sceneId, homeId: scene.homeId || undefined }); }}
              onDelete={() => deleteManual.mutate({ id: scene.id })}
              triggerDisabled={!!triggeringId}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 py-10 text-center px-6">
          <Zap className="w-9 h-9 mx-auto text-muted-foreground/25 mb-2" />
          <p className="font-medium text-foreground text-sm">Nenhuma cena adicionada</p>
          <p className="text-xs text-muted-foreground mt-1">Toque em "Importar da SmartLife" para escolher</p>
        </div>
      )}

      {/* Botão principal: importar da SmartLife */}
      <button
        onClick={() => setView('import')}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.99] transition-all"
      >
        <Plus className="w-4 h-4" />
        Importar da SmartLife
      </button>

      {/* Form manual ainda disponível */}
      <button
        onClick={() => setShowManualForm(v => !v)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-border/50 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        {showManualForm ? 'Fechar formulário' : 'Adicionar manualmente (avançado)'}
      </button>
      {showManualForm && <ManualSceneForm onSaved={() => { refetchManual(); setShowManualForm(false); }} />}
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
        <header className="bg-card border-b border-border fixed top-0 left-0 right-0 md:left-64 z-20 pt-safe">
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

        {/* Conteúdo — pb garante scroll acima do nav bar em qualquer iPhone */}
        <main
          className="container mx-auto px-4 sm:pb-12 max-w-2xl"
          style={{ paddingBottom: 'calc(9rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <TabContent key={tab}>
              {tab === 'devices' && <DevicesTab />}
              {tab === 'scenes'  && <ScenesTab />}
              {tab === 'sensors' && <SensoresTab />}
              {tab === 'config'  && <ConfigTab onSaved={() => setTab('sensors')} />}
            </TabContent>
          </AnimatePresence>
        </main>
      </div>
    </PageTransition>
  );
}
