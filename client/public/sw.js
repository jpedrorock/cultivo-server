// Service Worker para App Cultivo PWA
// Versão do cache - incrementar para forçar atualização
const CACHE_VERSION = 'v8';
const CACHE_NAME = `app-cultivo-${CACHE_VERSION}`;

// Assets essenciais garantidos no install (sem hash — sempre os mesmos)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/favicon-32.png',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

// Instalação do Service Worker
// Estratégia: cacheia os assets essenciais E descobre os chunks JS/CSS
// via parse do index.html (que tem os hashes gerados pelo Vite).
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Cachear assets estáticos conhecidos
      await cache.addAll(STATIC_ASSETS);

      // 2. Descobrir e cachear chunks JS/CSS do Vite via index.html
      try {
        const html = await fetch('/index.html').then(r => r.text());
        const matches = [...html.matchAll(/src="([^"]+\.js)"|href="([^"]+\.css)"/g)];
        const vitChunks = matches
          .map(m => m[1] || m[2])
          .filter(Boolean)
          .filter(url => url.startsWith('/') || url.startsWith('./'));
        if (vitChunks.length > 0) {
          console.log('[SW] Caching Vite chunks:', vitChunks.length);
          await cache.addAll(vitChunks);
        }
      } catch (e) {
        console.warn('[SW] Could not pre-cache Vite chunks:', e);
      }
    })
  );
  // Ativar imediatamente sem esperar
  self.skipWaiting();
});

// Ativação do Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Tomar controle de todas as páginas imediatamente
  return self.clients.claim();
});

// Estratégia de fetch
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requisições de analytics e chrome-extension
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // Não interceptar rotas de autenticação (OAuth redirects precisam ser nativos do browser)
  if (url.pathname.startsWith('/api/auth/')) {
    return;
  }

  // Estratégia Network First para API (sempre tentar buscar dados frescos)
  if (url.pathname.startsWith('/api/')) {
    // Cache API não suporta POST — deixar passar direto sem cache
    if (request.method !== 'GET') {
      return;
    }
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clonar resposta para cache (apenas GET)
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Se offline, tentar buscar do cache
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Retornar resposta offline genérica
            return new Response(
              JSON.stringify({ error: 'Offline - dados não disponíveis' }),
              {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          });
        })
    );
    return;
  }

  // Não interceptar requisições que não sejam GET (POST, PUT, DELETE, etc.)
  if (request.method !== 'GET') {
    return;
  }

  // Estratégia Cache First para assets estáticos (HTML, CSS, JS, imagens)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Retornar do cache e atualizar em background
        fetch(request).then((response) => {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, response);
          });
        });
        return cachedResponse;
      }

      // Se não está no cache, buscar da rede
      return fetch(request)
        .then((response) => {
          // Não cachear respostas inválidas
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          // Clonar resposta para cache
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });

          return response;
        })
        .catch(() => {
          // Se offline e não tem cache, retornar página offline
          if (request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
    })
  );
});

// Background Sync — delega para a página principal via postMessage
// (o SW não tem cookies de sessão, não pode chamar o tRPC diretamente)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  if (event.tag === 'sync-daily-logs') {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clientList) {
    client.postMessage({ type: 'SYNC_PENDING_LOGS' });
  }
}

// Helper para abrir IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('app-cultivo-db', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending-logs')) {
        db.createObjectStore('pending-logs', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

// Notificações Push
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  const data = event.data ? event.data.json() : {};
  const title = data.title || 'App Cultivo';
  const isAlert = (data.tag || '').startsWith('alert-');
  const isReminder = data.tag === 'daily-reminder';

  // Ações contextuais: alertas têm CTA de registro; lembretes têm CTA de abertura
  const actions = isAlert
    ? [
        { action: 'register', title: '📝 Registrar' },
        { action: 'close',    title: 'Fechar' },
      ]
    : isReminder
    ? [
        { action: 'open',  title: '📝 Registrar agora' },
        { action: 'close', title: 'Mais tarde' },
      ]
    : [
        { action: 'open',  title: 'Abrir' },
        { action: 'close', title: 'Fechar' },
      ];

  const options = {
    body: data.body || 'Nova notificação',
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    vibrate: isAlert ? [300, 100, 300, 100, 300] : [200, 100, 200],
    data: {
      url: data.url || '/',
      alertsUrl: isAlert ? '/alerts' : null,
    },
    actions,
    requireInteraction: isAlert, // alertas ficam visíveis até o usuário interagir
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clique em notificação
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  event.notification.close();

  // 'alerts' action → abrir /alerts; qualquer outro (open/register/click direto) → abrir url principal
  const notifData = event.notification.data || {};
  const urlToOpen =
    event.action === 'alerts'
      ? (notifData.alertsUrl || '/alerts')
      : (typeof notifData === 'string' ? notifData : (notifData.url || '/'));

  if (event.action !== 'close') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // Tentar focar tab já aberta com essa URL
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate ? client.navigate(urlToOpen) : null;
            return client.focus();
          }
        }
        // Senão abrir nova janela
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
    );
  }
});
