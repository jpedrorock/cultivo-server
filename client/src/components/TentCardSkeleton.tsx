import React from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

/**
 * Skeleton loader for tent cards on Home page
 * Mimics the structure of TentCard with shimmer animation
 */
export const TentCardSkeleton: React.FC = () => {
  return (
    <Card className="bg-card/90 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            {/* Tent name + phase badge */}
            <div className="flex items-center gap-2">
              <div className="h-7 w-32 bg-muted rounded animate-pulse" style={{
                background: `linear-gradient(
                  90deg,
                  hsl(var(--muted)) 0%,
                  hsl(var(--muted) / 0.8) 50%,
                  hsl(var(--muted)) 100%
                )`,
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s ease-in-out infinite"
              }} />
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
            </div>
            
            {/* Cycle info */}
            <div className="h-4 w-48 bg-muted rounded animate-pulse" style={{
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
          
          {/* Menu button */}
          <div className="h-8 w-8 bg-muted rounded animate-pulse" style={{
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
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Parameters grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
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
              <div className="h-6 w-full bg-muted rounded animate-pulse" style={{
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
        
        {/* Tasks section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="h-5 w-32 bg-muted rounded animate-pulse" style={{
              background: `linear-gradient(
                90deg,
                hsl(var(--muted)) 0%,
                hsl(var(--muted) / 0.8) 50%,
                hsl(var(--muted)) 100%
              )`,
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s ease-in-out infinite"
            }} />
            <div className="h-4 w-12 bg-muted rounded animate-pulse" style={{
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
          
          {/* Task items */}
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-4 w-4 bg-muted rounded animate-pulse" style={{
                background: `linear-gradient(
                  90deg,
                  hsl(var(--muted)) 0%,
                  hsl(var(--muted) / 0.8) 50%,
                  hsl(var(--muted)) 100%
                )`,
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s ease-in-out infinite"
              }} />
              <div className="h-4 w-full bg-muted rounded animate-pulse" style={{
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
        
        {/* Action button */}
        <div className="h-9 w-full bg-muted rounded animate-pulse" style={{
          background: `linear-gradient(
            90deg,
            hsl(var(--muted)) 0%,
            hsl(var(--muted) / 0.8) 50%,
            hsl(var(--muted)) 100%
          )`,
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s ease-in-out infinite"
        }} />
      </CardContent>
    </Card>
  );
};
