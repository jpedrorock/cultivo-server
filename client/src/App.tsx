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
import { isWizardDone } from "./components/onboarding/OnboardingWizard";
import { trpc } from "./lib/trpc";

import { prefetchRoutes } from "./lib/prefetchRoutes";

// Rotas críticas — carregadas imediatamente (sem lazy)
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Setup from "./pages/Setup";
import NotFound from "./pages/NotFound";
import QuickLog from "./pages/QuickLog"; // usado direto na nav inferior

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
const HistoryTable         = lazy(() => import("./pages/HistoryTable"));
const Settings             = lazy(() => import("./pages/Settings"));
const AccountSettings      = lazy(() => import("./pages/AccountSettings"));
const AppearanceSettings   = lazy(() => import("./pages/AppearanceSettings"));
const Backup               = lazy(() => import("./pages/Backup"));
const StrainTargets        = lazy(() => import("./pages/StrainTargets"));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings"));
const AlertHistory         = lazy(() => import("./pages/AlertHistory"));
const AlertSettings        = lazy(() => import("./pages/AlertSettings"));
const PlantsList           = lazy(() => import("./pages/PlantsList"));
const PlantDetail          = lazy(() => import("./pages/PlantDetail"));
const PlantTrainingPage    = lazy(() => import("./pages/PlantTrainingPage"));
const NewPlant             = lazy(() => import("./pages/NewPlant"));
const OnboardingWizard     = lazy(() => import("./components/onboarding/OnboardingWizard"));
const PlantArchivePage     = lazy(() => import("./pages/PlantArchivePage"));
const HarvestQueue         = lazy(() => import("./pages/HarvestQueue"));
const Nutrients            = lazy(() => import("./pages/Nutrients"));
const PendingApproval      = lazy(() => import("./pages/PendingApproval"));
const DisplayMode          = lazy(() => import("./pages/DisplayMode"));
const MorningCheck         = lazy(() => import("./pages/MorningCheck"));
const PlantChat            = lazy(() => import("./pages/PlantChat"));
const TuyaSettings         = lazy(() => import("./pages/TuyaSettings"));
const SmartLife            = lazy(() => import("./pages/SmartLife"));
// QuickLog removido daqui — agora é eager (import estático acima)

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
        <Route path={"/calculators"} component={CalculatorMenu} />
        <Route path={"/calculators/:id"} component={Calculators} />
        <Route path={"/nutrients"} component={Nutrients} />
        <Route path={"/alerts"} component={Alerts} />
        <Route path={"/history"} component={HistoryTable} />
        <Route path={"/settings"} component={Settings} />
        <Route path={"/settings/account"} component={AccountSettings} />
        <Route path={"/settings/appearance"} component={AppearanceSettings} />
        <Route path={"/settings/backup"} component={Backup} />
        <Route path={"/settings/notifications"} component={NotificationSettings} />
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
  const isDisplayMode = location.endsWith("/display");
  const isOnboarding = location === "/onboarding";
  const [showSplash, setShowSplash] = useState(() => {
    return !sessionStorage.getItem('hasSeenSplash');
  });

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
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="monstera"
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <Switch>
            <Route path="/login" component={Login} />
            <Route path="/register" component={Register} />
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
