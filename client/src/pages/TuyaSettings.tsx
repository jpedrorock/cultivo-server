import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Wifi, WifiOff, Check, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageTransition } from '@/components/PageTransition';
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
  { value: 30,  label: 'A cada 30 min',  sub: '~48x por dia' },
  { value: 60,  label: 'A cada 1 hora',  sub: '~24x por dia' },
  { value: 180, label: 'A cada 3 horas', sub: '~8x por dia' },
  { value: 480, label: '3× ao dia',      sub: 'manhã, tarde, noite' },
  { value: 720, label: '2× ao dia',      sub: 'manhã e noite' },
];

export default function TuyaSettings() {
  const [accessId, setAccessId] = useState('');
  const [accessSecret, setAccessSecret] = useState('');
  const [region, setRegion] = useState<Region>('eu');
  const [pollInterval, setPollInterval] = useState<PollInterval>(180);
  const [integrationEnabled, setIntegrationEnabled] = useState(true);
  const [connStatus, setConnStatus] = useState<null | 'ok' | 'error'>(null);
  const [connMsg, setConnMsg] = useState('');

  const { data: config, isLoading } = trpc.tuya.getConfig.useQuery();

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
    onSuccess: () => toast.success('Configuração salva!'),
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const testConn = trpc.tuya.testConnection.useMutation({
    onSuccess: (r) => {
      setConnStatus(r.ok ? 'ok' : 'error');
      setConnMsg(r.ok ? 'Conectado com sucesso!' : (r.error ?? 'Erro desconhecido'));
    },
    onError: (e) => { setConnStatus('error'); setConnMsg(e.message); },
  });

  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
          <div className="container mx-auto px-4 py-3 flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="shrink-0 h-9 w-9">
              <Link href="/settings"><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <div>
              <h1 className="text-base font-bold leading-tight">Sensores SmartLife / Tuya</h1>
              <p className="text-xs text-muted-foreground">Credenciais da API — vinculação por estufa</p>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 pb-28 max-w-2xl space-y-5">

          {/* Guia */}
          <div className="rounded-2xl bg-blue-500/8 border border-blue-500/20 p-4 space-y-1.5">
            <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">Como obter as credenciais</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Acesse <span className="font-mono text-foreground">iot.tuya.com</span> e crie uma conta</li>
              <li>Crie um <strong>Cloud Project</strong> → Smart Home → Data Center: Western Europe</li>
              <li>Em <strong>Devices → Link App Account</strong>, vincule o SmartLife pelo QR code</li>
              <li>Copie o <strong>Access ID</strong> e <strong>Access Secret</strong> do projeto</li>
            </ol>
            <p className="text-xs text-muted-foreground pt-1">
              Após salvar, vá em cada estufa para vincular o sensor de temperatura.
            </p>
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

          {/* Frequência */}
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
                  {pollInterval === opt.value && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Status de conexão */}
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
              onClick={() => saveConfig.mutate({ accessId, accessSecret, region, pollIntervalMin: pollInterval, enabled: integrationEnabled })}
            >
              {saveConfig.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
          </div>
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
        <button
          onClick={() => setShow(v => !v)}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg bg-muted"
        >
          {show ? 'Ocultar' : 'Ver'}
        </button>
      )}
    </div>
  );
}
