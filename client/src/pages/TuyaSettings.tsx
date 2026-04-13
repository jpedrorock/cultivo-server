import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Wifi, WifiOff, Check, RefreshCw, ToggleLeft, ToggleRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageTransition } from '@/components/PageTransition';
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

  // ── Remote data ──────────────────────────────────────────────────────────
  const { data: config, isLoading } = trpc.tuya.getConfig.useQuery();
  const { data: tents = [] } = trpc.tents.list.useQuery();
  const { data: savedMappings = [] } = trpc.tuya.getMappings.useQuery();
  const { data: devices = [], isLoading: devicesLoading } = trpc.tuya.listDevices.useQuery(
    undefined,
    { enabled: tab === 'sensors' && !!config, retry: false }
  );

  // Hydrate from saved data
  useEffect(() => {
    if (config) {
      setAccessId(config.accessId);
      setAccessSecret(config.accessSecret);
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
    onSuccess: () => toast.success('Sensores salvos!'),
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const handlePickDevice = (tentId: number, deviceId: string, deviceName: string) => {
    setMappings(prev => ({ ...prev, [tentId]: { deviceId, deviceName, enabled: prev[tentId]?.enabled ?? true } }));
    setOpenPicker(null);
  };

  const handleToggle = (tentId: number) => {
    setMappings(prev => ({
      ...prev,
      [tentId]: { ...prev[tentId], enabled: !prev[tentId]?.enabled },
    }));
  };

  const handleRemove = (tentId: number) => {
    setMappings(prev => { const n = { ...prev }; delete n[tentId]; return n; });
  };

  const handleSaveMappings = () => {
    saveMappings.mutate(
      Object.entries(mappings).map(([tentId, m]) => ({
        tentId: Number(tentId),
        deviceId: m.deviceId,
        deviceName: m.deviceName,
        enabled: m.enabled,
      }))
    );
  };

  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">

        {/* Header */}
        <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
          <div className="container mx-auto px-4 py-3 flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="shrink-0 h-9 w-9">
              <Link href="/settings"><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <div className="flex-1">
              <h1 className="text-base font-bold leading-tight">Sensores SmartLife / Tuya</h1>
              <p className="text-xs text-muted-foreground">Temperatura e umidade automáticos</p>
            </div>
            {/* Tabs */}
            <div className="flex gap-1 bg-muted rounded-lg p-0.5">
              {(['api', 'sensors'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    tab === t ? 'bg-card shadow text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {t === 'api' ? 'API' : 'Sensores'}
                </button>
              ))}
            </div>
          </div>
        </header>

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
                <CredentialField label="Access ID" value={accessId} onChange={setAccessId} placeholder="Ex: 9gk3qwi8nf2mxxx" mono />
                <CredentialField label="Access Secret" value={accessSecret} onChange={setAccessSecret} placeholder="Ex: a1b2c3d4e5f6..." mono secret />
              </div>

              {/* Região */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 pt-3 pb-2">Região do servidor</p>
                <div className="grid grid-cols-2 gap-2 px-4 pb-4">
                  {(Object.keys(REGION_LABELS) as Region[]).map(r => (
                    <button key={r} onClick={() => setRegion(r)}
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
              ) : devices.length === 0 ? (
                <div className="text-center py-16 space-y-2">
                  <WifiOff className="w-8 h-8 mx-auto text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Nenhum dispositivo encontrado</p>
                  <p className="text-xs text-muted-foreground">Verifique se vinculou o SmartLife ao projeto Tuya</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground px-1">
                    Para cada estufa escolha o sensor correspondente. Você pode ativar/desativar individualmente.
                  </p>

                  {/* Uma linha por estufa */}
                  <div className="space-y-3">
                    {(tents as any[]).map((tent: any) => {
                      const m = mappings[tent.id];
                      const isOpen = openPicker === tent.id;

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
                                <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                                  <Wifi className="w-3 h-3 shrink-0 text-emerald-500" />
                                  {m.deviceName}
                                </p>
                              ) : (
                                <p className="text-[11px] text-muted-foreground italic">Sem sensor</p>
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
                            {/* Abrir/fechar picker */}
                            <button
                              onClick={() => setOpenPicker(isOpen ? null : tent.id)}
                              className="shrink-0 w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
                            >
                              {isOpen
                                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                            </button>
                          </div>

                          {/* Device picker expandível */}
                          {isOpen && (
                            <div className="border-t border-border/50 divide-y divide-border/50 max-h-56 overflow-y-auto">
                              {/* Opção "sem sensor" */}
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

                              {/* Dispositivos disponíveis */}
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
                                      <p className="text-[10px] text-muted-foreground">{dev.online ? 'Online' : 'Offline'}</p>
                                    </div>
                                    {selected && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    disabled={saveMappings.isPending}
                    onClick={handleSaveMappings}
                  >
                    {saveMappings.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                    Salvar todos os sensores
                  </Button>
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
