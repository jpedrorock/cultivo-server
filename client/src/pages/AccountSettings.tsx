import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, User, Users, Eye, EyeOff, LogOut, Trash2, Copy, RefreshCw, UserMinus } from 'lucide-react';

function UserAvatar({ user, size = 'md' }: { user: { name?: string | null; email?: string; avatarUrl?: string | null } | null; size?: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';
  const text = size === 'lg' ? 'text-lg' : 'text-sm';
  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase();
  if (user?.avatarUrl) {
    return <img src={user.avatarUrl} alt={user.name || ''} className={`${dim} rounded-full object-cover shrink-0`} />;
  }
  return (
    <div className={`${dim} rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0`}>
      <span className={`text-white font-bold ${text}`}>{initial}</span>
    </div>
  );
}
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageTransition } from '@/components/PageTransition';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

export default function AccountSettings() {
  const { user } = useAuth();
  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
          <div className="container mx-auto px-4 py-3 sm:py-4">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="icon" className="shrink-0 h-9 w-9">
                <Link href="/settings">
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </Button>
              <UserAvatar user={user} size="lg" />
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-foreground leading-tight truncate">{user?.name || 'Sem nome'}</h1>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-6 pb-28 sm:pb-8 max-w-2xl space-y-5">
          <ProfileCard />
          <GroupCard />
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
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const updateName = trpc.profile.updateName.useMutation({
    onSuccess: () => { setEditingName(false); setFeedback('Nome atualizado!'); setTimeout(() => setFeedback(''), 3000); },
    onError: (e) => setError(e.message),
  });

  const updatePassword = trpc.profile.updatePassword.useMutation({
    onSuccess: () => {
      setShowPasswordForm(false);
      setCurrentPassword(''); setNewPassword('');
      setFeedback('Senha atualizada!');
      setTimeout(() => setFeedback(''), 3000);
    },
    onError: (e) => setError(e.message),
  });

  const deleteAccount = trpc.profile.deleteAccount.useMutation({
    onSuccess: async () => { await logout(); setLocation('/login'); },
  });

  const handleDeleteAccount = () => {
    if (!confirm('Excluir sua conta permanentemente? Esta ação não pode ser desfeita.')) return;
    deleteAccount.mutate();
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
        {feedback && <p className="text-sm text-emerald-600 font-medium">{feedback}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

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
            onClick={() => { setName(user?.name ?? ''); setEditingName(true); setError(''); }}
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
                placeholder="Nova senha (mín. 6 caracteres)" className="w-full px-3 py-2 pr-9 text-sm rounded-lg border border-border bg-card focus:outline-none focus:border-emerald-500" />
              <button onClick={() => setShowNew(!showNew)} className="absolute right-2.5 top-2.5 text-muted-foreground">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { setError(''); updatePassword.mutate({ currentPassword, newPassword }); }} disabled={updatePassword.isPending}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowPasswordForm(false); setError(''); }}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setShowPasswordForm(true); setError(''); }}
            className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg border border-border hover:bg-muted transition-colors text-sm"
          >
            <span className="text-muted-foreground">Senha</span>
            <span className="text-xs text-emerald-600 font-medium">alterar</span>
          </button>
        )}

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
    </Card>
  );
}

function GroupCard() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  const { data: group, refetch } = trpc.groups.mine.useQuery();
  const regenerate = trpc.groups.regenerateCode.useMutation({ onSuccess: () => refetch() });
  const removeMember = trpc.groups.removeMember.useMutation({ onSuccess: () => refetch() });

  const handleCopy = () => {
    if (!group?.inviteCode) return;
    navigator.clipboard.writeText(group.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = () => {
    if (!confirm('Gerar um novo código? O código atual deixará de funcionar.')) return;
    regenerate.mutate();
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
            {group.members.map(m => (
              <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
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
    </Card>
  );
}
