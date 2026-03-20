import { useLocation } from 'wouter';
import { Clock } from 'lucide-react';

export default function PendingApproval() {
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setLocation('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-amber-100 flex items-center justify-center">
          <Clock className="w-8 h-8 text-amber-600" />
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2">Acesso pendente</h1>
        <p className="text-muted-foreground text-sm leading-relaxed mb-8">
          Sua conta ainda está aguardando liberação pelo administrador.
          Assim que aprovado, você consegue entrar normalmente.
        </p>

        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-xl border-2 border-border text-foreground font-medium hover:bg-muted transition-colors"
        >
          Voltar para o login
        </button>
      </div>
    </div>
  );
}
