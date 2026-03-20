import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { ArrowLeft, Trash2, Shield, User, Crown, Check, X, Clock } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageTransition } from '@/components/PageTransition';

export default function AdminUsers() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [tab, setTab] = useState<'approved' | 'pending'>('approved');

  const { data: users, isLoading, refetch } = trpc.admin.listUsers.useQuery();
  const deleteUser = trpc.admin.deleteUser.useMutation({ onSuccess: () => refetch() });
  const setRole = trpc.admin.setRole.useMutation({ onSuccess: () => refetch() });
  const approveUser = trpc.admin.approveUser.useMutation({ onSuccess: () => refetch() });
  const revokeUser = trpc.admin.revokeUser.useMutation({ onSuccess: () => refetch() });

  // Redirecionar se não for admin
  if (user && user.role !== 'admin') {
    setLocation('/');
    return null;
  }

  const approvedUsers = users?.filter(u => u.approved) ?? [];
  const pendingUsers = users?.filter(u => !u.approved) ?? [];

  const handleDelete = async (userId: number, email: string) => {
    if (!confirm(`Excluir a conta de ${email}? Esta ação não pode ser desfeita.`)) return;
    setDeletingId(userId);
    try {
      await deleteUser.mutateAsync({ userId });
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleRole = async (userId: number, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    await setRole.mutateAsync({ userId, role: newRole as 'user' | 'admin' });
  };

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
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-foreground leading-tight">Usuários</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">Painel de administração</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="container mx-auto px-4 flex gap-1 pb-0">
            <button
              onClick={() => setTab('approved')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === 'approved'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Aprovados ({approvedUsers.length})
            </button>
            <button
              onClick={() => setTab('pending')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                tab === 'pending'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Aguardando
              {pendingUsers.length > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {pendingUsers.length}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 pb-28 sm:pb-8 max-w-2xl">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : tab === 'approved' ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-4">{approvedUsers.length} usuário(s) aprovado(s)</p>
              {approvedUsers.map(u => (
                <Card key={u.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
                        {u.role === 'admin'
                          ? <Crown className="w-5 h-5 text-white" />
                          : <User className="w-5 h-5 text-white" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground truncate">{u.name || u.email}</div>
                        {u.name && <div className="text-xs text-muted-foreground truncate">{u.email}</div>}
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                            {u.role === 'admin' ? 'Admin' : 'Usuário'}
                          </span>
                          {u.lastSignedIn && (
                            <span className="text-xs text-muted-foreground">
                              último login: {new Date(u.lastSignedIn).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </div>
                      {u.id !== user?.id ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => handleToggleRole(u.id, u.role ?? 'user')}
                            title={u.role === 'admin' ? 'Rebaixar para usuário' : 'Promover a admin'}
                          >
                            <Shield className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(u.id, u.email)}
                            disabled={deletingId === u.id}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground shrink-0">você</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {pendingUsers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Nenhum usuário aguardando aprovação</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-4">{pendingUsers.length} usuário(s) aguardando aprovação</p>
                  {pendingUsers.map(u => (
                    <Card key={u.id} className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                            <Clock className="w-5 h-5 text-amber-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-foreground truncate">{u.name || u.email}</div>
                            {u.name && <div className="text-xs text-muted-foreground truncate">{u.email}</div>}
                            <div className="text-xs text-muted-foreground mt-1">
                              registrou em {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100"
                              onClick={() => approveUser.mutate({ userId: u.id })}
                              title="Aprovar acesso"
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(u.id, u.email)}
                              disabled={deletingId === u.id}
                              title="Recusar e excluir conta"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </PageTransition>
  );
}
