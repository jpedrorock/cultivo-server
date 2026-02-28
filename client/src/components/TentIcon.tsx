import { cn } from "@/lib/utils";

interface TentIconProps {
  className?: string;
  strokeColor?: string;
  /** @deprecated kept for API compat */
  accentColor?: string;
  strokeWidth?: number;
}

/**
 * Grow tent icon — simple rectangular box in isometric perspective.
 * All lines use currentColor so it inherits the nav item active/inactive color.
 */
export function TentIcon({
  className,
  strokeColor,
  strokeWidth = 1.8,
}: TentIconProps) {
  const sw = strokeWidth;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-5 h-5", className)}
      aria-label="Grow tent"
      style={strokeColor ? { color: strokeColor } : undefined}
    >
      {/*
        Isometric rectangular box (taller than wide):
          Top face:   A(12,2) B(21,6.5) C(21,7.5) D(12,12) E(3,7.5) F(3,6.5)
          Left face:  F(3,6.5)→E(3,7.5)→(3,20)→(12,22)→(12,12)→(12,2)... 
        
        Simplified vertices:
          Top-left:       TL = (3, 7)
          Top-center:     TC = (12, 2)
          Top-right:      TR = (21, 7)
          Mid-left:       ML = (3, 7)   → bottom-left = BL = (3, 19)
          Mid-center:     MC = (12, 12) → bottom-center = BC = (12, 22)
          Mid-right:      MR = (21, 7)  → bottom-right = BR = (21, 19)
      */}

      {/* Top face */}
      <polygon
        points="12,2 21,7 12,12 3,7"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
        fill="none"
      />

      {/* Left face */}
      <polygon
        points="3,7 12,12 12,22 3,19"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
        fill="none"
      />

      {/* Right face */}
      <polygon
        points="12,12 21,7 21,19 12,22"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
