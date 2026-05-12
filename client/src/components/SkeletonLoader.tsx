import React from "react";

interface SkeletonLoaderProps {
  count?: number;
  className?: string;
}

/**
 * Skeleton loader component with shimmer animation
 * Used to show loading state while content is being fetched
 */
export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ 
  count = 1, 
  className = "" 
}) => {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={`animate-pulse bg-muted rounded-lg ${className}`}
          style={{
            background: `linear-gradient(
              90deg,
              var(--muted) 0%,
              color-mix(in oklch, var(--muted) 80%, transparent) 50%,
              var(--muted) 100%
            )`,
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s ease-in-out infinite"
          }}
        />
      ))}
    </>
  );
};

/**
 * Gallery skeleton loader - shows grid of image placeholders
 */
export const GallerySkeletonLoader: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="aspect-square rounded-lg overflow-hidden bg-muted relative"
        >
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(
                90deg,
                var(--muted) 0%,
                color-mix(in oklch, var(--muted) 70%, transparent) 50%,
                var(--muted) 100%
              )`,
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s ease-in-out infinite"
            }}
          />
          {/* Camera icon placeholder */}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              className="w-12 h-12 text-muted-foreground/30"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
};
