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

        <h1 className="text-2xl font-bold text-foreground mb-2">Aguardando aprovação</h1>
        <p className="text-muted-foreground text-sm leading-relaxed mb-8">
          Sua conta foi criada com sucesso! Um administrador precisa aprovar o seu acesso antes que você possa entrar no app.
        </p>

        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm mb-8">
          Assim que aprovado, faça login normalmente com suas credenciais.
        </div>

        <button
          onClick={handleLogout}
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          Voltar para o login
        </button>
      </div>
    </div>
  );
}
