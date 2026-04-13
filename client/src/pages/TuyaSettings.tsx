import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import {
  ArrowLeft, Wifi, WifiOff, ChevronRight, Check, RefreshCw,
  ToggleLeft, ToggleRight, Zap, Thermometer, Droplets, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageTransition } from '@/components/PageTransition';
import { TentIcon } from '@/components/TentIcon';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Region = 'eu' | 'us' | 'cn' | 'in';
type PollInterval = 30 | 60 | 180 | 480 | 720;

const REGION_LABELS: Record<Region, string> = {
  eu: 'Europa',
  us: 'América',
  cn: 'China',
  in: 'Índia',
};

const POLL_OPTIONS: { value: PollInterval; label: string; sub: string }[] = [
  { value: 30,  label: 'A cada 30 min',   sub: '~48x por dia' },
  { value: 60,  label: 'A cada 1 hora',   sub: '~24x por dia' },
  { value: 180, label: 'A cada 3 horas',  sub: '~8x por dia' },
  { value: 480, label: '3x ao dia',       sub: 'manhã, tarde, noite' },
  { value: 720, label: '2x ao dia',       sub: 'manhã e noite' },
];

// ─── Componente principal ─────────────────────────────────────────────────────

export default function TuyaSettings() {
  // Credenciais
  const [step, setStep] = useState<'credentials' | 'mapping'>('credentials');
  const [accessId, setAccessId] = useState('');
  const [accessSecret, setAccessSecret] = useState('');
  const [region, setRegion] = useState<Region>('eu');
  const [pollInterval, setPollInterval] = useState<PollInterval>(180);
  const [integrationEnabled, setIntegrationEnabled] = useState(true);
  const [connStatus, setConnStatus] = useState<null | 'ok' | 'error'>(null);
  const [connMsg, setConnMsg] = useState('');

  // Mapeamentos
  const [mappings, setMappings] = useState<Record<number, { deviceId: string; deviceName: string; enabled: boolean }>>({});

  // Dados remotos
  const { data: config, isLoading: configLoading } = trpc.tuya.getConfig.useQuery();
  const { data: tents = [] } = trpc.tents.list.useQuery();
  const { data: savedMappings = [] } = trpc.tuya.getMappings.useQuery();
  const { data: devices = [], isLoading: devicesLoading, refetch: refetchDevices } = trpc.tuya.listDevices.useQuery(
    undefined,
    { enabled: step === 'mapping', retry: false }
  );

  // Hydrate form com dados salvos
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
      const map: typeof mappings = {};
      for (const m of savedMappings) {
        map[m.tentId] = { deviceId: m.deviceId, deviceName: m.deviceName, enabled: m.enabled };
      }
      setMappings(map);
    }
  }, [savedMappings]);

  // Mutations
  const saveConfig = trpc.tuya.saveConfig.useMutation({
    onSuccess: () => { toast.success('Credenciais salvas'); setStep('mapping'); refetchDevices(); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const testConn = trpc.tuya.testConnection.useMutation({
    onSuccess: (r) => {
      setConnStatus(r.ok ? 'ok' : 'error');
      setConnMsg(r.ok ? `Conectado! (uid: ${r.uid})` : (r.error ?? 'Erro desconhecido'));
    },
    onError: (e) => { setConnStatus('error'); setConnMsg(e.message); },
  });

  const saveMappings = trpc.tuya.saveMappings.useMutation({
    onSuccess: () => toast.success('Mapeamentos salvos!'),
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const handleSaveCredentials = () => {
    if (!accessId.trim() || !accessSecret.trim()) {
      toast.error('Preencha Access ID e Access Secret');
      return;
    }
    saveConfig.mutate({ accessId, accessSecret, region, pollIntervalMin: pollInterval, enabled: integrationEnabled });
  };

  const handleSaveMappings = () => {
    const payload = Object.entries(mappings).map(([tentId, m]) => ({
      tentId: Number(tentId),
      deviceId: m.deviceId,
      deviceName: m.deviceName,
      enabled: m.enabled,
    }));
    saveMappings.mutate(payload);
  };

  const setTentDevice = (tentId: number, deviceId: string, deviceName: string) => {
    setMappings(prev => ({
      ...prev,
      [tentId]: { deviceId, deviceName, enabled: prev[tentId]?.enabled ?? true },
    }));
  };

  const toggleTentEnabled = (tentId: number) => {
    setMappings(prev => ({
      ...prev,
      [tentId]: { ...prev[tentId], enabled: !prev[tentId]?.enabled },
    }));
  };

  if (configLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
          <div className="container mx-auto px-4 py-3 flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="shrink-0 h-9 w-9">
              <Link href="/settings">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
            <div className="flex-1">
              <h1 className="text-base font-bold leading-tight">Sensores SmartLife / Tuya</h1>
              <p className="text-xs text-muted-foreground">Temperatura e umidade automáticos</p>
            </div>
            {/* Tab pills */}
            <div className="flex gap-1 bg-muted rounded-lg p-0.5">
              {(['credentials', 'mapping'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStep(s)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    step === s ? 'bg-card shadow text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {s === 'credentials' ? 'API' : 'Estufas'}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 pb-28 max-w-2xl space-y-5">

          {/* ── Step 1: Credenciais ── */}
          {step === 'credentials' && (
            <>
              {/* Guia rápido */}
              <div className="rounded-2xl bg-blue-500/8 border border-blue-500/20 p-4 space-y-2">
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">Como obter as credenciais</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Acesse <span className="font-mono text-foreground">iot.tuya.com</span> e crie uma conta</li>
                  <li>Crie um Cloud Project → categoria "Smart Home"</li>
                  <li>Na aba "Link App Account", vincule o SmartLife pelo QR code</li>
                  <li>Copie o <strong>Access ID</strong> e <strong>Access Secret</strong> do projeto</li>
                </ol>
              </div>

              {/* Toggle geral */}
              <div className="bg-card border border-border rounded-2xl px-4 py-3.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Integração ativa</p>
                  <p className="text-xs text-muted-foreground">Liga/desliga toda a leitura automática</p>
                </div>
                <button onClick={() => setIntegrationEnabled(v => !v)} className="shrink-0">
                  {integrationEnabled
                    ? <ToggleRight className="w-8 h-8 text-emerald-500" />
                    : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
                </button>
              </div>

              {/* Campos */}
              <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
                <CredentialField
                  label="Access ID"
                  value={accessId}
                  onChange={setAccessId}
                  placeholder="Ex: 9gk3qwi8nf2mxxx"
                  mono
                />
                <CredentialField
                  label="Access Secret"
                  value={accessSecret}
                  onChange={setAccessSecret}
                  placeholder="Ex: a1b2c3d4e5f6..."
                  mono
                  secret
                />
              </div>

              {/* Região */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 pt-3 pb-2">Região do servidor</p>
                <div className="grid grid-cols-2 gap-2 px-4 pb-4">
                  {(Object.keys(REGION_LABELS) as Region[]).map(r => (
                    <button
                      key={r}
                      onClick={() => setRegion(r)}
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

              {/* Intervalo de leitura */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 pt-3 pb-2">Frequência de leitura</p>
                <div className="divide-y divide-border">
                  {POLL_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setPollInterval(opt.value)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="text-left">
                        <p className="text-sm font-medium text-foreground">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.sub}</p>
                      </div>
                      {pollInterval === opt.value && (
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Testar + Status */}
              {connStatus && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm ${
                  connStatus === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                }`}>
                  {connStatus === 'ok'
                    ? <Wifi className="w-4 h-4 shrink-0" />
                    : <WifiOff className="w-4 h-4 shrink-0" />}
                  <span>{connMsg}</span>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={testConn.isPending || !accessId || !accessSecret}
                  onClick={() => testConn.mutate({ accessId, accessSecret, region })}
                >
                  {testConn.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Wifi className="w-4 h-4 mr-2" />}
                  Testar conexão
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={saveConfig.isPending}
                  onClick={handleSaveCredentials}
                >
                  {saveConfig.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                  Salvar e continuar
                </Button>
              </div>
            </>
          )}

          {/* ── Step 2: Mapeamento por estufa ── */}
          {step === 'mapping' && (
            <>
              <div className="rounded-2xl bg-amber-500/8 border border-amber-500/20 p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Para cada estufa, escolha o sensor de temperatura e umidade correspondente.
                  Você também pode <strong>desativar</strong> uma estufa individualmente sem perder o mapeamento.
                </p>
              </div>

              {devicesLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Buscando dispositivos...</span>
                </div>
              ) : devices.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  <WifiOff className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Nenhum dispositivo encontrado. Verifique as credenciais.
                </div>
              ) : (
                <div className="space-y-3">
                  {(tents as any[]).map((tent: any) => {
                    const mapped = mappings[tent.id];
                    const isEnabled = mapped?.enabled ?? false;
                    return (
                      <div key={tent.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                        {/* Tent header */}
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
                          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <TentIcon className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{tent.name}</p>
                            <p className="text-[11px] text-muted-foreground">{mapped ? mapped.deviceName : 'Sem sensor mapeado'}</p>
                          </div>
                          {/* Toggle por estufa */}
                          {mapped && (
                            <button onClick={() => toggleTentEnabled(tent.id)} className="shrink-0">
                              {isEnabled
                                ? <ToggleRight className="w-7 h-7 text-emerald-500" />
                                : <ToggleLeft className="w-7 h-7 text-muted-foreground" />}
                            </button>
                          )}
                        </div>

                        {/* Device picker */}
                        <div className="px-2 py-2 max-h-48 overflow-y-auto">
                          {/* Opção "nenhum" */}
                          <button
                            onClick={() => {
                              const m = { ...mappings };
                              delete m[tent.id];
                              setMappings(m);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                              !mapped ? 'bg-muted/70' : 'hover:bg-muted/40'
                            }`}
                          >
                            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                              <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                            <p className="text-sm text-muted-foreground italic">Sem sensor</p>
                            {!mapped && <Check className="w-4 h-4 text-emerald-500 ml-auto shrink-0" />}
                          </button>

                          {devices.map((dev: any) => {
                            const isSelected = mapped?.deviceId === dev.id;
                            return (
                              <button
                                key={dev.id}
                                onClick={() => setTentDevice(tent.id, dev.id, dev.name)}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                                  isSelected ? 'bg-emerald-500/10' : 'hover:bg-muted/40'
                                }`}
                              >
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                  dev.online ? 'bg-emerald-500/15' : 'bg-muted'
                                }`}>
                                  {dev.online
                                    ? <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                                    : <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{dev.name}</p>
                                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Thermometer className="w-3 h-3" /><Droplets className="w-3 h-3" />
                                    {dev.online ? 'Online' : 'Offline'}
                                  </p>
                                </div>
                                {isSelected && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                disabled={saveMappings.isPending}
                onClick={handleSaveMappings}
              >
                {saveMappings.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                Salvar mapeamentos
              </Button>
            </>
          )}
        </main>
      </div>
    </PageTransition>
  );
}

// ─── Sub-componente: campo de credencial ──────────────────────────────────────

function CredentialField({
  label,
  value,
  onChange,
  placeholder,
  mono,
  secret,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  mono?: boolean;
  secret?: boolean;
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
          className={`w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50 truncate ${mono ? 'font-mono' : ''}`}
        />
      </div>
      {secret && (
        <button
          onClick={() => setShow(v => !v)}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg bg-muted"
        >
          {show ? 'Ocultar' : 'Ver'}
        </button>
      )}
    </div>
  );
}
