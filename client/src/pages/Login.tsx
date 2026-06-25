import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/_core/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, Lock, AlertCircle, KeyRound, Check } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { isAppleSignInAvailable, signInWithApple } from '@/lib/appleSignIn';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { isAuthenticated, loading: authLoading, refresh } = useAuth();
  const appleAvailable = isAppleSignInAvailable();

  // Forgot password modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      // Sempre mostra sucesso (anti-enumeration — backend nunca confirma se email existe)
      setForgotSuccess(true);
    } catch {
      // Mesmo em erro de rede, não vaza info — finge sucesso
      setForgotSuccess(true);
    } finally {
      setForgotLoading(false);
    }
  }

  function closeForgot() {
    setForgotOpen(false);
    // Reset state após animação fechar
    setTimeout(() => {
      setForgotEmail('');
      setForgotSuccess(false);
    }, 200);
  }

  // Se já está autenticado, redirecionar para home
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      setLocation('/');
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // Mostrar erro vindo do callback do Google
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err === 'google_cancelled') {
      setError('Login com Google cancelado.');
    } else if (err === 'google_failed') {
      setError('Erro ao autenticar com Google. Tente novamente.');
    } else if (err === 'google_state_invalid') {
      setError('Sessão expirou ou link inválido. Tente entrar com Google novamente.');
    } else if (err === 'google_email_not_verified') {
      setError('Este email Google ainda não foi verificado. Confirme no Gmail antes de entrar.');
    } else if (err === 'google_email_exists') {
      setError('Já existe uma conta com este email. Entre com email/senha e vincule o Google nas configurações.');
    } else if (err === 'google_account_conflict') {
      setError('Este email já está vinculado a outra conta Google. Entre em contato com o suporte.');
    }
  }, []);

  const handleAppleSignIn = async () => {
    setError('');
    setAppleLoading(true);
    try {
      const result = await signInWithApple();
      if (result.success) {
        await refresh();
        setLocation('/');
        return;
      }
      // Pending = conta criada esperando aprovação do admin
      if (result.pending) {
        setLocation('/pending-approval');
        return;
      }
      // Erro real (não cancelamento) — mostra. Cancelamento volta string "Login cancelado".
      if (!result.error.toLowerCase().includes('cancelado')) {
        setError(result.error);
      }
    } catch {
      setError('Erro inesperado ao entrar com Apple.');
    } finally {
      setAppleLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { isNative, apiUrl } = await import('@/lib/platform');
      const { persistAuthToken } = await import('@/_core/hooks/useAuth');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isNative()) headers['X-Client'] = 'capacitor';
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers,
        credentials: isNative() ? 'omit' : 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        await persistAuthToken(data.token);
        await refresh();
        setLocation('/');
      } else if (data.code === 'PENDING_APPROVAL') {
        setLocation('/pending-approval');
      } else {
        setError(data.error || 'Email ou senha incorretos');
      }
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center bg-background p-4">

      {/* ── Atmospheric blobs — complementam o forest theme, sutis no claro ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 select-none overflow-hidden">
        {/* Glow verde — topo centro */}
        <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[560px] h-[560px] rounded-full blur-3xl opacity-[0.16]"
             style={{ background: 'radial-gradient(circle, oklch(0.68 0.20 145) 0%, transparent 65%)' }} />
        {/* Glow índigo — canto inferior direito */}
        <div className="absolute -bottom-[12%] -right-[8%] w-[380px] h-[380px] rounded-full blur-3xl opacity-[0.10]"
             style={{ background: 'radial-gradient(circle, oklch(0.62 0.17 245) 0%, transparent 70%)' }} />
        {/* Glow teal — canto inferior esquerdo */}
        <div className="absolute -bottom-[8%] -left-[8%] w-[320px] h-[320px] rounded-full blur-3xl opacity-[0.08]"
             style={{ background: 'radial-gradient(circle, oklch(0.68 0.15 185) 0%, transparent 70%)' }} />
      </div>

      {/* ── Card glass — flutua sobre a atmosfera ── */}
      <div className="w-full max-w-sm relative z-10 animate-in fade-in slide-in-from-bottom-3 duration-300">
        <div className="bg-card/65 dark:bg-card/50 backdrop-blur-2xl border border-border/50 dark:border-white/[0.07] rounded-2xl shadow-2xl shadow-black/15 dark:shadow-black/55 px-7 pt-8 pb-7">

          {/* Logo */}
          <div className="text-center mb-7">
            <div className="relative inline-flex mb-4">
              {/* Halo de brilho atrás do ícone */}
              <div className="absolute inset-[-4px] rounded-3xl blur-2xl opacity-50 pointer-events-none"
                   style={{ background: 'radial-gradient(circle, oklch(0.68 0.20 145 / 0.50) 0%, transparent 70%)' }} />
              <div className="relative w-20 h-20 rounded-2xl bg-primary/10 dark:bg-primary/15 border border-primary/25 flex items-center justify-center shadow-lg">
                <img src="/icon.svg" alt="Cultivo" className="w-12 h-12" />
              </div>
            </div>
            <h1 className="text-[2rem] font-black text-foreground tracking-tight leading-none">Cultivo</h1>
            <p className="text-sm text-muted-foreground mt-2 leading-snug">Gerencie sua estufa com inteligência</p>
          </div>

          {/* Botão Apple — Apple HIG exige design preto/branco padrão. Só renderiza em iOS native. */}
          {appleAvailable && (
            <button
              type="button"
              onClick={handleAppleSignIn}
              disabled={appleLoading}
              className="flex items-center justify-center gap-3 w-full px-4 py-3 rounded-xl bg-foreground text-background font-semibold hover:opacity-90 transition-opacity mb-3 disabled:opacity-60"
            >
              {appleLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
              )}
              Continuar com Apple
            </button>
          )}

          {/* Botão Google */}
          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-3 w-full px-4 py-3 rounded-xl border border-border/60 bg-background/40 dark:bg-background/30 text-foreground font-medium hover:bg-background/70 transition-colors mb-5"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Entrar com Google
          </a>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-border/50" />
            <span className="text-xs text-muted-foreground/60 shrink-0">ou email</span>
            <div className="flex-1 h-px bg-border/50" />
          </div>

          {/* Formulário email/senha */}
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 px-3.5 py-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="flex-1">{error}</span>
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-foreground mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-background/60 dark:bg-background/40 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-all"
                />
              </div>
            </div>

            {/* Senha */}
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-foreground mb-1.5">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-background/60 dark:bg-background/40 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-all"
                />
              </div>
              {/* Recuperação abaixo do campo (mais visível que ao lado do label — NN/g) */}
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={() => { if (email) setForgotEmail(email); setForgotOpen(true); }}
                  className="text-xs font-medium text-primary hover:underline transition-colors"
                >
                  Esqueci minha senha
                </button>
              </div>
            </div>

            <Button type="submit" disabled={loading} size="lg" className="w-full">
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Entrando...</>
              ) : (
                'Entrar'
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-5">
            Não tem conta?{' '}
            <button
              type="button"
              onClick={() => setLocation('/register')}
              className="text-primary font-semibold hover:underline underline-offset-2"
            >
              Registrar
            </button>
          </p>

        </div>{/* /glass card */}
      </div>

      {/* Modal de recuperar senha — UX padrao SaaS, anti-enumeration:
          backend retorna sempre o mesmo response independente do email existir.
          Implementacao atual e' MVP — admin ve pedidos no log e processa
          manualmente. Email automatico (Resend/nodemailer) plugavel depois. */}
      <Dialog open={forgotOpen} onOpenChange={(o) => (o ? setForgotOpen(true) : closeForgot())}>
        <DialogContent className="sm:max-w-md">
          {!forgotSuccess ? (
            <form onSubmit={handleForgotSubmit}>
              <DialogHeader>
                <div className="w-12 h-12 rounded-2xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center mb-3">
                  <KeyRound className="w-5 h-5 text-primary" />
                </div>
                <DialogTitle>Recuperar senha</DialogTitle>
                <DialogDescription>
                  Informe o email cadastrado. Vamos enviar um link de redefinição
                  caso a conta exista.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    autoFocus
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-all"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeForgot} disabled={forgotLoading}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={forgotLoading || !forgotEmail.trim()}>
                  {forgotLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Enviando...
                    </>
                  ) : (
                    'Enviar link'
                  )}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <>
              <DialogHeader>
                <div className="w-12 h-12 rounded-2xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center mb-3">
                  <Check className="w-6 h-6 text-primary" />
                </div>
                <DialogTitle>Pedido enviado</DialogTitle>
                <DialogDescription>
                  Se <strong>{forgotEmail}</strong> tiver uma conta cadastrada, em alguns
                  minutos chegará um link de redefinição na caixa de entrada.
                </DialogDescription>
              </DialogHeader>

              <div className="py-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Não recebeu? Verifique o spam, ou aguarde alguns minutos. Se o problema
                  persistir, entre em contato pelo email{" "}
                  <a href="mailto:suporte@cultivo.app" className="text-foreground underline underline-offset-2">
                    suporte@cultivo.app
                  </a>.
                </p>
              </div>

              <DialogFooter>
                <Button onClick={closeForgot} className="w-full sm:w-auto">
                  Entendi
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
