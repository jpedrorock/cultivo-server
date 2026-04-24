import { createContext, useContext, useState, useEffect } from "react";

interface SidebarCtx {
  /** Desktop (lg+): icon-only collapsed mode */
  collapsed: boolean;
  /** iPad (md): overlay sidebar is open */
  open: boolean;
  /** Desktop: toggle icon-only / full */
  toggle: () => void;
  /** iPad: open overlay */
  openSidebar: () => void;
  /** iPad: close overlay */
  closeSidebar: () => void;
}

const SidebarContext = createContext<SidebarCtx>({
  collapsed: false,
  open: false,
  toggle: () => {},
  openSidebar: () => {},
  closeSidebar: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "true";
  });

  const [open, setOpen] = useState(false);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  const openSidebar = () => setOpen(true);
  const closeSidebar = () => setOpen(false);

  // Fechar overlay ao redimensionar para desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-w",
      collapsed ? "64px" : "256px"
    );
  }, [collapsed]);

  return (
    <SidebarContext.Provider value={{ collapsed, open, toggle, openSidebar, closeSidebar }}>
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);
