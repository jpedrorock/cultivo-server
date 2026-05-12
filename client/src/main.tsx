import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import { toast } from "sonner";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,           // dados válidos por 1min — sem refetch desnecessário
      gcTime: 5 * 60_000,          // cache mantido por 5min após componente desmontar
      refetchOnWindowFocus: false,  // sem "piscar" ao trocar de aba
      retry: 1,                    // apenas 1 retry em vez de 3
    },
  },
});

// Cache strategy por tipo de dado
// tRPC key format: [["routerName", "procedureName"], { type: "query", ... }]
queryClient.setQueryDefaults([["strains"]], { staleTime: 10 * 60_000, gcTime: 30 * 60_000 });       // strains: fresco 10min, cache 30min
queryClient.setQueryDefaults([["weeklyTargets"]], { staleTime: 60 * 60_000, gcTime: 120 * 60_000 }); // targets: fresco 1h, cache 2h
queryClient.setQueryDefaults([["tents"]], { staleTime: 5 * 60_000, gcTime: 15 * 60_000 });           // estufas: fresco 5min
queryClient.setQueryDefaults([["cycles"]], { staleTime: 5 * 60_000, gcTime: 15 * 60_000 });          // ciclos: fresco 5min
queryClient.setQueryDefaults([["alerts"]], { staleTime: 2 * 60_000 });                               // alertas: fresco 2min
queryClient.setQueryDefaults([["plants"]], { staleTime: 2 * 60_000, gcTime: 10 * 60_000 });          // plantas: fresco 2min, cache 10min

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    if (import.meta.env.DEV) console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    if (import.meta.env.DEV) console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

// ─── Lazy-chunk fail-safe ──────────────────────────────────────────────────
// Quando um deploy roda e o user tem a app aberta, navegar pra outra rota
// pede chunks com hashes antigos (ex: TentDetails-OLD_HASH.js). Server agora
// devolve 404 nesses casos (em vez de index.html, que causava o famoso
// "Failed to load module script: ... text/html"). Aqui captamos o erro e
// fazemos reload — user pega a build nova de forma transparente.
//
// 1) Vite emite `vite:preloadError` quando o preload de chunk falha.
// 2) Catch genérico de unhandledrejection com mensagem padrão de
//    "Failed to fetch dynamically imported module" cobre o resto.
//
// Guard `reloadingForChunkError` evita loop se o reload por algum motivo
// também falhar.
let reloadingForChunkError = false;
function reloadOnChunkError(reason: string) {
  if (reloadingForChunkError) return;
  reloadingForChunkError = true;
  console.warn('[chunk] reload pra pegar build nova:', reason);
  // Pequeno delay pra que o aviso chegue no console antes do reload
  setTimeout(() => window.location.reload(), 100);
}

window.addEventListener('vite:preloadError', (event) => {
  reloadOnChunkError(`vite:preloadError ${(event as any).payload?.message ?? ''}`);
});

window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event.reason?.message ?? event.reason ?? '');
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes("Importing a module script failed") ||
    msg.includes('Failed to load module script')
  ) {
    reloadOnChunkError(`unhandledrejection: ${msg.slice(0, 100)}`);
  }
});

// Registrar Service Worker para PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (import.meta.env.DEV) console.log('[PWA] Service Worker registered:', registration.scope);

        // ─── Update prompt (substitui o auto-skipWaiting silencioso) ──────
        // Antes, o sw.js fazia self.skipWaiting() no install — versão nova
        // virava ativa no próximo refresh sem aviso (formulário recarregando
        // no meio, comportamento mudando, etc.).
        //
        // Agora: detecta quando um novo SW termina de instalar e está
        // "waiting" pra assumir. Mostra toast persistente "Atualizar".
        // Click → posta SKIP_WAITING → SW novo assume → controllerchange
        // dispara → recarrega a página de forma controlada.
        const showUpdatePrompt = (waitingSW: ServiceWorker) => {
          toast("Nova versão disponível", {
            description: "Atualize para ver as últimas melhorias.",
            duration: Infinity,                        // não some sozinho
            action: {
              label: "Atualizar",
              onClick: () => {
                waitingSW.postMessage({ type: 'SKIP_WAITING' });
                // O reload será disparado pelo controllerchange listener abaixo
              },
            },
          });
        };

        // Caso 1: já existe um SW novo aguardando ativação no momento do load
        if (registration.waiting && navigator.serviceWorker.controller) {
          showUpdatePrompt(registration.waiting);
        }

        // Caso 2: SW novo é detectado durante a sessão (via update() periódico)
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            // installed + tem controller existente = é update, não primeiro install
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdatePrompt(newWorker);
            }
          });
        });

        // Verificar atualizações a cada 60 segundos
        setInterval(() => {
          registration.update();
        }, 60000);
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.error('[PWA] Service Worker registration failed:', error);
      });

    // Reload quando o SW novo assumir o controle (após user clicar "Atualizar")
    // Guard pra não recarregar em loop em DEV / Chrome devtools "Update on reload"
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    });

    // Ouvir mensagem do SW para sincronizar logs offline
    // O SW não tem cookies, então delega o sync para a página via postMessage
    navigator.serviceWorker.addEventListener('message', async (event) => {
      if (event.data?.type !== 'SYNC_PENDING_LOGS') return;
      const { countPendingLogs, syncPendingLogs } = await import('./lib/offlineStorage');
      const count = await countPendingLogs();
      if (count === 0) return;
      const { createLogMutate } = (window as any).__cultivo_sync__ ?? {};
      if (!createLogMutate) return; // página ainda não montou
      await syncPendingLogs(createLogMutate);
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
