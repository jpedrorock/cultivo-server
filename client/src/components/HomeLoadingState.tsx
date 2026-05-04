import { Sprout } from "lucide-react";
import { TentCardSkeleton } from "@/components/TentCardSkeleton";

/**
 * Skeleton mostrado enquanto a Home faz o primeiro fetch das estufas.
 *
 * Mantém a estrutura visual da página real (header com logo + grid 3
 * colunas) para evitar flicker quando os dados chegam. O `headerCls`
 * vem do pai porque depende do estado da sidebar (collapsed/aberta no
 * desktop) — calculado lá uma vez só.
 */
export function HomeLoadingState({ headerCls }: { headerCls: string }) {
  return (
    <div className="min-h-screen bg-background">
      <header className={headerCls}>
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-primary/15 rounded-xl flex items-center justify-center ring-1 ring-primary/20 shadow-sm flex-shrink-0">
                <Sprout className="w-4.5 h-4.5 text-primary" strokeWidth={2} />
              </div>
              <h1 className="text-base sm:text-xl font-bold text-foreground leading-tight">Cultivo</h1>
            </div>
          </div>
        </div>
      </header>
      {/* Spacer = header height (py-4 = 16px × 2 + h-9 = 36px = 68px) + safe area */}
      <div aria-hidden="true" className="pt-safe" style={{ paddingBottom: "68px" }} />
      <main className="container mx-auto max-w-7xl py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="h-8 w-24 bg-muted rounded animate-pulse" />
          <div className="h-9 w-36 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <TentCardSkeleton key={`skeleton-tent-${i}`} />
          ))}
        </div>
      </main>
    </div>
  );
}
