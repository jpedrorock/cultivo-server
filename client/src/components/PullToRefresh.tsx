import { useRef, useState, useCallback, ReactNode } from "react";
import { Check } from "lucide-react";

const THRESHOLD = 80;
const MAX_PULL = 110;
const FRICTION = 2.2;

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh?: () => void;
}

export function PullToRefresh({ children, onRefresh }: PullToRefreshProps) {
  const [pullY, setPullY] = useState(0);
  const [phase, setPhase] = useState<"idle" | "pulling" | "loading" | "success">("idle");
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
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
      setPhase("idle");
      return;
    }
    const raw = Math.max(0, e.touches[0].clientY - startYRef.current);
    const damped = Math.min(raw / FRICTION, MAX_PULL);
    setPullY(damped);
    setPhase(damped > 0 ? "pulling" : "idle");
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!pullingRef.current) return;
    pullingRef.current = false;
    startYRef.current = null;

    if (pullY >= THRESHOLD) {
      setPhase("loading");
      setPullY(0);
      const doRefresh = onRefresh ?? (() => window.location.reload());
      // Small delay so loading state is visible before reload
      setTimeout(() => {
        setPhase("success");
        setTimeout(() => {
          doRefresh();
          setTimeout(() => setPhase("idle"), 800);
        }, 500);
      }, 200);
    } else {
      setPullY(0);
      setPhase("idle");
    }
  }, [pullY, onRefresh]);

  // Arc calculation
  const progress = Math.min(pullY / THRESHOLD, 1);
  const r = 14;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - progress);

  // Indicator position: emerges from top
  const rawIndicatorTop = pullY - 48;
  const indicatorTop = Math.max(rawIndicatorTop, 6);
  const isVisible = phase !== "idle";

  // Content push (elastic, capped)
  const contentShift = phase === "idle" ? 0 : Math.min(pullY * 0.38, 36);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ position: "relative", overflowX: "hidden" }}
    >
      {/* Indicator bubble */}
      {isVisible && (
        <div
          className="fixed left-1/2 z-50"
          style={{
            top: phase === "loading" || phase === "success" ? 14 : indicatorTop,
            transform: "translateX(-50%)",
            transition:
              pullY === 0
                ? "top 400ms cubic-bezier(0.34,1.56,0.64,1)"
                : "none",
          }}
        >
          <div
            className="relative flex items-center justify-center"
            style={{ width: 40, height: 40 }}
          >
            {/* Drop shadow bubble */}
            <div
              className="absolute inset-0 rounded-full bg-background border border-border/60 shadow-xl"
              style={{ backdropFilter: "blur(8px)" }}
            />

            {/* SVG arc or success checkmark */}
            <div className="relative z-10 flex items-center justify-center w-full h-full">
              {phase === "success" ? (
                <Check
                  className="text-emerald-500"
                  style={{ width: 18, height: 18 }}
                  strokeWidth={2.5}
                />
              ) : (
                <svg
                  width="34"
                  height="34"
                  viewBox="0 0 34 34"
                  style={{
                    animation: phase === "loading" ? "ptr-spin 0.8s linear infinite" : "none",
                    transform: phase === "loading" ? undefined : `rotate(${progress * 270 - 90}deg)`,
                    transition: pullY === 0 ? "transform 300ms ease" : "none",
                  }}
                >
                  {/* Track */}
                  <circle
                    cx="17"
                    cy="17"
                    r={r}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-muted-foreground/15"
                  />
                  {/* Progress arc */}
                  <circle
                    cx="17"
                    cy="17"
                    r={r}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={phase === "loading" ? circumference * 0.25 : dashOffset}
                    className={
                      phase === "loading"
                        ? "text-primary"
                        : progress >= 1
                        ? "text-primary"
                        : "text-muted-foreground/60"
                    }
                    style={{
                      transformOrigin: "center",
                      transform: "rotate(-90deg)",
                      transition:
                        phase === "loading"
                          ? "none"
                          : "stroke-dashoffset 60ms linear, color 200ms",
                    }}
                  />
                </svg>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content shift */}
      <div
        style={{
          transform: contentShift > 0 ? `translateY(${contentShift}px)` : undefined,
          transition:
            pullY === 0
              ? "transform 400ms cubic-bezier(0.34,1.56,0.64,1)"
              : "none",
        }}
      >
        {children}
      </div>

      {/* Spin keyframe */}
      <style>{`
        @keyframes ptr-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
