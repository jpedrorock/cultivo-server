import { Toaster } from "@/components/ui/sonner";
import { useState } from "react";
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
import Home from "./pages/Home";
import TentLog from "./pages/TentLog";
import TentDetails from "./pages/TentDetails";
import QuickLog from "./pages/QuickLog";


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
  // make sure to consider if you need authentication for certain routes
  const [location] = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
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
      <Route path={"/help"} component={Help} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
      </Switch>
    </AnimatePresence>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  const [showSplash, setShowSplash] = useState(() => {
    // Show splash only once per session
    const hasSeenSplash = sessionStorage.getItem('hasSeenSplash');
    return !hasSeenSplash;
  });

  const handleSplashFinish = () => {
    sessionStorage.setItem('hasSeenSplash', 'true');
    setShowSplash(false);
  };

  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        {/* Splash screen por cima do app (z-index alto) - app já monta atrás */}
        {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
        <TooltipProvider>
          <Toaster />
          <Sidebar />
          <div
            className="md:pl-64"
            style={{
              // No mobile: reservar espaço para o BottomNav (56px de py-3 + ícones) + safe-area do iPhone
              // No desktop: sem padding-bottom (sem BottomNav)
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.5rem)',
            }}
          >
            <Router />
          </div>
          <BottomNav />
          <InstallPWA />
          <AddToHomeScreenPrompt />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
