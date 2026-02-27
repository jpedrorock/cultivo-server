import { NotificationSettings } from "@/components/NotificationSettings";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AlertSettings } from "@/components/AlertSettings";
import { ArrowLeft, Database, Keyboard } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageTransition } from "@/components/PageTransition";

export default function Settings() {
  return (
    <PageTransition>
        <div className="min-h-screen bg-background">
      {/* Header — sticky, compacto no mobile */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="shrink-0 h-9 w-9 sm:h-10 sm:w-10">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-foreground leading-tight">Configurações</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Personalize seu app</p>
            </div>
          </div>
        </div>
      </header>

      {/* Content — padding-bottom para não sobrepor BottomNav */}
      <main className="container mx-auto px-4 py-6 pb-28 sm:pb-8">
        <div className="max-w-2xl mx-auto space-y-5">
          <ThemeToggle />
          <AlertSettings />
          <NotificationSettings />
          <BackupCard />
          <KeyboardShortcuts />
        </div>
      </main>
    </div>
    </PageTransition>
  );
}

function BackupCard() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Database className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
          Backup e Restauração
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Faça backup dos seus dados ou restaure de um backup anterior
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full sm:w-auto min-h-[44px]">
          <Link href="/settings/backup">
            <Database className="w-4 h-4 mr-2" />
            Gerenciar Backups
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground mt-3">
          Proteja seus dados fazendo backups regulares de todas as estufas, plantas, ciclos e registros.
        </p>
      </CardContent>
    </Card>
  );
}

function KeyboardShortcuts() {
  const shortcuts = [
    { description: "Criar Nova Estufa", shortcut: "Ctrl+N", context: "Página inicial" },
    { description: "Salvar Registro", shortcut: "Ctrl+S", context: "Página de registro" },
    { description: "Ir para Histórico", shortcut: "Ctrl+H", context: "Qualquer página" },
    { description: "Ir para Calculadoras", shortcut: "Ctrl+C", context: "Qualquer página" },
    { description: "Mostrar Atalhos", shortcut: "Ctrl+/", context: "Qualquer página" },
  ];

  return (
    <Card className="max-lg:hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Keyboard className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
          Atalhos de Teclado
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Use estes atalhos para navegar mais rapidamente pelo aplicativo
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {shortcuts.map((item, index) => (
            <div
              key={index}
              className="flex items-center justify-between py-2 px-3 bg-muted rounded-md"
            >
              <div className="flex flex-col min-w-0 mr-3">
                <span className="text-sm font-medium text-foreground truncate">{item.description}</span>
                <span className="text-xs text-muted-foreground">{item.context}</span>
              </div>
              <kbd className="shrink-0 px-2 py-1 text-xs font-semibold text-foreground bg-background border border-border rounded shadow-sm">
                {item.shortcut}
              </kbd>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-gray-500/10 border border-gray-500/20 dark:border-gray-600 rounded-md">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            <strong>Dica:</strong> Os atalhos não funcionam quando você está digitando em campos de texto.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
