import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  const sonnerTheme = theme === "vision" || theme === "forest" || theme === "hps" ? "dark" : "light";

  return (
    <Sonner
      theme={sonnerTheme}
      position="bottom-center"
      expand={false}
      richColors={false}
      closeButton={false}
      duration={3000}
      offset={80}
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
