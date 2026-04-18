import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Download, Upload, Database, Shield, AlertTriangle, CalendarClock, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";

const AUTO_BACKUP_KEY   = "cultivo:autoBackup";
const LAST_BACKUP_KEY   = "cultivo:lastAutoBackup";
const SEVEN_DAYS_MS     = 7 * 24 * 60 * 60 * 1000;

interface BackupFile {
  version: string;
  exportDate?: string;
  data: Record<string, unknown[]>;
}

export default function Backup() {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importConfirm, setImportConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState<BackupFile | null>(null);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(
    () => localStorage.getItem(AUTO_BACKUP_KEY) === "true"
  );
  const [lastAutoBackup, setLastAutoBackup] = useState<Date | null>(() => {
    const s = localStorage.getItem(LAST_BACKUP_KEY);
    return s ? new Date(s) : null;
  });

  const exportBackup = trpc.backup.export.useQuery(undefined, {
    enabled: false,
  });

  const importBackup = trpc.backup.import.useMutation({
    onSuccess: () => {
      toast.success("Backup restaurado com sucesso!");
      // Navegar para raiz — força busca limpa sem usar cache SPA
      setTimeout(() => { window.location.href = "/"; }, 1500);
    },
    onError: (error) => {
      toast.error(`Erro ao importar backup: ${error.message}`);
      setIsImporting(false);
    },
  });

  // ── Shared export helper ─────────────────────────────────────────────────────
  const doExport = useCallback(async (silent = false) => {
    const result = await exportBackup.refetch();
    if (!result.data) return;
    const dataStr = JSON.stringify(result.data, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    link.download = `cultivo-backup-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    const now = new Date();
    localStorage.setItem(LAST_BACKUP_KEY, now.toISOString());
    setLastAutoBackup(now);
    if (!silent) toast.success("Backup exportado com sucesso!");
  }, [exportBackup]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await doExport(false);
    } catch (error: any) {
      toast.error(`Erro ao exportar backup: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleToggleAutoBackup = () => {
    const next = !autoBackupEnabled;
    setAutoBackupEnabled(next);
    localStorage.setItem(AUTO_BACKUP_KEY, String(next));
    if (next) toast.success("Backup automático semanal ativado!");
    else toast.info("Backup automático desativado");
  };

  // ── Auto-backup check on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!autoBackupEnabled) return;
    const last = lastAutoBackup?.getTime() ?? 0;
    if (Date.now() - last >= SEVEN_DAYS_MS) {
      toast.info("Fazendo backup automático semanal…", { duration: 3000 });
      doExport(true).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      setIsImporting(true);
      try {
        const text = await file.text();
        const backupData = JSON.parse(text);
        
        // Validar estrutura básica
        if (!backupData.version || !backupData.data) {
          throw new Error("Arquivo de backup inválido: faltam campos obrigatórios (version, data)");
        }

        // Validar compatibilidade de versão
        const SUPPORTED_VERSIONS = ["1.0"];
        if (!SUPPORTED_VERSIONS.includes(backupData.version)) {
          throw new Error(
            `Backup incompatível: versão "${backupData.version}" não suportada. ` +
            `Versões suportadas: ${SUPPORTED_VERSIONS.join(", ")}. ` +
            `Este backup pode ter sido criado por uma versão mais nova do app.`
          );
        }

        // Guardar dados e abrir confirm dialog
        setPendingFile(backupData);
        setIsImporting(false);
        setImportConfirm(true);
        return;
      } catch (error: any) {
        toast.error(`Erro ao ler arquivo: ${error.message}`);
        setIsImporting(false);
      }
    };
    
    input.click();
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        <PageHeader
          backHref="/settings"
          title="Backup e Restauração"
          subtitle="Faça backup dos seus dados ou restaure de um backup anterior"
        />
        <div className="container max-w-4xl py-8 pb-28 sm:pb-8">

      {/* Aviso de Segurança */}
      <Card className="mb-6 border-amber-500/50 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
            <Shield className="h-5 w-5" />
            Importante: Segurança dos Dados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            • O backup contém <strong>todos os seus dados</strong>: estufas, plantas, ciclos, registros, strains, tarefas e receitas
          </p>
          <p>
            • Guarde os arquivos de backup em local seguro (nuvem, HD externo, etc.)
          </p>
          <p>
            • Recomendamos fazer backups regulares (semanalmente ou após mudanças importantes)
          </p>
          <p className="text-amber-600 dark:text-amber-500 font-semibold">
            <span className="flex items-center gap-1"><AlertTriangle className="w-4 h-4 text-amber-400"/>Restaurar um backup irá SUBSTITUIR todos os dados atuais!</span>
          </p>
        </CardContent>
      </Card>

      {/* Backup Automático Semanal */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <CalendarClock className="h-5 w-5 text-primary" />
            Backup Automático Semanal
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Quando ativado, baixa um backup toda vez que você abrir esta página após 7 dias sem backup
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <button
            onClick={handleToggleAutoBackup}
            className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-colors ${
              autoBackupEnabled
                ? "border-emerald-500/40 bg-emerald-500/8 hover:bg-emerald-500/12"
                : "border-border hover:bg-muted/60"
            }`}
          >
            <div className="flex items-center gap-3">
              {autoBackupEnabled
                ? <ToggleRight className="w-6 h-6 text-emerald-500 shrink-0" />
                : <ToggleLeft className="w-6 h-6 text-muted-foreground shrink-0" />}
              <span className={`text-sm font-medium ${autoBackupEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
                {autoBackupEnabled ? "Ativado" : "Desativado"}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {lastAutoBackup
                ? `Último: ${lastAutoBackup.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}`
                : "Nunca realizado"}
            </span>
          </button>
          {autoBackupEnabled && (
            <p className="text-xs text-muted-foreground/70 px-1">
              ✓ O backup será baixado automaticamente sempre que você abrir esta página após 7 dias sem realizar um.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Exportar Backup */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Exportar Backup
          </CardTitle>
          <CardDescription>
            Baixe um arquivo JSON com todos os seus dados atuais
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="w-full sm:w-auto"
          >
            {isExporting ? (
              <>
                <Database className="mr-2 h-4 w-4 animate-pulse" />
                Exportando...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Exportar Backup Agora
              </>
            )}
          </Button>
          <p className="text-sm text-muted-foreground mt-3">
            O arquivo será baixado automaticamente no formato JSON
          </p>
        </CardContent>
      </Card>

      {/* Importar Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Backup
          </CardTitle>
          <CardDescription>
            Restaure seus dados de um arquivo de backup anterior
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleImport}
            disabled={isImporting}
            variant="destructive"
            className="w-full sm:w-auto"
          >
            {isImporting ? (
              <>
                <Database className="mr-2 h-4 w-4 animate-pulse" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Selecionar Arquivo de Backup
              </>
            )}
          </Button>
          <div className="flex items-start gap-2 mt-3 p-3 bg-destructive/10 rounded-md">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-sm text-destructive">
              <strong>Atenção:</strong> Esta ação irá substituir todos os dados atuais e não pode ser desfeita. 
              Recomendamos exportar um backup dos dados atuais antes de importar.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Import Confirm Dialog */}
      <Dialog open={importConfirm} onOpenChange={setImportConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Confirmar Importação de Backup
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block font-semibold text-foreground flex items-center gap-1"><AlertTriangle className="w-4 h-4 text-amber-400"/>ATENÇÃO: Esta ação é irreversível!</span>
              <span className="block">Importar este backup irá <strong>substituir todos os dados atuais</strong> do aplicativo — estufas, plantas, strains, tarefas, histórico e configurações.</span>
              {pendingFile && (
                <span className="block p-2 rounded bg-muted/60 border border-border/60 text-xs text-foreground space-y-1">
                  {pendingFile.exportDate && (
                    <span className="block text-muted-foreground">
                      📅 Exportado em: <strong className="text-foreground">{new Date(pendingFile.exportDate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</strong>
                    </span>
                  )}
                  <span className="block text-muted-foreground">
                    📦 Conteúdo:{" "}
                    {(["tents","plants","cycles","dailyLogs","strains","tasks"] as const)
                      .filter(k => pendingFile.data[k]?.length)
                      .map(k => {
                        const labels: Record<string, string> = { tents: "estufas", plants: "plantas", cycles: "ciclos", dailyLogs: "logs", strains: "strains", tasks: "tarefas" };
                        return `${pendingFile.data[k]!.length} ${labels[k]}`;
                      })
                      .join(" · ") || "sem dados reconhecidos"}
                  </span>
                </span>
              )}
              <span className="block text-muted-foreground text-xs">Recomendamos exportar um backup dos dados atuais antes de continuar.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setImportConfirm(false); setPendingFile(null); }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!pendingFile) return;
                setImportConfirm(false);
                setIsImporting(true);
                try {
                  await importBackup.mutateAsync(pendingFile);
                } catch (e) {
                  // handled by onError
                }
                setPendingFile(null);
              }}
              disabled={importBackup.isPending}
            >
              {importBackup.isPending ? (
                <><Upload className="w-4 h-4 mr-2 animate-spin" />Importando...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" />Confirmar Importação</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </div>
      </div>
    </PageTransition>
  );
}
