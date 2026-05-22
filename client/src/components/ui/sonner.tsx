import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  const sonnerTheme = theme === "vision" || theme === "forest" || theme === "hps" ? "dark" : "light";

  // Safe-area do notch é tratado via CSS em index.css (bloco capacitor-native /
  // pwa-standalone) com `[data-sonner-toaster][data-y-position="top"]`. Sonner
  // não resolve `env()` na prop `offset`, então CSS direto é mais confiável.

  return (
    <Sonner
      theme={sonnerTheme}
      position="top-center"
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
