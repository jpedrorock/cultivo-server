import { cn } from "@/lib/utils";

interface TentIconProps {
  className?: string;
  strokeColor?: string;
  /** @deprecated kept for API compat */
  accentColor?: string;
  strokeWidth?: number;
}

/**
 * Grow tent icon — Box-style, stroke-based (Lucide-compatible weight).
 * Rectangle body + vertical center zipper line.
 */
export function TentIcon({
  className,
  strokeColor,
}: TentIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={cn("w-5 h-5", className)}
      aria-label="Grow tent"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={strokeColor ? { color: strokeColor } : undefined}
    >
      {/* Tent body — tall box */}
      <rect x="3" y="2" width="18" height="20" rx="2" />
      {/* Center zipper */}
      <line x1="12" y1="2" x2="12" y2="22" />
    </svg>
  );
}
