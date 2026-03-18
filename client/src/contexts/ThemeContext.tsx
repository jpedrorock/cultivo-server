import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "forest" | "highcontrast" | "highcontrast-dark" | "apple";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (switchable) {
      const stored = localStorage.getItem("theme");
      return (stored as Theme) || defaultTheme;
    }
    return defaultTheme;
  });

  useEffect(() => {
    const root = document.documentElement;

    // Desabilitar transições durante a troca de tema para evitar flash
    root.classList.add('no-transitions');

    // Remove all theme classes
    root.classList.remove("light", "dark", "forest", "highcontrast", "highcontrast-dark", "apple");
    // Add current theme class
    root.classList.add(theme);
    // Remover a classe splash-loading do body para permitir que o CSS do tema assuma
    if (document.body) {
      document.body.classList.remove('splash-loading');
    }
    // Remover inline styles que foram definidos durante a splash
    root.style.removeProperty('background-color');
    root.style.removeProperty('color');

    if (switchable) {
      localStorage.setItem("theme", theme);
    }

    // Reabilitar transições após o frame ser pintado
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('no-transitions');
      });
    });
  }, [theme, switchable]);

  const toggleTheme = switchable
    ? () => {
        setTheme(prev => {
          if (prev === "light") return "dark";
          if (prev === "dark") return "forest";
          if (prev === "forest") return "highcontrast";
          if (prev === "highcontrast") return "highcontrast-dark";
          if (prev === "highcontrast-dark") return "apple";
          return "light";
        });
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
