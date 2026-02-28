import { cn } from "@/lib/utils";

interface TentIconProps {
  className?: string;
  /** Stroke color for the main lines (defaults to currentColor) */
  strokeColor?: string;
  /** Accent color for the corner brackets (defaults to #22c55e = green-500) */
  accentColor?: string;
  strokeWidth?: number;
}

/**
 * Grow tent icon in isometric line-art style.
 * Inspired by the reference illustration: a 3/4-view grow tent with
 * highlighted corner brackets and ventilation holes on the side panel.
 */
export function TentIcon({
  className,
  strokeColor = "currentColor",
  accentColor = "#22c55e",
  strokeWidth = 1.6,
}: TentIconProps) {
  const sw = strokeWidth;
  const ac = accentColor;
  const sc = strokeColor;
  const cornerLen = 4; // length of the corner bracket arms

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-5 h-5", className)}
      aria-label="Grow tent"
    >
      {/* ── Isometric grow tent ──────────────────────────────────────────────
          Coordinate system (24×24 viewBox):
            Top face:    trapezoid seen from above-front
            Left face:   front-left panel (door side)
            Right face:  right side panel (with vent holes)
      ──────────────────────────────────────────────────────────────────── */}

      {/* Top face */}
      <polygon
        points="12,2 21,6.5 21,7.5 12,12 3,7.5 3,6.5"
        stroke={sc}
        strokeWidth={sw}
        strokeLinejoin="round"
        fill="none"
      />

      {/* Left (front) face */}
      <polygon
        points="3,7.5 12,12 12,22 3,17.5"
        stroke={sc}
        strokeWidth={sw}
        strokeLinejoin="round"
        fill="none"
      />

      {/* Right face */}
      <polygon
        points="12,12 21,7.5 21,17.5 12,22"
        stroke={sc}
        strokeWidth={sw}
        strokeLinejoin="round"
        fill="none"
      />

      {/* Door arch on left face — rounded opening */}
      <path
        d="M5.5,17 L5.5,13 Q5.5,11 7,11 Q8.5,11 8.5,13 L8.5,17"
        stroke={sc}
        strokeWidth={sw * 0.85}
        strokeLinecap="round"
        fill="none"
      />

      {/* Vent holes on right face (4 small dots) */}
      {[14.5, 15.5, 16.5, 17.5].map((cy, i) => (
        <circle
          key={i}
          cx={17.5}
          cy={cy}
          r={0.55}
          fill={sc}
        />
      ))}

      {/* ── Corner brackets (accent color) ──────────────────────────────── */}

      {/* Top-left corner of top face (point: 3, 6.5) */}
      <polyline points={`3,${6.5 + cornerLen} 3,6.5 ${3 + cornerLen},6.5`} stroke={ac} strokeWidth={sw} strokeLinecap="round" fill="none" />

      {/* Top-right corner of top face (point: 21, 6.5) */}
      <polyline points={`${21 - cornerLen},6.5 21,6.5 21,${6.5 + cornerLen}`} stroke={ac} strokeWidth={sw} strokeLinecap="round" fill="none" />

      {/* Bottom-left corner of left face (point: 3, 17.5) */}
      <polyline points={`3,${17.5 - cornerLen} 3,17.5 ${3 + cornerLen},17.5`} stroke={ac} strokeWidth={sw} strokeLinecap="round" fill="none" />

      {/* Bottom-right corner of right face (point: 21, 17.5) */}
      <polyline points={`${21 - cornerLen},17.5 21,17.5 21,${17.5 - cornerLen}`} stroke={ac} strokeWidth={sw} strokeLinecap="round" fill="none" />

      {/* Bottom center (point: 12, 22) */}
      <polyline points={`${12 - cornerLen},22 12,22 ${12 + cornerLen},22`} stroke={ac} strokeWidth={sw} strokeLinecap="round" fill="none" />

      {/* Top center peak (point: 12, 2) */}
      <polyline points={`${12 - cornerLen},2 12,2 ${12 + cornerLen},2`} stroke={ac} strokeWidth={sw} strokeLinecap="round" fill="none" />
    </svg>
  );
}
