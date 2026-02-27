import React from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

/**
 * Skeleton loader for plant cards in PlantsList
 * Mimics the structure of plant cards with shimmer animation
 */
export const PlantCardSkeleton: React.FC = () => {
  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          {/* Checkbox */}
          <div className="h-5 w-5 bg-muted rounded mt-1 animate-pulse" style={{
            background: `linear-gradient(
              90deg,
              hsl(var(--muted)) 0%,
              hsl(var(--muted) / 0.8) 50%,
              hsl(var(--muted)) 100%
            )`,
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s ease-in-out infinite"
          }} />
          
          <div className="flex-1 space-y-2">
            {/* Plant name + stage badge */}
            <div className="flex items-center gap-2">
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
              <div className="h-5 w-16 bg-muted rounded-md animate-pulse" style={{
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
            
            {/* Plant code */}
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
          
          {/* Status badge */}
          <div className="h-6 w-20 bg-muted rounded-md animate-pulse" style={{
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
      
      <CardContent className="space-y-3">
        {/* Photo placeholder */}
        <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-muted relative">
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
        
        {/* Indicators */}
        <div className="flex flex-wrap gap-2">
          <div className="h-6 w-28 bg-muted rounded-md animate-pulse" style={{
            background: `linear-gradient(
              90deg,
              hsl(var(--muted)) 0%,
              hsl(var(--muted) / 0.8) 50%,
              hsl(var(--muted)) 100%
            )`,
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s ease-in-out infinite"
          }} />
          <div className="h-6 w-24 bg-muted rounded-md animate-pulse" style={{
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
        
        {/* Info rows */}
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center">
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
              <div className="h-4 w-32 bg-muted rounded animate-pulse" style={{
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
      </CardContent>
    </Card>
  );
};
