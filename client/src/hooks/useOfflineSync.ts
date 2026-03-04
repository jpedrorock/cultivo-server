/**
 * useOfflineSync — Hook para salvar registros offline e sincronizar quando online
 *
 * Uso:
 *   const { saveLog, pendingCount, isSyncing } = useOfflineSync();
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  savePendingLog,
  countPendingLogs,
  syncPendingLogs,
  isOnline,
  onConnectionRestored,
  type PendingLog,
} from '@/lib/offlineStorage';
import { trpc } from '@/lib/trpc';

export function useOfflineSync() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [online, setOnline] = useState(isOnline());

  const utils = trpc.useUtils();

  // Mutation para criar log no servidor
  const createLogMutation = trpc.dailyLogs.create.useMutation({
    onSuccess: () => {
      utils.dailyLogs.list.invalidate();
      utils.tents.list.invalidate();
    },
  });

  // Atualizar contagem de pendentes
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await countPendingLogs();
      setPendingCount(count);
    } catch {
      // IndexedDB pode não estar disponível
    }
  }, []);

  // Sincronizar pendentes com o servidor
  const syncNow = useCallback(async () => {
    if (!isOnline() || isSyncing) return;

    setIsSyncing(true);
    try {
      const synced = await syncPendingLogs(async (log) => {
        await createLogMutation.mutateAsync(log);
      });

      if (synced > 0) {
        toast.success(`${synced} registro${synced > 1 ? 's' : ''} sincronizado${synced > 1 ? 's' : ''}!`);
        await refreshPendingCount();
      }
    } catch (error) {
      console.error('[useOfflineSync] Erro na sincronização:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, createLogMutation, refreshPendingCount]);

  // Monitorar conexão
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      syncNow();
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Carregar contagem inicial
    refreshPendingCount();

    // Tentar sincronizar ao montar (caso já esteja online com pendentes)
    if (isOnline()) {
      syncNow();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Salva um registro — online: vai direto ao servidor; offline: salva no IndexedDB
   */
  const saveLog = useCallback(
    async (log: Omit<PendingLog, 'id' | 'savedAt' | 'logDate'> & { logDate: Date }): Promise<'server' | 'offline'> => {
      const { logDate, ...rest } = log;

      if (isOnline()) {
        // Online: salvar direto no servidor
        await createLogMutation.mutateAsync({ ...rest, logDate });
        return 'server';
      } else {
        // Offline: salvar no IndexedDB
        await savePendingLog({ ...rest, logDate: logDate.toISOString() });
        await refreshPendingCount();
        toast.warning('Sem conexão — registro salvo localmente. Será sincronizado quando voltar a internet.', {
          duration: 5000,
        });
        return 'offline';
      }
    },
    [createLogMutation, refreshPendingCount]
  );

  return {
    saveLog,
    pendingCount,
    isSyncing,
    online,
    syncNow,
    isLoading: createLogMutation.isPending,
  };
}
