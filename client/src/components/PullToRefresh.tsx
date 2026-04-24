import { useRef, useState, useCallback, ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";

const THRESHOLD = 80;
const MAX_PULL = 120;
const FRICTION = 2.4;

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
      setTimeout(() => {
        setPhase("success");
        setTimeout(() => {
          doRefresh();
          setTimeout(() => setPhase("idle"), 800);
        }, 600);
      }, 300);
    } else {
      setPullY(0);
      setPhase("idle");
    }
  }, [pullY, onRefresh]);

  const progress = Math.min(pullY / THRESHOLD, 1);
  const isVisible = phase !== "idle";
  const isReady = progress >= 1;

  // SVG arc for progress ring
  const r = 10;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - progress);

  // Content shift (elastic)
  const contentShift = phase === "idle" ? 0 : Math.min(pullY * 0.35, 42);

  // Pill width: expands as you pull
  const pillMinW = 44;
  const pillMaxW = 160;
  const pillW = pillMinW + (pillMaxW - pillMinW) * Math.min(progress * 1.4, 1);

  // Text to show
  const labelText = phase === "success"
    ? "Atualizado!"
    : phase === "loading"
    ? "Atualizando..."
    : isReady
    ? "Solte para atualizar"
    : "Puxe para atualizar";

  // Indicator Y position — slides down with pull
  const rawTop = pullY - 52;
  const indicatorTop = Math.max(rawTop, 8);
  const pinnedTop = 12; // fixed position during loading/success

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ position: "relative", overflowX: "hidden" }}
    >
      {/* ── Indicator pill ── */}
      {isVisible && (
        <div
          className="fixed left-1/2 z-50 pointer-events-none"
          style={{
            top: phase === "loading" || phase === "success" ? pinnedTop : indicatorTop,
            transform: "translateX(-50%)",
            transition: pullY === 0 ? "top 380ms cubic-bezier(0.34,1.56,0.64,1)" : "none",
          }}
        >
          {/* Gradient border wrapper */}
          <div
            className="rounded-full p-[1.5px] shadow-lg"
            style={{
              background: phase === "success"
                ? "linear-gradient(135deg, #10b981, #34d399)"
                : isReady
                ? "linear-gradient(135deg, #8b5cf6, #6366f1, #3b82f6)"
                : `linear-gradient(135deg, color-mix(in oklch, var(--muted-foreground) 30%, transparent), color-mix(in oklch, var(--muted-foreground) 15%, transparent))`,
              width: `${pillW}px`,
              transition: "width 150ms ease, background 300ms ease",
            }}
          >
            <div
              className="flex items-center justify-center gap-2 rounded-full px-3 bg-background/95"
              style={{
                height: 36,
                backdropFilter: "blur(10px)",
                overflow: "hidden",
              }}
            >
              {/* Icon / spinner */}
              <div className="shrink-0" style={{ width: 22, height: 22 }}>
                {phase === "success" ? (
                  <CheckCircle2 className="text-emerald-500 w-5 h-5" strokeWidth={2} />
                ) : (
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 22 22"
                    style={{
                      animation: phase === "loading" ? "ptr-spin 0.85s linear infinite" : "none",
                      transform: phase === "loading"
                        ? undefined
                        : `rotate(${progress * 300 - 90}deg)`,
                      transition: pullY === 0 ? "transform 300ms ease" : "none",
                    }}
                  >
                    {/* Track */}
                    <circle
                      cx="11" cy="11" r={r}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="text-muted-foreground/20"
                    />
                    {/* Progress arc — gradient colours via linearGradient */}
                    <defs>
                      <linearGradient id="ptr-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={isReady ? "#8b5cf6" : "#94a3b8"} />
                        <stop offset="100%" stopColor={isReady ? "#3b82f6" : "#64748b"} />
                      </linearGradient>
                    </defs>
                    <circle
                      cx="11" cy="11" r={r}
                      fill="none"
                      stroke={phase === "loading" ? "url(#ptr-grad)" : "url(#ptr-grad)"}
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={phase === "loading" ? circumference * 0.28 : dashOffset}
                      style={{
                        transformOrigin: "center",
                        transform: "rotate(-90deg)",
                        transition: phase === "loading"
                          ? "none"
                          : "stroke-dashoffset 60ms linear",
                      }}
                    />
                  </svg>
                )}
              </div>

              {/* Label — appears when pill is wide enough */}
              {pillW > 80 && (
                <span
                  className="text-[11px] font-semibold whitespace-nowrap leading-none"
                  style={{
                    color: phase === "success"
                      ? "#10b981"
                      : isReady
                      ? "var(--foreground)"
                      : "var(--muted-foreground)",
                    transition: "color 250ms ease",
                    opacity: Math.min((pillW - 80) / 40, 1),
                  }}
                >
                  {labelText}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Content shift ── */}
      <div
        style={{
          transform: contentShift > 0 ? `translateY(${contentShift}px)` : undefined,
          transition: pullY === 0
            ? "transform 380ms cubic-bezier(0.34,1.56,0.64,1)"
            : "none",
        }}
      >
        {children}
      </div>

      <style>{`
        @keyframes ptr-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
