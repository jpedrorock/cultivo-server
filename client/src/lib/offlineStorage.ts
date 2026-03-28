/**
 * Offline Storage — App Cultivo
 * Salva registros diários no IndexedDB quando offline
 * e sincroniza automaticamente quando a conexão voltar.
 */

const DB_NAME = 'app-cultivo-db';
const DB_VERSION = 1;
const STORE_PENDING_LOGS = 'pending-logs';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PendingLog {
  id?: number;
  tentId: number;
  logDate: string | Date; // ISO string or Date
  turn: 'AM' | 'PM';
  tempC?: string;
  rhPct?: string;
  ppfd?: number;
  ph?: string;
  ec?: string;
  wateringVolume?: number;
  runoffCollected?: number;
  notes?: string;
  savedAt: number; // timestamp
}

// ─── IndexedDB ────────────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as IDBDatabase);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PENDING_LOGS)) {
        db.createObjectStore(STORE_PENDING_LOGS, {
          keyPath: 'id',
          autoIncrement: true,
        });
      }
    };
  });
}

/**
 * Salva um registro pendente no IndexedDB
 */
export async function savePendingLog(log: Omit<PendingLog, 'id' | 'savedAt'>): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING_LOGS, 'readwrite');
    const store = tx.objectStore(STORE_PENDING_LOGS);
    const entry: PendingLog = { ...log, logDate: log.logDate instanceof Date ? log.logDate.toISOString() : log.logDate, savedAt: Date.now() };
    const req = store.add(entry);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retorna todos os registros pendentes
 */
export async function getPendingLogs(): Promise<PendingLog[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING_LOGS, 'readonly');
    const store = tx.objectStore(STORE_PENDING_LOGS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as PendingLog[]);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Remove um registro pendente pelo ID
 */
export async function deletePendingLog(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING_LOGS, 'readwrite');
    const store = tx.objectStore(STORE_PENDING_LOGS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Conta quantos registros estão pendentes
 */
export async function countPendingLogs(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING_LOGS, 'readonly');
    const store = tx.objectStore(STORE_PENDING_LOGS);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Sincronização ────────────────────────────────────────────────────────────

/**
 * Tenta sincronizar todos os registros pendentes com o servidor.
 * Retorna o número de registros sincronizados com sucesso.
 */
export async function syncPendingLogs(
  createLogFn: (log: Omit<PendingLog, 'id' | 'savedAt'> & { logDate: Date }) => Promise<void>
): Promise<number> {
  const pending = await getPendingLogs();
  if (pending.length === 0) return 0;

  let synced = 0;
  for (const log of pending) {
    try {
      const { id, savedAt, ...data } = log;
      await createLogFn({
        ...data,
        logDate: new Date(data.logDate),
      });
      if (id !== undefined) {
        await deletePendingLog(id);
        synced++;
      }
    } catch (error) {
      console.error('[OfflineStorage] Falha ao sincronizar log:', log.id, error);
    }
  }

  // Solicitar Background Sync ao Service Worker (para próxima tentativa)
  if (synced < pending.length && 'serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await (reg as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register('sync-daily-logs');
    } catch {
      // Background Sync não disponível em todos os browsers
    }
  }

  return synced;
}

// ─── Detecção de conexão ─────────────────────────────────────────────────────

export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Hook para monitorar mudanças de conexão e disparar sincronização
 */
export function onConnectionRestored(callback: () => void): () => void {
  const handler = () => {
    if (navigator.onLine) {
      callback();
    }
  };
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
