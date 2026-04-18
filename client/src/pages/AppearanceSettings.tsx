import { PageHeader } from '@/components/PageHeader';
import { PageTransition } from '@/components/PageTransition';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function AppearanceSettings() {
  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        <PageHeader backHref="/settings" title="Tema" subtitle="Escolha a aparência do app" />
        <main className="container mx-auto px-4 py-6 pb-28 sm:pb-8 max-w-2xl">
          <ThemeToggle />
        </main>
      </div>
    </PageTransition>
  );
}
