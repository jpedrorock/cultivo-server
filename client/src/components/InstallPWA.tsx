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
      <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-primary text-primary-foreground rounded-lg shadow-2xl p-4 z-50 animate-in slide-in-from-bottom-5">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1 hover:bg-white/20 rounded-full transition-colors"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
        
        <div className="flex items-start gap-3 pr-6">
          <div className="bg-white/20 p-2 rounded-lg">
            <Download className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg mb-1">Instalar App Cultivo</h3>
            <p className="text-sm text-white/90 mb-3">
              Acesse offline e receba notificações de alertas diretamente no seu dispositivo!
            </p>
            <Button
              onClick={handleInstallClick}
              className="w-full bg-white text-emerald-600 hover:bg-card/90"
              size="sm"
            >
              <Download className="w-4 h-4 mr-2" />
              Instalar Agora
            </Button>
          </div>
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
