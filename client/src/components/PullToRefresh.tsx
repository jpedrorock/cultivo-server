import { useRef, useState, useCallback, ReactNode } from "react";
import { RefreshCw } from "lucide-react";

const THRESHOLD = 72; // px para acionar o refresh
const MAX_PULL = 96;  // px máximo de pull visual

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh?: () => void;
}

export function PullToRefresh({ children, onRefresh }: PullToRefreshProps) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Só ativa se estiver no topo da página
    if (window.scrollY === 0) {
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pullingRef.current || startYRef.current === null) return;
    if (window.scrollY > 0) {
      pullingRef.current = false;
      setPullY(0);
      return;
    }
    const delta = Math.max(0, e.touches[0].clientY - startYRef.current);
    setPullY(Math.min(delta, MAX_PULL));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!pullingRef.current) return;
    pullingRef.current = false;
    startYRef.current = null;

    if (pullY >= THRESHOLD) {
      setRefreshing(true);
      setPullY(0);
      if (onRefresh) {
        onRefresh();
        setTimeout(() => setRefreshing(false), 1000);
      } else {
        window.location.reload();
      }
    } else {
      setPullY(0);
    }
  }, [pullY, onRefresh]);

  const progress = Math.min(pullY / THRESHOLD, 1);
  const indicatorY = Math.min(pullY, MAX_PULL) - 48;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ position: "relative" }}
    >
      {/* Indicador visual */}
      {(pullY > 0 || refreshing) && (
        <div
          className="fixed left-1/2 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-card border border-border shadow-lg"
          style={{
            top: refreshing ? 12 : Math.max(indicatorY, 8),
            transform: "translateX(-50%)",
            transition: pullY === 0 ? "top 0.2s ease" : "none",
          }}
        >
          <RefreshCw
            className={`w-5 h-5 text-primary ${refreshing ? "animate-spin" : ""}`}
            style={{
              transform: refreshing ? undefined : `rotate(${progress * 360}deg)`,
              transition: pullY === 0 ? "transform 0.2s" : "none",
            }}
          />
        </div>
      )}
      {/* Deslocar conteúdo ao puxar */}
      <div
        style={{
          transform: pullY > 0 ? `translateY(${Math.min(pullY * 0.4, 32)}px)` : undefined,
          transition: pullY === 0 ? "transform 0.2s ease" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
