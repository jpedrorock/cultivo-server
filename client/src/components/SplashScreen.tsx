import { useEffect, useState } from "react";
import { Sprout } from "lucide-react";

interface SplashScreenProps {
  onFinish: () => void;
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Duração da splash screen: 2 segundos
    const timer = setTimeout(() => {
      setIsVisible(false);
      // Aguardar animação de fade-out antes de chamar onFinish
      setTimeout(onFinish, 500);
    }, 2000);

    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-500 bg-gradient-to-br from-green-500 via-green-600 to-green-700 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-700">
        {/* Logo com animação de pulso */}
        <div className="relative">
          <div className="absolute inset-0 bg-green-400/20 rounded-full blur-2xl animate-pulse" />
          <div className="relative bg-card rounded-full p-8 shadow-2xl animate-bounce-slow">
            <Sprout className="w-20 h-20 text-green-600" strokeWidth={2.5} />
          </div>
        </div>

        {/* Nome do app */}
        <div className="text-center space-y-2 animate-in slide-in-from-bottom-4 duration-700 delay-300">
          <h1 className="text-4xl font-bold text-white tracking-tight">
            App Cultivo
          </h1>
          <p className="text-green-50/90 text-lg font-medium">
            Gerenciamento de Estufas
          </p>
        </div>

        {/* Loading indicator */}
        <div className="flex gap-2 mt-4 animate-in fade-in duration-700 delay-500">
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0ms]" />
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:150ms]" />
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
