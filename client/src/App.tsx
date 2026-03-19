import { Toaster } from "@/components/ui/sonner";
import { useState, useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import Help from "@/pages/Help";
import { AnimatePresence } from "framer-motion";
import ErrorBoundary from "./components/ErrorBoundary";
import { InstallPWA } from "./components/InstallPWA";
import { AddToHomeScreenPrompt } from "./components/AddToHomeScreenPrompt";
import { BottomNav } from "./components/BottomNav";
import { Sidebar } from "./components/Sidebar";
import { SplashScreen } from "./components/SplashScreen";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import Home from "./pages/Home";
import TentLog from "./pages/TentLog";
import TentDetails from "./pages/TentDetails";
import QuickLog from "./pages/QuickLog";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AdminUsers from "./pages/AdminUsers";

import Tarefas from "./pages/Tarefas";
import ManageStrains from "./pages/ManageStrains";
import Calculators from "./pages/Calculators";
import CalculatorMenu from "./pages/CalculatorMenu";
import Alerts from "./pages/Alerts";
import HistoryTable from "./pages/HistoryTable";
import Settings from "./pages/Settings";
import Backup from "./pages/Backup";
import StrainTargets from "./pages/StrainTargets";

import NotificationSettings from "./pages/NotificationSettings";
import AlertHistory from "./pages/AlertHistory";
import AlertSettings from "./pages/AlertSettings";
import PlantsList from "./pages/PlantsList";
import PlantDetail from "./pages/PlantDetail";
import NewPlant from "./pages/NewPlant";
import PlantArchivePage from "./pages/PlantArchivePage";
import HarvestQueue from "./pages/HarvestQueue";

import Nutrients from "./pages/Nutrients";


function Router() {
  const [location] = useLocation();
  return (
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
      {/* Final fallback route */}
      <Route component={NotFound} />
      </Switch>
  );
}

function AuthenticatedApp() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [showSplash, setShowSplash] = useState(() => {
    return !sessionStorage.getItem('hasSeenSplash');
  });

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [loading, isAuthenticated, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

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
