import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  aspectRatio?: string; // e.g., "3/4", "16/9", "1/1"
  blurDataURL?: string; // Optional tiny base64 blur placeholder
}

/**
 * LazyImage component with blur-up placeholder and Intersection Observer
 * 
 * Features:
 * - Lazy loads images only when they enter viewport
 * - Shows blur placeholder while loading
 * - Smooth transition from blur to full image
 * - Optimized for slow connections
 * 
 * Usage:
 * <LazyImage 
 *   src="https://example.com/image.jpg" 
 *   alt="Plant photo"
 *   aspectRatio="3/4"
 *   className="rounded-lg"
 * />
 */
export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  className,
  aspectRatio = "3/4",
  blurDataURL,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  // Intersection Observer to detect when image enters viewport
  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect(); // Stop observing once loaded
          }
        });
      },
      {
        rootMargin: "50px", // Start loading 50px before entering viewport
        threshold: 0.01,
      }
    );

    observer.observe(imgRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Handle image load
  const handleLoad = () => {
    setIsLoaded(true);
  };

  return (
    <div
      ref={imgRef}
      className={cn("relative overflow-hidden bg-muted", className)}
      style={{ aspectRatio }}
    >
      {/* Blur placeholder (shown while loading) */}
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-500",
          isLoaded ? "opacity-0" : "opacity-100"
        )}
        style={{
          backgroundImage: blurDataURL
            ? `url(${blurDataURL})`
            : `linear-gradient(
                90deg,
                hsl(var(--muted)) 0%,
                hsl(var(--muted) / 0.8) 50%,
                hsl(var(--muted)) 100%
              )`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: blurDataURL ? "blur(20px)" : "none",
          transform: blurDataURL ? "scale(1.1)" : "none", // Prevent blur edge artifacts
        }}
      />

      {/* Shimmer effect while loading */}
      {!isLoaded && !blurDataURL && (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(
              90deg,
              transparent 0%,
              hsl(var(--muted) / 0.3) 50%,
              transparent 100%
            )`,
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s ease-in-out infinite",
          }}
        />
      )}

      {/* Actual image (loaded when in viewport) */}
      {isInView && (
        <img
          src={src}
          alt={alt}
          onLoad={handleLoad}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-500",
            isLoaded ? "opacity-100" : "opacity-0"
          )}
          loading="lazy" // Native lazy loading as fallback
        />
      )}
    </div>
  );
};
