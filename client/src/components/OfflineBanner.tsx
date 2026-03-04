/**
 * OfflineBanner — Exibe banner de status offline e registros pendentes
 */

import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, CloudUpload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { countPendingLogs, isOnline, onConnectionRestored } from '@/lib/offlineStorage';
import { cn } from '@/lib/utils';

interface OfflineBannerProps {
  onSync?: () => void;
  isSyncing?: boolean;
  className?: string;
}

export function OfflineBanner({ onSync, isSyncing, className }: OfflineBannerProps) {
  const [online, setOnline] = useState(isOnline());
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const loadCount = async () => {
      const count = await countPendingLogs();
      setPendingCount(count);
    };
    loadCount();
    const interval = setInterval(loadCount, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  // Não mostrar nada se online e sem pendentes
  if (online && pendingCount === 0) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-lg border',
        !online
          ? 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-300'
          : 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300',
        className
      )}
    >
      {!online ? (
        <WifiOff className="w-4 h-4 flex-shrink-0" />
      ) : (
        <CloudUpload className="w-4 h-4 flex-shrink-0" />
      )}

      <span className="flex-1">
        {!online
          ? pendingCount > 0
            ? `Offline — ${pendingCount} registro${pendingCount > 1 ? 's' : ''} aguardando sincronização`
            : 'Sem conexão com a internet'
          : `${pendingCount} registro${pendingCount > 1 ? 's' : ''} para sincronizar`}
      </span>

      {online && pendingCount > 0 && onSync && (
        <Button
          size="sm"
          variant="outline"
          onClick={onSync}
          disabled={isSyncing}
          className="h-7 px-2 text-xs"
        >
          {isSyncing ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            'Sincronizar'
          )}
        </Button>
      )}
    </div>
  );
}
