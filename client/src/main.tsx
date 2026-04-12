import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
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

// Registrar Service Worker para PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (import.meta.env.DEV) console.log('[PWA] Service Worker registered:', registration.scope);
        
        // Verificar atualizações a cada 60 segundos
        setInterval(() => {
          registration.update();
        }, 60000);
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.error('[PWA] Service Worker registration failed:', error);
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
