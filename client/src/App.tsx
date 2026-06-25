import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useState, useEffect, lazy, Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { InstallPWA } from "./components/InstallPWA";
import { AddToHomeScreenPrompt } from "./components/AddToHomeScreenPrompt";
import { BottomNav } from "./components/BottomNav";
import { Sidebar } from "./components/Sidebar";
import { SidebarProvider, useSidebar } from "./contexts/SidebarContext";
import { SplashScreen } from "./components/SplashScreen";
import { PullToRefresh } from "./components/PullToRefresh";
import { ThemeProvider } from "./contexts/ThemeContext";
import { isNative, isPWAStandalone } from "@/lib/platform";
import { useAuth } from "./_core/hooks/useAuth";
// [P1] Importa apenas a utilidade leve de localStorage — NÃO o componente inteiro.
// Antes estava: import { isWizardDone } from "./components/onboarding/OnboardingWizard"
// Isso puxava todo o wizard (~57 kB) pro bundle principal, tornando o lazy() abaixo ineficaz.
import { isWizardDone } from "./lib/wizardStorage";
import { useOnboardingTour } from "./hooks/useOnboardingTour";
import { useAppStateRefetch } from "./hooks/useAppStateRefetch";
import { hideSplash } from "./lib/splash";
import { initAndroidBackButton, pushBackHandler } from "./lib/androidBackButton";
import { initDeepLinks } from "./lib/deepLinks";
import { trpc } from "./lib/trpc";
import { NetworkStatusBanner } from "./components/NetworkStatusBanner";

import { prefetchRoutes } from "./lib/prefetchRoutes";

// Rotas críticas — carregadas imediatamente (sem lazy)
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ResetPassword from "./pages/ResetPassword";
import Setup from "./pages/Setup";
import NotFound from "./pages/NotFound";

// Rotas secundárias — carregadas sob demanda (e prefetchadas em background)
const TentLog              = lazy(() => import("./pages/TentLog"));
const TentDetails          = lazy(() => import("./pages/TentDetails"));
const AdminUsers           = lazy(() => import("./pages/AdminUsers"));
const Help                 = lazy(() => import("./pages/Help"));
const Tarefas              = lazy(() => import("./pages/Tarefas"));
const ManageStrains        = lazy(() => import("./pages/ManageStrains"));
const Calculators          = lazy(() => import("./pages/Calculators"));
const CalculatorMenu       = lazy(() => import("./pages/CalculatorMenu"));
const Alerts               = lazy(() => import("./pages/Alerts"));
const Analytics            = lazy(() => import("./pages/Analytics"));
const HistoryTable         = lazy(() => import("./pages/HistoryTable"));
const Settings             = lazy(() => import("./pages/Settings"));
const AccountSettings      = lazy(() => import("./pages/AccountSettings"));
const Subscription         = lazy(() => import("./pages/Subscription"));
const AppearanceSettings   = lazy(() => import("./pages/AppearanceSettings"));
const Backup               = lazy(() => import("./pages/Backup"));
const StrainTargets        = lazy(() => import("./pages/StrainTargets"));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings"));
const Reminders            = lazy(() => import("./pages/Reminders"));
const About                = lazy(() => import("./pages/About"));
const AlertHistory         = lazy(() => import("./pages/AlertHistory"));
const AlertSettings        = lazy(() => import("./pages/AlertSettings"));
const PlantsList           = lazy(() => import("./pages/PlantsList"));
const PlantDetail          = lazy(() => import("./pages/PlantDetail"));
const PlantTrainingPage    = lazy(() => import("./pages/PlantTrainingPage"));
const NewPlant             = lazy(() => import("./pages/NewPlant"));
const OnboardingWizard     = lazy(() => import("./components/onboarding/OnboardingWizard"));
const OnboardingTour       = lazy(() => import("./components/onboarding/OnboardingTour"));
const PlantArchivePage     = lazy(() => import("./pages/PlantArchivePage"));
const HarvestQueue         = lazy(() => import("./pages/HarvestQueue"));
const Nutrients            = lazy(() => import("./pages/Nutrients"));
const PendingApproval      = lazy(() => import("./pages/PendingApproval"));
const DisplayMode          = lazy(() => import("./pages/DisplayMode"));
const MorningCheck         = lazy(() => import("./pages/MorningCheck"));
const PlantChat            = lazy(() => import("./pages/PlantChat"));
const TuyaSettings         = lazy(() => import("./pages/TuyaSettings"));
const SmartLife            = lazy(() => import("./pages/SmartLife"));
// [P2] QuickLog movido para lazy — não é mais "rota crítica", spinner é imperceptível
const QuickLog             = lazy(() => import("./pages/QuickLog"));
// [P3] PaywallSheet carregada sob demanda — chunk só é baixado quando paywall abre pela 1ª vez
const PaywallSheet         = lazy(() => import("./components/PaywallSheet").then(m => ({ default: m.PaywallSheet })));

// Spinner minimalista usado durante carregamento lazy
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Componente helper de redirect — extraído porque hooks não podem ser chamados
// dentro de render-prop callbacks de <Route>.
function Redirect({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(to, { replace: true }); }, [navigate, to]);
  return null;
}

function Router() {
  const [location] = useLocation();
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch key={location}>
        <Route path={"/"} component={Home} />

        <Route path={"/strains"} component={ManageStrains} />
        {/* /manage-strains: legacy URL — redireciona pro canônico /strains */}
        <Route path={"/manage-strains"}>
          <Redirect to="/strains" />
        </Route>
        <Route path={"/tarefas"} component={Tarefas} />
        <Route path={"/analytics"} component={Analytics} />
        <Route path={"/calculators"} component={CalculatorMenu} />
        <Route path={"/calculators/:id"} component={Calculators} />
        <Route path={"/nutrients"} component={Nutrients} />
        <Route path={"/alerts"} component={Alerts} />
        <Route path={"/history"} component={HistoryTable} />
        <Route path={"/settings"} component={Settings} />
        <Route path={"/settings/account"} component={AccountSettings} />
        <Route path={"/settings/subscription"} component={Subscription} />
        <Route path={"/settings/appearance"} component={AppearanceSettings} />
        <Route path={"/settings/backup"} component={Backup} />
        <Route path={"/settings/notifications"} component={NotificationSettings} />
        <Route path={"/settings/reminders"} component={Reminders} />
        <Route path={"/settings/about"} component={About} />
        <Route path={"/settings/alerts"} component={AlertSettings} />
        <Route path={"/settings/sensors"} component={TuyaSettings} />
        <Route path={"/smartlife"} component={SmartLife} />
        <Route path={"/alerts/history"} component={AlertHistory} />
        <Route path={"/strains/:id/targets"} component={StrainTargets} />

        <Route path={"/plants"} component={PlantsList} />
        <Route path="/plants/new" component={NewPlant} />
        <Route path="/plants/archive" component={PlantArchivePage} />
        <Route path="/plants/:id/training" component={PlantTrainingPage} />
        <Route path="/harvest-queue" component={HarvestQueue} />
        <Route path={"/plants/:id"} component={PlantDetail} />

        <Route path={"/tent/:id/log"} component={TentLog} />
        <Route path={"/tent/:id/display"} component={DisplayMode} />
        <Route path={"/tent/:id"} component={TentDetails} />
        <Route path={"/quick-log"} component={QuickLog} />
        <Route path={"/morning-check"} component={MorningCheck} />
        <Route path="/chat/:plantId" component={PlantChat} />
        <Route path="/chat" component={PlantChat} />
        <Route path={"/admin/users"} component={AdminUsers} />
        <Route path={"/help/:section"} component={Help} />
        <Route path={"/help"} component={Help} />
        <Route path={"/onboarding"} component={OnboardingWizard} />
        {/* Tutorial de registro = QuickLog real em modo ?demo=1 (não persiste).
            /onboarding/demo legado → redireciona preservando o ?then=. */}
        <Route path={"/onboarding/demo"}>
          {() => {
            const then = new URLSearchParams(window.location.search).get("then") || "/";
            return <Redirect to={`/quick-log?demo=1&then=${encodeURIComponent(then)}`} />;
          }}
        </Route>
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AuthenticatedAppInner() {
  const { isAuthenticated, loading, user } = useAuth();
  const [location, setLocation] = useLocation();
  const { collapsed } = useSidebar();

  // Deep links — registra listener uma vez quando o roteador estiver pronto.
  // Usa setLocation do wouter pra navegar via SPA (sem reload).
  useEffect(() => {
    initDeepLinks(setLocation);
  }, [setLocation]);
  const isDisplayMode = location.endsWith("/display");
  const isOnboarding = location === "/onboarding";
  const [showSplash, setShowSplash] = useState(() => {
    return !sessionStorage.getItem('hasSeenSplash');
  });

  // Tour de boas-vindas mobile-only. Aparece DEPOIS do splash mas ANTES do
  // wizard de setup. `checked` impede flash de UI antes do Preferences resolver.
  const { shouldShow: showTour, checked: tourChecked, complete: completeTour } = useOnboardingTour();
  const [paywallOpen, setPaywallOpen] = useState(false);
  // [P3] Garante que o chunk do PaywallSheet só é baixado quando o paywall abre
  // pela primeira vez. Antes estava sempre montado no DOM (27 kB no bundle principal).
  const [paywallEverOpened, setPaywallEverOpened] = useState(false);
  const openPaywall = (open: boolean) => {
    if (open) setPaywallEverOpened(true);
    setPaywallOpen(open);
  };

  // Refetch automático de queries voláteis (tents, cycles, alerts...) ao
  // voltar do background. Listener global — chama uma vez aqui.
  useAppStateRefetch();

  // Detecta cold start: user autenticado + grupo OK + ZERO estufas + wizard não foi feito.
  // Query só roda se user tá pronto (enabled), pra não travar fluxo de login.
  // Nota: query desabilitada quando user tá em /onboarding pra não criar loop
  // (wizard cria estufa, refetch traria length=1, mas user ainda não saiu).
  const tentsQuery = trpc.tents.list.useQuery(undefined, {
    enabled: !!isAuthenticated && !!user?.approved && !!user?.groupId && !isOnboarding,
    staleTime: 60_000,
  });
  const shouldRedirectToOnboarding =
    !!user?.approved &&
    !!user?.groupId &&
    tentsQuery.isSuccess &&
    (tentsQuery.data?.length ?? 0) === 0 &&
    !isWizardDone();

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        setLocation('/login');
      } else if (user && user.approved === false) {
        setLocation('/pending-approval');
      } else if (user && user.groupId === null) {
        setLocation('/setup');
      } else if (shouldRedirectToOnboarding && location !== "/onboarding") {
        // Cold-start: zero estufas + nunca pulou wizard → vai pro tutorial.
        // Verificação `location !== "/onboarding"` evita loop se já estiver lá.
        setLocation('/onboarding');
      } else if (isAuthenticated) {
        // Usuário autenticado e no app — precarregar outras páginas em background
        prefetchRoutes();
      }
    }
  }, [loading, isAuthenticated, user, shouldRedirectToOnboarding, location, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !user?.approved || !user?.groupId) return null;

  return (
    <>
      {showSplash && (
        <SplashScreen
          onFinish={() => {
            sessionStorage.setItem('hasSeenSplash', 'true');
            setShowSplash(false);
          }}
        />
      )}
      {/* Tour de boas-vindas (mobile only). Renderiza após splash e antes do
          wizard — overlay full-screen com z-index alto. tourChecked evita
          flash enquanto o Preferences resolve. */}
      {tourChecked && showTour && !showSplash && (
        <Suspense fallback={null}>
          <OnboardingTour
            onComplete={completeTour}
            onShowPaywall={() => openPaywall(true)}
          />
        </Suspense>
      )}
      {/* [P3] PaywallSheet renderizado só após primeira abertura — chunk lazy */}
      {paywallEverOpened && (
        <Suspense fallback={null}>
          <PaywallSheet
            open={paywallOpen}
            onOpenChange={openPaywall}
            trigger="Cultivo Pro — desbloqueie tudo"
          />
        </Suspense>
      )}
      {/* Onboarding e display mode são "fullscreen" — sem Sidebar/BottomNav */}
      {!isDisplayMode && !isOnboarding && <Sidebar />}
      <div
        className={cn(
          isDisplayMode || isOnboarding
            ? ""
            : "pb-20 md:pb-0 transition-[padding-left] duration-200 ease-in-out",
          !isDisplayMode && !isOnboarding && (collapsed ? "lg:pl-16" : "lg:pl-64"),
        )}
      >
        {/* PullToRefresh JS dispara errado quando scroll é num container interno
            (#root). Tanto Capacitor quanto PWA standalone usam scroll interno —
            desabilita o gesto pra eles. Browser normal mantém o pull-to-refresh. */}
        {(isNative() || isPWAStandalone()) ? (
          <Router />
        ) : (
          <PullToRefresh>
            <Router />
          </PullToRefresh>
        )}
      </div>
      {!isDisplayMode && !isOnboarding && <BottomNav />}
      {/* Banner global de status de rede — mostra pílula amber quando offline,
          verde por 2s ao reconectar. Usa @capacitor/network em mobile e
          navigator.onLine no web. */}
      <NetworkStatusBanner />
      <InstallPWA />
      <AddToHomeScreenPrompt />
    </>
  );
}

function AuthenticatedApp() {
  return (
    <SidebarProvider>
      <AuthenticatedAppInner />
    </SidebarProvider>
  );
}

function App() {
  // Esconde o splash nativo assim que o React começa a renderizar.
  // Independente de auth/loading — queremos que o user veja a tela de login
  // ou home rapidinho. O loading state interno (spinner em AuthenticatedAppInner)
  // cuida do resto. Sem isso, splash fica até timeout de 4s do config.
  useEffect(() => {
    // pequeno delay (50ms) pra garantir que o React pintou o primeiro frame
    // antes do splash sumir, evitando flash de tela vazia.
    const t = setTimeout(() => {
      hideSplash();
    }, 50);
    return () => clearTimeout(t);
  }, []);

  // Hardware back button do Android. Inicializa listener global + registra
  // handler root que faz:
  //   1. Tenta history.back() — wouter navega pra rota anterior
  //   2. Se não tem histórico (entrada na home), pergunta "Sair do app?"
  // Handlers de modais/sheets fazem push em cima desse e tem prioridade.
  useEffect(() => {
    initAndroidBackButton();

    const removeRoot = pushBackHandler("root-back", () => {
      // Se está numa rota não-raiz, volta uma rota
      if (window.history.length > 1 && window.location.pathname !== "/") {
        window.history.back();
        return true;
      }
      // Está na raiz — pergunta antes de sair
      const confirmExit = window.confirm("Sair do aplicativo?");
      if (confirmExit) {
        // Minimiza/encerra. import dinâmico pra não puxar @capacitor/app no web.
        import("@capacitor/app").then(({ App }) => {
          App.exitApp().catch(() => {});
        }).catch(() => {});
      }
      return true;
    });
    return removeRoot;
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="forest"
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <Switch>
            <Route path="/login" component={Login} />
            <Route path="/register" component={Register} />
            <Route path="/reset-password" component={ResetPassword} />
            <Route path="/setup" component={Setup} />
            <Route path="/pending-approval">
              <Suspense fallback={<PageLoader />}>
                <PendingApproval />
              </Suspense>
            </Route>
            <Route>
              <AuthenticatedApp />
            </Route>
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
