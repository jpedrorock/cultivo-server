import { Toaster } from "@/components/ui/sonner";
import { useState, useEffect, lazy, Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import { AnimatePresence } from "framer-motion";
import ErrorBoundary from "./components/ErrorBoundary";
import { InstallPWA } from "./components/InstallPWA";
import { AddToHomeScreenPrompt } from "./components/AddToHomeScreenPrompt";
import { BottomNav } from "./components/BottomNav";
import { Sidebar } from "./components/Sidebar";
import { SplashScreen } from "./components/SplashScreen";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";

// Rotas críticas — carregadas imediatamente
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Setup from "./pages/Setup";
import NotFound from "./pages/NotFound";

// Rotas secundárias — carregadas sob demanda
const TentLog              = lazy(() => import("./pages/TentLog"));
const TentDetails          = lazy(() => import("./pages/TentDetails"));
const QuickLog             = lazy(() => import("./pages/QuickLog"));
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
const NewPlant             = lazy(() => import("./pages/NewPlant"));
const PlantArchivePage     = lazy(() => import("./pages/PlantArchivePage"));
const HarvestQueue         = lazy(() => import("./pages/HarvestQueue"));
const Nutrients            = lazy(() => import("./pages/Nutrients"));

// Spinner minimalista usado durante carregamento lazy
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch key={location}>
        <Route path={"/"} component={Home} />

        <Route path={"/strains"} component={ManageStrains} />
        <Route path={"/manage-strains"} component={ManageStrains} />
        <Route path={"/tasks"} component={Tarefas} />
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
        <Route path={"/alerts/history"} component={AlertHistory} />
        <Route path={"/strains/:id/targets"} component={StrainTargets} />

        <Route path={"/plants"} component={PlantsList} />
        <Route path="/plants/new" component={NewPlant} />
        <Route path="/plants/archive" component={PlantArchivePage} />
        <Route path="/harvest-queue" component={HarvestQueue} />
        <Route path={"/plants/:id"} component={PlantDetail} />

        <Route path={"/tent/:id"} component={TentDetails} />
        <Route path={"/tent/:id/log"} component={TentLog} />
        <Route path={"/quick-log"} component={QuickLog} />
        <Route path={"/admin/users"} component={AdminUsers} />
        <Route path={"/help"} component={Help} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AuthenticatedApp() {
  const { isAuthenticated, loading, user } = useAuth();
  const [, setLocation] = useLocation();
  const [showSplash, setShowSplash] = useState(() => {
    return !sessionStorage.getItem('hasSeenSplash');
  });

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        setLocation('/login');
      } else if (user && user.groupId === null) {
        setLocation('/setup');
      }
    }
  }, [loading, isAuthenticated, user, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !user?.groupId) return null;

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
      <Sidebar />
      <div
        className="md:pl-64"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.5rem)',
        }}
      >
        <Router />
      </div>
      <BottomNav />
      <InstallPWA />
      <AddToHomeScreenPrompt />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <Switch>
            <Route path="/login" component={Login} />
            <Route path="/register" component={Register} />
            <Route path="/setup" component={Setup} />
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
