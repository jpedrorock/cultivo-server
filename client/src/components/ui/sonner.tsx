import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { isNative, isPWAStandalone } from "@/lib/platform";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  const sonnerTheme = theme === "vision" || theme === "forest" || theme === "hps" ? "dark" : "light";

  // Capacitor (WebView ocupando tela toda) E PWA standalone (instalado na home)
  // ambos sofrem do mesmo problema: toast top-center sobrepõe status bar do iOS.
  // Browser normal (Safari/Chrome com chrome visível) não precisa.
  const offset = (isNative() || isPWAStandalone())
    ? "calc(env(safe-area-inset-top, 0px) + 12px)"
    : undefined;

  return (
    <Sonner
      theme={sonnerTheme}
      position="top-center"
      offset={offset}
      expand={false}
      richColors={false}
      closeButton={false}
      duration={3000}

      className="toaster group"
      toastOptions={{
        // Sem estilos inline — o CSS em index.css via [data-sonner-toast] controla tudo
        // e garante vidro fosco mesmo em error/success (que ignoram style inline)
      }}
      {...props}
    />
  );
};

export { Toaster };
