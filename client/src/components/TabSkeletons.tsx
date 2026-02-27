import React from "react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Skeleton loader for Health tab
 * Shows placeholder for health logs list with status badges and notes
 */
export const HealthTabSkeleton: React.FC = () => {
  return (
    <div className="space-y-4">
      {/* Add button skeleton */}
      <div className="h-10 w-full bg-muted rounded-lg animate-pulse" style={{
        background: `linear-gradient(
          90deg,
          hsl(var(--muted)) 0%,
          hsl(var(--muted) / 0.8) 50%,
          hsl(var(--muted)) 100%
        )`,
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s ease-in-out infinite"
      }} />
      
      {/* Health log cards skeleton */}
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index} className="overflow-hidden">
          <CardContent className="p-4 space-y-3">
            {/* Header with status and date */}
            <div className="flex items-center justify-between">
              <div className="h-8 w-32 bg-muted rounded-full animate-pulse" style={{
                background: `linear-gradient(
                  90deg,
                  hsl(var(--muted)) 0%,
                  hsl(var(--muted) / 0.8) 50%,
                  hsl(var(--muted)) 100%
                )`,
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s ease-in-out infinite"
              }} />
              <div className="h-4 w-24 bg-muted rounded animate-pulse" style={{
                background: `linear-gradient(
                  90deg,
                  hsl(var(--muted)) 0%,
                  hsl(var(--muted) / 0.8) 50%,
                  hsl(var(--muted)) 100%
                )`,
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s ease-in-out infinite"
              }} />
            </div>
            
            {/* Symptoms */}
            <div className="space-y-2">
              <div className="h-4 w-20 bg-muted rounded animate-pulse" style={{
                background: `linear-gradient(
                  90deg,
                  hsl(var(--muted)) 0%,
                  hsl(var(--muted) / 0.8) 50%,
                  hsl(var(--muted)) 100%
                )`,
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s ease-in-out infinite"
              }} />
              <div className="h-16 w-full bg-muted rounded animate-pulse" style={{
                background: `linear-gradient(
                  90deg,
                  hsl(var(--muted)) 0%,
                  hsl(var(--muted) / 0.8) 50%,
                  hsl(var(--muted)) 100%
                )`,
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s ease-in-out infinite"
              }} />
            </div>
            
            {/* Photo placeholder */}
            <div className="aspect-video w-full bg-muted rounded-lg animate-pulse relative overflow-hidden">
              <div className="absolute inset-0" style={{
                background: `linear-gradient(
                  90deg,
                  hsl(var(--muted)) 0%,
                  hsl(var(--muted) / 0.7) 50%,
                  hsl(var(--muted)) 100%
                )`,
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s ease-in-out infinite"
              }} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

/**
 * Skeleton loader for Trichomes tab
 * Shows placeholder for trichome inspection logs with magnification info
 */
export const TrichomesTabSkeleton: React.FC = () => {
  return (
    <div className="space-y-4">
      {/* Add button skeleton */}
      <div className="h-10 w-full bg-muted rounded-lg animate-pulse" style={{
        background: `linear-gradient(
          90deg,
          hsl(var(--muted)) 0%,
          hsl(var(--muted) / 0.8) 50%,
          hsl(var(--muted)) 100%
        )`,
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s ease-in-out infinite"
      }} />
      
      {/* Trichome log cards skeleton */}
      {Array.from({ length: 2 }).map((_, index) => (
        <Card key={index} className="overflow-hidden">
          <CardContent className="p-4 space-y-3">
            {/* Header with maturity and date */}
            <div className="flex items-center justify-between">
              <div className="h-8 w-40 bg-muted rounded-full animate-pulse" style={{
                background: `linear-gradient(
                  90deg,
                  hsl(var(--muted)) 0%,
                  hsl(var(--muted) / 0.8) 50%,
                  hsl(var(--muted)) 100%
                )`,
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s ease-in-out infinite"
              }} />
              <div className="h-4 w-24 bg-muted rounded animate-pulse" style={{
                background: `linear-gradient(
                  90deg,
                  hsl(var(--muted)) 0%,
                  hsl(var(--muted) / 0.8) 50%,
                  hsl(var(--muted)) 100%
                )`,
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s ease-in-out infinite"
              }} />
            </div>
            
            {/* Percentages grid */}
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <div className="h-3 w-16 bg-muted rounded animate-pulse" style={{
                    background: `linear-gradient(
                      90deg,
                      hsl(var(--muted)) 0%,
                      hsl(var(--muted) / 0.8) 50%,
                      hsl(var(--muted)) 100%
                    )`,
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.5s ease-in-out infinite"
                  }} />
                  <div className="h-8 w-full bg-muted rounded animate-pulse" style={{
                    background: `linear-gradient(
                      90deg,
                      hsl(var(--muted)) 0%,
                      hsl(var(--muted) / 0.8) 50%,
                      hsl(var(--muted)) 100%
                    )`,
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.5s ease-in-out infinite"
                  }} />
                </div>
              ))}
            </div>
            
            {/* Photo placeholder */}
            <div className="aspect-video w-full bg-muted rounded-lg animate-pulse relative overflow-hidden">
              <div className="absolute inset-0" style={{
                background: `linear-gradient(
                  90deg,
                  hsl(var(--muted)) 0%,
                  hsl(var(--muted) / 0.7) 50%,
                  hsl(var(--muted)) 100%
                )`,
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s ease-in-out infinite"
              }} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

/**
 * Skeleton loader for LST tab
 * Shows placeholder for LST training logs with branch info
 */
export const LSTTabSkeleton: React.FC = () => {
  return (
    <div className="space-y-4">
      {/* Add button skeleton */}
      <div className="h-10 w-full bg-muted rounded-lg animate-pulse" style={{
        background: `linear-gradient(
          90deg,
          hsl(var(--muted)) 0%,
          hsl(var(--muted) / 0.8) 50%,
          hsl(var(--muted)) 100%
        )`,
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s ease-in-out infinite"
      }} />
      
      {/* LST log cards skeleton */}
      {Array.from({ length: 2 }).map((_, index) => (
        <Card key={index} className="overflow-hidden">
          <CardContent className="p-4 space-y-3">
            {/* Header with date */}
            <div className="flex items-center justify-between">
              <div className="h-6 w-32 bg-muted rounded animate-pulse" style={{
                background: `linear-gradient(
                  90deg,
                  hsl(var(--muted)) 0%,
                  hsl(var(--muted) / 0.8) 50%,
                  hsl(var(--muted)) 100%
                )`,
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s ease-in-out infinite"
              }} />
              <div className="h-4 w-24 bg-muted rounded animate-pulse" style={{
                background: `linear-gradient(
                  90deg,
                  hsl(var(--muted)) 0%,
                  hsl(var(--muted) / 0.8) 50%,
                  hsl(var(--muted)) 100%
                )`,
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s ease-in-out infinite"
              }} />
            </div>
            
            {/* Branch and technique info */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="h-6 w-24 bg-muted rounded-full animate-pulse" style={{
                  background: `linear-gradient(
                    90deg,
                    hsl(var(--muted)) 0%,
                    hsl(var(--muted) / 0.8) 50%,
                    hsl(var(--muted)) 100%
                  )`,
                  backgroundSize: "200% 100%",
                  animation: "shimmer 1.5s ease-in-out infinite"
                }} />
                <div className="h-6 w-32 bg-muted rounded-full animate-pulse" style={{
                  background: `linear-gradient(
                    90deg,
                    hsl(var(--muted)) 0%,
                    hsl(var(--muted) / 0.8) 50%,
                    hsl(var(--muted)) 100%
                  )`,
                  backgroundSize: "200% 100%",
                  animation: "shimmer 1.5s ease-in-out infinite"
                }} />
              </div>
              <div className="h-16 w-full bg-muted rounded animate-pulse" style={{
                background: `linear-gradient(
                  90deg,
                  hsl(var(--muted)) 0%,
                  hsl(var(--muted) / 0.8) 50%,
                  hsl(var(--muted)) 100%
                )`,
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s ease-in-out infinite"
              }} />
            </div>
            
            {/* Photo placeholder */}
            <div className="aspect-video w-full bg-muted rounded-lg animate-pulse relative overflow-hidden">
              <div className="absolute inset-0" style={{
                background: `linear-gradient(
                  90deg,
                  hsl(var(--muted)) 0%,
                  hsl(var(--muted) / 0.7) 50%,
                  hsl(var(--muted)) 100%
                )`,
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s ease-in-out infinite"
              }} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
