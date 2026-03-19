import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorStateProps {
  onRetry: () => void;
  message?: string;
  fullPage?: boolean;
}

export function ErrorState({ onRetry, message = 'Não foi possível carregar os dados.', fullPage = false }: ErrorStateProps) {
  const content = (
    <div className="flex flex-col items-center gap-3 text-center py-12 px-4">
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
        <WifiOff className="w-6 h-6 text-destructive" />
      </div>
      <div>
        <p className="font-medium text-foreground">Erro de conexão</p>
        <p className="text-sm text-muted-foreground mt-0.5">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} className="gap-2 mt-1">
        <RefreshCw className="w-3.5 h-3.5" />
        Tentar novamente
      </Button>
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        {content}
      </div>
    );
  }

  return content;
}
