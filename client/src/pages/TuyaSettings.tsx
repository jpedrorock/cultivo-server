import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Check, RefreshCw, ToggleLeft, ToggleRight, ChevronUp, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageTransition } from '@/components/PageTransition';
import { PageHeader } from '@/components/PageHeader';
import { TentIcon } from '@/components/TentIcon';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

type Region = 'eu' | 'us' | 'cn' | 'in';
type PollInterval = 30 | 60 | 180 | 480 | 720;

const REGION_LABELS: Record<Region, string> = {
  eu: 'Europa',
  us: 'América',
  cn: 'China',
  in: 'Índia',
};

const POLL_OPTIONS: { value: PollInterval; label: string; sub: string }[] = [
  { value: 30,  label: 'A cada 30 min',  sub: '~48× por dia' },
  { value: 60,  label: 'A cada 1 hora',  sub: '~24× por dia' },
  { value: 180, label: 'A cada 3 horas', sub: '~8× por dia' },
  { value: 480, label: '3× ao dia',      sub: 'manhã, tarde, noite' },
  { value: 720, label: '2× ao dia',      sub: 'manhã e noite' },
];

export default function TuyaSettings() {
  const [tab, setTab] = useState<'api' | 'sensors'>('api');

  // ── API credentials state ────────────────────────────────────────────────
  const [accessId, setAccessId] = useState('');
  const [accessSecret, setAccessSecret] = useState('');
  const [region, setRegion] = useState<Region>('eu');
  const [pollInterval, setPollInterval] = useState<PollInterval>(180);
  const [integrationEnabled, setIntegrationEnabled] = useState(true);
  const [connStatus, setConnStatus] = useState<null | 'ok' | 'error'>(null);
  const [connMsg, setConnMsg] = useState('');

  // ── Sensor mappings state ────────────────────────────────────────────────
  // tentId → { deviceId, deviceName, enabled }
  const [mappings, setMappings] = useState<Record<number, { deviceId: string; deviceName: string; enabled: boolean }>>({});
  // which tent's picker is open
  const [openPicker, setOpenPicker] = useState<number | null>(null);
  // manual input drafts tentId → { deviceId, deviceName }
  const [manualDraft, setManualDraft] = useState<Record<number, { deviceId: string; deviceName: string }>>({});

  // ── Remote data ──────────────────────────────────────────────────────────
  const { data: config, isLoading } = trpc.tuya.getConfig.useQuery();
  const { data: tents = [] } = trpc.tents.list.useQuery();
  const { data: savedMappings = [] } = trpc.tuya.getMappings.useQuery();
  const { data: devices = [], isLoading: devicesLoading, isError: devicesError } = trpc.tuya.listDevices.useQuery(
    undefined,
    { enabled: tab === 'sensors' && !!config, retry: false }
  );
  // manual mode when API can't list devices
  const useManualEntry = !devicesLoading && (devicesError || devices.length === 0);

  // Hydrate from saved data
  useEffect(() => {
    if (config) {
      setAccessId(config.accessId);
      setAccessSecret(''); // Nunca popular com o segredo — usuário digita novo apenas se quiser trocar
      setRegion(config.region as Region);
      setPollInterval(config.pollIntervalMin as PollInterval);
      setIntegrationEnabled(config.enabled);
    }
  }, [config]);

  useEffect(() => {
    if (savedMappings.length > 0) {
      const m: typeof mappings = {};
      for (const s of savedMappings) m[s.tentId] = { deviceId: s.deviceId, deviceName: s.deviceName, enabled: s.enabled };
      setMappings(m);
    }
  }, [savedMappings]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const saveConfig = trpc.tuya.saveConfig.useMutation({
    onSuccess: () => { toast.success('Configuração salva!'); setTab('sensors'); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const testConn = trpc.tuya.testConnection.useMutation({
    onSuccess: (r) => {
      setConnStatus(r.ok ? 'ok' : 'error');
      setConnMsg(r.ok ? 'Conectado com sucesso!' : (r.error ?? 'Erro desconhecido'));
    },
    onError: (e) => { setConnStatus('error'); setConnMsg(e.message); },
  });

  const saveMappings = trpc.tuya.saveMappings.useMutation({
    onSuccess: () => toast.success('Sensor salvo!', { duration: 2000 }),
    onError: (e) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  const [syncingTentId, setSyncingTentId] = useState<number | null>(null);
  const { data: latestReadings = {}, refetch: refetchReadings } = trpc.tuya.getLatestReadingsAll.useQuery(
    undefined,
    { enabled: tab === 'sensors' }
  );
  const readNow = trpc.tuya.readNow.useMutation({
    onSuccess: () => { setSyncingTentId(null); toast.success('Leitura atualizada!'); refetchReadings(); },
    onError: (e) => { setSyncingTentId(null); toast.error(`Sensor: ${e.message}`); },
  });

  // Persiste imediatamente qualquer mudança de mapeamento
  const persistMappings = (newMappings: typeof mappings) => {
    saveMappings.mutate(
      Object.entries(newMappings).map(([tentId, m]) => ({
        tentId: Number(tentId),
        deviceId: m.deviceId,
        deviceName: m.deviceName,
        enabled: m.enabled,
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


  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">

        <PageHeader
          backHref="/settings"
          title="Sensores SmartLife / Tuya"
          subtitle="Temperatura e umidade automáticos"
          rightActions={
            <div className="flex gap-1 bg-muted rounded-lg p-0.5">
              {(['api', 'sensors'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    tab === t ? 'bg-card shadow text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {t === 'api' ? 'API' : 'Sensores'}
                </button>
              ))}
            </div>
          }
        />

        <main className="container mx-auto px-4 py-6 pb-28 max-w-2xl space-y-5">

          {/* ── Aba API ── */}
          {tab === 'api' && (
            <>
              {/* Guia */}
              <div className="rounded-2xl bg-blue-500/8 border border-blue-500/20 p-4 space-y-1.5">
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">Como obter as credenciais</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Acesse <span className="font-mono text-foreground">iot.tuya.com</span> (ou <span className="font-mono text-foreground">platform.tuya.com</span>) e crie conta</li>
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
                <CredentialField label="Access ID" value={accessId} onChange={(v) => { setAccessId(v); setConnStatus(null); setConnMsg(''); }} placeholder="Ex: 9gk3qwi8nf2mxxx" mono secret />
                <CredentialField label="Access Secret" value={accessSecret} onChange={(v) => { setAccessSecret(v); setConnStatus(null); setConnMsg(''); }} placeholder={config?.accessSecretMasked ? "Segredo salvo — deixe vazio para manter" : "Ex: a1b2c3d4e5f6..."} mono secret />
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
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 pt-3 pb-2">Frequência de leitura</p>
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
                  Salvar e ir para sensores →
                </Button>
              </div>
            </>
          )}

          {/* ── Aba Sensores ── */}
          {tab === 'sensors' && (
            <>
              {!config ? (
                <div className="text-center py-16 space-y-3">
                  <WifiOff className="w-10 h-10 mx-auto text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Configure as credenciais na aba API primeiro</p>
                  <Button variant="outline" onClick={() => setTab('api')}>Ir para API</Button>
                </div>
              ) : devicesLoading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Buscando dispositivos SmartLife...</span>
                </div>
              ) : (
                <>
                  {/* Banner de modo manual quando API não retorna dispositivos */}
                  {useManualEntry && (
                    <div className="rounded-2xl bg-amber-500/8 border border-amber-500/20 p-4 space-y-2">
                      <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Inserção manual de Device ID</p>
                      <p className="text-xs text-muted-foreground">
                        A listagem automática não está disponível para este projeto. Cole o <strong>Device ID</strong> de cada sensor diretamente do portal Tuya:
                      </p>
                      <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
                        <li>Acesse <span className="font-mono text-foreground">iot.tuya.com</span> → seu projeto → aba <strong>Devices</strong></li>
                        <li>Copie o <strong>Device ID</strong> do sensor (coluna "Device ID")</li>
                        <li>Cole abaixo em cada estufa correspondente</li>
                      </ol>
                    </div>
                  )}

                  {!useManualEntry && (
                    <p className="text-xs text-muted-foreground px-1">
                      Para cada estufa escolha o sensor correspondente. Você pode ativar/desativar individualmente.
                    </p>
                  )}

                  {/* Uma linha por estufa */}
                  <div className="space-y-3">
                    {(tents as any[]).map((tent: any) => {
                      const m = mappings[tent.id];
                      const isOpen = openPicker === tent.id;
                      const draft = manualDraft[tent.id] ?? { deviceId: '', deviceName: tent.name };

                      return (
                        <div key={tent.id} className="bg-card border border-border rounded-2xl overflow-hidden">

                          {/* Cabeçalho da estufa */}
                          <div className="flex items-center gap-3 px-4 py-3.5">
                            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                              <TentIcon className="w-4.5 h-4.5 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground">{tent.name}</p>
                              {m ? (
                                <>
                                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                    <Wifi className="w-3 h-3 shrink-0 text-emerald-500" />
                                    {m.deviceName}
                                  </p>
                                  {latestReadings[tent.id] && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                                      {latestReadings[tent.id].tempC != null && (
                                        <span className="text-amber-500 font-medium">{latestReadings[tent.id].tempC!.toFixed(1)}°C</span>
                                      )}
                                      {latestReadings[tent.id].rhPct != null && (
                                        <span className="text-blue-500 font-medium">{latestReadings[tent.id].rhPct!.toFixed(0)}%</span>
                                      )}
                                      <span className="text-muted-foreground/60">
                                        {new Date(latestReadings[tent.id].readAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </p>
                                  )}
                                </>
                              ) : (
                                <p className="text-xs text-muted-foreground italic">Sem sensor</p>
                              )}
                            </div>
                            {/* Toggle por estufa */}
                            {m && (
                              <button onClick={() => handleToggle(tent.id)} className="shrink-0">
                                {m.enabled
                                  ? <ToggleRight className="w-7 h-7 text-emerald-500" />
                                  : <ToggleLeft className="w-7 h-7 text-muted-foreground" />}
                              </button>
                            )}
                            {/* Sincronizar agora */}
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
                            {/* Remover */}
                            {m && !isOpen && (
                              <button onClick={() => handleRemove(tent.id)} className="shrink-0 w-8 h-8 rounded-lg bg-muted hover:bg-red-500/10 flex items-center justify-center transition-colors">
                                <X className="w-3.5 h-3.5 text-muted-foreground" />
                              </button>
                            )}
                            {/* Abrir/fechar picker */}
                            <button
                              onClick={() => setOpenPicker(isOpen ? null : tent.id)}
                              className="shrink-0 w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
                            >
                              {isOpen
                                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                : <Pencil className="w-3.5 h-3.5 text-muted-foreground" />}
                            </button>
                          </div>

                          {/* Picker expandível */}
                          {isOpen && (
                            <div className="border-t border-border/50">
                              {/* Modo automático: lista de dispositivos da API */}
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
                                      <button
                                        key={dev.id}
                                        onClick={() => handlePickDevice(tent.id, dev.id, dev.name)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                                          selected ? 'bg-emerald-500/8' : 'hover:bg-muted/40'
                                        }`}
                                      >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                          dev.online ? 'bg-emerald-500/15' : 'bg-muted'
                                        }`}>
                                          {dev.online
                                            ? <Wifi className="w-4 h-4 text-emerald-500" />
                                            : <WifiOff className="w-4 h-4 text-muted-foreground" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium text-foreground truncate">{dev.name}</p>
                                          <p className="text-xs text-muted-foreground">{dev.online ? 'Online' : 'Offline'}</p>
                                        </div>
                                        {selected && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Modo manual */}
                              {useManualEntry && (
                                <div className="px-4 py-4 space-y-3">
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-1.5 font-medium">Device ID <span className="text-muted-foreground/60">(do portal iot.tuya.com)</span></p>
                                    <input
                                      type="text"
                                      value={draft.deviceId}
                                      onChange={e => setManualDraft(prev => ({ ...prev, [tent.id]: { ...draft, deviceId: e.target.value.trim() } }))}
                                      placeholder="ex: eb8168f5771604de9ccjsi"
                                      className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-emerald-500/50"
                                    />
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-1.5 font-medium">Nome do sensor</p>
                                    <input
                                      type="text"
                                      value={draft.deviceName}
                                      onChange={e => setManualDraft(prev => ({ ...prev, [tent.id]: { ...draft, deviceName: e.target.value } }))}
                                      placeholder={`Sensor ${tent.name}`}
                                      className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-emerald-500/50"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline" size="sm" className="flex-1"
                                      onClick={() => { handleRemove(tent.id); setOpenPicker(null); }}
                                    >
                                      <X className="w-3.5 h-3.5 mr-1" /> Sem sensor
                                    </Button>
                                    <Button
                                      size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700"
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

                  {/* Indicador de salvamento automático */}
                  <p className="text-center text-xs text-muted-foreground">
                    {saveMappings.isPending
                      ? <span className="flex items-center justify-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Salvando...</span>
                      : '✓ Configurações salvas automaticamente'}
                  </p>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </PageTransition>
  );
}

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
