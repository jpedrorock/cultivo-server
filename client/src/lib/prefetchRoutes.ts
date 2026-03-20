/**
 * Prefetch de rotas em segundo plano.
 *
 * Após o usuário fazer login e a primeira página renderizar,
 * os chunks das outras páginas são baixados silenciosamente
 * usando requestIdleCallback para não competir com a UI.
 *
 * Resultado: navegação instantânea — os chunks já estão no cache
 * quando o usuário toca em qualquer item do menu.
 */

// Páginas mais acessadas — precarregar logo (500 ms após mount)
const HIGH_PRIORITY = [
  () => import("../pages/TentDetails"),
  () => import("../pages/TentLog"),
  () => import("../pages/PlantsList"),
  () => import("../pages/PlantDetail"),
  () => import("../pages/Alerts"),
  () => import("../pages/HarvestQueue"),
  () => import("../pages/Tarefas"),
];

// Páginas secundárias — precarregar durante tempo ocioso (3 s após mount)
const LOW_PRIORITY = [
  () => import("../pages/NewPlant"),
  () => import("../pages/PlantArchivePage"),
  () => import("../pages/ManageStrains"),
  () => import("../pages/HistoryTable"),
  () => import("../pages/Nutrients"),
  () => import("../pages/CalculatorMenu"),
  () => import("../pages/Calculators"),
  () => import("../pages/Settings"),
  () => import("../pages/AccountSettings"),
  () => import("../pages/AppearanceSettings"),
  () => import("../pages/Backup"),
  () => import("../pages/NotificationSettings"),
  () => import("../pages/AlertSettings"),
  () => import("../pages/AlertHistory"),
  () => import("../pages/StrainTargets"),
  () => import("../pages/AdminUsers"),
  () => import("../pages/Help"),
];

function idleLoad(loaders: (() => Promise<unknown>)[], timeout: number) {
  loaders.forEach((load) => {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => load().catch(() => {}), { timeout });
    } else {
      setTimeout(() => load().catch(() => {}), timeout);
    }
  });
}

let prefetched = false;

export function prefetchRoutes() {
  if (prefetched) return; // garantir que roda só uma vez por sessão
  prefetched = true;

  // Alta prioridade: 500 ms após chamar (primeiro render já foi)
  setTimeout(() => idleLoad(HIGH_PRIORITY, 4000), 500);

  // Baixa prioridade: 4 s após chamar (usuário já interagiu com a tela)
  setTimeout(() => idleLoad(LOW_PRIORITY, 10000), 4000);
}
