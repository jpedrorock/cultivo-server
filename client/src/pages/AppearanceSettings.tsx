import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageTransition } from '@/components/PageTransition';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function AppearanceSettings() {
  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        <header className="bg-card border-b border-border sticky top-0 z-20 pt-safe">
          <div className="container mx-auto px-4 py-3 sm:py-4">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="icon" className="shrink-0 h-9 w-9">
                <Link href="/settings">
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </Button>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-foreground leading-tight">Tema</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">Escolha a aparência do app</p>
              </div>
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-6 pb-28 sm:pb-8 max-w-2xl">
          <ThemeToggle />
        </main>
      </div>
    </PageTransition>
  );
}
