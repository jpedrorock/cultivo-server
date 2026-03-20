import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

export default function Setup() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [groupName, setGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !isAuthenticated) setLocation('/login');
  }, [loading, isAuthenticated, setLocation]);

  const createGroup = trpc.groups.create.useMutation({
    onSuccess: () => { window.location.href = '/'; },
    onError: (e) => setError(e.message),
  });

  const joinGroup = trpc.groups.join.useMutation({
    onSuccess: () => { window.location.href = '/'; },
    onError: (e) => setError(e.message),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4">
            <img src="/icon.svg" alt="Cultivo" className="w-full h-full" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Nenhum cultivo ativo</h1>
          <p className="text-sm text-muted-foreground mt-1">Crie o seu ou entre em um com código de convite</p>
        </div>

        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={() => setMode('create')}
              className="w-full p-5 rounded-2xl border-2 border-border hover:border-emerald-500 bg-card text-left transition-all"
            >
              <div className="text-2xl mb-2">🏡</div>
              <div className="font-semibold text-foreground">Criar meu cultivo</div>
              <div className="text-sm text-muted-foreground mt-1">Começa do zero com seus dados</div>
            </button>

            <button
              onClick={() => setMode('join')}
              className="w-full p-5 rounded-2xl border-2 border-border hover:border-emerald-500 bg-card text-left transition-all"
            >
              <div className="text-2xl mb-2">🤝</div>
              <div className="font-semibold text-foreground">Entrar em um cultivo</div>
              <div className="text-sm text-muted-foreground mt-1">Use o código de cultivo de alguém</div>
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="space-y-4">
            <button onClick={() => { setMode('choose'); setError(''); }} className="text-sm text-muted-foreground hover:text-foreground">← Voltar</button>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nome do seu cultivo</label>
              <input
                type="text"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="Ex: Cultivo da Casa"
                autoFocus
                className="w-full px-4 py-3 rounded-xl border-2 border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              onClick={() => { setError(''); createGroup.mutate({ name: groupName }); }}
              disabled={!groupName.trim() || createGroup.isPending}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {createGroup.isPending ? 'Criando...' : 'Criar cultivo'}
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="space-y-4">
            <button onClick={() => { setMode('choose'); setError(''); }} className="text-sm text-muted-foreground hover:text-foreground">← Voltar</button>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Código de cultivo</label>
              <input
                type="text"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                placeholder="Ex: AB12CD34"
                autoFocus
                className="w-full px-4 py-3 rounded-xl border-2 border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors font-mono tracking-widest text-center text-lg"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              onClick={() => { setError(''); joinGroup.mutate({ inviteCode }); }}
              disabled={inviteCode.length < 6 || joinGroup.isPending}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {joinGroup.isPending ? 'Entrando...' : 'Entrar no cultivo'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
