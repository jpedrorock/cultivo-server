import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { User, Users, Eye, EyeOff, LogOut, Trash2, Copy, RefreshCw, UserMinus, Bot, Key, CheckCircle2, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

function UserAvatar({ user, size = 'md' }: { user: { name?: string | null; email?: string; avatarUrl?: string | null } | null; size?: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';
  const text = size === 'lg' ? 'text-lg' : 'text-sm';
  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase();
  if (user?.avatarUrl) {
    return <img src={user.avatarUrl} alt={user.name || ''} className={`${dim} rounded-full object-cover shrink-0`} />;
  }
  return (
    <div className={`${dim} rounded-full bg-primary flex items-center justify-center shrink-0`}>
      <span className={`text-white font-bold ${text}`}>{initial}</span>
    </div>
  );
}
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageTransition } from '@/components/PageTransition';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';

export default function AccountSettings() {
  const { user } = useAuth();
  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        <PageHeader
          backHref="/settings"
          title={
            <>
              <UserAvatar user={user} size="md" />
              <span className="truncate">{user?.name || 'Sem nome'}</span>
            </>
          }
          subtitle={user?.email}
        />
        <main className="container mx-auto px-4 py-6 pb-28 sm:pb-8 max-w-2xl space-y-5">
          <ProfileCard />
          <GroupCard />
          <AiSettingsCard />
        </main>
      </div>
    </PageTransition>
  );
}

function ProfileCard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [nameFeedback, setNameFeedback] = useState('');

  // Password complexity
  const pwReqs = {
    length:  newPassword.length >= 8,
    upper:   /[A-Z]/.test(newPassword),
    lower:   /[a-z]/.test(newPassword),
    digit:   /[0-9]/.test(newPassword),
    special: /[^A-Za-z0-9]/.test(newPassword),
  };
  const pwScore = Object.values(pwReqs).filter(Boolean).length; // 0-5
  const pwStrengthLabel = pwScore <= 1 ? 'Fraca' : pwScore <= 2 ? 'Razoável' : pwScore <= 3 ? 'Boa' : 'Forte';
  const pwStrengthColor = pwScore <= 1 ? 'bg-destructive' : pwScore <= 2 ? 'bg-amber-500' : pwScore <= 3 ? 'bg-yellow-400' : 'bg-emerald-500';
  const [nameError, setNameError] = useState('');
  const [pwFeedback, setPwFeedback] = useState('');
  const [pwError, setPwError] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const updateName = trpc.profile.updateName.useMutation({
    onSuccess: () => {
      setEditingName(false);
      setNameFeedback('Nome atualizado!');
      setTimeout(() => setNameFeedback(''), 3000);
    },
    onError: (e) => setNameError(e.message),
  });

  const updatePassword = trpc.profile.updatePassword.useMutation({
    onSuccess: () => {
      setShowPasswordForm(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setPwFeedback('Senha atualizada!');
      setTimeout(() => setPwFeedback(''), 3000);
    },
    onError: (e) => setPwError(e.message),
  });

  const deleteAccount = trpc.profile.deleteAccount.useMutation({
    onSuccess: async () => { await logout(); setLocation('/login'); },
    onError: (e) => setNameError(e.message),
  });

  const handleDeleteAccount = () => {
    setDeleteConfirmOpen(true);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <User className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          Minha Conta
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">{user?.email}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {nameFeedback && <p className="text-sm text-emerald-600 font-medium">{nameFeedback}</p>}
        {nameError && <p className="text-sm text-destructive">{nameError}</p>}

        {editingName ? (
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="flex-1 px-3 py-2 text-sm rounded-lg border-2 border-border bg-card focus:outline-none focus:border-emerald-500"
              placeholder="Seu nome"
            />
            <Button size="sm" onClick={() => updateName.mutate({ name })} disabled={updateName.isPending}>Salvar</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancelar</Button>
          </div>
        ) : (
          <button
            onClick={() => { setName(user?.name ?? ''); setEditingName(true); setNameError(''); }}
            className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg border border-border hover:bg-muted transition-colors text-sm"
          >
            <span className="text-muted-foreground">Nome</span>
            <span className="font-medium">{user?.name || 'Não definido'} <span className="text-xs text-emerald-600 ml-1">editar</span></span>
          </button>
        )}

        {showPasswordForm ? (
          <div className="space-y-2 p-3 border border-border rounded-lg">
            <p className="text-sm font-medium">Alterar senha</p>
            <div className="relative">
              <input type={showCurrent ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Senha atual" className="w-full px-3 py-2 pr-9 text-sm rounded-lg border border-border bg-card focus:outline-none focus:border-emerald-500" />
              <button onClick={() => setShowCurrent(!showCurrent)} className="absolute right-2.5 top-2.5 text-muted-foreground">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="relative">
              <input type={showNew ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="Nova senha (mín. 8 caracteres)" className="w-full px-3 py-2 pr-9 text-sm rounded-lg border border-border bg-card focus:outline-none focus:border-emerald-500" />
              <button onClick={() => setShowNew(!showNew)} className="absolute right-2.5 top-2.5 text-muted-foreground">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {newPassword.length > 0 && (
              <div className="space-y-2">
                {/* Strength bar */}
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5 flex-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= pwScore ? pwStrengthColor : 'bg-muted'}`} />
                    ))}
                  </div>
                  <span className={`text-xs font-medium w-14 text-right ${pwScore <= 1 ? 'text-destructive' : pwScore <= 2 ? 'text-amber-500' : pwScore <= 3 ? 'text-yellow-500' : 'text-emerald-500'}`}>
                    {pwStrengthLabel}
                  </span>
                </div>
                {/* Requirements checklist */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {([
                    ['length',  '8+ caracteres'],
                    ['upper',   'Maiúscula (A-Z)'],
                    ['lower',   'Minúscula (a-z)'],
                    ['digit',   'Número (0-9)'],
                    ['special', 'Símbolo (!@#…)'],
                  ] as [keyof typeof pwReqs, string][]).map(([key, label]) => (
                    <span key={key} className={`flex items-center gap-1 text-xs ${pwReqs[key] ? 'text-emerald-500' : 'text-muted-foreground/60'}`}>
                      {pwReqs[key] ? '✓' : '·'} {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="relative">
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirmar nova senha"
                className={`w-full px-3 py-2 pr-9 text-sm rounded-lg border bg-card focus:outline-none ${confirmPassword && confirmPassword !== newPassword ? 'border-destructive focus:border-destructive' : 'border-border focus:border-emerald-500'}`}
              />
              {confirmPassword && confirmPassword === newPassword && (
                <span className="absolute right-2.5 top-2.5 text-emerald-500 text-xs">✓</span>
              )}
            </div>
            {confirmPassword && confirmPassword !== newPassword && (
              <p className="text-xs text-destructive">As senhas não coincidem</p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => {
                if (newPassword.length < 8) { setPwError('A senha deve ter pelo menos 8 caracteres'); return; }
                if (newPassword !== confirmPassword) { setPwError('As senhas não coincidem'); return; }
                setPwError(''); updatePassword.mutate({ currentPassword, newPassword });
              }} disabled={updatePassword.isPending || (!!confirmPassword && confirmPassword !== newPassword)}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowPasswordForm(false); setPwError(''); setConfirmPassword(''); }}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setShowPasswordForm(true); setPwError(''); }}
            className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg border border-border hover:bg-muted transition-colors text-sm"
          >
            <span className="text-muted-foreground">Senha</span>
            <span className="text-xs text-emerald-600 font-medium">alterar</span>
          </button>
        )}
        {pwFeedback && <p className="text-sm text-emerald-600 font-medium">{pwFeedback}</p>}
        {pwError && <p className="text-sm text-destructive">{pwError}</p>}

        <Button variant="outline" className="w-full justify-start gap-2" onClick={logout}>
          <LogOut className="w-4 h-4" />
          Sair da conta
        </Button>

        <button
          onClick={handleDeleteAccount}
          disabled={deleteAccount.isPending}
          className="flex items-center gap-2 text-sm text-destructive hover:underline disabled:opacity-60"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Excluir minha conta
        </button>
      </CardContent>

      {/* Delete account confirmation dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Excluir conta
            </DialogTitle>
            <DialogDescription>
              Excluir sua conta permanentemente? Todos os seus dados serão removidos. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteAccount.isPending}
              onClick={() => { setDeleteConfirmOpen(false); deleteAccount.mutate(); }}
            >
              {deleteAccount.isPending ? 'Excluindo…' : 'Excluir conta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function GroupCard() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);

  const { data: group, refetch } = trpc.groups.mine.useQuery();
  const regenerate = trpc.groups.regenerateCode.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => toast.error(`Erro ao gerar código: ${e.message}`),
  });
  const removeMember = trpc.groups.removeMember.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => toast.error(`Erro ao remover membro: ${e.message}`),
  });

  const handleCopy = () => {
    if (!group?.inviteCode) return;
    navigator.clipboard.writeText(group.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = () => {
    setRegenConfirmOpen(true);
  };

  const handleRemove = (memberId: number) => {
    removeMember.mutate({ userId: memberId });
    setConfirmRemove(null);
  };

  if (!group) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Users className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          Meu Cultivo
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">{group.name}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-xs text-muted-foreground mb-1.5">Código de cultivo — compartilhe com quem quiser convidar</p>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold tracking-widest text-lg flex-1">{group.inviteCode}</span>
            <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5 shrink-0">
              <Copy className="w-3.5 h-3.5" />
              {copied ? 'Copiado!' : 'Copiar'}
            </Button>
            {group.isOwner && (
              <Button size="sm" variant="ghost" onClick={handleRegenerate} disabled={regenerate.isPending} className="shrink-0" title="Gerar novo código">
                <RefreshCw className={`w-3.5 h-3.5 ${regenerate.isPending ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">{group.members.length} membro(s)</p>
          <div className="space-y-1.5">
            {group.members.map((m: any) => (
              <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50">
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">{(m.name || m.email).charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.name || m.email}</p>
                  {m.name && <p className="text-xs text-muted-foreground truncate">{m.email}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {m.id === group.ownerId && (
                    <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">dono</span>
                  )}
                  {m.id === user?.id && (
                    <span className="text-xs text-muted-foreground">você</span>
                  )}
                  {group.isOwner && m.id !== user?.id && (
                    confirmRemove === m.id ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="destructive" className="h-6 px-2 text-xs" onClick={() => handleRemove(m.id)}>Remover</Button>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setConfirmRemove(null)}>Cancelar</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => setConfirmRemove(m.id)}>
                        <UserMinus className="w-3.5 h-3.5" />
                      </Button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>

      {/* Regen code confirmation dialog */}
      <Dialog open={regenConfirmOpen} onOpenChange={setRegenConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar novo código?</DialogTitle>
            <DialogDescription>
              O código de convite atual deixará de funcionar imediatamente. Membros novos precisarão do novo código.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRegenConfirmOpen(false)}>Cancelar</Button>
            <Button
              disabled={regenerate.isPending}
              onClick={() => { setRegenConfirmOpen(false); regenerate.mutate(); }}
            >
              {regenerate.isPending ? 'Gerando…' : 'Gerar novo código'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const PROVIDER_MODELS = {
  gemini:    { label: 'Gemini',    models: ['gemini-2.0-flash-lite', 'gemini-2.5-flash-preview-04-17', 'gemini-2.5-pro-preview-03-25'],  hint: 'Tier gratuito · aistudio.google.com' },
  deepseek:  { label: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'],               hint: 'Mais barato pago · platform.deepseek.com' },
  openai:    { label: 'OpenAI',   models: ['gpt-4o-mini', 'gpt-4o'],                            hint: 'platform.openai.com' },
  anthropic: { label: 'Anthropic', models: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'],  hint: 'console.anthropic.com' },
  kimi:      { label: 'Kimi',     models: ['moonshot-v1-8k', 'moonshot-v1-32k'],                hint: 'platform.moonshot.cn' },
} as const;

type Provider = keyof typeof PROVIDER_MODELS;

function AiSettingsCard() {
  const { data: settings } = trpc.aiChat.getSettings.useQuery();
  const { data: liveModels, isLoading: modelsLoading } = trpc.aiChat.listModels.useQuery(
    undefined,
    { enabled: !!settings?.hasKey },
  );
  const save = trpc.aiChat.saveSettings.useMutation({
    onSuccess: () => { toast.success('API configurada!'); setTestResult(null); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
  const test = trpc.aiChat.testConnection.useMutation({
    onSuccess: (d) => setTestResult({ ok: true, msg: `✓ Conectado · ${d.modelUsed}` }),
    onError: (e) => setTestResult({ ok: false, msg: e.message }),
  });

  const [provider, setProvider] = useState<Provider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<string>(PROVIDER_MODELS.gemini.models[0]);
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Modelos disponíveis: live da API (Gemini) ou lista estática
  const availableModels: string[] = (liveModels?.models?.length)
    ? liveModels.models
    : [...PROVIDER_MODELS[provider].models];

  useEffect(() => {
    if (!settings) return;
    const p = (settings.provider as Provider | null) ?? 'gemini';
    setProvider(p);
    setModel(settings.model ?? PROVIDER_MODELS[p]?.models[0] ?? PROVIDER_MODELS.gemini.models[0]);
  }, [settings]); // depende de settings inteiro para detectar qualquer mudança

  // Quando modelos live carregam e o modelo atual não está na lista, seleciona o primeiro
  useEffect(() => {
    if (liveModels?.models?.length && !liveModels.models.includes(model)) {
      setModel(liveModels.models[0]);
    }
  }, [liveModels]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleProviderChange = (p: Provider) => {
    setProvider(p);
    setModel(PROVIDER_MODELS[p].models[0]);
    setTestResult(null);
  };

  const handleSave = () => {
    const key = apiKey.trim();
    if (!key && !settings?.hasKey) return;
    save.mutate({ provider, ...(key ? { apiKey: key } : {}), model });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          Doctor Jáh
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Configure sua chave de API para usar o chat de diagnóstico de plantas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {settings?.hasKey ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>API configurada — provedor: <strong>{PROVIDER_MODELS[settings.provider as Provider]?.label ?? settings.provider}</strong></span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Nenhuma chave configurada. O chat de IA não estará disponível.</span>
          </div>
        )}

        <div className="space-y-3 p-3 border border-border rounded-lg">
          {/* Provedor */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Provedor</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {(Object.keys(PROVIDER_MODELS) as Provider[]).map(p => {
                const isSelected = provider === p;
                return (
                  <button
                    key={p}
                    onClick={() => handleProviderChange(p)}
                    className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg border text-left transition-all active:scale-[0.98] ${
                      isSelected
                        ? 'bg-emerald-600/10 border-emerald-500/50 text-emerald-700 dark:text-emerald-400'
                        : 'bg-muted/40 border-border text-muted-foreground hover:border-emerald-500/30 hover:text-foreground'
                    }`}
                  >
                    <span className={`text-xs font-semibold ${isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground'}`}>
                      {PROVIDER_MODELS[p].label}
                    </span>
                    <span className="text-xs leading-tight opacity-70 truncate w-full">
                      {PROVIDER_MODELS[p].hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Modelo */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Modelo</p>
              {modelsLoading && <span className="text-xs text-muted-foreground animate-pulse">Carregando modelos…</span>}
              {!modelsLoading && liveModels?.models?.length ? <span className="text-xs text-emerald-600">{liveModels.models.length} disponíveis</span> : null}
            </div>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card focus:outline-none focus:border-emerald-500"
            >
              {availableModels.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              <Key className="w-3 h-3 inline mr-1" />
              Chave de API {settings?.hasKey && '(deixe em branco para manter a atual)'}
            </p>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={settings?.hasKey ? '••••••••••••••••' : 'sk-...'}
                className="w-full px-3 py-2 pr-9 text-sm rounded-lg border border-border bg-card focus:outline-none focus:border-emerald-500"
              />
              <button onClick={() => setShowKey(!showKey)} className="absolute right-2.5 top-2.5 text-muted-foreground">
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Resultado do teste */}
          {testResult && (
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
              testResult.ok
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-destructive/10 text-destructive border border-destructive/20'
            }`}>
              {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
              <span>{testResult.msg}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => test.mutate()}
              disabled={test.isPending || !settings?.hasKey}
              className="flex-1"
            >
              {test.isPending ? 'Testando…' : 'Testar conexão'}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={save.isPending || (!apiKey.trim() && !settings?.hasKey)}
              className="flex-1"
            >
              {save.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
