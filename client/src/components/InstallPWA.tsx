import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Verificar se já está instalado (Chrome/Edge/Firefox)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    
    // Verificar se já está instalado (iOS Safari)
    const isIOSStandalone = (window.navigator as any).standalone === true;
    
    if (isStandalone || isIOSStandalone) {
      setIsInstalled(true);
      return;
    }

    // Capturar evento beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Mostrar banner após 3 segundos (não ser muito agressivo)
      setTimeout(() => {
        // Verificar se usuário já fechou o banner antes
        const dismissed = localStorage.getItem('pwa-install-dismissed');
        if (!dismissed) {
          setShowInstallBanner(true);
        }
      }, 3000);
    };

    // Detectar quando app foi instalado
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Mostrar prompt de instalação
    deferredPrompt.prompt();

    // Aguardar escolha do usuário
    await deferredPrompt.userChoice;

    // Limpar prompt
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  const handleDismiss = () => {
    setShowInstallBanner(false);
    // Lembrar que usuário fechou (não mostrar novamente nesta sessão)
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  // Não mostrar nada se já está instalado
  if (isInstalled) {
    return null;
  }

  // Banner flutuante de instalação
  if (showInstallBanner && deferredPrompt) {
    return (
      <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-primary text-primary-foreground rounded-lg shadow-2xl p-3 z-50 animate-in slide-in-from-bottom-5">
        <button
          onClick={handleDismiss}
          className="absolute top-1.5 right-1.5 p-1 hover:bg-white/20 rounded-full transition-colors"
          aria-label="Fechar"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Layout compacto em linha única (~60px) em vez de card alto (~140px) */}
        <div className="flex items-center gap-3 pr-5">
          <div className="bg-white/20 p-1.5 rounded-lg shrink-0">
            <Download className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm leading-tight">Instalar o App Cultivo</h3>
            <p className="text-xs text-white/85 leading-tight">Offline + notificações de alerta</p>
          </div>
          <Button
            onClick={handleInstallClick}
            className="bg-white text-emerald-600 hover:bg-card/90 shrink-0"
            size="sm"
          >
            Instalar
          </Button>
        </div>
      </div>
    );
  }

  // Botão discreto no canto (sempre disponível se não instalado)
  if (deferredPrompt) {
    return (
      <button
        onClick={handleInstallClick}
        className="fixed bottom-24 right-4 bg-emerald-500 hover:bg-emerald-600 text-white p-3 rounded-full shadow-lg transition-all hover:scale-110 z-40"
        aria-label="Instalar App"
        title="Instalar App Cultivo"
      >
        <Download className="w-5 h-5" />
      </button>
    );
  }

  return null;
}
