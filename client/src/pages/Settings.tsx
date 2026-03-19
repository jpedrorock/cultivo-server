import { useState } from 'react';
import { NotificationSettings } from "@/components/NotificationSettings";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AlertSettings } from "@/components/AlertSettings";
import { ArrowLeft, Database, Keyboard, BookOpen, ChevronRight, User, Shield, LogOut, Trash2, Eye, EyeOff } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageTransition } from "@/components/PageTransition";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Settings() {
  const { user } = useAuth();

  return (
    <PageTransition>
        <div className="min-h-screen bg-background">
      {/* Header — sticky, compacto no mobile */}
      <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="shrink-0 h-9 w-9 sm:h-10 sm:w-10">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-foreground leading-tight">Configurações</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Personalize seu app</p>
            </div>
          </div>
        </div>
      </header>

      {/* Content — padding-bottom para não sobrepor BottomNav */}
      <main className="container mx-auto px-4 py-6 pb-28 sm:pb-8">
        <div className="max-w-2xl mx-auto space-y-5">
          <ProfileCard />
          {user?.role === 'admin' && <AdminCard />}
          <ThemeToggle />
          <AlertSettings />
          <NotificationSettings />
          <BackupCard />
          <KeyboardShortcuts />
          <HelpCard />
        </div>
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
        <CardDescription className="text-xs sm:text-sm">
          {user?.email}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {feedback && <p className="text-sm text-emerald-600 font-medium">{feedback}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Nome */}
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

        {/* Senha */}
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

        {/* Logout */}
        <Button variant="outline" className="w-full justify-start gap-2" onClick={logout}>
          <LogOut className="w-4 h-4" />
          Sair da conta
        </Button>

        {/* Excluir conta */}
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

function AdminCard() {
  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-amber-700 dark:text-amber-400">
          <Shield className="w-4 h-4 sm:w-5 sm:h-5" />
          Administração
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Gerenciar usuários e acessos
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="w-full justify-between border-amber-200 dark:border-amber-800">
          <Link href="/admin/users">
            <span className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Gerenciar Usuários
            </span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function HelpCard() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          Guia do Usuário
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Aprenda a usar todas as funcionalidades do App Cultivo
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Button asChild variant="outline" className="w-full h-11 justify-between">
          <Link href="/help">
            <span className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Abrir Guia Completo
            </span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function BackupCard() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Database className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
          Backup e Restauração
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Faça backup dos seus dados ou restaure de um backup anterior
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full sm:w-auto min-h-[44px]">
          <Link href="/settings/backup">
            <Database className="w-4 h-4 mr-2" />
            Gerenciar Backups
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground mt-3">
          Proteja seus dados fazendo backups regulares de todas as estufas, plantas, ciclos e registros.
        </p>
      </CardContent>
    </Card>
  );
}

function KeyboardShortcuts() {
  const shortcuts = [
    { description: "Criar Nova Estufa", shortcut: "Ctrl+N", context: "Página inicial" },
    { description: "Salvar Registro", shortcut: "Ctrl+S", context: "Página de registro" },
    { description: "Ir para Histórico", shortcut: "Ctrl+H", context: "Qualquer página" },
    { description: "Ir para Calculadoras", shortcut: "Ctrl+C", context: "Qualquer página" },
    { description: "Mostrar Atalhos", shortcut: "Ctrl+/", context: "Qualquer página" },
  ];

  return (
    <Card className="max-lg:hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Keyboard className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
          Atalhos de Teclado
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Use estes atalhos para navegar mais rapidamente pelo aplicativo
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {shortcuts.map((item, index) => (
            <div
              key={index}
              className="flex items-center justify-between py-2 px-3 bg-muted rounded-md"
            >
              <div className="flex flex-col min-w-0 mr-3">
                <span className="text-sm font-medium text-foreground truncate">{item.description}</span>
                <span className="text-xs text-muted-foreground">{item.context}</span>
              </div>
              <kbd className="shrink-0 px-2 py-1 text-xs font-semibold text-foreground bg-background border border-border rounded shadow-sm">
                {item.shortcut}
              </kbd>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-gray-500/10 border border-gray-500/20 dark:border-gray-600 rounded-md">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            <strong>Dica:</strong> Os atalhos não funcionam quando você está digitando em campos de texto.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
