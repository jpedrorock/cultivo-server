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
    // Remove all theme classes
    root.classList.remove("light", "dark", "forest", "highcontrast", "highcontrast-dark", "apple");
    // Add current theme class
    root.classList.add(theme);

    if (switchable) {
      localStorage.setItem("theme", theme);
    }
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
